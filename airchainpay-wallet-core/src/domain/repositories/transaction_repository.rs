//! Transaction repository for data access
//! 
//! This module handles transaction data persistence and retrieval.

use crate::shared::error::WalletError;
use crate::shared::types::{Transaction, SignedTransaction, TransactionReceipt};
use async_trait::async_trait;
use crate::infrastructure::platform::FileStorage;
use serde_json;
use std::path::PathBuf;
use std::fs;
use ethers::providers::{Provider, Http, Middleware};
use ethers::types::H256;
use crate::shared::types::{TransactionStatus, Network};
use ethers::prelude::*;

/// Transaction repository trait
#[async_trait]
pub trait TransactionRepository {
    /// Save a transaction
    async fn save_transaction(&self, transaction: &SignedTransaction) -> Result<(), WalletError>;
    
    /// Get transaction by hash
    async fn get_transaction(&self, hash: &str) -> Result<SignedTransaction, WalletError>;
    
    /// Get transaction receipt
    async fn get_receipt(&self, hash: &str, network: Network) -> Result<crate::shared::types::TransactionReceipt, WalletError>;
    
    /// List transactions for wallet
    async fn list_transactions(&self, wallet_id: &str) -> Result<Vec<SignedTransaction>, WalletError>;
}

#[async_trait]
impl TransactionRepository for FileStorage {
    async fn save_transaction(&self, transaction: &SignedTransaction) -> Result<(), WalletError> {
        let dir = PathBuf::from("transactions");
        fs::create_dir_all(&dir).map_err(|e| WalletError::storage(format!("Failed to create dir: {}", e)))?;
        let path = dir.join(format!("{}.json", transaction.hash));
        let data = serde_json::to_vec(transaction).map_err(|e| WalletError::storage(format!("Serialization failed: {}", e)))?;
        fs::write(path, data).map_err(|e| WalletError::storage(format!("Write failed: {}", e)))?;
        Ok(())
    }
    async fn get_transaction(&self, hash: &str) -> Result<SignedTransaction, WalletError> {
        let path = PathBuf::from("transactions").join(format!("{}.json", hash));
        let data = fs::read(path).map_err(|_| WalletError::transaction(format!("Transaction not found: {}", hash)))?;
        serde_json::from_slice(&data).map_err(|e| WalletError::transaction(format!("Deserialization failed: {}", e)))
    }
    async fn get_receipt(&self, hash: &str, network: Network) -> Result<crate::shared::types::TransactionReceipt, WalletError> {
        let provider = Provider::<Http>::try_from(network.rpc_url())
            .map_err(|e| WalletError::network(format!("Provider error: {e}")))?;
        let tx_hash: H256 = hash.parse().map_err(|_| WalletError::validation("Invalid transaction hash"))?;
        let receipt = provider.get_transaction_receipt(tx_hash).await
            .map_err(|e| WalletError::network(format!("RPC error: {e}")))?;
        let receipt = receipt.ok_or_else(|| WalletError::transaction("Receipt not found"))?;
        let status = if receipt.status.unwrap_or_default().as_u64() == 1 {
            TransactionStatus::Confirmed
        } else {
            TransactionStatus::Failed
        };
        let block_number = receipt.block_number.map(|b| b.as_u64());
        let gas_used = receipt.gas_used.map(|g| g.as_u64());
        let effective_gas_price = receipt.effective_gas_price.map(|g| g.as_u64());
        let chain_id = network.chain_id();
        let hash = format!("{:?}", receipt.transaction_hash);
        Ok(crate::shared::types::TransactionReceipt {
            hash,
            status,
            block_number,
            gas_used,
            effective_gas_price,
            chain_id,
        })
    }
    async fn list_transactions(&self, _wallet_id: &str) -> Result<Vec<SignedTransaction>, WalletError> {
        let dir = PathBuf::from("transactions");
        let mut txs = Vec::new();
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                if let Ok(data) = fs::read(entry.path()) {
                    if let Ok(tx) = serde_json::from_slice::<SignedTransaction>(&data) {
                        txs.push(tx);
                    }
                }
            }
        }
        Ok(txs)
    }
} 