use actix_web::{dev::ServiceRequest, dev::ServiceResponse, Error, HttpMessage};
use actix_web::http::header::{HeaderValue, AUTHORIZATION};
use actix_web::web::Data;
use actix_ratelimit::{RateLimiter, MemoryStore, MemoryStoreError};
use actix_cors::Cors;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use anyhow::Result;

use crate::auth::{AuthManager, Claims};

#[derive(Debug, Serialize, Deserialize)]
pub struct RateLimitConfig {
    pub window_ms: u64,
    pub max_requests: u32,
}

pub struct SecurityManager {
    rate_limiter: RateLimiter<MemoryStore>,
    auth_manager: AuthManager,
    blocked_ips: Mutex<HashMap<String, Instant>>,
}

impl SecurityManager {
    pub fn new() -> Self {
        let store = MemoryStore::new();
        let rate_limiter = RateLimiter::new(store.into())
            .with_interval(Duration::from_secs(60))
            .with_max_requests(100);
        
        SecurityManager {
            rate_limiter,
            auth_manager: AuthManager::new(),
            blocked_ips: Mutex::new(HashMap::new()),
        }
    }
    
    pub fn cors_config() -> Cors {
        Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600)
    }
    
    pub fn validate_device_id(device_id: &str) -> bool {
        if device_id.is_empty() || device_id.len() > 100 {
            return false;
        }
        
        // Only allow alphanumeric characters, hyphens, and underscores
        device_id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    }
    
    pub fn validate_signed_tx(signed_tx: &str) -> bool {
        if signed_tx.is_empty() || signed_tx.len() > 10000 {
            return false;
        }
        
        // Basic hex validation (should start with 0x and contain only hex chars)
        if !signed_tx.starts_with("0x") {
            return false;
        }
        
        let hex_part = &signed_tx[2..];
        hex_part.chars().all(|c| c.is_ascii_hexdigit())
    }
    
    pub fn validate_chain_id(chain_id: u64) -> bool {
        chain_id > 0 && chain_id <= 999999
    }
    
    pub fn is_ip_blocked(&self, ip: &str) -> bool {
        let blocked = self.blocked_ips.lock().unwrap();
        if let Some(blocked_until) = blocked.get(ip) {
            if blocked_until.elapsed() < Duration::from_secs(300) { // 5 minutes
                return true;
            }
        }
        false
    }
    
    pub fn block_ip(&self, ip: &str) {
        let mut blocked = self.blocked_ips.lock().unwrap();
        blocked.insert(ip.to_string(), Instant::now());
    }
    
    pub fn authenticate_request(&self, req: &ServiceRequest) -> Result<Option<Claims>> {
        if let Some(auth_header) = req.headers().get(AUTHORIZATION) {
            if let Ok(auth_value) = auth_header.to_str() {
                if auth_value.starts_with("Bearer ") {
                    let token = &auth_value[7..];
                    return Ok(Some(self.auth_manager.validate_token(token)?));
                }
            }
        }
        Ok(None)
    }
}

pub async fn security_middleware(
    req: ServiceRequest,
    srv: actix_web::dev::Service<
        ServiceRequest,
        Response = ServiceResponse,
        Error = Error,
    >,
) -> Result<ServiceResponse, Error> {
    let security = req.app_data::<Data<SecurityManager>>()
        .expect("SecurityManager not found");
    
    let client_ip = req.connection_info().peer_addr()
        .unwrap_or("unknown")
        .to_string();
    
    // Check if IP is blocked
    if security.is_ip_blocked(&client_ip) {
        return Ok(req.into_response(
            actix_web::http::Response::builder()
                .status(429)
                .body("IP blocked due to security violations")
                .unwrap()
        ));
    }
    
    // Rate limiting
    let key = format!("{}:{}", client_ip, req.path());
    if let Err(_) = security.rate_limiter.check(&key).await {
        security.block_ip(&client_ip);
        return Ok(req.into_response(
            actix_web::http::Response::builder()
                .status(429)
                .body("Rate limit exceeded")
                .unwrap()
        ));
    }
    
    // Continue with the request
    srv.call(req).await
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_device_id_validation() {
        assert!(SecurityManager::validate_device_id("device-123"));
        assert!(SecurityManager::validate_device_id("device_123"));
        assert!(!SecurityManager::validate_device_id("device@123"));
        assert!(!SecurityManager::validate_device_id(""));
    }
    
    #[test]
    fn test_signed_tx_validation() {
        assert!(SecurityManager::validate_signed_tx("0x1234567890abcdef"));
        assert!(!SecurityManager::validate_signed_tx("1234567890abcdef"));
        assert!(!SecurityManager::validate_signed_tx("0xinvalid"));
    }
    
    #[test]
    fn test_chain_id_validation() {
        assert!(SecurityManager::validate_chain_id(1));
        assert!(SecurityManager::validate_chain_id(999999));
        assert!(!SecurityManager::validate_chain_id(0));
        assert!(!SecurityManager::validate_chain_id(1000000));
    }
} 