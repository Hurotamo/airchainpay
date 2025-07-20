//! Wallet management use cases
//! 
//! This module contains use cases for wallet creation, import, export,
//! backup, restore, and other wallet management operations.

use crate::domain::entities::wallet::{Wallet, SecureWallet, WalletBackup, Network};
use crate::domain::repositories::WalletRepository;
use crate::shared::error::WalletError;
use crate::shared::utils::Utils;
use crate::core::crypto::CryptoManager;
use crate::infrastructure::platform::PlatformManager;
use async_trait::async_trait;

/// Wallet management use cases
pub struct WalletManagementUseCases {
    wallet_repo: Box<dyn WalletRepository>,
    crypto_manager: CryptoManager,
    platform_manager: PlatformManager,
}

impl WalletManagementUseCases {
    /// Create a new wallet management use cases instance
    pub fn new(
        wallet_repo: Box<dyn WalletRepository>,
        crypto_manager: CryptoManager,
        platform_manager: PlatformManager,
    ) -> Self {
        Self {
            wallet_repo,
            crypto_manager,
            platform_manager,
        }
    }

    /// Create a new wallet
    pub async fn create_wallet(&self, name: String, network: Network) -> Result<Wallet, WalletError> {
        // Validate inputs
        if name.is_empty() {
            return Err(WalletError::Configuration("Wallet name cannot be empty".to_string()));
        }

        // Generate private key
        let private_key = self.crypto_manager.generate_private_key().await?;
        
        // Generate public key
        let public_key = self.crypto_manager.get_public_key(&private_key).await?;
        
        // Generate address
        let address = self.crypto_manager.get_address(&public_key).await?;
        
        // Generate seed phrase
        let seed_phrase = self.generate_seed_phrase().await?;
        
        // Create secure wallet
        let secure_wallet = SecureWallet::new(
            name.clone(),
            address.clone(),
            public_key.clone(),
            private_key,
            seed_phrase,
            network,
        )?;

        // Store wallet securely
        self.wallet_repo.save_wallet(&secure_wallet).await?;

        // Return public wallet info
        Ok(secure_wallet.wallet().clone())
    }

    /// Import wallet from seed phrase
    pub async fn import_wallet(&self, name: String, seed_phrase: String, network: Network) -> Result<Wallet, WalletError> {
        // Validate inputs
        if name.is_empty() {
            return Err(WalletError::Configuration("Wallet name cannot be empty".to_string()));
        }

        if !Utils::validate_seed_phrase(&seed_phrase)? {
            return Err(WalletError::InvalidSeedPhrase("Invalid seed phrase".to_string()));
        }

        // Derive private key from seed phrase
        let private_key = self.derive_private_key_from_seed(&seed_phrase).await?;
        
        // Generate public key
        let public_key = self.crypto_manager.get_public_key(&private_key).await?;
        
        // Generate address
        let address = self.crypto_manager.get_address(&public_key).await?;
        
        // Create seed phrase object
        let seed_words: Vec<String> = seed_phrase
            .split_whitespace()
            .map(|s| s.to_string())
            .collect();
        let seed_phrase_obj = crate::domain::entities::wallet::SecureSeedPhrase::new(seed_words);
        
        // Create secure wallet
        let secure_wallet = SecureWallet::new(
            name,
            address,
            public_key,
            private_key,
            seed_phrase_obj,
            network,
        )?;

        // Check if wallet already exists
        if self.wallet_repo.wallet_exists(&secure_wallet.wallet().address).await? {
            return Err(WalletError::Configuration("Wallet already exists".to_string()));
        }

        // Store wallet securely
        self.wallet_repo.save_wallet(&secure_wallet).await?;

        // Return public wallet info
        Ok(secure_wallet.wallet().clone())
    }

    /// Export wallet (get public info)
    pub async fn export_wallet(&self, wallet_id: &str) -> Result<Wallet, WalletError> {
        let wallet = self.wallet_repo.get_wallet(wallet_id).await?;
        Ok(wallet)
    }

    /// Backup wallet securely
    pub async fn backup_wallet(&self, wallet_id: &str, password: &str) -> Result<WalletBackup, WalletError> {
        // Validate password
        if !Utils::validate_password(password)? {
            return Err(WalletError::Authentication("Invalid password".to_string()));
        }

        // Get secure wallet
        let secure_wallet = self.wallet_repo.get_secure_wallet(wallet_id).await?;
        
        // Create backup
        let backup = secure_wallet.create_backup(password)?;
        
        Ok(backup)
    }

    /// Restore wallet from backup
    pub async fn restore_wallet(&self, backup: &WalletBackup, password: &str, name: String) -> Result<Wallet, WalletError> {
        // Validate backup
        if !backup.is_valid() {
            return Err(WalletError::Storage("Invalid backup".to_string()));
        }

        // Validate password
        if !Utils::validate_password(password)? {
            return Err(WalletError::Authentication("Invalid password".to_string()));
        }

        // Restore secure wallet
        let secure_wallet = SecureWallet::from_backup(backup, password)?;
        
        // Update wallet name
        let mut updated_wallet = secure_wallet.wallet().clone();
        updated_wallet.name = name;
        
        // Check if wallet already exists
        if self.wallet_repo.wallet_exists(&updated_wallet.address).await? {
            return Err(WalletError::Configuration("Wallet already exists".to_string()));
        }

        // Store wallet securely
        let updated_secure_wallet = SecureWallet::new(
            updated_wallet.name.clone(),
            updated_wallet.address.clone(),
            updated_wallet.public_key.clone(),
            secure_wallet.private_key().clone(),
            secure_wallet.seed_phrase().clone(),
            updated_wallet.network,
        )?;
        
        self.wallet_repo.save_wallet(&updated_secure_wallet).await?;

        Ok(updated_wallet)
    }

    /// List all wallets
    pub async fn list_wallets(&self) -> Result<Vec<Wallet>, WalletError> {
        self.wallet_repo.list_wallets().await
    }

    /// Get wallet by ID
    pub async fn get_wallet(&self, wallet_id: &str) -> Result<Wallet, WalletError> {
        self.wallet_repo.get_wallet(wallet_id).await
    }

    /// Delete wallet
    pub async fn delete_wallet(&self, wallet_id: &str) -> Result<(), WalletError> {
        // Check if wallet exists
        let wallet = self.wallet_repo.get_wallet(wallet_id).await?;
        
        // Delete wallet
        self.wallet_repo.delete_wallet(wallet_id).await?;
        
        Ok(())
    }

    /// Update wallet name
    pub async fn update_wallet_name(&self, wallet_id: &str, new_name: String) -> Result<Wallet, WalletError> {
        if new_name.is_empty() {
            return Err(WalletError::Configuration("Wallet name cannot be empty".to_string()));
        }

        let mut wallet = self.wallet_repo.get_wallet(wallet_id).await?;
        wallet.name = new_name;
        wallet.updated_at = Utils::current_timestamp();
        
        self.wallet_repo.update_wallet(&wallet).await?;
        
        Ok(wallet)
    }

    /// Get wallet balance
    pub async fn get_wallet_balance(&self, wallet_id: &str) -> Result<Balance, WalletError> {
        let wallet = self.wallet_repo.get_wallet(wallet_id).await?;
        
        // In a real implementation, this would fetch balance from blockchain
        // For now, return a mock balance
        Ok(Balance {
            wallet_id: wallet_id.to_string(),
            network: wallet.network,
            amount: "0.0".to_string(),
            currency: "ETH".to_string(),
            last_updated: Utils::current_timestamp(),
        })
    }

    /// Generate seed phrase
    async fn generate_seed_phrase(&self) -> Result<crate::domain::entities::wallet::SecureSeedPhrase, WalletError> {
        // In a real implementation, this would use BIP39
        // For now, generate a simple seed phrase
        let words = vec![
            "abandon".to_string(), "ability".to_string(), "able".to_string(),
            "about".to_string(), "above".to_string(), "absent".to_string(),
            "absorb".to_string(), "abstract".to_string(), "absurd".to_string(),
            "abuse".to_string(), "access".to_string(), "accident".to_string(),
        ];
        
        Ok(crate::domain::entities::wallet::SecureSeedPhrase::new(words))
    }

    /// Derive private key from seed phrase
    async fn derive_private_key_from_seed(&self, seed_phrase: &str) -> Result<crate::domain::entities::wallet::SecurePrivateKey, WalletError> {
        // In a real implementation, this would use BIP32/BIP44
        // For now, use a simple hash of the seed phrase
        let seed_bytes = seed_phrase.as_bytes();
        let hash = self.crypto_manager.hash_data(seed_bytes, crate::core::crypto::hashing::HashAlgorithm::SHA256).await?;
        
        let mut key_array = [0u8; 32];
        key_array.copy_from_slice(&hash[..32]);
        
        Ok(crate::domain::entities::wallet::SecurePrivateKey::new(key_array))
    }
}

/// Balance information
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Balance {
    pub wallet_id: String,
    pub network: Network,
    pub amount: String,
    pub currency: String,
    pub last_updated: u64,
}

/// Wallet repository trait
#[async_trait]
pub trait WalletRepository {
    /// Save a secure wallet
    async fn save_wallet(&self, wallet: &SecureWallet) -> Result<(), WalletError>;
    
    /// Get a wallet by ID
    async fn get_wallet(&self, wallet_id: &str) -> Result<Wallet, WalletError>;
    
    /// Get a secure wallet by ID
    async fn get_secure_wallet(&self, wallet_id: &str) -> Result<SecureWallet, WalletError>;
    
    /// Update a wallet
    async fn update_wallet(&self, wallet: &Wallet) -> Result<(), WalletError>;
    
    /// Delete a wallet
    async fn delete_wallet(&self, wallet_id: &str) -> Result<(), WalletError>;
    
    /// List all wallets
    async fn list_wallets(&self) -> Result<Vec<Wallet>, WalletError>;
    
    /// Check if wallet exists
    async fn wallet_exists(&self, address: &str) -> Result<bool, WalletError>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::entities::wallet::Network;
    use std::collections::HashMap;

    // Mock wallet repository for testing
    struct MockWalletRepository {
        wallets: HashMap<String, Wallet>,
        secure_wallets: HashMap<String, SecureWallet>,
    }

    impl MockWalletRepository {
        fn new() -> Self {
            Self {
                wallets: HashMap::new(),
                secure_wallets: HashMap::new(),
            }
        }
    }

    #[async_trait]
    impl WalletRepository for MockWalletRepository {
        async fn save_wallet(&self, wallet: &SecureWallet) -> Result<(), WalletError> {
            // Mock implementation
            Ok(())
        }
        
        async fn get_wallet(&self, wallet_id: &str) -> Result<Wallet, WalletError> {
            // Mock implementation
            Ok(Wallet::new(
                "Test Wallet".to_string(),
                "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6".to_string(),
                "04...".to_string(),
                Network::Ethereum,
            ).unwrap())
        }
        
        async fn get_secure_wallet(&self, wallet_id: &str) -> Result<SecureWallet, WalletError> {
            // Mock implementation
            Err(WalletError::Storage("Not implemented".to_string()))
        }
        
        async fn update_wallet(&self, wallet: &Wallet) -> Result<(), WalletError> {
            // Mock implementation
            Ok(())
        }
        
        async fn delete_wallet(&self, wallet_id: &str) -> Result<(), WalletError> {
            // Mock implementation
            Ok(())
        }
        
        async fn list_wallets(&self) -> Result<Vec<Wallet>, WalletError> {
            // Mock implementation
            Ok(vec![])
        }
        
        async fn wallet_exists(&self, address: &str) -> Result<bool, WalletError> {
            // Mock implementation
            Ok(false)
        }
    }

    #[tokio::test]
    async fn test_create_wallet() {
        let wallet_repo = Box::new(MockWalletRepository::new());
        let crypto_manager = CryptoManager::new();
        let platform_manager = PlatformManager::new().unwrap();
        
        let use_cases = WalletManagementUseCases::new(wallet_repo, crypto_manager, platform_manager);
        
        let wallet = use_cases.create_wallet("Test Wallet".to_string(), Network::Ethereum).await;
        assert!(wallet.is_ok());
    }

    #[tokio::test]
    async fn test_import_wallet() {
        let wallet_repo = Box::new(MockWalletRepository::new());
        let crypto_manager = CryptoManager::new();
        let platform_manager = PlatformManager::new().unwrap();
        
        let use_cases = WalletManagementUseCases::new(wallet_repo, crypto_manager, platform_manager);
        
        let seed_phrase = "abandon ability able about above absent absorb abstract absurd abuse access accident";
        let wallet = use_cases.import_wallet("Test Wallet".to_string(), seed_phrase.to_string(), Network::Ethereum).await;
        assert!(wallet.is_ok());
    }
} 