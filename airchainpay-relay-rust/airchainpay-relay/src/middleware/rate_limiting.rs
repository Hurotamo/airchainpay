#![allow(dead_code, unused_variables)]
use actix_web::{
    dev::{Service, Transform},
    Error, HttpResponse,
};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use std::time::{Instant, Duration};
use futures_util::future::{LocalBoxFuture, Ready};
use actix_web::dev::{ServiceRequest, ServiceResponse};
use futures_util::future::ready;

#[derive(Debug, Clone)]
pub struct RateLimitEntry {
    pub count: u32,
    pub reset_time: Instant,
    pub burst_count: u32,
}

#[derive(Debug, Clone)]
pub struct RateLimitingMiddleware {
    rate_limit: u32,
    burst_limit: u32,
    window_size: Duration,
}

impl RateLimitingMiddleware {
    pub fn new(rate_limit: u32, burst_limit: u32, window_size: Duration) -> Self {
        Self {
            rate_limit,
            burst_limit,
            window_size,
        }
    }
}

impl<S, B> Transform<S, ServiceRequest> for RateLimitingMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: actix_web::body::MessageBody + 'static,
{
    type Response = ServiceResponse<actix_web::body::BoxBody>;
    type Error = Error;
    type Transform = RateLimitingService<S, B>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(RateLimitingService {
            service: Arc::new(service),
            rate_limit: self.rate_limit,
            burst_limit: self.burst_limit,
            window_size: self.window_size,
            limits: Arc::new(RwLock::new(HashMap::new())),
            _phantom: std::marker::PhantomData,
        }))
    }
}

pub struct RateLimitingService<S, B> {
    service: Arc<S>,
    rate_limit: u32,
    burst_limit: u32,
    window_size: Duration,
    limits: Arc<RwLock<HashMap<String, RateLimitEntry>>>,
    _phantom: std::marker::PhantomData<B>,
}

impl<S, B> Service<ServiceRequest> for RateLimitingService<S, B>
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
        let service = Arc::clone(&self.service);
        let rate_limit = self.rate_limit;
        let burst_limit = self.burst_limit;
        let window_size = self.window_size;
        let limits = Arc::clone(&self.limits);

        Box::pin(async move {
            let client_ip = req.connection_info().peer_addr()
                .unwrap_or("unknown")
                .to_string();

            let mut limits_guard = limits.write().await;
            let now = Instant::now();

            if let Some(entry) = limits_guard.get_mut(&client_ip) {
                if now >= entry.reset_time {
                    // Reset window
                    *entry = RateLimitEntry {
                        count: 1,
                        reset_time: now + window_size,
                        burst_count: 1,
                    };
                } else {
                    // Check burst limit first
                    if entry.burst_count >= burst_limit {
                        return Ok(req.into_response(
                            HttpResponse::TooManyRequests()
                                .json(serde_json::json!({
                                    "error": "Rate limit exceeded (burst)",
                                    "retry_after": entry.reset_time.duration_since(now).as_secs()
                                }))
                                .map_into_boxed_body()
                        ));
                    }

                    // Check regular rate limit
                    if entry.count >= rate_limit {
                        return Ok(req.into_response(
                            HttpResponse::TooManyRequests()
                                .json(serde_json::json!({
                                    "error": "Rate limit exceeded",
                                    "retry_after": entry.reset_time.duration_since(now).as_secs()
                                }))
                                .map_into_boxed_body()
                        ));
                    }

                    entry.count += 1;
                    entry.burst_count += 1;
                }
            } else {
                limits_guard.insert(client_ip.to_string(), RateLimitEntry {
                    count: 1,
                    reset_time: now + window_size,
                    burst_count: 1,
                });
            }

            // Call the inner service
            let res = service.call(req).await?;
            Ok(res.map_into_boxed_body())
        })
    }
}

// Specialized rate limiters for different endpoints
pub struct TransactionRateLimiter;
impl TransactionRateLimiter {
    pub fn new() -> RateLimitingMiddleware {
        RateLimitingMiddleware::new(50, 10, Duration::from_secs(60))
    }
}

pub struct AuthRateLimiter;
impl AuthRateLimiter {
    pub fn new() -> RateLimitingMiddleware {
        RateLimitingMiddleware::new(5, 2, Duration::from_secs(900))
    }
}

pub struct BLERateLimiter;
impl BLERateLimiter {
    pub fn new() -> RateLimitingMiddleware {
        RateLimitingMiddleware::new(100, 20, Duration::from_secs(60))
    }
}

pub struct GlobalRateLimiter;
impl GlobalRateLimiter {
    pub fn new() -> RateLimitingMiddleware {
        RateLimitingMiddleware::new(1000, 100, Duration::from_secs(900))
    }
}

// Additional specialized rate limiters
pub struct HealthRateLimiter;
impl HealthRateLimiter {
    pub fn new() -> RateLimitingMiddleware {
        RateLimitingMiddleware::new(300, 50, Duration::from_secs(60))
    }
}

pub struct MetricsRateLimiter;
impl MetricsRateLimiter {
    pub fn new() -> RateLimitingMiddleware {
        RateLimitingMiddleware::new(60, 10, Duration::from_secs(60))
    }
}

pub struct DatabaseRateLimiter;
impl DatabaseRateLimiter {
    pub fn new() -> RateLimitingMiddleware {
        RateLimitingMiddleware::new(30, 5, Duration::from_secs(60))
    }
}

pub struct CompressRateLimiter;
impl CompressRateLimiter {
    pub fn new() -> RateLimitingMiddleware {
        RateLimitingMiddleware::new(200, 30, Duration::from_secs(60))
    }
}

// Rate limiting configuration
#[derive(Debug, Clone)]
pub struct RateLimitConfig {
    pub global: RateLimitingMiddleware,
    pub auth: RateLimitingMiddleware,
    pub transactions: RateLimitingMiddleware,
    pub ble: RateLimitingMiddleware,
    pub health: RateLimitingMiddleware,
    pub metrics: RateLimitingMiddleware,
    pub database: RateLimitingMiddleware,
    pub compress: RateLimitingMiddleware,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            global: GlobalRateLimiter::new(),
            auth: AuthRateLimiter::new(),
            transactions: TransactionRateLimiter::new(),
            ble: BLERateLimiter::new(),
            health: HealthRateLimiter::new(),
            metrics: MetricsRateLimiter::new(),
            database: DatabaseRateLimiter::new(),
            compress: CompressRateLimiter::new(),
        }
    }
}

// Rate limiting utilities
pub mod utils {
    use super::*;
    use actix_web::HttpRequest;
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    #[derive(Debug)]
    pub struct RateLimitStats {
        pub total_requests: u64,
        pub rate_limited_requests: u64,
        pub current_active_ips: usize,
    }

    pub struct RateLimitManager {
        stats: Arc<RwLock<RateLimitStats>>,
        limits: Arc<RwLock<HashMap<String, RateLimitEntry>>>,
    }

    impl Default for RateLimitManager {
        fn default() -> Self {
            Self::new()
        }
    }

    impl RateLimitManager {
        pub fn new() -> Self {
            Self {
                stats: Arc::new(RwLock::new(RateLimitStats {
                    total_requests: 0,
                    rate_limited_requests: 0,
                    current_active_ips: 0,
                })),
                limits: Arc::new(RwLock::new(HashMap::new())),
            }
        }

        pub async fn get_stats(&self) -> RateLimitStats {
            let stats = self.stats.read().await;
            let limits = self.limits.read().await;
            RateLimitStats {
                total_requests: stats.total_requests,
                rate_limited_requests: stats.rate_limited_requests,
                current_active_ips: limits.len(),
            }
        }

        pub async fn increment_total_requests(&self) {
            let mut stats = self.stats.write().await;
            stats.total_requests += 1;
        }

        pub async fn increment_rate_limited_requests(&self) {
            let mut stats = self.stats.write().await;
            stats.rate_limited_requests += 1;
        }

        pub async fn cleanup_expired_entries(&self) {
            let mut limits = self.limits.write().await;
            let now = Instant::now();
            limits.retain(|_, entry| now < entry.reset_time);
        }
    }

    pub fn get_client_ip(req: &HttpRequest) -> String {
        req.connection_info()
            .peer_addr()
            .unwrap_or("unknown")
            .to_string()
    }

    pub fn is_rate_limited(
        client_ip: &str,
        limits: &mut HashMap<String, RateLimitEntry>,
        rate_limit: u32,
        burst_limit: u32,
        window_size: Duration,
    ) -> bool {
        let now = Instant::now();

        if let Some(entry) = limits.get_mut(client_ip) {
            if now >= entry.reset_time {
                // Reset window
                *entry = RateLimitEntry {
                    count: 1,
                    reset_time: now + window_size,
                    burst_count: 1,
                };
                false
            } else {
                // Check burst limit first
                if entry.burst_count >= burst_limit {
                    return true;
                }

                // Check regular rate limit
                if entry.count >= rate_limit {
                    return true;
                }

                entry.count += 1;
                entry.burst_count += 1;
                false
            }
        } else {
            limits.insert(client_ip.to_string(), RateLimitEntry {
                count: 1,
                reset_time: now + window_size,
                burst_count: 1,
            });
            false
        }
    }
} 