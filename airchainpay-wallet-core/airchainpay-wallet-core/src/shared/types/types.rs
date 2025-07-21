//! Shared types and data structures
//! 
//! This module contains common types and data structures used throughout
//! the wallet core, including transactions, balances, and other shared entities.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// Basic types for wallet operations
pub type Address = String;
pub type PrivateKey = String;
pub type PublicKey = String;
pub type TransactionHash = String;
pub type BlockNumber = u64;
pub type GasPrice = u64;
pub type GasLimit = u64;
pub type Amount = String; // Use string for precise decimal handling
pub type Balance = String;

// Network types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Network {
    CoreTestnet,
    BaseSepolia,
}

impl Network {
    pub fn chain_id(&self) -> u64 {
        match self {
            Network::CoreTestnet => 1114,
            Network::BaseSepolia => 84532,
}
    }

    pub fn name(&self) -> &'static str {
        match self {
            Network::CoreTestnet => "Core Testnet",
            Network::BaseSepolia => "Base Sepolia",
        }
    }

    pub fn rpc_url(&self) -> &'static str {
        match self {
            Network::CoreTestnet => "https://rpc.test2.btcs.network",
            Network::BaseSepolia => "https://sepolia.base.org",
        }
    }

    pub fn native_currency(&self) -> &'static str {
        match self {
            Network::CoreTestnet => "TCORE2",
            Network::BaseSepolia => "ETH",
        }
    }
}

// Transaction types - minimal and aligned with TypeScript
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub to: Address,
    pub value: Amount,
    pub data: Option<Vec<u8>>,
    pub gas_limit: Option<GasLimit>,
    pub gas_price: Option<GasPrice>,
    pub nonce: Option<u64>,
    pub chain_id: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedTransaction {
    pub transaction: Transaction,
    pub signature: Vec<u8>,
    pub hash: TransactionHash,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TransactionStatus {
    Pending,
    Confirmed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionReceipt {
    pub hash: TransactionHash,
    pub status: TransactionStatus,
    pub block_number: Option<BlockNumber>,
    pub gas_used: Option<GasLimit>,
    pub effective_gas_price: Option<GasPrice>,
    pub chain_id: u64,
}

// Token types - aligned with TypeScript TokenInfo
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenInfo {
    pub symbol: String,
    pub name: String,
    pub decimals: u8,
    pub address: Address,
    pub chain_id: String,
    pub is_native: bool,
    pub is_stablecoin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenBalance {
    pub token: TokenInfo,
    pub balance: Amount,
    pub formatted_balance: String,
}

// Wallet types - minimal and focused
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletInfo {
    pub address: Address,
    pub balance: Balance,
    pub network: Network,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletBackup {
    pub version: String,
    pub wallet_data: Vec<u8>,
    pub checksum: String,
    pub timestamp: u64,
}

// BLE types - minimal for payment functionality
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BLEPaymentData {
    pub amount: Amount,
    pub to_address: Address,
    pub token_symbol: String,
    pub network: Network,
    pub reference: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BLEDeviceInfo {
    pub id: String,
    pub name: String,
    pub address: String,
    pub rssi: i32,
}

// Error types - simplified
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletError {
    pub code: String,
    pub message: String,
    pub details: Option<String>,
}

// Configuration types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletConfig {
    pub networks: Vec<Network>,
    pub default_network: Network,
    pub gas_price_strategy: GasPriceStrategy,
    pub security_level: SecurityLevel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GasPriceStrategy {
    Low,
    Medium,
    High,
    Custom(GasPrice),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SecurityLevel {
    Low,
    Medium,
    High,
}

// Utility types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkStatus {
    pub network: Network,
    pub is_connected: bool,
    pub block_number: Option<BlockNumber>,
    pub gas_price: Option<GasPrice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentRequest {
    pub amount: Amount,
    pub to_address: Address,
    pub token: TokenInfo,
    pub network: Network,
    pub reference: Option<String>,
    pub gas_price: Option<GasPrice>,
}

// Result types for better error handling
pub type WalletResult<T> = Result<T, WalletError>;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::entities::wallet::Network;

    #[test]
    fn test_transaction_creation() {
        let transaction = Transaction {
            to: "0x1234".to_string(),
            value: "1000000000000000000".to_string(),
            data: None,
            gas_limit: None,
            gas_price: None,
            nonce: None,
            chain_id: 1114,
        };

        assert_eq!(transaction.to, "0x1234");
        assert_eq!(transaction.value, "1000000000000000000");
    }

    #[test]
    fn test_secure_private_key() {
        let key_bytes = [1u8; 32];
        let private_key = SecurePrivateKey::new(key_bytes);
        
        assert_eq!(private_key.as_bytes(), &key_bytes);
        assert_eq!(private_key.to_hex(), "0101010101010101010101010101010101010101010101010101010101010101");
    }

    #[test]
    fn test_secure_seed_phrase() {
        let words = vec!["abandon".to_string(), "ability".to_string(), "able".to_string()];
        let seed_phrase = SecureSeedPhrase::new(words.clone());
        
        assert_eq!(seed_phrase.as_words(), &words);
        assert_eq!(seed_phrase.to_string(), "abandon ability able");
    }

    #[test]
    fn test_wallet_backup_validation() {
        let backup = WalletBackup {
            version: "1.0".to_string(),
            wallet_data: vec![1, 2, 3, 4],
            checksum: "12345".to_string(),
            timestamp: 1234567890,
        };

        assert!(backup.is_valid());
        assert!(!backup.is_old());
    }

    #[test]
    fn test_wallet_config_default() {
        let config = WalletConfig::default();
        
        assert_eq!(config.security_level, crate::shared::constants::DEFAULT_SECURITY_LEVEL);
        assert!(config.auto_backup_enabled);
        assert!(config.biometric_auth_enabled);
        assert!(config.multi_chain_enabled);
        assert!(config.ble_enabled);
        assert_eq!(config.log_level, "info");
        assert_eq!(config.max_wallets, 10);
        assert_eq!(config.session_timeout_seconds, 3600);
    }
} 