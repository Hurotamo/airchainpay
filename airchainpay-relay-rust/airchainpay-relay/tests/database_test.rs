use std::collections::HashMap;
use std::time::{Duration, Instant};
use tokio::sync::mpsc;
use crate::{
    storage::Storage,
    utils::database::DatabaseManager,
    logger::Logger,
};

pub async fn test_database_initialization() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match DatabaseManager::new("test_db.sqlite").await {
        Ok(db) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Database Initialization".to_string(),
                passed: true,
                error: None,
                duration_ms: duration,
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Database Initialization".to_string(),
                passed: false,
                error: Some(format!("Failed to initialize database: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_database_connection_pool() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match DatabaseManager::new("test_pool.sqlite").await {
        Ok(db) => {
            // Test multiple concurrent connections
            let mut handles = Vec::new();
            for i in 0..10 {
                let db_clone = db.clone();
                handles.push(tokio::spawn(async move {
                    db_clone.execute("SELECT 1").await
                }));
            }
            
            let mut all_success = true;
            for handle in handles {
                match handle.await {
                    Ok(Ok(_)) => {},
                    _ => all_success = false,
                }
            }
            
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Database Connection Pool".to_string(),
                passed: all_success,
                error: if all_success { None } else { Some("Connection pool test failed".to_string()) },
                duration_ms: duration,
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Database Connection Pool".to_string(),
                passed: false,
                error: Some(format!("Failed to create database: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_transaction_operations() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match DatabaseManager::new("test_transactions.sqlite").await {
        Ok(db) => {
            // Test transaction creation
            let tx_data = serde_json::json!({
                "id": "test-tx-123",
                "hash": "0x123456789abcdef",
                "from": "0x1234567890123456789012345678901234567890",
                "to": "0x0987654321098765432109876543210987654321",
                "value": "1000000000000000000",
                "status": "pending"
            });
            
            match db.execute("INSERT INTO transactions (id, data) VALUES (?, ?)", 
                           &[&"test-tx-123", &tx_data.to_string()]).await {
                Ok(_) => {
                    // Test transaction retrieval
                    match db.query_one("SELECT data FROM transactions WHERE id = ?", &[&"test-tx-123"]).await {
                        Ok(row) => {
                            let retrieved_data: String = row.get(0);
                            let parsed_data: serde_json::Value = serde_json::from_str(&retrieved_data).unwrap();
                            
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "Transaction Operations".to_string(),
                                passed: parsed_data["id"] == "test-tx-123",
                                error: if parsed_data["id"] == "test-tx-123" { 
                                    None 
                                } else { 
                                    Some("Transaction data mismatch".to_string()) 
                                },
                                duration_ms: duration,
                            }
                        }
                        Err(e) => {
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "Transaction Operations".to_string(),
                                passed: false,
                                error: Some(format!("Failed to retrieve transaction: {}", e)),
                                duration_ms: duration,
                            }
                        }
                    }
                }
                Err(e) => {
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "Transaction Operations".to_string(),
                        passed: false,
                        error: Some(format!("Failed to insert transaction: {}", e)),
                        duration_ms: duration,
                    }
                }
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Transaction Operations".to_string(),
                passed: false,
                error: Some(format!("Failed to create database: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_ble_device_operations() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match DatabaseManager::new("test_ble.sqlite").await {
        Ok(db) => {
            // Test BLE device registration
            let device_data = serde_json::json!({
                "id": "ble-device-123",
                "name": "Test Device",
                "address": "00:11:22:33:44:55",
                "status": "connected",
                "last_seen": chrono::Utc::now().timestamp()
            });
            
            match db.execute("INSERT INTO ble_devices (id, data) VALUES (?, ?)", 
                           &[&"ble-device-123", &device_data.to_string()]).await {
                Ok(_) => {
                    // Test device retrieval
                    match db.query_one("SELECT data FROM ble_devices WHERE id = ?", &[&"ble-device-123"]).await {
                        Ok(row) => {
                            let retrieved_data: String = row.get(0);
                            let parsed_data: serde_json::Value = serde_json::from_str(&retrieved_data).unwrap();
                            
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "BLE Device Operations".to_string(),
                                passed: parsed_data["id"] == "ble-device-123",
                                error: if parsed_data["id"] == "ble-device-123" { 
                                    None 
                                } else { 
                                    Some("BLE device data mismatch".to_string()) 
                                },
                                duration_ms: duration,
                            }
                        }
                        Err(e) => {
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "BLE Device Operations".to_string(),
                                passed: false,
                                error: Some(format!("Failed to retrieve BLE device: {}", e)),
                                duration_ms: duration,
                            }
                        }
                    }
                }
                Err(e) => {
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "BLE Device Operations".to_string(),
                        passed: false,
                        error: Some(format!("Failed to insert BLE device: {}", e)),
                        duration_ms: duration,
                    }
                }
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "BLE Device Operations".to_string(),
                passed: false,
                error: Some(format!("Failed to create database: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_metrics_storage() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match DatabaseManager::new("test_metrics.sqlite").await {
        Ok(db) => {
            // Test metrics storage
            let metrics_data = serde_json::json!({
                "timestamp": chrono::Utc::now().timestamp(),
                "transactions_received": 100,
                "transactions_processed": 95,
                "transactions_failed": 5,
                "ble_connections": 10,
                "memory_usage": 1024 * 1024,
                "cpu_usage": 50.5
            });
            
            match db.execute("INSERT INTO metrics (timestamp, data) VALUES (?, ?)", 
                           &[&chrono::Utc::now().timestamp(), &metrics_data.to_string()]).await {
                Ok(_) => {
                    // Test metrics retrieval
                    match db.query_one("SELECT data FROM metrics ORDER BY timestamp DESC LIMIT 1").await {
                        Ok(row) => {
                            let retrieved_data: String = row.get(0);
                            let parsed_data: serde_json::Value = serde_json::from_str(&retrieved_data).unwrap();
                            
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "Metrics Storage".to_string(),
                                passed: parsed_data["transactions_received"] == 100,
                                error: if parsed_data["transactions_received"] == 100 { 
                                    None 
                                } else { 
                                    Some("Metrics data mismatch".to_string()) 
                                },
                                duration_ms: duration,
                            }
                        }
                        Err(e) => {
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "Metrics Storage".to_string(),
                                passed: false,
                                error: Some(format!("Failed to retrieve metrics: {}", e)),
                                duration_ms: duration,
                            }
                        }
                    }
                }
                Err(e) => {
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "Metrics Storage".to_string(),
                        passed: false,
                        error: Some(format!("Failed to insert metrics: {}", e)),
                        duration_ms: duration,
                    }
                }
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Metrics Storage".to_string(),
                passed: false,
                error: Some(format!("Failed to create database: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_concurrent_access() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match DatabaseManager::new("test_concurrent.sqlite").await {
        Ok(db) => {
            let mut handles = Vec::new();
            
            // Spawn multiple concurrent operations
            for i in 0..20 {
                let db_clone = db.clone();
                handles.push(tokio::spawn(async move {
                    let data = serde_json::json!({
                        "id": format!("concurrent-{}", i),
                        "value": i,
                        "timestamp": chrono::Utc::now().timestamp()
                    });
                    
                    db_clone.execute("INSERT INTO test_concurrent (id, data) VALUES (?, ?)", 
                                   &[&format!("concurrent-{}", i), &data.to_string()]).await
                }));
            }
            
            let mut success_count = 0;
            for handle in handles {
                match handle.await {
                    Ok(Ok(_)) => success_count += 1,
                    _ => {}
                }
            }
            
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Concurrent Database Access".to_string(),
                passed: success_count >= 18, // Allow some failures
                error: if success_count >= 18 { 
                    None 
                } else { 
                    Some(format!("Only {} out of 20 concurrent operations succeeded", success_count)) 
                },
                duration_ms: duration,
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Concurrent Database Access".to_string(),
                passed: false,
                error: Some(format!("Failed to create database: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_database_backup() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match DatabaseManager::new("test_backup.sqlite").await {
        Ok(db) => {
            // Insert some test data
            let test_data = serde_json::json!({
                "id": "backup-test",
                "value": "test-value"
            });
            
            match db.execute("INSERT INTO test_backup (id, data) VALUES (?, ?)", 
                           &[&"backup-test", &test_data.to_string()]).await {
                Ok(_) => {
                    // Test backup functionality
                    match db.backup("test_backup_copy.sqlite").await {
                        Ok(_) => {
                            // Verify backup by reading from backup file
                            match DatabaseManager::new("test_backup_copy.sqlite").await {
                                Ok(backup_db) => {
                                    match backup_db.query_one("SELECT data FROM test_backup WHERE id = ?", &[&"backup-test"]).await {
                                        Ok(row) => {
                                            let retrieved_data: String = row.get(0);
                                            let parsed_data: serde_json::Value = serde_json::from_str(&retrieved_data).unwrap();
                                            
                                            let duration = start_time.elapsed().as_millis() as u64;
                                            crate::tests::TestResult {
                                                test_name: "Database Backup".to_string(),
                                                passed: parsed_data["id"] == "backup-test",
                                                error: if parsed_data["id"] == "backup-test" { 
                                                    None 
                                                } else { 
                                                    Some("Backup data mismatch".to_string()) 
                                                },
                                                duration_ms: duration,
                                            }
                                        }
                                        Err(e) => {
                                            let duration = start_time.elapsed().as_millis() as u64;
                                            crate::tests::TestResult {
                                                test_name: "Database Backup".to_string(),
                                                passed: false,
                                                error: Some(format!("Failed to read from backup: {}", e)),
                                                duration_ms: duration,
                                            }
                                        }
                                    }
                                }
                                Err(e) => {
                                    let duration = start_time.elapsed().as_millis() as u64;
                                    crate::tests::TestResult {
                                        test_name: "Database Backup".to_string(),
                                        passed: false,
                                        error: Some(format!("Failed to open backup database: {}", e)),
                                        duration_ms: duration,
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "Database Backup".to_string(),
                                passed: false,
                                error: Some(format!("Failed to create backup: {}", e)),
                                duration_ms: duration,
                            }
                        }
                    }
                }
                Err(e) => {
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "Database Backup".to_string(),
                        passed: false,
                        error: Some(format!("Failed to insert test data: {}", e)),
                        duration_ms: duration,
                    }
                }
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Database Backup".to_string(),
                passed: false,
                error: Some(format!("Failed to create database: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_database_cleanup() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match DatabaseManager::new("test_cleanup.sqlite").await {
        Ok(db) => {
            // Insert old data
            let old_timestamp = chrono::Utc::now().timestamp() - 86400 * 30; // 30 days ago
            let old_data = serde_json::json!({
                "id": "old-data",
                "timestamp": old_timestamp
            });
            
            match db.execute("INSERT INTO metrics (timestamp, data) VALUES (?, ?)", 
                           &[&old_timestamp, &old_data.to_string()]).await {
                Ok(_) => {
                    // Test cleanup functionality
                    match db.cleanup_old_data(86400 * 7).await { // Keep only 7 days
                        Ok(deleted_count) => {
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "Database Cleanup".to_string(),
                                passed: deleted_count > 0,
                                error: if deleted_count > 0 { 
                                    None 
                                } else { 
                                    Some("No old data was cleaned up".to_string()) 
                                },
                                duration_ms: duration,
                            }
                        }
                        Err(e) => {
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "Database Cleanup".to_string(),
                                passed: false,
                                error: Some(format!("Failed to cleanup old data: {}", e)),
                                duration_ms: duration,
                            }
                        }
                    }
                }
                Err(e) => {
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "Database Cleanup".to_string(),
                        passed: false,
                        error: Some(format!("Failed to insert old data: {}", e)),
                        duration_ms: duration,
                    }
                }
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Database Cleanup".to_string(),
                passed: false,
                error: Some(format!("Failed to create database: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn run_all_database_tests() -> Vec<crate::tests::TestResult> {
    let mut results = Vec::new();
    
    Logger::info("Running database unit tests");
    
    results.push(test_database_initialization().await);
    results.push(test_database_connection_pool().await);
    results.push(test_transaction_operations().await);
    results.push(test_ble_device_operations().await);
    results.push(test_metrics_storage().await);
    results.push(test_concurrent_access().await);
    results.push(test_database_backup().await);
    results.push(test_database_cleanup().await);
    
    results
} 