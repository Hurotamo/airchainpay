use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::str::FromStr;
use anyhow::{Result, anyhow};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChainConfig {
    pub name: String,
    pub rpc_url: String,
    pub contract_address: String,
    pub explorer: String,
    pub currency_symbol: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitConfig {
    pub window_ms: u64,
    pub max_requests: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub rpc_url: String,
    pub chain_id: u64,
    pub contract_address: String,
    pub api_key: String,
    pub jwt_secret: String,
    pub log_level: String,
    pub port: u16,
    pub cors_origins: String,
    pub rate_limits: RateLimitConfig,
    pub debug: bool,
    pub enable_swagger: bool,
    pub enable_cors_debug: bool,
    pub enable_metrics: bool,
    pub enable_health_checks: bool,
    pub log_requests: bool,
    pub enable_alerting: bool,
    pub enable_rate_limiting: bool,
    pub enable_cors: bool,
    pub enable_jwt_validation: bool,
    pub enable_api_key_validation: bool,
    pub supported_chains: HashMap<u64, ChainConfig>,
}

impl Config {
    pub fn new() -> Result<Self> {
        let env = env::var("RUST_ENV").unwrap_or_else(|_| "development".to_string());
        
        // Load environment variables
        dotenv::dotenv().ok();
        
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
    
    fn development_config() -> Result<Self> {
        Ok(Self {
            rpc_url: env::var("RPC_URL").unwrap_or_else(|_| "https://sepolia.base.org".to_string()),
            chain_id: u64::from_str(&env::var("CHAIN_ID").unwrap_or_else(|_| "84532".to_string()))?,
            contract_address: env::var("CONTRACT_ADDRESS").unwrap_or_else(|_| "0x7B79117445C57eea1CEAb4733020A55e1D503934".to_string()),
            api_key: env::var("API_KEY").unwrap_or_else(|_| "dev_api_key".to_string()),
            jwt_secret: env::var("JWT_SECRET").unwrap_or_else(|_| "dev_jwt_secret".to_string()),
            log_level: "debug".to_string(),
            port: u16::from_str(&env::var("PORT").unwrap_or_else(|_| "4000".to_string()))?,
            cors_origins: env::var("CORS_ORIGINS").unwrap_or_else(|_| "*".to_string()),
            rate_limits: RateLimitConfig {
                window_ms: 15 * 60 * 1000,
                max_requests: u32::from_str(&env::var("RATE_LIMIT_MAX").unwrap_or_else(|_| "1000".to_string()))?,
            },
            debug: env::var("DEBUG").unwrap_or_else(|_| "true".to_string()) == "true",
            enable_swagger: env::var("ENABLE_SWAGGER").unwrap_or_else(|_| "true".to_string()) == "true",
            enable_cors_debug: env::var("ENABLE_CORS_DEBUG").unwrap_or_else(|_| "true".to_string()) == "true",
            enable_metrics: true,
            enable_health_checks: true,
            log_requests: true,
            enable_alerting: false,
            enable_rate_limiting: true,
            enable_cors: true,
            enable_jwt_validation: true,
            enable_api_key_validation: true,
            supported_chains: Self::get_supported_chains(),
        })
    }
    
    fn staging_config() -> Result<Self> {
        Ok(Self {
            rpc_url: env::var("RPC_URL").unwrap_or_else(|_| "https://sepolia.base.org".to_string()),
            chain_id: u64::from_str(&env::var("CHAIN_ID").unwrap_or_else(|_| "84532".to_string()))?,
            contract_address: env::var("CONTRACT_ADDRESS").unwrap_or_else(|_| "0x7B79117445C57eea1CEAb4733020A55e1D503934".to_string()),
            api_key: env::var("API_KEY").ok_or_else(|| anyhow!("API_KEY required in staging"))?,
            jwt_secret: env::var("JWT_SECRET").ok_or_else(|| anyhow!("JWT_SECRET required in staging"))?,
            log_level: "info".to_string(),
            port: u16::from_str(&env::var("PORT").unwrap_or_else(|_| "4000".to_string()))?,
            cors_origins: env::var("CORS_ORIGINS").unwrap_or_else(|_| "https://staging.airchainpay.com,https://staging-wallet.airchainpay.com".to_string()),
            rate_limits: RateLimitConfig {
                window_ms: 15 * 60 * 1000,
                max_requests: u32::from_str(&env::var("RATE_LIMIT_MAX").unwrap_or_else(|_| "500".to_string()))?,
            },
            debug: env::var("DEBUG").unwrap_or_else(|_| "false".to_string()) == "true",
            enable_swagger: env::var("ENABLE_SWAGGER").unwrap_or_else(|_| "true".to_string()) == "true",
            enable_cors_debug: env::var("ENABLE_CORS_DEBUG").unwrap_or_else(|_| "false".to_string()) == "true",
            enable_metrics: env::var("ENABLE_METRICS").unwrap_or_else(|_| "true".to_string()) == "true",
            enable_health_checks: env::var("ENABLE_HEALTH_CHECKS").unwrap_or_else(|_| "true".to_string()) == "true",
            log_requests: env::var("LOG_REQUESTS").unwrap_or_else(|_| "true".to_string()) == "true",
            enable_alerting: false,
            enable_rate_limiting: true,
            enable_cors: true,
            enable_jwt_validation: true,
            enable_api_key_validation: true,
            supported_chains: Self::get_supported_chains(),
        })
    }
    
    fn production_config() -> Result<Self> {
        Ok(Self {
            rpc_url: env::var("RPC_URL").ok_or_else(|| anyhow!("RPC_URL required in production"))?,
            chain_id: u64::from_str(&env::var("CHAIN_ID").ok_or_else(|| anyhow!("CHAIN_ID required in production"))?)?,
            contract_address: env::var("CONTRACT_ADDRESS").ok_or_else(|| anyhow!("CONTRACT_ADDRESS required in production"))?,
            api_key: env::var("API_KEY").ok_or_else(|| anyhow!("API_KEY required in production"))?,
            jwt_secret: env::var("JWT_SECRET").ok_or_else(|| anyhow!("JWT_SECRET required in production"))?,
            log_level: env::var("LOG_LEVEL").unwrap_or_else(|_| "warn".to_string()),
            port: u16::from_str(&env::var("PORT").unwrap_or_else(|_| "4000".to_string()))?,
            cors_origins: env::var("CORS_ORIGINS").unwrap_or_else(|_| "https://app.airchainpay.com,https://wallet.airchainpay.com".to_string()),
            rate_limits: RateLimitConfig {
                window_ms: 15 * 60 * 1000,
                max_requests: u32::from_str(&env::var("RATE_LIMIT_MAX").unwrap_or_else(|_| "100".to_string()))?,
            },
            debug: env::var("DEBUG").unwrap_or_else(|_| "false".to_string()) == "true",
            enable_swagger: env::var("ENABLE_SWAGGER").unwrap_or_else(|_| "true".to_string()) == "true",
            enable_cors_debug: env::var("ENABLE_CORS_DEBUG").unwrap_or_else(|_| "false".to_string()) == "true",
            enable_metrics: env::var("ENABLE_METRICS").unwrap_or_else(|_| "true".to_string()) == "true",
            enable_health_checks: env::var("ENABLE_HEALTH_CHECKS").unwrap_or_else(|_| "true".to_string()) == "true",
            log_requests: env::var("LOG_REQUESTS").unwrap_or_else(|_| "true".to_string()) == "true",
            enable_alerting: env::var("ENABLE_ALERTING").unwrap_or_else(|_| "true".to_string()) == "true",
            enable_rate_limiting: env::var("ENABLE_RATE_LIMITING").unwrap_or_else(|_| "true".to_string()) != "false",
            enable_cors: env::var("ENABLE_CORS").unwrap_or_else(|_| "true".to_string()) != "false",
            enable_jwt_validation: env::var("ENABLE_JWT_VALIDATION").unwrap_or_else(|_| "true".to_string()) != "false",
            enable_api_key_validation: env::var("ENABLE_API_KEY_VALIDATION").unwrap_or_else(|_| "true".to_string()) != "false",
            supported_chains: Self::get_supported_chains(),
        })
    }
    
    fn get_supported_chains() -> HashMap<u64, ChainConfig> {
        let mut chains = HashMap::new();
        
        // Base Sepolia
        chains.insert(84532, ChainConfig {
            name: "Base Sepolia".to_string(),
            rpc_url: "https://sepolia.base.org".to_string(),
            contract_address: env::var("BASE_SEPOLIA_CONTRACT_ADDRESS").unwrap_or_else(|_| "0x7B79117445C57eea1CEAb4733020A55e1D503934".to_string()),
            explorer: "https://sepolia.basescan.org".to_string(),
            currency_symbol: None,
        });
        
        // Core Testnet
        chains.insert(11155420, ChainConfig {
            name: "Core Testnet".to_string(),
            rpc_url: "https://rpc.test.btcs.network".to_string(),
            contract_address: env::var("CORE_TESTNET_CONTRACT_ADDRESS").unwrap_or_else(|_| "0x8d7eaB03a72974F5D9F5c99B4e4e1B393DBcfCAB".to_string()),
            explorer: "https://scan.test2.btcs.network".to_string(),
            currency_symbol: None,
        });
        
        // Core Testnet 2
        chains.insert(1114, ChainConfig {
            name: "Core Testnet 2".to_string(),
            rpc_url: env::var("RPC_URL").unwrap_or_else(|_| "https://rpc.test2.btcs.network".to_string()),
            contract_address: env::var("CONTRACT_ADDRESS").unwrap_or_else(|_| "".to_string()),
            explorer: env::var("BLOCK_EXPLORER").unwrap_or_else(|_| "https://scan.test2.btcs.network".to_string()),
            currency_symbol: Some(env::var("CURRENCY_SYMBOL").unwrap_or_else(|_| "TCORE2".to_string())),
        });
        
        // Base Mainnet
        chains.insert(8453, ChainConfig {
            name: "Base Mainnet".to_string(),
            rpc_url: env::var("BASE_MAINNET_RPC_URL").unwrap_or_else(|_| "https://mainnet.base.org".to_string()),
            contract_address: env::var("BASE_MAINNET_CONTRACT_ADDRESS").unwrap_or_else(|_| "".to_string()),
            explorer: "https://basescan.org".to_string(),
            currency_symbol: None,
        });
        
        // Core Mainnet
        chains.insert(1116, ChainConfig {
            name: "Core Mainnet".to_string(),
            rpc_url: env::var("CORE_MAINNET_RPC_URL").unwrap_or_else(|_| "https://rpc.coredao.org".to_string()),
            contract_address: env::var("CORE_MAINNET_CONTRACT_ADDRESS").unwrap_or_else(|_| "".to_string()),
            explorer: "https://scan.coredao.org".to_string(),
            currency_symbol: None,
        });
        
        chains
    }
    
    fn validate(&self) -> Result<()> {
        let env = env::var("RUST_ENV").unwrap_or_else(|_| "development".to_string());
        
        match env.as_str() {
            "production" => {
                let required_fields = [
                    ("RPC_URL", &self.rpc_url),
                    ("CHAIN_ID", &self.chain_id.to_string()),
                    ("CONTRACT_ADDRESS", &self.contract_address),
                    ("API_KEY", &self.api_key),
                    ("JWT_SECRET", &self.jwt_secret),
                ];
                
                for (field_name, value) in required_fields.iter() {
                    if value.is_empty() {
                        return Err(anyhow!("{} is required in production environment", field_name));
                    }
                }
            }
            "staging" => {
                if self.api_key.is_empty() {
                    return Err(anyhow!("API_KEY is required in staging environment"));
                }
                if self.jwt_secret.is_empty() {
                    return Err(anyhow!("JWT_SECRET is required in staging environment"));
                }
            }
            _ => {}
        }
        
        Ok(())
    }
    
    pub fn get_chain_config(&self, chain_id: u64) -> Option<&ChainConfig> {
        self.supported_chains.get(&chain_id)
    }
} 