use actix_web::{dev::ServiceRequest, dev::ServiceResponse, Error, dev::Service};
use actix_web::http::header::{HeaderValue, AUTHORIZATION};
use actix_web::web::Data;
use actix_cors::Cors;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use anyhow::Result;
use actix_web::HttpResponse;

use crate::auth::{AuthManager, Claims};

#[derive(Debug, Serialize, Deserialize)]
pub struct RateLimitConfig {
    pub window_ms: u64,
    pub max_requests: u32,
}

#[derive(Debug, Clone)]
pub struct RateLimiter {
    requests: Arc<Mutex<HashMap<String, Vec<Instant>>>>,
    max_requests: u32,
    window_duration: Duration,
}

impl RateLimiter {
    pub fn new(max_requests: u32, window_duration: Duration) -> Self {
        Self {
            requests: Arc::new(Mutex::new(HashMap::new())),
            max_requests,
            window_duration,
        }
    }

    pub fn is_allowed(&self, key: &str) -> bool {
        let mut requests = self.requests.lock().unwrap();
        let now = Instant::now();
        
        // Get or create the request history for this key
        let history = requests.entry(key.to_string()).or_insert_with(Vec::new);
        
        // Remove old requests outside the window
        history.retain(|&timestamp| now.duration_since(timestamp) < self.window_duration);
        
        // Check if we're under the limit
        if history.len() < self.max_requests as usize {
            history.push(now);
            true
        } else {
            false
        }
    }

    pub fn reset(&self, key: &str) {
        let mut requests = self.requests.lock().unwrap();
        requests.remove(key);
    }
}

#[derive(Debug, Clone)]
pub struct SecurityManager {
    rate_limiter: RateLimiter,
    auth_manager: AuthManager,
    // Using Arc<Mutex> for thread-safe sharing instead of direct Mutex
    blocked_ips: Arc<Mutex<HashMap<String, Instant>>>,
}

impl SecurityManager {
    pub fn new() -> Self {
        let rate_limiter = RateLimiter::new(100, Duration::from_secs(60));
        
        SecurityManager {
            rate_limiter,
            auth_manager: AuthManager::new(),
            blocked_ips: Arc::new(Mutex::new(HashMap::new())),
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
        let blocked_ips = self.blocked_ips.lock().unwrap();
        if let Some(block_until) = blocked_ips.get(ip) {
            if Instant::now() < *block_until {
                return true;
            }
        }
        false
    }
    
    pub fn block_ip(&self, ip: &str, duration: Duration) {
        let mut blocked_ips = self.blocked_ips.lock().unwrap();
        blocked_ips.insert(ip.to_string(), Instant::now() + duration);
    }

    pub fn cleanup_expired_blocks(&self) {
        let mut blocked_ips = self.blocked_ips.lock().unwrap();
        let now = Instant::now();
        blocked_ips.retain(|_, &mut block_until| now < block_until);
    }

    pub fn get_auth_manager(&self) -> &AuthManager {
        &self.auth_manager
    }
    
    pub fn authenticate_request(&self, req: &ServiceRequest) -> Result<Option<Claims>> {
        if let Some(auth_header) = req.headers().get(AUTHORIZATION) {
            if let Ok(auth_value) = auth_header.to_str() {
                if auth_value.starts_with("Bearer ") {
                    let token = &auth_value[7..];
                    return Ok(Some(Claims {
                        sub: token.to_string(),
                        exp: 0,
                        iat: 0,
                        typ: "device".to_string(),
                    }));
                }
            }
        }
        Ok(None)
    }
}

pub async fn security_middleware<T>(
    req: ServiceRequest,
    srv: T,
) -> Result<ServiceResponse, Error>
where
    T: Service<ServiceRequest, Response = ServiceResponse, Error = Error>,
    T::Future: 'static,
{
    let security = req.app_data::<Data<SecurityManager>>()
        .expect("SecurityManager not found");
    
    let client_ip = req.connection_info().peer_addr()
        .unwrap_or("unknown")
        .to_string();
    
    // Check if IP is blocked
    if security.is_ip_blocked(&client_ip) {
        return Ok(req.into_response(
            HttpResponse::TooManyRequests()
                .body("IP blocked due to security violations")
        ));
    }
    
    // Rate limiting - simplified for now
    // TODO: Implement proper rate limiting with the actor-based approach
    let key = format!("{}:{}", client_ip, req.path());
    
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