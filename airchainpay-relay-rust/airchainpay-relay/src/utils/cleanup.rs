use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
// Remove logger import and replace with simple logging
// use crate::logger::Logger;

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

impl Default for CleanupConfig {
    fn default() -> Self {
        Self::new()
    }
}

impl CleanupConfig {
    pub fn new() -> Self {
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