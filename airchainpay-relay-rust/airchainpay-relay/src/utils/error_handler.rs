use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use anyhow::Error;
use crate::logger::Logger;
use std::time::{Duration, Instant};
use tokio::time::sleep;
use std::panic::catch_unwind;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum CriticalPath {
    BlockchainTransaction,
    BLEDeviceConnection,
    Authentication,
    DatabaseOperation,
    ConfigurationReload,
    BackupOperation,
    TransactionProcessing,
    SecurityValidation,
    MonitoringMetrics,
    HealthCheck,
    // General paths for non-critical operations
    GeneralAPI,
    GeneralSystem,
    GeneralNetwork,
    GeneralValidation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ErrorType {
    // Critical error types
    Timeout,
    ConnectionFailure,
    AuthenticationFailure,
    ValidationFailure,
    ResourceExhaustion,
    SecurityViolation,
    DataCorruption,
    SystemPanic,
    ExternalServiceFailure,
    ConfigurationError,
    // General error types
    Network,
    Blockchain,
    Database,
    System,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorRecord {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub path: CriticalPath,
    pub error_type: ErrorType,
    pub error_message: String,
    pub context: HashMap<String, String>,
    pub severity: ErrorSeverity,
    pub retry_count: u32,
    pub max_retries: u32,
    pub resolved: bool,
    pub resolution_time: Option<DateTime<Utc>>,
    pub stack_trace: Option<String>,
    pub user_id: Option<String>,
    pub device_id: Option<String>,
    pub transaction_id: Option<String>,
    pub chain_id: Option<u64>,
    pub ip_address: Option<String>,
    pub component: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ErrorSeverity {
    Low,
    Medium,
    High,
    Critical,
    Fatal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathConfig {
    pub timeout_duration: Duration,
    pub max_retries: u32,
    pub retry_delay: Duration,
    pub circuit_breaker_threshold: u32,
    pub circuit_breaker_timeout: Duration,
    pub alert_on_failure: bool,
    pub auto_recovery: bool,
    pub fallback_strategy: FallbackStrategy,
    pub is_critical: bool, // Whether this path needs critical protection
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FallbackStrategy {
    Retry,
    UseBackup,
    DegradedMode,
    FailFast,
    CircuitBreaker,
    LogOnly, // For non-critical operations
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathMetrics {
    pub total_operations: u64,
    pub successful_operations: u64,
    pub failed_operations: u64,
    pub timeout_operations: u64,
    pub average_response_time_ms: f64,
    pub last_operation_time: Option<DateTime<Utc>>,
    pub circuit_breaker_status: CircuitBreakerStatus,
    pub error_count: u64,
    pub last_error_time: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CircuitBreakerStatus {
    Closed,
    Open,
    HalfOpen,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CircuitBreakerState {
    status: CircuitBreakerStatus,
    failure_count: u32,
    last_failure_time: Option<DateTime<Utc>>,
    success_count: u32,
    last_success_time: Option<DateTime<Utc>>,
    threshold: u32,
    timeout: Duration,
}

pub struct EnhancedErrorHandler {
    errors: Arc<RwLock<Vec<ErrorRecord>>>,
    path_configs: Arc<RwLock<HashMap<CriticalPath, PathConfig>>>,
    metrics: Arc<RwLock<HashMap<CriticalPath, PathMetrics>>>,
    circuit_breakers: Arc<RwLock<HashMap<CriticalPath, CircuitBreakerState>>>,
    alert_thresholds: HashMap<ErrorSeverity, u32>,
    max_errors: usize,
}

impl EnhancedErrorHandler {
    pub fn new() -> Self {
        let mut path_configs = HashMap::new();
        
        // Critical paths with full protection
        path_configs.insert(CriticalPath::BlockchainTransaction, PathConfig {
            timeout_duration: Duration::from_secs(30),
            max_retries: 3,
            retry_delay: Duration::from_secs(5),
            circuit_breaker_threshold: 5,
            circuit_breaker_timeout: Duration::from_secs(60),
            alert_on_failure: true,
            auto_recovery: true,
            fallback_strategy: FallbackStrategy::Retry,
            is_critical: true,
        });

        path_configs.insert(CriticalPath::BLEDeviceConnection, PathConfig {
            timeout_duration: Duration::from_secs(15),
            max_retries: 2,
            retry_delay: Duration::from_secs(3),
            circuit_breaker_threshold: 3,
            circuit_breaker_timeout: Duration::from_secs(30),
            alert_on_failure: true,
            auto_recovery: true,
            fallback_strategy: FallbackStrategy::CircuitBreaker,
            is_critical: true,
        });

        path_configs.insert(CriticalPath::Authentication, PathConfig {
            timeout_duration: Duration::from_secs(10),
            max_retries: 1,
            retry_delay: Duration::from_secs(1),
            circuit_breaker_threshold: 10,
            circuit_breaker_timeout: Duration::from_secs(300),
            alert_on_failure: true,
            auto_recovery: false,
            fallback_strategy: FallbackStrategy::FailFast,
            is_critical: true,
        });

        path_configs.insert(CriticalPath::DatabaseOperation, PathConfig {
            timeout_duration: Duration::from_secs(20),
            max_retries: 3,
            retry_delay: Duration::from_secs(2),
            circuit_breaker_threshold: 5,
            circuit_breaker_timeout: Duration::from_secs(120),
            alert_on_failure: true,
            auto_recovery: true,
            fallback_strategy: FallbackStrategy::UseBackup,
            is_critical: true,
        });

        path_configs.insert(CriticalPath::TransactionProcessing, PathConfig {
            timeout_duration: Duration::from_secs(60),
            max_retries: 2,
            retry_delay: Duration::from_secs(10),
            circuit_breaker_threshold: 3,
            circuit_breaker_timeout: Duration::from_secs(180),
            alert_on_failure: true,
            auto_recovery: true,
            fallback_strategy: FallbackStrategy::DegradedMode,
            is_critical: true,
        });

        // General paths with basic protection
        path_configs.insert(CriticalPath::GeneralAPI, PathConfig {
            timeout_duration: Duration::from_secs(10),
            max_retries: 1,
            retry_delay: Duration::from_secs(1),
            circuit_breaker_threshold: 20,
            circuit_breaker_timeout: Duration::from_secs(60),
            alert_on_failure: false,
            auto_recovery: true,
            fallback_strategy: FallbackStrategy::LogOnly,
            is_critical: false,
        });

        path_configs.insert(CriticalPath::GeneralSystem, PathConfig {
            timeout_duration: Duration::from_secs(5),
            max_retries: 0,
            retry_delay: Duration::from_secs(0),
            circuit_breaker_threshold: 50,
            circuit_breaker_timeout: Duration::from_secs(30),
            alert_on_failure: false,
            auto_recovery: true,
            fallback_strategy: FallbackStrategy::LogOnly,
            is_critical: false,
        });

        Self {
            errors: Arc::new(RwLock::new(Vec::new())),
            path_configs: Arc::new(RwLock::new(path_configs)),
            metrics: Arc::new(RwLock::new(HashMap::new())),
            circuit_breakers: Arc::new(RwLock::new(HashMap::new())),
            alert_thresholds: HashMap::from([
                (ErrorSeverity::Fatal, 1),
                (ErrorSeverity::Critical, 1),
                (ErrorSeverity::High, 3),
                (ErrorSeverity::Medium, 5),
                (ErrorSeverity::Low, 10),
            ]),
            max_errors: 10000,
        }
    }

    /// Execute operation with appropriate protection level
    pub async fn execute_operation<T, F, Fut>(
        &self,
        path: CriticalPath,
        operation: F,
        context: HashMap<String, String>,
    ) -> Result<T, ErrorRecord>
    where
        F: FnOnce() -> Fut + Send + Sync,
        Fut: std::future::Future<Output = Result<T, Error>> + Send,
        T: Send + Sync,
    {
        let config = self.get_path_config(&path).await;
        
        if config.is_critical {
            // Use full critical protection
            self.execute_critical_operation(path, operation, context).await
        } else {
            // Use basic error logging
            self.execute_basic_operation(path, operation, context).await
        }
    }

    /// Execute critical operation with full protection
    async fn execute_critical_operation<T, F, Fut>(
        &self,
        path: CriticalPath,
        operation: F,
        context: HashMap<String, String>,
    ) -> Result<T, ErrorRecord>
    where
        F: FnOnce() -> Fut + Send + Sync,
        Fut: std::future::Future<Output = Result<T, Error>> + Send,
        T: Send + Sync,
    {
        let start_time = Instant::now();
        let config = self.get_path_config(&path).await;
        
        // Check circuit breaker
        if self.is_circuit_breaker_open(&path).await {
            let error = ErrorRecord {
                id: uuid::Uuid::new_v4().to_string(),
                timestamp: Utc::now(),
                path: path.clone(),
                error_type: ErrorType::ExternalServiceFailure,
                error_message: "Circuit breaker is open".to_string(),
                context,
                severity: ErrorSeverity::High,
                retry_count: 0,
                max_retries: config.max_retries,
                resolved: false,
                resolution_time: None,
                stack_trace: None,
                user_id: None,
                device_id: None,
                transaction_id: None,
                chain_id: None,
                ip_address: None,
                component: format!("{:?}", path),
            };
            
            self.record_error(error.clone()).await;
            return Err(error);
        }

        let mut retry_count = 0;
        let mut last_error = None;

        while retry_count <= config.max_retries {
            let operation_start = Instant::now();
            
            // Execute operation with panic protection
            let result = catch_unwind(|| {
                tokio::runtime::Handle::current().block_on(async {
                    let timeout_future = sleep(config.timeout_duration);
                    let operation_future = operation();
                    
                    tokio::select! {
                        result = operation_future => result,
                        _ = timeout_future => Err(anyhow::anyhow!("Operation timed out")),
                    }
                })
            });

            match result {
                Ok(Ok(value)) => {
                    // Success
                    let duration = start_time.elapsed();
                    self.record_success(&path, duration).await;
                    return Ok(value);
                }
                Ok(Err(error)) => {
                    // Operation failed
                    let duration = operation_start.elapsed();
                    last_error = Some(error);
                    retry_count += 1;
                    
                    if retry_count <= config.max_retries {
                        Logger::warn(&format!(
                            "Critical operation failed in {:?}, retrying ({}/{})",
                            path, retry_count, config.max_retries
                        ));
                        sleep(config.retry_delay).await;
                    }
                }
                Err(panic_payload) => {
                    // Panic occurred
                    let panic_message = if let Some(s) = panic_payload.downcast_ref::<String>() {
                        s.clone()
                    } else if let Some(s) = panic_payload.downcast_ref::<&str>() {
                        s.to_string()
                    } else {
                        "Unknown panic".to_string()
                    };

                    let error_record = ErrorRecord {
                        id: uuid::Uuid::new_v4().to_string(),
                        timestamp: Utc::now(),
                        path: path.clone(),
                        error_type: ErrorType::SystemPanic,
                        error_message: format!("Panic in critical operation: {}", panic_message),
                        context,
                        severity: ErrorSeverity::Fatal,
                        retry_count,
                        max_retries: config.max_retries,
                        resolved: false,
                        resolution_time: None,
                        stack_trace: Some(format!("{:?}", panic_payload)),
                        user_id: None,
                        device_id: None,
                        transaction_id: None,
                        chain_id: None,
                        ip_address: None,
                        component: format!("{:?}", path),
                    };

                    self.record_error(error_record.clone()).await;
                    return Err(error_record);
                }
            }
        }

        // All retries exhausted
        let final_error = ErrorRecord {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            path: path.clone(),
            error_type: self.determine_error_type(&last_error.as_ref().unwrap().to_string()),
            error_message: last_error.unwrap().to_string(),
            context,
            severity: self.determine_severity(&path, &last_error.as_ref().unwrap().to_string()),
            retry_count,
            max_retries: config.max_retries,
            resolved: false,
            resolution_time: None,
            stack_trace: Some(format!("{:?}", last_error.as_ref().unwrap())),
            user_id: None,
            device_id: None,
            transaction_id: None,
            chain_id: None,
            ip_address: None,
            component: format!("{:?}", path),
        };

        self.record_error(final_error.clone()).await;
        self.update_circuit_breaker(&path, true).await;
        
        Err(final_error)
    }

    /// Execute basic operation with simple error logging
    async fn execute_basic_operation<T, F, Fut>(
        &self,
        path: CriticalPath,
        operation: F,
        context: HashMap<String, String>,
    ) -> Result<T, ErrorRecord>
    where
        F: FnOnce() -> Fut + Send + Sync,
        Fut: std::future::Future<Output = Result<T, Error>> + Send,
        T: Send + Sync,
    {
        let start_time = Instant::now();
        
        match operation().await {
            Ok(value) => {
                let duration = start_time.elapsed();
                self.record_success(&path, duration).await;
                Ok(value)
            }
            Err(error) => {
                let error_record = ErrorRecord {
                    id: uuid::Uuid::new_v4().to_string(),
                    timestamp: Utc::now(),
                    path: path.clone(),
                    error_type: self.determine_error_type(&error.to_string()),
                    error_message: error.to_string(),
                    context,
                    severity: self.determine_severity(&path, &error.to_string()),
                    retry_count: 0,
                    max_retries: 0,
                    resolved: false,
                    resolution_time: None,
                    stack_trace: Some(format!("{:?}", error)),
                    user_id: None,
                    device_id: None,
                    transaction_id: None,
                    chain_id: None,
                    ip_address: None,
                    component: format!("{:?}", path),
                };

                self.record_error(error_record.clone()).await;
                Err(error_record)
            }
        }
    }

    /// Record an error (compatible with old ErrorHandler API)
    pub async fn record_error(&self, error: ErrorRecord) {
        let mut errors = self.errors.write().await;
        errors.push(error.clone());
        
        if errors.len() > self.max_errors {
            errors.remove(0);
        }

        // Update metrics
        self.update_metrics(&error.path, false).await;

        // Log based on severity
        match error.severity {
            ErrorSeverity::Fatal => {
                Logger::error(&format!("FATAL ERROR in {:?}: {}", error.path, error.error_message));
                self.send_fatal_alert(&error).await;
            }
            ErrorSeverity::Critical => {
                Logger::error(&format!("CRITICAL ERROR in {:?}: {}", error.path, error.error_message));
                self.send_critical_alert(&error).await;
            }
            ErrorSeverity::High => {
                Logger::error(&format!("HIGH SEVERITY ERROR in {:?}: {}", error.path, error.error_message));
            }
            ErrorSeverity::Medium => {
                Logger::warn(&format!("MEDIUM SEVERITY ERROR in {:?}: {}", error.path, error.error_message));
            }
            ErrorSeverity::Low => {
                Logger::info(&format!("LOW SEVERITY ERROR in {:?}: {}", error.path, error.error_message));
            }
        }

        // Check alert thresholds
        self.check_alert_thresholds(&error.path, &error.severity).await;
    }

    // ... rest of the implementation with all the helper methods
    // (get_path_config, is_circuit_breaker_open, update_circuit_breaker, etc.)
    // Same as CriticalErrorHandler but adapted for the unified approach
} 