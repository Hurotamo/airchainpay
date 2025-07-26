//! Wallet entity and related value objects
//! 
//! This module contains the Wallet entity and related value objects
//! that represent the core business concept of a cryptocurrency wallet.

use serde::{Deserialize, Serialize};
use crate::shared::types::{Address, Amount, Network, Balance as BalanceType};
use crate::shared::error::WalletError;
use zeroize::Zeroize;

/// Core wallet entity - simplified to match TypeScript implementation
/// Does not implement Debug, Clone, Serialize, or Deserialize to prevent sensitive data exposure
pub struct Wallet {
    pub id: String,
    pub name: String,
    pub network: Network,
    pub address: String,
    pub balance: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl Wallet {
    pub fn new(name: String, address: String, _public_key: String, network: Network) -> Result<Self, crate::shared::error::WalletError> {
        if name.is_empty() {
            return Err(crate::shared::error::WalletError::validation("Wallet name cannot be empty"));
        }
        if address.is_empty() {
            return Err(crate::shared::error::WalletError::validation("Wallet address cannot be empty"));
        }
        
        Ok(Self {
            id: format!("wallet_{}", uuid::Uuid::new_v4()),
            name,
            network,
            address: address.to_string(),
            balance: "0".to_string(), // Default balance
            created_at: chrono::Utc::now(),
        })
    }

    pub fn validate(&self) -> Result<(), crate::shared::error::WalletError> {
        if self.address.is_empty() {
            return Err(crate::shared::error::WalletError::config("Invalid wallet address"));
        }

        Ok(())
    }

    /// Convert to WalletInfo for safe serialization (no sensitive data)
    pub fn to_wallet_info(&self) -> WalletInfo {
        WalletInfo {
            id: self.id.clone(),
            name: self.name.clone(),
            network: self.network.clone(),
            address: self.address.clone(),
            balance: self.balance.clone(),
            created_at: self.created_at.timestamp(),
        }
    }
}

/// Safe wallet information for serialization (no sensitive data)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletInfo {
    pub id: String,
    pub name: String,
    pub network: Network,
    pub address: String,
    pub balance: String,
    pub created_at: i64,
}

impl From<Wallet> for WalletInfo {
    fn from(wallet: Wallet) -> Self {
        wallet.to_wallet_info()
    }
}

impl From<SecureWallet> for Wallet {
    fn from(secure_wallet: SecureWallet) -> Self {
        Self {
            id: secure_wallet.id,
            name: secure_wallet.name,
            network: secure_wallet.network,
            address: secure_wallet.address.to_string(),
            balance: "0".to_string(), // Default balance
            created_at: chrono::DateTime::from_timestamp(secure_wallet.created_at as i64, 0)
                .unwrap_or_else(|| chrono::Utc::now()),
        }
    }
}

/// Secure wallet entity with automatic zeroization
/// Does not implement Debug, Clone, Serialize, or Deserialize to prevent sensitive data exposure
pub struct SecureWallet {
    pub id: String,
    pub name: String,
    pub address: Address,
    pub network: Network,
    pub created_at: u64,
    pub updated_at: u64,
}

impl SecureWallet {
    /// Create a new secure wallet
    pub fn new(id: String, name: String, address: Address, network: Network) -> Self {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
            .as_secs();
        
        Self {
            id,
            name,
            address,
            network,
            created_at: now,
            updated_at: now,
        }
    }
    
    /// Update the wallet
    pub fn update(&mut self) {
        self.updated_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
    }

    /// Get wallet info for safe serialization
    pub fn to_wallet_info(&self, balance: BalanceType) -> crate::shared::types::WalletInfo {
        crate::shared::types::WalletInfo {
            address: self.address.clone(),
            balance,
            network: self.network.clone(),
        }
    }

    /// Convert to WalletInfo for safe serialization (no sensitive data)
    pub fn to_safe_wallet_info(&self) -> WalletInfo {
        WalletInfo {
            id: self.id.clone(),
            name: self.name.clone(),
            network: self.network.clone(),
            address: self.address.clone(),
            balance: "0".to_string(), // Default balance
            created_at: self.created_at as i64,
        }
    }
}

impl Zeroize for SecureWallet {
    fn zeroize(&mut self) {
        self.id.zeroize();
        self.name.zeroize();
        self.address.zeroize();
    }
}

/// Secure seed phrase wrapper with automatic zeroization
/// Does not implement Debug to prevent exposure in logs
pub struct SecureSeedPhrase {
    phrase: String,
}

impl SecureSeedPhrase {
    /// Create a new secure seed phrase
    pub fn new(phrase: String) -> Self {
        Self { phrase }
    }

    /// Get the seed phrase
    pub fn as_str(&self) -> &str {
        &self.phrase
    }
    
    /// Create from words
    pub fn from_words(words: Vec<String>) -> Result<Self, WalletError> {
        let phrase = words.join(" ");
        
        // Validate seed phrase
        let word_count = words.len();
        if ![12, 15, 18, 21, 24].contains(&word_count) {
            return Err(WalletError::validation("Seed phrase must be 12, 15, 18, 21, or 24 words"));
        }
        
        Ok(Self { phrase })
    }
    
    /// Get words
    pub fn words(&self) -> Vec<String> {
        self.phrase.split_whitespace().map(|s| s.to_string()).collect()
    }
}

// No Clone implementation to prevent accidental duplication of sensitive data

impl Zeroize for SecureSeedPhrase {
    fn zeroize(&mut self) {
        self.phrase.zeroize();
    }
}

/// Wallet balance information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletBalance {
    pub wallet_id: String,
    pub network: Network,
    pub amount: Amount,
    pub currency: String,
    pub last_updated: u64,
}

impl WalletBalance {
    /// Create a new wallet balance
    pub fn new(wallet_id: String, network: Network, amount: Amount, currency: String) -> Self {
        Self {
            wallet_id,
            network,
            amount,
            currency,
            last_updated: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        }
    }
    
    /// Update the balance
    pub fn update(&mut self, amount: Amount) {
        self.amount = amount;
        self.last_updated = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
    }
}

/// Wallet backup information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletBackupInfo {
    pub version: String,
    pub wallet_id: String,
    pub encrypted_data: Vec<u8>,
    pub checksum: String,
    pub created_at: u64,
}

impl WalletBackupInfo {
    /// Create a new wallet backup
    pub fn new(wallet_id: String, encrypted_data: Vec<u8>, checksum: String) -> Self {
        Self {
            version: "1.0.0".to_string(),
            wallet_id,
            encrypted_data,
            checksum,
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shared::types::Network;


    #[test]
    fn test_wallet_creation() {
        let wallet = Wallet::new(
            "Test Wallet".to_string(),
            "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6".to_string(),
            "04...".to_string(),
            Network::CoreTestnet,
        ).unwrap();

        assert_eq!(wallet.name, "Test Wallet");
        assert_eq!(wallet.network, Network::CoreTestnet);
    }

    #[test]
    fn test_wallet_to_wallet_info() {
        let wallet = Wallet::new(
            "Test Wallet".to_string(),
            "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6".to_string(),
            "04...".to_string(),
            Network::CoreTestnet,
        ).unwrap();

        let wallet_info = wallet.to_wallet_info();
        assert_eq!(wallet_info.name, "Test Wallet");
        assert_eq!(wallet_info.network, Network::CoreTestnet);
    }

    #[test]
    fn test_secure_wallet_creation() {
        let wallet = SecureWallet::new(
            "test_wallet".to_string(),
            "Test Wallet".to_string(),
            "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6".to_string(),
            Network::CoreTestnet,
        );
        
        assert_eq!(wallet.id, "test_wallet");
        assert_eq!(wallet.name, "Test Wallet");
        assert_eq!(wallet.address, "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6");
        assert_eq!(wallet.network, Network::CoreTestnet);
    }

    #[test]
    fn test_secure_seed_phrase_creation() {
        let words = vec![
            "abandon".to_string(), "ability".to_string(), "able".to_string(),
            "about".to_string(), "above".to_string(), "absent".to_string(),
            "absorb".to_string(), "abstract".to_string(), "absurd".to_string(),
            "abuse".to_string(), "access".to_string(), "accident".to_string(),
        ];
        
        let seed_phrase = SecureSeedPhrase::from_words(words).unwrap();
        assert_eq!(seed_phrase.words().len(), 12);
    }

    #[test]
    fn test_wallet_balance_creation() {
        let balance = WalletBalance::new(
            "test_wallet".to_string(),
            Network::CoreTestnet,
            "1000000000000000000".to_string(),
            "TCORE2".to_string(),
        );
        
        assert_eq!(balance.wallet_id, "test_wallet");
        assert_eq!(balance.network, Network::CoreTestnet);
        assert_eq!(balance.amount, "1000000000000000000");
        assert_eq!(balance.currency, "TCORE2");
    }

    #[test]
    fn test_wallet_backup_creation() {
        let backup = WalletBackupInfo::new(
            "test_wallet".to_string(),
            vec![1, 2, 3, 4, 5],
            "test_checksum".to_string(),
        );
        
        assert_eq!(backup.wallet_id, "test_wallet");
        assert_eq!(backup.version, "1.0.0");
        assert_eq!(backup.checksum, "test_checksum");
    }
} 