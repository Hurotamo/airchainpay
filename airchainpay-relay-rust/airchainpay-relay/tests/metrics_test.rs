use std::collections::HashMap;
use std::time::{Duration, Instant};
use tokio::sync::mpsc;
use crate::{
    monitoring::MonitoringManager,
    utils::prometheus::PrometheusExporter,
    logger::Logger,
};

pub async fn test_metrics_collection() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match MonitoringManager::new() {
        Ok(manager) => {
            // Test metrics collection
            manager.increment_counter("test_counter", 1).await;
            manager.set_gauge("test_gauge", 100.0).await;
            manager.record_histogram("test_histogram", 50.0).await;
            
            // Verify metrics were collected
            let counter_value = manager.get_counter("test_counter").await;
            let gauge_value = manager.get_gauge("test_gauge").await;
            
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Metrics Collection".to_string(),
                passed: counter_value == 1 && gauge_value == 100.0,
                error: if counter_value == 1 && gauge_value == 100.0 { 
                    None 
                } else { 
                    Some("Metrics collection failed".to_string()) 
                },
                duration_ms: duration,
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Metrics Collection".to_string(),
                passed: false,
                error: Some(format!("Failed to create monitoring manager: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_transaction_metrics() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match MonitoringManager::new() {
        Ok(manager) => {
            // Test transaction metrics
            manager.record_transaction_received().await;
            manager.record_transaction_processed().await;
            manager.record_transaction_failed().await;
            manager.record_transaction_broadcasted().await;
            
            // Verify transaction metrics
            let received = manager.get_transaction_metrics().await.received;
            let processed = manager.get_transaction_metrics().await.processed;
            let failed = manager.get_transaction_metrics().await.failed;
            let broadcasted = manager.get_transaction_metrics().await.broadcasted;
            
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Transaction Metrics".to_string(),
                passed: received >= 1 && processed >= 1 && failed >= 1 && broadcasted >= 1,
                error: if received >= 1 && processed >= 1 && failed >= 1 && broadcasted >= 1 { 
                    None 
                } else { 
                    Some("Transaction metrics test failed".to_string()) 
                },
                duration_ms: duration,
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Transaction Metrics".to_string(),
                passed: false,
                error: Some(format!("Failed to create monitoring manager: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_ble_metrics() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match MonitoringManager::new() {
        Ok(manager) => {
            // Test BLE metrics
            manager.record_ble_connection().await;
            manager.record_ble_disconnection().await;
            manager.record_ble_authentication().await;
            manager.record_ble_key_exchange().await;
            
            // Verify BLE metrics
            let connections = manager.get_ble_metrics().await.connections;
            let disconnections = manager.get_ble_metrics().await.disconnections;
            let authentications = manager.get_ble_metrics().await.authentications;
            let key_exchanges = manager.get_ble_metrics().await.key_exchanges;
            
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "BLE Metrics".to_string(),
                passed: connections >= 1 && disconnections >= 1 && authentications >= 1 && key_exchanges >= 1,
                error: if connections >= 1 && disconnections >= 1 && authentications >= 1 && key_exchanges >= 1 { 
                    None 
                } else { 
                    Some("BLE metrics test failed".to_string()) 
                },
                duration_ms: duration,
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "BLE Metrics".to_string(),
                passed: false,
                error: Some(format!("Failed to create monitoring manager: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_system_metrics() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match MonitoringManager::new() {
        Ok(manager) => {
            // Test system metrics
            manager.record_memory_usage(1024 * 1024).await; // 1MB
            manager.record_cpu_usage(50.5).await;
            manager.record_uptime(3600).await; // 1 hour
            
            // Verify system metrics
            let memory_usage = manager.get_system_metrics().await.memory_usage;
            let cpu_usage = manager.get_system_metrics().await.cpu_usage;
            let uptime = manager.get_system_metrics().await.uptime;
            
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "System Metrics".to_string(),
                passed: memory_usage > 0 && cpu_usage > 0.0 && uptime > 0,
                error: if memory_usage > 0 && cpu_usage > 0.0 && uptime > 0 { 
                    None 
                } else { 
                    Some("System metrics test failed".to_string()) 
                },
                duration_ms: duration,
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "System Metrics".to_string(),
                passed: false,
                error: Some(format!("Failed to create monitoring manager: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_error_metrics() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match MonitoringManager::new() {
        Ok(manager) => {
            // Test error metrics
            manager.record_rpc_error().await;
            manager.record_auth_failure().await;
            manager.record_rate_limit_hit().await;
            manager.record_blocked_device().await;
            
            // Verify error metrics
            let rpc_errors = manager.get_error_metrics().await.rpc_errors;
            let auth_failures = manager.get_error_metrics().await.auth_failures;
            let rate_limit_hits = manager.get_error_metrics().await.rate_limit_hits;
            let blocked_devices = manager.get_error_metrics().await.blocked_devices;
            
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Error Metrics".to_string(),
                passed: rpc_errors >= 1 && auth_failures >= 1 && rate_limit_hits >= 1 && blocked_devices >= 1,
                error: if rpc_errors >= 1 && auth_failures >= 1 && rate_limit_hits >= 1 && blocked_devices >= 1 { 
                    None 
                } else { 
                    Some("Error metrics test failed".to_string()) 
                },
                duration_ms: duration,
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Error Metrics".to_string(),
                passed: false,
                error: Some(format!("Failed to create monitoring manager: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_prometheus_export() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    let exporter = PrometheusExporter::new();
    
    // Test Prometheus metrics export
    match exporter.generate_metrics().await {
        Ok(metrics) => {
            // Verify metrics format
            let has_help_lines = metrics.contains("# HELP");
            let has_type_lines = metrics.contains("# TYPE");
            let has_metric_lines = metrics.contains("airchainpay_");
            
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Prometheus Export".to_string(),
                passed: has_help_lines && has_type_lines && has_metric_lines,
                error: if has_help_lines && has_type_lines && has_metric_lines { 
                    None 
                } else { 
                    Some("Prometheus export format invalid".to_string()) 
                },
                duration_ms: duration,
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Prometheus Export".to_string(),
                passed: false,
                error: Some(format!("Failed to generate Prometheus metrics: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_metrics_reset() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match MonitoringManager::new() {
        Ok(manager) => {
            // Add some metrics
            manager.increment_counter("reset_test_counter", 5).await;
            manager.set_gauge("reset_test_gauge", 200.0).await;
            
            // Reset metrics
            manager.reset_metrics().await;
            
            // Verify metrics are reset
            let counter_value = manager.get_counter("reset_test_counter").await;
            let gauge_value = manager.get_gauge("reset_test_gauge").await;
            
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Metrics Reset".to_string(),
                passed: counter_value == 0 && gauge_value == 0.0,
                error: if counter_value == 0 && gauge_value == 0.0 { 
                    None 
                } else { 
                    Some("Metrics reset failed".to_string()) 
                },
                duration_ms: duration,
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Metrics Reset".to_string(),
                passed: false,
                error: Some(format!("Failed to create monitoring manager: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_metrics_persistence() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match MonitoringManager::new() {
        Ok(manager) => {
            // Add metrics
            manager.increment_counter("persist_test_counter", 10).await;
            manager.set_gauge("persist_test_gauge", 150.0).await;
            
            // Save metrics
            match manager.save_metrics("test_metrics.json").await {
                Ok(_) => {
                    // Load metrics
                    match manager.load_metrics("test_metrics.json").await {
                        Ok(_) => {
                            // Verify metrics are loaded
                            let counter_value = manager.get_counter("persist_test_counter").await;
                            let gauge_value = manager.get_gauge("persist_test_gauge").await;
                            
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "Metrics Persistence".to_string(),
                                passed: counter_value == 10 && gauge_value == 150.0,
                                error: if counter_value == 10 && gauge_value == 150.0 { 
                                    None 
                                } else { 
                                    Some("Metrics persistence failed".to_string()) 
                                },
                                duration_ms: duration,
                            }
                        }
                        Err(e) => {
                            let duration = start_time.elapsed().as_millis() as u64;
                            crate::tests::TestResult {
                                test_name: "Metrics Persistence".to_string(),
                                passed: false,
                                error: Some(format!("Failed to load metrics: {}", e)),
                                duration_ms: duration,
                            }
                        }
                    }
                }
                Err(e) => {
                    let duration = start_time.elapsed().as_millis() as u64;
                    crate::tests::TestResult {
                        test_name: "Metrics Persistence".to_string(),
                        passed: false,
                        error: Some(format!("Failed to save metrics: {}", e)),
                        duration_ms: duration,
                    }
                }
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Metrics Persistence".to_string(),
                passed: false,
                error: Some(format!("Failed to create monitoring manager: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn test_metrics_aggregation() -> crate::tests::TestResult {
    let start_time = Instant::now();
    
    match MonitoringManager::new() {
        Ok(manager) => {
            // Add multiple metrics over time
            for i in 0..10 {
                manager.increment_counter("aggregation_test", 1).await;
                manager.record_histogram("aggregation_histogram", i as f64).await;
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            
            // Test aggregation
            let total_counter = manager.get_counter("aggregation_test").await;
            let histogram_stats = manager.get_histogram_stats("aggregation_histogram").await;
            
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Metrics Aggregation".to_string(),
                passed: total_counter == 10 && histogram_stats.count >= 10,
                error: if total_counter == 10 && histogram_stats.count >= 10 { 
                    None 
                } else { 
                    Some("Metrics aggregation failed".to_string()) 
                },
                duration_ms: duration,
            }
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            crate::tests::TestResult {
                test_name: "Metrics Aggregation".to_string(),
                passed: false,
                error: Some(format!("Failed to create monitoring manager: {}", e)),
                duration_ms: duration,
            }
        }
    }
}

pub async fn run_all_metrics_tests() -> Vec<crate::tests::TestResult> {
    let mut results = Vec::new();
    
    Logger::info("Running metrics unit tests");
    
    results.push(test_metrics_collection().await);
    results.push(test_transaction_metrics().await);
    results.push(test_ble_metrics().await);
    results.push(test_system_metrics().await);
    results.push(test_error_metrics().await);
    results.push(test_prometheus_export().await);
    results.push(test_metrics_reset().await);
    results.push(test_metrics_persistence().await);
    results.push(test_metrics_aggregation().await);
    
    results
} 