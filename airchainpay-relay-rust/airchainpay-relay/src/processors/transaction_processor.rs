use crate::ble::manager::{BLETransaction, TransactionStatus};
use crate::blockchain::BlockchainManager;
use crate::validators::TransactionValidator;
use crate::storage::Storage;
use crate::utils::payload_compressor::PayloadCompressor;
use anyhow::{Result, anyhow};
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock, Mutex};
use tokio::time::{Duration, Instant, sleep};
use uuid::Uuid;
use serde_json::Value;
use std::collections::{HashMap, BinaryHeap, VecDeque};
use std::cmp::Ordering;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum TransactionPriority {
    Low = 1,
    Normal = 2,
    High = 3,
    Critical = 4,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueuedTransaction {
    pub transaction: BLETransaction,
    pub priority: TransactionPriority,
    pub queued_at: DateTime<Utc>,
    pub retry_count: u32,
    pub max_retries: u32,
    pub retry_delay: Duration,
    pub device_id: String,
    pub chain_id: u64,
    pub metadata: HashMap<String, Value>,
}

impl PartialEq for QueuedTransaction {
    fn eq(&self, other: &Self) -> bool {
        self.priority == other.priority && self.queued_at == other.queued_at
    }
}

impl Eq for QueuedTransaction {}

impl PartialOrd for QueuedTransaction {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for QueuedTransaction {
    fn cmp(&self, other: &Self) -> Ordering {
        // Higher priority first, then earlier queued time
        match self.priority.cmp(&other.priority) {
            Ordering::Equal => other.queued_at.cmp(&self.queued_at),
            other => other,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionMetrics {
    pub total_processed: u64,
    pub total_successful: u64,
    pub total_failed: u64,
    pub total_retried: u64,
    pub average_processing_time_ms: u64,
    pub queue_size: usize,
    pub active_workers: usize,
    pub last_processed_at: Option<DateTime<Utc>>,
    pub chain_metrics: HashMap<u64, ChainMetrics>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChainMetrics {
    pub chain_id: u64,
    pub transactions_processed: u64,
    pub transactions_successful: u64,
    pub transactions_failed: u64,
    pub average_gas_used: u64,
    pub last_transaction_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionProcessorConfig {
    pub max_concurrent_workers: usize,
    pub max_queue_size: usize,
    pub default_retry_count: u32,
    pub default_retry_delay: Duration,
    pub max_retry_delay: Duration,
    pub enable_priority_queue: bool,
    pub enable_metrics: bool,
    pub enable_auto_retry: bool,
    pub transaction_timeout: Duration,
    pub batch_processing: bool,
    pub batch_size: usize,
    pub batch_timeout: Duration,
}

impl Default for TransactionProcessorConfig {
    fn default() -> Self {
        Self {
            max_concurrent_workers: 4,
            max_queue_size: 1000,
            default_retry_count: 3,
            default_retry_delay: Duration::from_secs(5),
            max_retry_delay: Duration::from_secs(60),
            enable_priority_queue: true,
            enable_metrics: true,
            enable_auto_retry: true,
            transaction_timeout: Duration::from_secs(300), // 5 minutes
            batch_processing: false,
            batch_size: 10,
            batch_timeout: Duration::from_secs(30),
        }
    }
}

pub struct TransactionQueue {
    queue: BinaryHeap<QueuedTransaction>,
    processing: HashMap<String, DateTime<Utc>>,
    completed: VecDeque<TransactionResult>,
    max_size: usize,
}

impl TransactionQueue {
    pub fn new(max_size: usize) -> Self {
        Self {
            queue: BinaryHeap::new(),
            processing: HashMap::new(),
            completed: VecDeque::with_capacity(1000),
            max_size,
        }
    }

    pub fn add_transaction(&mut self, transaction: QueuedTransaction) -> Result<()> {
        if self.queue.len() >= self.max_size {
            return Err(anyhow!("Transaction queue is full"));
        }
        self.queue.push(transaction);
        Ok(())
    }

    pub fn get_next_transaction(&mut self) -> Option<QueuedTransaction> {
        self.queue.pop()
    }

    pub fn mark_processing(&mut self, transaction_id: &str) {
        self.processing.insert(transaction_id.to_string(), Utc::now());
    }

    pub fn mark_completed(&mut self, transaction_id: &str, result: TransactionResult) {
        self.processing.remove(transaction_id);
        self.completed.push_back(result);
        
        // Keep only last 1000 completed transactions
        if self.completed.len() > 1000 {
            self.completed.pop_front();
        }
    }

    pub fn get_queue_size(&self) -> usize {
        self.queue.len()
    }

    pub fn get_processing_count(&self) -> usize {
        self.processing.len()
    }

    pub fn get_completed_transactions(&self) -> &VecDeque<TransactionResult> {
        &self.completed
    }

    pub fn cleanup_stale_processing(&mut self, timeout: Duration) {
        let now = Utc::now();
        let timeout_duration = chrono::Duration::from_std(timeout).unwrap();
        
        self.processing.retain(|_, start_time| {
            now.signed_duration_since(*start_time) < timeout_duration
        });
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionResult {
    pub transaction_id: String,
    pub success: bool,
    pub hash: Option<String>,
    pub error_message: Option<String>,
    pub processing_time_ms: u64,
    pub retry_count: u32,
    pub chain_id: u64,
    pub device_id: String,
    pub timestamp: DateTime<Utc>,
    pub gas_used: Option<u64>,
    pub block_number: Option<u64>,
}

pub struct TransactionProcessor {
    blockchain_manager: Arc<BlockchainManager>,
    validator: TransactionValidator,
    storage: Arc<Storage>,
    payload_compressor: PayloadCompressor,
    config: TransactionProcessorConfig,
    queue: Arc<Mutex<TransactionQueue>>,
    metrics: Arc<RwLock<TransactionMetrics>>,
    workers: Arc<RwLock<HashMap<String, tokio::task::JoinHandle<()>>>>,
    running: Arc<RwLock<bool>>,
}

impl TransactionProcessor {
    pub fn new(
        blockchain_manager: Arc<BlockchainManager>,
        storage: Arc<Storage>,
        config: Option<TransactionProcessorConfig>,
    ) -> Self {
        let config = config.unwrap_or_default();
        let queue = Arc::new(Mutex::new(TransactionQueue::new(config.max_queue_size)));
        let metrics = Arc::new(RwLock::new(TransactionMetrics {
            total_processed: 0,
            total_successful: 0,
            total_failed: 0,
            total_retried: 0,
            average_processing_time_ms: 0,
            queue_size: 0,
            active_workers: 0,
            last_processed_at: None,
            chain_metrics: HashMap::new(),
        }));
        let workers = Arc::new(RwLock::new(HashMap::new()));

        Self {
            blockchain_manager,
            validator: TransactionValidator::new(),
            storage,
            payload_compressor: PayloadCompressor::new(),
            config,
            queue,
            metrics,
            workers,
            running: Arc::new(RwLock::new(false)),
        }
    }

    pub async fn start(&self) -> Result<()> {
        let mut running = self.running.write().await;
        if *running {
            return Err(anyhow!("Transaction processor is already running"));
        }
        *running = true;
        drop(running);

        println!("Starting enhanced transaction processor");
        
        // Start worker tasks
        for worker_id in 0..self.config.max_concurrent_workers {
            let processor = self.clone();
            let worker_id = format!("worker-{}", worker_id);
            
            let worker_id_clone = worker_id.clone();
            let processor = self.clone();
            let handle = tokio::spawn(async move {
                processor.worker_loop(worker_id_clone).await;
            });

            self.workers.write().await.insert(worker_id, handle);
        }

        // Start metrics updater
        let processor = self.clone();
        tokio::spawn(async move {
            processor.metrics_updater_loop().await;
        });

        // Start queue cleanup
        let processor = self.clone();
        tokio::spawn(async move {
            processor.queue_cleanup_loop().await;
        });

        Ok(())
    }

    pub async fn stop(&self) -> Result<()> {
        let mut running = self.running.write().await;
        *running = false;
        drop(running);

        // Cancel all workers
        let mut workers = self.workers.write().await;
        for (_, handle) in workers.iter_mut() {
            handle.abort();
        }
        workers.clear();

        println!("Transaction processor stopped");
        Ok(())
    }

    pub async fn add_transaction(
        &self,
        transaction: BLETransaction,
        priority: TransactionPriority,
        metadata: Option<HashMap<String, Value>>,
    ) -> Result<()> {
        // Extract chain_id from metadata or use default
        let chain_id = metadata
            .as_ref()
            .and_then(|m| m.get("chain_id"))
            .and_then(|v| v.as_u64())
            .unwrap_or(84532); // Default to Base Sepolia
        
        let queued_transaction = QueuedTransaction {
            transaction: transaction.clone(),
            priority: priority.clone(),
            queued_at: Utc::now(),
            retry_count: 0,
            max_retries: self.config.default_retry_count,
            retry_delay: self.config.default_retry_delay,
            device_id: transaction.device_id.clone(),
            chain_id,
            metadata: metadata.unwrap_or_default(),
        };

        let mut queue = self.queue.lock().await;
        queue.add_transaction(queued_transaction.clone())?;
        
        println!("Transaction {} added to queue with priority {:?}", queued_transaction.transaction.id, priority);

        Ok(())
    }

    async fn worker_loop(&self, worker_id: String) {
        println!("Worker {} started", worker_id);

        while *self.running.read().await {
            // Get next transaction from queue
            let next_transaction = {
                let mut queue = self.queue.lock().await;
                queue.get_next_transaction()
            };

            if let Some(queued_transaction) = next_transaction {
                let start_time = Instant::now();
                
                // Mark as processing
                {
                    let mut queue = self.queue.lock().await;
                    queue.mark_processing(&queued_transaction.transaction.id);
                }

                // Process transaction
                let result = self.process_transaction_with_retry(queued_transaction).await;

                let processing_time = start_time.elapsed().as_millis() as u64;

                // Mark as completed
                {
                    let mut queue = self.queue.lock().await;
                    queue.mark_completed(&result.transaction_id, result.clone());
                }

                // Update metrics
                self.update_metrics(&result, processing_time).await;

                println!("Worker {} processed transaction {} in {}ms", worker_id, result.transaction_id, processing_time);
            } else {
                // No transactions in queue, wait a bit
                sleep(Duration::from_millis(100)).await;
            }
        }

        println!("Worker {} stopped", worker_id);
    }

    async fn process_transaction_with_retry(&self, mut queued_transaction: QueuedTransaction) -> TransactionResult {
        let transaction_id = queued_transaction.transaction.id.clone();
        let start_time = Instant::now();
        let mut retry_count = 0;

        while retry_count <= queued_transaction.max_retries {
            match self.process_single_transaction(&queued_transaction.transaction).await {
                Ok((hash, gas_used, block_number)) => {
                    return TransactionResult {
                        transaction_id: transaction_id.clone(),
                        success: true,
                        hash: Some(hash),
                        error_message: None,
                        processing_time_ms: start_time.elapsed().as_millis() as u64,
                        retry_count,
                        chain_id: queued_transaction.chain_id,
                        device_id: queued_transaction.device_id.clone(),
                        timestamp: Utc::now(),
                        gas_used,
                        block_number,
                    };
                }
                Err(e) => {
                    retry_count += 1;
                    queued_transaction.retry_count = retry_count;

                    println!("Transaction {} failed (attempt {}/{}): {}", transaction_id, retry_count, queued_transaction.max_retries, e);

                    if retry_count > queued_transaction.max_retries {
                        return TransactionResult {
                            transaction_id: transaction_id.clone(),
                            success: false,
                            hash: None,
                            error_message: Some(e.to_string()),
                            processing_time_ms: start_time.elapsed().as_millis() as u64,
                            retry_count,
                            chain_id: queued_transaction.chain_id,
                            device_id: queued_transaction.device_id.clone(),
                            timestamp: Utc::now(),
                            gas_used: None,
                            block_number: None,
                        };
                    }

                    // Exponential backoff
                    let delay = std::cmp::min(
                        queued_transaction.retry_delay * 2_u32.pow(retry_count - 1),
                        self.config.max_retry_delay,
                    );
                    sleep(delay).await;
                }
            }
        }

        // This should never be reached, but just in case
        TransactionResult {
            transaction_id: transaction_id.clone(),
            success: false,
            hash: None,
            error_message: Some("Max retries exceeded".to_string()),
            processing_time_ms: start_time.elapsed().as_millis() as u64,
            retry_count,
            chain_id: queued_transaction.chain_id,
            device_id: queued_transaction.device_id.clone(),
            timestamp: Utc::now(),
            gas_used: None,
            block_number: None,
        }
    }

    async fn process_single_transaction(&self, transaction: &BLETransaction) -> Result<(String, Option<u64>, Option<u64>)> {
        println!("Processing transaction: {}", transaction.id);
        
        // Update status to processing
        let mut transaction_clone = transaction.clone();
        transaction_clone.status = TransactionStatus::Processing;
        self.update_transaction_in_storage(&transaction_clone).await?;
        
        // Try to decompress transaction payload if it's compressed
        let _decompressed_payload = self.try_decompress_payload(&transaction.transaction_data).await?;
        
        // Validate transaction
        match self.validator.validate_transaction(transaction).await {
            Ok(_) => {
                println!("Transaction validation passed: {}", transaction.id);
            }
            Err(e) => {
                transaction_clone.status = TransactionStatus::Failed;
                self.update_transaction_in_storage(&transaction_clone).await?;
                return Err(anyhow!("Transaction validation failed: {}", e));
            }
        }
        
        // Broadcast to blockchain with timeout
        let broadcast_result = tokio::time::timeout(
            self.config.transaction_timeout,
            self.broadcast_transaction_with_receipt(transaction)
        ).await;

        match broadcast_result {
            Ok(Ok((tx_hash, gas_used, block_number))) => {
                // Extract chain ID from transaction data or use default
                let chain_id = self.extract_chain_id_from_transaction(&transaction.transaction_data).unwrap_or(84532);
                println!("Transaction processed: {} -> {} (chain: {})", transaction.id, tx_hash, chain_id);
                
                // Update transaction with success
                transaction_clone.status = TransactionStatus::Completed;
                // Note: BLETransaction doesn't have tx_hash field, so we'll store it separately
                self.storage.save_transaction_hash(&transaction.id, &tx_hash).await?;
                
                Ok((tx_hash, Some(gas_used), Some(block_number)))
            }
            Ok(Err(e)) => {
                transaction_clone.status = TransactionStatus::Failed;
                self.update_transaction_in_storage(&transaction_clone).await?;
                Err(e)
            }
            Err(_) => {
                transaction_clone.status = TransactionStatus::Failed;
                self.update_transaction_in_storage(&transaction_clone).await?;
                Err(anyhow!("Transaction timeout after {:?}", self.config.transaction_timeout))
            }
        }
    }

    async fn broadcast_transaction_with_receipt(&self, transaction: &BLETransaction) -> Result<(String, u64, u64)> {
        // Decode hex transaction
        let tx_bytes = hex::decode(transaction.transaction_data.trim_start_matches("0x"))
            .map_err(|e| anyhow!("Invalid hex transaction: {}", e))?;
        
        // Get chain configuration - use default chain ID since it's not in the struct
        let chain_id = 84532; // Default to Base Sepolia
        let chain_config = self.blockchain_manager.get_chain_config(chain_id)
            .ok_or_else(|| anyhow!("Unsupported chain ID: {}", chain_id))?;
        
        // Broadcast transaction
        let tx_hash = self.blockchain_manager.send_transaction(
            tx_bytes,
            &chain_config.rpc_url,
            chain_id,
        ).await?;
        
        // Wait for transaction receipt
        let receipt = self.blockchain_manager.wait_for_transaction_receipt(
            &tx_hash,
            &chain_config.rpc_url,
            chain_id,
        ).await?;
        
        let gas_used = receipt.gas_used.as_u64();
        let block_number = receipt.block_number.unwrap_or_default().as_u64();
        
        println!("Transaction broadcast successful: {} -> {} (gas: {}, block: {})", transaction.id, tx_hash, gas_used, block_number);
        
        Ok((tx_hash, gas_used, block_number))
    }

    async fn update_metrics(&self, result: &TransactionResult, processing_time: u64) {
        let mut metrics = self.metrics.write().await;
        
        metrics.total_processed += 1;
        if result.success {
            metrics.total_successful += 1;
        } else {
            metrics.total_failed += 1;
        }
        
        if result.retry_count > 0 {
            metrics.total_retried += 1;
        }
        
        // Update average processing time
        let total_time = metrics.average_processing_time_ms * (metrics.total_processed - 1) + processing_time;
        metrics.average_processing_time_ms = total_time / metrics.total_processed;
        
        metrics.last_processed_at = Some(Utc::now());
        
        // Update chain metrics
        let chain_metrics = metrics.chain_metrics.entry(result.chain_id).or_insert_with(|| ChainMetrics {
            chain_id: result.chain_id,
            transactions_processed: 0,
            transactions_successful: 0,
            transactions_failed: 0,
            average_gas_used: 0,
            last_transaction_at: None,
        });
        
        chain_metrics.transactions_processed += 1;
        if result.success {
            chain_metrics.transactions_successful += 1;
        } else {
            chain_metrics.transactions_failed += 1;
        }
        
        if let Some(gas_used) = result.gas_used {
            let total_gas = chain_metrics.average_gas_used * (chain_metrics.transactions_successful - 1) + gas_used;
            chain_metrics.average_gas_used = total_gas / chain_metrics.transactions_successful;
        }
        
        chain_metrics.last_transaction_at = Some(Utc::now());
    }

    async fn metrics_updater_loop(&self) {
        let update_interval = Duration::from_secs(30);
        
        while *self.running.read().await {
            {
                let queue = self.queue.lock().await;
                let mut metrics = self.metrics.write().await;
                metrics.queue_size = queue.get_queue_size();
                metrics.active_workers = queue.get_processing_count();
            }
            
            sleep(update_interval).await;
        }
    }

    async fn queue_cleanup_loop(&self) {
        let cleanup_interval = Duration::from_secs(60);
        
        while *self.running.read().await {
            {
                let mut queue = self.queue.lock().await;
                queue.cleanup_stale_processing(self.config.transaction_timeout);
            }
            
            sleep(cleanup_interval).await;
        }
    }

    /// Try to decompress transaction payload using various methods
    async fn try_decompress_payload(&self, payload: &str) -> Result<Value> {
        // First try to decode as hex
        if let Ok(decoded_bytes) = hex::decode(payload.trim_start_matches("0x")) {
            // Try auto-decompression
            let mut compressor = PayloadCompressor::new();
            match compressor.auto_decompress(&decoded_bytes).await {
                Ok(decompressed) => {
                    println!("Successfully decompressed transaction payload");
                    return Ok(decompressed);
                }
                Err(e) => {
                    println!("Auto-decompression failed: {}, trying as raw hex", e);
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
                    println!("Successfully decompressed BLE payment data");
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
                    println!("Successfully decompressed QR payment request");
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

    async fn update_transaction_in_storage(&self, transaction: &BLETransaction) -> Result<()> {
        // Convert BLETransaction to storage Transaction
        let storage_transaction = crate::storage::Transaction {
            id: transaction.id.clone(),
            signed_tx: transaction.transaction_data.clone(),
            chain_id: 84532, // Default chain ID
            device_id: Some(transaction.device_id.clone()),
            timestamp: chrono::DateTime::from_timestamp(transaction.timestamp as i64, 0)
                .unwrap_or_else(|| chrono::Utc::now()),
            status: format!("{:?}", transaction.status),
            tx_hash: None, // Will be set after successful broadcast
            security: crate::storage::TransactionSecurity {
                hash: transaction.id.clone(),
                created_at: chrono::DateTime::from_timestamp(transaction.timestamp as i64, 0)
                    .unwrap_or_else(|| chrono::Utc::now()),
                server_id: "airchainpay-relay".to_string(),
            },
        };
        
        self.storage.update_transaction(storage_transaction).await?;
        Ok(())
    }

    fn extract_chain_id_from_transaction(&self, transaction_data: &str) -> Option<u64> {
        // In a real implementation, you would parse the transaction to extract chain ID
        // For now, we'll use a default chain ID
        // This could be extracted from the transaction data or metadata
        Some(84532) // Default to Base Sepolia testnet
    }

    pub async fn get_transaction_status(&self, transaction_id: &str) -> Option<TransactionStatus> {
        match self.storage.get_transaction(transaction_id).await {
            Ok(Some(transaction)) => {
                // Parse status string to TransactionStatus
                match transaction.status.as_str() {
                    "Pending" => Some(TransactionStatus::Pending),
                    "Processing" => Some(TransactionStatus::Processing),
                    "Completed" => Some(TransactionStatus::Completed),
                    "Failed" => Some(TransactionStatus::Failed),
                    "Cancelled" => Some(TransactionStatus::Cancelled),
                    _ => Some(TransactionStatus::Pending),
                }
            }
            _ => None,
        }
    }

    pub async fn retry_failed_transaction(&self, transaction_id: &str) -> Result<()> {
        // Get the failed transaction from storage
        let transaction = self.storage.get_transaction(transaction_id).await?
            .ok_or_else(|| anyhow!("Transaction not found"))?;
        
        // Convert to BLETransaction
        let ble_transaction = BLETransaction {
            id: transaction.id,
            device_id: transaction.device_id.expect("Device ID is required"),
            transaction_data: transaction.signed_tx,
            status: TransactionStatus::Pending,
            timestamp: transaction.timestamp.timestamp() as u64,
            signature: None,
            encrypted: false, // Default to false for retried transactions
        };
        
        // Add to queue with high priority
        self.add_transaction(
            ble_transaction,
            TransactionPriority::High,
            Some({
                let mut metadata = HashMap::new();
                metadata.insert("retry".to_string(), Value::Bool(true));
                metadata.insert("original_failure".to_string(), Value::String(transaction.status));
                metadata
            }),
        ).await?;
        
        println!("Failed transaction {} queued for retry", transaction_id);
        Ok(())
    }

    pub async fn get_processing_metrics(&self) -> TransactionMetrics {
        self.metrics.read().await.clone()
    }

    pub async fn get_queue_status(&self) -> HashMap<String, Value> {
        let queue = self.queue.lock().await;
        let metrics = self.metrics.read().await;
        
        let mut status = HashMap::new();
        status.insert("queue_size".to_string(), Value::Number(serde_json::Number::from(queue.get_queue_size() as u64)));
        status.insert("processing_count".to_string(), Value::Number(serde_json::Number::from(queue.get_processing_count() as u64)));
        status.insert("total_processed".to_string(), Value::Number(serde_json::Number::from(metrics.total_processed)));
        status.insert("total_successful".to_string(), Value::Number(serde_json::Number::from(metrics.total_successful)));
        status.insert("total_failed".to_string(), Value::Number(serde_json::Number::from(metrics.total_failed)));
        status.insert("average_processing_time_ms".to_string(), Value::Number(serde_json::Number::from(metrics.average_processing_time_ms)));
        
        if let Some(last_processed) = metrics.last_processed_at {
            status.insert("last_processed_at".to_string(), Value::String(last_processed.to_rfc3339()));
        }
        
        status
    }

    pub async fn clear_queue(&self) -> Result<()> {
        let mut queue = self.queue.lock().await;
        queue.queue.clear();
        queue.processing.clear();
        println!("Transaction queue cleared");
        Ok(())
    }

    pub async fn get_failed_transactions(&self) -> Vec<TransactionResult> {
        let queue = self.queue.lock().await;
        queue.get_completed_transactions()
            .iter()
            .filter(|result| !result.success)
            .cloned()
            .collect()
    }

    pub fn get_compression_stats(&self, original_size: usize, compressed_size: usize) -> crate::utils::protobuf_compressor::CompressionStats {
        crate::utils::protobuf_compressor::CompressionStats {
            original_size,
            compressed_size,
            compression_ratio: if original_size > 0 {
                (compressed_size as f64 / original_size as f64) * 100.0
            } else {
                0.0
            },
            space_saved_percent: if original_size > compressed_size {
                ((original_size - compressed_size) as f64 / original_size as f64) * 100.0
            } else {
                0.0
            },
            format: "gzip".to_string(),
        }
    }
}

impl Clone for TransactionProcessor {
    fn clone(&self) -> Self {
        Self {
            blockchain_manager: Arc::clone(&self.blockchain_manager),
            validator: TransactionValidator::new(), // Create new instance since it's not Clone
            storage: Arc::clone(&self.storage),
            payload_compressor: PayloadCompressor::new(), // Create new instance since it's not Clone
            config: self.config.clone(),
            queue: Arc::clone(&self.queue),
            metrics: Arc::clone(&self.metrics),
            workers: Arc::clone(&self.workers),
            running: Arc::clone(&self.running),
        }
    }
} 