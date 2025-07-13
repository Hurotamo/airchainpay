use std::collections::HashMap;
use std::path::Path;
use std::fs;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc, Duration};
use tokio::sync::RwLock;
use std::sync::Arc;
use crate::logger::Logger;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupConfig {
    pub enabled: bool,
    pub retention_days: HashMap<CleanupType, u32>,
    pub batch_size: usize,
    pub cleanup_interval_hours: u32,
    pub dry_run: bool,
    pub log_cleanup_actions: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum CleanupType {
    Transactions,
    AuditLogs,
    Metrics,
    TempFiles,
    LogFiles,
    Cache,
    Backups,
    DeviceData,
    SessionData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupStats {
    pub total_items_cleaned: u64,
    pub total_size_freed: u64,
    pub items_by_type: HashMap<CleanupType, u64>,
    pub last_cleanup: Option<DateTime<Utc>>,
    pub next_cleanup: Option<DateTime<Utc>>,
    pub errors: Vec<String>,
}

pub struct CleanupManager {
    config: CleanupConfig,
    stats: Arc<RwLock<CleanupStats>>,
    data_dir: String,
}

impl CleanupManager {
    pub fn new(config: CleanupConfig, data_dir: String) -> Self {
        Self {
            config,
            stats: Arc::new(RwLock::new(CleanupStats {
                total_items_cleaned: 0,
                total_size_freed: 0,
                items_by_type: HashMap::new(),
                last_cleanup: None,
                next_cleanup: None,
                errors: Vec::new(),
            })),
            data_dir,
        }
    }

    pub async fn run_cleanup(&self) -> Result<CleanupStats, Box<dyn std::error::Error>> {
        if !self.config.enabled {
            Logger::info("Cleanup is disabled");
            return Ok(self.stats.read().await.clone());
        }

        Logger::info("Starting data cleanup process");

        let mut stats = self.stats.write().await;
        stats.last_cleanup = Some(Utc::now());
        stats.next_cleanup = Some(Utc::now() + Duration::hours(self.config.cleanup_interval_hours as i64));
        stats.errors.clear();

        // Clean up each type of data
        for (cleanup_type, retention_days) in &self.config.retention_days {
            match self.cleanup_data_type(cleanup_type, *retention_days).await {
                Ok(cleaned_count) => {
                    stats.items_by_type.insert(cleanup_type.clone(), cleaned_count);
                    stats.total_items_cleaned += cleaned_count;
                }
                Err(e) => {
                    let error_msg = format!("Failed to cleanup {:?}: {}", cleanup_type, e);
                    Logger::error(&error_msg);
                    stats.errors.push(error_msg);
                }
            }
        }

        // Calculate total size freed
        stats.total_size_freed = self.calculate_freed_size().await?;

        Logger::info(&format!("Cleanup completed: {} items cleaned, {} bytes freed", 
            stats.total_items_cleaned, stats.total_size_freed));

        Ok(stats.clone())
    }

    async fn cleanup_data_type(&self, cleanup_type: &CleanupType, retention_days: u32) -> Result<u64, Box<dyn std::error::Error>> {
        let cutoff_date = Utc::now() - Duration::days(retention_days as i64);
        let cleaned_count = match cleanup_type {
            CleanupType::Transactions => {
                self.cleanup_transactions(cutoff_date).await?
            }
            CleanupType::AuditLogs => {
                self.cleanup_audit_logs(cutoff_date).await?
            }
            CleanupType::Metrics => {
                self.cleanup_metrics(cutoff_date).await?
            }
            CleanupType::TempFiles => {
                self.cleanup_temp_files().await?
            }
            CleanupType::LogFiles => {
                self.cleanup_log_files(cutoff_date).await?
            }
            CleanupType::Cache => {
                self.cleanup_cache(cutoff_date).await?
            }
            CleanupType::Backups => {
                self.cleanup_backups(cutoff_date).await?
            }
            CleanupType::DeviceData => {
                self.cleanup_device_data(cutoff_date).await?
            }
            CleanupType::SessionData => {
                self.cleanup_session_data(cutoff_date).await?
            }
        };

        if self.config.log_cleanup_actions {
            Logger::info(&format!("Cleaned up {} {:?} items", cleaned_count, cleanup_type));
        }

        Ok(cleaned_count)
    }

    async fn cleanup_transactions(&self, cutoff_date: DateTime<Utc>) -> Result<u64, Box<dyn std::error::Error>> {
        let transactions_dir = Path::new(&self.data_dir).join("transactions");
        if !transactions_dir.exists() {
            return Ok(0);
        }

        let mut cleaned_count = 0;
        let entries = fs::read_dir(&transactions_dir)?;

        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            
            if let Ok(metadata) = fs::metadata(&path) {
                if let Ok(created_time) = metadata.created() {
                    let created: DateTime<Utc> = DateTime::from(created_time);
                    if created < cutoff_date {
                        if !self.config.dry_run {
                            fs::remove_file(&path)?;
                        }
                        cleaned_count += 1;
                    }
                }
            }
        }

        Ok(cleaned_count)
    }

    async fn cleanup_audit_logs(&self, cutoff_date: DateTime<Utc>) -> Result<u64, Box<dyn std::error::Error>> {
        let audit_dir = Path::new(&self.data_dir).join("audit");
        if !audit_dir.exists() {
            return Ok(0);
        }

        let mut cleaned_count = 0;
        let entries = fs::read_dir(&audit_dir)?;

        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            
            if let Ok(metadata) = fs::metadata(&path) {
                if let Ok(modified_time) = metadata.modified() {
                    let modified: DateTime<Utc> = DateTime::from(modified_time);
                    if modified < cutoff_date {
                        if !self.config.dry_run {
                            fs::remove_file(&path)?;
                        }
                        cleaned_count += 1;
                    }
                }
            }
        }

        Ok(cleaned_count)
    }

    async fn cleanup_metrics(&self, cutoff_date: DateTime<Utc>) -> Result<u64, Box<dyn std::error::Error>> {
        let metrics_dir = Path::new(&self.data_dir).join("metrics");
        if !metrics_dir.exists() {
            return Ok(0);
        }

        let mut cleaned_count = 0;
        let entries = fs::read_dir(&metrics_dir)?;

        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            
            if let Ok(metadata) = fs::metadata(&path) {
                if let Ok(modified_time) = metadata.modified() {
                    let modified: DateTime<Utc> = DateTime::from(modified_time);
                    if modified < cutoff_date {
                        if !self.config.dry_run {
                            fs::remove_file(&path)?;
                        }
                        cleaned_count += 1;
                    }
                }
            }
        }

        Ok(cleaned_count)
    }

    async fn cleanup_temp_files(&self) -> Result<u64, Box<dyn std::error::Error>> {
        let temp_dir = Path::new(&self.data_dir).join("temp");
        if !temp_dir.exists() {
            return Ok(0);
        }

        let mut cleaned_count = 0;
        let entries = fs::read_dir(&temp_dir)?;

        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            
            // Remove all temp files regardless of age
            if !self.config.dry_run {
                if path.is_file() {
                    fs::remove_file(&path)?;
                } else if path.is_dir() {
                    fs::remove_dir_all(&path)?;
                }
            }
            cleaned_count += 1;
        }

        Ok(cleaned_count)
    }

    async fn cleanup_log_files(&self, cutoff_date: DateTime<Utc>) -> Result<u64, Box<dyn std::error::Error>> {
        let logs_dir = Path::new(&self.data_dir).join("logs");
        if !logs_dir.exists() {
            return Ok(0);
        }

        let mut cleaned_count = 0;
        let entries = fs::read_dir(&logs_dir)?;

        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            
            if let Ok(metadata) = fs::metadata(&path) {
                if let Ok(modified_time) = metadata.modified() {
                    let modified: DateTime<Utc> = DateTime::from(modified_time);
                    if modified < cutoff_date {
                        if !self.config.dry_run {
                            fs::remove_file(&path)?;
                        }
                        cleaned_count += 1;
                    }
                }
            }
        }

        Ok(cleaned_count)
    }

    async fn cleanup_cache(&self, cutoff_date: DateTime<Utc>) -> Result<u64, Box<dyn std::error::Error>> {
        let cache_dir = Path::new(&self.data_dir).join("cache");
        if !cache_dir.exists() {
            return Ok(0);
        }

        let mut cleaned_count = 0;
        let entries = fs::read_dir(&cache_dir)?;

        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            
            if let Ok(metadata) = fs::metadata(&path) {
                if let Ok(accessed_time) = metadata.accessed() {
                    let accessed: DateTime<Utc> = DateTime::from(accessed_time);
                    if accessed < cutoff_date {
                        if !self.config.dry_run {
                            fs::remove_file(&path)?;
                        }
                        cleaned_count += 1;
                    }
                }
            }
        }

        Ok(cleaned_count)
    }

    async fn cleanup_backups(&self, cutoff_date: DateTime<Utc>) -> Result<u64, Box<dyn std::error::Error>> {
        let backups_dir = Path::new(&self.data_dir).join("backups");
        if !backups_dir.exists() {
            return Ok(0);
        }

        let mut cleaned_count = 0;
        let entries = fs::read_dir(&backups_dir)?;

        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            
            if let Ok(metadata) = fs::metadata(&path) {
                if let Ok(created_time) = metadata.created() {
                    let created: DateTime<Utc> = DateTime::from(created_time);
                    if created < cutoff_date {
                        if !self.config.dry_run {
                            fs::remove_file(&path)?;
                        }
                        cleaned_count += 1;
                    }
                }
            }
        }

        Ok(cleaned_count)
    }

    async fn cleanup_device_data(&self, cutoff_date: DateTime<Utc>) -> Result<u64, Box<dyn std::error::Error>> {
        let devices_dir = Path::new(&self.data_dir).join("devices");
        if !devices_dir.exists() {
            return Ok(0);
        }

        let mut cleaned_count = 0;
        let entries = fs::read_dir(&devices_dir)?;

        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            
            if let Ok(metadata) = fs::metadata(&path) {
                if let Ok(modified_time) = metadata.modified() {
                    let modified: DateTime<Utc> = DateTime::from(modified_time);
                    if modified < cutoff_date {
                        if !self.config.dry_run {
                            fs::remove_file(&path)?;
                        }
                        cleaned_count += 1;
                    }
                }
            }
        }

        Ok(cleaned_count)
    }

    async fn cleanup_session_data(&self, cutoff_date: DateTime<Utc>) -> Result<u64, Box<dyn std::error::Error>> {
        let sessions_dir = Path::new(&self.data_dir).join("sessions");
        if !sessions_dir.exists() {
            return Ok(0);
        }

        let mut cleaned_count = 0;
        let entries = fs::read_dir(&sessions_dir)?;

        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            
            if let Ok(metadata) = fs::metadata(&path) {
                if let Ok(modified_time) = metadata.modified() {
                    let modified: DateTime<Utc> = DateTime::from(modified_time);
                    if modified < cutoff_date {
                        if !self.config.dry_run {
                            fs::remove_file(&path)?;
                        }
                        cleaned_count += 1;
                    }
                }
            }
        }

        Ok(cleaned_count)
    }

    async fn calculate_freed_size(&self) -> Result<u64, Box<dyn std::error::Error>> {
        // This is a simplified calculation
        // In a real implementation, you would track the actual size of deleted files
        let stats = self.stats.read().await;
        Ok(stats.total_items_cleaned * 1024) // Estimate 1KB per item
    }

    pub async fn get_cleanup_stats(&self) -> CleanupStats {
        self.stats.read().await.clone()
    }

    pub async fn set_retention_days(&self, cleanup_type: CleanupType, days: u32) {
        let mut config = self.config.clone();
        config.retention_days.insert(cleanup_type, days);
        // Note: In a real implementation, you'd want to persist this configuration
    }

    pub fn enable(&mut self) {
        self.config.enabled = true;
    }

    pub fn disable(&mut self) {
        self.config.enabled = false;
    }

    pub fn set_dry_run(&mut self, dry_run: bool) {
        self.config.dry_run = dry_run;
    }
}

impl Default for CleanupConfig {
    fn default() -> Self {
        let mut retention_days = HashMap::new();
        retention_days.insert(CleanupType::Transactions, 30);
        retention_days.insert(CleanupType::AuditLogs, 90);
        retention_days.insert(CleanupType::Metrics, 7);
        retention_days.insert(CleanupType::TempFiles, 1);
        retention_days.insert(CleanupType::LogFiles, 30);
        retention_days.insert(CleanupType::Cache, 7);
        retention_days.insert(CleanupType::Backups, 365);
        retention_days.insert(CleanupType::DeviceData, 180);
        retention_days.insert(CleanupType::SessionData, 7);

        Self {
            enabled: true,
            retention_days,
            batch_size: 1000,
            cleanup_interval_hours: 24,
            dry_run: false,
            log_cleanup_actions: true,
        }
    }
} 