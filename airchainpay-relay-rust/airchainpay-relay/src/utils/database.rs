use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
// Remove logger import and replace with simple logging
// use crate::logger::Logger;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseHealth {
    pub is_healthy: bool,
    pub connection_count: u32,
    pub last_backup_time: Option<DateTime<Utc>>,
    pub backup_size_bytes: u64,
    pub error_count: u32,
    pub slow_queries: u32,
    pub total_transactions: u32,
    pub total_devices: u32,
    pub data_integrity_ok: bool,
    pub last_maintenance: Option<DateTime<Utc>>,
    pub disk_usage_percent: f64,
    pub memory_usage_bytes: u64,
    pub uptime_seconds: f64,
} 