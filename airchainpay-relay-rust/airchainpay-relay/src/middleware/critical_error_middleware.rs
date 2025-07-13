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
use crate::utils::critical_error_handler::{CriticalErrorHandler, CriticalPath, CriticalError};

pub struct CriticalErrorMiddleware {
    critical_error_handler: Arc<CriticalErrorHandler>,
}

impl CriticalErrorMiddleware {
    pub fn new(critical_error_handler: Arc<CriticalErrorHandler>) -> Self {
        Self { critical_error_handler }
    }
}

impl<S, B> Transform<S, ServiceRequest> for CriticalErrorMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Transform = CriticalErrorMiddlewareService<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        futures_util::future::ready(Ok(CriticalErrorMiddlewareService {
            service,
            critical_error_handler: Arc::clone(&self.critical_error_handler),
        }))
    }
}

pub struct CriticalErrorMiddlewareService<S> {
    service: S,
    critical_error_handler: Arc<CriticalErrorHandler>,
}

impl<S, B> Service<ServiceRequest> for CriticalErrorMiddlewareService<S>
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
        let critical_error_handler = Arc::clone(&self.critical_error_handler);
        let service = self.service.clone();
        let path = req.path().to_string();
        let method = req.method().to_string();
        let start_time = std::time::Instant::now();

        Box::pin(async move {
            // Determine critical path based on request
            let critical_path = determine_critical_path(&path, &method);
            
            // Create context for error tracking
            let mut context = std::collections::HashMap::new();
            context.insert("path".to_string(), path.clone());
            context.insert("method".to_string(), method.clone());
            context.insert("user_agent".to_string(), 
                req.headers().get("user-agent").and_then(|h| h.to_str().ok()).unwrap_or("unknown").to_string());
            context.insert("client_ip".to_string(), 
                req.connection_info().peer_addr().unwrap_or("unknown").to_string());

            // Execute the service with critical error handling
            let result = critical_error_handler.execute_critical_operation(
                critical_path,
                || async {
                    service.call(req).await
                },
                context,
            ).await;

            match result {
                Ok(response) => {
                    let duration = start_time.elapsed();
                    Logger::info(&format!(
                        "Critical request completed: {} {} - {}ms",
                        method,
                        path,
                        duration.as_millis()
                    ));
                    Ok(response)
                }
                Err(critical_error) => {
                    let duration = start_time.elapsed();
                    
                    // Log the critical error
                    Logger::error(&format!(
                        "CRITICAL ERROR in {} {}: {} ({}ms)",
                        method,
                        path,
                        critical_error.error_message,
                        duration.as_millis()
                    ));

                    // Return appropriate error response based on critical error severity
                    let error_response = match critical_error.severity {
                        crate::utils::critical_error_handler::CriticalErrorSeverity::Fatal => {
                            HttpResponse::InternalServerError()
                                .json(json!({
                                    "error": "Fatal system error",
                                    "message": "A fatal error occurred in the system",
                                    "timestamp": Utc::now().to_rfc3339(),
                                    "request_id": critical_error.id,
                                    "path": path,
                                    "method": method,
                                }))
                        }
                        crate::utils::critical_error_handler::CriticalErrorSeverity::Critical => {
                            HttpResponse::InternalServerError()
                                .json(json!({
                                    "error": "Critical system error",
                                    "message": "A critical error occurred",
                                    "timestamp": Utc::now().to_rfc3339(),
                                    "request_id": critical_error.id,
                                    "path": path,
                                    "method": method,
                                }))
                        }
                        crate::utils::critical_error_handler::CriticalErrorSeverity::High => {
                            HttpResponse::InternalServerError()
                                .json(json!({
                                    "error": "High severity error",
                                    "message": "A high severity error occurred",
                                    "timestamp": Utc::now().to_rfc3339(),
                                    "request_id": critical_error.id,
                                    "path": path,
                                    "method": method,
                                }))
                        }
                        crate::utils::critical_error_handler::CriticalErrorSeverity::Medium => {
                            HttpResponse::BadRequest()
                                .json(json!({
                                    "error": "Medium severity error",
                                    "message": "A medium severity error occurred",
                                    "timestamp": Utc::now().to_rfc3339(),
                                    "request_id": critical_error.id,
                                    "path": path,
                                    "method": method,
                                }))
                        }
                        crate::utils::critical_error_handler::CriticalErrorSeverity::Low => {
                            HttpResponse::BadRequest()
                                .json(json!({
                                    "error": "Low severity error",
                                    "message": "A low severity error occurred",
                                    "timestamp": Utc::now().to_rfc3339(),
                                    "request_id": critical_error.id,
                                    "path": path,
                                    "method": method,
                                }))
                        }
                    };

                    Ok(req.into_response(error_response).map_into_boxed_body())
                }
            }
        })
    }
}

impl<S> Clone for CriticalErrorMiddlewareService<S>
where
    S: Clone,
{
    fn clone(&self) -> Self {
        Self {
            service: self.service.clone(),
            critical_error_handler: Arc::clone(&self.critical_error_handler),
        }
    }
}

/// Determine critical path based on request path and method
fn determine_critical_path(path: &str, method: &str) -> CriticalPath {
    if path.starts_with("/transaction") || path.starts_with("/send") {
        CriticalPath::TransactionProcessing
    } else if path.starts_with("/ble") {
        CriticalPath::BLEDeviceConnection
    } else if path.starts_with("/auth") {
        CriticalPath::Authentication
    } else if path.starts_with("/backup") || path.starts_with("/database") {
        CriticalPath::DatabaseOperation
    } else if path.starts_with("/config") {
        CriticalPath::ConfigurationReload
    } else if path.starts_with("/health") {
        CriticalPath::HealthCheck
    } else if path.starts_with("/metrics") {
        CriticalPath::MonitoringMetrics
    } else if path.starts_with("/security") {
        CriticalPath::SecurityValidation
    } else if method == "POST" && (path.contains("tx") || path.contains("transaction")) {
        CriticalPath::BlockchainTransaction
    } else {
        CriticalPath::TransactionProcessing // Default for unknown paths
    }
}

/// Global critical error handler for unhandled critical errors
pub async fn global_critical_error_handler(error: CriticalError) -> HttpResponse {
    Logger::error(&format!("Unhandled critical error: {:?} - {}", error.path, error.error_message));

    // In production, don't expose internal error details
    let is_development = std::env::var("RUST_ENV").unwrap_or_else(|_| "development".to_string()) == "development";
    
    let response_body = if is_development {
        json!({
            "error": "Critical system error",
            "message": error.error_message,
            "path": format!("{:?}", error.path),
            "severity": format!("{:?}", error.severity),
            "timestamp": Utc::now().to_rfc3339(),
            "request_id": error.id,
        })
    } else {
        json!({
            "error": "Critical system error",
            "message": "A critical error occurred in the system",
            "timestamp": Utc::now().to_rfc3339(),
            "request_id": error.id,
        })
    };

    HttpResponse::InternalServerError().json(response_body)
}

/// Critical error response builder for consistent error responses
pub struct CriticalErrorResponseBuilder;

impl CriticalErrorResponseBuilder {
    pub fn critical_error(message: &str, request_id: &str) -> HttpResponse {
        HttpResponse::InternalServerError()
            .json(json!({
                "error": "Critical system error",
                "message": message,
                "timestamp": Utc::now().to_rfc3339(),
                "request_id": request_id,
            }))
    }

    pub fn fatal_error(message: &str, request_id: &str) -> HttpResponse {
        HttpResponse::InternalServerError()
            .json(json!({
                "error": "Fatal system error",
                "message": message,
                "timestamp": Utc::now().to_rfc3339(),
                "request_id": request_id,
            }))
    }

    pub fn circuit_breaker_open(path: &str, request_id: &str) -> HttpResponse {
        HttpResponse::ServiceUnavailable()
            .json(json!({
                "error": "Service temporarily unavailable",
                "message": "Circuit breaker is open",
                "path": path,
                "timestamp": Utc::now().to_rfc3339(),
                "request_id": request_id,
                "retry_after": 60,
            }))
    }

    pub fn timeout_error(operation: &str, request_id: &str) -> HttpResponse {
        HttpResponse::RequestTimeout()
            .json(json!({
                "error": "Operation timeout",
                "message": format!("{} operation timed out", operation),
                "timestamp": Utc::now().to_rfc3339(),
                "request_id": request_id,
            }))
    }
} 