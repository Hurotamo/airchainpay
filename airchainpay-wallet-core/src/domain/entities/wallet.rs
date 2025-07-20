//! Wallet entity and related value objects
//! 
//! This module contains the Wallet entity and related value objects
//! that represent the core business concept of a cryptocurrency wallet.

use crate::shared::error::WalletError;
use crate::shared::constants::*;
use crate::shared::utils::Utils;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use zeroize::{Zeroize, ZeroizeOnDrop};

/// Wallet entity representing a cryptocurrency wallet
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Wallet {
    pub id: String,
    pub name: String,
    pub address: String,
    pub public_key: String,
    pub network: Network,
    pub created_at: u64,
    pub updated_at: u64,
    pub is_active: bool,
    pub metadata: HashMap<String, String>,
}

impl Wallet {
    /// Create a new wallet
    pub fn new(
        name: String,
        address: String,
        public_key: String,
        network: Network,
    ) -> Result<Self, WalletError> {
        // Validate inputs
        if name.is_empty() {
            return Err(WalletError::Configuration("Wallet name cannot be empty".to_string()));
        }

        if !Utils::validate_ethereum_address(&address)? {
            return Err(WalletError::InvalidAddress("Invalid wallet address".to_string()));
        }

        if public_key.is_empty() {
            return Err(WalletError::InvalidPublicKey("Public key cannot be empty".to_string()));
        }

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        Ok(Self {
            id: Utils::generate_id(),
            name,
            address,
            public_key,
            network,
            created_at: now,
            updated_at: now,
            is_active: true,
            metadata: HashMap::new(),
        })
    }

    /// Check if the wallet is valid
    pub fn is_valid(&self) -> bool {
        !self.id.is_empty()
            && !self.name.is_empty()
            && !self.address.is_empty()
            && !self.public_key.is_empty()
            && self.created_at > 0
            && self.updated_at >= self.created_at
    }

    /// Update wallet metadata
    pub fn update_metadata(&mut self, key: String, value: String) {
        self.metadata.insert(key, value);
        self.updated_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
    }

    /// Get metadata value
    pub fn get_metadata(&self, key: &str) -> Option<&String> {
        self.metadata.get(key)
    }

    /// Remove metadata
    pub fn remove_metadata(&mut self, key: &str) {
        self.metadata.remove(key);
        self.updated_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
    }

    /// Deactivate wallet
    pub fn deactivate(&mut self) {
        self.is_active = false;
        self.updated_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
    }

    /// Activate wallet
    pub fn activate(&mut self) {
        self.is_active = true;
        self.updated_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
    }

    /// Get wallet age in seconds
    pub fn age_seconds(&self) -> u64 {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        now - self.created_at
    }

    /// Get wallet age in days
    pub fn age_days(&self) -> u64 {
        self.age_seconds() / 86400
    }

    /// Check if wallet is old (older than 30 days)
    pub fn is_old(&self) -> bool {
        self.age_days() > 30
    }

    /// Get wallet summary
    pub fn summary(&self) -> WalletSummary {
        WalletSummary {
            id: self.id.clone(),
            name: self.name.clone(),
            address: self.address.clone(),
            network: self.network.clone(),
            is_active: self.is_active,
            created_at: self.created_at,
            age_days: self.age_days(),
        }
    }
}

/// Wallet summary for display purposes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletSummary {
    pub id: String,
    pub name: String,
    pub address: String,
    pub network: Network,
    pub is_active: bool,
    pub created_at: u64,
    pub age_days: u64,
}

/// Secure wallet with private key
#[derive(Debug, Zeroize, ZeroizeOnDrop)]
pub struct SecureWallet {
    pub wallet: Wallet,
    #[zeroize(skip)]
    pub private_key: SecurePrivateKey,
    pub seed_phrase: SecureSeedPhrase,
}

impl SecureWallet {
    /// Create a new secure wallet
    pub fn new(
        name: String,
        address: String,
        public_key: String,
        private_key: SecurePrivateKey,
        seed_phrase: SecureSeedPhrase,
        network: Network,
    ) -> Result<Self, WalletError> {
        let wallet = Wallet::new(name, address, public_key, network)?;
        
        Ok(Self {
            wallet,
            private_key,
            seed_phrase,
        })
    }

    /// Get the wallet reference
    pub fn wallet(&self) -> &Wallet {
        &self.wallet
    }

    /// Get the private key (for signing operations)
    pub fn private_key(&self) -> &SecurePrivateKey {
        &self.private_key
    }

    /// Get the seed phrase (for backup/restore)
    pub fn seed_phrase(&self) -> &SecureSeedPhrase {
        &self.seed_phrase
    }

    /// Check if the secure wallet is valid
    pub fn is_valid(&self) -> bool {
        self.wallet.is_valid()
            && self.private_key.as_bytes().len() == PRIVATE_KEY_SIZE
            && !self.seed_phrase.as_words().is_empty()
    }

    /// Create a backup of the secure wallet
    pub fn create_backup(&self, password: &str) -> Result<WalletBackup, WalletError> {
        if !Utils::validate_password(password)? {
            return Err(WalletError::Authentication("Invalid password".to_string()));
        }

        let backup_data = WalletBackupData {
            wallet: self.wallet.clone(),
            private_key_hex: self.private_key.to_hex(),
            seed_phrase: self.seed_phrase.to_string(),
            created_at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        };

        // Encrypt the backup data
        let backup_json = serde_json::to_string(&backup_data)
            .map_err(|e| WalletError::Serialization(format!("Failed to serialize backup: {}", e)))?;

        let backup_bytes = backup_json.as_bytes();
        let checksum = Utils::calculate_checksum(backup_bytes);

        Ok(WalletBackup {
            encrypted_data: backup_bytes.to_vec(), // In production, this would be encrypted
            checksum,
            version: BACKUP_VERSION,
            created_at: backup_data.created_at,
        })
    }

    /// Restore a secure wallet from backup
    pub fn from_backup(backup: &WalletBackup, password: &str) -> Result<Self, WalletError> {
        if !Utils::validate_password(password)? {
            return Err(WalletError::Authentication("Invalid password".to_string()));
        }

        // Validate checksum
        if !Utils::validate_checksum(&backup.encrypted_data, backup.checksum) {
            return Err(WalletError::Storage("Backup checksum validation failed".to_string()));
        }

        // Decrypt the backup data (in production, this would decrypt)
        let backup_json = String::from_utf8(backup.encrypted_data.clone())
            .map_err(|e| WalletError::Serialization(format!("Invalid backup data: {}", e)))?;

        let backup_data: WalletBackupData = serde_json::from_str(&backup_json)
            .map_err(|e| WalletError::Serialization(format!("Failed to deserialize backup: {}", e)))?;

        // Validate the restored data
        if !backup_data.wallet.is_valid() {
            return Err(WalletError::InvalidWallet("Invalid wallet data in backup".to_string()));
        }

        if !Utils::validate_private_key(&backup_data.private_key_hex)? {
            return Err(WalletError::InvalidPrivateKey("Invalid private key in backup".to_string()));
        }

        if !Utils::validate_seed_phrase(&backup_data.seed_phrase)? {
            return Err(WalletError::InvalidSeedPhrase("Invalid seed phrase in backup".to_string()));
        }

        // Convert hex private key to SecurePrivateKey
        let private_key_bytes = Utils::hex_to_bytes(&backup_data.private_key_hex)?;
        if private_key_bytes.len() != PRIVATE_KEY_SIZE {
            return Err(WalletError::InvalidPrivateKey("Invalid private key size".to_string()));
        }

        let mut private_key_array = [0u8; PRIVATE_KEY_SIZE];
        private_key_array.copy_from_slice(&private_key_bytes);
        let private_key = SecurePrivateKey::new(private_key_array);

        // Convert seed phrase string to SecureSeedPhrase
        let seed_words: Vec<String> = backup_data.seed_phrase
            .split_whitespace()
            .map(|s| s.to_string())
            .collect();
        let seed_phrase = SecureSeedPhrase::new(seed_words);

        Ok(Self {
            wallet: backup_data.wallet,
            private_key,
            seed_phrase,
        })
    }
}

/// Wallet backup data
#[derive(Debug, Clone, Serialize, Deserialize)]
struct WalletBackupData {
    wallet: Wallet,
    private_key_hex: String,
    seed_phrase: String,
    created_at: u64,
}

/// Wallet backup
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletBackup {
    pub encrypted_data: Vec<u8>,
    pub checksum: u32,
    pub version: u32,
    pub created_at: u64,
}

impl WalletBackup {
    /// Check if the backup is valid
    pub fn is_valid(&self) -> bool {
        self.version == BACKUP_VERSION
            && !self.encrypted_data.is_empty()
            && Utils::validate_checksum(&self.encrypted_data, self.checksum)
            && self.created_at > 0
    }

    /// Get backup age in days
    pub fn age_days(&self) -> u64 {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        (now - self.created_at) / 86400
    }

    /// Check if backup is old (older than 90 days)
    pub fn is_old(&self) -> bool {
        self.age_days() > 90
    }
}

/// Network enumeration
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Network {
    Ethereum,
    Base,
    Core,
    Polygon,
    Arbitrum,
    Optimism,
    Sepolia,
    Goerli,
}

impl Network {
    /// Get chain ID for the network
    pub fn chain_id(&self) -> u64 {
        match self {
            Network::Ethereum => 1,
            Network::Base => 8453,
            Network::Core => 1116,
            Network::Polygon => 137,
            Network::Arbitrum => 42161,
            Network::Optimism => 10,
            Network::Sepolia => 11155111,
            Network::Goerli => 5,
        }
    }

    /// Get network name
    pub fn name(&self) -> &'static str {
        match self {
            Network::Ethereum => "Ethereum",
            Network::Base => "Base",
            Network::Core => "Core",
            Network::Polygon => "Polygon",
            Network::Arbitrum => "Arbitrum",
            Network::Optimism => "Optimism",
            Network::Sepolia => "Sepolia",
            Network::Goerli => "Goerli",
        }
    }

    /// Check if network is testnet
    pub fn is_testnet(&self) -> bool {
        matches!(self, Network::Sepolia | Network::Goerli)
    }

    /// Check if network is mainnet
    pub fn is_mainnet(&self) -> bool {
        !self.is_testnet()
    }
}

/// Secure private key wrapper
#[derive(Debug, Zeroize, ZeroizeOnDrop)]
pub struct SecurePrivateKey {
    key: [u8; PRIVATE_KEY_SIZE],
}

impl SecurePrivateKey {
    /// Create a new secure private key
    pub fn new(key: [u8; PRIVATE_KEY_SIZE]) -> Self {
        Self { key }
    }

    /// Get private key bytes
    pub fn as_bytes(&self) -> &[u8] {
        &self.key
    }

    /// Get private key as hex string
    pub fn to_hex(&self) -> String {
        hex::encode(&self.key)
    }
}

/// Secure seed phrase wrapper
#[derive(Debug, Zeroize, ZeroizeOnDrop)]
pub struct SecureSeedPhrase {
    words: Vec<String>,
}

impl SecureSeedPhrase {
    /// Create a new secure seed phrase
    pub fn new(words: Vec<String>) -> Self {
        Self { words }
    }

    /// Get seed phrase words
    pub fn as_words(&self) -> &[String] {
        &self.words
    }

    /// Get seed phrase as string
    pub fn to_string(&self) -> String {
        self.words.join(" ")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wallet_creation() {
        let wallet = Wallet::new(
            "Test Wallet".to_string(),
            "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6".to_string(),
            "04...".to_string(),
            Network::Ethereum,
        ).unwrap();

        assert!(wallet.is_valid());
        assert_eq!(wallet.name, "Test Wallet");
        assert_eq!(wallet.network, Network::Ethereum);
    }

    #[test]
    fn test_wallet_validation() {
        let wallet = Wallet::new(
            "".to_string(),
            "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6".to_string(),
            "04...".to_string(),
            Network::Ethereum,
        );

        assert!(wallet.is_err());
    }

    #[test]
    fn test_network_chain_ids() {
        assert_eq!(Network::Ethereum.chain_id(), 1);
        assert_eq!(Network::Base.chain_id(), 8453);
        assert_eq!(Network::Core.chain_id(), 1116);
    }

    #[test]
    fn test_network_testnet_detection() {
        assert!(Network::Sepolia.is_testnet());
        assert!(Network::Goerli.is_testnet());
        assert!(!Network::Ethereum.is_testnet());
        assert!(!Network::Base.is_testnet());
    }
} 