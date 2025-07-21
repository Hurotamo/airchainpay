//! Cryptographic functionality for the wallet core
//! 
//! This module provides encryption, hashing, key management, and digital signatures.

use crate::shared::error::WalletError;
use std::sync::Arc;
use tokio::sync::RwLock;

pub mod keys;
pub mod signatures;
pub mod encryption;
pub mod hashing;
pub mod password;

/// Central crypto manager that coordinates all cryptographic operations
pub struct CryptoManager {
    pub key_manager: Arc<RwLock<keys::KeyManager>>,
    pub signature_manager: Arc<RwLock<signatures::SignatureManager>>,
    pub encryption_manager: Arc<RwLock<encryption::EncryptionManager>>,
    pub hash_manager: Arc<RwLock<hashing::HashManager>>,
    pub password_manager: Arc<RwLock<password::PasswordManager>>,
}

impl CryptoManager {
    pub fn new() -> Self {
        Self {
            key_manager: Arc::new(RwLock::new(keys::KeyManager::new())),
            signature_manager: Arc::new(RwLock::new(signatures::SignatureManager::new().expect("Failed to create SignatureManager"))),
            encryption_manager: Arc::new(RwLock::new(encryption::EncryptionManager::new().expect("Failed to create EncryptionManager"))),
            hash_manager: Arc::new(RwLock::new(hashing::HashManager::new())),
            password_manager: Arc::new(RwLock::new(password::PasswordManager::new(None))),
        }
    }
    
    /// Initialize all crypto components
    pub async fn init(&self) -> Result<(), WalletError> {
        // Initialize each component
        {
            let key_manager = self.key_manager.read().await;
            key_manager.init().await?;
        }
        
        {
            let signature_manager = self.signature_manager.read().await;
            signature_manager.init().await?;
        }
        
        {
            let encryption_manager = self.encryption_manager.read().await;
            encryption_manager.init().await?;
        }
        
        {
            let hash_manager = self.hash_manager.read().await;
            hash_manager.init().await?;
        }
        
        {
            let password_manager = self.password_manager.read().await;
            password_manager.init().await?;
        }
        
        Ok(())
    }
    
    /// Cleanup all crypto components
    pub async fn cleanup(&self) -> Result<(), WalletError> {
        // Cleanup each component
        {
            let key_manager = self.key_manager.read().await;
            key_manager.cleanup().await?;
        }
        
        {
            let signature_manager = self.signature_manager.read().await;
            signature_manager.cleanup().await?;
        }
        
        {
            let encryption_manager = self.encryption_manager.read().await;
            encryption_manager.cleanup().await?;
        }
        
        {
            let hash_manager = self.hash_manager.read().await;
            hash_manager.cleanup().await?;
        }
        
        {
            let password_manager = self.password_manager.read().await;
            password_manager.cleanup().await?;
        }
        
        Ok(())
    }
    
    /// Get the key manager
    pub async fn key_manager(&self) -> Arc<RwLock<keys::KeyManager>> {
        self.key_manager.clone()
    }
    
    /// Get the signature manager
    pub async fn signature_manager(&self) -> Arc<RwLock<signatures::SignatureManager>> {
        self.signature_manager.clone()
    }
    
    /// Get the encryption manager
    pub async fn encryption_manager(&self) -> Arc<RwLock<encryption::EncryptionManager>> {
        self.encryption_manager.clone()
    }
    
    /// Get the hash manager
    pub async fn hash_manager(&self) -> Arc<RwLock<hashing::HashManager>> {
        self.hash_manager.clone()
    }
    
    /// Get the password manager
    pub async fn password_manager(&self) -> Arc<RwLock<password::PasswordManager>> {
        self.password_manager.clone()
    }
}

/// Initialize the crypto system
pub async fn init() -> Result<(), WalletError> {
    let manager = CryptoManager::new();
    manager.init().await?;
    Ok(())
}

/// Cleanup the crypto system
pub async fn cleanup() -> Result<(), WalletError> {
    let manager = CryptoManager::new();
    manager.cleanup().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_crypto_manager_creation() {
        let manager = CryptoManager::new();
        assert!(manager.init().await.is_ok());
    }

    #[tokio::test]
    async fn test_crypto_init_cleanup() {
        assert!(init().await.is_ok());
        assert!(cleanup().await.is_ok());
    }
} 