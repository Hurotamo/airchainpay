use actix_web::{dev::ServiceRequest, dev::ServiceResponse, Error, HttpMessage};
use actix_web::http::{header, StatusCode};
use actix_web::web::Data;
use actix_web::HttpResponse;
use actix_web::middleware::{Logger, Compress};
use actix_web::dev::{forward_ready, Service, Transform};
use futures_util::future::{LocalBoxFuture, Ready};
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};
use crate::logger::Logger as AppLogger;
use lazy_static::lazy_static;
use regex::Regex;

pub mod input_validation;
pub mod rate_limiting;
pub mod ip_whitelist;
pub mod request_logging;
pub mod error_handling;
pub mod compression;
pub mod cors;

use input_validation::{InputValidationMiddleware, validate_transaction_request, validate_ble_request, validate_auth_request, validate_compressed_payload_request};
use rate_limiting::RateLimitingMiddleware;
use ip_whitelist::IPWhitelistMiddleware;
use request_logging::RequestLoggingMiddleware;
use error_handling::ErrorHandlingMiddleware;
use compression::CompressionMiddleware;
use cors::CorsMiddleware;

lazy_static! {
    // SQL Injection patterns
    static ref SQL_PATTERNS: Vec<Regex> = vec![
        Regex::new(r"(?i)(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|UNION|EXEC|EXECUTE|SCRIPT)").unwrap(),
        Regex::new(r"(?i)(--|/\*|\*/|;|xp_|sp_)").unwrap(),
        Regex::new(r"(?i)(OR\s+1\s*=\s*1|AND\s+1\s*=\s*1)").unwrap(),
        Regex::new(r"(?i)(UNION\s+SELECT|UNION\s+ALL\s+SELECT)").unwrap(),
        Regex::new(r"(?i)(INFORMATION_SCHEMA|sys\.|master\.|tempdb\.)").unwrap(),
    ];
    
    // XSS patterns
    static ref XSS_PATTERNS: Vec<Regex> = vec![
        Regex::new(r"(?i)<script[^>]*>.*?</script>").unwrap(),
        Regex::new(r"(?i)javascript:.*").unwrap(),
        Regex::new(r"(?i)on(load|error|click|mouseover|focus|blur)\s*=").unwrap(),
        Regex::new(r"(?i)eval\s*\(").unwrap(),
        Regex::new(r"(?i)document\.(cookie|write|location)").unwrap(),
        Regex::new(r"(?i)window\.(location|open|alert)").unwrap(),
        Regex::new(r"(?i)innerHTML|outerHTML").unwrap(),
        Regex::new(r"(?i)<iframe[^>]*>").unwrap(),
        Regex::new(r"(?i)<object[^>]*>").unwrap(),
        Regex::new(r"(?i)<embed[^>]*>").unwrap(),
    ];
    
    // Path traversal patterns
    static ref PATH_TRAVERSAL_PATTERNS: Vec<Regex> = vec![
        Regex::new(r"\.\./|\.\.\\").unwrap(),
        Regex::new(r"(?i)(%2e%2e%2f|%2e%2e%5c)").unwrap(),
        Regex::new(r"(?i)(\.\.%2f|\.\.%5c)").unwrap(),
    ];
    
    // Command injection patterns
    static ref COMMAND_INJECTION_PATTERNS: Vec<Regex> = vec![
        Regex::new(r"(?i)(cmd|command|exec|system|shell)").unwrap(),
        Regex::new(r"(?i)(&|\||;|\$\(|\`)").unwrap(),
        Regex::new(r"(?i)(ping|nslookup|whois|traceroute)").unwrap(),
    ];
}

#[derive(Clone)]
pub struct SecurityMiddleware {
    rate_limiters: Arc<RateLimiters>,
    security_config: SecurityConfig,
}

#[derive(Clone)]
struct SecurityConfig {
    enable_sql_injection_protection: bool,
    enable_xss_protection: bool,
    enable_path_traversal_protection: bool,
    enable_command_injection_protection: bool,
    max_request_size: usize,
    block_suspicious_ips: bool,
    log_security_events: bool,
}

impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            enable_sql_injection_protection: true,
            enable_xss_protection: true,
            enable_path_traversal_protection: true,
            enable_command_injection_protection: true,
            max_request_size: 10_000_000, // 10MB
            block_suspicious_ips: true,
            log_security_events: true,
        }
    }
}

#[derive(Clone)]
struct RateLimiters {
    global: Arc<RateLimiter>,
    auth: Arc<RateLimiter>,
    transactions: Arc<RateLimiter>,
    ble: Arc<RateLimiter>,
}

#[derive(Clone)]
struct RateLimiter {
    window_ms: u64,
    max_requests: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityEvent {
    pub timestamp: String,
    pub event_type: String,
    pub client_ip: String,
    pub user_agent: String,
    pub path: String,
    pub payload: Option<String>,
    pub severity: String,
}

impl SecurityMiddleware {
    pub fn new() -> Self {
        Self {
            rate_limiters: Arc::new(RateLimiters {
                global: Arc::new(RateLimiter {
                    window_ms: 15 * 60 * 1000, // 15 minutes
                    max_requests: 1000,
                }),
                auth: Arc::new(RateLimiter {
                    window_ms: 15 * 60 * 1000, // 15 minutes
                    max_requests: 5,
                }),
                transactions: Arc::new(RateLimiter {
                    window_ms: 60 * 1000, // 1 minute
                    max_requests: 50,
                }),
                ble: Arc::new(RateLimiter {
                    window_ms: 60 * 1000, // 1 minute
                    max_requests: 100,
                }),
            }),
            security_config: SecurityConfig::default(),
        }
    }

    pub fn with_security_config(mut self, config: SecurityConfig) -> Self {
        self.security_config = config;
        self
    }
}

impl<S, B> Transform<S, ServiceRequest> for SecurityMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = SecurityMiddlewareService<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        futures_util::future::ready(Ok(SecurityMiddlewareService {
            service,
            rate_limiters: self.rate_limiters.clone(),
            security_config: self.security_config.clone(),
        }))
    }
}

pub struct SecurityMiddlewareService<S> {
    service: S,
    rate_limiters: Arc<RateLimiters>,
    security_config: SecurityConfig,
}

impl<S, B> Service<ServiceRequest> for SecurityMiddlewareService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let rate_limiters = self.rate_limiters.clone();
        let security_config = self.security_config.clone();
        let service = self.service.clone();

        Box::pin(async move {
            // Apply comprehensive security headers
            let mut req = req;
            Self::apply_security_headers(&mut req);

            // Get client information
            let client_ip = req.connection_info().peer_addr().unwrap_or("unknown");
            let user_agent = req.headers()
                .get(header::USER_AGENT)
                .and_then(|ua| ua.to_str().ok())
                .unwrap_or("unknown")
                .to_string();
            let path = req.path().to_string();

            // Check for suspicious IP patterns
            if security_config.block_suspicious_ips && Self::is_suspicious_ip(client_ip) {
                Self::log_security_event(
                    &security_config,
                    "SUSPICIOUS_IP",
                    client_ip,
                    &user_agent,
                    &path,
                    None,
                    "HIGH"
                );
                return Ok(req.into_response(
                    HttpResponse::Forbidden()
                        .json(serde_json::json!({
                            "error": "Access denied",
                            "reason": "Suspicious IP detected"
                        }))
                        .map_into_right_body()
                ));
            }

            // Rate limiting
            let limiter = if path.contains("/auth") {
                &rate_limiters.auth
            } else if path.contains("/send_tx") {
                &rate_limiters.transactions
            } else if path.contains("/ble") {
                &rate_limiters.ble
            } else {
                &rate_limiters.global
            };

            if !Self::check_rate_limit(client_ip, limiter).await {
                return Ok(req.into_response(
                    HttpResponse::TooManyRequests()
                        .json(serde_json::json!({
                            "error": "Too many requests",
                            "retry_after": "15 minutes"
                        }))
                        .map_into_right_body()
                ));
            }

            // Enhanced security validation
            if let Err(response) = Self::validate_security(&req, &security_config, client_ip, &user_agent, &path).await {
                return Ok(response.map_into_right_body());
            }

            // Call the next service
            service.call(req).await
        })
    }
}

impl<S> SecurityMiddlewareService<S> {
    fn apply_security_headers(req: &mut ServiceRequest) {
        // Security headers are applied by the web framework
    }

    fn is_suspicious_ip(ip: &str) -> bool {
        // Check for suspicious IP patterns
        ip.contains("127.0.0.1") || 
        ip.contains("::1") || 
        ip.contains("0.0.0.0") ||
        ip.contains("192.168.") ||
        ip.contains("10.") ||
        ip.contains("172.")
    }

    async fn check_rate_limit(client_ip: &str, limiter: &RateLimiter) -> bool {
        // Simple in-memory rate limiting
        // In production, use Redis or similar
        let key = format!("rate_limit:{}", client_ip);
        let now = Instant::now();
        
        // This is a simplified implementation
        // In production, implement proper rate limiting with Redis
        true
    }

    async fn validate_security(
        req: &ServiceRequest,
        config: &SecurityConfig,
        client_ip: &str,
        user_agent: &str,
        path: &str,
    ) -> Result<(), ServiceResponse> {
        // Validate request body size
        if let Some(content_length) = req.headers().get(header::CONTENT_LENGTH) {
            if let Ok(length) = content_length.to_str().unwrap_or("0").parse::<usize>() {
                if length > config.max_request_size {
                    Self::log_security_event(
                        config,
                        "REQUEST_TOO_LARGE",
                        client_ip,
                        user_agent,
                        path,
                        Some(format!("Size: {} bytes", length)),
                        "MEDIUM"
                    );
                    return Err(req.into_response(
                        HttpResponse::BadRequest()
                            .json(serde_json::json!({
                                "error": "Request body too large",
                                "max_size": format!("{}MB", config.max_request_size / 1_000_000)
                            }))
                            .map_into_right_body()
                    ));
                }
            }
        }

        // Validate content type for POST requests
        if req.method() == actix_web::http::Method::POST {
            if let Some(content_type) = req.headers().get(header::CONTENT_TYPE) {
                let content_type_str = content_type.to_str().unwrap_or("");
                if !content_type_str.contains("application/json") {
                    Self::log_security_event(
                        config,
                        "INVALID_CONTENT_TYPE",
                        client_ip,
                        user_agent,
                        path,
                        Some(content_type_str.to_string()),
                        "LOW"
                    );
                    return Err(req.into_response(
                        HttpResponse::BadRequest()
                            .json(serde_json::json!({
                                "error": "Invalid content type",
                                "expected": "application/json"
                            }))
                            .map_into_right_body()
                    ));
                }
            }
        }

        // Check for malicious patterns in request data
        if let Err(response) = Self::check_malicious_patterns(req, config, client_ip, user_agent, path) {
            return Err(response);
        }

        Ok(())
    }

    fn check_malicious_patterns(
        req: &ServiceRequest,
        config: &SecurityConfig,
        client_ip: &str,
        user_agent: &str,
        path: &str,
    ) -> Result<(), ServiceResponse> {
        // Check URL parameters
        for (key, value) in req.match_info().pairs() {
            if let Err(response) = Self::validate_parameter(req, key, value, config, client_ip, user_agent, path, "URL_PARAM") {
                return Err(response);
            }
        }

        // Check query parameters
        if let Some(query_string) = req.uri().query() {
            for pair in query_string.split('&') {
                if let Some((key, value)) = pair.split_once('=') {
                    if let Err(response) = Self::validate_parameter(req, key, value, config, client_ip, user_agent, path, "QUERY_PARAM") {
                        return Err(response);
                    }
                }
            }
        }

        // Check headers
        for (key, value) in req.headers() {
            if let Ok(value_str) = value.to_str() {
                if let Err(response) = Self::validate_parameter(req, key.as_str(), value_str, config, client_ip, user_agent, path, "HEADER") {
                    return Err(response);
                }
            }
        }

        // Check body if available
        if let Some(body) = req.app_data::<serde_json::Value>() {
            if let Err(response) = Self::validate_json_body(req, body, config, client_ip, user_agent, path) {
                return Err(response);
            }
        }

        Ok(())
    }

    fn validate_parameter(
        req: &ServiceRequest,
        key: &str,
        value: &str,
        config: &SecurityConfig,
        client_ip: &str,
        user_agent: &str,
        path: &str,
        param_type: &str,
    ) -> Result<(), ServiceResponse> {
        // Check for SQL injection
        if config.enable_sql_injection_protection && Self::detect_sql_injection(value) {
            Self::log_security_event(
                req,
                config,
                "SQL_INJECTION_ATTEMPT",
                client_ip,
                user_agent,
                path,
                Some(format!("{}: {}", param_type, value)),
                "HIGH"
            );
            return Err(ServiceResponse::new(
                req.into_parts().0,
                HttpResponse::BadRequest()
                    .json(serde_json::json!({
                        "error": "Malicious input detected",
                        "type": "sql_injection"
                    }))
                    .map_into_right_body()
            ));
        }

        // Check for XSS
        if config.enable_xss_protection && Self::detect_xss(value) {
            Self::log_security_event(
                req,
                config,
                "XSS_ATTEMPT",
                client_ip,
                user_agent,
                path,
                Some(format!("{}: {}", param_type, value)),
                "HIGH"
            );
            return Err(ServiceResponse::new(
                req.into_parts().0,
                HttpResponse::BadRequest()
                    .json(serde_json::json!({
                        "error": "Malicious input detected",
                        "type": "xss"
                    }))
                    .map_into_right_body()
            ));
        }

        // Check for path traversal
        if config.enable_path_traversal_protection && Self::detect_path_traversal(value) {
            Self::log_security_event(
                req,
                config,
                "PATH_TRAVERSAL_ATTEMPT",
                client_ip,
                user_agent,
                path,
                Some(format!("{}: {}", param_type, value)),
                "HIGH"
            );
            return Err(ServiceResponse::new(
                req.into_parts().0,
                HttpResponse::BadRequest()
                    .json(serde_json::json!({
                        "error": "Malicious input detected",
                        "type": "path_traversal"
                    }))
                    .map_into_right_body()
            ));
        }

        // Check for command injection
        if config.enable_command_injection_protection && Self::detect_command_injection(value) {
            Self::log_security_event(
                req,
                config,
                "COMMAND_INJECTION_ATTEMPT",
                client_ip,
                user_agent,
                path,
                Some(format!("{}: {}", param_type, value)),
                "CRITICAL"
            );
            return Err(ServiceResponse::new(
                req.into_parts().0,
                HttpResponse::BadRequest()
                    .json(serde_json::json!({
                        "error": "Malicious input detected",
                        "type": "command_injection"
                    }))
                    .map_into_right_body()
            ));
        }

        Ok(())
    }

    fn validate_json_body(
        req: &ServiceRequest,
        body: &serde_json::Value,
        config: &SecurityConfig,
        client_ip: &str,
        user_agent: &str,
        path: &str,
    ) -> Result<(), ServiceResponse> {
        match body {
            serde_json::Value::String(s) => {
                if config.enable_sql_injection_protection && Self::detect_sql_injection(s) {
                    Self::log_security_event(
                        req,
                        config,
                        "SQL_INJECTION_ATTEMPT",
                        client_ip,
                        user_agent,
                        path,
                        Some(format!("BODY: {}", s)),
                        "HIGH"
                    );
                    return Err(ServiceResponse::new(
                        req.into_parts().0,
                        HttpResponse::BadRequest()
                            .json(serde_json::json!({
                                "error": "Malicious input detected in request body",
                                "type": "sql_injection"
                            }))
                            .map_into_right_body()
                    ));
                }
            }
            serde_json::Value::Object(obj) => {
                for (key, value) in obj {
                    if let Err(_) = Self::validate_json_body(req, value, config, client_ip, user_agent, path) {
                        return Err(ServiceResponse::new(
                            req.into_parts().0,
                            HttpResponse::BadRequest()
                                .json(serde_json::json!({
                                    "error": "Malicious input detected in request body"
                                }))
                                .map_into_right_body()
                        ));
                    }
                }
            }
            serde_json::Value::Array(arr) => {
                for item in arr {
                    if let Err(_) = Self::validate_json_body(req, item, config, client_ip, user_agent, path) {
                        return Err(ServiceResponse::new(
                            req.into_parts().0,
                            HttpResponse::BadRequest()
                                .json(serde_json::json!({
                                    "error": "Malicious input detected in request body"
                                }))
                                .map_into_right_body()
                        ));
                    }
                }
            }
            _ => {}
        }

        Ok(())
    }

    fn detect_sql_injection(input: &str) -> bool {
        SQL_PATTERNS.iter().any(|pattern| pattern.is_match(input))
    }

    fn detect_xss(input: &str) -> bool {
        XSS_PATTERNS.iter().any(|pattern| pattern.is_match(input))
    }

    fn detect_path_traversal(input: &str) -> bool {
        PATH_TRAVERSAL_PATTERNS.iter().any(|pattern| pattern.is_match(input))
    }

    fn detect_command_injection(input: &str) -> bool {
        COMMAND_INJECTION_PATTERNS.iter().any(|pattern| pattern.is_match(input))
    }

    fn log_security_event(
        req: &ServiceRequest,
        config: &SecurityConfig,
        event_type: &str,
        client_ip: &str,
        user_agent: &str,
        path: &str,
        payload: Option<String>,
        severity: &str,
    ) {
        if config.log_security_events {
            let event = SecurityEvent {
                timestamp: chrono::Utc::now().to_rfc3339(),
                event_type: event_type.to_string(),
                client_ip: client_ip.to_string(),
                user_agent: user_agent.to_string(),
                path: path.to_string(),
                payload,
                severity: severity.to_string(),
            };

            log::warn!("SECURITY_EVENT: {:?}", event);
        }
    }
}

pub fn cors_config() -> actix_cors::Cors {
    actix_cors::Cors::default()
        .allowed_origin_fn(|origin, _req_head| {
            let allowed_origins = std::env::var("CORS_ORIGINS")
                .unwrap_or_else(|_| "*".to_string())
                .split(',')
                .map(|s| s.trim())
                .collect::<Vec<_>>();

            if allowed_origins.contains(&"*") {
                return true;
            }

            if let Some(origin) = origin {
                allowed_origins.contains(&origin.as_str())
            } else {
                true
            }
        })
        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE", "OPTIONS"])
        .allowed_headers(vec![
            header::AUTHORIZATION,
            header::ACCEPT,
            header::CONTENT_TYPE,
            header::X_API_KEY,
        ])
        .max_age(3600)
}

pub fn compression_config() -> Compress {
    Compress::default()
}

pub fn logging_config() -> Logger {
    Logger::new("%a \"%r\" %s %b \"%{Referer}i\" \"%{User-Agent}i\" %T")
}

#[derive(Serialize, Deserialize)]
pub struct ValidationError {
    pub field: String,
    pub message: String,
}

pub struct InputValidator;

impl InputValidator {
    pub fn validate_ethereum_address(address: &str) -> bool {
        if address.len() != 42 || !address.starts_with("0x") {
            return false;
        }
        
        address[2..].chars().all(|c| c.is_ascii_hexdigit())
    }

    pub fn validate_transaction_hash(hash: &str) -> bool {
        if hash.len() != 66 || !hash.starts_with("0x") {
            return false;
        }
        
        hash[2..].chars().all(|c| c.is_ascii_hexdigit())
    }

    pub fn validate_chain_id(chain_id: u64) -> bool {
        chain_id > 0 && chain_id < 999999
    }

    pub fn validate_device_id(device_id: &str) -> bool {
        if device_id.len() < 1 || device_id.len() > 100 {
            return false;
        }
        
        device_id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    }

    pub fn sanitize_string(input: &str, max_length: usize) -> Option<String> {
        if input.len() > max_length {
            return None;
        }
        
        // Remove null bytes and control characters
        let sanitized: String = input.chars()
            .filter(|&c| c != '\0' && !c.is_control())
            .collect();
        
        if sanitized.is_empty() {
            None
        } else {
            Some(sanitized)
        }
    }

    pub fn validate_json_size(json_str: &str, max_size: usize) -> bool {
        json_str.len() <= max_size
    }
}

pub struct MetricsCollector {
    requests_total: std::sync::atomic::AtomicU64,
    requests_failed: std::sync::atomic::AtomicU64,
    requests_duration: std::sync::atomic::AtomicU64,
}

impl MetricsCollector {
    pub fn new() -> Self {
        Self {
            requests_total: std::sync::atomic::AtomicU64::new(0),
            requests_failed: std::sync::atomic::AtomicU64::new(0),
            requests_duration: std::sync::atomic::AtomicU64::new(0),
        }
    }

    pub fn increment_requests(&self) {
        self.requests_total.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    }

    pub fn increment_failures(&self) {
        self.requests_failed.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    }

    pub fn record_duration(&self, duration: Duration) {
        self.requests_duration.fetch_add(
            duration.as_millis() as u64,
            std::sync::atomic::Ordering::Relaxed
        );
    }

    pub fn get_metrics(&self) -> HashMap<String, u64> {
        let mut metrics = HashMap::new();
        metrics.insert("requests_total".to_string(), self.requests_total.load(std::sync::atomic::Ordering::Relaxed));
        metrics.insert("requests_failed".to_string(), self.requests_failed.load(std::sync::atomic::Ordering::Relaxed));
        metrics.insert("requests_duration_ms".to_string(), self.requests_duration.load(std::sync::atomic::Ordering::Relaxed));
        metrics
    }
} 