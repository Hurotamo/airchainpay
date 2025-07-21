//! Wallet management functionality for the wallet core
//! 
//! This module handles wallet creation, management, and operations.

use crate::shared::error::WalletError;
use crate::shared::types::{Network, Transaction, SignedTransaction};
use crate::shared::types::{SecureWallet, WalletBalance};
use crate::core::crypto::CryptoManager;
use std::sync::Arc;
use tokio::sync::RwLock;
use crate::core::crypto::SecurePrivateKey;
use sha3::{Keccak256, Digest};

/// Wallet manager for handling multiple wallets
pub struct WalletManager {
    crypto_manager: CryptoManager,
    wallets: Arc<RwLock<std::collections::HashMap<String, SecureWallet>>>,
    balances: Arc<RwLock<std::collections::HashMap<String, WalletBalance>>>,
}

impl WalletManager {
    pub fn new(crypto_manager: CryptoManager) -> Self {
        Self {
            crypto_manager,
            wallets: Arc::new(RwLock::new(std::collections::HashMap::new())),
            balances: Arc::new(RwLock::new(std::collections::HashMap::new())),
        }
    }

    /// Create a new wallet
    pub async fn create_wallet(
        &self,
        wallet_id: &str,
        name: &str,
        network: Network,
    ) -> Result<SecureWallet, WalletError> {
        // Generate a new key pair
        let (_private_key, _public_key) = {
            let key_manager = self.crypto_manager.key_manager.read().await;
            key_manager.generate_key_pair(wallet_id).await?
        };
        
        // Get the address from the public key
        let address = {
            let key_manager = self.crypto_manager.key_manager.read().await;
            key_manager.get_address(wallet_id).await?
        };
        
        // Create the wallet
        let wallet = SecureWallet::new(
            wallet_id.to_string(),
            name.to_string(),
            address,
            network.clone(),
        );
        
        // Store the wallet
        {
        let mut wallets = self.wallets.write().await;
            wallets.insert(wallet_id.to_string(), wallet.clone());
        }
        
        // Initialize balance
        {
            let mut balances = self.balances.write().await;
            let balance = WalletBalance::new(
                wallet_id.to_string(),
                network.clone(),
                "0".to_string(),
                network.native_currency().to_string(),
            );
            balances.insert(wallet_id.to_string(), balance);
        }

        Ok(wallet)
    }

    /// Get a wallet by ID
    pub async fn get_wallet(&self, wallet_id: &str) -> Result<SecureWallet, WalletError> {
        let wallets = self.wallets.read().await;
        wallets.get(wallet_id)
            .cloned()
            .ok_or_else(|| WalletError::wallet_not_found(format!("Wallet not found: {}", wallet_id)))
    }
    
    /// Get wallet balance
    pub async fn get_balance(&self, wallet_id: &str) -> Result<String, WalletError> {
        let balances = self.balances.read().await;
        let balance = balances.get(wallet_id)
            .ok_or_else(|| WalletError::wallet_not_found(format!("Balance not found for wallet: {}", wallet_id)))?;
        
        Ok(balance.amount.clone())
    }
    
    /// Update wallet balance
    pub async fn update_balance(&self, wallet_id: &str, amount: &str) -> Result<(), WalletError> {
        let mut balances = self.balances.write().await;
        if let Some(balance) = balances.get_mut(wallet_id) {
            balance.update(amount.to_string());
            Ok(())
        } else {
            Err(WalletError::wallet_not_found(format!("Wallet not found: {}", wallet_id)))
        }
    }
    
    /// Sign a message
    pub async fn sign_message(&self, wallet_id: &str, message: &str) -> Result<String, WalletError> {
        let signature = {
            let key_manager = self.crypto_manager.key_manager.read().await;
            key_manager.sign_message(wallet_id, message.as_bytes()).await?
        };
        
        Ok(format!("0x{}", hex::encode(signature)))
    }
    
    /// Sign a transaction
    pub async fn sign_transaction(
        &self,
        wallet_id: &str,
        transaction: &Transaction,
    ) -> Result<SignedTransaction, WalletError> {
        // Get the private key
        let private_key = {
            let key_manager = self.crypto_manager.key_manager.read().await;
            let key = key_manager.get_private_key(wallet_id).await?;
            key.to_hex()?
        };
        
        // Sign the transaction
        let signature_manager = self.crypto_manager.signature_manager.read().await;
        let private_key_bytes = hex::decode(private_key.trim_start_matches("0x"))
            .map_err(|e| WalletError::crypto(format!("Invalid private key: {}", e)))?;
        let private_key_obj = SecurePrivateKey::from_bytes(&private_key_bytes)?;
        let tx_signature = signature_manager.sign_ethereum_transaction(transaction, &private_key_obj)?;
        // Compose the signature as r || s || v (Ethereum style)
        let mut signature_bytes = Vec::new();
        signature_bytes.extend_from_slice(&hex::decode(&tx_signature.r).unwrap_or_default());
        signature_bytes.extend_from_slice(&hex::decode(&tx_signature.s).unwrap_or_default());
        signature_bytes.push(tx_signature.v);
        // RLP encode the transaction for hash
        let rlp_bytes = rlp::encode(transaction);
        let mut hasher = Keccak256::new();
        hasher.update(&rlp_bytes);
        let tx_hash = format!("0x{}", hex::encode(hasher.finalize()));
        Ok(SignedTransaction {
            transaction: transaction.clone(),
            signature: signature_bytes,
            hash: tx_hash,
        })
    }

    /// List all wallets
    pub async fn list_wallets(&self) -> Vec<String> {
        let wallets = self.wallets.read().await;
        wallets.keys().cloned().collect()
    }
    
    /// Remove a wallet
    pub async fn remove_wallet(&self, wallet_id: &str) -> Result<(), WalletError> {
        // Remove from wallets
        {
        let mut wallets = self.wallets.write().await;
            wallets.remove(wallet_id);
        }
        
        // Remove from balances
        {
            let mut balances = self.balances.write().await;
            balances.remove(wallet_id);
        }
        
        // Remove from key manager
        {
            let key_manager = self.crypto_manager.key_manager.read().await;
            key_manager.remove_key(wallet_id).await?;
        }
        
        Ok(())
    }

    /// Initialize the wallet manager
    pub async fn init(&self) -> Result<(), WalletError> {
        // Initialize crypto components
        {
            let key_manager = self.crypto_manager.key_manager.read().await;
            key_manager.init().await?;
        }
        
        {
            let signature_manager = self.crypto_manager.signature_manager.read().await;
            signature_manager.init().await?;
        }
        
        {
            let encryption_manager = self.crypto_manager.encryption_manager.read().await;
            encryption_manager.init().await?;
        }
        
        {
            let hash_manager = self.crypto_manager.hash_manager.read().await;
            hash_manager.init().await?;
        }
        
        {
            let password_manager = self.crypto_manager.password_manager.read().await;
            password_manager.init().await?;
        }
        
        Ok(())
    }
    
    /// Cleanup the wallet manager
    pub async fn cleanup(&self) -> Result<(), WalletError> {
        // Cleanup crypto components
        {
            let key_manager = self.crypto_manager.key_manager.read().await;
            key_manager.cleanup().await?;
        }
        
        {
            let signature_manager = self.crypto_manager.signature_manager.read().await;
            signature_manager.cleanup().await?;
        }
        
        {
            let encryption_manager = self.crypto_manager.encryption_manager.read().await;
            encryption_manager.cleanup().await?;
        }
        
        {
            let hash_manager = self.crypto_manager.hash_manager.read().await;
            hash_manager.cleanup().await?;
        }
        
        {
            let password_manager = self.crypto_manager.password_manager.read().await;
            password_manager.cleanup().await?;
        }
        
        // Clear wallets and balances
        {
            let mut wallets = self.wallets.write().await;
            wallets.clear();
        }
        
        {
            let mut balances = self.balances.write().await;
            balances.clear();
        }
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shared::types::Network;

    #[tokio::test]
    async fn test_wallet_manager_creation() {
        let crypto_manager = CryptoManager::new().await.unwrap();
        let manager = WalletManager::new(crypto_manager);
        assert!(manager.init().await.is_ok());
    }

    #[tokio::test]
    async fn test_create_wallet() {
        let crypto_manager = CryptoManager::new().await.unwrap();
        let manager = WalletManager::new(crypto_manager);
        manager.init().await.unwrap();
        
        let wallet = manager.create_wallet("test_wallet", "Test Wallet", Network::CoreTestnet).await.unwrap();
        
        assert_eq!(wallet.id, "test_wallet");
        assert_eq!(wallet.name, "Test Wallet");
        assert_eq!(wallet.network, Network::CoreTestnet);
        assert!(wallet.address.starts_with("0x"));
    }

    #[tokio::test]
    async fn test_get_wallet() {
        let crypto_manager = CryptoManager::new().await.unwrap();
        let manager = WalletManager::new(crypto_manager);
        manager.init().await.unwrap();
        
        manager.create_wallet("test_wallet", "Test Wallet", Network::CoreTestnet).await.unwrap();
        let wallet = manager.get_wallet("test_wallet").await.unwrap();
        
        assert_eq!(wallet.id, "test_wallet");
        assert_eq!(wallet.name, "Test Wallet");
    }

    #[tokio::test]
    async fn test_get_balance() {
        let crypto_manager = CryptoManager::new().await.unwrap();
        let manager = WalletManager::new(crypto_manager);
        manager.init().await.unwrap();
        
        manager.create_wallet("test_wallet", "Test Wallet", Network::CoreTestnet).await.unwrap();
        let balance = manager.get_balance("test_wallet").await.unwrap();
        
        assert_eq!(balance, "0");
    }

    #[tokio::test]
    async fn test_update_balance() {
        let crypto_manager = CryptoManager::new().await.unwrap();
        let manager = WalletManager::new(crypto_manager);
        manager.init().await.unwrap();
        
        manager.create_wallet("test_wallet", "Test Wallet", Network::CoreTestnet).await.unwrap();
        manager.update_balance("test_wallet", "1000000000000000000").await.unwrap();
        
        let balance = manager.get_balance("test_wallet").await.unwrap();
        assert_eq!(balance, "1000000000000000000");
    }

    #[tokio::test]
    async fn test_sign_message() {
        let crypto_manager = CryptoManager::new().await.unwrap();
        let manager = WalletManager::new(crypto_manager);
        manager.init().await.unwrap();
        
        manager.create_wallet("test_wallet", "Test Wallet", Network::CoreTestnet).await.unwrap();
        let signature = manager.sign_message("test_wallet", "Hello, World!").await.unwrap();
        
        assert!(signature.starts_with("0x"));
        assert_eq!(signature.len(), 130); // 64 bytes + 0x prefix
    }

    #[tokio::test]
    async fn test_list_wallets() {
        let crypto_manager = CryptoManager::new().await.unwrap();
        let manager = WalletManager::new(crypto_manager);
        manager.init().await.unwrap();
        
        manager.create_wallet("test_wallet1", "Test Wallet 1", Network::CoreTestnet).await.unwrap();
        manager.create_wallet("test_wallet2", "Test Wallet 2", Network::BaseSepolia).await.unwrap();
        
        let wallets = manager.list_wallets().await;
        assert_eq!(wallets.len(), 2);
        assert!(wallets.contains(&"test_wallet1".to_string()));
        assert!(wallets.contains(&"test_wallet2".to_string()));
    }

    #[tokio::test]
    async fn test_remove_wallet() {
        let crypto_manager = CryptoManager::new().await.unwrap();
        let manager = WalletManager::new(crypto_manager);
        manager.init().await.unwrap();
        
        manager.create_wallet("test_wallet", "Test Wallet", Network::CoreTestnet).await.unwrap();
        assert_eq!(manager.list_wallets().await.len(), 1);
        
        manager.remove_wallet("test_wallet").await.unwrap();
        assert_eq!(manager.list_wallets().await.len(), 0);
    }
} 