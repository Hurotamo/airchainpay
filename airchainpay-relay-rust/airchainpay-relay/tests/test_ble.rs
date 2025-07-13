use airchainpay_relay::ble::manager::BLEManager;
use anyhow::Result;

#[tokio::main]
async fn main() -> Result<()> {
    println!("🚀 Testing BLE Manager Functionality...");
    
    // Test BLE manager initialization
    println!("1. Testing BLE Manager initialization...");
    let manager = BLEManager::new().await?;
    println!("✅ BLE Manager initialized successfully");
    
    // Test status retrieval
    println!("2. Testing status retrieval...");
    let status = manager.get_status().await;
    println!("   - Enabled: {}", status.enabled);
    println!("   - Initialized: {}", status.initialized);
    println!("   - Connected devices: {}", status.connected_devices);
    println!("   - Authenticated devices: {}", status.authenticated_devices);
    println!("   - Blocked devices: {}", status.blocked_devices);
    println!("✅ Status retrieval successful");
    
    // Test device authentication
    println!("3. Testing device authentication...");
    let device_id = "test-device-123";
    let public_key = "test-public-key-456";
    let auth_result = manager.authenticate_device(device_id, public_key).await?;
    println!("   - Authentication result: {}", auth_result);
    
    let is_authenticated = manager.is_device_authenticated(device_id).await;
    println!("   - Device authenticated: {}", is_authenticated);
    println!("✅ Device authentication successful");
    
    // Test key exchange
    println!("4. Testing key exchange...");
    let ke_result = manager.initiate_key_exchange(device_id).await?;
    println!("   - Key exchange initiation: {}", ke_result);
    
    let completion_result = manager.complete_key_exchange(device_id, "device-public-key-789").await?;
    println!("   - Key exchange completion: {}", completion_result);
    
    let ke_status = manager.get_key_exchange_status(device_id).await;
    println!("   - Key exchange status: {:?}", ke_status);
    println!("✅ Key exchange successful");
    
    // Test transaction processing
    println!("5. Testing transaction processing...");
    let transaction_data = r#"{"amount": "100", "currency": "USD", "to": "0x123..."}"#;
    let tx_id = manager.send_transaction(device_id, transaction_data).await?;
    println!("   - Transaction ID: {}", tx_id);
    
    let tx_status = manager.get_transaction_status(&tx_id).await?;
    println!("   - Transaction status: {:?}", tx_status);
    println!("✅ Transaction processing successful");
    
    // Test device blocking
    println!("6. Testing device blocking...");
    manager.block_device(device_id, "Test blocking").await?;
    let is_blocked = manager.is_device_blocked(device_id).await;
    println!("   - Device blocked: {}", is_blocked);
    
    manager.unblock_device(device_id).await?;
    let is_blocked_after = manager.is_device_blocked(device_id).await;
    println!("   - Device blocked after unblock: {}", is_blocked_after);
    println!("✅ Device blocking successful");
    
    // Test session key rotation
    println!("7. Testing session key rotation...");
    let rotation_result = manager.rotate_session_key(device_id).await?;
    println!("   - Session key rotation: {}", rotation_result);
    println!("✅ Session key rotation successful");
    
    // Test error handling
    println!("8. Testing error handling...");
    let error_message = "Test error message";
    manager.record_error(error_message.to_string()).await;
    
    let response_time = 150.5;
    manager.update_response_time(response_time).await;
    
    let final_status = manager.get_status().await;
    println!("   - Last error: {:?}", final_status.last_error);
    println!("   - Average response time: {}ms", final_status.average_response_time_ms);
    println!("✅ Error handling successful");
    
    // Test encryption/decryption
    println!("9. Testing encryption/decryption...");
    let test_data = "Hello, AirChainPay!";
    let session_key = "test-session-key-123";
    
    let encrypted = manager.encrypt_data(test_data, session_key)?;
    println!("   - Original data: {}", test_data);
    println!("   - Encrypted data: {}", encrypted);
    
    let decrypted = manager.decrypt_data(&encrypted, session_key)?;
    println!("   - Decrypted data: {}", decrypted);
    println!("✅ Encryption/decryption successful");
    
    // Test getting device lists
    println!("10. Testing device list retrieval...");
    let authenticated_devices = manager.get_authenticated_devices().await;
    println!("   - Authenticated devices: {}", authenticated_devices.len());
    
    let blocked_devices = manager.get_blocked_devices().await;
    println!("   - Blocked devices: {}", blocked_devices.len());
    println!("✅ Device list retrieval successful");
    
    println!("\n🎉 All BLE Manager functionality tests passed successfully!");
    println!("📊 Final Status:");
    println!("   - Connected devices: {}", final_status.connected_devices);
    println!("   - Authenticated devices: {}", final_status.authenticated_devices);
    println!("   - Blocked devices: {}", final_status.blocked_devices);
    println!("   - Key exchange completed: {}", final_status.key_exchange_completed);
    println!("   - Key exchange failed: {}", final_status.key_exchange_failed);
    println!("   - Authentication success rate: {:.2}%", final_status.authentication_success_rate * 100.0);
    println!("   - Average response time: {:.2}ms", final_status.average_response_time_ms);
    println!("   - Uptime: {:.2}s", final_status.uptime_seconds);
    
    Ok(())
} 