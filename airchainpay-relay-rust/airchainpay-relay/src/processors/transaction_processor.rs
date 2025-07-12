use crate::ble::manager::{BLETransaction, TransactionStatus};
use crate::blockchain::BlockchainManager;
use crate::logger::Logger;
use crate::validators::TransactionValidator;
use crate::storage::Storage;
use crate::utils::payload_compressor::PayloadCompressor;
use anyhow::{Result, anyhow};
use std::sync::Arc;
use tokio::sync::mpsc;
use uuid::Uuid;
use serde_json::Value;

pub struct TransactionProcessor {
    blockchain_manager: Arc<BlockchainManager>,
    validator: TransactionValidator,
    storage: Arc<Storage>,
    payload_compressor: PayloadCompressor,
    max_retries: u32,
    retry_delay: std::time::Duration,
}

impl TransactionProcessor {
    pub fn new(
        blockchain_manager: Arc<BlockchainManager>,
        storage: Arc<Storage>,
    ) -> Self {
        Self {
            blockchain_manager,
            validator: TransactionValidator::new(),
            storage,
            payload_compressor: PayloadCompressor::new(),
            max_retries: 3,
            retry_delay: std::time::Duration::from_secs(5),
        }
    }

    pub async fn start_processing(&self, mut rx: mpsc::Receiver<BLETransaction>) {
        Logger::info("Starting transaction processor");
        
        while let Some(transaction) = rx.recv().await {
            if let Err(e) = self.process_transaction(transaction).await {
                Logger::error(&format!("Transaction processing error: {}", e));
            }
        }
    }

    pub async fn process_transaction(&self, mut transaction: BLETransaction) -> Result<()> {
        Logger::debug(&format!("Processing transaction: {}", transaction.id));
        
        // Update status to processing
        transaction.status = TransactionStatus::Processing;
        self.update_transaction_in_storage(&transaction).await?;
        
        // Try to decompress transaction payload if it's compressed
        let decompressed_payload = self.try_decompress_payload(&transaction.signed_tx).await?;
        
        // Validate transaction
        match self.validator.validate_transaction(&transaction).await {
            Ok(_) => {
                Logger::debug(&format!("Transaction validation passed: {}", transaction.id));
            }
            Err(e) => {
                transaction.status = TransactionStatus::Failed(e.to_string());
                self.update_transaction_in_storage(&transaction).await?;
                return Err(anyhow!("Transaction validation failed: {}", e));
            }
        }
        
        // Broadcast to blockchain
        let mut retry_count = 0;
        while retry_count < self.max_retries {
            match self.broadcast_transaction(&transaction).await {
                Ok(tx_hash) => {
                    Logger::transaction_processed(&transaction.id, transaction.chain_id);
                    
                    // Update transaction with success
                    transaction.status = TransactionStatus::Completed;
                    self.update_transaction_in_storage(&transaction).await?;
                    
                    // Store transaction hash
                    self.storage.save_transaction_hash(&transaction.id, &tx_hash).await?;
                    
                    return Ok(());
                }
                Err(e) => {
                    retry_count += 1;
                    transaction.retry_count = retry_count;
                    
                    Logger::warn(&format!(
                        "Transaction broadcast failed (attempt {}/{}): {} - {}",
                        retry_count, self.max_retries, transaction.id, e
                    ));
                    
                    if retry_count >= self.max_retries {
                        transaction.status = TransactionStatus::Failed(e.to_string());
                        self.update_transaction_in_storage(&transaction).await?;
                        return Err(anyhow!("Transaction broadcast failed after {} retries: {}", self.max_retries, e));
                    }
                    
                    // Wait before retry
                    tokio::time::sleep(self.retry_delay).await;
                }
            }
        }
        
        Ok(())
    }

    /// Try to decompress transaction payload using various methods
    async fn try_decompress_payload(&self, payload: &str) -> Result<Value> {
        // First try to decode as hex
        if let Ok(decoded_bytes) = hex::decode(payload.trim_start_matches("0x")) {
            // Try auto-decompression
            match self.payload_compressor.auto_decompress(&decoded_bytes).await {
                Ok(decompressed) => {
                    Logger::debug("Successfully decompressed transaction payload");
                    return Ok(decompressed);
                }
                Err(e) => {
                    Logger::debug(&format!("Auto-decompression failed: {}, trying as raw hex", e));
                }
            }
        }

        // If not compressed, return as JSON
        match serde_json::from_str::<Value>(payload) {
            Ok(json_value) => Ok(json_value),
            Err(_) => Err(anyhow!("Failed to parse transaction payload as JSON or compressed data")),
        }
    }

    /// Process compressed BLE payment data
    pub async fn process_compressed_ble_payment(&self, compressed_data: &[u8]) -> Result<Value> {
        let mut compressor = PayloadCompressor::new();
        
        match compressor.decompress_ble_payment_data(compressed_data).await {
            Ok(result) => {
                if result.success {
                    Logger::debug("Successfully decompressed BLE payment data");
                    Ok(result.data)
                } else {
                    Err(anyhow!("BLE payment decompression failed: {}", 
                        result.error.unwrap_or_default()))
                }
            }
            Err(e) => Err(anyhow!("Failed to decompress BLE payment data: {}", e)),
        }
    }

    /// Process compressed QR payment request
    pub async fn process_compressed_qr_payment(&self, compressed_data: &[u8]) -> Result<Value> {
        let mut compressor = PayloadCompressor::new();
        
        match compressor.decompress_qr_payment_request(compressed_data).await {
            Ok(result) => {
                if result.success {
                    Logger::debug("Successfully decompressed QR payment request");
                    Ok(result.data)
                } else {
                    Err(anyhow!("QR payment decompression failed: {}", 
                        result.error.unwrap_or_default()))
                }
            }
            Err(e) => Err(anyhow!("Failed to decompress QR payment request: {}", e)),
        }
    }

    /// Compress transaction data for storage or transmission
    pub async fn compress_transaction_data(&self, transaction_data: &Value) -> Result<Vec<u8>> {
        let mut compressor = PayloadCompressor::new();
        compressor.compress_transaction_payload(transaction_data).await
    }

    /// Compress BLE payment data for storage or transmission
    pub async fn compress_ble_payment_data(&self, ble_data: &Value) -> Result<Vec<u8>> {
        let mut compressor = PayloadCompressor::new();
        compressor.compress_ble_payment_data(ble_data).await
    }

    /// Compress QR payment request for storage or transmission
    pub async fn compress_qr_payment_request(&self, qr_data: &Value) -> Result<Vec<u8>> {
        let mut compressor = PayloadCompressor::new();
        compressor.compress_qr_payment_request(qr_data).await
    }

    async fn broadcast_transaction(&self, transaction: &BLETransaction) -> Result<String> {
        // Decode hex transaction
        let tx_bytes = hex::decode(transaction.signed_tx.trim_start_matches("0x"))
            .map_err(|e| anyhow!("Invalid hex transaction: {}", e))?;
        
        // Get chain configuration
        let chain_config = self.blockchain_manager.get_chain_config(transaction.chain_id)
            .ok_or_else(|| anyhow!("Unsupported chain ID: {}", transaction.chain_id))?;
        
        // Broadcast transaction
        let tx_hash = self.blockchain_manager.send_transaction(
            tx_bytes,
            &chain_config.rpc_url,
            transaction.chain_id,
        ).await?;
        
        Logger::info(&format!(
            "Transaction broadcast successful: {} -> {}",
            transaction.id, tx_hash
        ));
        
        Ok(tx_hash)
    }

    async fn update_transaction_in_storage(&self, transaction: &BLETransaction) -> Result<()> {
        self.storage.update_transaction(transaction.clone()).await?;
        Ok(())
    }

    pub async fn process_queued_transactions(&self, device_id: &str) -> Result<()> {
        Logger::debug(&format!("Processing queued transactions for device: {}", device_id));
        
        let queued_transactions = self.storage.get_pending_transactions_for_device(device_id).await?;
        
        for transaction in queued_transactions {
            if let Err(e) = self.process_transaction(transaction).await {
                Logger::error(&format!(
                    "Failed to process queued transaction {}: {}",
                    transaction.id, e
                ));
            }
        }
        
        Ok(())
    }

    pub async fn get_transaction_status(&self, transaction_id: &str) -> Option<TransactionStatus> {
        match self.storage.get_transaction(transaction_id).await {
            Ok(transaction) => Some(transaction.status),
            Err(_) => None,
        }
    }

    pub async fn retry_failed_transaction(&self, transaction_id: &str) -> Result<()> {
        let transaction = self.storage.get_transaction(transaction_id).await?;
        
        if matches!(transaction.status, TransactionStatus::Failed(_)) {
            // Reset retry count and status
            let mut retry_transaction = transaction.clone();
            retry_transaction.retry_count = 0;
            retry_transaction.status = TransactionStatus::Pending;
            
            self.process_transaction(retry_transaction).await?;
        }
        
        Ok(())
    }

    pub async fn get_processing_metrics(&self) -> std::collections::HashMap<String, u64> {
        let mut metrics = std::collections::HashMap::new();
        
        // Get transaction counts by status
        let all_transactions = self.storage.get_all_transactions().await.unwrap_or_default();
        
        metrics.insert("total_transactions".to_string(), all_transactions.len() as u64);
        metrics.insert("pending_transactions".to_string(), 
            all_transactions.iter().filter(|t| matches!(t.status, TransactionStatus::Pending)).count() as u64);
        metrics.insert("processing_transactions".to_string(), 
            all_transactions.iter().filter(|t| matches!(t.status, TransactionStatus::Processing)).count() as u64);
        metrics.insert("completed_transactions".to_string(), 
            all_transactions.iter().filter(|t| matches!(t.status, TransactionStatus::Completed)).count() as u64);
        metrics.insert("failed_transactions".to_string(), 
            all_transactions.iter().filter(|t| matches!(t.status, TransactionStatus::Failed(_))).count() as u64);
        
        metrics
    }

    /// Get compression statistics for monitoring
    pub fn get_compression_stats(&self, original_size: usize, compressed_size: usize) -> crate::utils::protobuf_compressor::CompressionStats {
        self.payload_compressor.get_protobuf_compression_stats(original_size, compressed_size)
    }
} 