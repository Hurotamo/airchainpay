use actix_web::{test, web, App, HttpResponse};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use crate::utils::critical_error_handler::{
    CriticalErrorHandler, CriticalPath, CriticalError, CriticalErrorSeverity, CriticalErrorType
};

#[actix_web::test]
async fn test_critical_error_handler_creation() {
    let handler = CriticalErrorHandler::new();
    assert!(handler.get_all_errors().await.is_empty());
    assert!(handler.get_all_metrics().await.is_empty());
}

#[actix_web::test]
async fn test_critical_operation_success() {
    let handler = CriticalErrorHandler::new();
    let mut context = HashMap::new();
    context.insert("test".to_string(), "success".to_string());

    let result = handler.execute_critical_operation(
        CriticalPath::TransactionProcessing,
        || async {
            Ok::<String, anyhow::Error>("success".to_string())
        },
        context,
    ).await;

    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "success");
}

#[actix_web::test]
async fn test_critical_operation_failure() {
    let handler = CriticalErrorHandler::new();
    let mut context = HashMap::new();
    context.insert("test".to_string(), "failure".to_string());

    let result = handler.execute_critical_operation(
        CriticalPath::TransactionProcessing,
        || async {
            Err::<String, anyhow::Error>(anyhow::anyhow!("Test failure"))
        },
        context,
    ).await;

    assert!(result.is_err());
    
    let error = result.unwrap_err();
    assert_eq!(error.path, CriticalPath::TransactionProcessing);
    assert_eq!(error.error_type, CriticalErrorType::ExternalServiceFailure);
    assert!(error.error_message.contains("Test failure"));
}

#[actix_web::test]
async fn test_critical_operation_timeout() {
    let handler = CriticalErrorHandler::new();
    let mut context = HashMap::new();
    context.insert("test".to_string(), "timeout".to_string());

    let result = handler.execute_critical_operation(
        CriticalPath::BlockchainTransaction,
        || async {
            // Simulate a long-running operation
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            Ok::<String, anyhow::Error>("should timeout".to_string())
        },
        context,
    ).await;

    assert!(result.is_err());
    
    let error = result.unwrap_err();
    assert_eq!(error.path, CriticalPath::BlockchainTransaction);
    assert_eq!(error.error_type, CriticalErrorType::Timeout);
}

#[actix_web::test]
async fn test_circuit_breaker_functionality() {
    let handler = CriticalErrorHandler::new();
    
    // First, check that circuit breaker is closed initially
    assert!(!handler.is_circuit_breaker_open(&CriticalPath::TransactionProcessing).await);
    
    // Execute multiple failing operations to trigger circuit breaker
    for _ in 0..5 {
        let _ = handler.execute_critical_operation(
            CriticalPath::TransactionProcessing,
            || async {
                Err::<String, anyhow::Error>(anyhow::anyhow!("Circuit breaker test"))
            },
            HashMap::new(),
        ).await;
    }
    
    // Circuit breaker should now be open
    assert!(handler.is_circuit_breaker_open(&CriticalPath::TransactionProcessing).await);
    
    // Reset circuit breaker
    handler.reset_circuit_breaker(&CriticalPath::TransactionProcessing).await.unwrap();
    
    // Circuit breaker should be closed again
    assert!(!handler.is_circuit_breaker_open(&CriticalPath::TransactionProcessing).await);
}

#[actix_web::test]
async fn test_error_recording_and_retrieval() {
    let handler = CriticalErrorHandler::new();
    
    // Create a test error
    let error = CriticalError {
        id: "test-id".to_string(),
        timestamp: chrono::Utc::now(),
        path: CriticalPath::Authentication,
        error_type: CriticalErrorType::AuthenticationFailure,
        error_message: "Test authentication failure".to_string(),
        context: HashMap::new(),
        severity: CriticalErrorSeverity::Critical,
        retry_count: 0,
        max_retries: 3,
        resolved: false,
        resolution_time: None,
        stack_trace: None,
        user_id: None,
        device_id: None,
        transaction_id: None,
        chain_id: None,
    };
    
    // Record the error
    handler.record_critical_error(error.clone()).await;
    
    // Retrieve errors
    let all_errors = handler.get_all_errors().await;
    assert_eq!(all_errors.len(), 1);
    assert_eq!(all_errors[0].id, "test-id");
    
    // Retrieve errors by path
    let path_errors = handler.get_recent_errors_by_path(&CriticalPath::Authentication, 10).await;
    assert_eq!(path_errors.len(), 1);
    assert_eq!(path_errors[0].path, CriticalPath::Authentication);
}

#[actix_web::test]
async fn test_fallback_strategy() {
    let handler = CriticalErrorHandler::new();
    let mut context = HashMap::new();
    context.insert("test".to_string(), "fallback".to_string());

    let result = handler.execute_with_fallback(
        CriticalPath::DatabaseOperation,
        || async {
            Err::<String, anyhow::Error>(anyhow::anyhow!("Primary operation failed"))
        },
        || async {
            Ok::<String, anyhow::Error>("fallback success".to_string())
        },
        context,
    ).await;

    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "fallback success");
}

#[actix_web::test]
async fn test_error_severity_determination() {
    let handler = CriticalErrorHandler::new();
    
    // Test authentication path (should be Critical)
    let auth_error = handler.execute_critical_operation(
        CriticalPath::Authentication,
        || async {
            Err::<String, anyhow::Error>(anyhow::anyhow!("Auth failure"))
        },
        HashMap::new(),
    ).await;
    
    assert!(auth_error.is_err());
    assert_eq!(auth_error.unwrap_err().severity, CriticalErrorSeverity::Critical);
    
    // Test monitoring path (should be Low)
    let monitoring_error = handler.execute_critical_operation(
        CriticalPath::MonitoringMetrics,
        || async {
            Err::<String, anyhow::Error>(anyhow::anyhow!("Monitoring failure"))
        },
        HashMap::new(),
    ).await;
    
    assert!(monitoring_error.is_err());
    assert_eq!(monitoring_error.unwrap_err().severity, CriticalErrorSeverity::Low);
}

#[actix_web::test]
async fn test_metrics_collection() {
    let handler = CriticalErrorHandler::new();
    
    // Execute some operations
    for _ in 0..3 {
        let _ = handler.execute_critical_operation(
            CriticalPath::TransactionProcessing,
            || async {
                Ok::<String, anyhow::Error>("success".to_string())
            },
            HashMap::new(),
        ).await;
    }
    
    // Execute some failing operations
    for _ in 0..2 {
        let _ = handler.execute_critical_operation(
            CriticalPath::TransactionProcessing,
            || async {
                Err::<String, anyhow::Error>(anyhow::anyhow!("failure"))
            },
            HashMap::new(),
        ).await;
    }
    
    let metrics = handler.get_all_metrics().await;
    let transaction_metrics = metrics.get(&CriticalPath::TransactionProcessing).unwrap();
    
    assert_eq!(transaction_metrics.total_operations, 5);
    assert_eq!(transaction_metrics.successful_operations, 3);
    assert_eq!(transaction_metrics.failed_operations, 2);
}

#[actix_web::test]
async fn test_health_check() {
    let handler = CriticalErrorHandler::new();
    let health = handler.health_check().await;
    
    assert_eq!(health["status"], "healthy");
    assert!(health["total_errors"].as_u64().unwrap() >= 0);
    assert!(health["total_paths"].as_u64().unwrap() >= 0);
}

#[actix_web::test]
async fn test_error_type_determination() {
    let handler = CriticalErrorHandler::new();
    
    // Test timeout error
    let timeout_error = handler.execute_critical_operation(
        CriticalPath::BlockchainTransaction,
        || async {
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            Ok::<String, anyhow::Error>("timeout".to_string())
        },
        HashMap::new(),
    ).await;
    
    assert!(timeout_error.is_err());
    assert_eq!(timeout_error.unwrap_err().error_type, CriticalErrorType::Timeout);
    
    // Test connection failure
    let conn_error = handler.execute_critical_operation(
        CriticalPath::BLEDeviceConnection,
        || async {
            Err::<String, anyhow::Error>(anyhow::anyhow!("Connection failed"))
        },
        HashMap::new(),
    ).await;
    
    assert!(conn_error.is_err());
    assert_eq!(conn_error.unwrap_err().error_type, CriticalErrorType::ConnectionFailure);
}

#[actix_web::test]
async fn test_context_preservation() {
    let handler = CriticalErrorHandler::new();
    let mut context = HashMap::new();
    context.insert("user_id".to_string(), "test_user".to_string());
    context.insert("device_id".to_string(), "test_device".to_string());
    context.insert("chain_id".to_string(), "1".to_string());

    let result = handler.execute_critical_operation(
        CriticalPath::TransactionProcessing,
        || async {
            Err::<String, anyhow::Error>(anyhow::anyhow!("Context test"))
        },
        context,
    ).await;

    assert!(result.is_err());
    let error = result.unwrap_err();
    
    assert_eq!(error.context.get("user_id").unwrap(), "test_user");
    assert_eq!(error.context.get("device_id").unwrap(), "test_device");
    assert_eq!(error.context.get("chain_id").unwrap(), "1");
}

#[actix_web::test]
async fn test_max_errors_limit() {
    let handler = CriticalErrorHandler::new();
    
    // Create many errors
    for i in 0..100 {
        let error = CriticalError {
            id: format!("test-{}", i),
            timestamp: chrono::Utc::now(),
            path: CriticalPath::TransactionProcessing,
            error_type: CriticalErrorType::ExternalServiceFailure,
            error_message: format!("Test error {}", i),
            context: HashMap::new(),
            severity: CriticalErrorSeverity::Medium,
            retry_count: 0,
            max_retries: 3,
            resolved: false,
            resolution_time: None,
            stack_trace: None,
            user_id: None,
            device_id: None,
            transaction_id: None,
            chain_id: None,
        };
        
        handler.record_critical_error(error).await;
    }
    
    let errors = handler.get_all_errors().await;
    // Should not exceed max_errors (10000)
    assert!(errors.len() <= 10000);
} 