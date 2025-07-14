#![allow(dead_code, unused_variables)]
use actix_web::{
    dev::{Service, Transform, ServiceRequest, ServiceResponse},
    Error, HttpResponse,
};
use std::sync::Arc;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use actix_web::http::{header, Method};
use futures_util::future::Ready;
use actix_web::body::BoxBody;
use std::pin::Pin;
use std::future::Future;
use actix_cors::Cors;
use actix_web::middleware::{Compress, Logger};
use futures_util::future::ready;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityConfig {
    pub enable_cors: bool,
    pub enable_csrf: bool,
    pub enable_xss_protection: bool,
    pub enable_content_security_policy: bool,
    pub enable_hsts: bool,
    pub enable_frame_options: bool,
    pub enable_content_type_options: bool,
    pub enable_referrer_policy: bool,
    pub enable_permissions_policy: bool,
    pub allowed_origins: Vec<String>,
    pub allowed_methods: Vec<String>,
    pub allowed_headers: Vec<String>,
    pub exposed_headers: Vec<String>,
    pub max_age: u32,
    pub credentials: bool,
    pub request_size_limit: usize,
    pub enable_compression: bool,
    pub enable_logging: bool,
    pub enable_rate_limiting: bool,
    pub enable_ip_whitelist: bool,
    pub allowed_ips: Vec<String>,
    pub security_headers: HashMap<String, String>,
}

impl Default for SecurityConfig {
    fn default() -> Self {
        let mut security_headers = HashMap::new();
        security_headers.insert("X-Content-Type-Options".to_string(), "nosniff".to_string());
        security_headers.insert("X-Frame-Options".to_string(), "DENY".to_string());
        security_headers.insert("X-XSS-Protection".to_string(), "1; mode=block".to_string());
        security_headers.insert("Referrer-Policy".to_string(), "strict-origin-when-cross-origin".to_string());
        security_headers.insert("Permissions-Policy".to_string(), "geolocation=(), microphone=(), camera=()".to_string());

        Self {
            enable_cors: true,
            enable_csrf: true,
            enable_xss_protection: true,
            enable_content_security_policy: true,
            enable_hsts: true,
            enable_frame_options: true,
            enable_content_type_options: true,
            enable_referrer_policy: true,
            enable_permissions_policy: true,
            allowed_origins: vec!["*".to_string()],
            allowed_methods: vec!["GET".to_string(), "POST".to_string(), "PUT".to_string(), "DELETE".to_string(), "OPTIONS".to_string()],
            allowed_headers: vec!["Content-Type".to_string(), "Authorization".to_string(), "X-API-Key".to_string()],
            exposed_headers: vec![],
            max_age: 86400,
            credentials: true,
            request_size_limit: 10 * 1024 * 1024, // 10MB
            enable_compression: true,
            enable_logging: true,
            enable_rate_limiting: true,
            enable_ip_whitelist: false,
            allowed_ips: vec![],
            security_headers,
        }
    }
}

#[derive(Clone)]
pub struct SecurityMiddleware {
    security_config: SecurityConfig,
}

impl SecurityMiddleware {
    pub fn new(security_config: SecurityConfig) -> Self {
        Self { security_config }
    }

    pub fn with_config(mut self, config: SecurityConfig) -> Self {
        self.security_config = config;
        self
    }
}

impl<S, B> Transform<S, ServiceRequest> for SecurityMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: actix_web::body::MessageBody + 'static,
{
    type Response = ServiceResponse<BoxBody>;
    type Error = Error;
    type Transform = SecurityMiddlewareService<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(SecurityMiddlewareService {
            service: Arc::new(service),
            security_config: self.security_config.clone(),
        }))
    }
}

#[derive(Clone)]
pub struct SecurityMiddlewareService<S> {
    service: Arc<S>,
    security_config: SecurityConfig,
}

impl<S, B> Service<ServiceRequest> for SecurityMiddlewareService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: actix_web::body::MessageBody + 'static,
{
    type Response = ServiceResponse<BoxBody>;
    type Error = Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>>>>;

    fn poll_ready(&self, cx: &mut std::task::Context<'_>) -> std::task::Poll<Result<(), Self::Error>> {
        self.service.poll_ready(cx)
    }

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = Arc::clone(&self.service);
        let security_config = self.security_config.clone();

        Box::pin(async move {
            // Check request size limit
            if let Some(content_length) = req.headers().get("content-length") {
                if let Ok(length) = content_length.to_str().unwrap_or("0").parse::<usize>() {
                    if length > security_config.request_size_limit {
                        return Ok(req.into_response(
                            HttpResponse::PayloadTooLarge()
                                .json(serde_json::json!({
                                    "error": "Request entity too large",
                                    "maxSize": format!("{}MB", security_config.request_size_limit / 1024 / 1024),
                                    "timestamp": SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()
                                }))
                                .map_into_boxed_body()
                        ));
                    }
                }
            }

            // Validate content type for POST requests
            if req.method() == Method::POST {
                if let Some(content_type) = req.headers().get("content-type") {
                    let content_type_str = content_type.to_str().unwrap_or("");
                    if !content_type_str.contains("application/json") && 
                       !content_type_str.contains("application/x-www-form-urlencoded") {
                        return Ok(req.into_response(
                            HttpResponse::BadRequest()
                                .json(serde_json::json!({
                                    "error": "Invalid content type",
                                    "message": "Only application/json and application/x-www-form-urlencoded are allowed"
                                }))
                                .map_into_boxed_body()
                        ));
                    }
                }
            }

            // Check for suspicious patterns
            let client_ip = req.connection_info().peer_addr().unwrap_or("unknown").to_string();
            let user_agent = req.headers().get("user-agent").map(|h| h.to_str().unwrap_or("")).unwrap_or("");
            let path = req.path().to_string();

            // Log suspicious activity
            if Self::is_suspicious_request(&client_ip, user_agent, &path) {
                Self::log_security_event(
                    &req,
                    &security_config,
                    &client_ip,
                    user_agent,
                    &path,
                    "SUSPICIOUS_REQUEST",
                    None,
                    "HIGH"
                );
            }

            // Call the inner service
            let fut = service.call(req);
            let res = fut.await?;
            
            // Apply security headers to response
            let res = Self::apply_security_headers_to_response(res, &security_config);
            
            Ok(res.map_into_boxed_body())
        })
    }
}

impl<S> SecurityMiddlewareService<S> {
    #[allow(dead_code)]
    fn is_suspicious_request(_ip: &str, user_agent: &str, path: &str) -> bool {
        // Check for suspicious patterns
        let suspicious_patterns = [
            "sqlmap", "nikto", "nmap", "dirb", "gobuster",
            "admin", "wp-admin", "phpmyadmin", "config",
            "..", "~", ".env", ".git", ".svn"
        ];

        let user_agent_lower = user_agent.to_lowercase();
        let path_lower = path.to_lowercase();

        suspicious_patterns.iter().any(|pattern| {
            user_agent_lower.contains(pattern) || path_lower.contains(pattern)
        })
    }

    #[allow(dead_code)]
    fn log_security_event(
        _req: &ServiceRequest,
        _security_config: &SecurityConfig,
        client_ip: &str,
        user_agent: &str,
        path: &str,
        event_type: &str,
        details: Option<HashMap<String, String>>,
        severity: &str,
    ) {
        // In a real implementation, this would log to a security monitoring system
        eprintln!(
            "SECURITY_EVENT: {event_type} - IP: {client_ip} - UA: {user_agent} - Path: {path} - Severity: {severity}"
        );

        if let Some(details) = details {
            for (key, value) in details {
                eprintln!("  {key}: {value}");
            }
        }
    }

    #[allow(dead_code)]
    fn validate_input(input: &str) -> Result<(), String> {
        // Check for SQL injection patterns with word boundaries
        let sql_patterns = [
            "SELECT", "INSERT", "UPDATE", "DELETE", "DROP", "CREATE",
            "UNION", "EXEC", "EXECUTE", "SCRIPT"
        ];

        let input_upper = input.to_uppercase();
        for pattern in &sql_patterns {
            // Use word boundaries to avoid false positives
            let pattern_with_boundaries = format!(" {} ", pattern);
            if input_upper.contains(&pattern_with_boundaries) || 
               input_upper.starts_with(pattern) || 
               input_upper.ends_with(pattern) {
                return Err(format!("SQL injection pattern detected: {pattern}"));
            }
        }

        // Check for XSS patterns
        let xss_patterns = [
            "<script>", "javascript:", "onload=", "onerror=",
            "onclick=", "onmouseover=", "eval(", "alert("
        ];

        let input_lower = input.to_lowercase();
        for pattern in &xss_patterns {
            if input_lower.contains(pattern) {
                return Err(format!("XSS pattern detected: {pattern}"));
            }
        }

        Ok(())
    }

    #[allow(dead_code)]
    fn sanitize_input(input: &str) -> String {
        // HTML entity encoding
        input
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")
            .replace("'", "&#x27;")
    }

    #[allow(dead_code)]
    fn apply_security_headers_to_response<B>(
        mut res: ServiceResponse<B>,
        config: &SecurityConfig,
    ) -> ServiceResponse<B> {
        let headers = res.headers_mut();

        // Content Security Policy
        if config.enable_content_security_policy {
            headers.insert(
                header::CONTENT_SECURITY_POLICY,
                header::HeaderValue::from_static("default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';")
            );
        }

        // X-Frame-Options
        if config.enable_frame_options {
            headers.insert(
                header::X_FRAME_OPTIONS,
                header::HeaderValue::from_static("DENY")
            );
        }

        // X-Content-Type-Options
        if config.enable_content_type_options {
            headers.insert(
                header::X_CONTENT_TYPE_OPTIONS,
                header::HeaderValue::from_static("nosniff")
            );
        }

        // X-XSS-Protection
        if config.enable_xss_protection {
            headers.insert(
                header::X_XSS_PROTECTION,
                header::HeaderValue::from_static("1; mode=block")
            );
        }

        // HSTS
        if config.enable_hsts {
            headers.insert(
                header::STRICT_TRANSPORT_SECURITY,
                header::HeaderValue::from_static("max-age=31536000; includeSubDomains")
            );
        }

        // Referrer Policy
        if config.enable_referrer_policy {
            headers.insert(
                header::REFERRER_POLICY,
                header::HeaderValue::from_static("strict-origin-when-cross-origin")
            );
        }

        // Permissions Policy
        if config.enable_permissions_policy {
            headers.insert(
                header::PERMISSIONS_POLICY,
                header::HeaderValue::from_static("geolocation=(), microphone=(), camera=()")
            );
        }

        // Custom security headers
        for (key, value) in &config.security_headers {
            if let Ok(header_name) = header::HeaderName::from_lowercase(key.to_lowercase().as_bytes()) {
                if let Ok(header_value) = header::HeaderValue::from_str(value) {
                    headers.insert(header_name, header_value);
                }
            }
        }

        res
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_security_config_default() {
        let config = SecurityConfig::default();
        assert!(config.enable_cors);
        assert!(config.enable_csrf);
        assert!(config.enable_xss_protection);
        assert!(config.enable_content_security_policy);
        assert!(config.enable_hsts);
        assert!(config.enable_frame_options);
        assert!(config.enable_content_type_options);
        assert!(config.enable_referrer_policy);
        assert!(config.enable_permissions_policy);
        assert_eq!(config.request_size_limit, 10 * 1024 * 1024);
        assert!(config.enable_compression);
        assert!(config.enable_logging);
        assert!(config.enable_rate_limiting);
        assert!(!config.enable_ip_whitelist);
        assert!(config.allowed_ips.is_empty());
        assert!(!config.security_headers.is_empty());
    }

    #[test]
    fn test_input_validation() {
        // Test valid input
        assert!(SecurityMiddlewareService::<()>::validate_input("normal text").is_ok());

        // Test SQL injection
        assert!(SecurityMiddlewareService::<()>::validate_input("SELECT * FROM users").is_err());
        assert!(SecurityMiddlewareService::<()>::validate_input("DROP TABLE users").is_err());

        // Test XSS
        assert!(SecurityMiddlewareService::<()>::validate_input("<script>alert('xss')</script>").is_err());
        assert!(SecurityMiddlewareService::<()>::validate_input("javascript:alert('xss')").is_err());
    }

    #[test]
    fn test_suspicious_request_detection() {
        // Test normal request
        assert!(!SecurityMiddlewareService::<()>::is_suspicious_request(
            "192.168.1.1",
            "Mozilla/5.0",
            "/api/users"
        ));

        // Test suspicious request
        assert!(SecurityMiddlewareService::<()>::is_suspicious_request(
            "192.168.1.1",
            "sqlmap",
            "/admin"
        ));
    }

    #[test]
    fn test_input_sanitization() {
        let input = "<script>alert('xss')</script>";
        let sanitized = SecurityMiddlewareService::<()>::sanitize_input(input);
        assert!(!sanitized.contains("<script>"));
        assert!(sanitized.contains("&lt;script&gt;"));
    }

    #[test]
    fn test_cors_configuration() {
        let config = SecurityConfig::default();
        let cors = cors_config(&config);
        // Removed invalid assertion: cors.allowed_origins() does not exist in actix-cors v0.7.1
    }

    #[test]
    fn test_compression_configuration() {
        let config = SecurityConfig::default();
        let _compression = compression_config(&config);
        // Just test that it doesn't panic
    }

    #[test]
    fn test_logging_configuration() {
        let config = SecurityConfig::default();
        let _logger = logging_config(&config);
        // Just test that it doesn't panic
    }
}

// CORS configuration
pub fn cors_config(config: &SecurityConfig) -> Cors {
    let mut cors = Cors::default();

    if config.enable_cors {
        // Set allowed origins
        for origin in &config.allowed_origins {
            if origin == "*" {
                cors = cors.allow_any_origin();
            } else {
                cors = cors.allowed_origin(origin);
            }
        }

        // Set allowed methods
        for method in &config.allowed_methods {
            if let Ok(http_method) = method.parse::<Method>() {
                cors = cors.allowed_methods(vec![http_method]);
            }
        }

        // Set allowed headers
        for header_name in &config.allowed_headers {
            if let Ok(header_value) = header_name.parse::<header::HeaderName>() {
                cors = cors.allowed_header(header_value);
            } else {
                // Fallback to Content-Type if parsing fails
                if let Ok(content_type_header) = "Content-Type".parse::<header::HeaderName>() {
                    cors = cors.allowed_header(content_type_header);
                }
            }
        }

        // Set exposed headers
        for header_name in &config.exposed_headers {
            if let Ok(header_value) = header_name.parse::<header::HeaderName>() {
                cors = cors.expose_headers(vec![header_value]);
            } else {
                // Fallback to Content-Type if parsing fails
                if let Ok(content_type_header) = "Content-Type".parse::<header::HeaderName>() {
                    cors = cors.expose_headers(vec![content_type_header]);
                }
            }
        }

        cors = cors.max_age(Some(config.max_age as usize));

        if config.credentials {
            cors = cors.supports_credentials();
        }
    }

    cors
}

// Compression configuration
pub fn compression_config(config: &SecurityConfig) -> Compress {
    if config.enable_compression {
        Compress::default()
    } else {
        Compress::default()
    }
}

// Logging configuration
pub fn logging_config(config: &SecurityConfig) -> Logger {
    if config.enable_logging {
        Logger::default()
    } else {
        Logger::new("")
    }
}

// CSRF protection middleware
pub struct CSRFMiddleware {
    token_header: String,
    enabled: bool,
}

impl CSRFMiddleware {
    pub fn new(token_header: String) -> Self {
        Self {
            token_header,
            enabled: true,
        }
    }

    pub fn with_enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }
}

impl<S, B> Transform<S, ServiceRequest> for CSRFMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: actix_web::body::MessageBody + 'static,
{
    type Response = ServiceResponse<BoxBody>;
    type Error = Error;
    type Transform = CSRFMiddlewareService<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(CSRFMiddlewareService {
            service: Arc::new(service),
            token_header: self.token_header.clone(),
            enabled: self.enabled,
        }))
    }
}

pub struct CSRFMiddlewareService<S> {
    service: Arc<S>,
    token_header: String,
    enabled: bool,
}

impl<S, B> Service<ServiceRequest> for CSRFMiddlewareService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: actix_web::body::MessageBody + 'static,
{
    type Response = ServiceResponse<BoxBody>;
    type Error = Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>>>>;

    fn poll_ready(&self, cx: &mut std::task::Context<'_>) -> std::task::Poll<Result<(), Self::Error>> {
        self.service.poll_ready(cx)
    }

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = Arc::clone(&self.service);
        let token_header = self.token_header.clone();
        let enabled = self.enabled;

        Box::pin(async move {
            if !enabled {
                let fut = service.call(req);
                let res = fut.await?;
                return Ok(res.map_into_boxed_body());
            }

            // Skip CSRF check for GET requests and OPTIONS requests
            if req.method() == Method::GET || req.method() == Method::OPTIONS {
                let fut = service.call(req);
                let res = fut.await?;
                return Ok(res.map_into_boxed_body());
            }

            // Check for CSRF token
            if let Some(token) = req.headers().get(&token_header) {
                // Validate CSRF token (simplified implementation)
                if token.to_str().unwrap_or("").is_empty() {
                    return Ok(req.into_response(
                        HttpResponse::Forbidden()
                            .json(serde_json::json!({
                                "error": "CSRF token missing or invalid",
                                "message": "CSRF protection enabled"
                            }))
                            .map_into_boxed_body()
                    ));
                }
            } else {
                return Ok(req.into_response(
                    HttpResponse::Forbidden()
                        .json(serde_json::json!({
                            "error": "CSRF token required",
                            "message": "CSRF protection enabled"
                        }))
                        .map_into_boxed_body()
                ));
            }

            let fut = service.call(req);
            let res = fut.await?;
            Ok(res.map_into_boxed_body())
        })
    }
}

// Request size limiter middleware
pub struct RequestSizeLimiter {
    max_size: usize,
    enabled: bool,
}

impl RequestSizeLimiter {
    pub fn new(max_size: usize) -> Self {
        Self {
            max_size,
            enabled: true,
        }
    }

    pub fn with_enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }
}

impl<S, B> Transform<S, ServiceRequest> for RequestSizeLimiter
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: actix_web::body::MessageBody + 'static,
{
    type Response = ServiceResponse<BoxBody>;
    type Error = Error;
    type Transform = RequestSizeLimiterService<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(RequestSizeLimiterService {
            service: Arc::new(service),
            max_size: self.max_size,
            enabled: self.enabled,
        }))
    }
}

pub struct RequestSizeLimiterService<S> {
    service: Arc<S>,
    max_size: usize,
    enabled: bool,
}

impl<S, B> Service<ServiceRequest> for RequestSizeLimiterService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: actix_web::body::MessageBody + 'static,
{
    type Response = ServiceResponse<BoxBody>;
    type Error = Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>>>>;

    fn poll_ready(&self, cx: &mut std::task::Context<'_>) -> std::task::Poll<Result<(), Self::Error>> {
        self.service.poll_ready(cx)
    }

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = Arc::clone(&self.service);
        let max_size = self.max_size;
        let enabled = self.enabled;

        Box::pin(async move {
            if !enabled {
                let fut = service.call(req);
                let res = fut.await?;
                return Ok(res.map_into_boxed_body());
            }

            // Check request size
            if let Some(content_length) = req.headers().get("content-length") {
                if let Ok(length) = content_length.to_str().unwrap_or("0").parse::<usize>() {
                    if length > max_size {
                        return Ok(req.into_response(
                            HttpResponse::PayloadTooLarge()
                                .json(serde_json::json!({
                                    "error": "Request entity too large",
                                    "maxSize": format!("{} bytes", max_size)
                                }))
                                .map_into_boxed_body()
                        ));
                    }
                }
            }

            let fut = service.call(req);
            let res = fut.await?;
            Ok(res.map_into_boxed_body())
        })
    }
} 