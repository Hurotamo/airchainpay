use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use regex::Regex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub data: Option<String>,
    pub error: Option<String>,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

pub struct InputSanitizer {
    hash_regex: Regex,
    device_id_regex: Regex,
    string_regex: Regex,
}

impl Default for InputSanitizer {
    fn default() -> Self {
        Self::new()
    }
}

impl InputSanitizer {
    pub fn new() -> Self {
        Self {
            hash_regex: Regex::new(r"^0x[a-fA-F0-9]{64,}$").unwrap(),
            device_id_regex: Regex::new(r"^[a-zA-Z0-9_-]{1,50}$").unwrap(),
            string_regex: Regex::new(r"^[a-zA-Z0-9_\s-]{1,}$").unwrap(),
        }
    }

    pub fn sanitize_hash(&self, input: &str) -> ValidationResult {
        if self.hash_regex.is_match(input) {
            ValidationResult {
                valid: true,
                data: Some(input.to_string()),
                error: None,
                errors: vec![],
                warnings: vec![],
            }
        } else {
            ValidationResult {
                valid: false,
                data: None,
                error: Some("Invalid hash format".to_string()),
                errors: vec!["Invalid hash format".to_string()],
                warnings: vec![],
            }
        }
    }

    pub fn sanitize_chain_id(&self, input: &str) -> ValidationResult {
        if let Ok(chain_id) = input.parse::<u64>() {
            if chain_id > 0 {
                ValidationResult {
                    valid: true,
                    data: Some(input.to_string()),
                    error: None,
                    errors: vec![],
                    warnings: vec![],
                }
            } else {
                ValidationResult {
                    valid: false,
                    data: None,
                    error: Some("Chain ID must be greater than 0".to_string()),
                    errors: vec!["Chain ID must be greater than 0".to_string()],
                    warnings: vec![],
                }
            }
        } else {
            ValidationResult {
                valid: false,
                data: None,
                error: Some("Invalid chain ID format".to_string()),
                errors: vec!["Invalid chain ID format".to_string()],
                warnings: vec![],
            }
        }
    }

    pub fn sanitize_device_id(&self, input: &str) -> ValidationResult {
        if self.device_id_regex.is_match(input) {
            ValidationResult {
                valid: true,
                data: Some(input.to_string()),
                error: None,
                errors: vec![],
                warnings: vec![],
            }
        } else {
            ValidationResult {
                valid: false,
                data: None,
                error: Some("Invalid device ID format".to_string()),
                errors: vec!["Invalid device ID format".to_string()],
                warnings: vec![],
            }
        }
    }

    pub fn sanitize_string(&self, input: &str, max_length: Option<usize>) -> ValidationResult {
        if let Some(max_len) = max_length {
            if input.len() > max_len {
                return ValidationResult {
                    valid: false,
                    data: None,
                    error: Some(format!("String too long, max length is {max_len}")),
                    errors: vec![format!("String too long, max length is {}", max_len)],
                    warnings: vec![],
                };
            }
        }

        if self.string_regex.is_match(input) {
            ValidationResult {
                valid: true,
                data: Some(input.to_string()),
                error: None,
                errors: vec![],
                warnings: vec![],
            }
        } else {
            ValidationResult {
                valid: false,
                data: None,
                error: Some("Invalid string format".to_string()),
                errors: vec!["Invalid string format".to_string()],
                warnings: vec![],
            }
        }
    }

    pub fn validate_request<T: Serialize>(
        &self,
        _request: &T,
        _headers: &HashMap<String, String>,
        _params: &HashMap<String, String>,
    ) -> ValidationResult {
        // For now, return a successful validation
        // This can be expanded with more sophisticated validation logic
        ValidationResult {
            valid: true,
            data: Some("valid".to_string()),
            error: None,
            errors: vec![],
            warnings: vec![],
        }
    }
} 