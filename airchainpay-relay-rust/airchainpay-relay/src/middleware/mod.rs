#![allow(dead_code, unused_variables)]
use actix_web::{
    dev::{Service, ServiceRequest, ServiceResponse, Transform},
    Error, HttpResponse,
};
use futures::future::{ready, Ready};
use std::sync::Arc;
use std::collections::HashMap;
use crate::middleware::metrics::MetricsCollector;
use crate::infrastructure::monitoring::manager::MonitoringManager;
use std::marker::PhantomData;
use futures_util::future::LocalBoxFuture;
use futures::task::{Context, Poll};

pub mod error_handling;
pub mod input_validation;
pub mod rate_limiting;
pub mod metrics;
pub mod security;
pub mod critical_error_middleware;

// Re-export security components
pub use security::SecurityConfig;

// Re-export error handling components

// Re-export critical error middleware

// Enhanced security configuration with all features
#[derive(Debug, Clone)]
pub struct EnhancedSecurityConfig {
    pub security: SecurityConfig,
    pub rate_limiting: rate_limiting::RateLimitConfig,
    pub input_validation: input_validation::ValidationConfig,
    pub metrics: MetricsCollector,
}

impl Default for EnhancedSecurityConfig {
    fn default() -> Self {
        Self {
            security: SecurityConfig::default(),
            rate_limiting: rate_limiting::RateLimitConfig::default(),
            input_validation: input_validation::ValidationConfig::default(),
            metrics: MetricsCollector::new(Arc::new(MonitoringManager::new())),
        }
    }
}

// Comprehensive security middleware that combines all security features
#[derive(Clone)]
pub struct ComprehensiveSecurityMiddleware {
    config: EnhancedSecurityConfig,
}

pub struct ComprehensiveSecurityService<S, B> {
    service: Arc<S>,
    config: EnhancedSecurityConfig,
    _phantom: PhantomData<B>,
}

impl ComprehensiveSecurityMiddleware {
    pub fn new(config: EnhancedSecurityConfig) -> Self {
        Self { config }
    }
}

impl<S, B> Transform<S, ServiceRequest> for ComprehensiveSecurityMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: actix_web::body::MessageBody + 'static,
{
    type Response = ServiceResponse<actix_web::body::BoxBody>;
    type Error = Error;
    type Transform = ComprehensiveSecurityService<S, B>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(ComprehensiveSecurityService {
            service: Arc::new(service),
            config: self.config.clone(),
            _phantom: PhantomData,
        }))
    }
}

impl<S, B> Service<ServiceRequest> for ComprehensiveSecurityService<S, B>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: actix_web::body::MessageBody + 'static,
{
    type Response = ServiceResponse<actix_web::body::BoxBody>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    fn poll_ready(&self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
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
                                .map_into_boxed_body()
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
                                .map_into_boxed_body()
                        ));
                    }
                }
            }

            // 3. Suspicious activity detection
            let client_ip = req.connection_info().peer_addr().unwrap_or("unknown").to_string();
            let user_agent = req.headers().get("user-agent").map(|h| h.to_str().unwrap_or("")).unwrap_or("");
            let path = req.path().to_string();

            if is_suspicious_request(&client_ip, user_agent, &path) {
                log_security_event(
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
            if let Err(validation_error) = validate_request_input(&req, &config) {
                return Ok(req.into_response(
                    HttpResponse::BadRequest()
                        .json(serde_json::json!({
                            "error": "Input validation failed",
                            "message": validation_error,
                            "timestamp": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs()
                        }))
                        .map_into_boxed_body()
                ));
            }

            // Call the inner service
            let fut = service.call(req);
            let res = fut.await?;
            
            // Apply security headers to response
            let res = apply_comprehensive_security_headers(res, &config);
            
            Ok(res.map_into_boxed_body())
        })
    }
}

fn is_suspicious_request(ip: &str, user_agent: &str, path: &str) -> bool {
    // Enhanced suspicious pattern detection
    let suspicious_ips = ["127.0.0.1", "::1", "0.0.0.0", "localhost"];
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
        "COMPREHENSIVE_SECURITY_EVENT: {event_type} - IP: {client_ip} - UA: {user_agent} - Path: {path} - Severity: {severity}"
    );

    if let Some(details) = details {
        for (key, value) in details {
            eprintln!("  {key}: {value}");
        }
    }
}

fn validate_request_input(req: &ServiceRequest, _config: &EnhancedSecurityConfig) -> Result<(), String> {
    // Validate URL parameters
    for (key, value) in req.query_string().split('&').filter_map(|pair| {
        let mut parts = pair.splitn(2, '=');
        Some((parts.next()?, parts.next()?))
    }) {
        if let Err(e) = validate_input(value) {
            return Err(format!("Invalid query parameter '{key}': {e}"));
        }
    }

    // Validate path parameters
    for segment in req.path().split('/') {
        if let Err(e) = validate_input(segment) {
            return Err(format!("Invalid path segment: {e}"));
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

    // Check for path traversal
    if input.contains("..") || input.contains("\\") || input.contains("//") {
        return Err("Path traversal detected".to_string());
    }

    // Check for command injection
    let cmd_patterns = [";", "|", "&", "`", "$", "&&", "||", ">", "<"];

    let input_lower = input.to_lowercase();
    for pattern in &cmd_patterns {
        if input_lower.contains(pattern) {
            return Err(format!("Command injection pattern detected: {pattern}"));
        }
    }

    Ok(())
}

fn apply_comprehensive_security_headers<B>(res: ServiceResponse<B>, _config: &EnhancedSecurityConfig) -> ServiceResponse<B>
where
    B: actix_web::body::MessageBody + 'static,
{
    let mut res = res;
    res.headers_mut().insert(
        actix_web::http::header::CONTENT_SECURITY_POLICY,
        actix_web::http::header::HeaderValue::from_static("default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; sandbox allow-scripts allow-forms allow-same-origin; report-uri /csp-report-endpoint"),
    );
    res.headers_mut().insert(
        actix_web::http::header::X_CONTENT_TYPE_OPTIONS,
        actix_web::http::header::HeaderValue::from_static("nosniff"),
    );
    res.headers_mut().insert(
        actix_web::http::header::X_FRAME_OPTIONS,
        actix_web::http::header::HeaderValue::from_static("DENY"),
    );
    res.headers_mut().insert(
        actix_web::http::header::X_XSS_PROTECTION,
        actix_web::http::header::HeaderValue::from_static("1; mode=block"),
    );
    res
}