use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};
// Remove logger import and replace with simple logging
// use crate::logger::Logger;
use std::collections::VecDeque;
use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;
use flate2::write::GzEncoder;
use flate2::Compression;
use std::io::Write;

// Cache entry with enhanced metadata
#[derive(Debug, Clone)]
pub struct CacheEntry<T> {
    pub data: T,
    pub created_at: Instant,
    pub expires_at: Option<Instant>,
    pub access_count: u64,
    pub last_accessed: Instant,
    pub size_bytes: usize,
    pub compressed: bool,
    pub priority: CachePriority,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CachePriority {
    Low = 0,
    Normal = 1,
    High = 2,
    Critical = 3,
}

impl<T> CacheEntry<T> {
    pub fn new(data: T, ttl: Option<Duration>, priority: CachePriority) -> Self {
        let now = Instant::now();
        let size_bytes = std::mem::size_of_val(&data);
        
        Self {
            data,
            created_at: now,
            expires_at: ttl.map(|duration| now + duration),
            access_count: 0,
            last_accessed: now,
            size_bytes,
            compressed: false,
            priority,
            tags: Vec::new(),
        }
    }

    pub fn is_expired(&self) -> bool {
        if let Some(expires_at) = self.expires_at {
            Instant::now() > expires_at
        } else {
            false
        }
    }

    pub fn age(&self) -> Duration {
        Instant::now().duration_since(self.created_at)
    }

    pub fn time_since_last_access(&self) -> Duration {
        Instant::now().duration_since(self.last_accessed)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub total_entries: u64,
    pub hit_count: u64,
    pub miss_count: u64,
    pub eviction_count: u64,
    pub memory_usage_bytes: u64,
    pub compression_ratio: f64,
    pub average_hit_time_ms: f64,
    pub average_miss_time_ms: f64,
    pub cache_hit_ratio: f64,
    pub total_requests: u64,
    pub warm_up_entries: u64,
    pub cold_start_entries: u64,
}

#[derive(Debug, Clone)]
pub struct CacheConfig {
    pub max_size: usize,
    pub default_ttl: Duration,
    pub max_memory_bytes: usize,
    pub enable_compression: bool,
    pub compression_threshold_bytes: usize,
    pub eviction_policy: EvictionPolicy,
    pub enable_warm_up: bool,
    pub warm_up_interval: Duration,
    pub enable_metrics: bool,
    pub cleanup_interval: Duration,
}

#[derive(Debug, Clone)]
pub enum EvictionPolicy {
    LRU,      // Least Recently Used
    LFU,      // Least Frequently Used
    FIFO,     // First In, First Out
    TTL,      // Time To Live
    Priority, // Priority-based
    Size,     // Size-based
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            max_size: 1000,
            default_ttl: Duration::from_secs(300),
            max_memory_bytes: 100 * 1024 * 1024, // 100MB
            enable_compression: true,
            compression_threshold_bytes: 1024, // 1KB
            eviction_policy: EvictionPolicy::LRU,
            enable_warm_up: true,
            warm_up_interval: Duration::from_secs(60),
            enable_metrics: true,
            cleanup_interval: Duration::from_secs(30),
        }
    }
}

pub struct CacheManager {
    cache: Arc<RwLock<HashMap<String, CacheEntry<serde_json::Value>>>>,
    config: CacheConfig,
    stats: Arc<RwLock<CacheStats>>,
    warm_up_data: Arc<RwLock<HashMap<String, serde_json::Value>>>,
    compression_cache: Arc<RwLock<HashMap<String, Vec<u8>>>>,
    access_times: Arc<RwLock<VecDeque<(String, Instant)>>>,
    frequency_map: Arc<RwLock<HashMap<String, u64>>>,
}

impl CacheManager {
    pub fn new(config: CacheConfig) -> Self {
        let stats = CacheStats {
            total_entries: 0,
            hit_count: 0,
            miss_count: 0,
            eviction_count: 0,
            memory_usage_bytes: 0,
            compression_ratio: 0.0,
            average_hit_time_ms: 0.0,
            average_miss_time_ms: 0.0,
            cache_hit_ratio: 0.0,
            total_requests: 0,
            warm_up_entries: 0,
            cold_start_entries: 0,
        };

        let manager = Self {
            cache: Arc::new(RwLock::new(HashMap::new())),
            config,
            stats: Arc::new(RwLock::new(stats)),
            warm_up_data: Arc::new(RwLock::new(HashMap::new())),
            compression_cache: Arc::new(RwLock::new(HashMap::new())),
            access_times: Arc::new(RwLock::new(VecDeque::new())),
            frequency_map: Arc::new(RwLock::new(HashMap::new())),
        };

        // Start background tasks
        manager.start_background_tasks();
        
        manager
    }

    pub async fn get(&self, key: &str) -> Option<serde_json::Value> {
        let start_time = Instant::now();
        let mut cache = self.cache.write().await;
        let mut stats = self.stats.write().await;
        let mut access_times = self.access_times.write().await;
        let mut frequency_map = self.frequency_map.write().await;

        stats.total_requests += 1;

        if let Some(entry) = cache.get_mut(key) {
            // Check if entry has expired
            if entry.is_expired() {
                cache.remove(key);
                stats.total_entries = stats.total_entries.saturating_sub(1);
                stats.miss_count += 1;
                stats.average_miss_time_ms = (stats.average_miss_time_ms + start_time.elapsed().as_millis() as f64) / 2.0;
                return None;
            }

            // Update access statistics
            entry.access_count += 1;
            entry.last_accessed = Instant::now();
            stats.hit_count += 1;
            stats.average_hit_time_ms = (stats.average_hit_time_ms + start_time.elapsed().as_millis() as f64) / 2.0;

            // Update access times for LRU
            access_times.retain(|(k, _)| k != key);
            access_times.push_back((key.to_string(), Instant::now()));

            // Update frequency for LFU
            *frequency_map.entry(key.to_string()).or_insert(0) += 1;

            // Update hit ratio
            stats.cache_hit_ratio = stats.hit_count as f64 / stats.total_requests as f64;

            Some(entry.data.clone())
        } else {
            stats.miss_count += 1;
            stats.average_miss_time_ms = (stats.average_miss_time_ms + start_time.elapsed().as_millis() as f64) / 2.0;
            stats.cache_hit_ratio = stats.hit_count as f64 / stats.total_requests as f64;
            None
        }
    }

    pub async fn set(&self, key: String, value: serde_json::Value, ttl: Option<Duration>, priority: Option<CachePriority>) -> Result<(), Box<dyn std::error::Error>> {
        let mut cache = self.cache.write().await;
        let mut stats = self.stats.write().await;

        // Check if we need to evict entries
        if cache.len() >= self.config.max_size {
            self.evict_entries(&mut cache, &mut stats).await;
        }

        // Check memory usage
        let current_memory = self.get_memory_usage_internal(&cache).await;
        if current_memory > self.config.max_memory_bytes {
            self.evict_entries(&mut cache, &mut stats).await;
        }

        let expires_at = ttl.or(Some(self.config.default_ttl))
            .map(|duration| Instant::now() + duration);

        let priority = priority.unwrap_or(CachePriority::Normal);
        let mut entry = CacheEntry::new(value, ttl, priority);
        
        // Compress if enabled and data is large enough
        if self.config.enable_compression && entry.size_bytes > self.config.compression_threshold_bytes {
            if let Ok(compressed_data) = self.compress_data(&entry.data).await {
                let compressed_size = compressed_data.len();
                let compression_ratio = compressed_size as f64 / entry.size_bytes as f64;
                
                if compression_ratio < 0.9 { // Only compress if it saves at least 10%
                    entry.data = serde_json::Value::String(base64::encode(compressed_data));
                    entry.compressed = true;
                    entry.size_bytes = compressed_size;
                    stats.compression_ratio = (stats.compression_ratio + compression_ratio) / 2.0;
                }
            }
        }

        cache.insert(key.clone(), entry);
        stats.total_entries += 1;

        // Update access times
        let mut access_times = self.access_times.write().await;
        access_times.retain(|(k, _)| k != &key);
        access_times.push_back((key, Instant::now()));

        Ok(())
    }

    pub async fn set_with_tags(&self, key: String, value: serde_json::Value, ttl: Option<Duration>, priority: Option<CachePriority>, tags: Vec<String>) -> Result<(), Box<dyn std::error::Error>> {
        let mut cache = self.cache.write().await;
        let mut stats = self.stats.write().await;

        // Check if we need to evict entries
        if cache.len() >= self.config.max_size {
            self.evict_entries(&mut cache, &mut stats).await;
        }

        let expires_at = ttl.or(Some(self.config.default_ttl))
            .map(|duration| Instant::now() + duration);

        let priority = priority.unwrap_or(CachePriority::Normal);
        let mut entry = CacheEntry::new(value, ttl, priority);
        entry.tags = tags;

        cache.insert(key.clone(), entry);
        stats.total_entries += 1;

        // Update access times
        let mut access_times = self.access_times.write().await;
        access_times.retain(|(k, _)| k != &key);
        access_times.push_back((key, Instant::now()));

        Ok(())
    }

    pub async fn delete(&self, key: &str) -> bool {
        let mut cache = self.cache.write().await;
        let mut stats = self.stats.write().await;
        let mut access_times = self.access_times.write().await;
        let mut frequency_map = self.frequency_map.write().await;

        if cache.remove(key).is_some() {
            stats.total_entries = stats.total_entries.saturating_sub(1);
            access_times.retain(|(k, _)| k != key);
            frequency_map.remove(key);
            true
        } else {
            false
        }
    }

    pub async fn clear(&self) {
        let mut cache = self.cache.write().await;
        let mut stats = self.stats.write().await;
        let mut access_times = self.access_times.write().await;
        let mut frequency_map = self.frequency_map.write().await;

        cache.clear();
        stats.total_entries = 0;
        stats.eviction_count += 1;
        access_times.clear();
        frequency_map.clear();
    }

    pub async fn clear_by_tag(&self, tag: &str) -> usize {
        let mut cache = self.cache.write().await;
        let mut stats = self.stats.write().await;
        let mut access_times = self.access_times.write().await;
        let mut frequency_map = self.frequency_map.write().await;

        let keys_to_remove: Vec<String> = cache
            .iter()
            .filter_map(|(key, entry)| {
                if entry.tags.contains(&tag.to_string()) {
                    Some(key.clone())
                } else {
                    None
                }
            })
            .collect();

        let removed_count = keys_to_remove.len();
        for key in &keys_to_remove {
            cache.remove(key);
            access_times.retain(|(k, _)| k != key);
            frequency_map.remove(key);
        }

        stats.total_entries = stats.total_entries.saturating_sub(removed_count as u64);
        stats.eviction_count += removed_count as u64;

        removed_count
    }

    pub async fn get_stats(&self) -> CacheStats {
        self.stats.read().await.clone()
    }

    pub async fn warm_up(&self, warm_up_data: HashMap<String, serde_json::Value>) -> Result<(), Box<dyn std::error::Error>> {
        if !self.config.enable_warm_up {
            return Ok(());
        }

        let mut warm_up_cache = self.warm_up_data.write().await;
        let mut stats = self.stats.write().await;

        for (key, value) in warm_up_data {
            warm_up_cache.insert(key.clone(), value.clone());
            self.set(key, value, Some(Duration::from_secs(3600)), Some(CachePriority::High)).await?;
        }

        stats.warm_up_entries += warm_up_cache.len() as u64;
        println!("Warmed up cache with {} entries", warm_up_cache.len());

        Ok(())
    }

    pub async fn get_by_tag(&self, tag: &str) -> Vec<(String, serde_json::Value)> {
        let cache = self.cache.read().await;
        
        cache
            .iter()
            .filter_map(|(key, entry)| {
                if entry.tags.contains(&tag.to_string()) && !entry.is_expired() {
                    Some((key.clone(), entry.data.clone()))
                } else {
                    None
                }
            })
            .collect()
    }

    pub async fn exists(&self, key: &str) -> bool {
        let cache = self.cache.read().await;
        
        if let Some(entry) = cache.get(key) {
            !entry.is_expired()
        } else {
            false
        }
    }

    pub async fn touch(&self, key: &str) -> bool {
        let mut cache = self.cache.write().await;
        let mut access_times = self.access_times.write().await;
        let mut frequency_map = self.frequency_map.write().await;

        if let Some(entry) = cache.get_mut(key) {
            if entry.is_expired() {
                return false;
            }

            entry.last_accessed = Instant::now();
            entry.access_count += 1;

            // Update access times for LRU
            access_times.retain(|(k, _)| k != key);
            access_times.push_back((key.to_string(), Instant::now()));

            // Update frequency for LFU
            *frequency_map.entry(key.to_string()).or_insert(0) += 1;

            true
        } else {
            false
        }
    }

    pub async fn get_keys(&self) -> Vec<String> {
        let cache = self.cache.read().await;
        
        cache
            .iter()
            .filter_map(|(key, entry)| {
                if !entry.is_expired() {
                    Some(key.clone())
                } else {
                    None
                }
            })
            .collect()
    }

    pub async fn get_entries_by_priority(&self, priority: CachePriority) -> Vec<(String, serde_json::Value)> {
        let cache = self.cache.read().await;
        
        cache
            .iter()
            .filter_map(|(key, entry)| {
                if entry.priority == priority && !entry.is_expired() {
                    Some((key.clone(), entry.data.clone()))
                } else {
                    None
                }
            })
            .collect()
    }

    async fn evict_entries(&self, cache: &mut HashMap<String, CacheEntry<serde_json::Value>>, stats: &mut CacheStats) {
        let evict_count = (cache.len() / 5).max(1);
        let keys_to_remove: Vec<String> = match self.config.eviction_policy {
            EvictionPolicy::LRU => {
                let mut access_times = self.access_times.write().await;
                let mut entries: Vec<_> = access_times.iter().collect();
                entries.sort_by_key(|(_, time)| *time);
                entries.iter().take(evict_count).map(|(key, _)| key.clone()).collect()
            },
            EvictionPolicy::LFU => {
                let frequency_map = self.frequency_map.read().await;
                let mut entries: Vec<_> = frequency_map.iter().collect();
                entries.sort_by_key(|(_, &count)| count);
                entries.iter().take(evict_count).map(|(key, _)| key.to_string()).collect()
            },
            EvictionPolicy::FIFO => {
                let mut access_times = self.access_times.write().await;
                access_times.iter().take(evict_count).map(|(key, _)| key.to_string()).collect()
            },
            EvictionPolicy::TTL => {
                let mut entries: Vec<_> = cache.iter().collect();
                entries.sort_by_key(|(_, entry)| entry.expires_at.unwrap_or(Instant::now() + Duration::from_secs(86400)));
                entries.iter().take(evict_count).map(|(key, _)| key.to_string()).collect()
            },
            EvictionPolicy::Priority => {
                let mut entries: Vec<_> = cache.iter().collect();
                entries.sort_by_key(|(_, entry)| std::cmp::Reverse(entry.priority.clone() as u8));
                entries.iter().take(evict_count).map(|(key, _)| key.to_string()).collect()
            },
            EvictionPolicy::Size => {
                let mut entries: Vec<_> = cache.iter().collect();
                entries.sort_by_key(|(_, entry)| entry.size_bytes);
                entries.iter().take(evict_count).map(|(key, _)| key.to_string()).collect()
            },
        };

        for key in &keys_to_remove {
            cache.remove(key);
        }

        stats.total_entries = stats.total_entries.saturating_sub(evict_count as u64);
        stats.eviction_count += evict_count as u64;
    }

    pub async fn cleanup_expired(&self) {
        let mut cache = self.cache.write().await;
        let mut stats = self.stats.write().await;
        let mut access_times = self.access_times.write().await;
        let mut frequency_map = self.frequency_map.write().await;

        let expired_keys: Vec<String> = cache
            .iter()
            .filter_map(|(key, entry)| {
                if entry.is_expired() {
                    Some(key.clone())
                } else {
                    None
                }
            })
            .collect();

        let expired_count = expired_keys.len();
        for key in &expired_keys {
            cache.remove(key);
            access_times.retain(|(k, _)| k != key);
            frequency_map.remove(key);
        }

        stats.total_entries = stats.total_entries.saturating_sub(expired_count as u64);
        println!("Cleaned up {} expired cache entries", expired_count);
    }

    async fn compress_data(&self, data: &serde_json::Value) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let json_string = serde_json::to_string(data)?;
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(json_string.as_bytes())?;
        Ok(encoder.finish()?)
    }

    async fn decompress_data(&self, compressed_data: &[u8]) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
        let mut decoder = flate2::read::GzDecoder::new(compressed_data);
        let mut json_string = String::new();
        std::io::Read::read_to_string(&mut decoder, &mut json_string)?;
        Ok(serde_json::from_str(&json_string)?)
    }

    async fn get_memory_usage_internal(&self, cache: &HashMap<String, CacheEntry<serde_json::Value>>) -> usize {
        let mut total_size = 0;

        for (key, entry) in cache.iter() {
            total_size += key.len() + entry.size_bytes;
        }

        total_size
    }

    pub async fn get_memory_usage(&self) -> u64 {
        let cache = self.cache.read().await;
        self.get_memory_usage_internal(&cache).await as u64
    }

    fn start_background_tasks(&self) {
        let cache_manager = Arc::new(self.clone());
        let config = self.config.clone();

        // Cleanup task
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(config.cleanup_interval);
            loop {
                interval.tick().await;
                cache_manager.cleanup_expired().await;
            }
        });

        // Warm-up task
        if config.enable_warm_up {
            let cache_manager = Arc::new(self.clone());
            let warm_up_interval = config.warm_up_interval;
            
            tokio::spawn(async move {
                let mut interval = tokio::time::interval(warm_up_interval);
                loop {
                    interval.tick().await;
                    // Perform warm-up operations here
                    println!("Cache warm-up cycle completed");
                }
            });
        }
    }
}

impl Clone for CacheManager {
    fn clone(&self) -> Self {
        Self {
            cache: Arc::clone(&self.cache),
            config: self.config.clone(),
            stats: Arc::clone(&self.stats),
            warm_up_data: Arc::clone(&self.warm_up_data),
            compression_cache: Arc::clone(&self.compression_cache),
            access_times: Arc::clone(&self.access_times),
            frequency_map: Arc::clone(&self.frequency_map),
        }
    }
}

impl Default for CacheManager {
    fn default() -> Self {
        Self::new(CacheConfig::default())
    }
}

// Specialized cache types with enhanced functionality
pub struct TransactionCache {
    cache: CacheManager,
}

impl TransactionCache {
    pub fn new() -> Self {
        let config = CacheConfig {
            max_size: 500,
            default_ttl: Duration::from_secs(3600), // 1 hour
            max_memory_bytes: 50 * 1024 * 1024, // 50MB
            enable_compression: true,
            compression_threshold_bytes: 512, // 512 bytes
            eviction_policy: EvictionPolicy::LRU,
            enable_warm_up: true,
            warm_up_interval: Duration::from_secs(300), // 5 minutes
            enable_metrics: true,
            cleanup_interval: Duration::from_secs(60), // 1 minute
        };

        Self {
            cache: CacheManager::new(config),
        }
    }

    pub async fn cache_transaction(&self, tx_hash: &str, transaction_data: serde_json::Value) -> Result<(), Box<dyn std::error::Error>> {
        let key = format!("tx:{}", tx_hash);
        self.cache.set_with_tags(
            key,
            transaction_data,
            Some(Duration::from_secs(3600)),
            Some(CachePriority::High),
            vec!["transaction".to_string(), "blockchain".to_string()],
        ).await
    }

    pub async fn get_transaction(&self, tx_hash: &str) -> Option<serde_json::Value> {
        let key = format!("tx:{}", tx_hash);
        self.cache.get(&key).await
    }

    pub async fn cache_device_info(&self, device_id: &str, device_data: serde_json::Value) -> Result<(), Box<dyn std::error::Error>> {
        let key = format!("device:{}", device_id);
        self.cache.set_with_tags(
            key,
            device_data,
            Some(Duration::from_secs(1800)), // 30 minutes
            Some(CachePriority::Normal),
            vec!["device".to_string(), "ble".to_string()],
        ).await
    }

    pub async fn get_device_info(&self, device_id: &str) -> Option<serde_json::Value> {
        let key = format!("device:{}", device_id);
        self.cache.get(&key).await
    }

    pub async fn get_all_transactions(&self) -> Vec<(String, serde_json::Value)> {
        self.cache.get_by_tag("transaction").await
    }

    pub async fn get_all_devices(&self) -> Vec<(String, serde_json::Value)> {
        self.cache.get_by_tag("device").await
    }

    pub async fn clear_transactions(&self) -> usize {
        self.cache.clear_by_tag("transaction").await
    }

    pub async fn clear_devices(&self) -> usize {
        self.cache.clear_by_tag("device").await
    }
}

pub struct MetricsCache {
    cache: CacheManager,
}

impl MetricsCache {
    pub fn new() -> Self {
        let config = CacheConfig {
            max_size: 100,
            default_ttl: Duration::from_secs(60), // 1 minute
            max_memory_bytes: 10 * 1024 * 1024, // 10MB
            enable_compression: true,
            compression_threshold_bytes: 256, // 256 bytes
            eviction_policy: EvictionPolicy::FIFO,
            enable_warm_up: false,
            warm_up_interval: Duration::from_secs(60),
            enable_metrics: true,
            cleanup_interval: Duration::from_secs(30), // 30 seconds
        };

        Self {
            cache: CacheManager::new(config),
        }
    }

    pub async fn cache_metrics(&self, metric_name: &str, value: serde_json::Value) -> Result<(), Box<dyn std::error::Error>> {
        let key = format!("metrics:{}", metric_name);
        self.cache.set_with_tags(
            key,
            value,
            Some(Duration::from_secs(60)),
            Some(CachePriority::Normal),
            vec!["metrics".to_string(), "monitoring".to_string()],
        ).await
    }

    pub async fn get_metrics(&self, metric_name: &str) -> Option<serde_json::Value> {
        let key = format!("metrics:{}", metric_name);
        self.cache.get(&key).await
    }

    pub async fn get_all_metrics(&self) -> Vec<(String, serde_json::Value)> {
        self.cache.get_by_tag("metrics").await
    }

    pub async fn clear_metrics(&self) -> usize {
        self.cache.clear_by_tag("metrics").await
    }
}

// Blockchain-specific cache for providers and contracts
pub struct BlockchainCache {
    cache: CacheManager,
}

impl BlockchainCache {
    pub fn new() -> Self {
        let config = CacheConfig {
            max_size: 50,
            default_ttl: Duration::from_secs(1800), // 30 minutes
            max_memory_bytes: 20 * 1024 * 1024, // 20MB
            enable_compression: false, // Don't compress binary data
            compression_threshold_bytes: 0,
            eviction_policy: EvictionPolicy::LRU,
            enable_warm_up: true,
            warm_up_interval: Duration::from_secs(600), // 10 minutes
            enable_metrics: true,
            cleanup_interval: Duration::from_secs(120), // 2 minutes
        };

        Self {
            cache: CacheManager::new(config),
        }
    }

    pub async fn cache_provider(&self, chain_id: &str, provider_data: serde_json::Value) -> Result<(), Box<dyn std::error::Error>> {
        let key = format!("provider:{}", chain_id);
        self.cache.set_with_tags(
            key,
            provider_data,
            Some(Duration::from_secs(1800)),
            Some(CachePriority::High),
            vec!["provider".to_string(), "blockchain".to_string()],
        ).await
    }

    pub async fn get_provider(&self, chain_id: &str) -> Option<serde_json::Value> {
        let key = format!("provider:{}", chain_id);
        self.cache.get(&key).await
    }

    pub async fn cache_contract(&self, chain_id: &str, contract_data: serde_json::Value) -> Result<(), Box<dyn std::error::Error>> {
        let key = format!("contract:{}", chain_id);
        self.cache.set_with_tags(
            key,
            contract_data,
            Some(Duration::from_secs(1800)),
            Some(CachePriority::High),
            vec!["contract".to_string(), "blockchain".to_string()],
        ).await
    }

    pub async fn get_contract(&self, chain_id: &str) -> Option<serde_json::Value> {
        let key = format!("contract:{}", chain_id);
        self.cache.get(&key).await
    }

    pub async fn clear_blockchain_cache(&self) -> usize {
        self.cache.clear_by_tag("blockchain").await
    }
} 