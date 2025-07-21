//! Transaction repository for data access
//! 
//! This module handles transaction data persistence and retrieval.

use crate::shared::error::WalletError;
use crate::shared::types::{Transaction, SignedTransaction, TransactionReceipt};
use async_trait::async_trait;

/// Transaction repository trait
#[async_trait]
pub trait TransactionRepository {
    /// Save a transaction
    async fn save_transaction(&self, transaction: &SignedTransaction) -> Result<(), WalletError>;
    
    /// Get transaction by hash
    async fn get_transaction(&self, hash: &str) -> Result<SignedTransaction, WalletError>;
    
    /// Get transaction receipt
    async fn get_receipt(&self, hash: &str) -> Result<TransactionReceipt, WalletError>;
    
    /// List transactions for wallet
    async fn list_transactions(&self, wallet_id: &str) -> Result<Vec<SignedTransaction>, WalletError>;
}

/// In-memory transaction repository implementation
pub struct InMemoryTransactionRepository {
    transactions: std::collections::HashMap<String, SignedTransaction>,
}

impl InMemoryTransactionRepository {
    /// Create a new in-memory transaction repository
    pub fn new() -> Self {
        Self {
            transactions: std::collections::HashMap::new(),
        }
    }
}

#[async_trait]
impl TransactionRepository for InMemoryTransactionRepository {
    async fn save_transaction(&self, transaction: &SignedTransaction) -> Result<(), WalletError> {
        // In a real implementation, this would persist to storage
        Ok(())
    }
    
    async fn get_transaction(&self, hash: &str) -> Result<SignedTransaction, WalletError> {
        self.transactions.get(hash)
            .cloned()
            .ok_or_else(|| WalletError::transaction(format!("Transaction not found: {}", hash)))
    }
    
    async fn get_receipt(&self, hash: &str) -> Result<TransactionReceipt, WalletError> {
        // In a real implementation, this would fetch from blockchain
        Err(WalletError::transaction("Receipt not available"))
    }
    
    async fn list_transactions(&self, wallet_id: &str) -> Result<Vec<SignedTransaction>, WalletError> {
        // In a real implementation, this would filter by wallet
        Ok(Vec::new())
    }
} 