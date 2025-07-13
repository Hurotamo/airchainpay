use std::collections::HashMap;
use std::time::{Duration, Instant};
use tokio::sync::mpsc;
use crate::{
    security::SecurityManager,
    middleware::{
        input_validation::InputValidator,
        ip_whitelist::IPWhitelist,
        rate_limiting::RateLimiter,
    },
    logger::Logger,
};

pub async fn test_security_manager_initialization() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match SecurityManager::new() {
        Ok(manager) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Security Manager Initialization".to_string(),
                passed: true,
                error: None,
                duration_ms: duration,
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Security Manager Initialization".to_string(),
                passed: false,
                error: Some(format!("Failed to initialize security manager: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_input_validation() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    let validator = InputValidator::new();
    
    // Test valid inputs
    let valid_inputs = vec![
        ("transaction", "0x123456789abcdef"),
        ("address", "0x1234567890123456789012345678901234567890"),
        ("amount", "1000000000000000000"),
        ("chain_id", "1"),
    ];
    
    let mut all_valid = true;
    for (input_type, value) in valid_inputs {
        if !validator.validate_input(input_type, value) {
            all_valid = false;
            break;
        }
    }
    
    // Test invalid inputs
    let invalid_inputs = vec![
        ("transaction", "invalid_tx"),
        ("address", "invalid_address"),
        ("amount", "-100"),
        ("chain_id", "999999"),
    ];
    
    let mut all_invalid = true;
    for (input_type, value) in invalid_inputs {
        if validator.validate_input(input_type, value) {
            all_invalid = false;
            break;
        }
    }
    
    let duration = start_time.elapsed().as_millis() as u64;
    crate::tests::TestResult {
        test_name: "Input Validation".to_string(),
        passed: all_valid && all_invalid,
        error: if all_valid && all_invalid { 
            None 
        } else { 
            Some("Input validation test failed".to_string()) 
        },
        duration_ms: duration,
    }
}

pub async fn test_sql_injection_protection() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    let validator = InputValidator::new();
    
    // Test SQL injection attempts
    let sql_injection_attempts = vec![
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "'; INSERT INTO users VALUES ('hacker', 'password'); --",
        "'; UPDATE users SET password='hacked'; --",
        "'; DELETE FROM transactions; --",
    ];
    
    let mut all_blocked = true;
    for attempt in sql_injection_attempts {
        if validator.validate_input("transaction", attempt) {
            all_blocked = false;
            break;
        }
    }
    
    let duration = start_time.elapsed().as_millis() as u64;
    crate::tests::TestResult {
        test_name: "SQL Injection Protection".to_string(),
        passed: all_blocked,
        error: if all_blocked { 
            None 
        } else { 
            Some("SQL injection protection failed".to_string()) 
        },
        duration_ms: duration,
    }
}

pub async fn test_xss_protection() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    let validator = InputValidator::new();
    
    // Test XSS attempts
    let xss_attempts = vec![
        "<script>alert('xss')</script>",
        "javascript:alert('xss')",
        "<img src=x onerror=alert('xss')>",
        "';alert('xss');//",
        "<iframe src='javascript:alert(\"xss\")'></iframe>",
    ];
    
    let mut all_blocked = true;
    for attempt in xss_attempts {
        if validator.validate_input("transaction", attempt) {
            all_blocked = false;
            break;
        }
    }
    
    let duration = start_time.elapsed().as_millis() as u64;
    crate::tests::TestResult {
        test_name: "XSS Protection".to_string(),
        passed: all_blocked,
        error: if all_blocked { 
            None 
        } else { 
            Some("XSS protection failed".to_string()) 
        },
        duration_ms: duration,
    }
}

pub async fn test_rate_limiting() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    let rate_limiter = RateLimiter::new(10, Duration::from_secs(60)); // 10 requests per minute
    
    // Test rate limiting
    let mut allowed_requests = 0;
    for _ in 0..15 {
        if rate_limiter.check_rate_limit("test_ip").await {
            allowed_requests += 1;
        }
    }
    
    let duration = start_time.elapsed().as_millis() as u64;
    crate::tests::TestResult {
        test_name: "Rate Limiting".to_string(),
        passed: allowed_requests <= 10,
        error: if allowed_requests <= 10 { 
            None 
        } else { 
            Some(format!("Rate limiting failed: {} requests allowed, expected <= 10", allowed_requests)) 
        },
        duration_ms: duration,
    }
}

pub async fn test_ip_whitelist() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    let mut whitelist = IPWhitelist::new();
    whitelist.add_ip("192.168.1.100");
    whitelist.add_ip("10.0.0.50");
    
    // Test whitelisted IPs
    let whitelisted_ips = vec!["192.168.1.100", "10.0.0.50"];
    let mut all_whitelisted = true;
    for ip in whitelisted_ips {
        if !whitelist.is_allowed(ip) {
            all_whitelisted = false;
            break;
        }
    }
    
    // Test non-whitelisted IPs
    let non_whitelisted_ips = vec!["192.168.1.101", "10.0.0.51", "8.8.8.8"];
    let mut all_blocked = true;
    for ip in non_whitelisted_ips {
        if whitelist.is_allowed(ip) {
            all_blocked = false;
            break;
        }
    }
    
    let duration = start_time.elapsed().as_millis() as u64;
    crate::tests::TestResult {
        test_name: "IP Whitelist".to_string(),
        passed: all_whitelisted && all_blocked,
        error: if all_whitelisted && all_blocked { 
            None 
        } else { 
            Some("IP whitelist test failed".to_string()) 
        },
        duration_ms: duration,
    }
}

pub async fn test_authentication() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match SecurityManager::new() {
        Ok(manager) => {
            // Test authentication with valid credentials
            let valid_credentials = "valid_api_key";
            let auth_result = manager.authenticate(valid_credentials).await;
            
            // Test authentication with invalid credentials
            let invalid_credentials = "invalid_api_key";
            let invalid_auth_result = manager.authenticate(invalid_credentials).await;
            
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Authentication".to_string(),
                passed: auth_result.is_ok() && invalid_auth_result.is_err(),
                error: if auth_result.is_ok() && invalid_auth_result.is_err() { 
                    None 
                } else { 
                    Some("Authentication test failed".to_string()) 
                },
                duration_ms: duration,
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Authentication".to_string(),
                passed: false,
                error: Some(format!("Failed to create security manager: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_audit_logging() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match SecurityManager::new() {
        Ok(manager) => {
            // Test audit logging
            let audit_event = "test_security_event";
            let audit_result = manager.log_security_event(audit_event, "test_ip").await;
            
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Audit Logging".to_string(),
                passed: audit_result.is_ok(),
                error: if audit_result.is_ok() { 
                    None 
                } else { 
                    Some("Audit logging failed".to_string()) 
                },
                duration_ms: duration,
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Audit Logging".to_string(),
                passed: false,
                error: Some(format!("Failed to create security manager: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_encryption() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match SecurityManager::new() {
        Ok(manager) => {
            // Test data encryption
            let test_data = "sensitive_data";
            match manager.encrypt_data(test_data).await {
                Ok(encrypted_data) => {
                    // Test data decryption
                    match manager.decrypt_data(&encrypted_data).await {
                        Ok(decrypted_data) => {
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "Encryption".to_string(),
                                passed: decrypted_data == test_data,
                                error: if decrypted_data == test_data { 
                                    None 
                                } else { 
                                    Some("Encryption/decryption failed".to_string()) 
                                },
                                duration_ms: duration,
                            }
                        }
                        Err(e) => {
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "Encryption".to_string(),
                                passed: false,
                                error: Some(format!("Failed to decrypt data: {}", e)),
                                duration_ms: duration,
                            }
                        }
                    }
                }
                Err(e) => {
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "Encryption".to_string(),
                        passed: false,
                        error: Some(format!("Failed to encrypt data: {}", e)),
                        duration_ms: duration,
                    }
                }
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Encryption".to_string(),
                passed: false,
                error: Some(format!("Failed to create security manager: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_device_blocking() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match SecurityManager::new() {
        Ok(manager) => {
            // Test device blocking
            let device_id = "test_device_123";
            
            // Block device
            match manager.block_device(device_id).await {
                Ok(_) => {
                    // Check if device is blocked
                    match manager.is_device_blocked(device_id).await {
                        Ok(is_blocked) => {
                            // Unblock device
                            match manager.unblock_device(device_id).await {
                                Ok(_) => {
                                    // Check if device is unblocked
                                    match manager.is_device_blocked(device_id).await {
                                        Ok(is_blocked_after) => {
                                            let duration = start_time.elapsed().as_millis() as u64;
                                            crate::tests::TestResult {
                                                test_name: "Device Blocking".to_string(),
                                                passed: is_blocked && !is_blocked_after,
                                                error: if is_blocked && !is_blocked_after { 
                                                    None 
                                                } else { 
                                                    Some("Device blocking test failed".to_string()) 
                                                },
                                                duration_ms: duration,
                                            }
                                        }
                                        Err(e) => {
                                            let duration = start_time.elapsed().as_millis() as u64;
                                            crate::tests::TestResult {
                                                test_name: "Device Blocking".to_string(),
                                                passed: false,
                                                error: Some(format!("Failed to check device status after unblock: {}", e)),
                                                duration_ms: duration,
                                            }
                                        }
                                    }
                                }
                                Err(e) => {
                                    let duration = start_time.elapsed().as_millis() as u64;
                                    crate::tests::TestResult {
                                        test_name: "Device Blocking".to_string(),
                                        passed: false,
                                        error: Some(format!("Failed to unblock device: {}", e)),
                                        duration_ms: duration,
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "Device Blocking".to_string(),
                                passed: false,
                                error: Some(format!("Failed to check device status: {}", e)),
                                duration_ms: duration,
                            }
                        }
                    }
                }
                Err(e) => {
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "Device Blocking".to_string(),
                        passed: false,
                        error: Some(format!("Failed to block device: {}", e)),
                        duration_ms: duration,
                    }
                }
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Device Blocking".to_string(),
                passed: false,
                error: Some(format!("Failed to create security manager: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn run_all_security_tests() -> Vec<crate::tests::TestResult> {
    let mut results = Vec::new();
    
    Logger::info("Running security unit tests");
    
    results.push(test_security_manager_initialization().await);
    results.push(test_input_validation().await);
    results.push(test_sql_injection_protection().await);
    results.push(test_xss_protection().await);
    results.push(test_rate_limiting().await);
    results.push(test_ip_whitelist().await);
    results.push(test_authentication().await);
    results.push(test_audit_logging().await);
    results.push(test_encryption().await);
    results.push(test_device_blocking().await);
    
    results
} 