use anyhow::{Result, anyhow};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use lazy_static::lazy_static;

lazy_static! {
    static ref ETH_ADDRESS_REGEX: Regex = Regex::new(r"^0x[a-fA-F0-9]{40}$").unwrap();
    static ref TX_HASH_REGEX: Regex = Regex::new(r"^0x[a-fA-F0-9]{64}$").unwrap();
    static ref DEVICE_ID_REGEX: Regex = Regex::new(r"^[a-zA-Z0-9\-_]+$").unwrap();
    static ref SQL_KEYWORDS: Vec<&'static str> = vec![
        "SELECT", "INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER",
        "UNION", "EXEC", "EXECUTE", "SCRIPT", "--", "/*", "*/", ";",
    ];
    static ref XSS_PATTERNS: Vec<&'static str> = vec![
        "<script", "javascript:", "onload=", "onerror=", "onclick=",
        "eval(", "document.cookie", "window.location", "innerHTML",
    ];
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SanitizationResult<T> {
    pub data: Option<T>,
    pub sanitized: bool,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub sanitized_data: Option<serde_json::Value>,
}

#[derive(Clone)]
pub struct InputSanitizer {
    max_string_length: usize,
    max_array_length: usize,
    max_object_keys: usize,
}

impl InputSanitizer {
    pub fn new() -> Self {
        Self {
            max_string_length: 1000,
            max_array_length: 100,
            max_object_keys: 50,
        }
    }

    /// Sanitize string inputs
    pub fn sanitize_string(&self, input: &str, max_length: Option<usize>) -> SanitizationResult<String> {
        let max_len = max_length.unwrap_or(self.max_string_length);
        
        if input.is_empty() {
            return SanitizationResult {
                data: None,
                sanitized: false,
                warnings: vec!["Input is empty".to_string()],
                errors: vec!["String cannot be empty".to_string()],
            };
        }

        // Remove null bytes and control characters
        let sanitized_string: String = input.chars()
            .filter(|&c| c != '\0' && !c.is_control())
            .take(max_len)
            .collect();

        let was_sanitized = sanitized_string != input;
        
        SanitizationResult {
            data: Some(sanitized_string),
            sanitized: was_sanitized,
            warnings: if was_sanitized { vec!["String was sanitized".to_string()] } else { vec![] },
            errors: vec![],
        }
    }

    /// Sanitize Ethereum addresses
    pub fn sanitize_address(&self, input: &str) -> SanitizationResult<String> {
        let clean = input.trim().to_lowercase();
        
        if ETH_ADDRESS_REGEX.is_match(&clean) {
            SanitizationResult {
                data: Some(clean),
                sanitized: false,
                warnings: vec![],
                errors: vec![],
            }
        } else {
            SanitizationResult {
                data: None,
                sanitized: false,
                warnings: vec![],
                errors: vec!["Invalid Ethereum address format".to_string()],
            }
        }
    }

    /// Sanitize transaction hashes
    pub fn sanitize_hash(&self, input: &str) -> SanitizationResult<String> {
        let clean = input.trim();
        
        if TX_HASH_REGEX.is_match(clean) {
            SanitizationResult {
                data: Some(clean.to_string()),
                sanitized: false,
                warnings: vec![],
                errors: vec![],
            }
        } else {
            SanitizationResult {
                data: None,
                sanitized: false,
                warnings: vec![],
                errors: vec!["Invalid transaction hash format".to_string()],
            }
        }
    }

    /// Sanitize chain IDs
    pub fn sanitize_chain_id(&self, input: &str) -> SanitizationResult<u64> {
        match input.trim().parse::<u64>() {
            Ok(chain_id) if chain_id > 0 && chain_id <= 999999 => {
                SanitizationResult {
                    data: Some(chain_id),
                    sanitized: false,
                    warnings: vec![],
                    errors: vec![],
                }
            }
            _ => SanitizationResult {
                data: None,
                sanitized: false,
                warnings: vec![],
                errors: vec!["Invalid chain ID (must be 1-999999)".to_string()],
            },
        }
    }

    /// Sanitize device IDs
    pub fn sanitize_device_id(&self, input: &str) -> SanitizationResult<String> {
        let clean = input.trim();
        
        if clean.is_empty() {
            return SanitizationResult {
                data: None,
                sanitized: false,
                warnings: vec![],
                errors: vec!["Device ID cannot be empty".to_string()],
            };
        }

        // Remove invalid characters and limit length
        let sanitized_string: String = clean
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
            .take(100)
            .collect();

        let was_sanitized = sanitized_string != clean;
        
        SanitizationResult {
            data: Some(sanitized_string),
            sanitized: was_sanitized,
            warnings: if was_sanitized { vec!["Device ID was sanitized".to_string()] } else { vec![] },
            errors: vec![],
        }
    }

    /// Sanitize JSON objects
    pub fn sanitize_object(&self, input: &serde_json::Value, allowed_keys: &[String]) -> SanitizationResult<serde_json::Value> {
        if let serde_json::Value::Object(obj) = input {
            let mut sanitized = serde_json::Map::new();
            let mut sanitized_count = 0;

            for key in allowed_keys {
                if let Some(value) = obj.get(key) {
                    sanitized.insert(key.clone(), value.clone());
                    sanitized_count += 1;
                }
            }

            if sanitized_count > self.max_object_keys {
                return SanitizationResult {
                    data: None,
                    sanitized: false,
                    warnings: vec![],
                    errors: vec![format!("Too many object keys (max: {})", self.max_object_keys)],
                };
            }

            SanitizationResult {
                data: Some(serde_json::Value::Object(sanitized)),
                sanitized: sanitized_count != obj.len(),
                warnings: if sanitized_count != obj.len() { 
                    vec!["Object was sanitized - some keys removed".to_string()] 
                } else { 
                    vec![] 
                },
                errors: vec![],
            }
        } else {
            SanitizationResult {
                data: None,
                sanitized: false,
                warnings: vec![],
                errors: vec!["Input is not a valid JSON object".to_string()],
            }
        }
    }

    /// Sanitize arrays
    pub fn sanitize_array(&self, input: &serde_json::Value, max_length: Option<usize>) -> SanitizationResult<serde_json::Value> {
        if let serde_json::Value::Array(arr) = input {
            let max_len = max_length.unwrap_or(self.max_array_length);
            let sanitized_array = arr.iter().take(max_len).cloned().collect::<Vec<_>>();
            
            let sanitized = sanitized_array.len() != arr.len();
            
            SanitizationResult {
                data: Some(serde_json::Value::Array(sanitized_array)),
                sanitized,
                warnings: if sanitized { 
                    vec!["Array was truncated".to_string()] 
                } else { 
                    vec![] 
                },
                errors: vec![],
            }
        } else {
            SanitizationResult {
                data: None,
                sanitized: false,
                warnings: vec![],
                errors: vec!["Input is not a valid JSON array".to_string()],
            }
        }
    }

    /// Sanitize numbers
    pub fn sanitize_number(&self, input: &str, min: Option<i64>, max: Option<i64>) -> SanitizationResult<i64> {
        match input.trim().parse::<i64>() {
            Ok(num) => {
                let min_val = min.unwrap_or(i64::MIN);
                let max_val = max.unwrap_or(i64::MAX);
                
                if num >= min_val && num <= max_val {
                    SanitizationResult {
                        data: Some(num),
                        sanitized: false,
                        warnings: vec![],
                        errors: vec![],
                    }
                } else {
                    SanitizationResult {
                        data: None,
                        sanitized: false,
                        warnings: vec![],
                        errors: vec![format!("Number out of range (must be {}-{})", min_val, max_val)],
                    }
                }
            }
            _ => SanitizationResult {
                data: None,
                sanitized: false,
                warnings: vec![],
                errors: vec!["Invalid number format".to_string()],
            },
        }
    }

    /// Sanitize boolean values
    pub fn sanitize_boolean(&self, input: &str) -> SanitizationResult<bool> {
        let lower = input.trim().to_lowercase();
        
        match lower.as_str() {
            "true" | "1" | "yes" | "on" => SanitizationResult {
                data: Some(true),
                sanitized: false,
                warnings: vec![],
                errors: vec![],
            },
            "false" | "0" | "no" | "off" => SanitizationResult {
                data: Some(false),
                sanitized: false,
                warnings: vec![],
                errors: vec![],
            },
            _ => SanitizationResult {
                data: None,
                sanitized: false,
                warnings: vec![],
                errors: vec!["Invalid boolean value".to_string()],
            },
        }
    }

    /// Check for SQL injection attempts
    pub fn check_sql_injection(&self, input: &str) -> bool {
        let upper = input.to_uppercase();
        
        for keyword in SQL_KEYWORDS.iter() {
            if upper.contains(keyword) {
                return true;
            }
        }
        
        false
    }

    /// Check for XSS attempts
    pub fn check_xss(&self, input: &str) -> bool {
        let lower = input.to_lowercase();
        
        for pattern in XSS_PATTERNS.iter() {
            if lower.contains(pattern) {
                return true;
            }
        }
        
        false
    }

    /// Comprehensive sanitization of request data
    pub fn sanitize_request_data(&self, data: &serde_json::Value) -> Result<serde_json::Value> {
        match data {
            serde_json::Value::String(s) => {
                let result = self.sanitize_string(s, None);
                if let Some(sanitized) = result.data {
                    if result.sanitized || self.check_sql_injection(&sanitized) || self.check_xss(&sanitized) {
                        return Err(anyhow!("Input contains potentially dangerous content"));
                    }
                    Ok(serde_json::Value::String(sanitized))
                } else {
                    Err(anyhow!("Failed to sanitize string"))
                }
            }
            serde_json::Value::Object(obj) => {
                let mut sanitized_obj = serde_json::Map::new();
                
                for (key, value) in obj {
                    let sanitized_key = self.sanitize_string(key, Some(50)).data.unwrap_or_default();
                    let sanitized_value = self.sanitize_request_data(value)?;
                    sanitized_obj.insert(sanitized_key, sanitized_value);
                }
                
                Ok(serde_json::Value::Object(sanitized_obj))
            }
            serde_json::Value::Array(arr) => {
                let mut sanitized_arr = Vec::new();
                
                for item in arr {
                    let sanitized_item = self.sanitize_request_data(item)?;
                    sanitized_arr.push(sanitized_item);
                }
                
                Ok(serde_json::Value::Array(sanitized_arr))
            }
            _ => Ok(data.clone()),
        }
    }

    /// Validate and sanitize a complete request
    pub fn validate_request(&self, 
        body: &serde_json::Value, 
        params: &HashMap<String, String>, 
        query: &HashMap<String, String>
    ) -> ValidationResult {
        let mut result = ValidationResult {
            valid: true,
            errors: Vec::new(),
            warnings: Vec::new(),
            sanitized_data: None,
        };

        // Check for SQL injection in all inputs
        for (key, value) in params {
            if self.check_sql_injection(value) {
                result.valid = false;
                result.errors.push(format!("SQL injection detected in param: {}", key));
            }
        }

        for (key, value) in query {
            if self.check_sql_injection(value) {
                result.valid = false;
                result.errors.push(format!("SQL injection detected in query: {}", key));
            }
        }

        // Check for XSS in all inputs
        for (key, value) in params {
            if self.check_xss(value) {
                result.valid = false;
                result.errors.push(format!("XSS detected in param: {}", key));
            }
        }

        for (key, value) in query {
            if self.check_xss(value) {
                result.valid = false;
                result.errors.push(format!("XSS detected in query: {}", key));
            }
        }

        // Sanitize body data
        match self.sanitize_request_data(body) {
            Ok(sanitized) => {
                result.sanitized_data = Some(sanitized);
            }
            Err(e) => {
                result.valid = false;
                result.errors.push(format!("Body sanitization failed: {}", e));
            }
        }

        result
    }

    /// Set maximum string length
    pub fn set_max_string_length(&mut self, length: usize) {
        self.max_string_length = length;
    }

    /// Set maximum array length
    pub fn set_max_array_length(&mut self, length: usize) {
        self.max_array_length = length;
    }

    /// Set maximum object keys
    pub fn set_max_object_keys(&mut self, keys: usize) {
        self.max_object_keys = keys;
    }
}

impl Default for InputSanitizer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_sanitize_string() {
        let sanitizer = InputSanitizer::new();
        
        // Test normal string
        let result = sanitizer.sanitize_string("hello world", None);
        assert!(result.data.is_some());
        assert!(!result.sanitized);
        assert!(result.errors.is_empty());

        // Test string with HTML tags
        let result = sanitizer.sanitize_string("hello<script>alert('xss')</script>world", None);
        assert!(result.data.is_some());
        assert!(result.sanitized);
        assert_eq!(result.data.unwrap(), "helloalert('xss')world");

        // Test empty string
        let result = sanitizer.sanitize_string("", None);
        assert!(result.data.is_none());
        assert!(!result.errors.is_empty());
    }

    #[test]
    fn test_sanitize_address() {
        let sanitizer = InputSanitizer::new();
        
        // Test valid address
        let result = sanitizer.sanitize_address("0x1234567890123456789012345678901234567890");
        assert!(result.data.is_some());
        assert!(result.errors.is_empty());

        // Test invalid address
        let result = sanitizer.sanitize_address("invalid");
        assert!(result.data.is_none());
        assert!(!result.errors.is_empty());
    }

    #[test]
    fn test_sanitize_hash() {
        let sanitizer = InputSanitizer::new();
        
        // Test valid hash
        let result = sanitizer.sanitize_hash("0x1234567890123456789012345678901234567890123456789012345678901234");
        assert!(result.data.is_some());
        assert!(result.errors.is_empty());

        // Test invalid hash
        let result = sanitizer.sanitize_hash("invalid");
        assert!(result.data.is_none());
        assert!(!result.errors.is_empty());
    }

    #[test]
    fn test_sanitize_chain_id() {
        let sanitizer = InputSanitizer::new();
        
        // Test valid chain ID
        let result = sanitizer.sanitize_chain_id("1");
        assert!(result.data.is_some());
        assert_eq!(result.data.unwrap(), 1);

        // Test invalid chain ID
        let result = sanitizer.sanitize_chain_id("999999999");
        assert!(result.data.is_none());
    }

    #[test]
    fn test_sanitize_device_id() {
        let sanitizer = InputSanitizer::new();
        
        // Test valid device ID
        let result = sanitizer.sanitize_device_id("device-123");
        assert!(result.data.is_some());
        assert!(result.errors.is_empty());

        // Test device ID with invalid characters
        let result = sanitizer.sanitize_device_id("device@123");
        assert!(result.data.is_some());
        assert!(result.sanitized);
    }

    #[test]
    fn test_check_sql_injection() {
        let sanitizer = InputSanitizer::new();
        
        assert!(sanitizer.check_sql_injection("SELECT * FROM users"));
        assert!(sanitizer.check_sql_injection("DROP TABLE users"));
        assert!(!sanitizer.check_sql_injection("normal text"));
    }

    #[test]
    fn test_check_xss() {
        let sanitizer = InputSanitizer::new();
        
        assert!(sanitizer.check_xss("<script>alert('xss')</script>"));
        assert!(sanitizer.check_xss("javascript:alert('xss')"));
        assert!(!sanitizer.check_xss("normal text"));
    }

    #[test]
    fn test_validate_request() {
        let sanitizer = InputSanitizer::new();
        
        let body = json!({"name": "test"});
        let params = HashMap::new();
        let query = HashMap::new();
        
        let result = sanitizer.validate_request(&body, &params, &query);
        assert!(result.valid);
        assert!(result.sanitized_data.is_some());
    }
} 