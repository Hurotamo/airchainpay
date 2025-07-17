use crate::infrastructure::blockchain::manager::BlockchainManager;
use crate::infrastructure::storage::file_storage::Storage;
use anyhow::Result;
use std::sync::Arc;
use tokio::sync::{RwLock, Mutex};
use tokio::time::{Duration};
use std::collections::{HashMap, VecDeque};
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
    pub transaction: serde_json::Value,
    pub priority: TransactionPriority,
    pub queued_at: DateTime<Utc>,
    pub retry_count: u32,
    pub max_retries: u32,
    pub retry_delay: Duration,
    pub chain_id: u64,
    pub metadata: HashMap<String, serde_json::Value>,
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
    queue: VecDeque<QueuedTransaction>,
}

impl TransactionQueue {
    pub fn new(_max_size: usize) -> Self {
        Self {
            queue: VecDeque::new(),
        }
    }

    pub fn pop(&mut self) -> Option<QueuedTransaction> {
        self.queue.pop_front()
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
    pub timestamp: DateTime<Utc>,
    pub gas_used: Option<u64>,
    pub block_number: Option<u64>,
}

pub struct TransactionProcessor {
    blockchain_manager: Arc<BlockchainManager>,
    storage: Arc<Storage>,
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
            storage,
            config,
            queue,
            metrics,
            workers,
            running: Arc::new(RwLock::new(false)),
        }
    }

    pub async fn enqueue_transaction(&self, tx: QueuedTransaction) {
        let mut queue_guard = self.queue.lock().await;
        queue_guard.queue.push_back(tx);
    }

    async fn process_transaction(&self, tx: QueuedTransaction, worker_name: &str) {
        println!("{} is processing transaction: {:?}", worker_name, tx);
        let max_retries = 3;
        let mut attempt = 0;
        let tx_id = tx.metadata.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let mut last_err = None;
        while attempt < max_retries {
            match self.blockchain_manager.send_transaction(&tx).await {
                Ok(tx_hash) => {
                    println!("{} successfully sent transaction: {:?}, hash: {}", worker_name, tx, tx_hash);
                    let _ = self.storage.update_transaction_status(&tx_id, "completed", Some(format!("{:?}", tx_hash)));
                    return;
                }
                Err(e) => {
                    println!("{} failed to send transaction (attempt {}): {:?}, error: {:?}", worker_name, attempt + 1, tx, e);
                    last_err = Some(e);
                    attempt += 1;
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                }
            }
        }
        // If we reach here, all attempts failed
        let _ = self.storage.update_transaction_status(&tx_id, "failed", None);
        println!("{} permanently failed to send transaction: {:?}, last error: {:?}", worker_name, tx, last_err);
    }

    pub async fn start(&self) -> Result<()> {
        let mut running = self.running.write().await;
        *running = true;
        drop(running);

        println!("Transaction processor started");

        let mut workers_map = self.workers.write().await;
        for i in 0..10 {
            let running = Arc::clone(&self.running);
            let queue = Arc::clone(&self.queue);
            let processor = self.clone();
            let worker_name = format!("worker-{}", i);
            let worker_name_for_task = worker_name.clone();
            let handle = tokio::spawn(async move {
                loop {
                    if !*running.read().await {
                        break;
                    }
                    let maybe_tx = {
                        let mut queue_guard = queue.lock().await;
                        queue_guard.pop()
                    };
                    if let Some(tx) = maybe_tx {
                        processor.process_transaction(tx, &worker_name_for_task).await;
                    } else {
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    }
                }
                println!("{} stopped.", worker_name_for_task);
            });
            workers_map.insert(worker_name, handle);
        }
        drop(workers_map);

        Ok(())
    }



    
}

impl Clone for TransactionProcessor {
    fn clone(&self) -> Self {
        Self {
            blockchain_manager: Arc::clone(&self.blockchain_manager),
            storage: Arc::clone(&self.storage),
            config: self.config.clone(),
            queue: Arc::clone(&self.queue),
            metrics: Arc::clone(&self.metrics),
            workers: Arc::clone(&self.workers),
            running: Arc::clone(&self.running),
        }
    }
} 