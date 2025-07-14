#![allow(dead_code, unused_variables)]
use actix_web::{
    dev::{Service, ServiceRequest, ServiceResponse, Transform},
    Error, HttpResponse,
};
use futures::future::{ready, Ready};
use std::pin::Pin;
use std::future::Future;
use std::sync::Arc;
use regex::Regex;
use lazy_static::lazy_static;
use actix_web::body::BoxBody;

lazy_static! {
    static ref SQL_INJECTION_PATTERNS: Vec<Regex> = vec![
        Regex::new(r"(?i)SELECT.*FROM").unwrap(),
        Regex::new(r"(?i)INSERT.*INTO").unwrap(),
        Regex::new(r"(?i)UPDATE.*SET").unwrap(),
        Regex::new(r"(?i)DELETE.*FROM").unwrap(),
        Regex::new(r"(?i)DROP.*TABLE").unwrap(),
        Regex::new(r"(?i)CREATE.*TABLE").unwrap(),
        Regex::new(r"(?i)UNION.*SELECT").unwrap(),
        Regex::new(r"(?i)EXEC.*\(").unwrap(),
        Regex::new(r"(?i)EXECUTE.*\(").unwrap(),
    ];

    static ref XSS_PATTERNS: Vec<Regex> = vec![
        Regex::new(r"(?i)<script").unwrap(),
        Regex::new(r"(?i)javascript:").unwrap(),
        Regex::new(r"(?i)vbscript:").unwrap(),
        Regex::new(r"(?i)onload\s*=").unwrap(),
        Regex::new(r"(?i)onerror\s*=").unwrap(),
        Regex::new(r"(?i)onclick\s*=").unwrap(),
        Regex::new(r"(?i)onmouseover\s*=").unwrap(),
        Regex::new(r"(?i)eval\s*\(").unwrap(),
        Regex::new(r"(?i)alert\s*\(").unwrap(),
    ];

    static ref COMMAND_INJECTION_PATTERNS: Vec<Regex> = vec![
        Regex::new(r"[;&|`$()]").unwrap(),
        Regex::new(r"&&").unwrap(),
        Regex::new(r"\|\|").unwrap(),
        Regex::new(r">\s*\w+").unwrap(),
        Regex::new(r"<\s*\w+").unwrap(),
    ];

    static ref PATH_TRAVERSAL_PATTERNS: Vec<Regex> = vec![
        Regex::new(r"\.\.").unwrap(),
        Regex::new(r"\.\.").unwrap(),
        Regex::new(r"\\").unwrap(),
        Regex::new(r"//").unwrap(),
    ];
}

#[derive(Debug, Clone)]
pub struct ValidationConfig {
    pub max_input_length: usize,
    pub allowed_content_types: Vec<String>,
    pub blocked_patterns: Vec<String>,
    pub enable_sql_injection_check: bool,
    pub enable_xss_check: bool,
    pub enable_command_injection_check: bool,
    pub enable_path_traversal_check: bool,
}

impl Default for ValidationConfig {
    fn default() -> Self {
        Self {
            max_input_length: 10000,
            allowed_content_types: vec!["application/json".to_string(), "application/x-www-form-urlencoded".to_string()],
            blocked_patterns: vec!["<script>".to_string(), "javascript:".to_string()],
            enable_sql_injection_check: true,
            enable_xss_check: true,
            enable_command_injection_check: true,
            enable_path_traversal_check: true,
        }
    }
}

#[derive(Clone)]
pub struct InputValidationMiddleware {
    config: ValidationConfig,
}

impl InputValidationMiddleware {
    pub fn new(config: ValidationConfig) -> Self {
        Self { config }
    }

    pub fn with_config(mut self, config: ValidationConfig) -> Self {
        self.config = config;
        self
    }
}

impl<S, B> Transform<S, ServiceRequest> for InputValidationMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + Clone + 'static,
    S::Future: 'static,
    B: 'static + actix_web::body::MessageBody,
{
    type Response = ServiceResponse<BoxBody>;
    type Error = Error;
    type Transform = InputValidationMiddlewareService<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(InputValidationMiddlewareService {
            service: Arc::new(service),
            config: self.config.clone(),
        }))
    }
}

#[derive(Clone)]
pub struct InputValidationMiddlewareService<S> {
    service: Arc<S>,
    config: ValidationConfig,
}

impl<S, B> Service<ServiceRequest> for InputValidationMiddlewareService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + Clone + 'static,
    S::Future: 'static,
    B: 'static + actix_web::body::MessageBody,
{
    type Response = ServiceResponse<BoxBody>;
    type Error = Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>>>>;

    fn poll_ready(&self, cx: &mut std::task::Context<'_>) -> std::task::Poll<Result<(), Self::Error>> {
        self.service.poll_ready(cx)
    }

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = Arc::clone(&self.service);
        let config = self.config.clone();

        Box::pin(async move {
            // Validate content type
            if let Some(content_type) = req.headers().get("content-type") {
                let content_type_str = content_type.to_str().unwrap_or("");
                if !config.allowed_content_types.iter().any(|ct| content_type_str.contains(ct)) {
                    return Ok(req.into_response(
                        HttpResponse::BadRequest()
                            .json(serde_json::json!({
                                "error": "Invalid content type",
                                "message": "Content type not allowed"
                            }))
                            .map_into_boxed_body()
                    ));
                }
            }

            // Validate request body length
            if let Some(content_length) = req.headers().get("content-length") {
                if let Ok(length) = content_length.to_str().unwrap_or("0").parse::<usize>() {
                    if length > config.max_input_length {
                        return Ok(req.into_response(
                            HttpResponse::BadRequest()
                                .json(serde_json::json!({
                                    "error": "Request too large",
                                    "message": format!("Request body exceeds maximum size of {} bytes", config.max_input_length)
                                }))
                                .map_into_boxed_body()
                        ));
                    }
                }
            }

            // Validate URL parameters
            for (_key, value) in req.query_string().split('&').filter_map(|pair| {
                let mut parts = pair.splitn(2, '=');
                Some((parts.next()?, parts.next()?))
            }) {
                if let Err(e) = validate_input(value, &config) {
                    return Ok(req.into_response(
                        HttpResponse::BadRequest()
                            .json(serde_json::json!({
                                "error": "Invalid input",
                                "message": e
                            }))
                            .map_into_boxed_body()
                    ));
                }
            }

            // Validate path parameters
            for segment in req.path().split('/') {
                if let Err(e) = validate_input(segment, &config) {
                    return Ok(req.into_response(
                        HttpResponse::BadRequest()
                            .json(serde_json::json!({
                                "error": "Invalid path",
                                "message": e
                            }))
                            .map_into_boxed_body()
                    ));
                }
            }

            // Call the inner service
            let fut = service.call(req);
            let res = fut.await?;
            Ok(res.map_into_boxed_body())
        })
    }
}

fn validate_input(input: &str, config: &ValidationConfig) -> Result<(), String> {
    // Check for SQL injection
    if config.enable_sql_injection_check {
        for pattern in &*SQL_INJECTION_PATTERNS {
            if pattern.is_match(input) {
                return Err(format!("SQL injection detected: {}", pattern.as_str()));
            }
        }
    }

    // Check for XSS
    if config.enable_xss_check {
        for pattern in &*XSS_PATTERNS {
            if pattern.is_match(input) {
                return Err(format!("XSS attack detected: {}", pattern.as_str()));
            }
        }
    }

    // Check for command injection
    if config.enable_command_injection_check {
        for pattern in &*COMMAND_INJECTION_PATTERNS {
            if pattern.is_match(input) {
                return Err(format!("Command injection detected: {}", pattern.as_str()));
            }
        }
    }

    // Check for path traversal
    if config.enable_path_traversal_check {
        for pattern in &*PATH_TRAVERSAL_PATTERNS {
            if pattern.is_match(input) {
                return Err(format!("Path traversal detected: {}", pattern.as_str()));
            }
        }
    }

    // Check for blocked patterns
    for pattern in &config.blocked_patterns {
        if input.contains(pattern) {
            return Err(format!("Blocked pattern detected: {pattern}"));
        }
    }

    Ok(())
}

pub fn sanitize_input(input: &str) -> String {
    // HTML entity encoding
    input
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&#x27;")
        .replace("/", "&#x2F;")
        .replace("\\", "&#x5C;")
}

pub fn validate_json_input(json_str: &str, config: &ValidationConfig) -> Result<(), String> {
    // Parse JSON and validate each value
    match serde_json::from_str::<serde_json::Value>(json_str) {
        Ok(value) => validate_json_value(&value, config),
        Err(e) => Err(format!("Invalid JSON: {e}")),
    }
}

fn validate_json_value(value: &serde_json::Value, config: &ValidationConfig) -> Result<(), String> {
    match value {
        serde_json::Value::String(s) => validate_input(s, config),
        serde_json::Value::Object(obj) => {
            for (_, v) in obj {
                validate_json_value(v, config)?;
            }
            Ok(())
        }
        serde_json::Value::Array(arr) => {
            for v in arr {
                validate_json_value(v, config)?;
            }
            Ok(())
        }
        _ => Ok(()),
    }
} 