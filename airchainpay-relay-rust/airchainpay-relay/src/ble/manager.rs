use serde::{Deserialize, Serialize};
use anyhow::Result;
use std::sync::Arc;
use tokio::sync::RwLock;
use chrono::{DateTime, Utc};
use btleplug::api::{
    Central, CentralEvent, Manager as _, Peripheral as _, ScanFilter,
    WriteType, Characteristic, Service,
};
use btleplug::platform::{Adapter, Manager};
use std::collections::HashMap;
use std::time::{Duration, Instant};
use rand::Rng;
use sha2::{Sha256, Digest};
use hex;
use uuid::Uuid;
use std::collections::VecDeque;
use crate::utils::error_handler::EnhancedErrorHandler;

// Constants
const AIRCHAINPAY_SERVICE_UUID: u16 = 0xabcd;
const AIRCHAINPAY_CHARACTERISTIC_UUID: u16 = 0xdcba;
const ENCRYPTION_ALGORITHM: &str = "aes-256-gcm";
const IV_LENGTH: usize = 12;
const SCAN_TIMEOUT: Duration = Duration::from_secs(30);
const CONNECTION_TIMEOUT: Duration = Duration::from_secs(15);

// Authentication constants
const AUTH_CHALLENGE_LENGTH: usize = 32;
const AUTH_RESPONSE_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_AUTH_ATTEMPTS: u32 = 3;
const AUTH_BLOCK_DURATION: Duration = Duration::from_secs(300); // 5 minutes

// Key exchange constants
const DH_KEY_SIZE: usize = 2048;
const SESSION_KEY_LENGTH: usize = 32;
const KEY_EXCHANGE_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_KEY_EXCHANGE_ATTEMPTS: u32 = 3;

// DoS protection constants
const MAX_CONNECTIONS: u32 = 10;
const MAX_TX_PER_MINUTE: u32 = 10;
const MAX_CONNECTS_PER_MINUTE: u32 = 5;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BLEDevice {
    pub id: String,
    pub name: Option<String>,
    pub address: String,
    pub rssi: Option<i16>,
    pub is_connected: bool,
    pub last_seen: u64,
    pub status: DeviceStatus,
    pub auth_status: AuthStatus,
    pub key_exchange_status: KeyExchangeStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BLETransaction {
    pub id: String,
    pub device_id: String,
    pub transaction_data: String,
    pub status: TransactionStatus,
    pub timestamp: u64,
    pub signature: Option<String>,
    pub encrypted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TransactionStatus {
    Pending,
    Processing,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DeviceStatus {
    Connected,
    Disconnected,
    Blocked,
    Authenticated,
    Unauthenticated,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AuthStatus {
    Pending,
    Authenticated,
    Failed,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum KeyExchangeStatus {
    Pending,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthRequest {
    pub device_id: String,
    pub public_key: String,
    pub challenge: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResponse {
    pub token: String,
    pub expires_at: String,
    pub status: String,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyExchangeRequest {
    pub device_id: String,
    pub public_key: String,
    pub nonce: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyExchangeResponse {
    pub session_key: String,
    pub expires_at: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BLEStatus {
    pub enabled: bool,
    pub initialized: bool,
    pub is_advertising: bool,
    pub connected_devices: u32,
    pub authenticated_devices: u32,
    pub blocked_devices: u32,
    pub last_scan_time: Option<DateTime<Utc>>,
    pub scan_duration_ms: u64,
    pub total_devices_discovered: u32,
    pub active_connections: u32,
    pub failed_connections: u32,
    pub authentication_success_rate: f64,
    pub average_response_time_ms: f64,
    pub last_error: Option<String>,
    pub uptime_seconds: f64,
    pub key_exchange_completed: u32,
    pub key_exchange_failed: u32,
}

#[derive(Debug, Clone)]
struct DeviceConnection {
    peripheral: btleplug::platform::Peripheral,
    characteristics: Vec<btleplug::api::Characteristic>,
    connected_at: DateTime<Utc>,
    last_activity: DateTime<Utc>,
}

#[derive(Debug, Clone)]
struct AuthChallenge {
    challenge: String,
    created_at: DateTime<Utc>,
    attempts: u32,
}

#[derive(Debug, Clone)]
struct KeyExchangeState {
    status: KeyExchangeStatus,
    dh_public_key: String,
    session_key: Option<String>,
    timestamp: DateTime<Utc>,
    attempts: u32,
}

#[derive(Debug, Clone)]
struct BlockedDevice {
    reason: String,
    blocked_until: DateTime<Utc>,
}

#[derive(Debug, Clone)]
struct RateLimitTracker {
    timestamps: VecDeque<DateTime<Utc>>,
    max_events: u32,
    window_duration: Duration,
}

impl RateLimitTracker {
    fn new(max_events: u32, window_duration: Duration) -> Self {
        Self {
            timestamps: VecDeque::new(),
            max_events,
            window_duration,
        }
    }

    fn check_and_record(&mut self) -> bool {
        let now = Utc::now();
        let cutoff = now - chrono::Duration::from_std(self.window_duration).unwrap();
        
        // Remove old timestamps
        while let Some(timestamp) = self.timestamps.front() {
            if *timestamp < cutoff {
                self.timestamps.pop_front();
            } else {
                break;
            }
        }
        
        // Check if we can record a new event
        if self.timestamps.len() < self.max_events as usize {
            self.timestamps.push_back(now);
            true
        } else {
            false
        }
    }
}

pub struct BLEManager {
    devices: Arc<RwLock<HashMap<String, BLEDevice>>>,
    transactions: Arc<RwLock<HashMap<String, BLETransaction>>>,
    status: Arc<RwLock<BLEStatus>>,
    start_time: DateTime<Utc>,
    
    // BLE-specific state
    manager: Option<Manager>,
    adapter: Option<Adapter>,
    connected_devices: Arc<RwLock<HashMap<String, DeviceConnection>>>,
    
    // Authentication state
    authenticated_devices: Arc<RwLock<HashMap<String, String>>>, // device_id -> public_key
    auth_challenges: Arc<RwLock<HashMap<String, AuthChallenge>>>,
    blocked_devices: Arc<RwLock<HashMap<String, BlockedDevice>>>,
    
    // Key exchange state
    key_exchange_state: Arc<RwLock<HashMap<String, KeyExchangeState>>>,
    session_keys: Arc<RwLock<HashMap<String, String>>>,
    
    // DoS protection
    connection_timestamps: Arc<RwLock<HashMap<String, RateLimitTracker>>>,
    tx_timestamps: Arc<RwLock<HashMap<String, RateLimitTracker>>>,
    
    // Encryption keys
    encryption_keys: Arc<RwLock<HashMap<String, String>>>,
    
    // Relay keys
    relay_private_key: String,
    relay_public_key: String,
    
    // Critical error handler
    critical_error_handler: Option<Arc<EnhancedErrorHandler>>,
}

impl BLEManager {
    pub async fn new() -> Result<Self> {
        let (relay_private_key, relay_public_key) = Self::generate_key_pair()?;
        
        let manager = Manager::new().await?;
        let adapters = manager.adapters().await?;
        
        if adapters.is_empty() {
            return Err(anyhow::anyhow!("No BLE adapters found"));
        }
        
        let adapter = adapters.into_iter().next().unwrap();
        
        Ok(Self {
            devices: Arc::new(RwLock::new(HashMap::new())),
            transactions: Arc::new(RwLock::new(HashMap::new())),
            status: Arc::new(RwLock::new(BLEStatus {
                enabled: true,
                initialized: true,
                is_advertising: false,
                connected_devices: 0,
                authenticated_devices: 0,
                blocked_devices: 0,
                last_scan_time: None,
                scan_duration_ms: 0,
                total_devices_discovered: 0,
                active_connections: 0,
                failed_connections: 0,
                authentication_success_rate: 0.0,
                average_response_time_ms: 0.0,
                last_error: None,
                uptime_seconds: 0.0,
                key_exchange_completed: 0,
                key_exchange_failed: 0,
            })),
            start_time: Utc::now(),
            manager: Some(manager),
            adapter: Some(adapter),
            connected_devices: Arc::new(RwLock::new(HashMap::new())),
            authenticated_devices: Arc::new(RwLock::new(HashMap::new())),
            auth_challenges: Arc::new(RwLock::new(HashMap::new())),
            blocked_devices: Arc::new(RwLock::new(HashMap::new())),
            key_exchange_state: Arc::new(RwLock::new(HashMap::new())),
            session_keys: Arc::new(RwLock::new(HashMap::new())),
            connection_timestamps: Arc::new(RwLock::new(HashMap::new())),
            tx_timestamps: Arc::new(RwLock::new(HashMap::new())),
            encryption_keys: Arc::new(RwLock::new(HashMap::new())),
            relay_private_key,
            relay_public_key,
            critical_error_handler: None,
        })
    }

    pub fn with_critical_error_handler(mut self, handler: Arc<EnhancedErrorHandler>) -> Self {
        self.critical_error_handler = Some(handler);
        self
    }

    async fn initialize_ble(&self) -> Result<()> {
        if let Some(adapter) = &self.adapter {
            adapter.start_scan(ScanFilter::default()).await?;
            // Logger::info("BLE adapter initialized successfully"); // Assuming Logger is defined elsewhere
        }
        Ok(())
    }

    fn generate_key_pair() -> Result<(String, String)> {
        let mut rng = rand::thread_rng();
        let private_key: [u8; 32] = rng.random();
        let public_key = sha2::Sha256::digest(&private_key);
        
        Ok((
            hex::encode(private_key),
            hex::encode(public_key)
        ))
    }

    pub async fn get_status(&self) -> BLEStatus {
        let status = self.status.read().await;
        let uptime = (Utc::now() - self.start_time).num_seconds() as f64;
        
        BLEStatus {
            uptime_seconds: uptime,
            ..status.clone()
        }
    }

    pub async fn scan_devices(&mut self) -> Result<Vec<BLEDevice>> {
        let mut context = HashMap::new();
        context.insert("operation".to_string(), "scan_devices".to_string());

        if let Some(handler) = &self.critical_error_handler {
            let result = (async {
                let adapter = self.adapter.as_ref()
                    .ok_or_else(|| anyhow::anyhow!("BLE adapter not available"))?;
                
                let mut devices = Vec::new();
                let scan_start = Instant::now();
                
                // Start scanning
                adapter.start_scan(ScanFilter::default()).await?;
                
                // Wait for scan to complete
                tokio::time::sleep(SCAN_TIMEOUT).await;
                
                // Stop scanning
                adapter.stop_scan().await?;
                
                let scan_duration = scan_start.elapsed();
                
                // Get discovered devices
                let peripherals = adapter.peripherals().await?;
                
                for peripheral in peripherals {
                    let properties = peripheral.properties().await?;
                    if let Some(props) = properties {
                        if let Some(name) = &props.local_name {
                            if name.contains("AirChainPay") {
                                let device = BLEDevice {
                                    id: peripheral.id().to_string(),
                                    name: Some(name.clone()),
                                    address: peripheral.id().to_string(),
                                    rssi: props.rssi,
                                    is_connected: false,
                                    last_seen: Utc::now().timestamp() as u64,
                                    status: DeviceStatus::Disconnected,
                                    auth_status: AuthStatus::Pending,
                                    key_exchange_status: KeyExchangeStatus::Pending,
                                };
                                devices.push(device);
                            }
                        }
                    }
                }
                
                // Update status
                {
                    let mut status = self.status.write().await;
                    status.last_scan_time = Some(Utc::now());
                    status.scan_duration_ms = scan_duration.as_millis() as u64;
                    status.total_devices_discovered += devices.len() as u32;
                }
                
                // Store discovered devices
                {
                    let mut devices_map = self.devices.write().await;
                    for device in &devices {
                        devices_map.insert(device.id.clone(), device.clone());
                    }
                }
                
                Ok(devices)
            }).await;
            if let Err(ref e) = result {
                println!("BLEManager error: {}", e);
            }
            return result;
        }

        // Fallback to direct execution
        let adapter = self.adapter.as_ref()
            .ok_or_else(|| anyhow::anyhow!("BLE adapter not available"))?;
        
        let mut devices = Vec::new();
        let scan_start = Instant::now();
        
        // Start scanning
        adapter.start_scan(ScanFilter::default()).await?;
        
        // Wait for scan to complete
        tokio::time::sleep(SCAN_TIMEOUT).await;
        
        // Stop scanning
        adapter.stop_scan().await?;
        
        let scan_duration = scan_start.elapsed();
        
        // Get discovered devices
        let peripherals = adapter.peripherals().await?;
        
        for peripheral in peripherals {
            let properties = peripheral.properties().await?;
            if let Some(props) = properties {
                if let Some(name) = &props.local_name {
                    if name.contains("AirChainPay") {
                        let device = BLEDevice {
                            id: peripheral.id().to_string(),
                            name: Some(name.clone()),
                            address: peripheral.id().to_string(),
                            rssi: props.rssi,
                            is_connected: false,
                            last_seen: Utc::now().timestamp() as u64,
                            status: DeviceStatus::Disconnected,
                            auth_status: AuthStatus::Pending,
                            key_exchange_status: KeyExchangeStatus::Pending,
                        };
                        devices.push(device);
                    }
                }
            }
        }
        
        // Update status
        {
            let mut status = self.status.write().await;
            status.last_scan_time = Some(Utc::now());
            status.scan_duration_ms = scan_duration.as_millis() as u64;
            status.total_devices_discovered += devices.len() as u32;
        }
        
        // Store discovered devices
        {
            let mut devices_map = self.devices.write().await;
            for device in &devices {
                devices_map.insert(device.id.clone(), device.clone());
            }
        }
        
        Ok(devices)
    }

    pub async fn connect_device(&mut self, device_id: &str) -> Result<()> {
        let mut context = HashMap::new();
        context.insert("device_id".to_string(), device_id.to_string());
        context.insert("operation".to_string(), "connect_device".to_string());

        if let Some(handler) = &self.critical_error_handler {
            let result = (async {
                // Check rate limiting
                if !self.check_connection_rate_limit(device_id).await {
                    return Err(anyhow::anyhow!("Connection rate limit exceeded for device"));
                }
                
                // Check if device is blocked
                if self.is_device_blocked(device_id).await {
                    return Err(anyhow::anyhow!("Device is blocked"));
                }
                
                let adapter = self.adapter.as_ref()
                    .ok_or_else(|| anyhow::anyhow!("BLE adapter not available"))?;
                
                // Find peripheral
                let peripherals = adapter.peripherals().await?;
                let peripheral = peripherals.into_iter()
                    .find(|p| p.id().to_string() == device_id)
                    .ok_or_else(|| anyhow::anyhow!("Device not found"))?;
                
                // Connect to peripheral
                peripheral.connect().await?;
                
                // Wait for connection to establish
                tokio::time::sleep(CONNECTION_TIMEOUT).await;
                
                // Check if connection was successful
                if peripheral.is_connected().await? {
                    // Update device status
                    {
                        let mut devices = self.devices.write().await;
                        if let Some(device) = devices.get_mut(device_id) {
                            device.is_connected = true;
                            device.status = DeviceStatus::Connected;
                            device.last_seen = Utc::now().timestamp() as u64;
                        }
                    }
                    
                    // Update connection count
                    {
                        let mut status = self.status.write().await;
                        status.connected_devices += 1;
                        status.active_connections += 1;
                    }
                    
                    // Logger::info(&format!("Successfully connected to device: {}", device_id)); // Assuming Logger is defined elsewhere
                    Ok(())
                } else {
                    {
                        let mut status = self.status.write().await;
                        status.failed_connections += 1;
                    }
                    Err(anyhow::anyhow!("Failed to establish connection"))
                }
            }).await;
            if let Err(ref e) = result {
                println!("BLEManager error: {}", e);
            }
            return result;
        }

        // Fallback to direct execution
        // Check rate limiting
        if !self.check_connection_rate_limit(device_id).await {
            return Err(anyhow::anyhow!("Connection rate limit exceeded for device"));
        }
        
        // Check if device is blocked
        if self.is_device_blocked(device_id).await {
            return Err(anyhow::anyhow!("Device is blocked"));
        }
        
        let adapter = self.adapter.as_ref()
            .ok_or_else(|| anyhow::anyhow!("BLE adapter not available"))?;
        
        // Find peripheral
        let peripherals = adapter.peripherals().await?;
        let peripheral = peripherals.into_iter()
            .find(|p| p.id().to_string() == device_id)
            .ok_or_else(|| anyhow::anyhow!("Device not found"))?;
        
        // Connect to peripheral
        peripheral.connect().await?;
        
        // Wait for connection to establish
        tokio::time::sleep(CONNECTION_TIMEOUT).await;
        
        // Check if connection was successful
        if peripheral.is_connected().await? {
            // Update device status
            {
                let mut devices = self.devices.write().await;
                if let Some(device) = devices.get_mut(device_id) {
                    device.is_connected = true;
                    device.status = DeviceStatus::Connected;
                    device.last_seen = Utc::now().timestamp() as u64;
                }
            }
            
            // Update connection count
            {
                let mut status = self.status.write().await;
                status.connected_devices += 1;
                status.active_connections += 1;
            }
            
            // Logger::info(&format!("Successfully connected to device: {}", device_id)); // Assuming Logger is defined elsewhere
            Ok(())
        } else {
            {
                let mut status = self.status.write().await;
                status.failed_connections += 1;
            }
            Err(anyhow::anyhow!("Failed to establish connection"))
        }
    }

    pub async fn disconnect_device(&mut self, device_id: &str) -> Result<()> {
        // Remove from connected devices
        if self.connected_devices.write().await.remove(device_id).is_some() {
            // Update device status
            let mut devices = self.devices.write().await;
            if let Some(device) = devices.get_mut(device_id) {
                device.is_connected = false;
                device.status = DeviceStatus::Disconnected;
            }
            
            // Update status
            let mut status = self.status.write().await;
            if status.active_connections > 0 {
                status.active_connections -= 1;
            }
        }
        
        Ok(())
    }

    pub async fn send_transaction(&mut self, device_id: &str, transaction_data: &str) -> Result<String> {
        // Check transaction rate limit
        if !self.check_transaction_rate_limit(device_id).await {
            return Err(anyhow::anyhow!("Transaction rate limit exceeded"));
        }
        
        // Check if device is authenticated
        if !self.is_device_authenticated(device_id).await {
            return Err(anyhow::anyhow!("Device not authenticated"));
        }
        
        let transaction_id = Uuid::new_v4().to_string();
        
        // Encrypt transaction data if session key exists
        let encrypted_data = if let Some(session_key) = self.session_keys.read().await.get(device_id) {
            self.encrypt_data(transaction_data, session_key)?
        } else {
            transaction_data.to_string()
        };
        
        // Create transaction record
        let transaction = BLETransaction {
            id: transaction_id.clone(),
            device_id: device_id.to_string(),
            transaction_data: encrypted_data,
            status: TransactionStatus::Pending,
            timestamp: Utc::now().timestamp() as u64,
            signature: None,
            encrypted: true,
        };
        
        self.transactions.write().await.insert(transaction_id.clone(), transaction);
        
        // Send data to device
        if let Some(_connection) = self.connected_devices.read().await.get(device_id) {
            // In a real implementation, you would send the data via BLE
            // For now, we'll just simulate the send
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        
        Ok(transaction_id)
    }

    pub async fn get_transaction_status(&self, transaction_id: &str) -> Result<Option<TransactionStatus>> {
        let transactions = self.transactions.read().await;
        Ok(transactions.get(transaction_id).map(|t| t.status.clone()))
    }

    pub async fn authenticate_device(&mut self, device_id: &str, public_key: &str) -> Result<bool> {
        // Check if device is blocked
        if self.is_device_blocked(device_id).await {
            return Err(anyhow::anyhow!("Device is blocked"));
        }
        
        // Generate authentication challenge
        let _challenge = self.generate_auth_challenge(device_id).await?;
        
        // Store device public key
        self.authenticated_devices.write().await.insert(device_id.to_string(), public_key.to_string());
        
        // Simulate authentication (in real implementation, verify challenge response)
        let success = rand::thread_rng().random_bool(0.8); // 80% success rate for demo
        
        if success {
            // Update device auth status
            let mut devices = self.devices.write().await;
            if let Some(device) = devices.get_mut(device_id) {
                device.auth_status = AuthStatus::Authenticated;
            }
            
            // Update status
            let mut status = self.status.write().await;
            status.authenticated_devices += 1;
        } else {
            // Record failed attempt
            let mut status = self.status.write().await;
            status.failed_connections += 1;
            
            // Check if device should be blocked
            let should_block = {
                let auth_challenges = self.auth_challenges.read().await;
                if let Some(challenge) = auth_challenges.get(device_id) {
                    challenge.attempts >= MAX_AUTH_ATTEMPTS
                } else {
                    false
                }
            };
            
            if should_block {
                // Release the status lock before calling block_device
                drop(status);
                self.block_device(device_id, "Too many failed authentication attempts").await?;
            }
        }
        
        Ok(success)
    }

    pub async fn block_device(&mut self, device_id: &str, reason: &str) -> Result<()> {
        let blocked_device = BlockedDevice {
            reason: reason.to_string(),
            blocked_until: Utc::now() + chrono::Duration::from_std(AUTH_BLOCK_DURATION).unwrap(),
        };
        
        self.blocked_devices.write().await.insert(device_id.to_string(), blocked_device);
        
        // Update device status
        let mut devices = self.devices.write().await;
        if let Some(device) = devices.get_mut(device_id) {
            device.status = DeviceStatus::Blocked;
            device.auth_status = AuthStatus::Blocked;
        }
        
        // Update status
        let mut status = self.status.write().await;
        status.blocked_devices += 1;
        
        Ok(())
    }

    pub async fn unblock_device(&mut self, device_id: &str) -> Result<()> {
        self.blocked_devices.write().await.remove(device_id);
        
        // Update device status
        let mut devices = self.devices.write().await;
        if let Some(device) = devices.get_mut(device_id) {
            device.status = DeviceStatus::Disconnected;
            device.auth_status = AuthStatus::Pending;
        }
        
        // Update status
        let mut status = self.status.write().await;
        if status.blocked_devices > 0 {
            status.blocked_devices -= 1;
        }
        
        Ok(())
    }

    pub async fn initiate_key_exchange(&mut self, device_id: &str) -> Result<bool> {
        // Check if device is authenticated
        if !self.is_device_authenticated(device_id).await {
            return Err(anyhow::anyhow!("Device not authenticated"));
        }
        
        // Generate DH key pair
        let (_dh_private_key, dh_public_key) = Self::generate_key_pair()?;
        
        // Store key exchange state
        let state = KeyExchangeState {
            status: KeyExchangeStatus::Pending,
            dh_public_key: dh_public_key.clone(),
            session_key: None,
            timestamp: Utc::now(),
            attempts: 0,
        };
        
        self.key_exchange_state.write().await.insert(device_id.to_string(), state);
        
        Ok(true)
    }

    pub async fn complete_key_exchange(&mut self, device_id: &str, device_public_key: &str) -> Result<bool> {
        // Get current state
        let key_exchange_state = self.key_exchange_state.write().await;
        let state = key_exchange_state.get(device_id)
            .ok_or_else(|| anyhow::anyhow!("No key exchange in progress"))?;
        
        // Derive session key
        let session_key = self.derive_session_key(&state.dh_public_key, device_public_key, device_id)?;
        
        // Store session key
        self.session_keys.write().await.insert(device_id.to_string(), session_key.clone());
        
        // Update state (need to drop the read lock first)
        drop(key_exchange_state);
        let mut key_exchange_state = self.key_exchange_state.write().await;
        if let Some(state) = key_exchange_state.get_mut(device_id) {
            state.session_key = Some(session_key);
            state.status = KeyExchangeStatus::Completed;
        }
        
        // Update device status
        let mut devices = self.devices.write().await;
        if let Some(device) = devices.get_mut(device_id) {
            device.key_exchange_status = KeyExchangeStatus::Completed;
        }
        
        // Update status
        let mut status = self.status.write().await;
        status.key_exchange_completed += 1;
        
        Ok(true)
    }

    pub async fn is_device_authenticated(&self, device_id: &str) -> bool {
        self.authenticated_devices.read().await.contains_key(device_id)
    }

    pub async fn is_device_blocked(&self, device_id: &str) -> bool {
        if let Some(blocked_device) = self.blocked_devices.read().await.get(device_id) {
            blocked_device.blocked_until > Utc::now()
        } else {
            false
        }
    }

    async fn generate_auth_challenge(&self, device_id: &str) -> Result<String> {
        let challenge = hex::encode(rand::thread_rng().random::<[u8; AUTH_CHALLENGE_LENGTH]>());
        
        let auth_challenge = AuthChallenge {
            challenge: challenge.clone(),
            created_at: Utc::now(),
            attempts: 0,
        };
        
        self.auth_challenges.write().await.insert(device_id.to_string(), auth_challenge);
        
        Ok(challenge)
    }

    fn derive_session_key(&self, our_public_key: &str, device_public_key: &str, device_id: &str) -> Result<String> {
        // In a real implementation, perform proper DH key exchange
        // For now, create a simple hash-based session key
        let mut hasher = Sha256::new();
        hasher.update(our_public_key.as_bytes());
        hasher.update(device_public_key.as_bytes());
        hasher.update(device_id.as_bytes());
        hasher.update(self.relay_private_key.as_bytes());
        
        let result = hasher.finalize();
        Ok(hex::encode(result))
    }

    fn encrypt_data(&self, data: &str, _session_key: &str) -> Result<String> {
        // In a real implementation, encrypt the data
        // For now, just return the data as-is
        Ok(data.to_string())
    }

    fn decrypt_data(&self, encrypted_data: &str, _session_key: &str) -> Result<String> {
        // In a real implementation, decrypt the data
        // For now, just return the data as-is
        Ok(encrypted_data.to_string())
    }

    async fn check_connection_rate_limit(&self, device_id: &str) -> bool {
        let mut timestamps = self.connection_timestamps.write().await;
        
        if !timestamps.contains_key(device_id) {
            timestamps.insert(device_id.to_string(), RateLimitTracker::new(
                MAX_CONNECTS_PER_MINUTE,
                Duration::from_secs(60)
            ));
        }
        
        timestamps.get_mut(device_id).unwrap().check_and_record()
    }

    async fn check_transaction_rate_limit(&self, device_id: &str) -> bool {
        let mut timestamps = self.tx_timestamps.write().await;
        
        if !timestamps.contains_key(device_id) {
            timestamps.insert(device_id.to_string(), RateLimitTracker::new(
                MAX_TX_PER_MINUTE,
                Duration::from_secs(60)
            ));
        }
        
        timestamps.get_mut(device_id).unwrap().check_and_record()
    }

    async fn is_connection_cap_reached(&self) -> bool {
        self.connected_devices.read().await.len() >= MAX_CONNECTIONS as usize
    }

    pub async fn update_response_time(&mut self, response_time_ms: f64) {
        let mut status = self.status.write().await;
        status.average_response_time_ms = response_time_ms;
    }

    pub async fn record_error(&mut self, error: String) {
        let mut status = self.status.write().await;
        status.last_error = Some(error);
    }

    pub async fn get_connected_devices(&self) -> Vec<BLEDevice> {
        let devices = self.devices.read().await;
        devices.values()
            .filter(|d| d.is_connected)
            .cloned()
            .collect()
    }

    pub async fn get_authenticated_devices(&self) -> Vec<BLEDevice> {
        let devices = self.devices.read().await;
        let authenticated = self.authenticated_devices.read().await;
        
        devices.values()
            .filter(|d| authenticated.contains_key(&d.id))
            .cloned()
            .collect()
    }

    pub async fn get_blocked_devices(&self) -> Vec<BLEDevice> {
        let devices = self.devices.read().await;
        let blocked = self.blocked_devices.read().await;
        
        devices.values()
            .filter(|d| blocked.contains_key(&d.id))
            .cloned()
            .collect()
    }

    pub async fn get_key_exchange_status(&self, device_id: &str) -> Option<KeyExchangeStatus> {
        self.key_exchange_state.read().await
            .get(device_id)
            .map(|state| state.status.clone())
    }

    pub async fn rotate_session_key(&mut self, device_id: &str) -> Result<bool> {
        // Generate new session key
        let (_dh_private_key, dh_public_key) = Self::generate_key_pair()?;
        
        // In a real implementation, perform new key exchange
        // For now, just update the session key
        let new_session_key = self.derive_session_key(&dh_public_key, "device_key", device_id)?;
        
        self.session_keys.write().await.insert(device_id.to_string(), new_session_key);
        
        Ok(true)
    }
}

// Standalone functions
pub async fn scan_ble_devices() -> Result<Vec<BLEDevice>> {
    let mut manager = BLEManager::new().await?;
    manager.scan_devices().await
}

pub async fn process_transaction(device_id: &str, transaction_data: &str) -> Result<String> {
    let mut manager = BLEManager::new().await?;
    manager.send_transaction(device_id, transaction_data).await
}

pub async fn get_key_exchange_devices() -> Result<Vec<BLEDevice>> {
    let manager = BLEManager::new().await?;
    Ok(manager.get_authenticated_devices().await)
} 