//! Core wallet functionality
//! 
//! This module contains the core wallet functionality including
//! wallet management, cryptography, storage, transactions, and BLE.

pub mod wallet;
pub mod crypto;
pub mod storage;
pub mod transactions;
pub mod ble;

/// Initialize core modules
pub async fn init() -> Result<(), crate::shared::error::WalletError> {
    log::info!("Initializing core modules");
    
    // Initialize storage module
    storage::init().await?;
    
    // Initialize transactions module
    transactions::init().await?;
    
    // Initialize BLE module
    ble::init().await?;
    
    log::info!("Core modules initialized successfully");
    Ok(())
}

/// Cleanup core modules
pub async fn cleanup() -> Result<(), crate::shared::error::WalletError> {
    log::info!("Cleaning up core modules");
    
    // Cleanup storage module
    storage::cleanup().await?;
    
    // Cleanup transactions module
    transactions::cleanup().await?;
    
    // Cleanup BLE module
    ble::cleanup().await?;
    
    log::info!("Core modules cleaned up successfully");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_core_init() {
        let result = init().await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_core_cleanup() {
        let result = cleanup().await;
        assert!(result.is_ok());
    }
} 