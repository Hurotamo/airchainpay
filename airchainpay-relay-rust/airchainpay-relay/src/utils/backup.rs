use std::path::{Path, PathBuf};
use std::fs;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use tokio::sync::RwLock;
use std::sync::Arc;
use crate::logger::Logger;

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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BackupType {
    Full,
    Incremental,
    Transaction,
    Configuration,
    Audit,
    Metrics,
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
}

pub struct BackupManager {
    config: BackupConfig,
    backups: Arc<RwLock<HashMap<String, BackupMetadata>>>,
    data_dir: String,
}

impl BackupManager {
    pub fn new(config: BackupConfig, data_dir: String) -> Self {
        Self {
            config,
            backups: Arc::new(RwLock::new(HashMap::new())),
            data_dir,
        }
    }

    pub async fn create_backup(&self, backup_type: BackupType, description: Option<String>) -> Result<String, Box<dyn std::error::Error>> {
        let backup_id = format!("backup_{}_{}", 
            chrono::Utc::now().format("%Y%m%d_%H%M%S"),
            uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("unknown")
        );

        let backup_path = Path::new(&self.config.backup_dir).join(format!("{}.tar.gz", backup_id));
        
        // Create backup directory if it doesn't exist
        if let Some(parent) = backup_path.parent() {
            fs::create_dir_all(parent)?;
        }

        // Create the backup
        self.create_backup_file(&backup_path, &backup_type).await?;

        // Calculate file size and checksum
        let file_size = fs::metadata(&backup_path)?.len();
        let checksum = self.calculate_checksum(&backup_path).await?;

        // Create metadata
        let metadata = BackupMetadata {
            id: backup_id.clone(),
            timestamp: Utc::now(),
            backup_type,
            file_size,
            checksum,
            compression: self.config.compression_enabled,
            encryption: self.config.encryption_enabled,
            description,
            tags: vec![],
        };

        // Store metadata
        let mut backups = self.backups.write().await;
        backups.insert(backup_id.clone(), metadata);

        // Save metadata to file
        self.save_metadata(&backup_id, &metadata).await?;

        Logger::info(&format!("Backup created: {} ({} bytes)", backup_id, file_size));

        Ok(backup_id)
    }

    async fn create_backup_file(&self, backup_path: &Path, backup_type: &BackupType) -> Result<(), Box<dyn std::error::Error>> {
        use std::process::Command;

        let data_path = Path::new(&self.data_dir);
        
        // Create tar command
        let mut cmd = Command::new("tar");
        cmd.arg("-czf");
        cmd.arg(backup_path);

        // Add files based on backup type
        match backup_type {
            BackupType::Full => {
                cmd.arg("-C").arg(data_path.parent().unwrap_or(data_path));
                cmd.arg(data_path.file_name().unwrap_or_else(|| std::ffi::OsStr::new("data")));
            }
            BackupType::Transaction => {
                let tx_dir = data_path.join("transactions");
                if tx_dir.exists() {
                    cmd.arg("-C").arg(data_path);
                    cmd.arg("transactions");
                }
            }
            BackupType::Configuration => {
                let config_files = vec!["config.json", "settings.json"];
                for file in config_files {
                    let config_path = data_path.join(file);
                    if config_path.exists() {
                        cmd.arg("-C").arg(data_path);
                        cmd.arg(file);
                    }
                }
            }
            BackupType::Audit => {
                let audit_dir = data_path.join("audit");
                if audit_dir.exists() {
                    cmd.arg("-C").arg(data_path);
                    cmd.arg("audit");
                }
            }
            BackupType::Metrics => {
                let metrics_dir = data_path.join("metrics");
                if metrics_dir.exists() {
                    cmd.arg("-C").arg(data_path);
                    cmd.arg("metrics");
                }
            }
            BackupType::Incremental => {
                // For incremental backups, we need to determine what changed
                // This is a simplified implementation
                cmd.arg("-C").arg(data_path.parent().unwrap_or(data_path));
                cmd.arg(data_path.file_name().unwrap_or_else(|| std::ffi::OsStr::new("data")));
            }
        }

        let output = cmd.output()?;
        
        if !output.status.success() {
            return Err(format!("Backup creation failed: {}", 
                String::from_utf8_lossy(&output.stderr)).into());
        }

        Ok(())
    }

    async fn calculate_checksum(&self, file_path: &Path) -> Result<String, Box<dyn std::error::Error>> {
        use sha2::{Sha256, Digest};
        use std::fs::File;
        use std::io::Read;

        let mut file = File::open(file_path)?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)?;

        let mut hasher = Sha256::new();
        hasher.update(&buffer);
        let result = hasher.finalize();

        Ok(format!("{:x}", result))
    }

    async fn save_metadata(&self, backup_id: &str, metadata: &BackupMetadata) -> Result<(), Box<dyn std::error::Error>> {
        let metadata_path = Path::new(&self.config.backup_dir).join(format!("{}.meta.json", backup_id));
        let json = serde_json::to_string_pretty(metadata)?;
        fs::write(metadata_path, json)?;
        Ok(())
    }

    pub async fn restore_backup(&self, backup_id: &str, restore_path: Option<&str>) -> Result<(), Box<dyn std::error::Error>> {
        let backups = self.backups.read().await;
        
        guard let metadata = backups.get(backup_id) else {
            return Err("Backup not found".into());
        };

        let backup_path = Path::new(&self.config.backup_dir).join(format!("{}.tar.gz", backup_id));
        
        if !backup_path.exists() {
            return Err("Backup file not found".into());
        }

        // Verify checksum
        let current_checksum = self.calculate_checksum(&backup_path).await?;
        if current_checksum != metadata.checksum {
            return Err("Backup file checksum verification failed".into());
        }

        // Determine restore path
        let restore_path = restore_path.map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(&self.data_dir));

        // Create restore directory if it doesn't exist
        fs::create_dir_all(&restore_path)?;

        // Extract backup
        use std::process::Command;
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

        Logger::info(&format!("Backup restored: {} to {}", backup_id, restore_path.display()));

        Ok(())
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
        let backup_path = Path::new(&self.config.backup_dir).join(format!("{}.tar.gz", backup_id));
        let metadata_path = Path::new(&self.config.backup_dir).join(format!("{}.meta.json", backup_id));

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

        Logger::info(&format!("Backup deleted: {}", backup_id));

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
                Logger::error(&format!("Failed to delete old backup {}: {}", backup_id, e));
            } else {
                deleted_count += 1;
            }
        }

        Logger::info(&format!("Cleaned up {} old backups", deleted_count));

        Ok(deleted_count)
    }

    pub async fn verify_backup(&self, backup_id: &str) -> Result<bool, Box<dyn std::error::Error>> {
        let backups = self.backups.read().await;
        
        guard let metadata = backups.get(backup_id) else {
            return Ok(false);
        };

        let backup_path = Path::new(&self.config.backup_dir).join(format!("{}.tar.gz", backup_id));
        
        if !backup_path.exists() {
            return Ok(false);
        }

        // Verify checksum
        let current_checksum = self.calculate_checksum(&backup_path).await?;
        let is_valid = current_checksum == metadata.checksum;

        if !is_valid {
            Logger::warn(&format!("Backup {} checksum verification failed", backup_id));
        }

        Ok(is_valid)
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
        }
    }
} 