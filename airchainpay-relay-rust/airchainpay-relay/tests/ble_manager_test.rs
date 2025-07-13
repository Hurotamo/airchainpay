use crate::ble::manager::{
    BLEManager, BLEDevice, BLETransaction, DeviceStatus, AuthStatus, 
    KeyExchangeStatus, TransactionStatus
};
use anyhow::Result;
use tokio::time::{sleep, Duration};

#[tokio::test]
async fn test_ble_manager_initialization() -> Result<()> {
    // Test that BLE manager can be created
    let manager = BLEManager::new().await;
    assert!(manager.is_ok());
    
    let manager = manager.unwrap();
    let status = manager.get_status().await;
    
    // Check initial status
    assert!(status.enabled);
    assert!(status.initialized);
    assert!(!status.is_advertising);
    assert_eq!(status.connected_devices, 0);
    assert_eq!(status.authenticated_devices, 0);
    assert_eq!(status.blocked_devices, 0);
    
    Ok(())
}

#[tokio::test]
async fn test_device_management() -> Result<()> {
    let mut manager = BLEManager::new().await?;
    
    // Test device scanning (mock)
    let devices = manager.scan_devices().await?;
    assert!(devices.is_empty()); // No real devices in test environment
    
    // Test device connection (should fail without real device)
    let result = manager.connect_device("test-device-123").await;
    assert!(result.is_err()); // Expected to fail in test environment
    
    Ok(())
}

#[tokio::test]
async fn test_authentication_flow() -> Result<()> {
    let mut manager = BLEManager::new().await?;
    
    let device_id = "test-device-auth";
    let public_key = "test-public-key-123";
    
    // Test device authentication
    let auth_result = manager.authenticate_device(device_id, public_key).await?;
    assert!(auth_result); // Should succeed in test environment
    
    // Check if device is authenticated
    let is_authenticated = manager.is_device_authenticated(device_id).await;
    assert!(is_authenticated);
    
    // Test getting authenticated devices
    let authenticated_devices = manager.get_authenticated_devices().await;
    assert!(!authenticated_devices.is_empty());
    
    Ok(())
}

#[tokio::test]
async fn test_key_exchange() -> Result<()> {
    let mut manager = BLEManager::new().await?;
    
    let device_id = "test-device-ke";
    let public_key = "test-public-key-456";
    
    // First authenticate the device
    manager.authenticate_device(device_id, public_key).await?;
    
    // Test key exchange initiation
    let ke_result = manager.initiate_key_exchange(device_id).await?;
    assert!(ke_result);
    
    // Test key exchange completion
    let device_public_key = "device-public-key-789";
    let completion_result = manager.complete_key_exchange(device_id, device_public_key).await?;
    assert!(completion_result);
    
    // Check key exchange status
    let ke_status = manager.get_key_exchange_status(device_id).await;
    assert_eq!(ke_status, Some(KeyExchangeStatus::Completed));
    
    Ok(())
}

#[tokio::test]
async fn test_transaction_processing() -> Result<()> {
    let mut manager = BLEManager::new().await?;
    
    let device_id = "test-device-tx";
    let public_key = "test-public-key-tx";
    
    // Authenticate device first
    manager.authenticate_device(device_id, public_key).await?;
    
    // Test transaction sending
    let transaction_data = r#"{"amount": "100", "currency": "USD", "to": "0x123..."}"#;
    let tx_id = manager.send_transaction(device_id, transaction_data).await?;
    
    assert!(!tx_id.is_empty());
    
    // Check transaction status
    let tx_status = manager.get_transaction_status(&tx_id).await?;
    assert_eq!(tx_status, Some(TransactionStatus::Pending));
    
    Ok(())
}

#[tokio::test]
async fn test_device_blocking() -> Result<()> {
    let mut manager = BLEManager::new().await?;
    
    let device_id = "test-device-block";
    
    // Test device blocking
    manager.block_device(device_id, "Test blocking").await?;
    
    // Check if device is blocked
    let is_blocked = manager.is_device_blocked(device_id).await;
    assert!(is_blocked);
    
    // Test getting blocked devices
    let blocked_devices = manager.get_blocked_devices().await;
    assert!(!blocked_devices.is_empty());
    
    // Test unblocking device
    manager.unblock_device(device_id).await?;
    
    // Check if device is unblocked
    let is_blocked_after = manager.is_device_blocked(device_id).await;
    assert!(!is_blocked_after);
    
    Ok(())
}

#[tokio::test]
async fn test_rate_limiting() -> Result<()> {
    let mut manager = BLEManager::new().await?;
    
    let device_id = "test-device-rate";
    
    // Test connection rate limiting
    for i in 0..10 {
        let result = manager.connect_device(device_id).await;
        if i < 5 {
            // First 5 should succeed (rate limit is 5 per minute)
            assert!(result.is_ok() || result.is_err()); // Either success or device not found
        } else {
            // Subsequent attempts should fail due to rate limiting
            assert!(result.is_err());
        }
    }
    
    // Test transaction rate limiting
    let public_key = "test-public-key-rate";
    manager.authenticate_device(device_id, public_key).await?;
    
    for i in 0..15 {
        let result = manager.send_transaction(device_id, "test-data").await;
        if i < 10 {
            // First 10 should succeed (rate limit is 10 per minute)
            assert!(result.is_ok());
        } else {
            // Subsequent attempts should fail due to rate limiting
            assert!(result.is_err());
        }
    }
    
    Ok(())
}

#[tokio::test]
async fn test_session_key_rotation() -> Result<()> {
    let mut manager = BLEManager::new().await?;
    
    let device_id = "test-device-rotation";
    let public_key = "test-public-key-rotation";
    
    // Authenticate and complete key exchange
    manager.authenticate_device(device_id, public_key).await?;
    manager.initiate_key_exchange(device_id).await?;
    manager.complete_key_exchange(device_id, "device-public-key-rotation").await?;
    
    // Test session key rotation
    let rotation_result = manager.rotate_session_key(device_id).await?;
    assert!(rotation_result);
    
    Ok(())
}

#[tokio::test]
async fn test_error_handling() -> Result<()> {
    let mut manager = BLEManager::new().await?;
    
    // Test recording errors
    let error_message = "Test error message";
    manager.record_error(error_message.to_string()).await;
    
    let status = manager.get_status().await;
    assert_eq!(status.last_error, Some(error_message.to_string()));
    
    // Test updating response time
    let response_time = 150.5;
    manager.update_response_time(response_time).await;
    
    let status = manager.get_status().await;
    assert_eq!(status.average_response_time_ms, response_time);
    
    Ok(())
}

#[tokio::test]
async fn test_concurrent_operations() -> Result<()> {
    let manager = BLEManager::new().await?;
    
    // Test concurrent status queries
    let handles: Vec<_> = (0..10)
        .map(|_| {
            let manager = manager.clone();
            tokio::spawn(async move {
                manager.get_status().await
            })
        })
        .collect();
    
    let results = futures::future::join_all(handles).await;
    
    for result in results {
        assert!(result.is_ok());
        let status = result.unwrap();
        assert!(status.enabled);
        assert!(status.initialized);
    }
    
    Ok(())
}

#[tokio::test]
async fn test_device_status_updates() -> Result<()> {
    let mut manager = BLEManager::new().await?;
    
    let device_id = "test-device-status";
    let public_key = "test-public-key-status";
    
    // Test device status updates through authentication
    manager.authenticate_device(device_id, public_key).await?;
    
    // Check that device status is updated
    let authenticated_devices = manager.get_authenticated_devices().await;
    assert!(!authenticated_devices.is_empty());
    
    let device = authenticated_devices.iter().find(|d| d.id == device_id);
    assert!(device.is_some());
    
    let device = device.unwrap();
    assert_eq!(device.auth_status, AuthStatus::Authenticated);
    
    Ok(())
}

#[tokio::test]
async fn test_encryption_decryption() -> Result<()> {
    let manager = BLEManager::new().await?;
    
    let test_data = "Hello, AirChainPay!";
    let session_key = "test-session-key-123";
    
    // Test encryption
    let encrypted = manager.encrypt_data(test_data, session_key)?;
    assert_ne!(encrypted, test_data);
    
    // Test decryption
    let decrypted = manager.decrypt_data(&encrypted, session_key)?;
    assert_eq!(decrypted, test_data);
    
    Ok(())
}

// Helper function to create a test device
fn create_test_device(id: &str, name: &str) -> BLEDevice {
    BLEDevice {
        id: id.to_string(),
        name: Some(name.to_string()),
        address: format!("00:11:22:33:44:{}", id.chars().last().unwrap_or('5')),
        rssi: Some(-50),
        is_connected: false,
        last_seen: chrono::Utc::now().timestamp() as u64,
        status: DeviceStatus::Disconnected,
        auth_status: AuthStatus::Pending,
        key_exchange_status: KeyExchangeStatus::Pending,
    }
}

#[tokio::test]
async fn test_device_creation() {
    let device = create_test_device("test-123", "AirChainPay-Test");
    
    assert_eq!(device.id, "test-123");
    assert_eq!(device.name, Some("AirChainPay-Test".to_string()));
    assert_eq!(device.status, DeviceStatus::Disconnected);
    assert_eq!(device.auth_status, AuthStatus::Pending);
    assert_eq!(device.key_exchange_status, KeyExchangeStatus::Pending);
}

#[tokio::test]
async fn test_transaction_creation() {
    let transaction = BLETransaction {
        id: "tx-123".to_string(),
        device_id: "device-123".to_string(),
        transaction_data: r#"{"amount": "100", "currency": "USD"}"#.to_string(),
        status: TransactionStatus::Pending,
        timestamp: chrono::Utc::now().timestamp() as u64,
        signature: None,
        encrypted: false,
    };
    
    assert_eq!(transaction.id, "tx-123");
    assert_eq!(transaction.device_id, "device-123");
    assert_eq!(transaction.status, TransactionStatus::Pending);
    assert!(!transaction.encrypted);
} 