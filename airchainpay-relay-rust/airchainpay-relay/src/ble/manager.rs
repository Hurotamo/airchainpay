use btleplug::api::{Central, Manager as _, Peripheral as _, PeripheralProperties, ScanFilter};
use btleplug::platform::Manager;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::mpsc;
use uuid::Uuid;
use crate::logger::Logger;
use crate::config::Config;
use anyhow::{Result, anyhow};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BLEDevice {
    pub id: String,
    pub name: Option<String>,
    pub address: String,
    pub rssi: Option<i16>,
    pub connected: bool,
    pub authenticated: bool,
    pub public_key: Option<String>,
    pub last_seen: Instant,
    pub connection_attempts: u32,
    pub status: DeviceStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DeviceStatus {
    Disconnected,
    Connecting,
    Connected,
    Authenticating,
    Authenticated,
    Ready,
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BLETransaction {
    pub id: String,
    pub device_id: String,
    pub signed_tx: String,
    pub chain_id: u64,
    pub timestamp: Instant,
    pub status: TransactionStatus,
    pub retry_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TransactionStatus {
    Pending,
    Processing,
    Completed,
    Failed(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthRequest {
    pub device_id: String,
    pub public_key: String,
    pub challenge: String,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResponse {
    pub success: bool,
    pub token: Option<String>,
    pub error: Option<String>,
}

pub struct BLEManager {
    devices: Arc<Mutex<HashMap<String, BLEDevice>>>,
    transactions: Arc<Mutex<HashMap<String, BLETransaction>>>,
    config: Config,
    scan_interval: Duration,
    connection_timeout: Duration,
    auth_timeout: Duration,
    tx_sender: mpsc::Sender<BLETransaction>,
}

impl BLEManager {
    pub fn new(config: Config, tx_sender: mpsc::Sender<BLETransaction>) -> Self {
        Self {
            devices: Arc::new(Mutex::new(HashMap::new())),
            transactions: Arc::new(Mutex::new(HashMap::new())),
            config,
            scan_interval: Duration::from_secs(30),
            connection_timeout: Duration::from_secs(10),
            auth_timeout: Duration::from_secs(30),
            tx_sender,
        }
    }

    pub async fn start_scanning(&self) -> Result<()> {
        Logger::info("Starting BLE device scanning");
        
        let manager = Manager::new().await?;
        let adapters = manager.adapters().await?;
        
        if adapters.is_empty() {
            return Err(anyhow!("No BLE adapters found"));
        }

        let central = adapters.into_iter().next().unwrap();
        
        // Start scanning with filter for AirChainPay devices
        let filter = ScanFilter {
            services: vec![Uuid::parse_str("0000ff00-0000-1000-8000-00805f9b34fb")?],
            ..Default::default()
        };
        
        central.start_scan(filter).await?;
        
        // Spawn background scanning task
        let devices = self.devices.clone();
        let scan_interval = self.scan_interval;
        
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(scan_interval).await;
                
                match central.peripherals().await {
                    Ok(peripherals) => {
                        for peripheral in peripherals {
                            if let Ok(properties) = peripheral.properties().await {
                                Self::process_discovered_device(&devices, properties).await;
                            }
                        }
                    }
                    Err(e) => {
                        Logger::error(&format!("BLE scan error: {}", e));
                    }
                }
            }
        });

        Ok(())
    }

    async fn process_discovered_device(
        devices: &Arc<Mutex<HashMap<String, BLEDEDevice>>>,
        properties: PeripheralProperties,
    ) {
        let device_id = properties.address.to_string();
        let device_name = properties.local_name.clone();
        
        // Check if this is an AirChainPay device
        if let Some(name) = &device_name {
            if name.contains("AirChainPay") || name.contains("ACP") {
                let mut devices = devices.lock().unwrap();
                
                let device = BLEDevice {
                    id: device_id.clone(),
                    name: device_name,
                    address: device_id.clone(),
                    rssi: properties.rssi,
                    connected: false,
                    authenticated: false,
                    public_key: None,
                    last_seen: Instant::now(),
                    connection_attempts: 0,
                    status: DeviceStatus::Disconnected,
                };
                
                devices.insert(device_id, device);
                Logger::debug(&format!("Discovered AirChainPay device: {}", device_id));
            }
        }
    }

    pub async fn connect_to_device(&self, device_id: &str) -> Result<()> {
        let mut devices = self.devices.lock().unwrap();
        
        if let Some(device) = devices.get_mut(device_id) {
            device.status = DeviceStatus::Connecting;
            device.connection_attempts += 1;
            
            Logger::info(&format!("Attempting to connect to device: {}", device_id));
            
            // Simulate connection process
            tokio::time::sleep(Duration::from_millis(1000)).await;
            
            device.connected = true;
            device.status = DeviceStatus::Connected;
            device.last_seen = Instant::now();
            
            Logger::ble_device_connected(device_id);
            
            // Start authentication process
            self.authenticate_device(device_id).await?;
        }
        
        Ok(())
    }

    pub async fn authenticate_device(&self, device_id: &str) -> Result<()> {
        let mut devices = self.devices.lock().unwrap();
        
        if let Some(device) = devices.get_mut(device_id) {
            device.status = DeviceStatus::Authenticating;
            
            Logger::debug(&format!("Starting authentication for device: {}", device_id));
            
            // Generate challenge
            let challenge = Uuid::new_v4().to_string();
            
            // Simulate authentication process
            tokio::time::sleep(Duration::from_millis(2000)).await;
            
            // For now, assume authentication succeeds
            device.authenticated = true;
            device.status = DeviceStatus::Authenticated;
            device.public_key = Some("sample_public_key".to_string());
            
            Logger::auth_success(device_id);
            
            // Transition to ready state
            device.status = DeviceStatus::Ready;
        }
        
        Ok(())
    }

    pub async fn receive_transaction(&self, device_id: &str, signed_tx: &str, chain_id: u64) -> Result<String> {
        let transaction_id = Uuid::new_v4().to_string();
        
        let transaction = BLETransaction {
            id: transaction_id.clone(),
            device_id: device_id.to_string(),
            signed_tx: signed_tx.to_string(),
            chain_id,
            timestamp: Instant::now(),
            status: TransactionStatus::Pending,
            retry_count: 0,
        };
        
        // Store transaction
        {
            let mut transactions = self.transactions.lock().unwrap();
            transactions.insert(transaction_id.clone(), transaction.clone());
        }
        
        Logger::transaction_received(&transaction_id, chain_id);
        
        // Send to transaction processor
        if let Err(e) = self.tx_sender.send(transaction).await {
            Logger::error(&format!("Failed to send transaction to processor: {}", e));
            return Err(anyhow!("Failed to process transaction"));
        }
        
        Ok(transaction_id)
    }

    pub async fn get_device_status(&self, device_id: &str) -> Option<BLEDevice> {
        let devices = self.devices.lock().unwrap();
        devices.get(device_id).cloned()
    }

    pub async fn get_all_devices(&self) -> Vec<BLEDevice> {
        let devices = self.devices.lock().unwrap();
        devices.values().cloned().collect()
    }

    pub async fn disconnect_device(&self, device_id: &str) -> Result<()> {
        let mut devices = self.devices.lock().unwrap();
        
        if let Some(device) = devices.get_mut(device_id) {
            device.connected = false;
            device.authenticated = false;
            device.status = DeviceStatus::Disconnected;
            
            Logger::ble_device_disconnected(device_id);
        }
        
        Ok(())
    }

    pub async fn update_transaction_status(&self, transaction_id: &str, status: TransactionStatus) {
        let mut transactions = self.transactions.lock().unwrap();
        
        if let Some(transaction) = transactions.get_mut(transaction_id) {
            transaction.status = status.clone();
            
            match status {
                TransactionStatus::Completed => {
                    Logger::transaction_processed(transaction_id, transaction.chain_id);
                }
                TransactionStatus::Failed(ref error) => {
                    Logger::transaction_failed(transaction_id, error);
                }
                _ => {}
            }
        }
    }

    pub async fn get_transaction(&self, transaction_id: &str) -> Option<BLETransaction> {
        let transactions = self.transactions.lock().unwrap();
        transactions.get(transaction_id).cloned()
    }

    pub async fn cleanup_old_devices(&self) {
        let mut devices = self.devices.lock().unwrap();
        let now = Instant::now();
        let timeout = Duration::from_secs(300); // 5 minutes
        
        devices.retain(|_, device| {
            if device.connected {
                true
            } else {
                now.duration_since(device.last_seen) < timeout
            }
        });
    }

    pub async fn get_metrics(&self) -> HashMap<String, u64> {
        let devices = self.devices.lock().unwrap();
        let transactions = self.transactions.lock().unwrap();
        
        let mut metrics = HashMap::new();
        metrics.insert("total_devices".to_string(), devices.len() as u64);
        metrics.insert("connected_devices".to_string(), 
            devices.values().filter(|d| d.connected).count() as u64);
        metrics.insert("authenticated_devices".to_string(), 
            devices.values().filter(|d| d.authenticated).count() as u64);
        metrics.insert("total_transactions".to_string(), transactions.len() as u64);
        metrics.insert("pending_transactions".to_string(), 
            transactions.values().filter(|t| matches!(t.status, TransactionStatus::Pending)).count() as u64);
        
        metrics
    }
}

impl Clone for BLEManager {
    fn clone(&self) -> Self {
        Self {
            devices: self.devices.clone(),
            transactions: self.transactions.clone(),
            config: self.config.clone(),
            scan_interval: self.scan_interval,
            connection_timeout: self.connection_timeout,
            auth_timeout: self.auth_timeout,
            tx_sender: self.tx_sender.clone(),
        }
    }
} 