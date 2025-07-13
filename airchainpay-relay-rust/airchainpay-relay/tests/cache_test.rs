use crate::utils::cache::*;
use std::time::Duration;
use serde_json::json;

pub async fn test_cache_manager() -> crate::tests::TestResult {
    let start = std::time::Instant::now();
    
    let config = CacheConfig {
        max_size: 10,
        default_ttl: Duration::from_secs(5),
        max_memory_bytes: 1024 * 1024, // 1MB
        enable_compression: true,
        compression_threshold_bytes: 100,
        eviction_policy: EvictionPolicy::LRU,
        enable_warm_up: true,
        warm_up_interval: Duration::from_secs(10),
        enable_metrics: true,
        cleanup_interval: Duration::from_secs(1),
    };
    
    let cache = CacheManager::new(config);
    
    // Test basic operations
    match cache.set("test_key".to_string(), json!("test_value"), None, Some(CachePriority::High)).await {
        Ok(_) => {
            match cache.get("test_key").await {
                Some(value) => {
                    if value == json!("test_value") {
                        crate::tests::TestResult {
                            test_name: "Cache Manager Basic Operations".to_string(),
                            passed: true,
                            error: None,
                            duration_ms: start.elapsed().as_millis() as u64,
                        }
                    } else {
                        crate::tests::TestResult {
                            test_name: "Cache Manager Basic Operations".to_string(),
                            passed: false,
                            error: Some("Retrieved value doesn't match stored value".to_string()),
                            duration_ms: start.elapsed().as_millis() as u64,
                        }
                    }
                },
                None => crate::tests::TestResult {
                    test_name: "Cache Manager Basic Operations".to_string(),
                    passed: false,
                    error: Some("Failed to retrieve cached value".to_string()),
                    duration_ms: start.elapsed().as_millis() as u64,
                },
            }
        },
        Err(e) => crate::tests::TestResult {
            test_name: "Cache Manager Basic Operations".to_string(),
            passed: false,
            error: Some(format!("Failed to set cache value: {}", e)),
            duration_ms: start.elapsed().as_millis() as u64,
        },
    }
}

pub async fn test_cache_compression() -> crate::tests::TestResult {
    let start = std::time::Instant::now();
    
    let config = CacheConfig {
        max_size: 5,
        default_ttl: Duration::from_secs(10),
        max_memory_bytes: 1024 * 1024,
        enable_compression: true,
        compression_threshold_bytes: 50,
        eviction_policy: EvictionPolicy::LRU,
        enable_warm_up: false,
        warm_up_interval: Duration::from_secs(10),
        enable_metrics: true,
        cleanup_interval: Duration::from_secs(1),
    };
    
    let cache = CacheManager::new(config);
    
    // Create a large JSON object that should trigger compression
    let large_data = json!({
        "large_field": "This is a very long string that should trigger compression when stored in the cache. ".repeat(20),
        "nested": {
            "field1": "value1".repeat(10),
            "field2": "value2".repeat(10),
            "field3": "value3".repeat(10),
        },
        "array": vec![1, 2, 3, 4, 5].repeat(10),
    });
    
    match cache.set("compressed_key".to_string(), large_data.clone(), None, Some(CachePriority::Normal)).await {
        Ok(_) => {
            match cache.get("compressed_key").await {
                Some(retrieved_data) => {
                    if retrieved_data == large_data {
                        crate::tests::TestResult {
                            test_name: "Cache Compression".to_string(),
                            passed: true,
                            error: None,
                            duration_ms: start.elapsed().as_millis() as u64,
                        }
                    } else {
                        crate::tests::TestResult {
                            test_name: "Cache Compression".to_string(),
                            passed: false,
                            error: Some("Compressed data doesn't match original".to_string()),
                            duration_ms: start.elapsed().as_millis() as u64,
                        }
                    }
                },
                None => crate::tests::TestResult {
                    test_name: "Cache Compression".to_string(),
                    passed: false,
                    error: Some("Failed to retrieve compressed data".to_string()),
                    duration_ms: start.elapsed().as_millis() as u64,
                },
            }
        },
        Err(e) => crate::tests::TestResult {
            test_name: "Cache Compression".to_string(),
            passed: false,
            error: Some(format!("Failed to set compressed data: {}", e)),
            duration_ms: start.elapsed().as_millis() as u64,
        },
    }
}

pub async fn test_cache_eviction_policies() -> crate::tests::TestResult {
    let start = std::time::Instant::now();
    
    // Test LRU eviction
    let lru_config = CacheConfig {
        max_size: 3,
        default_ttl: Duration::from_secs(10),
        max_memory_bytes: 1024 * 1024,
        enable_compression: false,
        compression_threshold_bytes: 0,
        eviction_policy: EvictionPolicy::LRU,
        enable_warm_up: false,
        warm_up_interval: Duration::from_secs(10),
        enable_metrics: true,
        cleanup_interval: Duration::from_secs(1),
    };
    
    let lru_cache = CacheManager::new(lru_config);
    
    // Fill cache to capacity
    for i in 0..4 {
        let _ = lru_cache.set(format!("key{}", i), json!(format!("value{}", i)), None, Some(CachePriority::Normal)).await;
    }
    
    // Access first key to make it most recently used
    let _ = lru_cache.get("key0").await;
    
    // Add one more entry to trigger eviction
    let _ = lru_cache.set("key4".to_string(), json!("value4"), None, Some(CachePriority::Normal)).await;
    
    // Check that key1 was evicted (least recently used)
    match lru_cache.get("key1").await {
        None => crate::tests::TestResult {
            test_name: "Cache Eviction Policies".to_string(),
            passed: true,
            error: None,
            duration_ms: start.elapsed().as_millis() as u64,
        },
        Some(_) => crate::tests::TestResult {
            test_name: "Cache Eviction Policies".to_string(),
            passed: false,
            error: Some("LRU eviction didn't work as expected".to_string()),
            duration_ms: start.elapsed().as_millis() as u64,
        },
    }
}

pub async fn test_cache_tagging() -> crate::tests::TestResult {
    let start = std::time::Instant::now();
    
    let config = CacheConfig {
        max_size: 10,
        default_ttl: Duration::from_secs(10),
        max_memory_bytes: 1024 * 1024,
        enable_compression: false,
        compression_threshold_bytes: 0,
        eviction_policy: EvictionPolicy::LRU,
        enable_warm_up: false,
        warm_up_interval: Duration::from_secs(10),
        enable_metrics: true,
        cleanup_interval: Duration::from_secs(1),
    };
    
    let cache = CacheManager::new(config);
    
    // Add entries with tags
    let _ = cache.set_with_tags(
        "user1".to_string(),
        json!({"name": "Alice", "age": 30}),
        None,
        Some(CachePriority::Normal),
        vec!["user".to_string(), "profile".to_string()],
    ).await;
    
    let _ = cache.set_with_tags(
        "user2".to_string(),
        json!({"name": "Bob", "age": 25}),
        None,
        Some(CachePriority::Normal),
        vec!["user".to_string(), "profile".to_string()],
    ).await;
    
    let _ = cache.set_with_tags(
        "config1".to_string(),
        json!({"theme": "dark", "language": "en"}),
        None,
        Some(CachePriority::Normal),
        vec!["config".to_string(), "settings".to_string()],
    ).await;
    
    // Test getting by tag
    let user_entries = cache.get_by_tag("user").await;
    let config_entries = cache.get_by_tag("config").await;
    
    if user_entries.len() == 2 && config_entries.len() == 1 {
        crate::tests::TestResult {
            test_name: "Cache Tagging".to_string(),
            passed: true,
            error: None,
            duration_ms: start.elapsed().as_millis() as u64,
        }
    } else {
        crate::tests::TestResult {
            test_name: "Cache Tagging".to_string(),
            passed: false,
            error: Some(format!("Tag filtering failed. Expected 2 users and 1 config, got {} users and {} configs", 
                user_entries.len(), config_entries.len())),
            duration_ms: start.elapsed().as_millis() as u64,
        }
    }
}

pub async fn test_cache_priorities() -> crate::tests::TestResult {
    let start = std::time::Instant::now();
    
    let config = CacheConfig {
        max_size: 5,
        default_ttl: Duration::from_secs(10),
        max_memory_bytes: 1024 * 1024,
        enable_compression: false,
        compression_threshold_bytes: 0,
        eviction_policy: EvictionPolicy::Priority,
        enable_warm_up: false,
        warm_up_interval: Duration::from_secs(10),
        enable_metrics: true,
        cleanup_interval: Duration::from_secs(1),
    };
    
    let cache = CacheManager::new(config);
    
    // Add entries with different priorities
    let _ = cache.set("low_priority".to_string(), json!("low"), None, Some(CachePriority::Low)).await;
    let _ = cache.set("normal_priority".to_string(), json!("normal"), None, Some(CachePriority::Normal)).await;
    let _ = cache.set("high_priority".to_string(), json!("high"), None, Some(CachePriority::High)).await;
    let _ = cache.set("critical_priority".to_string(), json!("critical"), None, Some(CachePriority::Critical)).await;
    
    // Add one more to trigger eviction
    let _ = cache.set("another_entry".to_string(), json!("another"), None, Some(CachePriority::Normal)).await;
    
    // Check that low priority entry was evicted
    match cache.get("low_priority").await {
        None => crate::tests::TestResult {
            test_name: "Cache Priorities".to_string(),
            passed: true,
            error: None,
            duration_ms: start.elapsed().as_millis() as u64,
        },
        Some(_) => crate::tests::TestResult {
            test_name: "Cache Priorities".to_string(),
            passed: false,
            error: Some("Priority-based eviction didn't work as expected".to_string()),
            duration_ms: start.elapsed().as_millis() as u64,
        },
    }
}

pub async fn test_cache_warm_up() -> crate::tests::TestResult {
    let start = std::time::Instant::now();
    
    let config = CacheConfig {
        max_size: 10,
        default_ttl: Duration::from_secs(10),
        max_memory_bytes: 1024 * 1024,
        enable_compression: false,
        compression_threshold_bytes: 0,
        eviction_policy: EvictionPolicy::LRU,
        enable_warm_up: true,
        warm_up_interval: Duration::from_secs(10),
        enable_metrics: true,
        cleanup_interval: Duration::from_secs(1),
    };
    
    let cache = CacheManager::new(config);
    
    // Create warm-up data
    let mut warm_up_data = std::collections::HashMap::new();
    warm_up_data.insert("warm_key1".to_string(), json!("warm_value1"));
    warm_up_data.insert("warm_key2".to_string(), json!("warm_value2"));
    warm_up_data.insert("warm_key3".to_string(), json!("warm_value3"));
    
    match cache.warm_up(warm_up_data).await {
        Ok(_) => {
            // Check that warm-up data is available
            let key1 = cache.get("warm_key1").await;
            let key2 = cache.get("warm_key2").await;
            let key3 = cache.get("warm_key3").await;
            
            if key1.is_some() && key2.is_some() && key3.is_some() {
                crate::tests::TestResult {
                    test_name: "Cache Warm-up".to_string(),
                    passed: true,
                    error: None,
                    duration_ms: start.elapsed().as_millis() as u64,
                }
            } else {
                crate::tests::TestResult {
                    test_name: "Cache Warm-up".to_string(),
                    passed: false,
                    error: Some("Warm-up data not properly loaded".to_string()),
                    duration_ms: start.elapsed().as_millis() as u64,
                }
            }
        },
        Err(e) => crate::tests::TestResult {
            test_name: "Cache Warm-up".to_string(),
            passed: false,
            error: Some(format!("Warm-up failed: {}", e)),
            duration_ms: start.elapsed().as_millis() as u64,
        },
    }
}

pub async fn test_cache_metrics() -> crate::tests::TestResult {
    let start = std::time::Instant::now();
    
    let config = CacheConfig {
        max_size: 5,
        default_ttl: Duration::from_secs(10),
        max_memory_bytes: 1024 * 1024,
        enable_compression: false,
        compression_threshold_bytes: 0,
        eviction_policy: EvictionPolicy::LRU,
        enable_warm_up: false,
        warm_up_interval: Duration::from_secs(10),
        enable_metrics: true,
        cleanup_interval: Duration::from_secs(1),
    };
    
    let cache = CacheManager::new(config);
    
    // Perform some operations
    let _ = cache.set("key1".to_string(), json!("value1"), None, Some(CachePriority::Normal)).await;
    let _ = cache.set("key2".to_string(), json!("value2"), None, Some(CachePriority::Normal)).await;
    let _ = cache.get("key1").await; // Hit
    let _ = cache.get("key2").await; // Hit
    let _ = cache.get("key3").await; // Miss
    
    let stats = cache.get_stats().await;
    
    if stats.total_entries == 2 && stats.hit_count == 2 && stats.miss_count == 1 && stats.total_requests == 3 {
        crate::tests::TestResult {
            test_name: "Cache Metrics".to_string(),
            passed: true,
            error: None,
            duration_ms: start.elapsed().as_millis() as u64,
        }
    } else {
        crate::tests::TestResult {
            test_name: "Cache Metrics".to_string(),
            passed: false,
            error: Some(format!("Metrics don't match expected values. Entries: {}, Hits: {}, Misses: {}, Total: {}", 
                stats.total_entries, stats.hit_count, stats.miss_count, stats.total_requests)),
            duration_ms: start.elapsed().as_millis() as u64,
        }
    }
}

pub async fn test_transaction_cache() -> crate::tests::TestResult {
    let start = std::time::Instant::now();
    
    let tx_cache = TransactionCache::new();
    
    // Test transaction caching
    let tx_data = json!({
        "hash": "0x1234567890abcdef",
        "from": "0xabcdef1234567890",
        "to": "0x9876543210fedcba",
        "value": "1000000000000000000",
        "gas": 21000,
        "status": "pending"
    });
    
    match tx_cache.cache_transaction("0x1234567890abcdef", tx_data.clone()).await {
        Ok(_) => {
            match tx_cache.get_transaction("0x1234567890abcdef").await {
                Some(retrieved_tx) => {
                    if retrieved_tx == tx_data {
                        crate::tests::TestResult {
                            test_name: "Transaction Cache".to_string(),
                            passed: true,
                            error: None,
                            duration_ms: start.elapsed().as_millis() as u64,
                        }
                    } else {
                        crate::tests::TestResult {
                            test_name: "Transaction Cache".to_string(),
                            passed: false,
                            error: Some("Retrieved transaction doesn't match stored transaction".to_string()),
                            duration_ms: start.elapsed().as_millis() as u64,
                        }
                    }
                },
                None => crate::tests::TestResult {
                    test_name: "Transaction Cache".to_string(),
                    passed: false,
                    error: Some("Failed to retrieve cached transaction".to_string()),
                    duration_ms: start.elapsed().as_millis() as u64,
                },
            }
        },
        Err(e) => crate::tests::TestResult {
            test_name: "Transaction Cache".to_string(),
            passed: false,
            error: Some(format!("Failed to cache transaction: {}", e)),
            duration_ms: start.elapsed().as_millis() as u64,
        },
    }
}

pub async fn test_metrics_cache() -> crate::tests::TestResult {
    let start = std::time::Instant::now();
    
    let metrics_cache = MetricsCache::new();
    
    // Test metrics caching
    let metric_data = json!({
        "cpu_usage": 45.2,
        "memory_usage": 1024,
        "timestamp": 1640995200
    });
    
    match metrics_cache.cache_metrics("system_metrics", metric_data.clone()).await {
        Ok(_) => {
            match metrics_cache.get_metrics("system_metrics").await {
                Some(retrieved_metric) => {
                    if retrieved_metric == metric_data {
                        crate::tests::TestResult {
                            test_name: "Metrics Cache".to_string(),
                            passed: true,
                            error: None,
                            duration_ms: start.elapsed().as_millis() as u64,
                        }
                    } else {
                        crate::tests::TestResult {
                            test_name: "Metrics Cache".to_string(),
                            passed: false,
                            error: Some("Retrieved metric doesn't match stored metric".to_string()),
                            duration_ms: start.elapsed().as_millis() as u64,
                        }
                    }
                },
                None => crate::tests::TestResult {
                    test_name: "Metrics Cache".to_string(),
                    passed: false,
                    error: Some("Failed to retrieve cached metric".to_string()),
                    duration_ms: start.elapsed().as_millis() as u64,
                },
            }
        },
        Err(e) => crate::tests::TestResult {
            test_name: "Metrics Cache".to_string(),
            passed: false,
            error: Some(format!("Failed to cache metric: {}", e)),
            duration_ms: start.elapsed().as_millis() as u64,
        },
    }
}

pub async fn test_blockchain_cache() -> crate::tests::TestResult {
    let start = std::time::Instant::now();
    
    let blockchain_cache = BlockchainCache::new();
    
    // Test provider caching
    let provider_data = json!({
        "rpc_url": "https://mainnet.infura.io/v3/your-project-id",
        "chain_id": 1,
        "network": "ethereum"
    });
    
    match blockchain_cache.cache_provider("1", provider_data.clone()).await {
        Ok(_) => {
            match blockchain_cache.get_provider("1").await {
                Some(retrieved_provider) => {
                    if retrieved_provider == provider_data {
                        crate::tests::TestResult {
                            test_name: "Blockchain Cache".to_string(),
                            passed: true,
                            error: None,
                            duration_ms: start.elapsed().as_millis() as u64,
                        }
                    } else {
                        crate::tests::TestResult {
                            test_name: "Blockchain Cache".to_string(),
                            passed: false,
                            error: Some("Retrieved provider doesn't match stored provider".to_string()),
                            duration_ms: start.elapsed().as_millis() as u64,
                        }
                    }
                },
                None => crate::tests::TestResult {
                    test_name: "Blockchain Cache".to_string(),
                    passed: false,
                    error: Some("Failed to retrieve cached provider".to_string()),
                    duration_ms: start.elapsed().as_millis() as u64,
                },
            }
        },
        Err(e) => crate::tests::TestResult {
            test_name: "Blockchain Cache".to_string(),
            passed: false,
            error: Some(format!("Failed to cache provider: {}", e)),
            duration_ms: start.elapsed().as_millis() as u64,
        },
    }
}

pub async fn test_cache_expiration() -> crate::tests::TestResult {
    let start = std::time::Instant::now();
    
    let config = CacheConfig {
        max_size: 5,
        default_ttl: Duration::from_millis(100), // Very short TTL for testing
        max_memory_bytes: 1024 * 1024,
        enable_compression: false,
        compression_threshold_bytes: 0,
        eviction_policy: EvictionPolicy::LRU,
        enable_warm_up: false,
        warm_up_interval: Duration::from_secs(10),
        enable_metrics: true,
        cleanup_interval: Duration::from_millis(50), // Short cleanup interval
    };
    
    let cache = CacheManager::new(config);
    
    // Add an entry with short TTL
    let _ = cache.set("expiring_key".to_string(), json!("expiring_value"), Some(Duration::from_millis(50)), Some(CachePriority::Normal)).await;
    
    // Wait for expiration
    tokio::time::sleep(Duration::from_millis(150)).await;
    
    // Check that entry has expired
    match cache.get("expiring_key").await {
        None => crate::tests::TestResult {
            test_name: "Cache Expiration".to_string(),
            passed: true,
            error: None,
            duration_ms: start.elapsed().as_millis() as u64,
        },
        Some(_) => crate::tests::TestResult {
            test_name: "Cache Expiration".to_string(),
            passed: false,
            error: Some("Expired entry still exists in cache".to_string()),
            duration_ms: start.elapsed().as_millis() as u64,
        },
    }
}

pub async fn test_cache_performance() -> crate::tests::TestResult {
    let start = std::time::Instant::now();
    
    let config = CacheConfig {
        max_size: 1000,
        default_ttl: Duration::from_secs(10),
        max_memory_bytes: 10 * 1024 * 1024, // 10MB
        enable_compression: true,
        compression_threshold_bytes: 100,
        eviction_policy: EvictionPolicy::LRU,
        enable_warm_up: false,
        warm_up_interval: Duration::from_secs(10),
        enable_metrics: true,
        cleanup_interval: Duration::from_secs(1),
    };
    
    let cache = CacheManager::new(config);
    
    // Performance test: Set and get many entries
    let test_start = std::time::Instant::now();
    
    for i in 0..100 {
        let key = format!("perf_key_{}", i);
        let value = json!({
            "id": i,
            "data": format!("performance_test_data_{}", i),
            "timestamp": chrono::Utc::now().timestamp(),
        });
        
        let _ = cache.set(key.clone(), value, None, Some(CachePriority::Normal)).await;
        let _ = cache.get(&key).await;
    }
    
    let test_duration = test_start.elapsed();
    let stats = cache.get_stats().await;
    
    // Check performance metrics
    if stats.total_entries == 100 && stats.hit_count == 100 && test_duration.as_millis() < 1000 {
        crate::tests::TestResult {
            test_name: "Cache Performance".to_string(),
            passed: true,
            error: None,
            duration_ms: start.elapsed().as_millis() as u64,
        }
    } else {
        crate::tests::TestResult {
            test_name: "Cache Performance".to_string(),
            passed: false,
            error: Some(format!("Performance test failed. Entries: {}, Hits: {}, Duration: {}ms", 
                stats.total_entries, stats.hit_count, test_duration.as_millis())),
            duration_ms: start.elapsed().as_millis() as u64,
        }
    }
} 