use std::path::{Path, PathBuf};
use std::fs;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use tokio::sync::RwLock;
use std::sync::Arc;
// Remove logger import and replace with simple logging
// use crate::logger::Logger;
use tokio::time::{interval, Duration};
use std::process::Command;
use sha2::{Sha256, Digest};
use std::io::Read;
use crate::infrastructure::monitoring::manager::MonitoringManager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupMetadata {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub backup_type: BackupType,
    pub file_size: u64,
    pub checksum: String,
    pub compression: bool,
    pub encryption: bool,
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub server_info: ServerInfo,
    pub files: Vec<String>,
    pub file_count: usize,
    pub total_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerInfo {
    pub uptime: f64,
    pub memory_usage: u64,
    pub pid: u32,
    pub version: String,
    pub hostname: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Eq, PartialEq, Hash)]
pub enum BackupType {
    Full,
    Incremental,
    Transaction,
    Configuration,
    Audit,
    Metrics,
    Auto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupConfig {
    pub backup_dir: String,
    pub max_backups: usize,
    pub compression_enabled: bool,
    pub encryption_enabled: bool,
    pub retention_days: u32,
    pub auto_backup: bool,
    pub backup_schedule: String, // Cron expression
    pub encryption_key: Option<String>,
    pub backup_types: Vec<BackupType>,
    pub verify_integrity: bool,
    pub backup_interval_hours: u64,
}

pub struct BackupManager {
    config: BackupConfig,
    backups: Arc<RwLock<HashMap<String, BackupMetadata>>>,
    data_dir: String,
    monitoring_manager: Option<Arc<MonitoringManager>>,
}

impl BackupManager {
    pub fn new(config: BackupConfig, data_dir: String) -> Self {
        Self {
            config,
            backups: Arc::new(RwLock::new(HashMap::new())),
            data_dir,
            monitoring_manager: None,
        }
    }

    pub fn with_monitoring(mut self, monitoring_manager: Arc<MonitoringManager>) -> Self {
        self.monitoring_manager = Some(monitoring_manager);
        self
    }

    pub fn start_auto_backup(manager: Arc<Self>) {
        if !manager.config.auto_backup {
            return;
        }
        let interval_hours = manager.config.backup_interval_hours;
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(interval_hours * 3600));
            loop {
                interval.tick().await;
                if let Err(e) = manager.create_backup(BackupType::Auto, Some("Automatic backup".to_string())).await {
                    println!("Automatic backup failed: {e}");
                } else {
                    println!("Automatic backup completed successfully");
                }
            }
        });
    }

    pub async fn create_backup(&self, backup_type: BackupType, description: Option<String>) -> Result<String, Box<dyn std::error::Error>> {
        let backup_id = format!("backup_{}_{}", 
            chrono::Utc::now().format("%Y%m%d_%H%M%S"),
            uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("unknown")
        );

        let backup_path = Path::new(&self.config.backup_dir).join(format!("{backup_id}.tar.gz"));
        
        // Create backup directory if it doesn't exist
        if let Some(parent) = backup_path.parent() {
            fs::create_dir_all(parent)?;
        }

        // Record backup start in monitoring
        if let Some(ref monitoring) = self.monitoring_manager {
            monitoring.increment_metric("database_operations").await;
        }

        // Create the backup
        self.create_backup_file(&backup_path, &backup_type).await?;

        // Calculate file size and checksum
        let file_size = fs::metadata(&backup_path)?.len();
        let checksum = self.calculate_checksum(&backup_path).await?;

        // Get server information
        let server_info = self.get_server_info().await;

        // Create metadata
        let metadata = BackupMetadata {
            id: backup_id.clone(),
            timestamp: Utc::now(),
            backup_type: backup_type.clone(),
            file_size,
            checksum,
            compression: self.config.compression_enabled,
            encryption: self.config.encryption_enabled,
            description,
            tags: vec![],
            server_info,
            files: self.get_backup_files(&backup_type).await,
            file_count: self.get_backup_files(&backup_type).await.len(),
            total_size: file_size,
        };

        // Store metadata
        let mut backups = self.backups.write().await;
        backups.insert(backup_id.clone(), metadata.clone());

        // Save metadata to file
        self.save_metadata(&backup_id, &metadata).await?;

        // Verify backup integrity if enabled
        if self.config.verify_integrity
            && !self.verify_backup_integrity(&backup_id).await? {
                return Err("Backup integrity verification failed".into());
            }

        println!("Backup created: {backup_id} ({file_size} bytes)");

        // Record successful backup in monitoring
        if let Some(ref monitoring) = self.monitoring_manager {
            monitoring.increment_metric("database_operations").await;
        }

        Ok(backup_id)
    }

    async fn get_server_info(&self) -> ServerInfo {
        ServerInfo {
            uptime: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as f64,
            memory_usage: 0, // Would need system monitoring
            pid: std::process::id(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            hostname: hostname::get()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
        }
    }

    async fn get_backup_files(&self, backup_type: &BackupType) -> Vec<String> {
        let data_path = Path::new(&self.data_dir);
        let mut files = Vec::new();

        match backup_type {
            BackupType::Full => {
                if let Ok(entries) = fs::read_dir(data_path) {
                    for entry in entries {
                        if let Ok(entry) = entry {
                            if let Some(file_name) = entry.file_name().to_str() {
                                files.push(file_name.to_string());
                            }
                        }
                    }
                }
            }
            BackupType::Transaction => {
                let tx_files = vec!["transactions.json", "transactions.db"];
                for file in tx_files {
                    if data_path.join(file).exists() {
                        files.push(file.to_string());
                    }
                }
            }
            BackupType::Configuration => {
                let config_files = vec!["config.json", "settings.json", "config.toml"];
                for file in config_files {
                    if data_path.join(file).exists() {
                        files.push(file.to_string());
                    }
                }
            }
            BackupType::Audit => {
                let audit_files = vec!["audit.log", "audit.json"];
                for file in audit_files {
                    if data_path.join(file).exists() {
                        files.push(file.to_string());
                    }
                }
            }
            BackupType::Metrics => {
                let metrics_files = vec!["metrics.json", "metrics.db"];
                for file in metrics_files {
                    if data_path.join(file).exists() {
                        files.push(file.to_string());
                    }
                }
            }
            BackupType::Incremental => {
                // For incremental backups, determine what changed since last backup
                files = self.get_incremental_files().await;
            }
            BackupType::Auto => {
                // Auto backup includes all important files
                let auto_files = vec![
                    "transactions.json", "devices.json", "metrics.json",
                    "config.json", "audit.log", "integrity.json"
                ];
                for file in auto_files {
                    if data_path.join(file).exists() {
                        files.push(file.to_string());
                    }
                }
            }
        }

        files
    }

    async fn get_incremental_files(&self) -> Vec<String> {
        // Simplified incremental backup - in production, this would track file modifications
        let data_path = Path::new(&self.data_dir);
        let mut files = Vec::new();

        if let Ok(entries) = fs::read_dir(data_path) {
            for entry in entries {
                if let Ok(entry) = entry {
                    if let Ok(metadata) = entry.metadata() {
                        // Check if file was modified in the last 24 hours
                        if let Ok(modified) = metadata.modified() {
                            if let Ok(now) = std::time::SystemTime::now().duration_since(modified) {
                                if now.as_secs() < 24 * 3600 {
                                    if let Some(file_name) = entry.file_name().to_str() {
                                        files.push(file_name.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        files
    }

    async fn create_backup_file(&self, backup_path: &Path, backup_type: &BackupType) -> Result<(), Box<dyn std::error::Error>> {
        let data_path = Path::new(&self.data_dir);
        
        // Create tar command
        let mut cmd = Command::new("tar");
        cmd.arg("-czf");
        cmd.arg(backup_path);

        // Add files based on backup type
        let files = self.get_backup_files(backup_type).await;
        
        if !files.is_empty() {
            cmd.arg("-C").arg(data_path);
            for file in files {
                cmd.arg(&file);
            }
        } else {
            // Fallback to full backup if no specific files found
            cmd.arg("-C").arg(data_path.parent().unwrap_or(data_path));
            cmd.arg(data_path.file_name().unwrap_or_else(|| std::ffi::OsStr::new("data")));
        }

        let output = cmd.output()?;
        
        if !output.status.success() {
            return Err(format!("Backup creation failed: {}", 
                String::from_utf8_lossy(&output.stderr)).into());
        }

        Ok(())
    }

    async fn calculate_checksum(&self, file_path: &Path) -> Result<String, Box<dyn std::error::Error>> {
        let mut file = fs::File::open(file_path)?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)?;

        let mut hasher = Sha256::new();
        hasher.update(&buffer);
        let result = hasher.finalize();

        Ok(format!("{result:x}"))
    }

    async fn save_metadata(&self, backup_id: &str, metadata: &BackupMetadata) -> Result<(), Box<dyn std::error::Error>> {
        let metadata_path = Path::new(&self.config.backup_dir).join(format!("{backup_id}.meta.json"));
        let json = serde_json::to_string_pretty(metadata)?;
        fs::write(metadata_path, json)?;
        Ok(())
    }

    pub async fn restore_backup(&self, backup_id: &str, restore_path: Option<&str>, options: RestoreOptions) -> Result<RestoreResult, Box<dyn std::error::Error>> {
        let backups = self.backups.read().await;
        
        if let Some(metadata) = backups.get(backup_id) {
            let backup_path = Path::new(&self.config.backup_dir).join(format!("{backup_id}.tar.gz"));
            
            if !backup_path.exists() {
                return Err("Backup file not found".into());
            }

            // Verify checksum if integrity verification is enabled
            if options.verify_integrity {
                let current_checksum = self.calculate_checksum(&backup_path).await?;
                if current_checksum != metadata.checksum {
                    return Err("Backup file checksum verification failed".into());
                }
            }

            // Determine restore path
            let restore_path = restore_path.map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from(&self.data_dir));

            // Create restore directory if it doesn't exist
            fs::create_dir_all(&restore_path)?;

            // Extract backup
            let mut cmd = Command::new("tar");
            cmd.arg("-xzf");
            cmd.arg(&backup_path);
            cmd.arg("-C");
            cmd.arg(&restore_path);

            let output = cmd.output()?;
            
            if !output.status.success() {
                return Err(format!("Backup restoration failed: {}", 
                    String::from_utf8_lossy(&output.stderr)).into());
            }

            // Verify restored files
            let restored_files = self.verify_restored_files(&restore_path, &metadata.files).await;

            println!("Backup restored: {} to {} ({} files)", backup_id, restore_path.display(), restored_files.len());

            // Record restoration in monitoring
            if let Some(ref monitoring) = self.monitoring_manager {
                monitoring.increment_metric("database_operations").await;
            }

            Ok(RestoreResult {
                backup_id: backup_id.to_string(),
                restore_path: restore_path.to_string_lossy().to_string(),
                restored_files,
                timestamp: Utc::now(),
            })
        } else {
            Err("Backup not found".into())
        }
    }

    async fn verify_restored_files(&self, restore_path: &Path, expected_files: &[String]) -> Vec<String> {
        let mut restored_files = Vec::new();
        
        for file in expected_files {
            let file_path = restore_path.join(file);
            if file_path.exists() {
                restored_files.push(file.clone());
            }
        }
        
        restored_files
    }

    pub async fn verify_backup_integrity(&self, backup_id: &str) -> Result<bool, Box<dyn std::error::Error>> {
        let backups = self.backups.read().await;
        
        if let Some(metadata) = backups.get(backup_id) {
            let backup_path = Path::new(&self.config.backup_dir).join(format!("{backup_id}.tar.gz"));
            
            if !backup_path.exists() {
                return Ok(false);
            }

            // Verify checksum
            let current_checksum = self.calculate_checksum(&backup_path).await?;
            let is_valid = current_checksum == metadata.checksum;

            if !is_valid {
                println!("Backup {backup_id} checksum verification failed");
            }

            Ok(is_valid)
        } else {
            Ok(false)
        }
    }

    pub async fn list_backups(&self, filter: Option<BackupFilter>) -> Vec<BackupMetadata> {
        let backups = self.backups.read().await;
        
        if let Some(filter) = filter {
            backups.values()
                .filter(|backup| {
                    // Filter by backup type
                    if let Some(ref backup_types) = filter.backup_types {
                        if !backup_types.contains(&backup.backup_type) {
                            return false;
                        }
                    }

                    // Filter by date range
                    if let Some(start_date) = filter.start_date {
                        if backup.timestamp < start_date {
                            return false;
                        }
                    }

                    if let Some(end_date) = filter.end_date {
                        if backup.timestamp > end_date {
                            return false;
                        }
                    }

                    // Filter by tags
                    if let Some(ref tags) = filter.tags {
                        for tag in tags {
                            if !backup.tags.contains(tag) {
                                return false;
                            }
                        }
                    }

                    true
                })
                .cloned()
                .collect()
        } else {
            backups.values().cloned().collect()
        }
    }

    pub async fn delete_backup(&self, backup_id: &str) -> Result<(), Box<dyn std::error::Error>> {
        let backup_path = Path::new(&self.config.backup_dir).join(format!("{backup_id}.tar.gz"));
        let metadata_path = Path::new(&self.config.backup_dir).join(format!("{backup_id}.meta.json"));

        // Remove files
        if backup_path.exists() {
            fs::remove_file(&backup_path)?;
        }
        
        if metadata_path.exists() {
            fs::remove_file(&metadata_path)?;
        }

        // Remove from metadata
        let mut backups = self.backups.write().await;
        backups.remove(backup_id);

        println!("Backup deleted: {backup_id}");

        Ok(())
    }

    pub async fn cleanup_old_backups(&self) -> Result<usize, Box<dyn std::error::Error>> {
        let retention_date = Utc::now() - chrono::Duration::days(self.config.retention_days as i64);
        let backups = self.backups.read().await;
        
        let old_backups: Vec<String> = backups.values()
            .filter(|backup| backup.timestamp < retention_date)
            .map(|backup| backup.id.clone())
            .collect();

        let mut deleted_count = 0;
        for backup_id in old_backups {
            if let Err(e) = self.delete_backup(&backup_id).await {
                println!("Failed to delete old backup {backup_id}: {e}");
            } else {
                deleted_count += 1;
            }
        }

        println!("Cleaned up {deleted_count} old backups");

        Ok(deleted_count)
    }

    pub async fn get_backup_stats(&self) -> BackupStats {
        let backups = self.backups.read().await;
        
        let total_backups = backups.len();
        let total_size: u64 = backups.values().map(|b| b.file_size).sum();
        
        let mut type_counts = HashMap::new();
        for backup in backups.values() {
            *type_counts.entry(backup.backup_type.clone()).or_insert(0) += 1;
        }

        BackupStats {
            total_backups,
            total_size,
            type_counts,
            oldest_backup: backups.values().map(|b| b.timestamp).min(),
            newest_backup: backups.values().map(|b| b.timestamp).max(),
        }
    }

    pub async fn get_backup_metadata(&self, backup_id: &str) -> Result<Option<BackupMetadata>, Box<dyn std::error::Error>> {
        let backups = self.backups.read().await;
        
        if let Some(metadata) = backups.get(backup_id) {
            Ok(Some(metadata.clone()))
        } else {
            Ok(None)
        }
    }

    #[allow(dead_code)]
    pub async fn encrypt_backup(&self, backup_path: &Path) -> Result<(), Box<dyn std::error::Error>> {
        // Implementation for encrypting backup files
        println!("Encrypting backup: {backup_path:?}");
        Ok(())
    }

    #[allow(dead_code)]
    pub async fn decrypt_backup(&self, backup_path: &Path) -> Result<PathBuf, Box<dyn std::error::Error>> {
        // Implementation for decrypting backup files
        println!("Decrypting backup: {backup_path:?}");
        Ok(backup_path.to_path_buf())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreOptions {
    pub verify_integrity: bool,
    pub restore_type: Option<BackupType>,
    pub overwrite_existing: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreResult {
    pub backup_id: String,
    pub restore_path: String,
    pub restored_files: Vec<String>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupFilter {
    pub backup_types: Option<Vec<BackupType>>,
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<DateTime<Utc>>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupStats {
    pub total_backups: usize,
    pub total_size: u64,
    pub type_counts: HashMap<BackupType, usize>,
    pub oldest_backup: Option<DateTime<Utc>>,
    pub newest_backup: Option<DateTime<Utc>>,
}

impl Default for BackupConfig {
    fn default() -> Self {
        Self {
            backup_dir: "backups".to_string(),
            max_backups: 100,
            compression_enabled: true,
            encryption_enabled: false,
            retention_days: 30,
            auto_backup: true,
            backup_schedule: "0 2 * * *".to_string(), // Daily at 2 AM
            encryption_key: None,
            backup_types: vec![BackupType::Full, BackupType::Transaction, BackupType::Audit, BackupType::Metrics],
            verify_integrity: true,
            backup_interval_hours: 24,
        }
    }
}

impl Default for RestoreOptions {
    fn default() -> Self {
        Self {
            verify_integrity: true,
            restore_type: None,
            overwrite_existing: false,
        }
    }
} 