use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use anyhow::Result;
use sha2::{Sha256, Digest};
use chrono::{DateTime, Utc};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Transaction {
    pub id: String,
    pub signed_tx: String,
    pub chain_id: u64,
    pub device_id: Option<String>,
    pub timestamp: DateTime<Utc>,
    pub status: String,
    pub tx_hash: Option<String>,
    pub security: TransactionSecurity,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TransactionSecurity {
    pub hash: String,
    pub created_at: DateTime<Utc>,
    pub server_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Device {
    pub id: String,
    pub name: Option<String>,
    pub public_key: Option<String>,
    pub status: String,
    pub last_seen: DateTime<Utc>,
    pub auth_attempts: u32,
    pub blocked_until: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Metrics {
    pub transactions_received: u64,
    pub transactions_processed: u64,
    pub transactions_failed: u64,
    pub ble_connections: u64,
    pub auth_failures: u64,
    pub last_updated: DateTime<Utc>,
}

pub struct Storage {
    data_dir: String,
    transactions: Mutex<Vec<Transaction>>,
    devices: Mutex<HashMap<String, Device>>,
    metrics: Mutex<Metrics>,
}

impl Storage {
    pub fn new() -> Result<Self> {
        let data_dir = "data".to_string();
        fs::create_dir_all(&data_dir)?;
        
        let storage = Storage {
            data_dir,
            transactions: Mutex::new(Vec::new()),
            devices: Mutex::new(HashMap::new()),
            metrics: Mutex::new(Metrics {
                transactions_received: 0,
                transactions_processed: 0,
                transactions_failed: 0,
                ble_connections: 0,
                auth_failures: 0,
                last_updated: Utc::now(),
            }),
        };
        
        storage.load_data()?;
        Ok(storage)
    }
    
    fn load_data(&self) -> Result<()> {
        // Load transactions
        let tx_file = format!("{}/transactions.json", self.data_dir);
        if Path::new(&tx_file).exists() {
            let data = fs::read_to_string(&tx_file)?;
            let transactions: Vec<Transaction> = serde_json::from_str(&data)?;
            *self.transactions.lock().unwrap() = transactions;
        }
        
        // Load devices
        let devices_file = format!("{}/devices.json", self.data_dir);
        if Path::new(&devices_file).exists() {
            let data = fs::read_to_string(&devices_file)?;
            let devices: HashMap<String, Device> = serde_json::from_str(&data)?;
            *self.devices.lock().unwrap() = devices;
        }
        
        // Load metrics
        let metrics_file = format!("{}/metrics.json", self.data_dir);
        if Path::new(&metrics_file).exists() {
            let data = fs::read_to_string(&metrics_file)?;
            let metrics: Metrics = serde_json::from_str(&data)?;
            *self.metrics.lock().unwrap() = metrics;
        }
        
        Ok(())
    }
    
    fn save_data(&self) -> Result<()> {
        // Save transactions
        let tx_file = format!("{}/transactions.json", self.data_dir);
        let transactions = self.transactions.lock().unwrap();
        let data = serde_json::to_string_pretty(&*transactions)?;
        fs::write(&tx_file, data)?;
        
        // Save devices
        let devices_file = format!("{}/devices.json", self.data_dir);
        let devices = self.devices.lock().unwrap();
        let data = serde_json::to_string_pretty(&*devices)?;
        fs::write(&devices_file, data)?;
        
        // Save metrics
        let metrics_file = format!("{}/metrics.json", self.data_dir);
        let mut metrics = self.metrics.lock().unwrap();
        metrics.last_updated = Utc::now();
        let data = serde_json::to_string_pretty(&*metrics)?;
        fs::write(&metrics_file, data)?;
        
        Ok(())
    }
    
    pub fn save_transaction(&self, transaction: Transaction) -> Result<()> {
        let mut transactions = self.transactions.lock().unwrap();
        transactions.push(transaction);
        
        // Keep only last 1000 transactions
        if transactions.len() > 1000 {
            let len = transactions.len();
            transactions.drain(0..len - 1000);
        }
        
        self.save_data()?;
        Ok(())
    }
    
    pub fn get_transactions(&self, limit: usize) -> Vec<Transaction> {
        let transactions = self.transactions.lock().unwrap();
        transactions.iter().rev().take(limit).cloned().collect()
    }
    
    // Add missing methods
    pub async fn save_transaction_hash(&self, transaction_id: &str, tx_hash: &str) -> Result<()> {
        let mut transactions = self.transactions.lock().unwrap();
        if let Some(transaction) = transactions.iter_mut().find(|t| t.id == transaction_id) {
            transaction.tx_hash = Some(tx_hash.to_string());
            self.save_data()?;
        }
        Ok(())
    }
    
    pub async fn update_transaction(&self, transaction: Transaction) -> Result<()> {
        let mut transactions = self.transactions.lock().unwrap();
        if let Some(existing) = transactions.iter_mut().find(|t| t.id == transaction.id) {
            *existing = transaction;
            self.save_data()?;
        }
        Ok(())
    }
    
    pub async fn get_pending_transactions_for_device(&self, device_id: &str) -> Result<Vec<Transaction>> {
        let transactions = self.transactions.lock().unwrap();
        let pending: Vec<Transaction> = transactions
            .iter()
            .filter(|t| t.device_id.as_deref() == Some(device_id) && t.status == "pending")
            .cloned()
            .collect();
        Ok(pending)
    }
    
    pub async fn get_transaction(&self, transaction_id: &str) -> Result<Option<Transaction>> {
        let transactions = self.transactions.lock().unwrap();
        Ok(transactions.iter().find(|t| t.id == transaction_id).cloned())
    }
    
    pub async fn get_all_transactions(&self) -> Result<Vec<Transaction>> {
        let transactions = self.transactions.lock().unwrap();
        Ok(transactions.clone())
    }
    
    pub fn save_device(&self, device: Device) -> Result<()> {
        let mut devices = self.devices.lock().unwrap();
        devices.insert(device.id.clone(), device);
        self.save_data()?;
        Ok(())
    }
    
    pub fn get_device(&self, device_id: &str) -> Option<Device> {
        let devices = self.devices.lock().unwrap();
        devices.get(device_id).cloned()
    }
    
    pub fn update_metrics(&self, field: &str, value: u64) -> Result<()> {
        let mut metrics = self.metrics.lock().unwrap();
        match field {
            "transactions_received" => metrics.transactions_received += value,
            "transactions_processed" => metrics.transactions_processed += value,
            "transactions_failed" => metrics.transactions_failed += value,
            "ble_connections" => metrics.ble_connections += value,
            "auth_failures" => metrics.auth_failures += value,
            _ => return Err(anyhow::anyhow!("Unknown metric field: {}", field)),
        }
        self.save_data()?;
        Ok(())
    }
    
    pub fn get_metrics(&self) -> Metrics {
        self.metrics.lock().unwrap().clone()
    }
}

impl Transaction {
    pub fn new(signed_tx: String, chain_id: u64, device_id: Option<String>) -> Self {
        let id = Uuid::new_v4().to_string();
        let timestamp = Utc::now();
        let server_id = std::env::var("SERVER_ID").unwrap_or_else(|_| "unknown".to_string());
        
        // Calculate security hash
        let mut hasher = Sha256::new();
        hasher.update(&signed_tx);
        hasher.update(chain_id.to_string().as_bytes());
        hasher.update(device_id.as_deref().unwrap_or("").as_bytes());
        let hash = format!("{:x}", hasher.finalize());
        
        Transaction {
            id,
            signed_tx,
            chain_id,
            device_id,
            timestamp,
            status: "pending".to_string(),
            tx_hash: None,
            security: TransactionSecurity {
                hash,
                created_at: timestamp,
                server_id,
            },
        }
    }
}

impl Device {
    pub fn new(id: String) -> Self {
        Device {
            id,
            name: None,
            public_key: None,
            status: "disconnected".to_string(),
            last_seen: Utc::now(),
            auth_attempts: 0,
            blocked_until: None,
        }
    }
} 