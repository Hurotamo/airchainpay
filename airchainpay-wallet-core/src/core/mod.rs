//! Core domain logic and business rules
//! 
//! This module contains the core business logic for the wallet system.
//! It implements the domain rules and orchestrates the various components.

pub mod crypto;
pub mod wallet;
pub mod storage;
pub mod transactions;
pub mod ble;

// Re-export core components
pub use crypto::CryptoManager;
pub use wallet::WalletManager;
pub use storage::SecureStorage;
pub use transactions::TransactionManager;
pub use ble::BLESecurityManager;

// Core initialization
pub fn init() -> Result<(), Box<dyn std::error::Error>> {
    crypto::init()?;
    storage::init()?;
    transactions::init()?;
    ble::init()?;
    Ok(())
} 