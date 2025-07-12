use actix_web::{
    dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform},
    Error, HttpMessage, HttpResponse,
};
use futures_util::future::{ready, LocalBoxFuture, Ready};
use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IPWhitelistConfig {
    pub allowed_ips: HashSet<String>,
    pub allow_all: bool,
    pub enabled: bool,
    pub log_blocked: bool,
}

pub struct IPWhitelistMiddleware {
    config: IPWhitelistConfig,
}

impl IPWhitelistMiddleware {
    pub fn new(config: IPWhitelistConfig) -> Self {
        Self { config }
    }

    pub fn with_ips(mut self, ips: Vec<String>) -> Self {
        self.config.allowed_ips.extend(ips);
        self
    }

    pub fn allow_all(mut self) -> Self {
        self.config.allow_all = true;
        self
    }

    pub fn enable(mut self) -> Self {
        self.config.enabled = true;
        self
    }

    pub fn disable(mut self) -> Self {
        self.config.enabled = false;
        self
    }
}

impl<S, B> Transform<S, ServiceRequest> for IPWhitelistMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = IPWhitelistService<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(IPWhitelistService {
            service,
            config: self.config.clone(),
        }))
    }
}

pub struct IPWhitelistService<S> {
    service: S,
    config: IPWhitelistConfig,
}

impl<S, B> Service<ServiceRequest> for IPWhitelistService<S>
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

        Box::pin(async move {
            if !config.enabled {
                return service.call(req).await;
            }

            let client_ip = req.connection_info().peer_addr().unwrap_or("unknown");

            // Check if IP is allowed
            if !Self::is_ip_allowed(&config, &client_ip) {
                if config.log_blocked {
                    log::warn!("IP blocked: {} from accessing {}", client_ip, req.path());
                }

                return Ok(req.into_response(
                    HttpResponse::Forbidden()
                        .json(serde_json::json!({
                            "error": "Access denied",
                            "reason": "IP not in whitelist",
                            "ip": client_ip
                        }))
                        .map_into_right_body()
                ));
            }

            // Call the next service
            service.call(req).await
        })
    }
}

impl<S> IPWhitelistService<S> {
    fn is_ip_allowed(config: &IPWhitelistConfig, ip: &str) -> bool {
        if config.allow_all {
            return true;
        }

        // Check exact IP match
        if config.allowed_ips.contains(ip) {
            return true;
        }

        // Check CIDR notation
        for allowed_ip in &config.allowed_ips {
            if Self::ip_in_cidr(ip, allowed_ip) {
                return true;
            }
        }

        false
    }

    fn ip_in_cidr(ip: &str, cidr: &str) -> bool {
        if !cidr.contains('/') {
            return ip == cidr;
        }

        // Simple CIDR check (in production, use a proper IP library)
        if let Some((network, bits)) = cidr.split_once('/') {
            if let Ok(bits) = bits.parse::<u8>() {
                // This is a simplified implementation
                // In production, use a proper IP address library
                return ip.starts_with(network);
            }
        }

        false
    }
}

// Predefined whitelist configurations
pub struct AdminWhitelist;
impl AdminWhitelist {
    pub fn new() -> IPWhitelistMiddleware {
        let mut allowed_ips = HashSet::new();
        allowed_ips.insert("127.0.0.1".to_string());
        allowed_ips.insert("::1".to_string());
        allowed_ips.insert("192.168.1.0/24".to_string());
        allowed_ips.insert("10.0.0.0/8".to_string());

        IPWhitelistMiddleware::new(IPWhitelistConfig {
            allowed_ips,
            allow_all: false,
            enabled: true,
            log_blocked: true,
        })
    }
}

pub struct ProductionWhitelist;
impl ProductionWhitelist {
    pub fn new() -> IPWhitelistMiddleware {
        let mut allowed_ips = HashSet::new();
        // Add production IPs here
        allowed_ips.insert("0.0.0.0/0".to_string()); // Allow all for now

        IPWhitelistMiddleware::new(IPWhitelistConfig {
            allowed_ips,
            allow_all: true, // Allow all in production for now
            enabled: true,
            log_blocked: true,
        })
    }
}

pub struct DevelopmentWhitelist;
impl DevelopmentWhitelist {
    pub fn new() -> IPWhitelistMiddleware {
        IPWhitelistMiddleware::new(IPWhitelistConfig {
            allowed_ips: HashSet::new(),
            allow_all: true, // Allow all in development
            enabled: true,
            log_blocked: false,
        })
    }
} 