use actix_web::{
    dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform},
    Error, HttpResponse, http::StatusCode,
};
use futures_util::future::{LocalBoxFuture, Ready};
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use anyhow::Error as AnyhowError;
use serde_json::json;
use chrono::Utc;
use crate::logger::Logger;
use crate::utils::error_handler::{ErrorHandler, ErrorCategory, ErrorSeverity};

pub struct ErrorHandlingMiddleware {
    error_handler: Arc<ErrorHandler>,
}

impl ErrorHandlingMiddleware {
    pub fn new(error_handler: Arc<ErrorHandler>) -> Self {
        Self { error_handler }
    }
}

impl<S, B> Transform<S, ServiceRequest> for ErrorHandlingMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Transform = ErrorHandlingMiddlewareService<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        futures_util::future::ready(Ok(ErrorHandlingMiddlewareService {
            service,
            error_handler: Arc::clone(&self.error_handler),
        }))
    }
}

pub struct ErrorHandlingMiddlewareService<S> {
    service: S,
    error_handler: Arc<ErrorHandler>,
}

impl<S, B> Service<ServiceRequest> for ErrorHandlingMiddlewareService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + Clone,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let error_handler = Arc::clone(&self.error_handler);
        let service = self.service.clone();
        let path = req.path().to_string();
        let method = req.method().to_string();
        let start_time = std::time::Instant::now();

        Box::pin(async move {
            // Check circuit breaker for critical endpoints
            if is_critical_endpoint(&path) {
                let component = get_component_from_path(&path);
                if error_handler.is_circuit_breaker_open(&component).await {
                    Logger::warn(&format!("Circuit breaker open for component: {}", component));
                    return Ok(req.into_response(
                        HttpResponse::ServiceUnavailable()
                            .json(json!({
                                "error": "Service temporarily unavailable",
                                "message": "Circuit breaker is open",
                                "component": component,
                                "timestamp": Utc::now().to_rfc3339(),
                                "retry_after": 60,
                            }))
                    ).map_into_boxed_body());
                }
            }

            // Execute the service with error handling
            match service.call(req).await {
                Ok(response) => {
                    let duration = start_time.elapsed();
                    Logger::info(&format!(
                        "Request completed: {} {} - {}ms",
                        method,
                        path,
                        duration.as_millis()
                    ));
                    Ok(response)
                }
                Err(error) => {
                    let duration = start_time.elapsed();
                    let error_msg = error.to_string();
                    
                    // Categorize and record the error
                    let category = ErrorHandler::categorize_error(&AnyhowError::msg(error_msg.clone()));
                    let severity = ErrorHandler::determine_severity(&AnyhowError::msg(error_msg.clone()), &path);
                    
                    let mut context = std::collections::HashMap::new();
                    context.insert("path".to_string(), path.clone());
                    context.insert("method".to_string(), method.clone());
                    context.insert("duration_ms".to_string(), duration.as_millis().to_string());
                    
                    // Record error in error handler
                    let _ = error_handler.record_error(
                        &AnyhowError::msg(error_msg.clone()),
                        category,
                        severity,
                        &get_component_from_path(&path),
                        context,
                    ).await;

                    // Return appropriate error response based on severity
                    let error_response = match severity {
                        ErrorSeverity::Critical => {
                            Logger::error(&format!("CRITICAL ERROR in {} {}: {}", method, path, error_msg));
                            HttpResponse::InternalServerError()
                                .json(json!({
                                    "error": "Internal server error",
                                    "message": "A critical error occurred",
                                    "timestamp": Utc::now().to_rfc3339(),
                                    "request_id": uuid::Uuid::new_v4().to_string(),
                                }))
                        }
                        ErrorSeverity::High => {
                            Logger::error(&format!("HIGH SEVERITY ERROR in {} {}: {}", method, path, error_msg));
                            HttpResponse::InternalServerError()
                                .json(json!({
                                    "error": "Service error",
                                    "message": "A high severity error occurred",
                                    "timestamp": Utc::now().to_rfc3339(),
                                    "request_id": uuid::Uuid::new_v4().to_string(),
                                }))
                        }
                        ErrorSeverity::Medium => {
                            Logger::warn(&format!("MEDIUM SEVERITY ERROR in {} {}: {}", method, path, error_msg));
                            HttpResponse::BadRequest()
                                .json(json!({
                                    "error": "Request error",
                                    "message": "A medium severity error occurred",
                                    "timestamp": Utc::now().to_rfc3339(),
                                    "request_id": uuid::Uuid::new_v4().to_string(),
                                }))
                        }
                        ErrorSeverity::Low => {
                            Logger::info(&format!("LOW SEVERITY ERROR in {} {}: {}", method, path, error_msg));
                            HttpResponse::BadRequest()
                                .json(json!({
                                    "error": "Request error",
                                    "message": "A low severity error occurred",
                                    "timestamp": Utc::now().to_rfc3339(),
                                    "request_id": uuid::Uuid::new_v4().to_string(),
                                }))
                        }
                    };

                    Ok(req.into_response(error_response).map_into_boxed_body())
                }
            }
        })
    }
}

impl<S> Clone for ErrorHandlingMiddlewareService<S>
where
    S: Clone,
{
    fn clone(&self) -> Self {
        Self {
            service: self.service.clone(),
            error_handler: Arc::clone(&self.error_handler),
        }
    }
}

/// Check if an endpoint is critical and needs circuit breaker protection
fn is_critical_endpoint(path: &str) -> bool {
    let critical_paths = [
        "/transaction/submit",
        "/transaction/send_tx",
        "/compressed/send_compressed_tx",
        "/ble/scan",
        "/auth",
        "/health",
        "/metrics",
        "/config",
        "/backup",
        "/audit",
    ];

    critical_paths.iter().any(|critical_path| path.starts_with(critical_path))
}

/// Extract component name from path for circuit breaker
fn get_component_from_path(path: &str) -> String {
    if path.starts_with("/transaction") {
        "transaction".to_string()
    } else if path.starts_with("/compressed") {
        "compression".to_string()
    } else if path.starts_with("/ble") {
        "ble".to_string()
    } else if path.starts_with("/auth") {
        "authentication".to_string()
    } else if path.starts_with("/health") {
        "health".to_string()
    } else if path.starts_with("/metrics") {
        "metrics".to_string()
    } else if path.starts_with("/config") {
        "configuration".to_string()
    } else if path.starts_with("/backup") {
        "backup".to_string()
    } else if path.starts_with("/audit") {
        "audit".to_string()
    } else {
        "api".to_string()
    }
}

/// Global error handler for unhandled errors
pub async fn global_error_handler(error: Error) -> HttpResponse {
    let error_msg = error.to_string();
    Logger::error(&format!("Unhandled error: {}", error_msg));

    // In production, don't expose internal error details
    let is_development = std::env::var("RUST_ENV").unwrap_or_else(|_| "development".to_string()) == "development";
    
    let response_body = if is_development {
        json!({
            "error": "Internal server error",
            "message": error_msg,
            "timestamp": Utc::now().to_rfc3339(),
            "request_id": uuid::Uuid::new_v4().to_string(),
        })
    } else {
        json!({
            "error": "Internal server error",
            "message": "An unexpected error occurred",
            "timestamp": Utc::now().to_rfc3339(),
            "request_id": uuid::Uuid::new_v4().to_string(),
        })
    };

    HttpResponse::InternalServerError().json(response_body)
}

/// Error response builder for consistent error responses
pub struct ErrorResponseBuilder;

impl ErrorResponseBuilder {
    pub fn bad_request(message: &str) -> HttpResponse {
        HttpResponse::BadRequest().json(json!({
            "error": "Bad request",
            "message": message,
            "timestamp": Utc::now().to_rfc3339(),
            "request_id": uuid::Uuid::new_v4().to_string(),
        }))
    }

    pub fn unauthorized(message: &str) -> HttpResponse {
        HttpResponse::Unauthorized().json(json!({
            "error": "Unauthorized",
            "message": message,
            "timestamp": Utc::now().to_rfc3339(),
            "request_id": uuid::Uuid::new_v4().to_string(),
        }))
    }

    pub fn forbidden(message: &str) -> HttpResponse {
        HttpResponse::Forbidden().json(json!({
            "error": "Forbidden",
            "message": message,
            "timestamp": Utc::now().to_rfc3339(),
            "request_id": uuid::Uuid::new_v4().to_string(),
        }))
    }

    pub fn not_found(message: &str) -> HttpResponse {
        HttpResponse::NotFound().json(json!({
            "error": "Not found",
            "message": message,
            "timestamp": Utc::now().to_rfc3339(),
            "request_id": uuid::Uuid::new_v4().to_string(),
        }))
    }

    pub fn internal_server_error(message: &str) -> HttpResponse {
        HttpResponse::InternalServerError().json(json!({
            "error": "Internal server error",
            "message": message,
            "timestamp": Utc::now().to_rfc3339(),
            "request_id": uuid::Uuid::new_v4().to_string(),
        }))
    }

    pub fn service_unavailable(message: &str) -> HttpResponse {
        HttpResponse::ServiceUnavailable().json(json!({
            "error": "Service unavailable",
            "message": message,
            "timestamp": Utc::now().to_rfc3339(),
            "request_id": uuid::Uuid::new_v4().to_string(),
        }))
    }

    pub fn too_many_requests(message: &str, retry_after: u64) -> HttpResponse {
        HttpResponse::TooManyRequests()
            .append_header(("Retry-After", retry_after.to_string()))
            .json(json!({
                "error": "Too many requests",
                "message": message,
                "retry_after": retry_after,
                "timestamp": Utc::now().to_rfc3339(),
                "request_id": uuid::Uuid::new_v4().to_string(),
            }))
    }
}

/// Error handling utilities for specific error types
pub mod error_utils {
    use super::*;
    use anyhow::Result;

    /// Handle blockchain-specific errors
    pub async fn handle_blockchain_error<T>(
        result: Result<T, anyhow::Error>,
        operation: &str,
        error_handler: &Arc<ErrorHandler>,
    ) -> Result<T, HttpResponse> {
        match result {
            Ok(value) => Ok(value),
            Err(error) => {
                let error_msg = error.to_string();
                
                // Categorize blockchain errors
                let category = if error_msg.contains("network") || error_msg.contains("connection") {
                    ErrorCategory::Network
                } else if error_msg.contains("gas") || error_msg.contains("nonce") {
                    ErrorCategory::Blockchain
                } else {
                    ErrorCategory::Blockchain
                };

                let severity = if error_msg.contains("timeout") || error_msg.contains("connection refused") {
                    ErrorSeverity::High
                } else {
                    ErrorSeverity::Medium
                };

                let mut context = std::collections::HashMap::new();
                context.insert("operation".to_string(), operation.to_string());
                context.insert("error_type".to_string(), "blockchain".to_string());

                // Record error
                let _ = error_handler.record_error(
                    &error,
                    category,
                    severity,
                    "blockchain",
                    context,
                ).await;

                Err(ErrorResponseBuilder::internal_server_error(&format!(
                    "Blockchain operation failed: {}",
                    error_msg
                )))
            }
        }
    }

    /// Handle BLE-specific errors
    pub async fn handle_ble_error<T>(
        result: Result<T, anyhow::Error>,
        operation: &str,
        error_handler: &Arc<ErrorHandler>,
    ) -> Result<T, HttpResponse> {
        match result {
            Ok(value) => Ok(value),
            Err(error) => {
                let error_msg = error.to_string();
                
                let category = if error_msg.contains("connection") || error_msg.contains("scan") {
                    ErrorCategory::Network
                } else {
                    ErrorCategory::System
                };

                let severity = if error_msg.contains("hardware") || error_msg.contains("permission") {
                    ErrorSeverity::High
                } else {
                    ErrorSeverity::Medium
                };

                let mut context = std::collections::HashMap::new();
                context.insert("operation".to_string(), operation.to_string());
                context.insert("error_type".to_string(), "ble".to_string());

                // Record error
                let _ = error_handler.record_error(
                    &error,
                    category,
                    severity,
                    "ble",
                    context,
                ).await;

                Err(ErrorResponseBuilder::internal_server_error(&format!(
                    "BLE operation failed: {}",
                    error_msg
                )))
            }
        }
    }

    /// Handle storage-specific errors
    pub async fn handle_storage_error<T>(
        result: Result<T, anyhow::Error>,
        operation: &str,
        error_handler: &Arc<ErrorHandler>,
    ) -> Result<T, HttpResponse> {
        match result {
            Ok(value) => Ok(value),
            Err(error) => {
                let error_msg = error.to_string();
                
                let category = if error_msg.contains("disk") || error_msg.contains("space") {
                    ErrorCategory::System
                } else {
                    ErrorCategory::Database
                };

                let severity = if error_msg.contains("disk full") || error_msg.contains("permission denied") {
                    ErrorSeverity::Critical
                } else if error_msg.contains("file not found") {
                    ErrorSeverity::Medium
                } else {
                    ErrorSeverity::High
                };

                let mut context = std::collections::HashMap::new();
                context.insert("operation".to_string(), operation.to_string());
                context.insert("error_type".to_string(), "storage".to_string());

                // Record error
                let _ = error_handler.record_error(
                    &error,
                    category,
                    severity,
                    "storage",
                    context,
                ).await;

                Err(ErrorResponseBuilder::internal_server_error(&format!(
                    "Storage operation failed: {}",
                    error_msg
                )))
            }
        }
    }

    /// Handle validation errors
    pub fn handle_validation_error(message: &str) -> HttpResponse {
        ErrorResponseBuilder::bad_request(message)
    }

    /// Handle authentication errors
    pub fn handle_auth_error(message: &str) -> HttpResponse {
        ErrorResponseBuilder::unauthorized(message)
    }

    /// Handle rate limiting errors
    pub fn handle_rate_limit_error(retry_after: u64) -> HttpResponse {
        ErrorResponseBuilder::too_many_requests("Rate limit exceeded", retry_after)
    }
} 