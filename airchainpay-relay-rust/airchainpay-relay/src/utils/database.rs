use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::io::Write;
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use chrono::{DateTime, Utc};
// Remove logger import and replace with simple logging
// use crate::logger::Logger;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub id: String,
    pub signed_transaction: String,
    pub chain_id: u64,
    pub device_id: Option<String>,
    pub timestamp: DateTime<Utc>,
    pub status: String,
    pub hash: Option<String>,
    pub security: SecurityMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Device {
    pub id: String,
    pub public_key: Option<String>,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub last_seen: DateTime<Utc>,
    pub security: SecurityMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityMetadata {
    pub hash: String,
    pub created_at: DateTime<Utc>,
    pub server_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Metrics {
    pub transactions_received: u64,
    pub transactions_processed: u64,
    pub transactions_failed: u64,
    pub transactions_broadcasted: u64,
    pub ble_connections: u64,
    pub ble_disconnections: u64,
    pub ble_authentications: u64,
    pub ble_key_exchanges: u64,
    pub rpc_errors: u64,
    pub gas_price_updates: u64,
    pub contract_events: u64,
    pub auth_failures: u64,
    pub rate_limit_hits: u64,
    pub blocked_devices: u64,
    pub uptime: f64,
    pub memory_usage: u64,
    pub cpu_usage: f64,
    pub last_updated: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLog {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub operation: String,
    pub resource: String,
    pub details: HashMap<String, serde_json::Value>,
    pub user: String,
    pub ip_address: Option<String>,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityIncident {
    pub id: String,
    pub incident_type: String,
    pub severity: String,
    pub details: HashMap<String, serde_json::Value>,
    pub timestamp: DateTime<Utc>,
    pub resolved: bool,
}

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

pub struct Database {
    data_dir: String,
    transactions_file: String,
    devices_file: String,
    metrics_file: String,
    audit_file: String,
    integrity_file: String,
    incidents_file: String,
}

impl Database {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let data_dir = std::env::var("DATA_DIR").unwrap_or_else(|_| "./data".to_string());
        let db = Self {
            transactions_file: format!("{}/transactions.json", data_dir),
            devices_file: format!("{}/devices.json", data_dir),
            metrics_file: format!("{}/metrics.json", data_dir),
            audit_file: format!("{}/audit.log", data_dir),
            integrity_file: format!("{}/integrity.json", data_dir),
            incidents_file: format!("{}/incidents.json", data_dir),
            data_dir,
        };
        
        db.initialize()?;
        Ok(db)
    }

    fn initialize(&self) -> Result<(), Box<dyn std::error::Error>> {
        // Create data directory if it doesn't exist
        fs::create_dir_all(&self.data_dir)?;

        // Initialize files if they don't exist
        self.initialize_file(&self.transactions_file, Vec::<Transaction>::new())?;
        self.initialize_file(&self.devices_file, HashMap::<String, Device>::new())?;
        self.initialize_file(&self.metrics_file, Metrics::default())?;
        self.initialize_file(&self.integrity_file, HashMap::<String, IntegrityHash>::new())?;
        self.initialize_file(&self.incidents_file, Vec::<SecurityIncident>::new())?;

        // Verify data integrity on startup
        self.verify_data_integrity()?;
        
        Ok(())
    }

    fn initialize_file<T: Serialize>(&self, file_path: &str, default_value: T) -> Result<(), Box<dyn std::error::Error>> {
        if !Path::new(file_path).exists() {
            let json_data = serde_json::to_string_pretty(&default_value)?;
            fs::write(file_path, json_data)?;
            self.update_integrity_hash(file_path)?;
        }
        Ok(())
    }

    fn calculate_hash<T: Serialize>(&self, data: &T) -> String {
        let json_str = serde_json::to_string(data).unwrap_or_default();
        let mut hasher = Sha256::new();
        hasher.update(json_str.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    fn update_integrity_hash(&self, file_path: &str) -> Result<(), Box<dyn std::error::Error>> {
        let data = self.read_file_raw(file_path)?;
        let hash = self.calculate_hash(&data);
        
        let mut integrity: HashMap<String, IntegrityHash> = self.read_file(&self.integrity_file)
            .unwrap_or_default();
        
        integrity.insert(
            Path::new(file_path).file_name().unwrap().to_str().unwrap().to_string(),
            IntegrityHash {
                hash,
                last_modified: Utc::now(),
                size: serde_json::to_string(&data).unwrap_or_default().len(),
            },
        );
        
        self.write_file(&self.integrity_file, &integrity)?;
        Ok(())
    }

    fn verify_data_integrity(&self) -> Result<(), Box<dyn std::error::Error>> {
        let integrity: HashMap<String, IntegrityHash> = self.read_file(&self.integrity_file)
            .unwrap_or_default();
        
        let files = [
            &self.transactions_file,
            &self.devices_file,
            &self.metrics_file,
        ];
        
        for file_path in files.iter() {
            let file_name = Path::new(file_path).file_name().unwrap().to_str().unwrap();
            let stored_hash = integrity.get(file_name);
            
            if let Some(stored_hash) = stored_hash {
                let data = self.read_file_raw(file_path)?;
                let current_hash = self.calculate_hash(&data);
                
                if current_hash != stored_hash.hash {
                    println!("🚨 DATA INTEGRITY VIOLATION DETECTED: {}", file_name);
                    println!("Expected hash: {}", stored_hash.hash);
                    println!("Current hash: {}", current_hash);
                    
                    // Log security incident
                    self.log_security_incident("DATA_INTEGRITY_VIOLATION", &serde_json::json!({
                        "file": file_name,
                        "expected_hash": stored_hash.hash,
                        "current_hash": current_hash,
                        "timestamp": Utc::now().to_rfc3339(),
                    }))?;
                } else {
                    println!("✅ Data integrity verified for {}", file_name);
                }
            }
        }
        
        Ok(())
    }

    pub fn log_security_incident(&self, incident_type: &str, details: &serde_json::Value) -> Result<(), Box<dyn std::error::Error>> {
        let incident = SecurityIncident {
            id: self.generate_id(),
            incident_type: incident_type.to_string(),
            severity: "HIGH".to_string(),
            details: serde_json::from_value(details.clone()).unwrap_or_default(),
            timestamp: Utc::now(),
            resolved: false,
        };
        
        let mut incidents: Vec<SecurityIncident> = self.read_file(&self.incidents_file)
            .unwrap_or_default();
        incidents.push(incident);
        
        self.write_file(&self.incidents_file, &incidents)?;
        
        println!("🚨 SECURITY INCIDENT: {}", incident_type);
        Ok(())
    }

    pub fn log_data_access(&self, operation: &str, file: &str, details: Option<HashMap<String, serde_json::Value>>) -> Result<(), Box<dyn std::error::Error>> {
        let audit_entry = AuditLog {
            id: self.generate_id(),
            timestamp: Utc::now(),
            operation: operation.to_string(),
            resource: file.to_string(),
            details: details.unwrap_or_default(),
            user: std::env::var("USER").unwrap_or_else(|_| "system".to_string()),
            ip_address: None,
            success: true,
        };
        
        let audit_line = serde_json::to_string(&audit_entry)? + "\n";
        fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.audit_file)?
            .write_all(audit_line.as_bytes())?;
        
        Ok(())
    }

    fn read_file_raw(&self, file_path: &str) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
        let data = fs::read_to_string(file_path)?;
        let parsed: serde_json::Value = serde_json::from_str(&data)?;
        
        // Log read access
        self.log_data_access("READ", Path::new(file_path).file_name().unwrap().to_str().unwrap(), None)?;
        
        Ok(parsed)
    }

    fn read_file<T: for<'de> Deserialize<'de>>(&self, file_path: &str) -> Result<T, Box<dyn std::error::Error>> {
        let data = fs::read_to_string(file_path)?;
        let parsed: T = serde_json::from_str(&data)?;
        
        // Log read access
        self.log_data_access("READ", Path::new(file_path).file_name().unwrap().to_str().unwrap(), None)?;
        
        Ok(parsed)
    }

    fn write_file<T: Serialize>(&self, file_path: &str, data: &T) -> Result<(), Box<dyn std::error::Error>> {
        // Verify integrity before writing
        self.verify_data_integrity()?;
        
        let json_data = serde_json::to_string_pretty(data)?;
        let data_size = json_data.len();
        fs::write(file_path, &json_data)?;
        
        // Update integrity hash after writing
        self.update_integrity_hash(file_path)?;
        
        // Log write access
        let details = Some({
            let mut map = HashMap::new();
            map.insert("data_size".to_string(), serde_json::Value::Number(serde_json::Number::from(data_size as u64)));
            map
        });
        
        self.log_data_access("WRITE", Path::new(file_path).file_name().unwrap().to_str().unwrap(), details)?;
        
        Ok(())
    }

    pub fn save_transaction(&self, mut transaction: Transaction) -> Result<(), Box<dyn std::error::Error>> {
        // Validate transaction data
        if !self.validate_transaction_data(&transaction) {
            self.log_security_incident("INVALID_TRANSACTION_DATA", &serde_json::to_value(&transaction)?)?;
            return Err("Invalid transaction data".into());
        }
        
        if transaction.id.is_empty() {
            transaction.id = self.generate_id();
        }
        transaction.timestamp = Utc::now();
        
        // Add security metadata
        transaction.security = SecurityMetadata {
            hash: self.calculate_hash(&transaction),
            created_at: Utc::now(),
            server_id: std::env::var("SERVER_ID").unwrap_or_else(|_| "unknown".to_string()),
        };
        
        let mut transactions: Vec<Transaction> = self.read_file(&self.transactions_file)
            .unwrap_or_default();
        transactions.push(transaction);
        
        // Keep only last 1000 transactions
        if transactions.len() > 1000 {
            transactions.drain(0..transactions.len() - 1000);
        }
        
        self.write_file(&self.transactions_file, &transactions)?;
        Ok(())
    }

    fn validate_transaction_data(&self, transaction: &Transaction) -> bool {
        // Validate signed transaction
        if transaction.signed_transaction.is_empty() {
            return false;
        }
        
        // Validate chain ID
        if transaction.chain_id == 0 {
            return false;
        }
        
        // Validate device ID if present
        if let Some(device_id) = &transaction.device_id {
            if device_id.is_empty() || device_id.len() > 100 {
                return false;
            }
        }
        
        true
    }

    pub fn get_transactions(&self, limit: usize, offset: usize) -> Vec<Transaction> {
        let transactions: Vec<Transaction> = self.read_file(&self.transactions_file)
            .unwrap_or_default();
        
        transactions
            .into_iter()
            .skip(offset)
            .take(limit)
            .collect()
    }

    pub fn get_transaction_by_id(&self, id: &str) -> Option<Transaction> {
        let transactions: Vec<Transaction> = self.read_file(&self.transactions_file)
            .unwrap_or_default();
        
        transactions.into_iter().find(|t| t.id == id)
    }

    pub fn get_transactions_by_device(&self, device_id: &str, limit: usize) -> Vec<Transaction> {
        let transactions: Vec<Transaction> = self.read_file(&self.transactions_file)
            .unwrap_or_default();
        
        transactions
            .into_iter()
            .filter(|t| t.device_id.as_ref().map_or(false, |id| id == device_id))
            .take(limit)
            .collect()
    }

    pub fn save_device(&self, mut device: Device) -> Result<(), Box<dyn std::error::Error>> {
        // Validate device data
        if !self.validate_device_data(&device) {
            self.log_security_incident("INVALID_DEVICE_DATA", &serde_json::to_value(&device)?)?;
            return Err("Invalid device data".into());
        }
        
        // Device created_at is already set in the struct
        device.last_seen = Utc::now();
        
        // Add security metadata
        device.security = SecurityMetadata {
            hash: self.calculate_hash(&device),
            created_at: Utc::now(),
            server_id: std::env::var("SERVER_ID").unwrap_or_else(|_| "unknown".to_string()),
        };
        
        let mut devices: HashMap<String, Device> = self.read_file(&self.devices_file)
            .unwrap_or_default();
        devices.insert(device.id.clone(), device);
        
        self.write_file(&self.devices_file, &devices)?;
        Ok(())
    }

    fn validate_device_data(&self, device: &Device) -> bool {
        // Validate device ID
        if device.id.is_empty() || device.id.len() > 100 {
            return false;
        }
        
        // Validate status
        let valid_statuses = ["authenticated", "blocked", "pending", "active"];
        if !valid_statuses.contains(&device.status.as_str()) {
            return false;
        }
        
        true
    }

    pub fn get_device(&self, device_id: &str) -> Option<Device> {
        let devices: HashMap<String, Device> = self.read_file(&self.devices_file)
            .unwrap_or_default();
        
        devices.get(device_id).cloned()
    }

    pub fn get_all_devices(&self) -> Vec<Device> {
        let devices: HashMap<String, Device> = self.read_file(&self.devices_file)
            .unwrap_or_default();
        
        devices.into_values().collect()
    }

    pub fn update_device_status(&self, device_id: &str, status: &str) -> Result<(), Box<dyn std::error::Error>> {
        let mut devices: HashMap<String, Device> = self.read_file(&self.devices_file)
            .unwrap_or_default();
        
        if let Some(device) = devices.get_mut(device_id) {
            device.status = status.to_string();
            device.last_seen = Utc::now();
            device.security.hash = self.calculate_hash(device);
            device.security.created_at = Utc::now();
            
            self.write_file(&self.devices_file, &devices)?;
        }
        
        Ok(())
    }

    pub fn save_metrics(&self, metrics: Metrics) -> Result<(), Box<dyn std::error::Error>> {
        // Validate metrics data
        if !self.validate_metrics_data(&metrics) {
            self.log_security_incident("INVALID_METRICS_DATA", &serde_json::to_value(&metrics)?)?;
            return Err("Invalid metrics data".into());
        }
        
        self.write_file(&self.metrics_file, &metrics)?;
        Ok(())
    }

    fn validate_metrics_data(&self, metrics: &Metrics) -> bool {
        // Basic validation - all metrics should be reasonable
        metrics.transactions_received <= 1_000_000 &&
        metrics.transactions_processed <= 1_000_000 &&
        metrics.transactions_failed <= 1_000_000 &&
        metrics.transactions_broadcasted <= 1_000_000
    }

    pub fn get_metrics(&self) -> Metrics {
        self.read_file(&self.metrics_file).unwrap_or_default()
    }

    pub fn update_metrics(&self, metric_name: &str, increment: u64) -> Result<(), Box<dyn std::error::Error>> {
        let mut metrics: Metrics = self.read_file(&self.metrics_file)
            .unwrap_or_default();
        
        match metric_name {
            "transactions_received" => metrics.transactions_received += increment,
            "transactions_processed" => metrics.transactions_processed += increment,
            "transactions_failed" => metrics.transactions_failed += increment,
            "transactions_broadcasted" => metrics.transactions_broadcasted += increment,
            "ble_connections" => metrics.ble_connections += increment,
            "ble_disconnections" => metrics.ble_disconnections += increment,
            "ble_authentications" => metrics.ble_authentications += increment,
            "ble_key_exchanges" => metrics.ble_key_exchanges += increment,
            "rpc_errors" => metrics.rpc_errors += increment,
            "gas_price_updates" => metrics.gas_price_updates += increment,
            "contract_events" => metrics.contract_events += increment,
            "auth_failures" => metrics.auth_failures += increment,
            "rate_limit_hits" => metrics.rate_limit_hits += increment,
            "blocked_devices" => metrics.blocked_devices += increment,
            _ => return Err("Unknown metric".into()),
        }
        
        metrics.last_updated = Utc::now();
        self.write_file(&self.metrics_file, &metrics)?;
        Ok(())
    }

    pub fn generate_id(&self) -> String {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        let bytes: [u8; 16] = rng.random();
        hex::encode(bytes)
    }

    pub fn create_backup(&self) -> Result<String, Box<dyn std::error::Error>> {
        let backup_dir = format!("{}/backups", self.data_dir);
        fs::create_dir_all(&backup_dir)?;
        
        let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
        let backup_path = format!("{}/backup_{}.tar.gz", backup_dir, timestamp);
        
        // Create tar.gz backup
        let tar_gz = fs::File::create(&backup_path)?;
        let enc = flate2::write::GzEncoder::new(tar_gz, flate2::Compression::default());
        let mut tar = tar::Builder::new(enc);
        
        // Add all data files to the backup
        let files = [
            &self.transactions_file,
            &self.devices_file,
            &self.metrics_file,
            &self.audit_file,
            &self.integrity_file,
            &self.incidents_file,
        ];
        
        for file_path in files.iter() {
            if Path::new(file_path).exists() {
                let file_name = Path::new(file_path).file_name().unwrap().to_str().unwrap();
                tar.append_path_with_name(file_path, file_name)?;
            }
        }
        
        tar.finish()?;
        
        println!("Backup created: {}", backup_path);
        Ok(backup_path)
    }

    pub fn cleanup(&self) -> Result<(), Box<dyn std::error::Error>> {
        // Clean up old transactions (keep only last 1000)
        let mut transactions: Vec<Transaction> = self.read_file(&self.transactions_file)
            .unwrap_or_default();
        
        if transactions.len() > 1000 {
            transactions.drain(0..transactions.len() - 1000);
            self.write_file(&self.transactions_file, &transactions)?;
        }
        
        // Clean up old audit logs (keep only last 10000 entries)
        let audit_logs = self.get_recent_audit_logs(10000);
        if audit_logs.len() > 10000 {
            // This would require rewriting the audit file
            println!("Audit log cleanup not implemented");
        }
        
        // Clean up old security incidents (keep only last 1000)
        let mut incidents: Vec<SecurityIncident> = self.read_file(&self.incidents_file)
            .unwrap_or_default();
        
        if incidents.len() > 1000 {
            incidents.drain(0..incidents.len() - 1000);
            self.write_file(&self.incidents_file, &incidents)?;
        }
        
        println!("Database cleanup completed");
        Ok(())
    }

    pub fn get_security_status(&self) -> HashMap<String, serde_json::Value> {
        let mut status = HashMap::new();
        
        // Check data integrity
        let integrity_check = self.verify_data_integrity().is_ok();
        status.insert("data_integrity".to_string(), serde_json::Value::Bool(integrity_check));
        
        // Get recent security incidents
        let incidents: Vec<SecurityIncident> = self.read_file(&self.incidents_file)
            .unwrap_or_default();
        let recent_incidents = incidents
            .into_iter()
            .filter(|i| i.timestamp > Utc::now() - chrono::Duration::hours(24))
            .count();
        status.insert("recent_incidents".to_string(), serde_json::Value::Number(serde_json::Number::from(recent_incidents as u64)));
        
        // Get file sizes
        let files = [
            &self.transactions_file,
            &self.devices_file,
            &self.metrics_file,
            &self.audit_file,
        ];
        
        for file_path in files.iter() {
            if let Ok(metadata) = fs::metadata(file_path) {
                status.insert(
                    format!("{}_size", Path::new(file_path).file_name().unwrap().to_str().unwrap()),
                    serde_json::Value::Number(serde_json::Number::from(metadata.len())),
                );
            }
        }
        
        status
    }

    pub fn get_recent_audit_logs(&self, limit: usize) -> Vec<AuditLog> {
        // Read audit log file line by line
        let audit_content = fs::read_to_string(&self.audit_file).unwrap_or_default();
        let lines: Vec<&str> = audit_content.lines().collect();
        
        lines
            .into_iter()
            .rev()
            .take(limit)
            .filter_map(|line| serde_json::from_str::<AuditLog>(line).ok())
            .collect()
    }

    pub async fn check_health(&self) -> DatabaseHealth {
        let start_time = std::time::Instant::now();
        
        // Check data integrity
        let data_integrity_ok = self.verify_data_integrity().is_ok();
        
        // Get file sizes and check disk usage
        let mut total_size = 0u64;
        let files = [
            &self.transactions_file,
            &self.devices_file,
            &self.metrics_file,
            &self.audit_file,
        ];
        
        for file_path in files.iter() {
            if let Ok(metadata) = fs::metadata(file_path) {
                total_size += metadata.len();
            }
        }
        
        // Get transaction and device counts
        let transactions = self.get_transactions(10000, 0);
        let devices = self.get_all_devices();
        
        // Check for recent errors (simplified)
        let error_count = 0u32; // In real implementation, track actual errors
        
        // Get backup information
        let backup_dir = Path::new("data/backups");
        let last_backup = if backup_dir.exists() {
            fs::read_dir(backup_dir)
                .ok()
                .and_then(|entries| {
                    entries
                        .filter_map(|entry| entry.ok())
                        .filter(|entry| entry.path().extension().map_or(false, |ext| ext == "json"))
                        .max_by_key(|entry| entry.metadata().unwrap().modified().unwrap())
                })
                .and_then(|entry| {
                    entry.metadata().ok().and_then(|metadata| {
                        metadata.modified().ok().map(|modified| {
                            DateTime::from_timestamp(modified.duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64, 0)
                                .unwrap_or_else(|| Utc::now())
                        })
                    })
                })
        } else {
            None
        };
        
        let backup_size = if let Some(backup_time) = last_backup {
            // Calculate backup size (simplified)
            total_size
        } else {
            0
        };
        
        // Calculate disk usage (simplified)
        let disk_usage_percent = 0.0; // In real implementation, check actual disk usage
        
        // Calculate memory usage (simplified)
        let memory_usage_bytes = total_size;
        
        // Calculate uptime
        let uptime_seconds = start_time.elapsed().as_secs_f64();
        
        DatabaseHealth {
            is_healthy: data_integrity_ok && error_count == 0,
            connection_count: 1, // Single file-based storage
            last_backup_time: last_backup,
            backup_size_bytes: backup_size,
            error_count,
            slow_queries: 0, // Not applicable for file-based storage
            total_transactions: transactions.len() as u32,
            total_devices: devices.len() as u32,
            data_integrity_ok,
            last_maintenance: Some(Utc::now()), // Mock maintenance time
            disk_usage_percent,
            memory_usage_bytes,
            uptime_seconds,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct IntegrityHash {
    hash: String,
    last_modified: DateTime<Utc>,
    size: usize,
}

impl Default for Metrics {
    fn default() -> Self {
        Self {
            transactions_received: 0,
            transactions_processed: 0,
            transactions_failed: 0,
            transactions_broadcasted: 0,
            ble_connections: 0,
            ble_disconnections: 0,
            ble_authentications: 0,
            ble_key_exchanges: 0,
            rpc_errors: 0,
            gas_price_updates: 0,
            contract_events: 0,
            auth_failures: 0,
            rate_limit_hits: 0,
            blocked_devices: 0,
            uptime: 0.0,
            memory_usage: 0,
            cpu_usage: 0.0,
            last_updated: Utc::now(),
        }
    }
}

impl Transaction {
    pub fn new(signed_transaction: String, chain_id: u64, device_id: Option<String>) -> Self {
        Self {
            id: String::new(),
            signed_transaction,
            chain_id,
            device_id,
            timestamp: Utc::now(),
            status: "pending".to_string(),
            hash: None,
            security: SecurityMetadata {
                hash: String::new(),
                created_at: Utc::now(),
                server_id: String::new(),
            },
        }
    }
}

impl Device {
    pub fn new(id: String) -> Self {
        Self {
            id,
            public_key: None,
            status: "pending".to_string(),
            created_at: Utc::now(),
            last_seen: Utc::now(),
            security: SecurityMetadata {
                hash: String::new(),
                created_at: Utc::now(),
                server_id: String::new(),
            },
        }
    }
} 