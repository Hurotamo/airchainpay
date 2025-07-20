//! Application constants and configuration values
//! 
//! This module contains all constants used throughout the wallet core,
//! including cryptographic parameters, network configurations, and security settings.

use std::collections::HashMap;
use lazy_static::lazy_static;

// Cryptographic constants
pub const SECP256K1_CURVE: &str = "secp256k1";
pub const PRIVATE_KEY_SIZE: usize = 32;
pub const PUBLIC_KEY_SIZE: usize = 65;
pub const ADDRESS_SIZE: usize = 20;
pub const SIGNATURE_SIZE: usize = 65;

// Password hashing constants
pub const ARGON2_MEMORY_COST: u32 = 65536; // 64MB
pub const ARGON2_TIME_COST: u32 = 3;
pub const ARGON2_PARALLELISM: u32 = 4;
pub const ARGON2_SALT_LENGTH: usize = 32;
pub const PBKDF2_ITERATIONS: u32 = 100_000;

// Encryption constants
pub const AES_KEY_SIZE: usize = 32;
pub const AES_NONCE_SIZE: usize = 12;
pub const AES_TAG_SIZE: usize = 16;
pub const CHACHA20_KEY_SIZE: usize = 32;
pub const CHACHA20_NONCE_SIZE: usize = 12;

// BLE constants
pub const BLE_SERVICE_UUID: &str = "12345678-1234-1234-1234-123456789abc";
pub const BLE_CHARACTERISTIC_UUID: &str = "87654321-4321-4321-4321-cba987654321";
pub const BLE_MTU_SIZE: usize = 512;
pub const BLE_MAX_PACKET_SIZE: usize = 20;

// Network constants
pub const DEFAULT_GAS_LIMIT: u64 = 21000;
pub const DEFAULT_GAS_PRICE: u64 = 20_000_000_000; // 20 Gwei
pub const MAX_GAS_PRICE: u64 = 100_000_000_000; // 100 Gwei
pub const MIN_GAS_PRICE: u64 = 1_000_000_000; // 1 Gwei

// Storage constants
pub const MAX_WALLET_BACKUP_SIZE: usize = 1024 * 1024; // 1MB
pub const MAX_SEED_PHRASE_LENGTH: usize = 512;
pub const MAX_PASSWORD_LENGTH: usize = 128;
pub const MIN_PASSWORD_LENGTH: usize = 8;

// Security constants
pub const MAX_LOGIN_ATTEMPTS: u32 = 5;
pub const LOCKOUT_DURATION_SECONDS: u64 = 300; // 5 minutes
pub const SESSION_TIMEOUT_SECONDS: u64 = 3600; // 1 hour
pub const MAX_SESSION_DURATION_SECONDS: u64 = 86400; // 24 hours

// Performance constants
pub const MAX_CONCURRENT_TRANSACTIONS: usize = 10;
pub const TRANSACTION_TIMEOUT_SECONDS: u64 = 300; // 5 minutes
pub const BALANCE_UPDATE_INTERVAL_SECONDS: u64 = 30;
pub const GAS_PRICE_UPDATE_INTERVAL_SECONDS: u64 = 60;

// Error constants
pub const MAX_ERROR_MESSAGE_LENGTH: usize = 256;
pub const MAX_STACK_TRACE_LENGTH: usize = 1024;

// Network chain IDs
lazy_static! {
    pub static ref CHAIN_IDS: HashMap<&'static str, u64> = {
        let mut m = HashMap::new();
        m.insert("ethereum", 1);
        m.insert("base", 8453);
        m.insert("core", 1116);
        m.insert("polygon", 137);
        m.insert("arbitrum", 42161);
        m.insert("optimism", 10);
        m.insert("sepolia", 11155111);
        m.insert("goerli", 5);
        m
    };
}

// Network RPC URLs
lazy_static! {
    pub static ref RPC_URLS: HashMap<&'static str, &'static str> = {
        let mut m = HashMap::new();
        m.insert("ethereum", "https://eth-mainnet.g.alchemy.com/v2/");
        m.insert("base", "https://mainnet.base.org");
        m.insert("core", "https://rpc.coredao.org");
        m.insert("polygon", "https://polygon-rpc.com");
        m.insert("arbitrum", "https://arb1.arbitrum.io/rpc");
        m.insert("optimism", "https://mainnet.optimism.io");
        m.insert("sepolia", "https://eth-sepolia.g.alchemy.com/v2/");
        m.insert("goerli", "https://eth-goerli.g.alchemy.com/v2/");
        m
    };
}

// Token addresses
lazy_static! {
    pub static ref TOKEN_ADDRESSES: HashMap<&'static str, &'static str> = {
        let mut m = HashMap::new();
        m.insert("usdc_ethereum", "0xA0b86a33E6441b8C4C8C8C8C8C8C8C8C8C8C8C8");
        m.insert("usdt_ethereum", "0xdAC17F958D2ee523a2206206994597C13D831ec7");
        m.insert("usdc_base", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
        m.insert("usdt_base", "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb");
        m
    };
}

// Feature flags
pub const FEATURE_MULTI_CHAIN: bool = true;
pub const FEATURE_BLE_PAYMENTS: bool = true;
pub const FEATURE_QR_PAYMENTS: bool = true;
pub const FEATURE_HARDWARE_WALLET: bool = false;
pub const FEATURE_MULTI_SIG: bool = false;

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

// Backup constants
pub const BACKUP_ENCRYPTION_ALGORITHM: &str = "AES-256-GCM";
pub const BACKUP_COMPRESSION_ENABLED: bool = true;
pub const BACKUP_VERSION: u32 = 1;

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

// Platform-specific constants
#[cfg(target_os = "ios")]
pub const PLATFORM: &str = "ios";

#[cfg(target_os = "android")]
pub const PLATFORM: &str = "android";

#[cfg(target_os = "linux")]
pub const PLATFORM: &str = "linux";

#[cfg(target_os = "macos")]
pub const PLATFORM: &str = "macos";

#[cfg(target_os = "windows")]
pub const PLATFORM: &str = "windows";

#[cfg(not(any(target_os = "ios", target_os = "android", target_os = "linux", target_os = "macos", target_os = "windows")))]
pub const PLATFORM: &str = "unknown";

// Architecture-specific constants
#[cfg(target_arch = "x86_64")]
pub const ARCHITECTURE: &str = "x86_64";

#[cfg(target_arch = "aarch64")]
pub const ARCHITECTURE: &str = "aarch64";

#[cfg(target_arch = "arm")]
pub const ARCHITECTURE: &str = "arm";

#[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64", target_arch = "arm")))]
pub const ARCHITECTURE: &str = "unknown";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chain_ids() {
        assert_eq!(CHAIN_IDS.get("ethereum"), Some(&1));
        assert_eq!(CHAIN_IDS.get("base"), Some(&8453));
        assert_eq!(CHAIN_IDS.get("core"), Some(&1116));
    }

    #[test]
    fn test_rpc_urls() {
        assert!(RPC_URLS.get("ethereum").is_some());
        assert!(RPC_URLS.get("base").is_some());
        assert!(RPC_URLS.get("core").is_some());
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