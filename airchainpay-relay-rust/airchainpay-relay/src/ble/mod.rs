use btleplug::api::{Central, Manager as _, Peripheral as _};
use btleplug::platform::Manager;
use std::error::Error;

pub mod manager;
pub use manager::{BLEManager, BLEDevice, BLETransaction, AuthRequest, AuthResponse, DeviceStatus, TransactionStatus};

pub async fn scan_ble_devices() -> Result<(), Box<dyn Error>> {
    let manager = Manager::new().await?;
    let adapters = manager.adapters().await?;
    let central = adapters.into_iter().next().ok_or("No BLE adapter found")?;

    central.start_scan().await?;
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    for peripheral in central.peripherals().await? {
        let properties = peripheral.properties().await?;
        println!("Found device: {:?}", properties);
    }
    Ok(())
} 