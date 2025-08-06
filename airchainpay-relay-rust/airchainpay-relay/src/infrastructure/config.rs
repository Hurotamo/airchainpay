use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::str::FromStr;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{RwLock, watch};
use tokio::time::sleep;
use std::path::Path;
use std::fs;
use anyhow::{Result, anyhow};
use std::sync::mpsc::channel;
use chrono::{DateTime, Utc};
use notify::Watcher;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChainConfig {
    pub name: String,
    pub rpc_url: String,
    pub contract_address: String,
    pub explorer: String,
    pub currency_symbol: Option<String>,
    pub max_gas_limit: Option<u64>,
}

impl Default for ChainConfig {
    fn default() -> Self {
        Self {
            name: "Default Chain".to_string(),
            rpc_url: "https://rpc.test2.btcs.network".to_string(),
            contract_address: "".to_string(),
            explorer: "https://scan.test2.btcs.network".to_string(),
            currency_symbol: Some("TCORE2".to_string()),
            max_gas_limit: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RateLimitConfig {
    pub window_ms: u64,
    pub max_requests: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SecurityConfig {
    pub enable_jwt_validation: bool,
    pub enable_api_key_validation: bool,
    pub enable_rate_limiting: bool,
    pub enable_cors: bool,
    pub cors_origins: String,
    pub jwt_secret: String,
    pub api_key: String,
    pub max_connections: u32,
    pub session_timeout: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MonitoringConfig {
    pub enable_metrics: bool,
    pub enable_health_checks: bool,
    pub enable_alerting: bool,
    pub log_requests: bool,
    pub metrics_interval: u64,
    pub health_check_interval: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DatabaseConfig {
    pub data_dir: String,
    pub backup_interval: u64,
    pub retention_days: u32,
    pub enable_encryption: bool,
    pub compression_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub environment: String,
    pub rpc_url: String,
    pub chain_id: u64,
    pub contract_address: String,
    pub log_level: String,
    pub port: u16,
    pub debug: bool,
    pub enable_swagger: bool,
    pub enable_cors_debug: bool,
    pub rate_limits: RateLimitConfig,
    pub security: SecurityConfig,
    pub monitoring: MonitoringConfig,
    pub database: DatabaseConfig,
    pub supported_chains: HashMap<u64, ChainConfig>,
    pub config_file_path: Option<String>,
    pub last_modified: Option<u64>,
    pub version: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            environment: "development".to_string(),
            rpc_url: "https://rpc.test2.btcs.network".to_string(),
            chain_id: 1114,
            contract_address: "".to_string(),
            log_level: "info".to_string(),
            port: 4000,
            debug: false,
            enable_swagger: true,
            enable_cors_debug: false,
            rate_limits: RateLimitConfig::default(),
            security: SecurityConfig::default(),
            monitoring: MonitoringConfig::default(),
            database: DatabaseConfig::default(),
            supported_chains: HashMap::new(),
            config_file_path: None,
            last_modified: Some(Utc::now().timestamp() as u64),
            version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigStatus {
    pub is_valid: bool,
    pub last_reload_time: Option<DateTime<Utc>>,
    pub config_file_path: String,
    pub environment: String,
    pub total_settings: u32,
    pub validation_errors: Vec<String>,
    pub last_validation_time: Option<DateTime<Utc>>,
    pub uptime_seconds: f64,
    pub file_watcher_active: bool,
    pub last_backup_time: Option<DateTime<Utc>>,
}

impl Default for ConfigStatus {
    fn default() -> Self {
        Self {
            is_valid: false,
            last_reload_time: None,
            config_file_path: "config.json".to_string(),
            environment: "development".to_string(),
            total_settings: 0,
            validation_errors: Vec::new(),
            last_validation_time: None,
            uptime_seconds: 0.0,
            file_watcher_active: false,
            last_backup_time: None,
        }
    }
}

#[allow(dead_code)]
pub struct DynamicConfigManager {
    config: Arc<RwLock<Config>>,
    config_watcher: Option<notify::FsEventWatcher>,
    reload_sender: watch::Sender<bool>,
    reload_receiver: watch::Receiver<bool>,
    config_file_path: String,
    environment: String,
}

impl DynamicConfigManager {
    pub fn new() -> Result<Self> {
        let config = Config::new()?;
        let config_file_path = env::var("CONFIG_FILE").unwrap_or_else(|_| "config.json".to_string());
        
        let (reload_sender, reload_receiver) = watch::channel(false);
        
        let manager = Self {
            config: Arc::new(RwLock::new(config)),
            config_watcher: None,
            reload_sender,
            reload_receiver,
            config_file_path: config_file_path.clone(),
            environment: env::var("RUST_ENV").unwrap_or_else(|_| "development".to_string()),
        };
        
        // Start file watcher if config file exists
        if Path::new(&config_file_path).exists() {
            manager.start_file_watcher()?;
        }
        
        Ok(manager)
    }
    
    pub async fn get_config(&self) -> Config {
        self.config.read().await.clone()
    }
    
    pub async fn update_config(&self, new_config: Config) -> Result<()> {
        // Validate the new configuration
        new_config.validate()?;
        
        // Update the configuration
        let mut config = self.config.write().await;
        *config = new_config;
        
        // Notify reload
        let _ = self.reload_sender.send(true);
        
        println!("Configuration updated successfully");
        Ok(())
    }
    
    pub async fn reload_config(&self) -> Result<()> {
        let new_config = Config::new()?;
        self.update_config(new_config).await
    }
    

    
    pub fn start_file_watcher(&self) -> Result<()> {
        let config_file_path = self.config_file_path.clone();
        let reload_sender = self.reload_sender.clone();
        
        // Create a channel to receive the events.
        let (tx, rx) = channel();
        
        // Create a watcher object, delivering debounced events.
        let mut watcher = notify::recommended_watcher(tx)?;
        
        // Add a path to be watched. All files and directories at that path and
        // below will be monitored for changes.
        watcher.watch(config_file_path.as_ref(), notify::RecursiveMode::NonRecursive)?;
        
        // Start watching in a separate task
        tokio::spawn(async move {
            loop {
                match rx.recv() {
                    Ok(_) => {
                        println!("Config file changed: {config_file_path}");
                        sleep(Duration::from_millis(100)).await; // Debounce
                        let _ = reload_sender.send(true);
                    }
                    Err(e) => {
                        println!("Config watcher error: {e}");
                        break;
                    }
                }
            }
        });
        
        Ok(())
    }
    

    
    pub async fn export_config(&self) -> Result<String> {
        let config = self.config.read().await;
        serde_json::to_string_pretty(&*config)
            .map_err(|e| anyhow!("Failed to serialize config: {}", e))
    }
    
    pub async fn import_config(&self, config_json: &str) -> Result<()> {
        let new_config: Config = serde_json::from_str(config_json)
            .map_err(|e| anyhow!("Failed to deserialize config: {}", e))?;
        self.update_config(new_config).await
    }
    
    pub async fn validate_config(&self) -> Result<Vec<String>> {
        let config = self.config.read().await;
        let mut errors = Vec::new();
        
        // Validate required fields
        if config.rpc_url.is_empty() {
            errors.push("RPC_URL is required".to_string());
        }
        
        if config.contract_address.is_empty() {
            errors.push("CONTRACT_ADDRESS is required".to_string());
        }
        
        if config.security.jwt_secret.is_empty() {
            errors.push("JWT_SECRET is required".to_string());
        }
        
        if config.security.api_key.is_empty() {
            errors.push("API_KEY is required".to_string());
        }
        
        // Validate chain configuration
        if config.supported_chains.is_empty() {
            errors.push("At least one supported chain must be configured".to_string());
        }
        
        Ok(errors)
    }
    
    pub async fn get_config_summary(&self) -> serde_json::Value {
        let config = self.config.read().await;
        
        serde_json::json!({
            "environment": config.environment,
            "version": config.version,
            "port": config.port,
            "log_level": config.log_level,
            "debug": config.debug,
            "supported_chains_count": config.supported_chains.len(),
            "security_enabled": {
                "jwt_validation": config.security.enable_jwt_validation,
                "api_key_validation": config.security.enable_api_key_validation,
                "rate_limiting": config.security.enable_rate_limiting,
                "cors": config.security.enable_cors,
            },
            "monitoring_enabled": {
                "metrics": config.monitoring.enable_metrics,
                "health_checks": config.monitoring.enable_health_checks,
                "alerting": config.monitoring.enable_alerting,
            },
            "database_config": {
                "data_dir": config.database.data_dir,
                "backup_interval": config.database.backup_interval,
                "retention_days": config.database.retention_days,
                "encryption_enabled": config.database.enable_encryption,
            },
            "last_modified": config.last_modified,
        })
    }

    pub async fn get_status(&self) -> ConfigStatus {
        let start_time = std::time::Instant::now();
        
        // Get current config
        let config = self.config.read().await;
        
        // Validate configuration
        let validation_result = self.validate_config_internal(&config).await;
        let is_valid = validation_result.is_ok();
        let validation_errors = if let Err(e) = validation_result {
            vec![e.to_string()]
        } else {
            vec![]
        };
        
        // Count total settings
        let total_settings = serde_json::to_value(&*config)
            .map(|v| v.as_object().map(|obj| obj.len()).unwrap_or(0))
            .unwrap_or(0) as u32;
        
        // Check if file watcher is active
        let file_watcher_active = self.config_watcher.is_some();
        
        // Get backup information
        let backup_dir = std::path::Path::new("data/config/backups");
        let last_backup = if backup_dir.exists() {
            std::fs::read_dir(backup_dir)
                .ok()
                .and_then(|entries| {
                    entries
                        .filter_map(|entry| entry.ok())
                        .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "json"))
                        .max_by_key(|entry| entry.metadata().unwrap().modified().unwrap())
                })
                .and_then(|entry| {
                    entry.metadata().ok().and_then(|metadata| {
                        metadata.modified().ok().map(|modified| {
                            DateTime::from_timestamp(modified.duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64, 0)
                                .unwrap_or_else(Utc::now)
                        })
                    })
                })
        } else {
            None
        };
        
        ConfigStatus {
            is_valid,
            last_reload_time: Some(DateTime::from_timestamp(Instant::now().elapsed().as_secs() as i64, 0).unwrap_or_else(Utc::now)),
            config_file_path: self.config_file_path.clone(),
            environment: config.environment.clone(),
            total_settings,
            validation_errors,
            last_validation_time: Some(Utc::now()),
            uptime_seconds: start_time.elapsed().as_secs_f64(),
            file_watcher_active,
            last_backup_time: last_backup,
        }
    }

    async fn validate_config_internal(&self, config: &Config) -> Result<()> {
        // Basic validation
        if config.port == 0 {
            return Err(anyhow::anyhow!("Invalid server port"));
        }
        
        if config.rpc_url.is_empty() {
            return Err(anyhow::anyhow!("Invalid server host"));
        }
        
        // Validate security settings
        if config.security.jwt_secret.is_empty() {
            return Err(anyhow::anyhow!("JWT secret cannot be empty"));
        }
        
        // Validate database settings
        if config.database.data_dir.is_empty() {
            return Err(anyhow::anyhow!("Database path cannot be empty"));
        }
        
        Ok(())
    }
}

impl Config {
    pub fn new() -> Result<Self> {
        let env = Self::validate_and_get_env_var("RUST_ENV", "development", false)?;
        
        // Load environment variables
        dotenv::dotenv().ok();
        
        // Validate critical environment variables on startup
        Self::validate_startup_env_vars()?;
        
        // Try to load from config file first
        if let Ok(config) = Self::load_from_file() {
            return Ok(config);
        }
        
        // Fallback to environment-based configuration
        let config = match env.as_str() {
            "development" => Self::development_config()?,
            "staging" => Self::staging_config()?,
            "production" => Self::production_config()?,
            _ => Self::development_config()?,
        };
        
        // Validate configuration
        config.validate()?;
        
        Ok(config)
    }
    
    /// Validates critical environment variables on startup
    fn validate_startup_env_vars() -> Result<()> {
        let mut errors = Vec::new();
        
        // Check for required environment variables based on environment
        let env = env::var("RUST_ENV").unwrap_or_else(|_| "development".to_string());
        
        match env.as_str() {
            "production" => {
                let required_vars = [
                    "RPC_URL",
                    "CHAIN_ID", 
                    "CONTRACT_ADDRESS",
                    "API_KEY",
                    "JWT_SECRET"
                ];
                
                for var in &required_vars {
                    if let Err(_) = env::var(var) {
                        errors.push(format!("Required environment variable {} is not set for production", var));
                    } else if env::var(var).unwrap().is_empty() {
                        errors.push(format!("Required environment variable {} is empty for production", var));
                    }
                }
            }
            "staging" => {
                let required_vars = ["API_KEY", "JWT_SECRET"];
                
                for var in &required_vars {
                    if let Err(_) = env::var(var) {
                        errors.push(format!("Required environment variable {} is not set for staging", var));
                    } else if env::var(var).unwrap().is_empty() {
                        errors.push(format!("Required environment variable {} is empty for staging", var));
                    }
                }
            }
            _ => {
                // Development environment - no required vars, but validate if present
                if let Ok(contract_addr) = env::var("CONTRACT_ADDRESS") {
                    if !contract_addr.is_empty() && !Self::is_valid_hex_address(&contract_addr) {
                        errors.push(format!("Invalid CONTRACT_ADDRESS format: '{}'. Expected: 0x followed by 40 hex characters", contract_addr));
                    }
                }
            }
        }
        
        if !errors.is_empty() {
            return Err(anyhow!("Environment validation failed:\n{}", errors.join("\n")));
        }
        
        Ok(())
    }
    
    fn load_from_file() -> Result<Self> {
        let config_file = env::var("CONFIG_FILE").unwrap_or_else(|_| "config.json".to_string());
        
        if Path::new(&config_file).exists() {
            let content = fs::read_to_string(&config_file)
                .map_err(|e| anyhow!("Failed to read config file: {}", e))?;
            let mut config: Config = serde_json::from_str(&content)
                .map_err(|e| anyhow!("Failed to deserialize config: {}", e))?;
            config.last_modified = Some(Utc::now().timestamp() as u64);
            Ok(config)
        } else {
            Err(anyhow!("Config file not found"))
        }
    }
    
    pub fn save_to_file(&self, file_path: &str) -> Result<()> {
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| anyhow!("Failed to serialize config: {}", e))?;
        fs::write(file_path, content)
            .map_err(|e| anyhow!("Failed to write config file: {}", e))?;
        Ok(())
    }
    
    pub fn development_config() -> Result<Self> {
        Ok(Self {
            environment: "development".to_string(),
            rpc_url: env::var("RPC_URL").unwrap_or_else(|_| "https://rpc.test2.btcs.network".to_string()),
            chain_id: u64::from_str(&env::var("CHAIN_ID").unwrap_or_else(|_| "1114".to_string()))?,
            contract_address: env::var("CONTRACT_ADDRESS").unwrap_or_else(|_| "".to_string()),
            log_level: "debug".to_string(),
            port: u16::from_str(&env::var("PORT").unwrap_or_else(|_| "4000".to_string()))?,
            debug: env::var("DEBUG").unwrap_or_else(|_| "true".to_string()) == "true",
            enable_swagger: env::var("ENABLE_SWAGGER").unwrap_or_else(|_| "true".to_string()) == "true",
            enable_cors_debug: env::var("ENABLE_CORS_DEBUG").unwrap_or_else(|_| "true".to_string()) == "true",
            version: env!("CARGO_PKG_VERSION").to_string(),
            rate_limits: RateLimitConfig {
                window_ms: 15 * 60 * 1000,
                max_requests: u32::from_str(&env::var("RATE_LIMIT_MAX").unwrap_or_else(|_| "1000".to_string()))?,
            },
            security: SecurityConfig {
                enable_jwt_validation: true,
                enable_api_key_validation: true,
                enable_rate_limiting: true,
                enable_cors: true,
                cors_origins: env::var("CORS_ORIGINS").unwrap_or_else(|_| "*".to_string()),
                jwt_secret: env::var("JWT_SECRET").unwrap_or_else(|_| "dev_jwt_secret".to_string()),
                api_key: env::var("API_KEY").unwrap_or_else(|_| "dev_api_key".to_string()),
                max_connections: 100,
                session_timeout: 3600,
            },
            monitoring: MonitoringConfig {
                enable_metrics: true,
                enable_health_checks: true,
                enable_alerting: false,
                log_requests: true,
                metrics_interval: 60,
                health_check_interval: 30,
            },
            database: DatabaseConfig {
                data_dir: env::var("DATA_DIR").unwrap_or_else(|_| "./data".to_string()),
                backup_interval: 3600,
                retention_days: 30,
                enable_encryption: false,
                compression_enabled: true,
            },
            supported_chains: Self::get_supported_chains(),
            config_file_path: None,
            last_modified: Some(Utc::now().timestamp() as u64),
        })
    }
    
    fn staging_config() -> Result<Self> {
        Ok(Self {
            environment: "staging".to_string(),
            rpc_url: env::var("RPC_URL").unwrap_or_else(|_| "https://rpc.test2.btcs.network".to_string()),
            chain_id: u64::from_str(&env::var("CHAIN_ID").unwrap_or_else(|_| "1114".to_string()))?,
            contract_address: env::var("CONTRACT_ADDRESS").unwrap_or_else(|_| "".to_string()),
            log_level: "info".to_string(),
            port: u16::from_str(&env::var("PORT").unwrap_or_else(|_| "4000".to_string()))?,
            debug: env::var("DEBUG").unwrap_or_else(|_| "false".to_string()) == "true",
            enable_swagger: env::var("ENABLE_SWAGGER").unwrap_or_else(|_| "true".to_string()) == "true",
            enable_cors_debug: env::var("ENABLE_CORS_DEBUG").unwrap_or_else(|_| "false".to_string()) == "true",
            version: env!("CARGO_PKG_VERSION").to_string(),
            rate_limits: RateLimitConfig {
                window_ms: 15 * 60 * 1000,
                max_requests: u32::from_str(&env::var("RATE_LIMIT_MAX").unwrap_or_else(|_| "500".to_string()))?,
            },
            security: SecurityConfig {
                enable_jwt_validation: true,
                enable_api_key_validation: true,
                enable_rate_limiting: true,
                enable_cors: true,
                cors_origins: env::var("CORS_ORIGINS").unwrap_or_else(|_| "https://staging.airchainpay.com,https://staging-wallet.airchainpay.com".to_string()),
                jwt_secret: env::var("JWT_SECRET").unwrap_or_else(|_| "staging_secret".to_string()),
                api_key: env::var("API_KEY").unwrap_or_else(|_| "staging_key".to_string()),
                max_connections: 50,
                session_timeout: 1800,
            },
            monitoring: MonitoringConfig {
                enable_metrics: env::var("ENABLE_METRICS").unwrap_or_else(|_| "true".to_string()) == "true",
                enable_health_checks: env::var("ENABLE_HEALTH_CHECKS").unwrap_or_else(|_| "true".to_string()) == "true",
                enable_alerting: false,
                log_requests: env::var("LOG_REQUESTS").unwrap_or_else(|_| "true".to_string()) == "true",
                metrics_interval: 60,
                health_check_interval: 30,
            },
            database: DatabaseConfig {
                data_dir: env::var("DATA_DIR").unwrap_or_else(|_| "./data".to_string()),
                backup_interval: 3600,
                retention_days: 30,
                enable_encryption: false,
                compression_enabled: true,
            },
            supported_chains: Self::get_supported_chains(),
            config_file_path: None,
            last_modified: Some(Utc::now().timestamp() as u64),
        })
    }
    
    fn production_config() -> Result<Self> {
        Ok(Self {
            environment: "production".to_string(),
            rpc_url: env::var("RPC_URL").unwrap_or_else(|_| "https://rpc.test2.btcs.network".to_string()),
            chain_id: u64::from_str(&env::var("CHAIN_ID").unwrap_or_else(|_| "1114".to_string()))?,
            contract_address: env::var("CONTRACT_ADDRESS").unwrap_or_else(|_| "".to_string()),
            log_level: env::var("LOG_LEVEL").unwrap_or_else(|_| "warn".to_string()),
            port: u16::from_str(&env::var("PORT").unwrap_or_else(|_| "4000".to_string()))?,
            debug: env::var("DEBUG").unwrap_or_else(|_| "false".to_string()) == "true",
            enable_swagger: env::var("ENABLE_SWAGGER").unwrap_or_else(|_| "true".to_string()) == "true",
            enable_cors_debug: env::var("ENABLE_CORS_DEBUG").unwrap_or_else(|_| "false".to_string()) == "true",
            version: env!("CARGO_PKG_VERSION").to_string(),
            rate_limits: RateLimitConfig {
                window_ms: 15 * 60 * 1000,
                max_requests: u32::from_str(&env::var("RATE_LIMIT_MAX").unwrap_or_else(|_| "100".to_string()))?,
            },
            security: SecurityConfig {
                enable_jwt_validation: env::var("ENABLE_JWT_VALIDATION").unwrap_or_else(|_| "true".to_string()) != "false",
                enable_api_key_validation: env::var("ENABLE_API_KEY_VALIDATION").unwrap_or_else(|_| "true".to_string()) != "false",
                enable_rate_limiting: env::var("ENABLE_RATE_LIMITING").unwrap_or_else(|_| "true".to_string()) != "false",
                enable_cors: env::var("ENABLE_CORS").unwrap_or_else(|_| "true".to_string()) != "false",
                cors_origins: env::var("CORS_ORIGINS").unwrap_or_else(|_| "https://app.airchainpay.com,https://wallet.airchainpay.com".to_string()),
                jwt_secret: env::var("JWT_SECRET").unwrap_or_else(|_| "production_secret".to_string()),
                api_key: env::var("API_KEY").unwrap_or_else(|_| "production_key".to_string()),
                max_connections: 100,
                session_timeout: 3600,
            },
            monitoring: MonitoringConfig {
                enable_metrics: env::var("ENABLE_METRICS").unwrap_or_else(|_| "true".to_string()) == "true",
                enable_health_checks: env::var("ENABLE_HEALTH_CHECKS").unwrap_or_else(|_| "true".to_string()) == "true",
                enable_alerting: env::var("ENABLE_ALERTING").unwrap_or_else(|_| "true".to_string()) == "true",
                log_requests: env::var("LOG_REQUESTS").unwrap_or_else(|_| "true".to_string()) == "true",
                metrics_interval: 60,
                health_check_interval: 30,
            },
            database: DatabaseConfig {
                data_dir: env::var("DATA_DIR").unwrap_or_else(|_| "./data".to_string()),
                backup_interval: 3600,
                retention_days: 30,
                enable_encryption: true,
                compression_enabled: true,
            },
            supported_chains: Self::get_supported_chains(),
            config_file_path: None,
            last_modified: Some(Utc::now().timestamp() as u64),
        })
    }
    
    /// Validates if a string is a valid hex address (0x followed by 40 hex characters)
    pub fn is_valid_hex_address(address: &str) -> bool {
        if !address.starts_with("0x") {
            return false;
        }
        
        let hex_part = &address[2..];
        if hex_part.len() != 40 {
            return false;
        }
        
        hex_part.chars().all(|c| c.is_ascii_hexdigit())
    }
    
    /// Validates environment variables and provides fallback values
    pub fn validate_and_get_env_var(key: &str, fallback: &str, required: bool) -> Result<String> {
        match env::var(key) {
            Ok(value) => {
                if value.is_empty() {
                    if required {
                        return Err(anyhow!("Environment variable {} is required but empty", key));
                    }
                    Ok(fallback.to_string())
                } else {
                    Ok(value)
                }
            }
            Err(_) => {
                if required {
                    return Err(anyhow!("Required environment variable {} is not set", key));
                }
                Ok(fallback.to_string())
            }
        }
    }
    
    /// Validates contract addresses and provides fallback values
    pub fn validate_contract_address(env_key: &str, fallback: &str, chain_name: &str) -> Result<String> {
        let address = Self::validate_and_get_env_var(env_key, fallback, false)?;
        
        if !Self::is_valid_hex_address(&address) {
            return Err(anyhow!(
                "Invalid contract address for {}: '{}'. Expected format: 0x followed by 40 hex characters",
                chain_name,
                address
            ));
        }
        
        Ok(address)
    }
    
    fn get_supported_chains() -> HashMap<u64, ChainConfig> {
        let mut chains = HashMap::new();
        
        // Core Testnet 2 (Primary)
        let core_testnet2_address = Self::validate_contract_address(
            "CORE_TESTNET2_CONTRACT_ADDRESS",
            "0xcE2D2A50DaA794c12d079F2E2E2aF656ebB981fF",
            "Core Testnet 2"
        ).unwrap_or_else(|e| {
            eprintln!("Warning: {}", e);
            "0xcE2D2A50DaA794c12d079F2E2E2aF656ebB981fF".to_string()
        });
        
        chains.insert(1114, ChainConfig {
            name: "Core Testnet 2".to_string(),
            rpc_url: Self::validate_and_get_env_var(
                "CORE_TESTNET2_RPC_URL",
                "https://rpc.test2.btcs.network",
                false
            ).unwrap_or_else(|e| {
                eprintln!("Warning: {}", e);
                "https://rpc.test2.btcs.network".to_string()
            }),
            contract_address: core_testnet2_address,
            explorer: Self::validate_and_get_env_var(
                "CORE_TESTNET2_BLOCK_EXPLORER",
                "https://scan.test2.btcs.network",
                false
            ).unwrap_or_else(|e| {
                eprintln!("Warning: {}", e);
                "https://scan.test2.btcs.network".to_string()
            }),
            currency_symbol: Some(Self::validate_and_get_env_var(
                "CORE_TESTNET2_CURRENCY_SYMBOL",
                "TCORE2",
                false
            ).unwrap_or_else(|e| {
                eprintln!("Warning: {}", e);
                "TCORE2".to_string()
            })),
            max_gas_limit: None,
        });
        
        // Base Sepolia Testnet (Secondary)
        let base_sepolia_address = Self::validate_contract_address(
            "BASE_SEPOLIA_CONTRACT_ADDRESS",
            "0x8d7eaB03a72974F5D9F5c99B4e4e1B393DBcfCAB",
            "Base Sepolia"
        ).unwrap_or_else(|e| {
            eprintln!("Warning: {}", e);
            "0x8d7eaB03a72974F5D9F5c99B4e4e1B393DBcfCAB".to_string()
        });
        
        chains.insert(84532, ChainConfig {
            name: "Base Sepolia Testnet".to_string(),
            rpc_url: Self::validate_and_get_env_var(
                "BASE_SEPOLIA_RPC_URL",
                "https://sepolia.base.org",
                false
            ).unwrap_or_else(|e| {
                eprintln!("Warning: {}", e);
                "https://sepolia.base.org".to_string()
            }),
            contract_address: base_sepolia_address,
            explorer: Self::validate_and_get_env_var(
                "BASE_SEPOLIA_BLOCK_EXPLORER",
                "https://sepolia.basescan.org",
                false
            ).unwrap_or_else(|e| {
                eprintln!("Warning: {}", e);
                "https://sepolia.basescan.org".to_string()
            }),
            currency_symbol: Some(Self::validate_and_get_env_var(
                "BASE_SEPOLIA_CURRENCY_SYMBOL",
                "ETH",
                false
            ).unwrap_or_else(|e| {
                eprintln!("Warning: {}", e);
                "ETH".to_string()
            })),
            max_gas_limit: None,
        });
        
        // Lisk Sepolia Testnet
        let lisk_sepolia_address = Self::validate_contract_address(
            "LISK_SEPOLIA_CONTRACT_ADDRESS",
            "0xaBEEEc6e6c1f6bfDE1d05db74B28847Ba5b44EAF",
            "Lisk Sepolia"
        ).unwrap_or_else(|e| {
            eprintln!("Warning: {}", e);
            "0xaBEEEc6e6c1f6bfDE1d05db74B28847Ba5b44EAF".to_string()
        });
        
        chains.insert(4202, ChainConfig {
            name: "Lisk Sepolia Testnet".to_string(),
            rpc_url: Self::validate_and_get_env_var(
                "LISK_SEPOLIA_RPC_URL",
                "https://rpc.sepolia-api.lisk.com",
                false
            ).unwrap_or_else(|e| {
                eprintln!("Warning: {}", e);
                "https://rpc.sepolia-api.lisk.com".to_string()
            }),
            contract_address: lisk_sepolia_address,
            explorer: Self::validate_and_get_env_var(
                "LISK_SEPOLIA_BLOCK_EXPLORER",
                "https://sepolia.lisk.com",
                false
            ).unwrap_or_else(|e| {
                eprintln!("Warning: {}", e);
                "https://sepolia.lisk.com".to_string()
            }),
            currency_symbol: Some(Self::validate_and_get_env_var(
                "LISK_SEPOLIA_CURRENCY_SYMBOL",
                "LSK",
                false
            ).unwrap_or_else(|e| {
                eprintln!("Warning: {}", e);
                "LSK".to_string()
            })),
            max_gas_limit: None,
        });
        
        // Ethereum Holesky Testnet
        let holesky_address = Self::validate_contract_address(
            "HOLESKY_CONTRACT_ADDRESS",
            "0x26C59cd738Df90604Ebb13Ed8DB76657cfD51f40",
            "Ethereum Holesky"
        ).unwrap_or_else(|e| {
            eprintln!("Warning: {}", e);
            "0x26C59cd738Df90604Ebb13Ed8DB76657cfD51f40".to_string()
        });
        
        chains.insert(17000, ChainConfig {
            name: "Ethereum Holesky Testnet".to_string(),
            rpc_url: Self::validate_and_get_env_var(
                "HOLESKY_RPC_URL",
                "https://ethereum-holesky.publicnode.com",
                false
            ).unwrap_or_else(|e| {
                eprintln!("Warning: {}", e);
                "https://ethereum-holesky.publicnode.com".to_string()
            }),
            contract_address: holesky_address,
            explorer: Self::validate_and_get_env_var(
                "HOLESKY_BLOCK_EXPLORER",
                "https://holesky.etherscan.io",
                false
            ).unwrap_or_else(|e| {
                eprintln!("Warning: {}", e);
                "https://holesky.etherscan.io".to_string()
            }),
            currency_symbol: Some(Self::validate_and_get_env_var(
                "HOLESKY_CURRENCY_SYMBOL",
                "ETH",
                false
            ).unwrap_or_else(|e| {
                eprintln!("Warning: {}", e);
                "ETH".to_string()
            })),
            max_gas_limit: None,
        });
        
        chains
    }
    
    fn validate(&self) -> Result<()> {
        // Validate main contract address
        if !self.contract_address.is_empty() && !Self::is_valid_hex_address(&self.contract_address) {
            return Err(anyhow!(
                "Invalid main contract address: '{}'. Expected format: 0x followed by 40 hex characters",
                self.contract_address
            ));
        }
        
        // Validate RPC URL
        if self.rpc_url.is_empty() {
            return Err(anyhow!("RPC_URL is required and cannot be empty"));
        }
        
        // Validate chain configurations
        for (chain_id, chain_config) in &self.supported_chains {
            if !Self::is_valid_hex_address(&chain_config.contract_address) {
                return Err(anyhow!(
                    "Invalid contract address for chain {} ({}): '{}'. Expected format: 0x followed by 40 hex characters",
                    chain_id,
                    chain_config.name,
                    chain_config.contract_address
                ));
            }
            
            if chain_config.rpc_url.is_empty() {
                return Err(anyhow!(
                    "RPC URL is required for chain {} ({})",
                    chain_id,
                    chain_config.name
                ));
            }
        }
        
        match self.environment.as_str() {
            "production" => {
                let required_fields = [
                    ("RPC_URL", &self.rpc_url),
                    ("CHAIN_ID", &self.chain_id.to_string()),
                    ("CONTRACT_ADDRESS", &self.contract_address),
                    ("API_KEY", &self.security.api_key),
                    ("JWT_SECRET", &self.security.jwt_secret),
                ];
                
                for (field_name, value) in required_fields.iter() {
                    if value.is_empty() {
                        return Err(anyhow!("{} is required in production environment", field_name));
                    }
                }
            }
            "staging" => {
                if self.security.api_key.is_empty() {
                    return Err(anyhow!("API_KEY is required in staging environment"));
                }
                if self.security.jwt_secret.is_empty() {
                    return Err(anyhow!("JWT_SECRET is required in staging environment"));
                }
            }
            _ => {}
        }
        
        Ok(())
    }
    

    
    
} 

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_hex_address_validation() {
        // Valid addresses
        assert!(Config::is_valid_hex_address("0x1234567890123456789012345678901234567890"));
        assert!(Config::is_valid_hex_address("0xabcdefABCDEF1234567890abcdefABCDEF123456"));
        assert!(Config::is_valid_hex_address("0x0000000000000000000000000000000000000000"));
        
        // Invalid addresses
        assert!(!Config::is_valid_hex_address("0x123456789012345678901234567890123456789")); // Too short
        assert!(!Config::is_valid_hex_address("0x12345678901234567890123456789012345678901")); // Too long
        assert!(!Config::is_valid_hex_address("1234567890123456789012345678901234567890")); // No 0x prefix
        assert!(!Config::is_valid_hex_address("0x123456789012345678901234567890123456789g")); // Invalid character
        assert!(!Config::is_valid_hex_address("")); // Empty
        assert!(!Config::is_valid_hex_address("0x")); // Just prefix
    }
    
    #[test]
    fn test_validate_and_get_env_var() {
        // Test with fallback when env var doesn't exist
        let result = Config::validate_and_get_env_var("NONEXISTENT_VAR", "fallback", false);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "fallback");
        
        // Test with fallback when env var is empty
        std::env::set_var("TEST_EMPTY_VAR", "");
        let result = Config::validate_and_get_env_var("TEST_EMPTY_VAR", "fallback", false);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "fallback");
        
        // Test with actual value
        std::env::set_var("TEST_VALID_VAR", "test_value");
        let result = Config::validate_and_get_env_var("TEST_VALID_VAR", "fallback", false);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "test_value");
        
        // Clean up
        std::env::remove_var("TEST_EMPTY_VAR");
        std::env::remove_var("TEST_VALID_VAR");
    }
    
    #[test]
    fn test_validate_contract_address() {
        // Test valid address
        let result = Config::validate_contract_address(
            "TEST_CONTRACT_ADDR",
            "0x1234567890123456789012345678901234567890",
            "Test Chain"
        );
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "0x1234567890123456789012345678901234567890");
        
        // Test invalid address in environment
        std::env::set_var("TEST_INVALID_ADDR", "invalid_address");
        let result = Config::validate_contract_address(
            "TEST_INVALID_ADDR",
            "0x1234567890123456789012345678901234567890",
            "Test Chain"
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Invalid contract address"));
        
        // Clean up
        std::env::remove_var("TEST_INVALID_ADDR");
    }
    
    #[test]
    fn test_config_validation() {
        // Test that configuration loads and validates correctly
        match Config::new() {
            Ok(config) => {
                // Test that all contract addresses are valid
                for (chain_id, chain_config) in &config.supported_chains {
                    assert!(
                        Config::is_valid_hex_address(&chain_config.contract_address),
                        "Invalid contract address for chain {}: {}",
                        chain_id,
                        chain_config.contract_address
                    );
                }
                
                // Test that RPC URLs are not empty
                for (chain_id, chain_config) in &config.supported_chains {
                    assert!(
                        !chain_config.rpc_url.is_empty(),
                        "Empty RPC URL for chain {}",
                        chain_id
                    );
                }
            }
            Err(e) => {
                panic!("Configuration loading failed: {}", e);
            }
        }
    }
} 