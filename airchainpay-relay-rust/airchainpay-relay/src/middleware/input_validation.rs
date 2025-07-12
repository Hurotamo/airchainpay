use actix_web::{
    dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform},
    Error, HttpMessage, HttpResponse,
};
use futures_util::future::{ready, LocalBoxFuture, Ready};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::rc::Rc;
use crate::utils::sanitizer::{InputSanitizer, ValidationResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationConfig {
    pub required_fields: Vec<String>,
    pub field_types: HashMap<String, String>,
    pub field_lengths: HashMap<String, usize>,
    pub address_fields: Vec<String>,
    pub hash_fields: Vec<String>,
    pub chain_id_fields: Vec<String>,
    pub device_id_fields: Vec<String>,
}

impl Default for ValidationConfig {
    fn default() -> Self {
        Self {
            required_fields: vec![],
            field_types: HashMap::new(),
            field_lengths: HashMap::new(),
            address_fields: vec![],
            hash_fields: vec![],
            chain_id_fields: vec![],
            device_id_fields: vec![],
        }
    }
}

pub struct InputValidationMiddleware {
    config: ValidationConfig,
    sanitizer: InputSanitizer,
}

impl InputValidationMiddleware {
    pub fn new(config: ValidationConfig) -> Self {
        Self {
            config,
            sanitizer: InputSanitizer::new(),
        }
    }

    pub fn with_required_fields(mut self, fields: Vec<String>) -> Self {
        self.config.required_fields = fields;
        self
    }

    pub fn with_field_types(mut self, types: HashMap<String, String>) -> Self {
        self.config.field_types = types;
        self
    }

    pub fn with_field_lengths(mut self, lengths: HashMap<String, usize>) -> Self {
        self.config.field_lengths = lengths;
        self
    }

    pub fn with_address_fields(mut self, fields: Vec<String>) -> Self {
        self.config.address_fields = fields;
        self
    }

    pub fn with_hash_fields(mut self, fields: Vec<String>) -> Self {
        self.config.hash_fields = fields;
        self
    }

    pub fn with_chain_id_fields(mut self, fields: Vec<String>) -> Self {
        self.config.chain_id_fields = fields;
        self
    }

    pub fn with_device_id_fields(mut self, fields: Vec<String>) -> Self {
        self.config.device_id_fields = fields;
        self
    }
}

impl<S, B> Transform<S, ServiceRequest> for InputValidationMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = InputValidationService<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(InputValidationService {
            service: Rc::new(service),
            config: self.config.clone(),
            sanitizer: self.sanitizer.clone(),
        }))
    }
}

pub struct InputValidationService<S> {
    service: Rc<S>,
    config: ValidationConfig,
    sanitizer: InputSanitizer,
}

impl<S, B> Service<ServiceRequest> for InputValidationService<S>
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
        let service = Rc::clone(&self.service);
        let config = self.config.clone();
        let sanitizer = self.sanitizer.clone();

        Box::pin(async move {
            // Extract request data
            let body = req.app_data::<serde_json::Value>().cloned()
                .unwrap_or_else(|| serde_json::Value::Null);
            let params = req.match_info().pairs()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect::<HashMap<String, String>>();
            let query = req.query_string()
                .split('&')
                .filter_map(|pair| {
                    let mut parts = pair.split('=');
                    Some((parts.next()?.to_string(), parts.next()?.to_string()))
                })
                .collect::<HashMap<String, String>>();

            // Validate request
            let validation_result = validate_request(&sanitizer, &config, &body, &params, &query);

            if !validation_result.valid {
                let error_response = HttpResponse::BadRequest().json(serde_json::json!({
                    "error": "Input validation failed",
                    "errors": validation_result.errors,
                    "warnings": validation_result.warnings,
                    "timestamp": chrono::Utc::now().to_rfc3339(),
                }));

                return Ok(req.into_response(error_response.map_into_right_body()));
            }

            // If validation passed, continue with the request
            let fut = service.call(req);
            fut.await
        })
    }
}

fn validate_request(
    sanitizer: &InputSanitizer,
    config: &ValidationConfig,
    body: &serde_json::Value,
    params: &HashMap<String, String>,
    query: &HashMap<String, String>,
) -> ValidationResult {
    let mut result = ValidationResult {
        valid: true,
        errors: Vec::new(),
        warnings: Vec::new(),
        sanitized_data: None,
    };

    // Check required fields
    for field in &config.required_fields {
        let has_field = body.get(field).is_some() 
            || params.contains_key(field) 
            || query.contains_key(field);
        
        if !has_field {
            result.valid = false;
            result.errors.push(format!("Missing required field: {}", field));
        }
    }

    // Validate field types
    for (field, field_type) in &config.field_types {
        let value = body.get(field)
            .or_else(|| params.get(field).map(|v| serde_json::Value::String(v.clone())))
            .or_else(|| query.get(field).map(|v| serde_json::Value::String(v.clone())));

        if let Some(value) = value {
            let validation_result = match field_type.as_str() {
                "string" => {
                    if let Some(s) = value.as_str() {
                        let sanitize_result = sanitizer.sanitize_string(s, None);
                        if sanitize_result.data.is_some() {
                            Ok(())
                        } else {
                            Err(sanitize_result.errors.join(", "))
                        }
                    } else {
                        Err("Field is not a string".to_string())
                    }
                }
                "address" => {
                    if let Some(s) = value.as_str() {
                        let sanitize_result = sanitizer.sanitize_address(s);
                        if sanitize_result.data.is_some() {
                            Ok(())
                        } else {
                            Err(sanitize_result.errors.join(", "))
                        }
                    } else {
                        Err("Field is not a string".to_string())
                    }
                }
                "hash" => {
                    if let Some(s) = value.as_str() {
                        let sanitize_result = sanitizer.sanitize_hash(s);
                        if sanitize_result.data.is_some() {
                            Ok(())
                        } else {
                            Err(sanitize_result.errors.join(", "))
                        }
                    } else {
                        Err("Field is not a string".to_string())
                    }
                }
                "chain_id" => {
                    if let Some(s) = value.as_str() {
                        let sanitize_result = sanitizer.sanitize_chain_id(s);
                        if sanitize_result.data.is_some() {
                            Ok(())
                        } else {
                            Err(sanitize_result.errors.join(", "))
                        }
                    } else {
                        Err("Field is not a string".to_string())
                    }
                }
                "device_id" => {
                    if let Some(s) = value.as_str() {
                        let sanitize_result = sanitizer.sanitize_device_id(s);
                        if sanitize_result.data.is_some() {
                            Ok(())
                        } else {
                            Err(sanitize_result.errors.join(", "))
                        }
                    } else {
                        Err("Field is not a string".to_string())
                    }
                }
                "number" => {
                    if let Some(s) = value.as_str() {
                        let sanitize_result = sanitizer.sanitize_number(s, None, None);
                        if sanitize_result.data.is_some() {
                            Ok(())
                        } else {
                            Err(sanitize_result.errors.join(", "))
                        }
                    } else if value.is_number() {
                        Ok(())
                    } else {
                        Err("Field is not a number".to_string())
                    }
                }
                "boolean" => {
                    if let Some(s) = value.as_str() {
                        let sanitize_result = sanitizer.sanitize_boolean(s);
                        if sanitize_result.data.is_some() {
                            Ok(())
                        } else {
                            Err(sanitize_result.errors.join(", "))
                        }
                    } else if value.is_boolean() {
                        Ok(())
                    } else {
                        Err("Field is not a boolean".to_string())
                    }
                }
                _ => Ok(()),
            };

            if let Err(e) = validation_result {
                result.valid = false;
                result.errors.push(format!("Invalid type for field {}: {}", field, e));
            }
        }
    }

    // Validate field lengths
    for (field, max_length) in &config.field_lengths {
        if let Some(value) = body.get(field).and_then(|v| v.as_str()) {
            if value.len() > *max_length {
                result.valid = false;
                result.errors.push(format!("Field {} too long (max: {})", field, max_length));
            }
        }
    }

    // Validate Ethereum addresses
    for field in &config.address_fields {
        if let Some(value) = body.get(field).and_then(|v| v.as_str()) {
            let sanitize_result = sanitizer.sanitize_address(value);
            if sanitize_result.data.is_none() {
                result.valid = false;
                result.errors.push(format!("Invalid Ethereum address: {}", field));
            }
        }
    }

    // Validate transaction hashes
    for field in &config.hash_fields {
        if let Some(value) = body.get(field).and_then(|v| v.as_str()) {
            let sanitize_result = sanitizer.sanitize_hash(value);
            if sanitize_result.data.is_none() {
                result.valid = false;
                result.errors.push(format!("Invalid transaction hash: {}", field));
            }
        }
    }

    // Validate chain IDs
    for field in &config.chain_id_fields {
        if let Some(value) = body.get(field).and_then(|v| v.as_str()) {
            let sanitize_result = sanitizer.sanitize_chain_id(value);
            if sanitize_result.data.is_none() {
                result.valid = false;
                result.errors.push(format!("Invalid chain ID: {}", field));
            }
        }
    }

    // Validate device IDs
    for field in &config.device_id_fields {
        if let Some(value) = body.get(field).and_then(|v| v.as_str()) {
            let sanitize_result = sanitizer.sanitize_device_id(value);
            if sanitize_result.data.is_none() {
                result.valid = false;
                result.errors.push(format!("Invalid device ID: {}", field));
            }
        }
    }

    // Check for SQL injection and XSS
    let request_validation = sanitizer.validate_request(body, params, query);
    if !request_validation.valid {
        result.valid = false;
        result.errors.extend(request_validation.errors);
    }
    result.warnings.extend(request_validation.warnings);

    result
}

// Helper functions for common validation patterns

pub fn validate_transaction_request() -> InputValidationMiddleware {
    InputValidationMiddleware::new(ValidationConfig::default())
        .with_required_fields(vec!["signed_tx".to_string(), "chain_id".to_string()])
        .with_field_types({
            let mut types = HashMap::new();
            types.insert("signed_tx".to_string(), "hash".to_string());
            types.insert("chain_id".to_string(), "chain_id".to_string());
            types.insert("device_id".to_string(), "device_id".to_string());
            types
        })
        .with_hash_fields(vec!["signed_tx".to_string()])
        .with_chain_id_fields(vec!["chain_id".to_string()])
        .with_device_id_fields(vec!["device_id".to_string()])
}

pub fn validate_ble_request() -> InputValidationMiddleware {
    InputValidationMiddleware::new(ValidationConfig::default())
        .with_required_fields(vec!["device_id".to_string()])
        .with_field_types({
            let mut types = HashMap::new();
            types.insert("device_id".to_string(), "device_id".to_string());
            types
        })
        .with_device_id_fields(vec!["device_id".to_string()])
}

pub fn validate_auth_request() -> InputValidationMiddleware {
    InputValidationMiddleware::new(ValidationConfig::default())
        .with_required_fields(vec!["device_id".to_string(), "public_key".to_string()])
        .with_field_types({
            let mut types = HashMap::new();
            types.insert("device_id".to_string(), "device_id".to_string());
            types.insert("public_key".to_string(), "string".to_string());
            types
        })
        .with_device_id_fields(vec!["device_id".to_string()])
}

pub fn validate_compressed_payload_request() -> InputValidationMiddleware {
    InputValidationMiddleware::new(ValidationConfig::default())
        .with_required_fields(vec!["compressed_data".to_string(), "payload_type".to_string(), "chain_id".to_string()])
        .with_field_types({
            let mut types = HashMap::new();
            types.insert("compressed_data".to_string(), "string".to_string());
            types.insert("payload_type".to_string(), "string".to_string());
            types.insert("chain_id".to_string(), "chain_id".to_string());
            types.insert("device_id".to_string(), "device_id".to_string());
            types
        })
        .with_chain_id_fields(vec!["chain_id".to_string()])
        .with_device_id_fields(vec!["device_id".to_string()])
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::test;
    use serde_json::json;

    #[test]
    fn test_validation_config_default() {
        let config = ValidationConfig::default();
        assert!(config.required_fields.is_empty());
        assert!(config.field_types.is_empty());
    }

    #[test]
    fn test_input_validation_middleware_builder() {
        let middleware = InputValidationMiddleware::new(ValidationConfig::default())
            .with_required_fields(vec!["test".to_string()])
            .with_field_types({
                let mut types = HashMap::new();
                types.insert("test".to_string(), "string".to_string());
                types
            });

        assert_eq!(middleware.config.required_fields.len(), 1);
        assert_eq!(middleware.config.field_types.len(), 1);
    }

    #[test]
    fn test_validate_transaction_request() {
        let middleware = validate_transaction_request();
        assert!(middleware.config.required_fields.contains(&"signed_tx".to_string()));
        assert!(middleware.config.required_fields.contains(&"chain_id".to_string()));
    }

    #[test]
    fn test_validate_ble_request() {
        let middleware = validate_ble_request();
        assert!(middleware.config.required_fields.contains(&"device_id".to_string()));
    }

    #[test]
    fn test_validate_auth_request() {
        let middleware = validate_auth_request();
        assert!(middleware.config.required_fields.contains(&"device_id".to_string()));
        assert!(middleware.config.required_fields.contains(&"public_key".to_string()));
    }
} 