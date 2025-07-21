//! Application constants and configuration values
//! 
//! This module contains all constants used throughout the wallet core,
//! including cryptographic parameters, network configurations, and security settings.

use std::collections::HashMap;
use lazy_static::lazy_static;

// Core constants for wallet operations
pub const PRIVATE_KEY_SIZE: usize = 32;
pub const BACKUP_VERSION: &str = "1.0.0";
pub const PLATFORM: &str = env!("CARGO_CFG_TARGET_OS");
pub const ARCHITECTURE: &str = env!("CARGO_CFG_TARGET_ARCH");

// Security constants
pub const PASSWORD_MIN_LENGTH: usize = 8;
pub const PASSWORD_MAX_LENGTH: usize = 128;
pub const SALT_SIZE: usize = 32;
pub const KEY_SIZE: usize = 32;
pub const NONCE_SIZE: usize = 12;
pub const TAG_SIZE: usize = 16;

// Transaction constants
pub const MAX_TRANSACTION_SIZE: usize = 1024 * 1024; // 1MB
pub const MAX_GAS_LIMIT: u64 = 30_000_000;
pub const MIN_GAS_PRICE: u64 = 1_000_000_000; // 1 gwei
pub const MAX_GAS_PRICE: u64 = 100_000_000_000; // 100 gwei

// Storage constants
pub const MAX_STORAGE_SIZE: usize = 1024 * 1024; // 1MB
pub const MAX_BACKUP_SIZE: usize = 1024 * 1024; // 1MB
pub const BACKUP_ENCRYPTION_ALGORITHM: &str = "AES-256-GCM";

// BLE constants
pub const BLE_MAX_PACKET_SIZE: usize = 512;
pub const BLE_CONNECTION_TIMEOUT_MS: u64 = 30000;
pub const BLE_DISCOVERY_TIMEOUT_MS: u64 = 10000;

// Performance constants
pub const MAX_CONCURRENT_TRANSACTIONS: usize = 10;
pub const TRANSACTION_TIMEOUT_SECONDS: u64 = 300; // 5 minutes
pub const BALANCE_UPDATE_INTERVAL_SECONDS: u64 = 30;
pub const GAS_PRICE_UPDATE_INTERVAL_SECONDS: u64 = 60;

// Error constants
pub const MAX_ERROR_MESSAGE_LENGTH: usize = 256;
pub const MAX_STACK_TRACE_LENGTH: usize = 1024;

// Supported Networks - Only Core Testnet and Base Sepolia as specified
lazy_static! {
    pub static ref SUPPORTED_NETWORKS: HashMap<&'static str, NetworkConfig> = {
        let mut m = HashMap::new();
        
        // Core Testnet
        m.insert("core_testnet", NetworkConfig {
            id: "core_testnet",
            name: "Core Testnet",
            chain_id: 1114,
            rpc_url: "https://rpc.test2.btcs.network",
            block_explorer: "https://scan.test2.btcs.network",
            native_currency: "TCORE2",
            decimals: 18,
            contract_address: "0x8d7eaB03a72974F5D9F5c99B4e4e1B393DBcfCAB",
        });
        
        // Base Sepolia
        m.insert("base_sepolia", NetworkConfig {
            id: "base_sepolia", 
            name: "Base Sepolia",
            chain_id: 84532,
            rpc_url: "https://sepolia.base.org",
            block_explorer: "https://sepolia.basescan.org",
            native_currency: "ETH",
            decimals: 18,
            contract_address: "0x7B79117445C57eea1CEAb4733020A55e1D503934",
        });
        
        m
    };
}

// Token configurations for supported networks
lazy_static! {
    pub static ref TOKEN_CONFIGS: HashMap<&'static str, TokenConfig> = {
        let mut m = HashMap::new();
        
        // Core Testnet tokens
        m.insert("core_testnet_usdc", TokenConfig {
            symbol: "USDC",
            name: "USD Coin",
            address: "0x960a4ecbd07ee1700e96df39242f1a13e904d50c",
            decimals: 6,
            is_stablecoin: true,
            network: "core_testnet",
        });
        
        m.insert("core_testnet_usdt", TokenConfig {
            symbol: "USDT", 
            name: "Tether USD",
            address: "0x2df197428353c8847b8c3d042eb9d50e52f14b5a",
            decimals: 6,
            is_stablecoin: true,
            network: "core_testnet",
        });
        
        // Base Sepolia tokens
        m.insert("base_sepolia_usdc", TokenConfig {
            symbol: "USDC",
            name: "USD Coin", 
            address: "0xa52C05C9726f1DeFc3d9b0eB5411C66F0920bBeC",
            decimals: 6,
            is_stablecoin: true,
            network: "base_sepolia",
        });
        
        m.insert("base_sepolia_usdt", TokenConfig {
            symbol: "USDT",
            name: "Tether USD",
            address: "0x3c6E5e4F0b3B56a5324E5e6D2a009b34Eb63885d", 
            decimals: 6,
            is_stablecoin: true,
            network: "base_sepolia",
        });
        
        m
    };
}

// Network configuration struct
#[derive(Debug, Clone)]
pub struct NetworkConfig {
    pub id: &'static str,
    pub name: &'static str,
    pub chain_id: u64,
    pub rpc_url: &'static str,
    pub block_explorer: &'static str,
    pub native_currency: &'static str,
    pub decimals: u8,
    pub contract_address: &'static str,
}

// Token configuration struct
#[derive(Debug, Clone)]
pub struct TokenConfig {
    pub symbol: &'static str,
    pub name: &'static str,
    pub address: &'static str,
    pub decimals: u8,
    pub is_stablecoin: bool,
    pub network: &'static str,
}

// Feature flags - simplified to match actual implementation
pub const FEATURE_MULTI_CHAIN: bool = true;
pub const FEATURE_TOKEN_SUPPORT: bool = true;
pub const FEATURE_BLE_PAYMENTS: bool = true;
pub const FEATURE_QR_SCANNING: bool = true;
pub const FEATURE_SECURE_STORAGE: bool = true;

// Build information
pub const BUILD_TIMESTAMP: &str = env!("VERGEN_BUILD_TIMESTAMP");
pub const GIT_COMMIT_HASH: &str = env!("VERGEN_GIT_SHA");
pub const GIT_BRANCH: &str = env!("VERGEN_GIT_BRANCH");
pub const RUST_VERSION: &str = env!("VERGEN_RUSTC_SEMVER");

// Logging constants
pub const LOG_LEVEL: &str = "info";
pub const LOG_FORMAT: &str = "json";
pub const LOG_FILE_PATH: &str = "logs/wallet_core.log";
pub const MAX_LOG_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10MB
pub const MAX_LOG_FILES: u32 = 5;

// Metrics constants
pub const METRICS_ENABLED: bool = true;
pub const METRICS_PORT: u16 = 9090;
pub const METRICS_PATH: &str = "/metrics";

// Health check constants
pub const HEALTH_CHECK_INTERVAL_SECONDS: u64 = 30;
pub const HEALTH_CHECK_TIMEOUT_SECONDS: u64 = 5;

// Cache constants
pub const CACHE_TTL_SECONDS: u64 = 300; // 5 minutes
pub const CACHE_MAX_SIZE: usize = 1000;
pub const CACHE_CLEANUP_INTERVAL_SECONDS: u64 = 60;

// Rate limiting constants
pub const RATE_LIMIT_REQUESTS_PER_MINUTE: u32 = 100;
pub const RATE_LIMIT_BURST_SIZE: u32 = 10;

// Validation constants
pub const MIN_TRANSACTION_AMOUNT: u64 = 1;
pub const MAX_TRANSACTION_AMOUNT: u64 = 1_000_000_000_000_000_000; // 1 ETH in wei
pub const MIN_GAS_LIMIT: u64 = 21000;
pub const MAX_GAS_LIMIT: u64 = 30_000_000;

// Recovery constants
pub const RECOVERY_PHRASE_LENGTH: usize = 12;
pub const RECOVERY_PHRASE_WORD_COUNT: usize = 2048;
pub const RECOVERY_PHRASE_CHECKSUM_BITS: usize = 4;

// Security levels
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SecurityLevel {
    Low,
    Medium,
    High,
    Maximum,
}

impl SecurityLevel {
    pub fn argon2_memory_cost(&self) -> u32 {
        match self {
            SecurityLevel::Low => 32768,    // 32MB
            SecurityLevel::Medium => 65536,  // 64MB
            SecurityLevel::High => 131072,   // 128MB
            SecurityLevel::Maximum => 262144, // 256MB
        }
    }

    pub fn argon2_time_cost(&self) -> u32 {
        match self {
            SecurityLevel::Low => 2,
            SecurityLevel::Medium => 3,
            SecurityLevel::High => 4,
            SecurityLevel::Maximum => 5,
        }
    }

    pub fn session_timeout_seconds(&self) -> u64 {
        match self {
            SecurityLevel::Low => 3600,     // 1 hour
            SecurityLevel::Medium => 1800,   // 30 minutes
            SecurityLevel::High => 900,      // 15 minutes
            SecurityLevel::Maximum => 300,   // 5 minutes
        }
    }

    pub fn max_login_attempts(&self) -> u32 {
        match self {
            SecurityLevel::Low => 10,
            SecurityLevel::Medium => 5,
            SecurityLevel::High => 3,
            SecurityLevel::Maximum => 1,
        }
    }
}

// Default security level
pub const DEFAULT_SECURITY_LEVEL: SecurityLevel = SecurityLevel::High;

// Environment-specific constants
#[cfg(debug_assertions)]
pub const IS_DEBUG_BUILD: bool = true;

#[cfg(not(debug_assertions))]
pub const IS_DEBUG_BUILD: bool = false;

#[cfg(test)]
pub const IS_TEST_BUILD: bool = true;

#[cfg(not(test))]
pub const IS_TEST_BUILD: bool = false;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_supported_networks() {
        assert!(SUPPORTED_NETWORKS.contains_key("core_testnet"));
        assert!(SUPPORTED_NETWORKS.contains_key("base_sepolia"));
    }

    #[test]
    fn test_token_configs() {
        assert!(TOKEN_CONFIGS.contains_key("core_testnet_usdc"));
        assert!(TOKEN_CONFIGS.contains_key("core_testnet_usdt"));
        assert!(TOKEN_CONFIGS.contains_key("base_sepolia_usdc"));
        assert!(TOKEN_CONFIGS.contains_key("base_sepolia_usdt"));
    }

    #[test]
    fn test_security_levels() {
        assert_eq!(SecurityLevel::Low.argon2_memory_cost(), 32768);
        assert_eq!(SecurityLevel::Medium.argon2_memory_cost(), 65536);
        assert_eq!(SecurityLevel::High.argon2_memory_cost(), 131072);
        assert_eq!(SecurityLevel::Maximum.argon2_memory_cost(), 262144);
    }

    #[test]
    fn test_platform_constants() {
        assert!(!PLATFORM.is_empty());
        assert!(!ARCHITECTURE.is_empty());
    }
} 