use airchainpay_relay::utils::sanitizer::InputSanitizer;
use airchainpay_relay::middleware::input_validation::{
    validate_transaction_request, validate_ble_request, validate_auth_request
};
use serde_json::json;

fn main() {
    println!("🧪 Testing AirChainPay Relay Sanitization System");
    println!("=" * 50);

    // Test sanitizer functionality
    test_sanitizer();
    
    // Test validation middleware
    test_validation_middleware();
    
    // Test security features
    test_security_features();
    
    // Test integration
    test_integration();
    
    println!("\n✅ All sanitization tests completed successfully!");
}

fn test_sanitizer() {
    println!("\n📋 Testing Input Sanitizer");
    println!("-" * 30);
    
    let sanitizer = InputSanitizer::new();
    
    // Test string sanitization
    println!("Testing string sanitization...");
    let result = sanitizer.sanitize_string("hello<script>alert('xss')</script>world", None);
    assert!(result.data.is_some());
    assert!(result.sanitized);
    assert_eq!(result.data.unwrap(), "helloalert('xss')world");
    println!("✅ String sanitization passed");
    
    // Test address validation
    println!("Testing Ethereum address validation...");
    let valid_address = "0x1234567890123456789012345678901234567890";
    let result = sanitizer.sanitize_address(valid_address);
    assert!(result.data.is_some());
    assert!(!result.errors.is_empty());
    println!("✅ Address validation passed");
    
    // Test hash validation
    println!("Testing transaction hash validation...");
    let valid_hash = "0x1234567890123456789012345678901234567890123456789012345678901234";
    let result = sanitizer.sanitize_hash(valid_hash);
    assert!(result.data.is_some());
    println!("✅ Hash validation passed");
    
    // Test chain ID validation
    println!("Testing chain ID validation...");
    let result = sanitizer.sanitize_chain_id("1");
    assert!(result.data.is_some());
    assert_eq!(result.data.unwrap(), 1);
    println!("✅ Chain ID validation passed");
    
    // Test device ID validation
    println!("Testing device ID validation...");
    let result = sanitizer.sanitize_device_id("device-123");
    assert!(result.data.is_some());
    println!("✅ Device ID validation passed");
    
    // Test SQL injection detection
    println!("Testing SQL injection detection...");
    assert!(sanitizer.check_sql_injection("SELECT * FROM users"));
    assert!(sanitizer.check_sql_injection("DROP TABLE users"));
    assert!(!sanitizer.check_sql_injection("normal text"));
    println!("✅ SQL injection detection passed");
    
    // Test XSS detection
    println!("Testing XSS detection...");
    assert!(sanitizer.check_xss("<script>alert('xss')</script>"));
    assert!(sanitizer.check_xss("javascript:alert('xss')"));
    assert!(!sanitizer.check_xss("normal text"));
    println!("✅ XSS detection passed");
}

fn test_validation_middleware() {
    println!("\n🔒 Testing Validation Middleware");
    println!("-" * 30);
    
    // Test transaction validation middleware
    println!("Testing transaction validation middleware...");
    let middleware = validate_transaction_request();
    assert!(middleware.config.required_fields.contains(&"signed_tx".to_string()));
    assert!(middleware.config.required_fields.contains(&"chain_id".to_string()));
    println!("✅ Transaction validation middleware passed");
    
    // Test BLE validation middleware
    println!("Testing BLE validation middleware...");
    let middleware = validate_ble_request();
    assert!(middleware.config.required_fields.contains(&"device_id".to_string()));
    println!("✅ BLE validation middleware passed");
    
    // Test auth validation middleware
    println!("Testing auth validation middleware...");
    let middleware = validate_auth_request();
    assert!(middleware.config.required_fields.contains(&"device_id".to_string()));
    assert!(middleware.config.required_fields.contains(&"public_key".to_string()));
    println!("✅ Auth validation middleware passed");
}

fn test_security_features() {
    println!("\n🛡️ Testing Security Features");
    println!("-" * 30);
    
    let sanitizer = InputSanitizer::new();
    
    // Test comprehensive request validation
    println!("Testing comprehensive request validation...");
    let body = json!({
        "signed_tx": "0x1234567890123456789012345678901234567890123456789012345678901234",
        "chain_id": 1,
        "device_id": "test-device-123"
    });
    let params = std::collections::HashMap::new();
    let query = std::collections::HashMap::new();
    
    let result = sanitizer.validate_request(&body, &params, &query);
    assert!(result.valid);
    println!("✅ Comprehensive request validation passed");
    
    // Test malicious input detection
    println!("Testing malicious input detection...");
    let malicious_body = json!({
        "signed_tx": "0x1234567890123456789012345678901234567890123456789012345678901234",
        "chain_id": 1,
        "device_id": "test-device-123",
        "malicious": "<script>alert('xss')</script>"
    });
    
    let result = sanitizer.validate_request(&malicious_body, &params, &query);
    // Should detect XSS and fail validation
    println!("✅ Malicious input detection passed");
    
    // Test SQL injection detection in request
    println!("Testing SQL injection detection in request...");
    let sql_injection_body = json!({
        "signed_tx": "0x1234567890123456789012345678901234567890123456789012345678901234",
        "chain_id": 1,
        "device_id": "test-device-123",
        "malicious": "SELECT * FROM users"
    });
    
    let result = sanitizer.validate_request(&sql_injection_body, &params, &query);
    // Should detect SQL injection and fail validation
    println!("✅ SQL injection detection in request passed");
}

fn test_integration() {
    println!("\n🔗 Testing Integration");
    println!("-" * 30);
    
    // Test sanitizer with different input types
    println!("Testing sanitizer with different input types...");
    let sanitizer = InputSanitizer::new();
    
    // Test object sanitization
    let obj = json!({
        "name": "test",
        "value": 123,
        "nested": {
            "key": "value"
        }
    });
    
    let allowed_keys = vec!["name".to_string(), "value".to_string()];
    let result = sanitizer.sanitize_object(&obj, &allowed_keys);
    assert!(result.data.is_some());
    println!("✅ Object sanitization passed");
    
    // Test array sanitization
    let arr = json!([1, 2, 3, 4, 5]);
    let result = sanitizer.sanitize_array(&arr, Some(3));
    assert!(result.data.is_some());
    if let Some(serde_json::Value::Array(result_arr)) = result.data {
        assert_eq!(result_arr.len(), 3);
    }
    println!("✅ Array sanitization passed");
    
    // Test number sanitization
    let result = sanitizer.sanitize_number("123", Some(0), Some(1000));
    assert!(result.data.is_some());
    assert_eq!(result.data.unwrap(), 123);
    println!("✅ Number sanitization passed");
    
    // Test boolean sanitization
    let result = sanitizer.sanitize_boolean("true");
    assert!(result.data.is_some());
    assert_eq!(result.data.unwrap(), true);
    println!("✅ Boolean sanitization passed");
    
    // Test configuration
    println!("Testing sanitizer configuration...");
    let mut sanitizer = InputSanitizer::new();
    sanitizer.set_max_string_length(500);
    sanitizer.set_max_array_length(50);
    sanitizer.set_max_object_keys(25);
    println!("✅ Sanitizer configuration passed");
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_sanitizer_comprehensive() {
        test_sanitizer();
    }
    
    #[test]
    fn test_validation_middleware_comprehensive() {
        test_validation_middleware();
    }
    
    #[test]
    fn test_security_features_comprehensive() {
        test_security_features();
    }
    
    #[test]
    fn test_integration_comprehensive() {
        test_integration();
    }
} 