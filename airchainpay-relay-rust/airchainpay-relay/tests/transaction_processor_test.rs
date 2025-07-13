use super::*;
use crate::ble::manager::{BLETransaction, TransactionStatus};
use crate::blockchain::BlockchainManager;
use crate::storage::Storage;
use crate::config::Config;
use std::collections::HashMap;
use tokio::time::{Duration, sleep};
use uuid::Uuid;

#[tokio::test]
async fn test_transaction_processor_creation() {
    let config = Config::default();
    let blockchain_manager = Arc::new(BlockchainManager::new(config).unwrap());
    let storage = Arc::new(Storage::new().unwrap());
    
    let processor = TransactionProcessor::new(
        blockchain_manager,
        storage,
        None,
    );
    
    assert_eq!(processor.config.max_concurrent_workers, 4);
    assert_eq!(processor.config.max_queue_size, 1000);
    assert_eq!(processor.config.default_retry_count, 3);
}

#[tokio::test]
async fn test_transaction_processor_start_stop() {
    let config = Config::default();
    let blockchain_manager = Arc::new(BlockchainManager::new(config).unwrap());
    let storage = Arc::new(Storage::new().unwrap());
    
    let processor = TransactionProcessor::new(
        blockchain_manager,
        storage,
        None,
    );
    
    // Start processor
    processor.start().await.unwrap();
    
    // Check if running
    assert!(*processor.running.read().await);
    
    // Stop processor
    processor.stop().await.unwrap();
    
    // Check if stopped
    assert!(!*processor.running.read().await);
}

#[tokio::test]
async fn test_add_transaction_to_queue() {
    let config = Config::default();
    let blockchain_manager = Arc::new(BlockchainManager::new(config).unwrap());
    let storage = Arc::new(Storage::new().unwrap());
    
    let processor = TransactionProcessor::new(
        blockchain_manager,
        storage,
        None,
    );
    
    let transaction = BLETransaction {
        id: "test-tx-1".to_string(),
        device_id: "test-device".to_string(),
        transaction_data: "0x1234567890abcdef".to_string(),
        status: TransactionStatus::Pending,
        timestamp: chrono::Utc::now().timestamp() as u64,
        signature: None,
    };
    
    // Add transaction with normal priority
    processor.add_transaction(
        transaction.clone(),
        TransactionPriority::Normal,
        None,
    ).await.unwrap();
    
    // Check queue size
    let queue_status = processor.get_queue_status().await;
    assert_eq!(queue_status.get("queue_size").unwrap().as_u64().unwrap(), 1);
}

#[tokio::test]
async fn test_priority_queue_ordering() {
    let config = Config::default();
    let blockchain_manager = Arc::new(BlockchainManager::new(config).unwrap());
    let storage = Arc::new(Storage::new().unwrap());
    
    let processor = TransactionProcessor::new(
        blockchain_manager,
        storage,
        None,
    );
    
    let tx1 = BLETransaction {
        id: "low-priority".to_string(),
        device_id: "test-device".to_string(),
        transaction_data: "0x1234567890abcdef".to_string(),
        status: TransactionStatus::Pending,
        timestamp: chrono::Utc::now().timestamp() as u64,
        signature: None,
    };
    
    let tx2 = BLETransaction {
        id: "high-priority".to_string(),
        device_id: "test-device".to_string(),
        transaction_data: "0xabcdef1234567890".to_string(),
        status: TransactionStatus::Pending,
        timestamp: chrono::Utc::now().timestamp() as u64,
        signature: None,
    };
    
    // Add low priority first
    processor.add_transaction(tx1.clone(), TransactionPriority::Low, None).await.unwrap();
    
    // Add high priority second
    processor.add_transaction(tx2.clone(), TransactionPriority::High, None).await.unwrap();
    
    // Check queue size
    let queue_status = processor.get_queue_status().await;
    assert_eq!(queue_status.get("queue_size").unwrap().as_u64().unwrap(), 2);
}

#[tokio::test]
async fn test_transaction_metrics() {
    let config = Config::default();
    let blockchain_manager = Arc::new(BlockchainManager::new(config).unwrap());
    let storage = Arc::new(Storage::new().unwrap());
    
    let processor = TransactionProcessor::new(
        blockchain_manager,
        storage,
        None,
    );
    
    let metrics = processor.get_processing_metrics().await;
    
    assert_eq!(metrics.total_processed, 0);
    assert_eq!(metrics.total_successful, 0);
    assert_eq!(metrics.total_failed, 0);
    assert_eq!(metrics.total_retried, 0);
    assert_eq!(metrics.average_processing_time_ms, 0);
    assert_eq!(metrics.queue_size, 0);
    assert_eq!(metrics.active_workers, 0);
}

#[tokio::test]
async fn test_queue_status() {
    let config = Config::default();
    let blockchain_manager = Arc::new(BlockchainManager::new(config).unwrap());
    let storage = Arc::new(Storage::new().unwrap());
    
    let processor = TransactionProcessor::new(
        blockchain_manager,
        storage,
        None,
    );
    
    let status = processor.get_queue_status().await;
    
    assert!(status.contains_key("queue_size"));
    assert!(status.contains_key("processing_count"));
    assert!(status.contains_key("total_processed"));
    assert!(status.contains_key("total_successful"));
    assert!(status.contains_key("total_failed"));
    assert!(status.contains_key("average_processing_time_ms"));
}

#[tokio::test]
async fn test_clear_queue() {
    let config = Config::default();
    let blockchain_manager = Arc::new(BlockchainManager::new(config).unwrap());
    let storage = Arc::new(Storage::new().unwrap());
    
    let processor = TransactionProcessor::new(
        blockchain_manager,
        storage,
        None,
    );
    
    let transaction = BLETransaction {
        id: "test-tx-clear".to_string(),
        device_id: "test-device".to_string(),
        transaction_data: "0x1234567890abcdef".to_string(),
        status: TransactionStatus::Pending,
        timestamp: chrono::Utc::now().timestamp() as u64,
        signature: None,
    };
    
    // Add transaction
    processor.add_transaction(transaction, TransactionPriority::Normal, None).await.unwrap();
    
    // Check queue has transaction
    let queue_status = processor.get_queue_status().await;
    assert_eq!(queue_status.get("queue_size").unwrap().as_u64().unwrap(), 1);
    
    // Clear queue
    processor.clear_queue().await.unwrap();
    
    // Check queue is empty
    let queue_status = processor.get_queue_status().await;
    assert_eq!(queue_status.get("queue_size").unwrap().as_u64().unwrap(), 0);
}

#[tokio::test]
async fn test_get_failed_transactions() {
    let config = Config::default();
    let blockchain_manager = Arc::new(BlockchainManager::new(config).unwrap());
    let storage = Arc::new(Storage::new().unwrap());
    
    let processor = TransactionProcessor::new(
        blockchain_manager,
        storage,
        None,
    );
    
    let failed_transactions = processor.get_failed_transactions().await;
    
    // Initially should be empty
    assert_eq!(failed_transactions.len(), 0);
}

#[tokio::test]
async fn test_transaction_compression() {
    let config = Config::default();
    let blockchain_manager = Arc::new(BlockchainManager::new(config).unwrap());
    let storage = Arc::new(Storage::new().unwrap());
    
    let processor = TransactionProcessor::new(
        blockchain_manager,
        storage,
        None,
    );
    
    let transaction_data = serde_json::json!({
        "to": "0x1234567890abcdef",
        "value": "1000000000000000000",
        "gas": "21000",
        "nonce": 1
    });
    
    // Test compression
    let compressed = processor.compress_transaction_data(&transaction_data).await.unwrap();
    
    // Test decompression
    let decompressed = processor.try_decompress_payload(&hex::encode(&compressed)).await.unwrap();
    
    assert_eq!(transaction_data, decompressed);
}

#[tokio::test]
async fn test_ble_payment_compression() {
    let config = Config::default();
    let blockchain_manager = Arc::new(BlockchainManager::new(config).unwrap());
    let storage = Arc::new(Storage::new().unwrap());
    
    let processor = TransactionProcessor::new(
        blockchain_manager,
        storage,
        None,
    );
    
    let ble_data = serde_json::json!({
        "amount": "1000000000000000000",
        "recipient": "0x1234567890abcdef",
        "device_id": "test-device",
        "timestamp": chrono::Utc::now().to_rfc3339()
    });
    
    // Test compression
    let compressed = processor.compress_ble_payment_data(&ble_data).await.unwrap();
    
    // Test decompression
    let decompressed = processor.process_compressed_ble_payment(&compressed).await.unwrap();
    
    assert_eq!(ble_data, decompressed);
}

#[tokio::test]
async fn test_qr_payment_compression() {
    let config = Config::default();
    let blockchain_manager = Arc::new(BlockchainManager::new(config).unwrap());
    let storage = Arc::new(Storage::new().unwrap());
    
    let processor = TransactionProcessor::new(
        blockchain_manager,
        storage,
        None,
    );
    
    let qr_data = serde_json::json!({
        "amount": "500000000000000000",
        "recipient": "0xabcdef1234567890",
        "memo": "Test QR payment",
        "timestamp": chrono::Utc::now().to_rfc3339()
    });
    
    // Test compression
    let compressed = processor.compress_qr_payment_request(&qr_data).await.unwrap();
    
    // Test decompression
    let decompressed = processor.process_compressed_qr_payment(&compressed).await.unwrap();
    
    assert_eq!(qr_data, decompressed);
}

#[tokio::test]
async fn test_compression_stats() {
    let config = Config::default();
    let blockchain_manager = Arc::new(BlockchainManager::new(config).unwrap());
    let storage = Arc::new(Storage::new().unwrap());
    
    let processor = TransactionProcessor::new(
        blockchain_manager,
        storage,
        None,
    );
    
    let original_size = 1000;
    let compressed_size = 500;
    
    let stats = processor.get_compression_stats(original_size, compressed_size);
    
    assert_eq!(stats.original_size, 1000);
    assert_eq!(stats.compressed_size, 500);
    assert_eq!(stats.compression_ratio, 50.0);
    assert_eq!(stats.space_saved, 500);
}

#[tokio::test]
async fn test_transaction_processor_config() {
    let mut config = TransactionProcessorConfig::default();
    config.max_concurrent_workers = 8;
    config.max_queue_size = 2000;
    config.default_retry_count = 5;
    config.enable_priority_queue = true;
    config.enable_metrics = true;
    config.enable_auto_retry = true;
    config.transaction_timeout = Duration::from_secs(600);
    
    let blockchain_config = Config::default();
    let blockchain_manager = Arc::new(BlockchainManager::new(blockchain_config).unwrap());
    let storage = Arc::new(Storage::new().unwrap());
    
    let processor = TransactionProcessor::new(
        blockchain_manager,
        storage,
        Some(config),
    );
    
    assert_eq!(processor.config.max_concurrent_workers, 8);
    assert_eq!(processor.config.max_queue_size, 2000);
    assert_eq!(processor.config.default_retry_count, 5);
    assert!(processor.config.enable_priority_queue);
    assert!(processor.config.enable_metrics);
    assert!(processor.config.enable_auto_retry);
    assert_eq!(processor.config.transaction_timeout, Duration::from_secs(600));
}

#[tokio::test]
async fn test_queued_transaction_ordering() {
    let mut tx1 = QueuedTransaction {
        transaction: BLETransaction {
            id: "tx1".to_string(),
            signed_tx: "0x1234567890abcdef".to_string(),
            chain_id: 84532,
            device_id: "test-device".to_string(),
            timestamp: chrono::Utc::now(),
            status: TransactionStatus::Pending,
            tx_hash: None,
        },
        priority: TransactionPriority::Low,
        queued_at: chrono::Utc::now(),
        retry_count: 0,
        max_retries: 3,
        retry_delay: Duration::from_secs(5),
        device_id: "test-device".to_string(),
        chain_id: 84532,
        metadata: HashMap::new(),
    };
    
    let mut tx2 = QueuedTransaction {
        transaction: BLETransaction {
            id: "tx2".to_string(),
            signed_tx: "0xabcdef1234567890".to_string(),
            chain_id: 84532,
            device_id: "test-device".to_string(),
            timestamp: chrono::Utc::now(),
            status: TransactionStatus::Pending,
            tx_hash: None,
        },
        priority: TransactionPriority::High,
        queued_at: chrono::Utc::now(),
        retry_count: 0,
        max_retries: 3,
        retry_delay: Duration::from_secs(5),
        device_id: "test-device".to_string(),
        chain_id: 84532,
        metadata: HashMap::new(),
    };
    
    // High priority should come before low priority
    assert!(tx2 > tx1);
    
    // Same priority, earlier queued time should come first
    tx1.priority = TransactionPriority::Normal;
    tx2.priority = TransactionPriority::Normal;
    tx1.queued_at = chrono::Utc::now() - chrono::Duration::seconds(10);
    tx2.queued_at = chrono::Utc::now();
    
    assert!(tx1 > tx2);
}

#[tokio::test]
async fn test_transaction_queue_operations() {
    let mut queue = TransactionQueue::new(100);
    
    let transaction = QueuedTransaction {
        transaction: BLETransaction {
            id: "test-tx".to_string(),
            signed_tx: "0x1234567890abcdef".to_string(),
            chain_id: 84532,
            device_id: "test-device".to_string(),
            timestamp: chrono::Utc::now(),
            status: TransactionStatus::Pending,
            tx_hash: None,
        },
        priority: TransactionPriority::Normal,
        queued_at: chrono::Utc::now(),
        retry_count: 0,
        max_retries: 3,
        retry_delay: Duration::from_secs(5),
        device_id: "test-device".to_string(),
        chain_id: 84532,
        metadata: HashMap::new(),
    };
    
    // Add transaction
    queue.add_transaction(transaction).unwrap();
    assert_eq!(queue.get_queue_size(), 1);
    
    // Get next transaction
    let next_tx = queue.get_next_transaction();
    assert!(next_tx.is_some());
    assert_eq!(queue.get_queue_size(), 0);
    
    // Mark as processing
    queue.mark_processing("test-tx");
    assert_eq!(queue.get_processing_count(), 1);
    
    // Mark as completed
    let result = TransactionResult {
        transaction_id: "test-tx".to_string(),
        success: true,
        hash: Some("0xabcdef1234567890".to_string()),
        error_message: None,
        processing_time_ms: 100,
        retry_count: 0,
        chain_id: 84532,
        device_id: "test-device".to_string(),
        timestamp: chrono::Utc::now(),
        gas_used: Some(21000),
        block_number: Some(12345),
    };
    
    queue.mark_completed("test-tx", result);
    assert_eq!(queue.get_processing_count(), 0);
    assert_eq!(queue.get_completed_transactions().len(), 1);
}

#[tokio::test]
async fn test_transaction_result_serialization() {
    let result = TransactionResult {
        transaction_id: "test-tx".to_string(),
        success: true,
        hash: Some("0xabcdef1234567890".to_string()),
        error_message: None,
        processing_time_ms: 100,
        retry_count: 0,
        chain_id: 84532,
        device_id: "test-device".to_string(),
        timestamp: chrono::Utc::now(),
        gas_used: Some(21000),
        block_number: Some(12345),
    };
    
    // Test serialization
    let json = serde_json::to_string(&result).unwrap();
    let deserialized: TransactionResult = serde_json::from_str(&json).unwrap();
    
    assert_eq!(result.transaction_id, deserialized.transaction_id);
    assert_eq!(result.success, deserialized.success);
    assert_eq!(result.hash, deserialized.hash);
    assert_eq!(result.retry_count, deserialized.retry_count);
    assert_eq!(result.chain_id, deserialized.chain_id);
    assert_eq!(result.device_id, deserialized.device_id);
}

#[tokio::test]
async fn test_transaction_metrics_serialization() {
    let mut metrics = TransactionMetrics {
        total_processed: 100,
        total_successful: 95,
        total_failed: 5,
        total_retried: 10,
        average_processing_time_ms: 150,
        queue_size: 5,
        active_workers: 3,
        last_processed_at: Some(chrono::Utc::now()),
        chain_metrics: HashMap::new(),
    };
    
    metrics.chain_metrics.insert(84532, ChainMetrics {
        chain_id: 84532,
        transactions_processed: 50,
        transactions_successful: 48,
        transactions_failed: 2,
        average_gas_used: 21000,
        last_transaction_at: Some(chrono::Utc::now()),
    });
    
    // Test serialization
    let json = serde_json::to_string(&metrics).unwrap();
    let deserialized: TransactionMetrics = serde_json::from_str(&json).unwrap();
    
    assert_eq!(metrics.total_processed, deserialized.total_processed);
    assert_eq!(metrics.total_successful, deserialized.total_successful);
    assert_eq!(metrics.total_failed, deserialized.total_failed);
    assert_eq!(metrics.total_retried, deserialized.total_retried);
    assert_eq!(metrics.average_processing_time_ms, deserialized.average_processing_time_ms);
    assert_eq!(metrics.queue_size, deserialized.queue_size);
    assert_eq!(metrics.active_workers, deserialized.active_workers);
    assert_eq!(metrics.chain_metrics.len(), deserialized.chain_metrics.len());
} 