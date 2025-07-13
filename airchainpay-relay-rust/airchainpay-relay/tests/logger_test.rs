use crate::logger::{
    EnhancedLogger, LogConfig, LogContext, LogEntry, LogFilter, LogStats, Logger
};
use std::collections::HashMap;
use chrono::{Utc, Duration};
use serde_json::Value;

#[tokio::test]
async fn test_logger_initialization() {
    let config = LogConfig {
        level: "debug".to_string(),
        service_name: "test-service".to_string(),
        version: "1.0.0".to_string(),
        enable_console: true,
        enable_file: false, // Disable file for testing
        enable_json: false, // Disable JSON for testing
        log_directory: "test_logs".to_string(),
        max_file_size: 1024 * 1024,
        max_files: 5,
        enable_rotation: true,
        enable_structured: true,
        enable_colors: false,
        enable_timestamps: true,
        enable_thread_ids: true,
        enable_file_line: true,
        enable_module_path: true,
        custom_fields: HashMap::new(),
    };

    let logger = EnhancedLogger::new(config);
    logger.init();

    // Test basic logging
    logger.info("Test info message").await;
    logger.debug("Test debug message").await;
    logger.warn("Test warning message").await;
    logger.error("Test error message").await;
    logger.trace("Test trace message").await;
}

#[tokio::test]
async fn test_structured_logging_with_context() {
    let config = LogConfig::default();
    let logger = EnhancedLogger::new(config);
    logger.init();

    let mut context = HashMap::new();
    context.insert("user_id".to_string(), Value::String("user123".to_string()));
    context.insert("request_id".to_string(), Value::String("req456".to_string()));
    context.insert("operation".to_string(), Value::String("test_operation".to_string()));

    logger.info_with_context("Structured log message", context).await;

    // Verify log entries
    let entries = logger.get_log_entries(None).await;
    assert!(!entries.is_empty());
    
    let last_entry = entries.last().unwrap();
    assert_eq!(last_entry.level, "INFO");
    assert_eq!(last_entry.message, "Structured log message");
    assert_eq!(last_entry.context.metadata.get("user_id").unwrap(), "user123");
    assert_eq!(last_entry.context.metadata.get("request_id").unwrap(), "req456");
}

#[tokio::test]
async fn test_context_management() {
    let config = LogConfig::default();
    let logger = EnhancedLogger::new(config);
    logger.init();

    // Set initial context
    let initial_context = LogContext {
        request_id: Some("req123".to_string()),
        user_id: Some("user456".to_string()),
        device_id: None,
        ip_address: Some("192.168.1.1".to_string()),
        session_id: None,
        chain_id: None,
        transaction_hash: None,
        operation: None,
        duration_ms: None,
        metadata: HashMap::new(),
    };

    logger.set_context(initial_context).await;

    // Update context
    let mut updates = HashMap::new();
    updates.insert("additional_field".to_string(), Value::String("additional_value".to_string()));
    logger.update_context(updates).await;

    // Log with context
    logger.info("Message with context").await;

    let entries = logger.get_log_entries(None).await;
    let last_entry = entries.last().unwrap();
    
    assert_eq!(last_entry.context.request_id, Some("req123".to_string()));
    assert_eq!(last_entry.context.user_id, Some("user456".to_string()));
    assert_eq!(last_entry.context.ip_address, Some("192.168.1.1".to_string()));
    assert_eq!(last_entry.context.metadata.get("additional_field").unwrap(), "additional_value");
}

#[tokio::test]
async fn test_transaction_logging() {
    let config = LogConfig::default();
    let logger = EnhancedLogger::new(config);
    logger.init();

    // Test transaction received
    logger.transaction_received("0x1234567890abcdef", 1).await;

    // Test transaction processed
    logger.transaction_processed("0x1234567890abcdef", 1, Some(12345), Some(21000)).await;

    // Test transaction failed
    logger.transaction_failed("0x1234567890abcdef", "Insufficient gas", Some(1)).await;

    let entries = logger.get_log_entries(None).await;
    assert_eq!(entries.len(), 3);

    // Verify transaction received
    let received_entry = entries.iter().find(|e| e.context.operation == Some("transaction_received".to_string())).unwrap();
    assert_eq!(received_entry.context.transaction_hash, Some("0x1234567890abcdef".to_string()));
    assert_eq!(received_entry.context.chain_id, Some(1));

    // Verify transaction processed
    let processed_entry = entries.iter().find(|e| e.context.operation == Some("transaction_processed".to_string())).unwrap();
    assert_eq!(processed_entry.context.metadata.get("block_number").unwrap(), "12345");
    assert_eq!(processed_entry.context.metadata.get("gas_used").unwrap(), "21000");

    // Verify transaction failed
    let failed_entry = entries.iter().find(|e| e.context.operation == Some("transaction_failed".to_string())).unwrap();
    assert_eq!(failed_entry.context.metadata.get("error").unwrap(), "Insufficient gas");
}

#[tokio::test]
async fn test_ble_logging() {
    let config = LogConfig::default();
    let logger = EnhancedLogger::new(config);
    logger.init();

    // Test BLE device connected
    let mut device_info = HashMap::new();
    device_info.insert("device_name".to_string(), Value::String("TestDevice".to_string()));
    device_info.insert("rssi".to_string(), Value::Number(serde_json::Number::from(-50)));
    
    logger.ble_device_connected("device123", Some(device_info)).await;

    // Test BLE device disconnected
    logger.ble_device_disconnected("device123", Some("User disconnected")).await;

    let entries = logger.get_log_entries(None).await;
    assert_eq!(entries.len(), 2);

    // Verify device connected
    let connected_entry = entries.iter().find(|e| e.context.operation == Some("ble_device_connected".to_string())).unwrap();
    assert_eq!(connected_entry.context.device_id, Some("device123".to_string()));
    assert_eq!(connected_entry.context.metadata.get("device_name").unwrap(), "TestDevice");
    assert_eq!(connected_entry.context.metadata.get("rssi").unwrap(), "-50");

    // Verify device disconnected
    let disconnected_entry = entries.iter().find(|e| e.context.operation == Some("ble_device_disconnected".to_string())).unwrap();
    assert_eq!(disconnected_entry.context.device_id, Some("device123".to_string()));
    assert_eq!(disconnected_entry.context.metadata.get("reason").unwrap(), "User disconnected");
}

#[tokio::test]
async fn test_authentication_logging() {
    let config = LogConfig::default();
    let logger = EnhancedLogger::new(config);
    logger.init();

    // Test authentication success
    logger.auth_success("device123", Some("challenge_response")).await;

    // Test authentication failure
    logger.auth_failure("device123", "Invalid challenge", Some("challenge_response")).await;

    let entries = logger.get_log_entries(None).await;
    assert_eq!(entries.len(), 2);

    // Verify auth success
    let success_entry = entries.iter().find(|e| e.context.operation == Some("auth_success".to_string())).unwrap();
    assert_eq!(success_entry.context.device_id, Some("device123".to_string()));
    assert_eq!(success_entry.context.metadata.get("auth_method").unwrap(), "challenge_response");

    // Verify auth failure
    let failure_entry = entries.iter().find(|e| e.context.operation == Some("auth_failure".to_string())).unwrap();
    assert_eq!(failure_entry.context.device_id, Some("device123".to_string()));
    assert_eq!(failure_entry.context.metadata.get("reason").unwrap(), "Invalid challenge");
    assert_eq!(failure_entry.context.metadata.get("auth_method").unwrap(), "challenge_response");
}

#[tokio::test]
async fn test_security_logging() {
    let config = LogConfig::default();
    let logger = EnhancedLogger::new(config);
    logger.init();

    // Test security violation
    let mut details = HashMap::new();
    details.insert("attempt_count".to_string(), Value::Number(serde_json::Number::from(5)));
    details.insert("blocked".to_string(), Value::Bool(true));
    
    logger.security_violation("192.168.1.100", "Rate limit exceeded", Some(details)).await;

    // Test rate limit hit
    logger.rate_limit_hit("192.168.1.100", Some("api_requests")).await;

    let entries = logger.get_log_entries(None).await;
    assert_eq!(entries.len(), 2);

    // Verify security violation
    let violation_entry = entries.iter().find(|e| e.context.operation == Some("security_violation".to_string())).unwrap();
    assert_eq!(violation_entry.context.ip_address, Some("192.168.1.100".to_string()));
    assert_eq!(violation_entry.context.metadata.get("action").unwrap(), "Rate limit exceeded");
    assert_eq!(violation_entry.context.metadata.get("attempt_count").unwrap(), "5");
    assert_eq!(violation_entry.context.metadata.get("blocked").unwrap(), "true");

    // Verify rate limit hit
    let rate_limit_entry = entries.iter().find(|e| e.context.operation == Some("rate_limit_hit".to_string())).unwrap();
    assert_eq!(rate_limit_entry.context.ip_address, Some("192.168.1.100".to_string()));
    assert_eq!(rate_limit_entry.context.metadata.get("limit_type").unwrap(), "api_requests");
}

#[tokio::test]
async fn test_system_metrics_logging() {
    let config = LogConfig::default();
    let logger = EnhancedLogger::new(config);
    logger.init();

    // Test system metric
    logger.system_metric("cpu_usage", 45.5, Some("percent")).await;
    logger.system_metric("memory_usage", 1024.0, Some("mb")).await;

    let entries = logger.get_log_entries(None).await;
    assert_eq!(entries.len(), 2);

    // Verify system metrics
    let cpu_entry = entries.iter().find(|e| e.context.metadata.get("metric_name") == Some(&Value::String("cpu_usage".to_string()))).unwrap();
    assert_eq!(cpu_entry.context.metadata.get("metric_value").unwrap(), "45.5");
    assert_eq!(cpu_entry.context.metadata.get("metric_unit").unwrap(), "percent");

    let memory_entry = entries.iter().find(|e| e.context.metadata.get("metric_name") == Some(&Value::String("memory_usage".to_string()))).unwrap();
    assert_eq!(memory_entry.context.metadata.get("metric_value").unwrap(), "1024");
    assert_eq!(memory_entry.context.metadata.get("metric_unit").unwrap(), "mb");
}

#[tokio::test]
async fn test_performance_logging() {
    let config = LogConfig::default();
    let logger = EnhancedLogger::new(config);
    logger.init();

    // Test successful performance metric
    let mut success_details = HashMap::new();
    success_details.insert("cache_hit".to_string(), Value::Bool(true));
    success_details.insert("response_size".to_string(), Value::Number(serde_json::Number::from(1024)));
    
    logger.performance_metric("database_query", 150, true, Some(success_details)).await;

    // Test failed performance metric
    let mut failure_details = HashMap::new();
    failure_details.insert("error_type".to_string(), Value::String("timeout".to_string()));
    failure_details.insert("retry_count".to_string(), Value::Number(serde_json::Number::from(3)));
    
    logger.performance_metric("external_api_call", 5000, false, Some(failure_details)).await;

    let entries = logger.get_log_entries(None).await;
    assert_eq!(entries.len(), 2);

    // Verify successful performance metric
    let success_entry = entries.iter().find(|e| e.context.metadata.get("operation") == Some(&Value::String("database_query".to_string()))).unwrap();
    assert_eq!(success_entry.context.metadata.get("duration_ms").unwrap(), "150");
    assert_eq!(success_entry.context.metadata.get("success").unwrap(), "true");
    assert_eq!(success_entry.context.metadata.get("cache_hit").unwrap(), "true");
    assert_eq!(success_entry.context.metadata.get("response_size").unwrap(), "1024");

    // Verify failed performance metric
    let failure_entry = entries.iter().find(|e| e.context.metadata.get("operation") == Some(&Value::String("external_api_call".to_string()))).unwrap();
    assert_eq!(failure_entry.context.metadata.get("duration_ms").unwrap(), "5000");
    assert_eq!(failure_entry.context.metadata.get("success").unwrap(), "false");
    assert_eq!(failure_entry.context.metadata.get("error_type").unwrap(), "timeout");
    assert_eq!(failure_entry.context.metadata.get("retry_count").unwrap(), "3");
}

#[tokio::test]
async fn test_api_request_logging() {
    let config = LogConfig::default();
    let logger = EnhancedLogger::new(config);
    logger.init();

    // Test successful API request
    logger.api_request("POST", "/api/transactions", 200, 150, Some("192.168.1.100"), Some("Mozilla/5.0")).await;

    // Test failed API request
    logger.api_request("GET", "/api/transactions", 404, 50, Some("192.168.1.101"), Some("curl/7.68.0")).await;

    let entries = logger.get_log_entries(None).await;
    assert_eq!(entries.len(), 2);

    // Verify successful API request
    let success_entry = entries.iter().find(|e| e.context.metadata.get("http_status_code") == Some(&Value::String("200".to_string()))).unwrap();
    assert_eq!(success_entry.context.metadata.get("http_method").unwrap(), "POST");
    assert_eq!(success_entry.context.metadata.get("http_path").unwrap(), "/api/transactions");
    assert_eq!(success_entry.context.metadata.get("duration_ms").unwrap(), "150");
    assert_eq!(success_entry.context.metadata.get("ip_address").unwrap(), "192.168.1.100");
    assert_eq!(success_entry.context.metadata.get("user_agent").unwrap(), "Mozilla/5.0");

    // Verify failed API request
    let failure_entry = entries.iter().find(|e| e.context.metadata.get("http_status_code") == Some(&Value::String("404".to_string()))).unwrap();
    assert_eq!(failure_entry.context.metadata.get("http_method").unwrap(), "GET");
    assert_eq!(failure_entry.context.metadata.get("http_path").unwrap(), "/api/transactions");
    assert_eq!(failure_entry.context.metadata.get("duration_ms").unwrap(), "50");
    assert_eq!(failure_entry.context.metadata.get("ip_address").unwrap(), "192.168.1.101");
    assert_eq!(failure_entry.context.metadata.get("user_agent").unwrap(), "curl/7.68.0");
}

#[tokio::test]
async fn test_database_operation_logging() {
    let config = LogConfig::default();
    let logger = EnhancedLogger::new(config);
    logger.init();

    // Test successful database operation
    logger.database_operation("SELECT", "transactions", 25, true, None).await;

    // Test failed database operation
    logger.database_operation("INSERT", "transactions", 100, false, Some("Connection timeout")).await;

    let entries = logger.get_log_entries(None).await;
    assert_eq!(entries.len(), 2);

    // Verify successful database operation
    let success_entry = entries.iter().find(|e| e.context.metadata.get("db_operation") == Some(&Value::String("SELECT".to_string()))).unwrap();
    assert_eq!(success_entry.context.metadata.get("db_table").unwrap(), "transactions");
    assert_eq!(success_entry.context.metadata.get("duration_ms").unwrap(), "25");
    assert_eq!(success_entry.context.metadata.get("success").unwrap(), "true");

    // Verify failed database operation
    let failure_entry = entries.iter().find(|e| e.context.metadata.get("db_operation") == Some(&Value::String("INSERT".to_string()))).unwrap();
    assert_eq!(failure_entry.context.metadata.get("db_table").unwrap(), "transactions");
    assert_eq!(failure_entry.context.metadata.get("duration_ms").unwrap(), "100");
    assert_eq!(failure_entry.context.metadata.get("success").unwrap(), "false");
    assert_eq!(failure_entry.context.metadata.get("error").unwrap(), "Connection timeout");
}

#[tokio::test]
async fn test_log_filtering() {
    let config = LogConfig::default();
    let logger = EnhancedLogger::new(config);
    logger.init();

    // Add some test entries
    logger.transaction_received("0x123", 1).await;
    logger.transaction_received("0x456", 2).await;
    logger.ble_device_connected("device1", None).await;
    logger.ble_device_connected("device2", None).await;

    // Test filtering by operation
    let filter = LogFilter {
        level: None,
        operation: Some("transaction_received".to_string()),
        device_id: None,
        transaction_hash: None,
        start_time: None,
        end_time: None,
        limit: None,
    };

    let filtered_entries = logger.get_log_entries(Some(filter)).await;
    assert_eq!(filtered_entries.len(), 2);

    // Test filtering by device ID
    let filter = LogFilter {
        level: None,
        operation: Some("ble_device_connected".to_string()),
        device_id: Some("device1".to_string()),
        transaction_hash: None,
        start_time: None,
        end_time: None,
        limit: None,
    };

    let filtered_entries = logger.get_log_entries(Some(filter)).await;
    assert_eq!(filtered_entries.len(), 1);
    assert_eq!(filtered_entries[0].context.device_id, Some("device1".to_string()));

    // Test filtering by time range
    let now = Utc::now();
    let filter = LogFilter {
        level: None,
        operation: None,
        device_id: None,
        transaction_hash: None,
        start_time: Some(now - Duration::minutes(1)),
        end_time: Some(now + Duration::minutes(1)),
        limit: None,
    };

    let filtered_entries = logger.get_log_entries(Some(filter)).await;
    assert_eq!(filtered_entries.len(), 4); // All entries should be within the time range
}

#[tokio::test]
async fn test_log_statistics() {
    let config = LogConfig::default();
    let logger = EnhancedLogger::new(config);
    logger.init();

    // Add test entries
    logger.info("Test message 1").await;
    logger.warn("Test message 2").await;
    logger.error("Test message 3").await;
    logger.transaction_received("0x123", 1).await;
    logger.ble_device_connected("device1", None).await;

    let stats = logger.get_log_stats().await;

    assert_eq!(stats.total_entries, 5);
    assert_eq!(stats.entries_by_level.get("INFO").unwrap(), &2); // info + transaction_received
    assert_eq!(stats.entries_by_level.get("WARN").unwrap(), &1);
    assert_eq!(stats.entries_by_level.get("ERROR").unwrap(), &1);
    assert_eq!(stats.entries_by_level.get("DEBUG").unwrap(), &1); // ble_device_connected

    assert_eq!(stats.entries_by_operation.get("transaction_received").unwrap(), &1);
    assert_eq!(stats.entries_by_operation.get("ble_device_connected").unwrap(), &1);

    assert!(stats.average_message_length > 0.0);
    assert!(stats.oldest_entry.is_some());
    assert!(stats.newest_entry.is_some());
}

#[tokio::test]
async fn test_log_entry_structure() {
    let config = LogConfig::default();
    let logger = EnhancedLogger::new(config);
    logger.init();

    logger.info("Test message").await;

    let entries = logger.get_log_entries(None).await;
    let entry = &entries[0];

    // Verify log entry structure
    assert!(!entry.id.is_empty());
    assert_eq!(entry.level, "INFO");
    assert_eq!(entry.message, "Test message");
    assert_eq!(entry.service, "airchainpay-relay");
    assert!(!entry.version.is_empty());
    assert!(!entry.hostname.is_empty());
    assert!(entry.pid > 0);
    assert!(!entry.thread_id.is_empty());
    assert_eq!(entry.target, "airchainpay_relay");
}

#[tokio::test]
async fn test_legacy_logger_compatibility() {
    // Test legacy logger initialization
    Logger::init("info");

    // Test legacy logging methods
    Logger::info("Legacy info message");
    Logger::warn("Legacy warning message");
    Logger::error("Legacy error message");
    Logger::debug("Legacy debug message");

    // Test legacy transaction logging
    Logger::transaction_received("0x123", 1);
    Logger::transaction_processed("0x123", 1);
    Logger::transaction_failed("0x123", "Test error");

    // Test legacy BLE logging
    Logger::ble_device_connected("device1");
    Logger::ble_device_disconnected("device1");

    // Test legacy auth logging
    Logger::auth_success("device1");
    Logger::auth_failure("device1", "Test failure");

    // Test legacy security logging
    Logger::security_violation("192.168.1.1", "Test violation");
    Logger::rate_limit_hit("192.168.1.1");

    // Test legacy system metric logging
    Logger::system_metric("test_metric", 42.5);
}

#[tokio::test]
async fn test_log_rotation_and_cleanup() {
    let config = LogConfig {
        enable_file: true,
        log_directory: "test_logs_rotation".to_string(),
        max_file_size: 1024, // Small size for testing
        max_files: 3,
        enable_rotation: true,
        ..LogConfig::default()
    };

    let logger = EnhancedLogger::new(config);
    logger.init();

    // Add many entries to trigger rotation
    for i in 0..100 {
        logger.info(&format!("Test message {}", i)).await;
    }

    // Verify entries are stored
    let entries = logger.get_log_entries(None).await;
    assert_eq!(entries.len(), 100);

    // Test clearing log entries
    logger.clear_log_entries().await;
    let entries = logger.get_log_entries(None).await;
    assert_eq!(entries.len(), 0);
}

#[tokio::test]
async fn test_concurrent_logging() {
    let config = LogConfig::default();
    let logger = std::sync::Arc::new(EnhancedLogger::new(config));
    logger.init();

    // Test concurrent logging from multiple tasks
    let mut handles = Vec::new();
    
    for i in 0..10 {
        let logger_clone = std::sync::Arc::clone(&logger);
        let handle = tokio::spawn(async move {
            for j in 0..10 {
                logger_clone.info(&format!("Concurrent message {} from task {}", j, i)).await;
            }
        });
        handles.push(handle);
    }

    // Wait for all tasks to complete
    for handle in handles {
        handle.await.unwrap();
    }

    // Verify all entries were logged
    let entries = logger.get_log_entries(None).await;
    assert_eq!(entries.len(), 100); // 10 tasks * 10 messages each
}

#[tokio::test]
async fn test_log_context_persistence() {
    let config = LogConfig::default();
    let logger = EnhancedLogger::new(config);
    logger.init();

    // Set context
    let context = LogContext {
        request_id: Some("req123".to_string()),
        user_id: Some("user456".to_string()),
        device_id: Some("device789".to_string()),
        ip_address: Some("192.168.1.100".to_string()),
        session_id: Some("session123".to_string()),
        chain_id: Some(1),
        transaction_hash: Some("0x1234567890abcdef".to_string()),
        operation: Some("test_operation".to_string()),
        duration_ms: Some(150),
        metadata: {
            let mut map = HashMap::new();
            map.insert("custom_field".to_string(), Value::String("custom_value".to_string()));
            map
        },
    };

    logger.set_context(context).await;

    // Log multiple messages
    logger.info("Message 1").await;
    logger.warn("Message 2").await;
    logger.error("Message 3").await;

    // Verify context is preserved across all entries
    let entries = logger.get_log_entries(None).await;
    assert_eq!(entries.len(), 3);

    for entry in entries {
        assert_eq!(entry.context.request_id, Some("req123".to_string()));
        assert_eq!(entry.context.user_id, Some("user456".to_string()));
        assert_eq!(entry.context.device_id, Some("device789".to_string()));
        assert_eq!(entry.context.ip_address, Some("192.168.1.100".to_string()));
        assert_eq!(entry.context.session_id, Some("session123".to_string()));
        assert_eq!(entry.context.chain_id, Some(1));
        assert_eq!(entry.context.transaction_hash, Some("0x1234567890abcdef".to_string()));
        assert_eq!(entry.context.operation, Some("test_operation".to_string()));
        assert_eq!(entry.context.duration_ms, Some(150));
        assert_eq!(entry.context.metadata.get("custom_field").unwrap(), "custom_value");
    }
} 