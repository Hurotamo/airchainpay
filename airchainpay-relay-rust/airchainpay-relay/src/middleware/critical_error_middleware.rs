use actix_web::{
    Error, HttpResponse,
    dev::{Service, Transform, ServiceRequest, ServiceResponse},
};
use std::sync::Arc;
use futures_util::future::{LocalBoxFuture, Ready};
use actix_web::body::BoxBody;
use std::marker::PhantomData;
use crate::middleware::error_handling::{is_critical_endpoint, get_component_from_path};
use crate::utils::error_handler::{EnhancedErrorHandler, ErrorRecord, ErrorType, ErrorSeverity, CriticalPath};
use chrono::Utc;
use serde_json::json;
use actix_service::forward_ready;

pub struct CriticalErrorMiddleware {
    critical_error_handler: Arc<EnhancedErrorHandler>,
}

impl CriticalErrorMiddleware {
}

impl<S> Transform<S, ServiceRequest> for CriticalErrorMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<BoxBody>, Error = Error> + Clone + 'static,
    S::Future: 'static,
{
    type Response = ServiceResponse<BoxBody>;
    type Error = Error;
    type Transform = CriticalErrorMiddlewareService<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        futures_util::future::ready(Ok(CriticalErrorMiddlewareService {
            service,
            critical_error_handler: Arc::clone(&self.critical_error_handler),
            _phantom: PhantomData,
        }))
    }
}

pub struct CriticalErrorMiddlewareService<S> {
    service: S,
    critical_error_handler: Arc<EnhancedErrorHandler>,
    _phantom: PhantomData<BoxBody>,
}

impl<S> Service<ServiceRequest> for CriticalErrorMiddlewareService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<BoxBody>, Error = Error> + Clone + 'static,
    S::Future: 'static,
{
    type Response = ServiceResponse<BoxBody>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let critical_error_handler: std::sync::Arc<EnhancedErrorHandler> = Arc::clone(&self.critical_error_handler);
        let service = self.service.clone();
        let path = req.path().to_string();
        let method = req.method().to_string();

        Box::pin(async move {
            // Check if this is a critical endpoint
            if is_critical_endpoint(&path) {
                let component = get_component_from_path(&path);
                let critical_path = match component.as_str() {
                    "transaction" => CriticalPath::TransactionProcessing,
                    "ble" => CriticalPath::BLEDeviceConnection,
                    "authentication" => CriticalPath::Authentication,
                    "health" => CriticalPath::HealthCheck,
                    "metrics" => CriticalPath::MonitoringMetrics,
                    "configuration" => CriticalPath::ConfigurationReload,
                    "backup" => CriticalPath::BackupOperation,
                    "audit" => CriticalPath::SecurityValidation,
                    _ => CriticalPath::GeneralAPI,
                };

                // Check circuit breaker
                if critical_error_handler.is_circuit_breaker_open(&critical_path).await {
                    println!("Critical circuit breaker open for component: {component}");
                    return Ok(req.into_response(
                        HttpResponse::ServiceUnavailable()
                            .json(json!({
                                "error": "Critical service temporarily unavailable",
                                "message": "Critical circuit breaker is open",
                                "component": component,
                                "timestamp": Utc::now().to_rfc3339(),
                                "retry_after": 300,
                            }))
                    ).map_into_boxed_body());
                }
            }

            // Extract request information before calling service
            let request_info = req.request().clone();
            
            // Execute the service normally
            match service.call(req).await {
                Ok(response) => {
                    println!("Critical request completed: {method} {path}");
                    Ok(response)
                }
                Err(error) => {
                    let error_msg = error.to_string();
                    println!("Critical error in {method} {path}: {error_msg}");
                    
                    // Record critical error
                    let error_record = ErrorRecord {
                        id: uuid::Uuid::new_v4().to_string(),
                        timestamp: Utc::now(),
                        path: CriticalPath::GeneralAPI,
                        error_type: ErrorType::CriticalSystemFailure,
                        error_message: error_msg.clone(),
                        context: {
                            let mut context = std::collections::HashMap::new();
                            context.insert("path".to_string(), path.clone());
                            context.insert("method".to_string(), method.clone());
                            context
                        },
                        severity: ErrorSeverity::Critical,
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
                    let _ = critical_error_handler.record_error(error_record).await;

                    // Return appropriate error response based on critical error severity
                    let error_response = match ErrorSeverity::Critical {
                        ErrorSeverity::Critical => {
                            HttpResponse::InternalServerError()
                                .json(json!({
                                    "error": "Critical system error",
                                    "message": "A critical system error occurred",
                                    "timestamp": Utc::now().to_rfc3339(),
                                    "request_id": uuid::Uuid::new_v4().to_string(),
                                }))
                        }
                        _ => {
                            HttpResponse::InternalServerError()
                                .json(json!({
                                    "error": "System error",
                                    "message": "A system error occurred",
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

impl<S> Clone for CriticalErrorMiddlewareService<S>
where
    S: Clone,
{
    fn clone(&self) -> Self {
        Self {
            service: self.service.clone(),
            critical_error_handler: Arc::clone(&self.critical_error_handler),
            _phantom: PhantomData,
        }
    }
}

/// Determine critical path based on request path and method
#[allow(dead_code)]
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



 