//! Constants for the wallet core
//! 
//! This module contains all constants used throughout the wallet core.

// Platform and architecture constants
pub const PLATFORM: &str = "darwin"; // Default for development
pub const ARCHITECTURE: &str = "aarch64"; // Default for development

// Build information
pub const BUILD_DATE: &str = "2024-01-01"; // Default for development
pub const GIT_COMMIT: &str = "development"; // Default for development

// Wallet constants
pub const WALLET_VERSION: &str = "1.0.0";
pub const BACKUP_VERSION: &str = "1.0.0";
pub const WALLET_NAME_MAX_LENGTH: usize = 50;
pub const WALLET_NAME_MIN_LENGTH: usize = 1;

// Security constants
pub const PRIVATE_KEY_SIZE: usize = 32;
pub const PUBLIC_KEY_SIZE: usize = 65;
pub const KEY_SIZE: usize = 32;
pub const NONCE_SIZE: usize = 12;
pub const TAG_SIZE: usize = 16;
pub const SALT_SIZE: usize = 32;
pub const HASH_SIZE: usize = 32;
pub const SIGNATURE_SIZE: usize = 64;

// Password constants
pub const PASSWORD_MIN_LENGTH: usize = 8;
pub const PASSWORD_MAX_LENGTH: usize = 128;
pub const PASSWORD_REQUIRE_UPPERCASE: bool = true;
pub const PASSWORD_REQUIRE_LOWERCASE: bool = true;
pub const PASSWORD_REQUIRE_NUMBERS: bool = true;
pub const PASSWORD_REQUIRE_SPECIAL: bool = true;

// Transaction constants
pub const DEFAULT_GAS_LIMIT: u64 = 21000;
pub const DEFAULT_GAS_PRICE: u64 = 20000000000; // 20 Gwei
pub const MAX_GAS_LIMIT: u64 = 30000000;
pub const MIN_GAS_LIMIT: u64 = 21000;
pub const MAX_GAS_PRICE: u64 = 1000000000000; // 1000 Gwei
pub const MIN_GAS_PRICE: u64 = 1000000000; // 1 Gwei

// Storage constants
pub const MAX_STORAGE_SIZE: usize = 1024 * 1024 * 100; // 100MB
pub const MAX_BACKUP_SIZE: usize = 1024 * 1024 * 10; // 10MB
pub const STORAGE_KEY_PREFIX: &str = "airchainpay_wallet_";
pub const BACKUP_KEY_PREFIX: &str = "airchainpay_backup_";

// BLE constants
pub const BLE_SERVICE_UUID: &str = "12345678-1234-1234-1234-abcdefabcdef";
pub const BLE_CHARACTERISTIC_UUID: &str = "87654321-4321-4321-4321-cba987654321";
pub const BLE_ADVERTISEMENT_INTERVAL: u32 = 100; // milliseconds
pub const BLE_CONNECTION_TIMEOUT: u32 = 30000; // milliseconds
pub const BLE_SCAN_TIMEOUT: u32 = 10000; // milliseconds

// Performance constants
pub const MAX_CONCURRENT_OPERATIONS: usize = 10;
pub const OPERATION_TIMEOUT: u64 = 30000; // milliseconds
pub const CACHE_SIZE: usize = 1000;
pub const MAX_RETRY_ATTEMPTS: u32 = 3;

// Error handling constants
pub const MAX_ERROR_MESSAGE_LENGTH: usize = 500;
pub const MAX_LOG_MESSAGE_LENGTH: usize = 1000;
pub const ERROR_RETRY_DELAY: u64 = 1000; // milliseconds

// Supported networks
pub const SUPPORTED_NETWORKS: &[&str] = &[
    "core_testnet",
    "base_sepolia",
    "lisk_sepolia",
    "holesky",
];

// Network configurations
#[derive(Debug, Clone)]
pub struct NetworkConfig {
    pub chain_id: u64,
    pub name: &'static str,
    pub rpc_url: &'static str,
    pub block_explorer: &'static str,
    pub native_currency: &'static str,
    pub contract_address: &'static str,
}

pub static CORE_TESTNET_CONFIG: NetworkConfig = NetworkConfig {
    chain_id: 1114,
    name: "Core Testnet",
    rpc_url: "https://rpc.test2.btcs.network",
    block_explorer: "https://scan.test2.btcs.network",
    native_currency: "TCORE2",
    contract_address: "0x8d7eaB03a72974F5D9F5c99B4e4e1B393DBcfCAB",
};

pub static BASE_SEPOLIA_CONFIG: NetworkConfig = NetworkConfig {
    chain_id: 84532,
    name: "Base Sepolia",
    rpc_url: "https://sepolia.base.org",
    block_explorer: "https://sepolia.basescan.org",
    native_currency: "ETH",
    contract_address: "0x7B79117445C57eea1CEAb4733020A55e1D503934",
};

pub static LISK_SEPOLIA_CONFIG: NetworkConfig = NetworkConfig {
    chain_id: 4202,
    name: "Lisk Sepolia",
    // Intentionally empty: require env override via WALLET_CORE_RPC_LISK_SEPOLIA
    rpc_url: "",
    block_explorer: "https://sepolia.lisk.com",
    native_currency: "ETH",
    contract_address: "0xaBEEEc6e6c1f6bfDE1d05db74B28847Ba5b44EAF",
};

pub static HOLESKY_CONFIG: NetworkConfig = NetworkConfig {
    chain_id: 17000,
    name: "Ethereum Holesky",
    // Intentionally empty: require env override via WALLET_CORE_RPC_HOLESKY
    rpc_url: "",
    block_explorer: "https://holesky.etherscan.io",
    native_currency: "ETH",
    contract_address: "0x26C59cd738Df90604Ebb13Ed8DB76657cfD51f40",
};

// Token configurations
#[derive(Debug, Clone)]
pub struct TokenConfig {
    pub symbol: &'static str,
    pub name: &'static str,
    pub decimals: u8,
    pub address: &'static str,
    pub chain_id: &'static str,
    pub is_native: bool,
    pub is_stablecoin: bool,
}

pub static TCORE2_TOKEN: TokenConfig = TokenConfig {
    symbol: "TCORE2",
    name: "Core Testnet Token",
    decimals: 18,
    address: "0x0000000000000000000000000000000000000000",
    chain_id: "core_testnet",
    is_native: true,
    is_stablecoin: false,
};

pub static ETH_TOKEN: TokenConfig = TokenConfig {
    symbol: "ETH",
    name: "Ethereum",
    decimals: 18,
    address: "0x0000000000000000000000000000000000000000",
    chain_id: "base_sepolia",
    is_native: true,
    is_stablecoin: false,
};

// Feature flags
pub const ENABLE_BLE: bool = true;
pub const ENABLE_QR_CODE: bool = true;
pub const ENABLE_BACKUP: bool = true;
pub const ENABLE_MULTI_CHAIN: bool = true;
pub const ENABLE_HARDWARE_ACCELERATION: bool = true;

// Development and testing constants
pub const DEV_MODE: bool = cfg!(debug_assertions);
pub const TEST_MODE: bool = cfg!(test);
pub const LOG_LEVEL: &str = if cfg!(debug_assertions) { "debug" } else { "info" };

// Cryptographic constants
pub const ARGON2_MEMORY_COST: u32 = 65536; // 64MB
pub const ARGON2_TIME_COST: u32 = 3;
pub const ARGON2_PARALLELISM: u32 = 1;
pub const PBKDF2_ITERATIONS: u32 = 100000;
pub const AES_KEY_SIZE: usize = 32;
pub const CHACHA_KEY_SIZE: usize = 32;

// Validation constants
pub const MIN_ADDRESS_LENGTH: usize = 42; // 0x + 40 hex chars
pub const MAX_ADDRESS_LENGTH: usize = 42;
pub const MIN_PRIVATE_KEY_LENGTH: usize = 66; // 0x + 64 hex chars
pub const MAX_PRIVATE_KEY_LENGTH: usize = 66;
pub const MIN_SEED_PHRASE_WORDS: usize = 12;
pub const MAX_SEED_PHRASE_WORDS: usize = 24;

// Time constants
pub const WALLET_LOCK_TIMEOUT: u64 = 300; // 5 minutes
pub const SESSION_TIMEOUT: u64 = 3600; // 1 hour
pub const BACKUP_RETENTION_DAYS: u64 = 30;

// Network timeouts
pub const RPC_TIMEOUT: u64 = 30000; // 30 seconds
pub const BLOCKCHAIN_SYNC_TIMEOUT: u64 = 60000; // 60 seconds
pub const TRANSACTION_CONFIRMATION_TIMEOUT: u64 = 300000; // 5 minutes

// Memory and performance limits
pub const MAX_WALLET_COUNT: usize = 100;
pub const MAX_TRANSACTION_HISTORY: usize = 1000;
pub const MAX_BACKUP_COUNT: usize = 10;
pub const MAX_CONCURRENT_REQUESTS: usize = 50;

// Security limits
pub const MAX_LOGIN_ATTEMPTS: u32 = 5;
pub const LOCKOUT_DURATION: u64 = 300; // 5 minutes
pub const PASSWORD_HISTORY_SIZE: usize = 5;
pub const MAX_SESSION_COUNT: usize = 3;

// Build information
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const NAME: &str = env!("CARGO_PKG_NAME");
pub const DESCRIPTION: &str = env!("CARGO_PKG_DESCRIPTION");
pub const AUTHORS: &str = env!("CARGO_PKG_AUTHORS");
pub const HOMEPAGE: &str = env!("CARGO_PKG_HOMEPAGE");
pub const REPOSITORY: &str = env!("CARGO_PKG_REPOSITORY");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_network_configs() {
        assert_eq!(CORE_TESTNET_CONFIG.chain_id, 1114);
        assert_eq!(BASE_SEPOLIA_CONFIG.chain_id, 84532);
        assert_eq!(CORE_TESTNET_CONFIG.native_currency, "TCORE2");
        assert_eq!(BASE_SEPOLIA_CONFIG.native_currency, "ETH");
    }

    #[test]
    fn test_token_configs() {
        assert_eq!(TCORE2_TOKEN.symbol, "TCORE2");
        assert_eq!(ETH_TOKEN.symbol, "ETH");
        assert!(TCORE2_TOKEN.is_native);
        assert!(ETH_TOKEN.is_native);
    }

    #[test]
    fn test_supported_networks() {
        assert!(SUPPORTED_NETWORKS.contains(&"core_testnet"));
        assert!(SUPPORTED_NETWORKS.contains(&"base_sepolia"));
        assert!(SUPPORTED_NETWORKS.contains(&"lisk_sepolia"));
        assert!(SUPPORTED_NETWORKS.contains(&"holesky"));
        assert_eq!(SUPPORTED_NETWORKS.len(), 4);
    }

    #[test]
    fn test_security_constants() {
        assert_eq!(PRIVATE_KEY_SIZE, 32);
        assert_eq!(PUBLIC_KEY_SIZE, 65);
        assert_eq!(SIGNATURE_SIZE, 64);
        assert_eq!(HASH_SIZE, 32);
    }

    #[test]
    fn test_validation_constants() {
        assert_eq!(MIN_ADDRESS_LENGTH, 42);
        assert_eq!(MAX_ADDRESS_LENGTH, 42);
        assert_eq!(MIN_PRIVATE_KEY_LENGTH, 66);
        assert_eq!(MAX_PRIVATE_KEY_LENGTH, 66);
    }
} 