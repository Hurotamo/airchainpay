//! Wallet repository for data access
//! 
//! This module handles wallet data persistence and retrieval.

use crate::shared::error::WalletError;
use crate::shared::types::{Network, Address, Amount};
use crate::domain::entities::wallet::{SecureWallet, WalletBalance, WalletBackupInfo};
use async_trait::async_trait;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Wallet repository trait
#[async_trait]
pub trait WalletRepository {
    /// Create a new wallet
    async fn create_wallet(&self, wallet: SecureWallet) -> Result<(), WalletError>;
    
    /// Get a wallet by ID
    async fn get_wallet(&self, wallet_id: &str) -> Result<SecureWallet, WalletError>;
    
    /// Get all wallets
    async fn get_all_wallets(&self) -> Result<Vec<SecureWallet>, WalletError>;
    
    /// Update a wallet
    async fn update_wallet(&self, wallet: SecureWallet) -> Result<(), WalletError>;
    
    /// Delete a wallet
    async fn delete_wallet(&self, wallet_id: &str) -> Result<(), WalletError>;
    
    /// Check if wallet exists
    async fn wallet_exists(&self, wallet_id: &str) -> Result<bool, WalletError>;
    
    /// Get wallet balance
    async fn get_balance(&self, wallet_id: &str) -> Result<WalletBalance, WalletError>;
    
    /// Update wallet balance
    async fn update_balance(&self, balance: WalletBalance) -> Result<(), WalletError>;
    
    /// Create wallet backup
    async fn create_backup(&self, backup: WalletBackupInfo) -> Result<(), WalletError>;
    
    /// Restore wallet from backup
    async fn restore_backup(&self, backup_id: &str) -> Result<SecureWallet, WalletError>;
}

/// In-memory wallet repository implementation
pub struct InMemoryWalletRepository {
    wallets: Arc<RwLock<std::collections::HashMap<String, SecureWallet>>>,
    balances: Arc<RwLock<std::collections::HashMap<String, WalletBalance>>>,
    backups: Arc<RwLock<std::collections::HashMap<String, WalletBackupInfo>>>,
}

impl InMemoryWalletRepository {
    /// Create a new in-memory wallet repository
    pub fn new() -> Self {
        Self {
            wallets: Arc::new(RwLock::new(std::collections::HashMap::new())),
            balances: Arc::new(RwLock::new(std::collections::HashMap::new())),
            backups: Arc::new(RwLock::new(std::collections::HashMap::new())),
        }
    }
}

#[async_trait]
impl WalletRepository for InMemoryWalletRepository {
    async fn create_wallet(&self, wallet: SecureWallet) -> Result<(), WalletError> {
        let mut wallets = self.wallets.write().await;
        
        if wallets.contains_key(&wallet.id) {
            return Err(WalletError::wallet_already_exists(format!("Wallet {} already exists", wallet.id)));
    }
    
        wallets.insert(wallet.id.clone(), wallet);
        Ok(())
    }
    
    async fn get_wallet(&self, wallet_id: &str) -> Result<SecureWallet, WalletError> {
        let wallets = self.wallets.read().await;
        
        wallets.get(wallet_id)
            .cloned()
            .ok_or_else(|| WalletError::wallet_not_found(format!("Wallet not found: {}", wallet_id)))
    }
    
    async fn get_all_wallets(&self) -> Result<Vec<SecureWallet>, WalletError> {
        let wallets = self.wallets.read().await;
        Ok(wallets.values().cloned().collect())
    }
    
    async fn update_wallet(&self, wallet: SecureWallet) -> Result<(), WalletError> {
        let mut wallets = self.wallets.write().await;
        
        if !wallets.contains_key(&wallet.id) {
            return Err(WalletError::wallet_not_found(format!("Wallet not found: {}", wallet.id)));
        }
        
        wallets.insert(wallet.id.clone(), wallet);
        Ok(())
    }
    
    async fn delete_wallet(&self, wallet_id: &str) -> Result<(), WalletError> {
        let mut wallets = self.wallets.write().await;
        let mut balances = self.balances.write().await;
        
        if wallets.remove(wallet_id).is_none() {
            return Err(WalletError::wallet_not_found(format!("Wallet not found: {}", wallet_id)));
        }
        
        balances.remove(wallet_id);
        Ok(())
    }
    
    async fn wallet_exists(&self, wallet_id: &str) -> Result<bool, WalletError> {
        let wallets = self.wallets.read().await;
        Ok(wallets.contains_key(wallet_id))
    }
    
    async fn get_balance(&self, wallet_id: &str) -> Result<WalletBalance, WalletError> {
        let balances = self.balances.read().await;
        
        balances.get(wallet_id)
            .cloned()
            .ok_or_else(|| WalletError::wallet_not_found(format!("Balance not found for wallet: {}", wallet_id)))
    }
    
    async fn update_balance(&self, balance: WalletBalance) -> Result<(), WalletError> {
        let mut balances = self.balances.write().await;
        balances.insert(balance.wallet_id.clone(), balance);
        Ok(())
    }
    
    async fn create_backup(&self, backup: WalletBackupInfo) -> Result<(), WalletError> {
        let mut backups = self.backups.write().await;
        backups.insert(backup.wallet_id.clone(), backup);
        Ok(())
    }
    
    async fn restore_backup(&self, backup_id: &str) -> Result<SecureWallet, WalletError> {
        let backups = self.backups.read().await;
        
        let backup = backups.get(backup_id)
            .ok_or_else(|| WalletError::wallet_not_found(format!("Backup not found: {}", backup_id)))?;
        
        // In a real implementation, this would decrypt the backup data
        // For now, we'll return a mock wallet
        let wallet = SecureWallet::new(
            backup.wallet_id.clone(),
            "Restored Wallet".to_string(),
            "0x0000000000000000000000000000000000000000".to_string(),
            Network::CoreTestnet,
        );
        
        Ok(wallet)
    }
}

/// Wallet repository manager
pub struct WalletRepositoryManager {
    repository: Arc<dyn WalletRepository + Send + Sync>,
}

impl WalletRepositoryManager {
    /// Create a new wallet repository manager
    pub fn new(repository: Arc<dyn WalletRepository + Send + Sync>) -> Self {
        Self { repository }
    }
    
    /// Get the underlying repository
    pub fn repository(&self) -> &Arc<dyn WalletRepository + Send + Sync> {
        &self.repository
    }
    
    /// Initialize the repository manager
    pub async fn init(&self) -> Result<(), WalletError> {
        // Test repository operations
        let test_wallet = SecureWallet::new(
            "test_wallet".to_string(),
            "Test Wallet".to_string(),
            "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6".to_string(),
            Network::CoreTestnet,
        );
        
        self.repository.create_wallet(test_wallet).await?;
        let exists = self.repository.wallet_exists("test_wallet").await?;
        
        if !exists {
            return Err(WalletError::storage("Repository test failed"));
        }
        
        self.repository.delete_wallet("test_wallet").await?;
        Ok(())
    }
    
    /// Cleanup the repository manager
    pub async fn cleanup(&self) -> Result<(), WalletError> {
        // No cleanup needed for in-memory repository
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shared::types::Network;

    #[tokio::test]
    async fn test_create_wallet() {
        let repository = InMemoryWalletRepository::new();
        let wallet = SecureWallet::new(
            "test_wallet".to_string(),
            "Test Wallet".to_string(),
            "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6".to_string(),
            Network::CoreTestnet,
        );
        
        repository.create_wallet(wallet.clone()).await.unwrap();
        
        let retrieved = repository.get_wallet("test_wallet").await.unwrap();
        assert_eq!(retrieved.id, wallet.id);
        assert_eq!(retrieved.name, wallet.name);
    }

    #[tokio::test]
    async fn test_wallet_exists() {
        let repository = InMemoryWalletRepository::new();
        let wallet = SecureWallet::new(
            "test_wallet".to_string(),
            "Test Wallet".to_string(),
            "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6".to_string(),
            Network::CoreTestnet,
        );
        
        repository.create_wallet(wallet).await.unwrap();
        
        assert!(repository.wallet_exists("test_wallet").await.unwrap());
        assert!(!repository.wallet_exists("nonexistent").await.unwrap());
    }

    #[tokio::test]
    async fn test_delete_wallet() {
        let repository = InMemoryWalletRepository::new();
        let wallet = SecureWallet::new(
            "test_wallet".to_string(),
            "Test Wallet".to_string(),
            "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6".to_string(),
            Network::CoreTestnet,
        );
        
        repository.create_wallet(wallet).await.unwrap();
        assert!(repository.wallet_exists("test_wallet").await.unwrap());
        
        repository.delete_wallet("test_wallet").await.unwrap();
        assert!(!repository.wallet_exists("test_wallet").await.unwrap());
    }

    #[tokio::test]
    async fn test_update_balance() {
        let repository = InMemoryWalletRepository::new();
        let balance = WalletBalance::new(
            "test_wallet".to_string(),
            Network::CoreTestnet,
            "1000000000000000000".to_string(),
            "TCORE2".to_string(),
        );
        
        repository.update_balance(balance.clone()).await.unwrap();
        
        let retrieved = repository.get_balance("test_wallet").await.unwrap();
        assert_eq!(retrieved.amount, balance.amount);
    }

    #[tokio::test]
    async fn test_repository_manager() {
        let repository = Arc::new(InMemoryWalletRepository::new());
        let manager = WalletRepositoryManager::new(repository);
        
        assert!(manager.init().await.is_ok());
    }
} 