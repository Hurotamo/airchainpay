//! Wallet management functionality for the wallet core
//! 
//! This module handles wallet creation, management, and operations.

use crate::domain::{SecureWallet, WalletBalance};
use crate::shared::error::WalletError;
use crate::shared::types::{Network, Transaction, SignedTransaction};
use reqwest::Client;
use ethers::types::U256;

/// Wallet manager for handling multiple wallets
pub struct WalletManager {
    // Removed CryptoManager for simplicity
    wallets: std::sync::Arc<tokio::sync::RwLock<std::collections::HashMap<String, SecureWallet>>>,
    balances: std::sync::Arc<tokio::sync::RwLock<std::collections::HashMap<String, WalletBalance>>>,
}

impl WalletManager {
    pub fn new() -> Self {
        Self {
            wallets: std::sync::Arc::new(tokio::sync::RwLock::new(std::collections::HashMap::new())),
            balances: std::sync::Arc::new(tokio::sync::RwLock::new(std::collections::HashMap::new())),
        }
    }

    /// Create a new wallet
    pub async fn create_wallet(
        &self,
        wallet_id: &str,
        name: &str,
        network: Network,
    ) -> Result<SecureWallet, WalletError> {
        // Initialize secure file storage and key manager
        let file_storage = crate::infrastructure::platform::FileStorage::new()?;
        let key_manager = crate::core::crypto::keys::KeyManager::new(&file_storage);

        // Derive deterministic key id from wallet id
        let key_id = format!("wallet_key_{}", wallet_id);

        // Generate a private key and derive public key and address
        let private_key = key_manager.generate_private_key(&key_id)?;
        let public_key = key_manager.get_public_key(&private_key)?;
        let address = key_manager.get_address(&public_key)?;

        // Construct secure wallet entity
        let wallet = SecureWallet::new(
            wallet_id.to_string(),
            name.to_string(),
            address,
            network.clone(),
        );

        // Persist in manager state
        {
            let mut wallets = self.wallets.write().await;
            wallets.insert(wallet_id.to_string(), SecureWallet::new(
                wallet.id.clone(),
                wallet.name.clone(),
                wallet.address.clone(),
                wallet.network.clone(),
            ));
        }

        // Initialize balance cache with zero until on-chain fetch updates it
        {
            let mut balances = self.balances.write().await;
            let currency = network.native_currency().to_string();
            let balance = WalletBalance::new(wallet_id.to_string(), network.clone(), "0".to_string(), currency);
            balances.insert(wallet_id.to_string(), balance);
        }

        Ok(wallet)
    }

    /// Get a wallet by ID
    pub async fn get_wallet(&self, wallet_id: &str) -> Result<SecureWallet, WalletError> {
        let wallets = self.wallets.read().await;
        wallets.get(wallet_id)
            .map(|w| SecureWallet::new(
                w.id.clone(),
                w.name.clone(),
                w.address.clone(),
                w.network.clone(),
            ))
            .ok_or_else(|| WalletError::wallet_not_found(format!("Wallet not found: {}", wallet_id)))
    }
    
    /// Get wallet balance (queries RPC by network and updates cache)
    pub async fn get_balance(&self, wallet_id: &str) -> Result<String, WalletError> {
        // Resolve wallet, network, and address
        let (address, network) = {
            let wallets = self.wallets.read().await;
            let wallet = wallets
                .get(wallet_id)
                .ok_or_else(|| WalletError::wallet_not_found(format!("Wallet not found: {}", wallet_id)))?;
            (wallet.address.clone(), wallet.network.clone())
        };

        // Resolve RPC URL via env override or network defaults
        let rpc_url = match network {
            Network::CoreTestnet => std::env::var("WALLET_CORE_RPC_CORE_TESTNET")
                .unwrap_or_else(|_| Network::CoreTestnet.rpc_url().to_string()),
            Network::BaseSepolia => std::env::var("WALLET_CORE_RPC_BASE_SEPOLIA")
                .unwrap_or_else(|_| Network::BaseSepolia.rpc_url().to_string()),
            Network::LiskSepolia => std::env::var("WALLET_CORE_RPC_LISK_SEPOLIA")
                .map_err(|_| WalletError::config("RPC URL not set for Lisk Sepolia"))?,
            Network::EthereumHolesky => std::env::var("WALLET_CORE_RPC_HOLESKY")
                .map_err(|_| WalletError::config("RPC URL not set for Holesky"))?,
        };

        // Query eth_getBalance
        let client = Client::new();
        let body = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "eth_getBalance",
            "params": [address, "latest"],
            "id": 1
        });
        let resp = client
            .post(&rpc_url)
            .json(&body)
            .send()
            .await
            .map_err(|e| WalletError::network(format!("Failed to query balance: {}", e)))?;
        let resp_json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| WalletError::network(format!("Invalid balance response: {}", e)))?;

        let hex_balance = resp_json
            .get("result")
            .and_then(|v| v.as_str())
            .ok_or_else(|| WalletError::network("Missing balance result".to_string()))?;

        // Convert 0x hex to decimal string using U256
        let dec_balance = {
            let clean = hex_balance.trim_start_matches("0x");
            let bytes = hex::decode(clean).unwrap_or_default();
            let mut val = U256::zero();
            if !bytes.is_empty() {
                val = U256::from_big_endian(&bytes);
            }
            val.to_string()
        };

        // Update cache
        {
            let mut balances = self.balances.write().await;
            let currency = network.native_currency().to_string();
            let balance = WalletBalance::new(wallet_id.to_string(), network.clone(), dec_balance.clone(), currency);
            balances.insert(wallet_id.to_string(), balance);
        }

        Ok(dec_balance)
    }

    /// Sign a message using a wallet's private key
    pub async fn sign_message(&self, wallet_id: &str, message: &str) -> Result<String, WalletError> {
        // Get secure storage and key manager
        let file_storage = crate::infrastructure::platform::FileStorage::new()?;
        let key_manager = crate::core::crypto::keys::KeyManager::new(&file_storage);
        
        // Get private key reference (does not load key into memory)
        let key_id = format!("wallet_key_{}", wallet_id);
        let private_key = key_manager.get_private_key(&key_id)?;
        
        // Sign message without loading private key into memory
        key_manager.sign_message(&private_key, message)
    }

    /// Sign and broadcast a transaction using the wallet's private key
    pub async fn send_transaction(&self, wallet_id: &str, transaction: Transaction) -> Result<SignedTransaction, WalletError> {
        // Resolve wallet and network
        let (network, rpc_url) = {
            let wallets = self.wallets.read().await;
            let wallet = wallets.get(wallet_id)
                .ok_or_else(|| WalletError::wallet_not_found(format!("Wallet not found: {}", wallet_id)))?;
            let rpc = wallet.network.rpc_url().to_string();
            (wallet.network.clone(), rpc)
        };

        // Validate chain id alignment
        if transaction.chain_id != network.chain_id() {
            return Err(WalletError::validation("Transaction chain_id does not match wallet network"));
        }

        // Prepare signing/storage
        let file_storage = crate::infrastructure::platform::FileStorage::new()?;
        let key_id = format!("wallet_key_{}", wallet_id);

        // Sign using the transaction manager
        let tx_manager = crate::core::transactions::TransactionManager::new(rpc_url);
        let mut signed = tx_manager
            .sign_transaction(&transaction, &key_id, &file_storage)
            .await?;

        // Broadcast and attach returned hash
        let tx_hash = tx_manager.send_transaction(&signed).await?;
        signed.hash = tx_hash;
        Ok(signed)
    }

    /// Get transaction history
    pub async fn get_transaction_history(&self, _wallet_id: &str) -> Result<Vec<SignedTransaction>, WalletError> {
        // Transaction history requires an indexer or third-party API; JSON-RPC alone cannot query by address efficiently.
        Err(WalletError::not_implemented("Transaction history requires an indexer; not supported via JSON-RPC only"))
    }

    /// Update wallet balance (uses wallet's configured network and currency)
    pub async fn update_balance(&self, wallet_id: &str, balance: String) -> Result<(), WalletError> {
        let (network, currency) = {
            let wallets = self.wallets.read().await;
            if let Some(wallet) = wallets.get(wallet_id) {
                let n = wallet.network.clone();
                let c = n.native_currency().to_string();
                (n, c)
            } else {
                // Fallback if wallet not found
                let n = Network::CoreTestnet;
                (n.clone(), n.native_currency().to_string())
            }
        };

        let mut balances = self.balances.write().await;
        let wallet_balance = WalletBalance::new(
            wallet_id.to_string(),
            network,
            balance,
            currency,
        );
        balances.insert(wallet_id.to_string(), wallet_balance);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;


    #[tokio::test]
    async fn test_wallet_manager_creation() {
        let manager = WalletManager::new();
        assert!(manager.get_balance("test_wallet").await
            .expect("Failed to get wallet balance") == "0");
    }

    #[tokio::test]
    async fn test_wallet_balance_update() {
        let manager = WalletManager::new();
        manager.update_balance("test_wallet", "1000000".to_string()).await
            .expect("Failed to update wallet balance");
        let balance = manager.get_balance("test_wallet").await
            .expect("Failed to get wallet balance");
        assert_eq!(balance, "1000000");
    }

    #[tokio::test]
    async fn test_wallet_not_found() {
        let manager = WalletManager::new();
        let result = manager.get_wallet("nonexistent_wallet").await;
        assert!(result.is_err());
    }
} 