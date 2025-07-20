//! Wallet repository trait
//! 
//! This module contains the wallet repository trait for wallet data access.

use crate::shared::error::WalletError;
use crate::domain::entities::wallet::{Wallet, SecureWallet};
use async_trait::async_trait;

/// Wallet repository trait for wallet data access
#[async_trait]
pub trait WalletRepository {
    /// Save a wallet
    async fn save_wallet(&self, wallet: &Wallet) -> Result<(), WalletError>;
    
    /// Save a secure wallet
    async fn save_secure_wallet(&self, wallet: &SecureWallet) -> Result<(), WalletError>;
    
    /// Get a wallet by ID
    async fn get_wallet(&self, wallet_id: &str) -> Result<Wallet, WalletError>;
    
    /// Get a secure wallet by ID
    async fn get_secure_wallet(&self, wallet_id: &str) -> Result<SecureWallet, WalletError>;
    
    /// Get a wallet by address
    async fn get_wallet_by_address(&self, address: &str) -> Result<Wallet, WalletError>;
    
    /// Update a wallet
    async fn update_wallet(&self, wallet: &Wallet) -> Result<(), WalletError>;
    
    /// Delete a wallet
    async fn delete_wallet(&self, wallet_id: &str) -> Result<(), WalletError>;
    
    /// List all wallets
    async fn list_wallets(&self) -> Result<Vec<Wallet>, WalletError>;
    
    /// Check if wallet exists
    async fn wallet_exists(&self, wallet_id: &str) -> Result<bool, WalletError>;
    
    /// Check if wallet exists by address
    async fn wallet_exists_by_address(&self, address: &str) -> Result<bool, WalletError>;
    
    /// Get wallet count
    async fn get_wallet_count(&self) -> Result<usize, WalletError>;
}

/// In-memory wallet repository implementation
pub struct InMemoryWalletRepository {
    wallets: std::sync::Arc<tokio::sync::RwLock<Vec<Wallet>>>,
    secure_wallets: std::sync::Arc<tokio::sync::RwLock<Vec<SecureWallet>>>,
}

impl InMemoryWalletRepository {
    /// Create a new in-memory wallet repository
    pub fn new() -> Self {
        Self {
            wallets: std::sync::Arc::new(tokio::sync::RwLock::new(Vec::new())),
            secure_wallets: std::sync::Arc::new(tokio::sync::RwLock::new(Vec::new())),
        }
    }
}

#[async_trait]
impl WalletRepository for InMemoryWalletRepository {
    async fn save_wallet(&self, wallet: &Wallet) -> Result<(), WalletError> {
        let mut wallets = self.wallets.write().await;
        wallets.push(wallet.clone());
        Ok(())
    }
    
    async fn save_secure_wallet(&self, wallet: &SecureWallet) -> Result<(), WalletError> {
        let mut secure_wallets = self.secure_wallets.write().await;
        secure_wallets.push(wallet.clone());
        Ok(())
    }
    
    async fn get_wallet(&self, wallet_id: &str) -> Result<Wallet, WalletError> {
        let wallets = self.wallets.read().await;
        wallets
            .iter()
            .find(|w| w.id == wallet_id)
            .cloned()
            .ok_or_else(|| WalletError::WalletNotFound(format!("Wallet {} not found", wallet_id)))
    }
    
    async fn get_secure_wallet(&self, wallet_id: &str) -> Result<SecureWallet, WalletError> {
        let secure_wallets = self.secure_wallets.read().await;
        secure_wallets
            .iter()
            .find(|w| w.wallet.id == wallet_id)
            .cloned()
            .ok_or_else(|| WalletError::WalletNotFound(format!("Secure wallet {} not found", wallet_id)))
    }
    
    async fn get_wallet_by_address(&self, address: &str) -> Result<Wallet, WalletError> {
        let wallets = self.wallets.read().await;
        wallets
            .iter()
            .find(|w| w.address == address)
            .cloned()
            .ok_or_else(|| WalletError::WalletNotFound(format!("Wallet with address {} not found", address)))
    }
    
    async fn update_wallet(&self, wallet: &Wallet) -> Result<(), WalletError> {
        let mut wallets = self.wallets.write().await;
        if let Some(index) = wallets.iter().position(|w| w.id == wallet.id) {
            wallets[index] = wallet.clone();
            Ok(())
        } else {
            Err(WalletError::WalletNotFound(format!("Wallet {} not found", wallet.id)))
        }
    }
    
    async fn delete_wallet(&self, wallet_id: &str) -> Result<(), WalletError> {
        let mut wallets = self.wallets.write().await;
        let index = wallets
            .iter()
            .position(|w| w.id == wallet_id)
            .ok_or_else(|| WalletError::WalletNotFound(format!("Wallet {} not found", wallet_id)))?;
        
        wallets.remove(index);
        Ok(())
    }
    
    async fn list_wallets(&self) -> Result<Vec<Wallet>, WalletError> {
        let wallets = self.wallets.read().await;
        Ok(wallets.clone())
    }
    
    async fn wallet_exists(&self, wallet_id: &str) -> Result<bool, WalletError> {
        let wallets = self.wallets.read().await;
        Ok(wallets.iter().any(|w| w.id == wallet_id))
    }
    
    async fn wallet_exists_by_address(&self, address: &str) -> Result<bool, WalletError> {
        let wallets = self.wallets.read().await;
        Ok(wallets.iter().any(|w| w.address == address))
    }
    
    async fn get_wallet_count(&self) -> Result<usize, WalletError> {
        let wallets = self.wallets.read().await;
        Ok(wallets.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::entities::wallet::{Wallet, Network};

    #[tokio::test]
    async fn test_save_and_get_wallet() {
        let repo = InMemoryWalletRepository::new();
        
        let wallet = Wallet::new(
            "Test Wallet".to_string(),
            "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6".to_string(),
            "04...".to_string(),
            Network::Ethereum,
        ).unwrap();
        
        repo.save_wallet(&wallet).await.unwrap();
        
        let retrieved_wallet = repo.get_wallet(&wallet.id).await.unwrap();
        assert_eq!(retrieved_wallet.id, wallet.id);
        assert_eq!(retrieved_wallet.name, wallet.name);
    }

    #[tokio::test]
    async fn test_wallet_exists() {
        let repo = InMemoryWalletRepository::new();
        
        let wallet = Wallet::new(
            "Test Wallet".to_string(),
            "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6".to_string(),
            "04...".to_string(),
            Network::Ethereum,
        ).unwrap();
        
        repo.save_wallet(&wallet).await.unwrap();
        
        assert!(repo.wallet_exists(&wallet.id).await.unwrap());
        assert!(repo.wallet_exists_by_address(&wallet.address).await.unwrap());
    }

    #[tokio::test]
    async fn test_delete_wallet() {
        let repo = InMemoryWalletRepository::new();
        
        let wallet = Wallet::new(
            "Test Wallet".to_string(),
            "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6".to_string(),
            "04...".to_string(),
            Network::Ethereum,
        ).unwrap();
        
        repo.save_wallet(&wallet).await.unwrap();
        assert!(repo.wallet_exists(&wallet.id).await.unwrap());
        
        repo.delete_wallet(&wallet.id).await.unwrap();
        assert!(!repo.wallet_exists(&wallet.id).await.unwrap());
    }
} 