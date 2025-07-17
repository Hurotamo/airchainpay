#![allow(dead_code, unused_variables)]
use actix_web::{
    Error, HttpResponse,
    dev::{Service, Transform, ServiceRequest, ServiceResponse},
};
use std::sync::Arc;
use crate::utils::error_handler::{ErrorType, ErrorSeverity, ErrorRecord, EnhancedErrorHandler, CriticalPath};
use futures_util::future::{LocalBoxFuture, Ready, ready};
use serde_json::json;
use chrono::Utc;
use std::marker::PhantomData;

#[derive(Clone)]
pub struct ErrorHandlingMiddleware {
    error_handler: Arc<EnhancedErrorHandler>,
}

impl ErrorHandlingMiddleware {
    pub fn new(error_handler: Arc<EnhancedErrorHandler>) -> Self {
        Self { error_handler }
    }
}

impl<S, B> Transform<S, ServiceRequest> for ErrorHandlingMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: actix_web::body::MessageBody + 'static,
{
    type Response = ServiceResponse<actix_web::body::BoxBody>;
    type Error = Error;
    type Transform = ErrorHandlingService<S, B>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(ErrorHandlingService {
            service: Arc::new(service),
            error_handler: Arc::clone(&self.error_handler),
            _phantom: PhantomData,
        }))
    }
}

pub struct ErrorHandlingService<S, B> {
    service: Arc<S>,
    error_handler: Arc<EnhancedErrorHandler>,
    _phantom: PhantomData<B>,
}

impl<S, B> Service<ServiceRequest> for ErrorHandlingService<S, B>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: actix_web::body::MessageBody + 'static,
{
    type Response = ServiceResponse<actix_web::body::BoxBody>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    fn poll_ready(&self, cx: &mut std::task::Context<'_>) -> std::task::Poll<Result<(), Self::Error>> {
        self.service.poll_ready(cx)
    }

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let error_handler: std::sync::Arc<EnhancedErrorHandler> = Arc::clone(&self.error_handler);
        let service = Arc::clone(&self.service);
        let path = req.path().to_string();
        let method = req.method().to_string();
        let start_time = std::time::Instant::now();

        Box::pin(async move {
            // Check circuit breaker for critical endpoints
            if is_critical_endpoint(&path) {
                let component = get_component_from_path(&path);
                let critical_path = match component.as_str() {
                    "transaction" => CriticalPath::TransactionProcessing,
                    "authentication" => CriticalPath::Authentication,
                    "health" => CriticalPath::HealthCheck,
                    "metrics" => CriticalPath::MonitoringMetrics,
                    "configuration" => CriticalPath::ConfigurationReload,
                    "backup" => CriticalPath::BackupOperation,
                    "audit" => CriticalPath::SecurityValidation,
                    _ => CriticalPath::TransactionProcessing,
                };
                if error_handler.is_circuit_breaker_open(&critical_path).await {
                    println!("Circuit breaker open for component: {component}");
                    return Ok(ServiceResponse::new(req.request().clone(), HttpResponse::ServiceUnavailable()
                            .json(json!({
                                "error": "Service temporarily unavailable",
                                "message": "Circuit breaker is open",
                                "component": component,
                                "timestamp": Utc::now().to_rfc3339(),
                                "retry_after": 60,
                            })).map_into_boxed_body()));
                }
            }

            // Extract request information before calling service
            let request_info = req.request().clone();
            
            // Execute the service with error handling
            match service.call(req).await {
                Ok(response) => {
                    let duration = start_time.elapsed();
                    println!("Request completed: {} {} - {}ms", method, path, duration.as_millis());
                    Ok(response.map_into_boxed_body())
                }
                Err(error) => {
                    let duration = start_time.elapsed();
                    let error_msg = error.to_string();
                    
                    // Categorize and record the error
                    let severity = ErrorSeverity::High;
                    let category = ErrorType::Unknown;
                    
                    let mut context = std::collections::HashMap::new();
                    context.insert("path".to_string(), path.clone());
                    context.insert("method".to_string(), method.clone());
                    context.insert("duration_ms".to_string(), duration.as_millis().to_string());
                    
                    // Record error in error handler
                    let error_record = ErrorRecord {
                        id: uuid::Uuid::new_v4().to_string(),
                        timestamp: Utc::now(),
                        path: CriticalPath::TransactionProcessing,
                        error_type: category,
                        error_message: error_msg.clone(),
                        context: context.clone(),
                        severity: severity.clone(),
                        retry_count: 0,
                        max_retries: 0,
                        resolved: false,
                        resolution_time: None,
                        stack_trace: None,
                        user_id: None,
                        device_id: None,
                        transaction_id: None,
                        chain_id: None,
                        ip_address: None,
                        component: get_component_from_path(&path),
                    };
                    let _ = error_handler.record_error(error_record).await;

                    // Return appropriate error response based on severity
                    let error_response = match severity {
                        ErrorSeverity::Critical => {
                            println!("CRITICAL ERROR in {method} {path}: {error_msg}");
                            HttpResponse::InternalServerError()
                                .json(json!({
                                    "error": "Internal server error",
                                    "message": "A critical error occurred",
                                    "timestamp": Utc::now().to_rfc3339(),
                                    "request_id": uuid::Uuid::new_v4().to_string(),
                                }))
                        }
                        ErrorSeverity::High => {
                            println!("HIGH SEVERITY ERROR in {method} {path}: {error_msg}");
                            HttpResponse::InternalServerError()
                                .json(json!({
                                    "error": "Service error",
                                    "message": "A high severity error occurred",
                                    "timestamp": Utc::now().to_rfc3339(),
                                    "request_id": uuid::Uuid::new_v4().to_string(),
                                }))
                        }
                        ErrorSeverity::Medium => {
                            println!("MEDIUM SEVERITY ERROR in {method} {path}: {error_msg}");
                            HttpResponse::BadRequest()
                                .json(json!({
                                    "error": "Request error",
                                    "message": "A medium severity error occurred",
                                    "timestamp": Utc::now().to_rfc3339(),
                                    "request_id": uuid::Uuid::new_v4().to_string(),
                                }))
                        }
                        ErrorSeverity::Low => {
                            println!("LOW SEVERITY ERROR in {method} {path}: {error_msg}");
                            HttpResponse::BadRequest()
                                .json(json!({
                                    "error": "Request error",
                                    "message": "A low severity error occurred",
                                    "timestamp": Utc::now().to_rfc3339(),
                                    "request_id": uuid::Uuid::new_v4().to_string(),
                                }))
                        }
                        ErrorSeverity::Fatal => {
                            println!("FATAL ERROR in {method} {path}: {error_msg}");
                            HttpResponse::InternalServerError()
                                .json(json!({
                                    "error": "Fatal error occurred",
                                    "message": "A fatal error occurred",
                                    "timestamp": Utc::now().to_rfc3339(),
                                    "request_id": uuid::Uuid::new_v4().to_string(),
                                }))
                        }
                    };

                    Ok(ServiceResponse::new(request_info, error_response.map_into_boxed_body()))
                }
            }
        })
    }
}

/// Check if an endpoint is critical and needs circuit breaker protection
pub fn is_critical_endpoint(path: &str) -> bool {
    let critical_paths = [
        "/transaction/submit",
        "/transaction/send_tx",
        "/compressed/send_compressed_tx",
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
pub fn get_component_from_path(path: &str) -> String {
    if path.starts_with("/transaction") {
        "transaction".to_string()
    } else if path.starts_with("/compressed") {
        "compression".to_string()
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
    println!("Unhandled error: {error_msg}");

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
        error_handler: &Arc<EnhancedErrorHandler>,
    ) -> Result<T, HttpResponse> {
        match result {
            Ok(value) => Ok(value),
            Err(error) => {
                let error_msg = error.to_string();
                
                // Categorize blockchain errors
                let category = if error_msg.contains("network") || error_msg.contains("connection") {
                    ErrorType::Network
                } else if error_msg.contains("gas") || error_msg.contains("nonce") {
                    ErrorType::Blockchain
                } else {
                    ErrorType::Blockchain
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
                let error_record = ErrorRecord {
                    id: uuid::Uuid::new_v4().to_string(),
                    timestamp: Utc::now(),
                    path: CriticalPath::TransactionProcessing,
                    error_type: category,
                    error_message: error_msg.clone(),
                    context: context.clone(),
                    severity: severity.clone(),
                    retry_count: 0,
                    max_retries: 0,
                    resolved: false,
                    resolution_time: None,
                    stack_trace: None,
                    user_id: None,
                    device_id: None,
                    transaction_id: None,
                    chain_id: None,
                    ip_address: None,
                    component: "blockchain".to_string(),
                };
                let _ = error_handler.record_error(error_record).await;

                Err(ErrorResponseBuilder::internal_server_error(&format!(
                    "Blockchain operation failed: {error_msg}"
                )))
            }
        }
    }

    /// Handle storage-specific errors
    pub async fn handle_storage_error<T>(
        result: Result<T, anyhow::Error>,
        operation: &str,
        error_handler: &Arc<EnhancedErrorHandler>,
    ) -> Result<T, HttpResponse> {
        match result {
            Ok(value) => Ok(value),
            Err(error) => {
                let error_msg = error.to_string();
                
                let category = if error_msg.contains("disk") || error_msg.contains("space") {
                    ErrorType::System
                } else {
                    ErrorType::Database
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
                let error_record = ErrorRecord {
                    id: uuid::Uuid::new_v4().to_string(),
                    timestamp: Utc::now(),
                    path: CriticalPath::TransactionProcessing,
                    error_type: category,
                    error_message: error_msg.clone(),
                    context: context.clone(),
                    severity: severity.clone(),
                    retry_count: 0,
                    max_retries: 0,
                    resolved: false,
                    resolution_time: None,
                    stack_trace: None,
                    user_id: None,
                    device_id: None,
                    transaction_id: None,
                    chain_id: None,
                    ip_address: None,
                    component: "storage".to_string(),
                };
                let _ = error_handler.record_error(error_record).await;

                Err(ErrorResponseBuilder::internal_server_error(&format!(
                    "Storage operation failed: {error_msg}"
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