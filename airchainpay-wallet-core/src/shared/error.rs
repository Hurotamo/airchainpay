//! Error handling for the wallet core
//! 
//! This module defines the error types used throughout the wallet core.

use thiserror::Error;

/// Wallet error type
#[derive(Error, Debug, Clone)]
pub enum WalletError {
    #[error("Configuration error: {0}")]
    Config(String),
    
    #[error("Cryptographic error: {0}")]
    Crypto(String),
    
    #[error("Validation error: {0}")]
    Validation(String),
    
    #[error("Storage error: {0}")]
    Storage(String),
    
    #[error("Network error: {0}")]
    Network(String),
    
    #[error("Wallet not found: {0}")]
    WalletNotFound(String),
    
    #[error("Wallet already exists: {0}")]
    WalletAlreadyExists(String),
    
    #[error("Transaction error: {0}")]
    Transaction(String),
    
    #[error("BLE error: {0}")]
    Ble(String),
    
    #[error("Internal error: {0}")]
    Internal(String),
    
    #[error("Not implemented: {0}")]
    NotImplemented(String),
}

impl WalletError {
    /// Create a configuration error
    pub fn config(message: impl Into<String>) -> Self {
        Self::Config(message.into())
    }
    
    /// Create a cryptographic error
    pub fn crypto(message: impl Into<String>) -> Self {
        Self::Crypto(message.into())
    }
    
    /// Create a validation error
    pub fn validation(message: impl Into<String>) -> Self {
        Self::Validation(message.into())
    }
    
    /// Create a storage error
    pub fn storage(message: impl Into<String>) -> Self {
        Self::Storage(message.into())
    }
    
    /// Create a network error
    pub fn network(message: impl Into<String>) -> Self {
        Self::Network(message.into())
    }
    
    /// Create a wallet not found error
    pub fn wallet_not_found(message: impl Into<String>) -> Self {
        Self::WalletNotFound(message.into())
    }
    
    /// Create a wallet already exists error
    pub fn wallet_already_exists(message: impl Into<String>) -> Self {
        Self::WalletAlreadyExists(message.into())
    }
    
    /// Create a transaction error
    pub fn transaction(message: impl Into<String>) -> Self {
        Self::Transaction(message.into())
    }
    
    /// Create a BLE error
    pub fn ble(message: impl Into<String>) -> Self {
        Self::Ble(message.into())
    }
    
    /// Create an internal error
    pub fn internal(message: impl Into<String>) -> Self {
        Self::Internal(message.into())
    }

    pub fn not_implemented(message: &str) -> Self {
        Self::NotImplemented(message.to_string())
    }
}

// Standard library error conversions
impl From<std::io::Error> for WalletError {
    fn from(err: std::io::Error) -> Self {
        Self::storage(format!("IO error: {}", err))
    }
}

impl From<hex::FromHexError> for WalletError {
    fn from(err: hex::FromHexError) -> Self {
        Self::validation(format!("Hex decoding error: {}", err))
    }
}

impl From<serde_json::Error> for WalletError {
    fn from(err: serde_json::Error) -> Self {
        Self::storage(format!("JSON error: {}", err))
    }
}

impl From<tokio::task::JoinError> for WalletError {
    fn from(err: tokio::task::JoinError) -> Self {
        Self::internal(format!("Task join error: {}", err))
    }
}

impl From<tokio::sync::AcquireError> for WalletError {
    fn from(err: tokio::sync::AcquireError) -> Self {
        Self::internal(format!("Lock acquire error: {}", err))
    }
}

impl From<tokio::sync::TryLockError> for WalletError {
    fn from(err: tokio::sync::TryLockError) -> Self {
        Self::internal(format!("Lock try error: {}", err))
    }
}

// Cryptographic error conversions
impl From<secp256k1::Error> for WalletError {
    fn from(err: secp256k1::Error) -> Self {
        Self::crypto(format!("Secp256k1 error: {}", err))
    }
}

impl From<sha2::digest::InvalidLength> for WalletError {
    fn from(err: sha2::digest::InvalidLength) -> Self {
        Self::crypto(format!("Hash error: {}", err))
    }
}

impl From<argon2::password_hash::Error> for WalletError {
    fn from(err: argon2::password_hash::Error) -> Self {
        Self::crypto(format!("Password hash error: {}", err))
    }
}

impl From<argon2::Error> for WalletError {
    fn from(err: argon2::Error) -> Self {
        Self::crypto(format!("Argon2 error: {}", err))
    }
}

// Encryption error conversions
impl From<aes_gcm::Error> for WalletError {
    fn from(err: aes_gcm::Error) -> Self {
        Self::crypto(format!("AES-GCM error: {}", err))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wallet_error_creation() {
        let config_error = WalletError::config("Invalid configuration");
        let crypto_error = WalletError::crypto("Encryption failed");
        let validation_error = WalletError::validation("Invalid input");
        
        assert!(matches!(config_error, WalletError::Config(_)));
        assert!(matches!(crypto_error, WalletError::Crypto(_)));
        assert!(matches!(validation_error, WalletError::Validation(_)));
    }

    #[test]
    fn test_error_conversions() {
        let io_error = std::io::Error::new(std::io::ErrorKind::NotFound, "File not found");
        let wallet_error: WalletError = io_error.into();
        
        assert!(matches!(wallet_error, WalletError::Storage(_)));
    }

    #[test]
    fn test_error_display() {
        let error = WalletError::crypto("Test error");
        let display = format!("{}", error);
        
        assert!(display.contains("Cryptographic error"));
        assert!(display.contains("Test error"));
    }
} 