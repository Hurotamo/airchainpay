use actix_web::{
    dev::{Service, ServiceRequest, ServiceResponse, Transform},
    Error, HttpResponse,
};
use futures::future::{ready, Ready};
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use actix_web::dev::EitherBody;
use crate::monitoring::MonitoringManager;

pub struct MetricsMiddleware {
    monitoring_manager: Arc<MonitoringManager>,
}

impl MetricsMiddleware {
    pub fn new(monitoring_manager: Arc<MonitoringManager>) -> Self {
        Self { monitoring_manager }
    }
}

impl<S, B> Transform<S, ServiceRequest> for MetricsMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static + Clone,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B, actix_web::body::BoxBody>>;
    type Error = Error;
    type Transform = MetricsService<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(MetricsService {
            service: Arc::new(service),
            monitoring_manager: Arc::clone(&self.monitoring_manager),
        }))
    }
}

pub struct MetricsService<S> {
    service: Arc<S>,
    monitoring_manager: Arc<MonitoringManager>,
}

impl<S, B> Service<ServiceRequest> for MetricsService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static + Clone,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B, actix_web::body::BoxBody>>;
    type Error = Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>>>>;

    fn poll_ready(&self, cx: &mut std::task::Context<'_>) -> std::task::Poll<Result<(), Self::Error>> {
        self.service.poll_ready(cx)
    }

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = Arc::clone(&self.service);
        let monitoring_manager = Arc::clone(&self.monitoring_manager);
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

                    if path.contains("/auth") {
                        if !status.is_success() {
                            monitoring_manager.increment_metric("auth_failures").await;
                        }
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
                        "Request processed: {} {} - Status: {} - Time: {}ms - IP: {}",
                        method, path, status, response_time_ms, client_ip
                    );

                    Ok(res.map_into_left_body())
                }
                Err(e) => {
                    // Increment error metrics
                    monitoring_manager.increment_metric("requests_failed").await;
                    monitoring_manager.increment_metric("network_errors").await;

                    log::error!(
                        "Request failed: {} {} - Error: {} - Time: {}ms - IP: {}",
                        method, path, e, response_time_ms, client_ip
                    );

                    Err(e)
                }
            }
        })
    }
}

// Metrics collection utilities
pub struct MetricsCollector {
    monitoring_manager: Arc<MonitoringManager>,
}

impl MetricsCollector {
    pub fn new(monitoring_manager: Arc<MonitoringManager>) -> Self {
        Self { monitoring_manager }
    }

    pub async fn record_transaction_processed(&self) {
        self.monitoring_manager.increment_metric("transactions_processed").await;
    }

    pub async fn record_transaction_failed(&self) {
        self.monitoring_manager.increment_metric("transactions_failed").await;
    }

    pub async fn record_transaction_broadcasted(&self) {
        self.monitoring_manager.increment_metric("transactions_broadcasted").await;
    }

    pub async fn record_ble_connection(&self) {
        self.monitoring_manager.increment_metric("ble_connections").await;
    }

    pub async fn record_ble_disconnection(&self) {
        self.monitoring_manager.increment_metric("ble_disconnections").await;
    }

    pub async fn record_ble_authentication(&self) {
        self.monitoring_manager.increment_metric("ble_authentications").await;
    }

    pub async fn record_ble_key_exchange(&self) {
        self.monitoring_manager.increment_metric("ble_key_exchanges").await;
    }

    pub async fn record_rpc_error(&self) {
        self.monitoring_manager.increment_metric("rpc_errors").await;
    }

    pub async fn record_auth_failure(&self) {
        self.monitoring_manager.increment_metric("auth_failures").await;
    }

    pub async fn record_rate_limit_hit(&self) {
        self.monitoring_manager.increment_metric("rate_limit_hits").await;
    }

    pub async fn record_blocked_device(&self) {
        self.monitoring_manager.increment_metric("blocked_devices").await;
    }

    pub async fn record_security_event(&self) {
        self.monitoring_manager.increment_metric("security_events").await;
    }

    pub async fn record_validation_failure(&self) {
        self.monitoring_manager.increment_metric("validation_failures").await;
    }

    pub async fn record_cache_hit(&self) {
        self.monitoring_manager.increment_metric("cache_hits").await;
    }

    pub async fn record_cache_miss(&self) {
        self.monitoring_manager.increment_metric("cache_misses").await;
    }

    pub async fn record_blockchain_confirmation(&self) {
        self.monitoring_manager.increment_metric("blockchain_confirmations").await;
    }

    pub async fn record_blockchain_timeout(&self) {
        self.monitoring_manager.increment_metric("blockchain_timeouts").await;
    }

    pub async fn record_gas_price_update(&self) {
        self.monitoring_manager.increment_metric("gas_price_updates").await;
    }

    pub async fn record_contract_event(&self) {
        self.monitoring_manager.increment_metric("contract_events").await;
    }

    pub async fn record_compression_operation(&self, original_size: usize, compressed_size: usize) {
        self.monitoring_manager.increment_metric("compression_operations").await;
        
        // Update compression ratio
        if original_size > 0 {
            let ratio = compressed_size as f64 / original_size as f64;
            // Note: This would need to be implemented in the monitoring manager
            // For now, we just log it
            log::info!("Compression ratio: {:.2}%", ratio * 100.0);
        }
    }

    pub async fn record_database_operation(&self) {
        self.monitoring_manager.increment_metric("database_operations").await;
    }

    pub async fn record_database_error(&self) {
        self.monitoring_manager.increment_metric("database_errors").await;
    }

    pub async fn record_network_error(&self) {
        self.monitoring_manager.increment_metric("network_errors").await;
    }

    pub async fn get_metrics(&self) -> crate::monitoring::PrometheusMetrics {
        self.monitoring_manager.get_metrics().await
    }

    pub async fn get_system_metrics(&self) -> crate::monitoring::SystemMetrics {
        self.monitoring_manager.get_system_metrics().await
    }
} 