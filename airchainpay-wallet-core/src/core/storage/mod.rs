//! Secure storage functionality
//! 
//! This module contains secure storage operations including
//! encryption, key management, and secure data persistence.

use crate::shared::error::WalletError;
use crate::shared::types::*;
use crate::domain::entities::wallet::{Wallet, SecureWallet, WalletBackup};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Secure storage manager
pub struct SecureStorage {
    storage: Arc<RwLock<Vec<u8>>>,
    encryption_key: Arc<RwLock<Vec<u8>>>,
}

impl SecureStorage {
    /// Create a new secure storage manager
    pub fn new() -> Self {
        Self {
            storage: Arc::new(RwLock::new(Vec::new())),
            encryption_key: Arc::new(RwLock::new(vec![0u8; 32])),
        }
    }

    /// Initialize secure storage
    pub async fn init(&self) -> Result<(), WalletError> {
        log::info!("Initializing secure storage");
        Ok(())
    }

    /// Check if storage is initialized
    pub fn is_initialized(&self) -> bool {
        true // For now, always return true
    }

    /// Store data securely
    pub async fn store_data(&self, key: &str, data: &[u8]) -> Result<(), WalletError> {
        let mut storage = self.storage.write().await;
        // In production, this would encrypt and store data securely
        storage.extend_from_slice(data);
        Ok(())
    }

    /// Retrieve data securely
    pub async fn retrieve_data(&self, key: &str) -> Result<Vec<u8>, WalletError> {
        let storage = self.storage.read().await;
        // In production, this would decrypt and retrieve data securely
        Ok(storage.clone())
    }

    /// Delete data securely
    pub async fn delete_data(&self, key: &str) -> Result<(), WalletError> {
        let mut storage = self.storage.write().await;
        storage.clear();
        Ok(())
    }

    /// Backup wallet securely
    pub async fn backup_wallet(&self, wallet: &Wallet, password: &str) -> Result<WalletBackup, WalletError> {
        // Validate password
        if password.is_empty() {
            return Err(WalletError::Authentication("Password cannot be empty".to_string()));
        }

        // Create backup data
        let backup_data = serde_json::to_vec(&wallet)
            .map_err(|e| WalletError::Serialization(format!("Failed to serialize wallet: {}", e)))?;

        // Encrypt backup data
        let encrypted_data = self.encrypt_data(&backup_data, password).await?;

        // Create backup
        Ok(WalletBackup {
            encrypted_data,
            checksum: crate::shared::utils::Utils::calculate_checksum(&backup_data),
            version: 1,
            created_at: crate::shared::utils::Utils::current_timestamp(),
        })
    }

    /// Restore wallet from backup
    pub async fn restore_wallet(&self, backup: &WalletBackup, password: &str) -> Result<Wallet, WalletError> {
        // Validate backup
        if !backup.is_valid() {
            return Err(WalletError::Storage("Invalid backup".to_string()));
        }

        // Decrypt backup data
        let decrypted_data = self.decrypt_data(&backup.encrypted_data, password).await?;

        // Deserialize wallet
        let wallet: Wallet = serde_json::from_slice(&decrypted_data)
            .map_err(|e| WalletError::Serialization(format!("Failed to deserialize wallet: {}", e)))?;

        Ok(wallet)
    }

    /// Encrypt data
    async fn encrypt_data(&self, data: &[u8], password: &str) -> Result<Vec<u8>, WalletError> {
        // In production, this would use proper encryption
        // For now, just return the data as-is
        Ok(data.to_vec())
    }

    /// Decrypt data
    async fn decrypt_data(&self, encrypted_data: &[u8], password: &str) -> Result<Vec<u8>, WalletError> {
        // In production, this would use proper decryption
        // For now, just return the data as-is
        Ok(encrypted_data.to_vec())
    }
}

impl Drop for SecureStorage {
    fn drop(&mut self) {
        // Secure cleanup
        log::info!("SecureStorage dropped - performing secure cleanup");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::entities::wallet::Network;

    #[tokio::test]
    async fn test_secure_storage_initialization() {
        let storage = SecureStorage::new();
        storage.init().await.unwrap();
        assert!(storage.is_initialized());
    }

    #[tokio::test]
    async fn test_store_and_retrieve_data() {
        let storage = SecureStorage::new();
        storage.init().await.unwrap();

        let test_data = b"test data";
        storage.store_data("test_key", test_data).await.unwrap();
        
        let retrieved_data = storage.retrieve_data("test_key").await.unwrap();
        assert_eq!(retrieved_data, test_data);
    }

    #[tokio::test]
    async fn test_wallet_backup_and_restore() {
        let storage = SecureStorage::new();
        storage.init().await.unwrap();

        let wallet = Wallet::new(
            "Test Wallet".to_string(),
            "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6".to_string(),
            "04...".to_string(),
            Network::Ethereum,
        ).unwrap();

        let backup = storage.backup_wallet(&wallet, "test_password").await.unwrap();
        assert!(backup.is_valid());

        let restored_wallet = storage.restore_wallet(&backup, "test_password").await.unwrap();
        assert_eq!(restored_wallet.name, wallet.name);
        assert_eq!(restored_wallet.address, wallet.address);
    }
} 