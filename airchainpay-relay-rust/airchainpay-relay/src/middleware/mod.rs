use actix_web::{
    dev::{Service, ServiceRequest, ServiceResponse, Transform},
    Error, HttpResponse, HttpRequest,
};
use actix_web::body::EitherBody;
use futures::future::{ready, Ready};
use std::pin::Pin;
use std::future::Future;
use std::sync::Arc;
use std::collections::HashMap;

pub mod error_handling;
pub mod input_validation;
pub mod rate_limiting;
pub mod metrics;
pub mod security;
pub mod critical_error_middleware;

// Re-export security components
pub use security::{
    SecurityConfig, SecurityMiddleware, CSRFMiddleware, RequestSizeLimiter,
    cors_config, compression_config, logging_config
};

// Re-export error handling components
pub use error_handling::{
    ErrorHandlingMiddleware, global_error_handler, ErrorResponseBuilder, error_utils
};

// Enhanced security configuration with all features
#[derive(Debug, Clone)]
pub struct EnhancedSecurityConfig {
    pub security: SecurityConfig,
    pub rate_limiting: rate_limiting::RateLimitConfig,
    pub input_validation: input_validation::ValidationConfig,
    pub metrics: metrics::MetricsConfig,
}

impl Default for EnhancedSecurityConfig {
    fn default() -> Self {
        Self {
            security: SecurityConfig::default(),
            rate_limiting: rate_limiting::RateLimitConfig::default(),
            input_validation: input_validation::ValidationConfig::default(),
            metrics: metrics::MetricsConfig::default(),
        }
    }
}

// Comprehensive security middleware that combines all security features
pub struct ComprehensiveSecurityMiddleware {
    config: EnhancedSecurityConfig,
}

impl ComprehensiveSecurityMiddleware {
    pub fn new(config: EnhancedSecurityConfig) -> Self {
        Self { config }
    }

    pub fn with_config(mut self, config: EnhancedSecurityConfig) -> Self {
        self.config = config;
        self
    }
}

impl<S, B> Transform<S, ServiceRequest> for ComprehensiveSecurityMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B, actix_web::body::BoxBody>>;
    type Error = Error;
    type Transform = ComprehensiveSecurityMiddlewareService<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(ComprehensiveSecurityMiddlewareService {
            service: Arc::new(service),
            config: self.config.clone(),
        }))
    }
}

pub struct ComprehensiveSecurityMiddlewareService<S> {
    service: Arc<S>,
    config: EnhancedSecurityConfig,
}

impl<S, B> Service<ServiceRequest> for ComprehensiveSecurityMiddlewareService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
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
        let config = self.config.clone();

        Box::pin(async move {
            // Apply comprehensive security checks
            let req = req;
            
            // 1. Request size validation
            if let Some(content_length) = req.headers().get("content-length") {
                if let Ok(length) = content_length.to_str().unwrap_or("0").parse::<usize>() {
                    if length > config.security.request_size_limit {
                        return Ok(req.into_response(
                            HttpResponse::PayloadTooLarge()
                                .json(serde_json::json!({
                                    "error": "Request entity too large",
                                    "maxSize": format!("{}MB", config.security.request_size_limit / 1024 / 1024),
                                    "timestamp": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs()
                                }))
                                .map_into_right_body()
                        ));
                    }
                }
            }

            // 2. Content type validation
            if req.method() == actix_web::http::Method::POST {
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
                                .map_into_right_body()
                        ));
                    }
                }
            }

            // 3. Suspicious activity detection
            let client_ip = req.connection_info().peer_addr().unwrap_or("unknown").to_string();
            let user_agent = req.headers().get("user-agent").map(|h| h.to_str().unwrap_or("")).unwrap_or("");
            let path = req.path().to_string();

            if Self::is_suspicious_request(&client_ip, user_agent, &path) {
                Self::log_security_event(
                    &req,
                    &config,
                    &client_ip,
                    user_agent,
                    &path,
                    "SUSPICIOUS_REQUEST",
                    None,
                    "HIGH"
                );
            }

            // 4. Input validation
            if let Err(validation_error) = Self::validate_request_input(&req, &config) {
                return Ok(req.into_response(
                    HttpResponse::BadRequest()
                        .json(serde_json::json!({
                            "error": "Input validation failed",
                            "message": validation_error,
                            "timestamp": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs()
                        }))
                        .map_into_right_body()
                ));
            }

            // Call the inner service
            let fut = service.call(req);
            let res = fut.await?;
            
            // Apply security headers to response
            let res = Self::apply_comprehensive_security_headers(res, &config);
            
            Ok(res.map_into_left_body())
        })
    }
}

impl<S> ComprehensiveSecurityMiddlewareService<S> {
    fn is_suspicious_request(ip: &str, user_agent: &str, path: &str) -> bool {
        // Enhanced suspicious pattern detection
        let suspicious_ips = vec!["127.0.0.1", "::1", "0.0.0.0", "localhost"];
        let suspicious_user_agents = vec![
            "bot", "crawler", "spider", "scraper", "curl", "wget", "python", "java",
            "nmap", "sqlmap", "nikto", "dirbuster", "gobuster"
        ];
        let suspicious_paths = vec![
            "/admin", "/config", "/debug", "/test", "/php", "/wp-admin", "/wp-login",
            "/phpmyadmin", "/mysql", "/sql", "/backup", "/.env", "/.git"
        ];

        suspicious_ips.contains(&ip) ||
        suspicious_user_agents.iter().any(|ua| user_agent.to_lowercase().contains(ua)) ||
        suspicious_paths.iter().any(|p| path.contains(p))
    }

    fn log_security_event(
        _req: &ServiceRequest,
        _config: &EnhancedSecurityConfig,
        client_ip: &str,
        user_agent: &str,
        path: &str,
        event_type: &str,
        details: Option<HashMap<String, String>>,
        severity: &str,
    ) {
        // In a real implementation, this would log to a security monitoring system
        eprintln!(
            "COMPREHENSIVE_SECURITY_EVENT: {} - IP: {} - UA: {} - Path: {} - Severity: {}",
            event_type, client_ip, user_agent, path, severity
        );

        if let Some(details) = details {
            for (key, value) in details {
                eprintln!("  {}: {}", key, value);
            }
        }
    }

    fn validate_request_input(req: &ServiceRequest, _config: &EnhancedSecurityConfig) -> Result<(), String> {
        // Validate URL parameters
        for (key, value) in req.query_string().split('&').filter_map(|pair| {
            let mut parts = pair.splitn(2, '=');
            Some((parts.next()?, parts.next()?))
        }) {
            if let Err(e) = Self::validate_input(value) {
                return Err(format!("Invalid query parameter '{}': {}", key, e));
            }
        }

        // Validate path parameters
        for segment in req.path().split('/') {
            if let Err(e) = Self::validate_input(segment) {
                return Err(format!("Invalid path segment: {}", e));
            }
        }

        Ok(())
    }

    fn validate_input(input: &str) -> Result<(), String> {
        // Check for SQL injection patterns
        let sql_patterns = [
            "SELECT", "INSERT", "UPDATE", "DELETE", "DROP", "CREATE",
            "UNION", "OR", "AND", "EXEC", "EXECUTE", "SCRIPT"
        ];

        let input_upper = input.to_uppercase();
        for pattern in &sql_patterns {
            if input_upper.contains(pattern) {
                return Err(format!("SQL injection pattern detected: {}", pattern));
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
                return Err(format!("XSS pattern detected: {}", pattern));
            }
        }

        // Check for path traversal
        if input.contains("..") || input.contains("\\") || input.contains("//") {
            return Err("Path traversal detected".to_string());
        }

        // Check for command injection
        let cmd_patterns = [";", "|", "&", "`", "$(", "&&", "||", ">", "<"];
        for pattern in &cmd_patterns {
            if input.contains(pattern) {
                return Err(format!("Command injection detected: {}", pattern));
            }
        }

        Ok(())
    }

    fn apply_comprehensive_security_headers<B>(
        mut res: ServiceResponse<B>,
        config: &EnhancedSecurityConfig,
    ) -> ServiceResponse<B> {
        let headers = res.headers_mut();

        // Content Security Policy
        if config.security.enable_content_security_policy {
            headers.insert(
                actix_web::http::header::CONTENT_SECURITY_POLICY,
                actix_web::http::header::HeaderValue::from_static("default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';")
            );
        }

        // X-Frame-Options
        if config.security.enable_frame_options {
            headers.insert(
                actix_web::http::header::X_FRAME_OPTIONS,
                actix_web::http::header::HeaderValue::from_static("DENY")
            );
        }

        // X-Content-Type-Options
        if config.security.enable_content_type_options {
            headers.insert(
                actix_web::http::header::X_CONTENT_TYPE_OPTIONS,
                actix_web::http::header::HeaderValue::from_static("nosniff")
            );
        }

        // X-XSS-Protection
        if config.security.enable_xss_protection {
            headers.insert(
                actix_web::http::header::X_XSS_PROTECTION,
                actix_web::http::header::HeaderValue::from_static("1; mode=block")
            );
        }

        // HSTS
        if config.security.enable_hsts {
            headers.insert(
                actix_web::http::header::STRICT_TRANSPORT_SECURITY,
                actix_web::http::header::HeaderValue::from_static("max-age=31536000; includeSubDomains")
            );
        }

        // Referrer Policy
        if config.security.enable_referrer_policy {
            headers.insert(
                actix_web::http::header::REFERRER_POLICY,
                actix_web::http::header::HeaderValue::from_static("strict-origin-when-cross-origin")
            );
        }

        // Permissions Policy
        if config.security.enable_permissions_policy {
            headers.insert(
                actix_web::http::header::PERMISSIONS_POLICY,
                actix_web::http::header::HeaderValue::from_static("geolocation=(), microphone=(), camera=()")
            );
        }

        // Custom security headers
        for (key, value) in &config.security.security_headers {
            if let Ok(header_name) = actix_web::http::header::HeaderName::from_lowercase(key.to_lowercase().as_bytes()) {
                if let Ok(header_value) = actix_web::http::header::HeaderValue::from_str(value) {
                    headers.insert(header_name, header_value);
                }
            }
        }

        res
    }
}

// Factory functions for different security configurations
pub fn create_production_security_config() -> EnhancedSecurityConfig {
    let mut security_config = SecurityConfig::default();
    security_config.enable_ip_whitelist = true;
    security_config.allowed_ips = vec!["10.0.0.0/8".to_string(), "172.16.0.0/12".to_string(), "192.168.0.0/16".to_string()];

    EnhancedSecurityConfig {
        security: security_config,
        rate_limiting: rate_limiting::RateLimitConfig::default(),
        input_validation: input_validation::ValidationConfig::default(),
        metrics: metrics::MetricsConfig::default(),
    }
}

pub fn create_development_security_config() -> EnhancedSecurityConfig {
    let mut security_config = SecurityConfig::default();
    security_config.enable_ip_whitelist = false;
    security_config.allowed_origins = vec!["*".to_string()];

    EnhancedSecurityConfig {
        security: security_config,
        rate_limiting: rate_limiting::RateLimitConfig::default(),
        input_validation: input_validation::ValidationConfig::default(),
        metrics: metrics::MetricsConfig::default(),
    }
}

// Legacy configuration functions for backward compatibility
pub fn legacy_cors_config() -> actix_cors::Cors {
    actix_cors::Cors::default()
        .allow_any_origin()
        .allow_any_method()
        .allow_any_header()
}

pub fn legacy_compression_config() -> actix_web::middleware::Compress {
    actix_web::middleware::Compress::default()
}

pub fn legacy_logging_config() -> actix_web::middleware::Logger {
    actix_web::middleware::Logger::default()
} 