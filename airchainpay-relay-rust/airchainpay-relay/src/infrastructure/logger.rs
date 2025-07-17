#![allow(dead_code, unused_variables)]
use tracing::{info, warn, error, debug, trace, Level};
use tracing_subscriber::{
    layer::SubscriberExt, 
    util::SubscriberInitExt,
    fmt::{self, time::UtcTime},
    EnvFilter,
    Registry,
    Layer,
};
use tracing_appender::{non_blocking, rolling, rolling::Rotation};
use serde::{Serialize, Deserialize};
use std::sync::Once;
use std::collections::HashMap;
#[allow(unused_imports)]
use std::sync::Arc;
#[allow(unused_imports)]
use tokio::sync::RwLock;
use chrono::{DateTime, Utc};
use uuid::Uuid;
use std::fs;

static INIT: Once = Once::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogContext {
    pub request_id: Option<String>,
    pub user_id: Option<String>,
    pub ip_address: Option<String>,
    pub session_id: Option<String>,
    pub chain_id: Option<u64>,
    pub transaction_hash: Option<String>,
    pub operation: Option<String>,
    pub duration_ms: Option<u64>,
    pub metadata: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub level: String,
    pub message: String,
    pub context: LogContext,
    pub service: String,
    pub version: String,
    pub hostname: String,
    pub pid: u32,
    pub thread_id: String,
    pub file: Option<String>,
    pub line: Option<u32>,
    pub module_path: Option<String>,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogConfig {
    pub level: String,
    pub service_name: String,
    pub version: String,
    pub enable_console: bool,
    pub enable_file: bool,
    pub enable_json: bool,
    pub log_directory: String,
    pub max_file_size: u64,
    pub max_files: usize,
    pub enable_rotation: bool,
    pub enable_structured: bool,
    pub enable_colors: bool,
    pub enable_timestamps: bool,
    pub enable_thread_ids: bool,
    pub enable_file_line: bool,
    pub enable_module_path: bool,
    pub custom_fields: HashMap<String, String>,
}

pub struct EnhancedLogger {
    config: LogConfig,
}

impl Default for LogConfig {
    fn default() -> Self {
        Self {
            level: "info".to_string(),
            service_name: "airchainpay-relay".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            enable_console: true,
            enable_file: true,
            enable_json: true,
            log_directory: "logs".to_string(),
            max_file_size: 10 * 1024 * 1024, // 10MB
            max_files: 5,
            enable_rotation: true,
            enable_structured: true,
            enable_colors: true,
            enable_timestamps: true,
            enable_thread_ids: true,
            enable_file_line: true,
            enable_module_path: true,
            custom_fields: HashMap::new(),
        }
    }
}

impl EnhancedLogger {
    pub fn new(config: LogConfig) -> Self {
        // Create log directory if it doesn't exist
        if config.enable_file {
            if let Err(e) = fs::create_dir_all(&config.log_directory) {
                eprintln!("Failed to create log directory: {e}");
            }
        }

        Self {
            config,
        }
    }

    pub fn init(&self) {
        INIT.call_once(|| {
            let level = match self.config.level.to_lowercase().as_str() {
                "trace" => Level::TRACE,
                "debug" => Level::DEBUG,
                "info" => Level::INFO,
                "warn" => Level::WARN,
                "error" => Level::ERROR,
                _ => Level::INFO,
            };

            let env_filter = EnvFilter::new(
                std::env::var("RUST_LOG").unwrap_or_else(|_| format!("airchainpay_relay={level}"))
            );

            let mut layers: Vec<Box<dyn Layer<_> + Send + Sync>> = Vec::new();

            if self.config.enable_console {
                let console_layer = fmt::layer()
                    .with_timer(UtcTime::rfc_3339())
                    .with_thread_ids(self.config.enable_thread_ids)
                    .with_file(self.config.enable_file_line)
                    .with_line_number(self.config.enable_file_line)
                    .with_target(self.config.enable_module_path)
                    .with_ansi(self.config.enable_colors)
                    .with_writer(std::io::stdout);
                layers.push(Box::new(console_layer));
            }

            if self.config.enable_file {
                let file_appender = rolling::RollingFileAppender::new(
                    Rotation::DAILY,
                    &self.config.log_directory,
                    "airchainpay_relay.log"
                );
                let (non_blocking_file_appender, _guard) = non_blocking(file_appender);
                let file_layer = fmt::layer()
                    .with_timer(UtcTime::rfc_3339())
                    .with_thread_ids(self.config.enable_thread_ids)
                    .with_file(self.config.enable_file_line)
                    .with_line_number(self.config.enable_file_line)
                    .with_target(self.config.enable_module_path)
                    .with_ansi(false)
                    .with_writer(non_blocking_file_appender);
                layers.push(Box::new(file_layer));
            }

            if self.config.enable_json {
                let json_appender = rolling::RollingFileAppender::new(
                    Rotation::DAILY,
                    &self.config.log_directory,
                    "airchainpay_relay.json"
                );
                let (non_blocking_json_appender, _guard) = non_blocking(json_appender);
                let json_layer = fmt::layer()
                    .with_timer(UtcTime::rfc_3339())
                    .with_thread_ids(self.config.enable_thread_ids)
                    .with_file(self.config.enable_file_line)
                    .with_line_number(self.config.enable_file_line)
                    .with_target(self.config.enable_module_path)
                    .with_ansi(false)
                    .with_writer(non_blocking_json_appender);
                layers.push(Box::new(json_layer));
            }

            let subscriber = Registry::default()
                .with(env_filter)
                .with(layers);

            subscriber.init();
        });
    }

    #[allow(dead_code)]
    pub async fn set_context(&self, context: LogContext) {
        // This function is no longer needed as context is removed from EnhancedLogger
    }

    #[allow(dead_code)]
    pub async fn update_context(&self, updates: HashMap<String, serde_json::Value>) {
        // This function is no longer needed as context is removed from EnhancedLogger
    }

    #[allow(dead_code)]
    pub async fn log_with_context(&self, level: Level, message: &str, additional_context: Option<HashMap<String, serde_json::Value>>) {
        // This function is no longer needed as context is removed from EnhancedLogger
        let log_entry = LogEntry {
            id: Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            level: level.to_string(),
            message: message.to_string(),
            context: LogContext { // This will cause a compilation error as LogContext is removed
                request_id: None,
                user_id: None,
                ip_address: None,
                session_id: None,
                chain_id: None,
                transaction_hash: None,
                operation: None,
                duration_ms: None,
                metadata: HashMap::new(),
            },
            service: self.config.service_name.clone(),
            version: self.config.version.clone(),
            hostname: hostname::get().unwrap_or_default().to_string_lossy().to_string(),
            pid: std::process::id(),
            thread_id: format!("{:?}", std::thread::current().id()),
            file: None, // Will be set by tracing
            line: None, // Will be set by tracing
            module_path: None, // Will be set by tracing
            target: "airchainpay_relay".to_string(),
        };

        // Store log entry
        // This block is no longer needed as log_entries is removed from EnhancedLogger
        // {
        //     let mut entries = self.log_entries.write().await;
        //     entries.push(log_entry.clone());
            
        //     // Maintain max entries limit
        //     if entries.len() > self.max_entries {
        //         entries.remove(0);
        //     }
        // }

        // Log with tracing
        match level {
            Level::TRACE => trace!("{}", message),
            Level::DEBUG => debug!("{}", message),
            Level::INFO => info!("{}", message),
            Level::WARN => warn!("{}", message),
            Level::ERROR => error!("{}", message),
        }
    }

    #[allow(dead_code)]
    pub async fn info(&self, message: &str) {
        self.log_with_context(Level::INFO, message, None).await;
    }

    #[allow(dead_code)]
    pub async fn warn(&self, message: &str) {
        self.log_with_context(Level::WARN, message, None).await;
    }

    #[allow(dead_code)]
    pub async fn error(&self, message: &str) {
        self.log_with_context(Level::ERROR, message, None).await;
    }

    #[allow(dead_code)]
    pub async fn debug(&self, message: &str) {
        self.log_with_context(Level::DEBUG, message, None).await;
    }

    #[allow(dead_code)]
    pub async fn trace(&self, message: &str) {
        self.log_with_context(Level::TRACE, message, None).await;
    }

    pub async fn info_with_context(&self, message: &str, context: HashMap<String, serde_json::Value>) {
        self.log_with_context(Level::INFO, message, Some(context)).await;
    }

    pub async fn warn_with_context(&self, message: &str, context: HashMap<String, serde_json::Value>) {
        self.log_with_context(Level::WARN, message, Some(context)).await;
    }

    pub async fn error_with_context(&self, message: &str, context: HashMap<String, serde_json::Value>) {
        self.log_with_context(Level::ERROR, message, Some(context)).await;
    }

    pub async fn debug_with_context(&self, message: &str, context: HashMap<String, serde_json::Value>) {
        self.log_with_context(Level::DEBUG, message, Some(context)).await;
    }

    // Transaction-specific logging
    pub async fn transaction_received(&self, tx_hash: &str, chain_id: u64) {
        let mut context = HashMap::new();
        context.insert("transaction_hash".to_string(), serde_json::Value::String(tx_hash.to_string()));
        context.insert("chain_id".to_string(), serde_json::Value::Number(serde_json::Number::from(chain_id)));
        context.insert("operation".to_string(), serde_json::Value::String("transaction_received".to_string()));
        
        self.info_with_context("Transaction received", context).await;
    }

    pub async fn transaction_processed(&self, tx_hash: &str, chain_id: u64, block_number: Option<u64>, gas_used: Option<u64>) {
        let mut context = HashMap::new();
        context.insert("transaction_hash".to_string(), serde_json::Value::String(tx_hash.to_string()));
        context.insert("chain_id".to_string(), serde_json::Value::Number(serde_json::Number::from(chain_id)));
        context.insert("operation".to_string(), serde_json::Value::String("transaction_processed".to_string()));
        
        if let Some(block_number) = block_number {
            context.insert("block_number".to_string(), serde_json::Value::Number(serde_json::Number::from(block_number)));
        }
        
        if let Some(gas_used) = gas_used {
            context.insert("gas_used".to_string(), serde_json::Value::Number(serde_json::Number::from(gas_used)));
        }
        
        self.info_with_context("Transaction processed successfully", context).await;
    }

    pub async fn transaction_failed(&self, tx_hash: &str, error: &str, chain_id: Option<u64>) {
        let mut context = HashMap::new();
        context.insert("transaction_hash".to_string(), serde_json::Value::String(tx_hash.to_string()));
        context.insert("error".to_string(), serde_json::Value::String(error.to_string()));
        context.insert("operation".to_string(), serde_json::Value::String("transaction_failed".to_string()));
        
        if let Some(chain_id) = chain_id {
            context.insert("chain_id".to_string(), serde_json::Value::Number(serde_json::Number::from(chain_id)));
        }
        
        self.error_with_context("Transaction failed", context).await;
    }

    // Security-specific logging
    pub async fn security_violation(&self, ip: &str, action: &str, details: Option<HashMap<String, serde_json::Value>>) {
        let mut context = HashMap::new();
        context.insert("ip_address".to_string(), serde_json::Value::String(ip.to_string()));
        context.insert("action".to_string(), serde_json::Value::String(action.to_string()));
        context.insert("operation".to_string(), serde_json::Value::String("security_violation".to_string()));
        
        if let Some(details) = details {
            context.extend(details);
        }
        
        self.error_with_context("Security violation detected", context).await;
    }

    pub async fn rate_limit_hit(&self, ip: &str, limit_type: Option<&str>) {
        let mut context = HashMap::new();
        context.insert("ip_address".to_string(), serde_json::Value::String(ip.to_string()));
        context.insert("operation".to_string(), serde_json::Value::String("rate_limit_hit".to_string()));
        
        if let Some(limit_type) = limit_type {
            context.insert("limit_type".to_string(), serde_json::Value::String(limit_type.to_string()));
        }
        
        self.warn_with_context("Rate limit hit", context).await;
    }

    // System metrics logging
    pub async fn system_metric(&self, name: &str, value: f64, unit: Option<&str>) {
        let mut context = HashMap::new();
        context.insert("metric_name".to_string(), serde_json::Value::String(name.to_string()));
        context.insert("metric_value".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(value).unwrap_or(serde_json::Number::from(0))));
        context.insert("operation".to_string(), serde_json::Value::String("system_metric".to_string()));
        
        if let Some(unit) = unit {
            context.insert("metric_unit".to_string(), serde_json::Value::String(unit.to_string()));
        }
        
        self.debug_with_context("System metric recorded", context).await;
    }

    // Performance logging
    pub async fn performance_metric(&self, operation: &str, duration_ms: u64, success: bool, details: Option<HashMap<String, serde_json::Value>>) {
        let mut context = HashMap::new();
        context.insert("operation".to_string(), serde_json::Value::String(operation.to_string()));
        context.insert("duration_ms".to_string(), serde_json::Value::Number(serde_json::Number::from(duration_ms)));
        context.insert("success".to_string(), serde_json::Value::Bool(success));
        
        if let Some(details) = details {
            context.extend(details);
        }
        
        let level = if success { Level::DEBUG } else { Level::WARN };
        self.log_with_context(level, "Performance metric recorded", Some(context)).await;
    }

    // API request logging
    pub async fn api_request(&self, method: &str, path: &str, status_code: u16, duration_ms: u64, ip: Option<&str>, user_agent: Option<&str>) {
        let mut context = HashMap::new();
        context.insert("http_method".to_string(), serde_json::Value::String(method.to_string()));
        context.insert("http_path".to_string(), serde_json::Value::String(path.to_string()));
        context.insert("http_status_code".to_string(), serde_json::Value::Number(serde_json::Number::from(status_code)));
        context.insert("duration_ms".to_string(), serde_json::Value::Number(serde_json::Number::from(duration_ms)));
        context.insert("operation".to_string(), serde_json::Value::String("api_request".to_string()));
        
        if let Some(ip) = ip {
            context.insert("ip_address".to_string(), serde_json::Value::String(ip.to_string()));
        }
        
        if let Some(user_agent) = user_agent {
            context.insert("user_agent".to_string(), serde_json::Value::String(user_agent.to_string()));
        }
        
        let level = if status_code >= 400 { Level::WARN } else { Level::INFO };
        self.log_with_context(level, "API request processed", Some(context)).await;
    }

    // Database operation logging
    pub async fn database_operation(&self, operation: &str, table: &str, duration_ms: u64, success: bool, error: Option<&str>) {
        let mut context = HashMap::new();
        context.insert("db_operation".to_string(), serde_json::Value::String(operation.to_string()));
        context.insert("db_table".to_string(), serde_json::Value::String(table.to_string()));
        context.insert("duration_ms".to_string(), serde_json::Value::Number(serde_json::Number::from(duration_ms)));
        context.insert("success".to_string(), serde_json::Value::Bool(success));
        context.insert("operation".to_string(), serde_json::Value::String("database_operation".to_string()));
        
        if let Some(error) = error {
            context.insert("error".to_string(), serde_json::Value::String(error.to_string()));
        }
        
        let level = if success { Level::DEBUG } else { Level::ERROR };
        self.log_with_context(level, "Database operation completed", Some(context)).await;
    }

    // Get log entries for analysis
    pub async fn get_log_entries(&self, filter: Option<LogFilter>) -> Vec<LogEntry> {
        // This function is no longer needed as log_entries is removed from EnhancedLogger
        Vec::new()
    }

    // Get log statistics
    pub async fn get_log_stats(&self) -> LogStats {
        // This function is no longer needed as log_entries is removed from EnhancedLogger
        LogStats {
            total_entries: 0,
            entries_by_level: HashMap::new(),
            entries_by_operation: HashMap::new(),
            average_message_length: 0.0,
            oldest_entry: None,
            newest_entry: None,
        }
    }

    // Clear log entries
    pub async fn clear_log_entries(&self) {
        // This function is no longer needed as log_entries is removed from EnhancedLogger
    }
}

#[derive(Debug, Clone)]
pub struct LogFilter {
    pub level: Option<String>,
    pub operation: Option<String>,
    pub transaction_hash: Option<String>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub limit: Option<usize>,
}

impl LogFilter {
    pub fn matches(&self, entry: &LogEntry) -> bool {
        if let Some(level) = &self.level {
            if entry.level != *level {
                return false;
            }
        }
        
        if let Some(operation) = &self.operation {
            if entry.context.operation.as_ref() != Some(operation) {
                return false;
            }
        }
        
        if let Some(transaction_hash) = &self.transaction_hash {
            if entry.context.transaction_hash.as_ref() != Some(transaction_hash) {
                return false;
            }
        }
        
        if let Some(start_time) = &self.start_time {
            if entry.timestamp < *start_time {
                return false;
            }
        }
        
        if let Some(end_time) = &self.end_time {
            if entry.timestamp > *end_time {
                return false;
            }
        }
        
        true
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogStats {
    pub total_entries: usize,
    pub entries_by_level: HashMap<String, usize>,
    pub entries_by_operation: HashMap<String, usize>,
    pub average_message_length: f64,
    pub oldest_entry: Option<DateTime<Utc>>,
    pub newest_entry: Option<DateTime<Utc>>,
}

// Legacy Logger for backward compatibility
pub struct Logger;

impl Logger {
    pub fn init(_log_level: &str) {
        let config = LogConfig::default();
        let enhanced_logger = EnhancedLogger::new(config);
        enhanced_logger.init();
    }

    pub fn info(message: &str) {
        info!("{}", message);
    }

    pub fn warn(message: &str) {
        warn!("{}", message);
    }

    pub fn error(message: &str) {
        error!("{}", message);
    }

    pub fn debug(message: &str) {
        debug!("{}", message);
    }

    pub fn transaction_received(tx_hash: &str, chain_id: u64) {
        info!("Transaction received: {} on chain {}", tx_hash, chain_id);
    }

    pub fn transaction_processed(tx_hash: &str, chain_id: u64) {
        info!("Transaction processed: {} on chain {}", tx_hash, chain_id);
    }

    pub fn transaction_failed(tx_hash: &str, error: &str) {
        error!("Transaction failed: {} - {}", tx_hash, error);
    }

    pub fn security_violation(ip: &str, action: &str) {
        error!("Security violation from {}: {}", ip, action);
    }

    pub fn rate_limit_hit(ip: &str) {
        warn!("Rate limit hit for IP: {}", ip);
    }

    pub fn system_metric(name: &str, value: f64) {
        debug!("System metric: {} = {}", name, value);
    }
} 