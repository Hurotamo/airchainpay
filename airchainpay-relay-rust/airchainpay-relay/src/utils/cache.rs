use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};
use crate::logger::Logger;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry<T> {
    pub data: T,
    pub created_at: Instant,
    pub expires_at: Option<Instant>,
    pub access_count: u64,
    pub last_accessed: Instant,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub total_entries: u64,
    pub hit_count: u64,
    pub miss_count: u64,
    pub eviction_count: u64,
    pub memory_usage_bytes: u64,
}

pub struct CacheManager {
    cache: Arc<RwLock<HashMap<String, CacheEntry<serde_json::Value>>>>,
    max_size: usize,
    default_ttl: Duration,
    stats: Arc<RwLock<CacheStats>>,
}

impl CacheManager {
    pub fn new(max_size: usize, default_ttl: Duration) -> Self {
        Self {
            cache: Arc::new(RwLock::new(HashMap::new())),
            max_size,
            default_ttl,
            stats: Arc::new(RwLock::new(CacheStats {
                total_entries: 0,
                hit_count: 0,
                miss_count: 0,
                eviction_count: 0,
                memory_usage_bytes: 0,
            })),
        }
    }

    pub async fn get(&self, key: &str) -> Option<serde_json::Value> {
        let mut cache = self.cache.write().await;
        let mut stats = self.stats.write().await;

        if let Some(entry) = cache.get_mut(key) {
            // Check if entry has expired
            if let Some(expires_at) = entry.expires_at {
                if Instant::now() > expires_at {
                    cache.remove(key);
                    stats.total_entries = stats.total_entries.saturating_sub(1);
                    stats.miss_count += 1;
                    return None;
                }
            }

            // Update access statistics
            entry.access_count += 1;
            entry.last_accessed = Instant::now();
            stats.hit_count += 1;

            Some(entry.data.clone())
        } else {
            stats.miss_count += 1;
            None
        }
    }

    pub async fn set(&self, key: String, value: serde_json::Value, ttl: Option<Duration>) -> Result<(), Box<dyn std::error::Error>> {
        let mut cache = self.cache.write().await;
        let mut stats = self.stats.write().await;

        // Check if we need to evict entries
        if cache.len() >= self.max_size {
            self.evict_entries(&mut cache, &mut stats).await;
        }

        let expires_at = ttl.or(Some(self.default_ttl))
            .map(|duration| Instant::now() + duration);

        let entry = CacheEntry {
            data: value,
            created_at: Instant::now(),
            expires_at,
            access_count: 0,
            last_accessed: Instant::now(),
        };

        cache.insert(key, entry);
        stats.total_entries += 1;

        Ok(())
    }

    pub async fn delete(&self, key: &str) -> bool {
        let mut cache = self.cache.write().await;
        let mut stats = self.stats.write().await;

        if cache.remove(key).is_some() {
            stats.total_entries = stats.total_entries.saturating_sub(1);
            true
        } else {
            false
        }
    }

    pub async fn clear(&self) {
        let mut cache = self.cache.write().await;
        let mut stats = self.stats.write().await;

        cache.clear();
        stats.total_entries = 0;
        stats.eviction_count += 1;
    }

    pub async fn get_stats(&self) -> CacheStats {
        self.stats.read().await.clone()
    }

    async fn evict_entries(&self, cache: &mut HashMap<String, CacheEntry<serde_json::Value>>, stats: &mut CacheStats) {
        // Simple LRU eviction - remove oldest accessed entries
        let mut entries: Vec<_> = cache.iter().collect();
        entries.sort_by_key(|(_, entry)| entry.last_accessed);

        // Remove 20% of entries
        let evict_count = (cache.len() / 5).max(1);
        for (key, _) in entries.iter().take(evict_count) {
            cache.remove(*key);
        }

        stats.total_entries = stats.total_entries.saturating_sub(evict_count as u64);
        stats.eviction_count += evict_count as u64;
    }

    pub async fn cleanup_expired(&self) {
        let mut cache = self.cache.write().await;
        let mut stats = self.stats.write().await;
        let now = Instant::now();

        let expired_keys: Vec<String> = cache
            .iter()
            .filter_map(|(key, entry)| {
                if let Some(expires_at) = entry.expires_at {
                    if now > expires_at {
                        Some(key.clone())
                    } else {
                        None
                    }
                } else {
                    None
                }
            })
            .collect();

        for key in expired_keys {
            cache.remove(&key);
            stats.total_entries = stats.total_entries.saturating_sub(1);
        }

        Logger::debug(&format!("Cleaned up {} expired cache entries", expired_keys.len()));
    }

    pub async fn get_memory_usage(&self) -> u64 {
        let cache = self.cache.read().await;
        let mut total_size = 0;

        for (key, entry) in cache.iter() {
            // Estimate memory usage
            total_size += key.len() + serde_json::to_string(&entry.data).unwrap_or_default().len();
        }

        total_size as u64
    }
}

impl Default for CacheManager {
    fn default() -> Self {
        Self::new(1000, Duration::from_secs(300)) // 1000 entries, 5 minutes TTL
    }
}

// Specialized cache types
pub struct TransactionCache {
    cache: CacheManager,
}

impl TransactionCache {
    pub fn new() -> Self {
        Self {
            cache: CacheManager::new(500, Duration::from_secs(3600)), // 1 hour TTL for transactions
        }
    }

    pub async fn cache_transaction(&self, tx_hash: &str, transaction_data: serde_json::Value) -> Result<(), Box<dyn std::error::Error>> {
        let key = format!("tx:{}", tx_hash);
        self.cache.set(key, transaction_data, Some(Duration::from_secs(3600))).await
    }

    pub async fn get_transaction(&self, tx_hash: &str) -> Option<serde_json::Value> {
        let key = format!("tx:{}", tx_hash);
        self.cache.get(&key).await
    }

    pub async fn cache_device_info(&self, device_id: &str, device_data: serde_json::Value) -> Result<(), Box<dyn std::error::Error>> {
        let key = format!("device:{}", device_id);
        self.cache.set(key, device_data, Some(Duration::from_secs(1800))).await // 30 minutes TTL
    }

    pub async fn get_device_info(&self, device_id: &str) -> Option<serde_json::Value> {
        let key = format!("device:{}", device_id);
        self.cache.get(&key).await
    }
}

pub struct MetricsCache {
    cache: CacheManager,
}

impl MetricsCache {
    pub fn new() -> Self {
        Self {
            cache: CacheManager::new(100, Duration::from_secs(60)), // 1 minute TTL for metrics
        }
    }

    pub async fn cache_metrics(&self, metric_name: &str, value: serde_json::Value) -> Result<(), Box<dyn std::error::Error>> {
        let key = format!("metrics:{}", metric_name);
        self.cache.set(key, value, Some(Duration::from_secs(60))).await
    }

    pub async fn get_metrics(&self, metric_name: &str) -> Option<serde_json::Value> {
        let key = format!("metrics:{}", metric_name);
        self.cache.get(&key).await
    }
} 