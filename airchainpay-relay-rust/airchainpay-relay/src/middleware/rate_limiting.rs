use actix_web::{
    dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform},
    Error, HttpMessage, HttpResponse,
};
use futures_util::future::{ready, LocalBoxFuture, Ready};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitConfig {
    pub window_ms: u64,
    pub max_requests: u32,
    pub burst_size: u32,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitEntry {
    pub count: u32,
    pub reset_time: Instant,
    pub burst_count: u32,
}

pub struct RateLimitingMiddleware {
    config: RateLimitConfig,
    limits: Arc<RwLock<HashMap<String, RateLimitEntry>>>,
}

impl RateLimitingMiddleware {
    pub fn new(config: RateLimitConfig) -> Self {
        Self {
            config,
            limits: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn with_window(mut self, window_ms: u64) -> Self {
        self.config.window_ms = window_ms;
        self
    }

    pub fn with_max_requests(mut self, max_requests: u32) -> Self {
        self.config.max_requests = max_requests;
        self
    }

    pub fn with_burst_size(mut self, burst_size: u32) -> Self {
        self.config.burst_size = burst_size;
        self
    }
}

impl<S, B> Transform<S, ServiceRequest> for RateLimitingMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = RateLimitingService<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(RateLimitingService {
            service,
            config: self.config.clone(),
            limits: self.limits.clone(),
        }))
    }
}

pub struct RateLimitingService<S> {
    service: S,
    config: RateLimitConfig,
    limits: Arc<RwLock<HashMap<String, RateLimitEntry>>>,
}

impl<S, B> Service<ServiceRequest> for RateLimitingService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = self.service.clone();
        let config = self.config.clone();
        let limits = self.limits.clone();

        Box::pin(async move {
            if !config.enabled {
                return service.call(req).await;
            }

            let client_ip = req.connection_info().peer_addr().unwrap_or("unknown");
            let now = Instant::now();

            // Check rate limit
            let mut limits_guard = limits.write().await;
            
            if let Some(entry) = limits_guard.get_mut(&client_ip) {
                // Check if window has reset
                if now >= entry.reset_time {
                    entry.count = 0;
                    entry.burst_count = 0;
                    entry.reset_time = now + Duration::from_millis(config.window_ms);
                }

                // Check burst limit
                if entry.burst_count >= config.burst_size {
                    return Ok(req.into_response(
                        HttpResponse::TooManyRequests()
                            .json(serde_json::json!({
                                "error": "Rate limit exceeded (burst)",
                                "retry_after": format!("{}ms", config.window_ms)
                            }))
                            .map_into_right_body()
                    ));
                }

                // Check regular rate limit
                if entry.count >= config.max_requests {
                    return Ok(req.into_response(
                        HttpResponse::TooManyRequests()
                            .json(serde_json::json!({
                                "error": "Rate limit exceeded",
                                "retry_after": format!("{}ms", config.window_ms)
                            }))
                            .map_into_right_body()
                    ));
                }

                entry.count += 1;
                entry.burst_count += 1;
            } else {
                // First request from this IP
                let reset_time = now + Duration::from_millis(config.window_ms);
                limits_guard.insert(client_ip.clone(), RateLimitEntry {
                    count: 1,
                    reset_time,
                    burst_count: 1,
                });
            }

            drop(limits_guard);

            // Call the next service
            service.call(req).await
        })
    }
}

// Specialized rate limiters for different endpoints
pub struct TransactionRateLimiter;
impl TransactionRateLimiter {
    pub fn new() -> RateLimitingMiddleware {
        RateLimitingMiddleware::new(RateLimitConfig {
            window_ms: 60 * 1000, // 1 minute
            max_requests: 50,
            burst_size: 10,
            enabled: true,
        })
    }
}

pub struct AuthRateLimiter;
impl AuthRateLimiter {
    pub fn new() -> RateLimitingMiddleware {
        RateLimitingMiddleware::new(RateLimitConfig {
            window_ms: 15 * 60 * 1000, // 15 minutes
            max_requests: 5,
            burst_size: 2,
            enabled: true,
        })
    }
}

pub struct BLERateLimiter;
impl BLERateLimiter {
    pub fn new() -> RateLimitingMiddleware {
        RateLimitingMiddleware::new(RateLimitConfig {
            window_ms: 60 * 1000, // 1 minute
            max_requests: 100,
            burst_size: 20,
            enabled: true,
        })
    }
}

pub struct GlobalRateLimiter;
impl GlobalRateLimiter {
    pub fn new() -> RateLimitingMiddleware {
        RateLimitingMiddleware::new(RateLimitConfig {
            window_ms: 15 * 60 * 1000, // 15 minutes
            max_requests: 1000,
            burst_size: 100,
            enabled: true,
        })
    }
} 