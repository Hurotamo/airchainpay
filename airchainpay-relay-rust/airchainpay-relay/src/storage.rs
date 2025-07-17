use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use anyhow::Result;
use chrono::{DateTime, Utc};
use uuid::Uuid;
use crate::utils::database::DatabaseHealth;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Transaction {
    pub id: String,
    pub signed_tx: String,
    pub chain_id: u64,
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
pub struct Metrics {
    pub transactions_received: u64,
    pub transactions_processed: u64,
    pub transactions_failed: u64,
    pub auth_failures: u64,
    pub last_updated: DateTime<Utc>,
}

pub struct Storage {
    data_dir: String,
    transactions: Mutex<Vec<Transaction>>,
    metrics: Mutex<Metrics>,
}

impl Storage {
    pub fn new() -> Result<Self> {
        let data_dir = "data".to_string();
        fs::create_dir_all(&data_dir)?;
        
        let storage = Storage {
            data_dir,
            transactions: Mutex::new(Vec::new()),
            metrics: Mutex::new(Metrics {
                transactions_received: 0,
                transactions_processed: 0,
                transactions_failed: 0,
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
        
        // Load metrics
        let metrics_file = format!("{}/metrics.json", self.data_dir);
        if Path::new(&metrics_file).exists() {
            let data = fs::read_to_string(&metrics_file)?;
            let metrics: Metrics = serde_json::from_str(&data)?;
            *self.metrics.lock().unwrap() = metrics;
        }
        
        Ok(())
    }
    
    pub fn save_data(&self) -> Result<()> {
        // Save transactions
        let tx_file = format!("{}/transactions.json", self.data_dir);
        let transactions = self.transactions.lock().unwrap();
        let data = serde_json::to_string_pretty(&*transactions)?;
        fs::write(&tx_file, data)?;
        
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
    
    pub fn update_transaction_status(&self, id: &str, status: &str, tx_hash: Option<String>) -> Result<()> {
        let mut transactions = self.transactions.lock().unwrap();
        if let Some(tx) = transactions.iter_mut().find(|t| t.id == id) {
            tx.status = status.to_string();
            tx.tx_hash = tx_hash;
            self.save_data()?;
            Ok(())
        } else {
            Err(anyhow::anyhow!("Transaction not found: {}", id))
        }
    }

    
    pub fn update_metrics(&self, field: &str, value: u64) -> Result<()> {
        let mut metrics = self.metrics.lock().unwrap();
        match field {
            "transactions_received" => metrics.transactions_received += value,
            "transactions_processed" => metrics.transactions_processed += value,
            "transactions_failed" => metrics.transactions_failed += value,
            "auth_failures" => metrics.auth_failures += value,
            _ => return Err(anyhow::anyhow!("Unknown metric field: {}", field)),
        }
        self.save_data()?;
        Ok(())
    }
    
    pub fn get_metrics(&self) -> Metrics {
        self.metrics.lock().unwrap().clone()
    }
    
    // Add missing methods for API compatibility
    pub async fn check_health(&self) -> DatabaseHealth {
        // Basic health check - verify data directory exists and is writable
        let test_file = format!("{}/health_check.tmp", self.data_dir);
        let is_healthy = fs::write(&test_file, "health_check").is_ok() && fs::remove_file(&test_file).is_ok();
        
        let _metrics = self.get_metrics();
        let transactions = self.transactions.lock().unwrap();
        
        DatabaseHealth {
            is_healthy,
            connection_count: 0,
            last_backup_time: None,
            backup_size_bytes: 0,
            error_count: if is_healthy { 0 } else { 1 },
            slow_queries: 0,
            total_transactions: transactions.len() as u32,
            total_devices: 0,
            data_integrity_ok: is_healthy,
            last_maintenance: None,
            disk_usage_percent: 0.0,
            memory_usage_bytes: 0,
            uptime_seconds: 0.0,
        }
    }

    // Get registered mobile wallet instances
    pub fn get_registered_wallets(&self) -> Vec<String> {
        // Return list of registered mobile wallet app instances
        // This tracks mobile apps that have authenticated with the relay
        // For now, return empty list - would be populated when mobile apps register
        Vec::new()
    }
}

impl Transaction {
    pub fn new(signed_tx: String, chain_id: u64) -> Self {
        Transaction {
            id: Uuid::new_v4().to_string(),
            signed_tx,
            chain_id,
            timestamp: Utc::now(),
            status: "pending".to_string(),
            tx_hash: None,
            security: TransactionSecurity {
                hash: "".to_string(),
                created_at: Utc::now(),
                server_id: "default".to_string(),
            },
        }
    }
} 