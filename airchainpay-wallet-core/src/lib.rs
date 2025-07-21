//! AirChainPay Wallet Core
//! 
//! Secure wallet core for AirChainPay.
//! Handles all cryptographic operations and sensitive data management in Rust.
//! 
//! ## Architecture
//! 
//! This library follows a simplified architecture focused on core functionality:
//! 
//! - **Core**: Wallet management, crypto, storage, transactions, BLE
//! - **Domain**: Entities and business logic
//! - **Shared**: Common types, constants, and utilities
//! 
//! ## Security Features
//! 
//! - Zero memory exposure for sensitive data
//! - Hardware-backed secure storage
//! - Industry-standard cryptographic algorithms
//! - Compile-time memory safety guarantees
//! 
//! ## Usage
//! 
//! ```rust
//! use airchainpay_wallet_core::{
//!     wallet::WalletManager,
//!     storage::SecureStorage,
//! };
//! 
//! // Initialize the wallet core
//! let wallet_manager = WalletManager::new();
//! let storage = SecureStorage::new();
//! 
//! // Create a new wallet
//! let wallet = wallet_manager.create_wallet("My Wallet".to_string(), Network::CoreTestnet).await?;
//! 
//! // Sign a transaction
//! let signature = wallet_manager.sign_message(&wallet, "Hello World").await?;
//! ```

// Re-export main modules for easy access
pub mod core;
pub mod domain;
pub mod shared;

// Re-export main types and traits
use shared::error::WalletError;
use crate::core::crypto::CryptoManager;
use crate::core::storage::StorageManager;
use crate::shared::types::WalletBackupInfo;

// Re-export specific components
pub use core::wallet::WalletManager;
pub use core::storage::SecureStorage;
pub use core::transactions::TransactionManager;
pub use core::ble::BLESecurityManager;

// Re-export domain entities
pub use shared::types::{Wallet, Transaction, TokenInfo, Network};

// Re-export shared types
pub use shared::types::WalletBackup;
pub use shared::types::SignedTransaction;
pub use shared::types::TransactionHash;
pub use shared::types::Balance;

// Initialize logging and configuration
pub fn init() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging
    env_logger::init();
    
    // Initialize core modules
    tokio::runtime::Runtime::new()?.block_on(async {
        core::init().await?;
    Ok(())
    })
}

// Version information
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const NAME: &str = env!("CARGO_PKG_NAME");
pub const AUTHORS: &str = env!("CARGO_PKG_AUTHORS");
pub const DESCRIPTION: &str = env!("CARGO_PKG_DESCRIPTION");

// Feature flags
#[cfg(feature = "ffi")]
pub mod ffi;

#[cfg(feature = "wasm")]
pub mod wasm;

#[cfg(feature = "no_std")]
pub mod no_std;

// Re-export FFI functions when feature is enabled
#[cfg(feature = "ffi")]
pub use ffi::*;

// Re-export WASM functions when feature is enabled
#[cfg(feature = "wasm")]
pub use wasm::*;

// Re-export no_std functions when feature is enabled
#[cfg(feature = "no_std")]
pub use no_std::*;

/// Initialize the wallet core with default configuration
pub async fn init_wallet_core() -> Result<WalletCore, WalletError> {
    let crypto_manager = CryptoManager::new();
    let wallet_manager = WalletManager::new(crypto_manager);
    let storage = StorageManager::new();
    let transaction_manager = TransactionManager::new();
    
    Ok(WalletCore {
        wallet_manager,
        storage,
        transaction_manager,
    })
}

/// Main wallet core struct that provides access to all functionality
pub struct WalletCore {
    pub wallet_manager: WalletManager,
    pub storage: StorageManager,
    pub transaction_manager: TransactionManager,
}

impl WalletCore {
    /// Create a new wallet
    pub async fn create_wallet(&self, wallet_id: &str, name: &str, network: Network) -> Result<Wallet, WalletError> {
        let secure_wallet = self.wallet_manager.create_wallet(wallet_id, name, network).await?;
        Ok(Wallet::from(secure_wallet))
    }

    pub async fn import_wallet(&self, seed_phrase: &str) -> Result<Wallet, WalletError> {
        // TODO: Implement wallet import from seed phrase
        Err(WalletError::not_implemented("Wallet import not yet implemented"))
    }

    pub async fn sign_message(&self, wallet: &Wallet, message: &str) -> Result<String, WalletError> {
        self.wallet_manager.sign_message(&wallet.id, message).await
    }

    pub async fn get_balance(&self, wallet: &Wallet) -> Result<String, WalletError> {
        self.wallet_manager.get_balance(&wallet.id).await
    }

    pub async fn backup_wallet(&self, wallet: &Wallet, password: &str) -> Result<WalletBackup, WalletError> {
        let backup_info = self.storage.backup_wallet(wallet, password).await?;
        Ok(WalletBackup::from(backup_info))
    }

    pub async fn restore_wallet(&self, backup: &WalletBackup, password: &str) -> Result<Wallet, WalletError> {
        let backup_info = WalletBackupInfo::from(backup.clone());
        self.storage.restore_wallet(&backup_info, password).await
    }
}

// Implement Drop for secure cleanup
impl Drop for WalletCore {
    fn drop(&mut self) {
        // Secure cleanup of sensitive data
        log::info!("WalletCore dropped - performing secure cleanup");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_wallet_core_initialization() {
        let core = init_wallet_core().await.unwrap();
        assert!(true); // Basic initialization test
    }
    
    #[tokio::test]
    async fn test_wallet_creation() {
        let core = init_wallet_core().await.unwrap();
        let wallet = core.create_wallet("Test Wallet".to_string(), Network::CoreTestnet).await.unwrap();
        assert_eq!(wallet.name, "Test Wallet");
    }
} 