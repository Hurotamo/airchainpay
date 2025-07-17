use actix_web::{
    dev::{Service, Transform},
    Error,
};
use std::task::{Context, Poll};
use std::sync::Arc;
use std::time::Instant;
use futures_util::future::{LocalBoxFuture, Ready};
use actix_web::body::BoxBody;
use futures_util::future::ready;
use crate::infrastructure::monitoring::manager::MonitoringManager;
use std::marker::PhantomData;

#[derive(Clone)]
pub struct MetricsMiddleware {
    monitoring_manager: Arc<MonitoringManager>,
}

impl MetricsMiddleware {
    pub fn new(monitoring_manager: Arc<MonitoringManager>) -> Self {
        Self { monitoring_manager }
    }
}

impl<S> Transform<S, actix_web::dev::ServiceRequest> for MetricsMiddleware
where
    S: Service<actix_web::dev::ServiceRequest, Response = actix_web::dev::ServiceResponse<BoxBody>, Error = Error> + 'static,
    S::Future: 'static,
{
    type Response = actix_web::dev::ServiceResponse<BoxBody>;
    type Error = Error;
    type Transform = MetricsService<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(MetricsService {
            service: Arc::new(service),
            monitoring_manager: Arc::clone(&self.monitoring_manager),
            _phantom: PhantomData,
        }))
    }
}

#[derive(Clone)]
pub struct MetricsService<S> {
    service: Arc<S>,
    monitoring_manager: Arc<MonitoringManager>,
    _phantom: PhantomData<BoxBody>,
}

impl<S> Service<actix_web::dev::ServiceRequest> for MetricsService<S>
where
    S: Service<actix_web::dev::ServiceRequest, Response = actix_web::dev::ServiceResponse<BoxBody>, Error = Error> + 'static,
    S::Future: 'static,
{
    type Response = actix_web::dev::ServiceResponse<BoxBody>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    fn poll_ready(&self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.service.poll_ready(cx)
    }

    fn call(&self, req: actix_web::dev::ServiceRequest) -> Self::Future {
        let service = Arc::clone(&self.service);
        let monitoring_manager: Arc<MonitoringManager> = Arc::clone(&self.monitoring_manager);
        let start_time = Instant::now();

        Box::pin(async move {
            // Increment total requests
            monitoring_manager.increment_metric("requests_total").await;

            // Record request details
            let path = req.path().to_string();
            let method = req.method().to_string();
            let client_ip = req.connection_info().peer_addr().unwrap_or("unknown").to_string();

            // Call the inner service
            let fut = service.call(req);
            let res = fut.await;

            // Calculate response time
            let response_time = start_time.elapsed();
            let response_time_ms = response_time.as_millis() as f64;
            monitoring_manager.record_response_time(response_time_ms).await;

            match res {
                Ok(res) => {
                    let status = res.status();
                    // Increment appropriate metrics based on status
                    if status.is_success() {
                        monitoring_manager.increment_metric("requests_successful").await;
                    } else {
                        monitoring_manager.increment_metric("requests_failed").await;
                    }
                    // Increment specific metrics based on path
                    if path.contains("/transaction") || path.contains("/submit") {
                        monitoring_manager.increment_metric("transactions_received").await;
                    }
                    if path.contains("/ble") {
                        monitoring_manager.increment_metric("ble_connections").await;
                    }
                    if path.contains("/auth")
                        && !status.is_success() {
                            monitoring_manager.increment_metric("auth_failures").await;
                        }
                    if path.contains("/compress") {
                        monitoring_manager.increment_metric("compression_operations").await;
                    }
                    if path.contains("/database") {
                        monitoring_manager.increment_metric("database_operations").await;
                        if !status.is_success() {
                            monitoring_manager.increment_metric("database_errors").await;
                        }
                    }
                    // Log request details for monitoring
                    log::info!(
                        "Request processed: {method} {path} - Status: {status} - Time: {response_time_ms}ms - IP: {client_ip}"
                    );
                    Ok(res)
                }
                Err(e) => {
                    // Increment error metrics
                    monitoring_manager.increment_metric("requests_failed").await;
                    monitoring_manager.increment_metric("network_errors").await;
                    log::error!(
                        "Request failed: {method} {path} - Error: {e} - Time: {response_time_ms}ms - IP: {client_ip}"
                    );
                    Err(e)
                }
            }
        })
    }
}

// Metrics collection utilities
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct MetricsCollector {
    monitoring_manager: Arc<MonitoringManager>,
}

impl MetricsCollector {
    pub fn new(monitoring_manager: Arc<MonitoringManager>) -> Self {
        Self { monitoring_manager }
    }
}