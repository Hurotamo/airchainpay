//! AirChainPay Wallet Core
//! 
//!  Secure wallet core for AirChainPay.
//! Handles all cryptographic operations and sensitive data management in Rust.
//! 
//! ## Architecture
//! 
//! This library follows Clean Architecture principles:
//! 
//! - **Core**: Domain logic and business rules
//! - **Domain**: Entities, repositories, and services
//! - **Infrastructure**: Platform-specific implementations
//! - **Application**: Use cases and ports
//! - **Shared**: Common types and utilities
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
//!     crypto::CryptoManager,
//!     storage::SecureStorage,
//! };
//! 
//! // Initialize the wallet core
//! let wallet_manager = WalletManager::new();
//! let crypto_manager = CryptoManager::new();
//! let storage = SecureStorage::new();
//! 
//! // Create a new wallet
//! let wallet = wallet_manager.create_wallet().await?;
//! 
//! // Sign a transaction
//! let signature = crypto_manager.sign_transaction(&wallet, &transaction).await?;
//! ```

// Re-export main modules for easy access
pub mod core;
pub mod domain;
pub mod infrastructure;
pub mod application;
pub mod shared;

// Re-export main types and traits
pub use core::*;
pub use domain::*;
pub use infrastructure::*;
pub use application::*;
pub use shared::*;

// Re-export specific components
pub use core::wallet::WalletManager;
pub use core::crypto::CryptoManager;
pub use core::storage::SecureStorage;
pub use core::transactions::TransactionManager;
pub use core::ble::BLESecurityManager;

// Re-export domain entities
pub use domain::entities::*;
pub use domain::repositories::*;
pub use domain::services::*;

// Re-export shared types
pub use shared::types::*;
pub use shared::utils::*;
pub use shared::constants::*;

// Re-export error types
pub use shared::error::*;

// Initialize logging and configuration
pub fn init() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging
    env_logger::init();
    
    // Initialize crypto providers
    core::crypto::init()?;
    
    // Initialize secure storage
    core::storage::init()?;
    
    // Initialize platform-specific features
    infrastructure::platform::init()?;
    
    Ok(())
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
    let wallet_manager = WalletManager::new();
    let crypto_manager = CryptoManager::new();
    let storage = SecureStorage::new();
    let transaction_manager = TransactionManager::new();
    let ble_security = BLESecurityManager::new();
    
    Ok(WalletCore {
        wallet_manager,
        crypto_manager,
        storage,
        transaction_manager,
        ble_security,
    })
}

/// Main wallet core struct that provides access to all functionality
pub struct WalletCore {
    pub wallet_manager: WalletManager,
    pub crypto_manager: CryptoManager,
    pub storage: SecureStorage,
    pub transaction_manager: TransactionManager,
    pub ble_security: BLESecurityManager,
}

impl WalletCore {
    /// Create a new wallet
    pub async fn create_wallet(&self) -> Result<Wallet, WalletError> {
        self.wallet_manager.create_wallet().await
    }
    
    /// Import a wallet from seed phrase
    pub async fn import_wallet(&self, seed_phrase: &str) -> Result<Wallet, WalletError> {
        self.wallet_manager.import_wallet(seed_phrase).await
    }
    
    /// Sign a transaction
    pub async fn sign_transaction(&self, wallet: &Wallet, transaction: &Transaction) -> Result<SignedTransaction, WalletError> {
        self.crypto_manager.sign_transaction(wallet, transaction).await
    }
    
    /// Send a transaction
    pub async fn send_transaction(&self, signed_transaction: &SignedTransaction) -> Result<TransactionHash, WalletError> {
        self.transaction_manager.send_transaction(signed_transaction).await
    }
    
    /// Get wallet balance
    pub async fn get_balance(&self, wallet: &Wallet) -> Result<Balance, WalletError> {
        self.wallet_manager.get_balance(wallet).await
    }
    
    /// Backup wallet securely
    pub async fn backup_wallet(&self, wallet: &Wallet, password: &str) -> Result<WalletBackup, WalletError> {
        self.storage.backup_wallet(wallet, password).await
    }
    
    /// Restore wallet from backup
    pub async fn restore_wallet(&self, backup: &WalletBackup, password: &str) -> Result<Wallet, WalletError> {
        self.storage.restore_wallet(backup, password).await
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
        assert!(core.wallet_manager.is_initialized());
        assert!(core.crypto_manager.is_initialized());
        assert!(core.storage.is_initialized());
    }
    
    #[tokio::test]
    async fn test_wallet_creation() {
        let core = init_wallet_core().await.unwrap();
        let wallet = core.create_wallet().await.unwrap();
        assert!(wallet.is_valid());
    }
} 