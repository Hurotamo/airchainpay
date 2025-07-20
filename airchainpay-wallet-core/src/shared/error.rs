//! Error types and error handling
//! 
//! This module contains all error types used throughout the wallet core,
//! including custom error types and error conversion implementations.

use thiserror::Error;
use std::fmt;

/// Main error type for the wallet core
#[derive(Error, Debug, Clone)]
pub enum WalletError {
    /// Configuration errors
    #[error("Configuration error: {0}")]
    Configuration(String),

    /// Authentication errors
    #[error("Authentication error: {0}")]
    Authentication(String),

    /// Authorization errors
    #[error("Authorization error: {0}")]
    Authorization(String),

    /// Cryptographic errors
    #[error("Cryptographic error: {0}")]
    Crypto(String),

    /// Storage errors
    #[error("Storage error: {0}")]
    Storage(String),

    /// Network errors
    #[error("Network error: {0}")]
    Network(String),

    /// Transaction errors
    #[error("Transaction error: {0}")]
    Transaction(String),

    /// BLE errors
    #[error("BLE error: {0}")]
    BLE(String),

    /// Wallet not found errors
    #[error("Wallet not found: {0}")]
    WalletNotFound(String),

    /// Transaction not found errors
    #[error("Transaction not found: {0}")]
    TransactionNotFound(String),

    /// Invalid address errors
    #[error("Invalid address: {0}")]
    InvalidAddress(String),

    /// Invalid public key errors
    #[error("Invalid public key: {0}")]
    InvalidPublicKey(String),

    /// Invalid private key errors
    #[error("Invalid private key: {0}")]
    InvalidPrivateKey(String),

    /// Invalid seed phrase errors
    #[error("Invalid seed phrase: {0}")]
    InvalidSeedPhrase(String),

    /// Serialization errors
    #[error("Serialization error: {0}")]
    Serialization(String),

    /// Deserialization errors
    #[error("Deserialization error: {0}")]
    Deserialization(String),

    /// Validation errors
    #[error("Validation error: {0}")]
    Validation(String),

    /// Rate limiting errors
    #[error("Rate limiting error: {0}")]
    RateLimit(String),

    /// Timeout errors
    #[error("Timeout error: {0}")]
    Timeout(String),

    /// Insufficient funds errors
    #[error("Insufficient funds: {0}")]
    InsufficientFunds(String),

    /// Gas estimation errors
    #[error("Gas estimation error: {0}")]
    GasEstimation(String),

    /// Platform-specific errors
    #[error("Platform error: {0}")]
    Platform(String),

    /// Hardware wallet errors
    #[error("Hardware wallet error: {0}")]
    HardwareWallet(String),

    /// Backup errors
    #[error("Backup error: {0}")]
    Backup(String),

    /// Restore errors
    #[error("Restore error: {0}")]
    Restore(String),

    /// Security errors
    #[error("Security error: {0}")]
    Security(String),

    /// Performance errors
    #[error("Performance error: {0}")]
    Performance(String),

    /// Internal errors
    #[error("Internal error: {0}")]
    Internal(String),

    /// External service errors
    #[error("External service error: {0}")]
    ExternalService(String),

    /// Database errors
    #[error("Database error: {0}")]
    Database(String),

    /// File system errors
    #[error("File system error: {0}")]
    FileSystem(String),

    /// Memory errors
    #[error("Memory error: {0}")]
    Memory(String),

    /// Threading errors
    #[error("Threading error: {0}")]
    Threading(String),

    /// Async errors
    #[error("Async error: {0}")]
    Async(String),

    /// FFI errors
    #[error("FFI error: {0}")]
    FFI(String),

    /// WASM errors
    #[error("WASM error: {0}")]
    WASM(String),

    /// Unknown errors
    #[error("Unknown error: {0}")]
    Unknown(String),
}

impl WalletError {
    /// Create a configuration error
    pub fn config(message: impl Into<String>) -> Self {
        Self::Configuration(message.into())
    }

    /// Create an authentication error
    pub fn auth(message: impl Into<String>) -> Self {
        Self::Authentication(message.into())
    }

    /// Create a crypto error
    pub fn crypto(message: impl Into<String>) -> Self {
        Self::Crypto(message.into())
    }

    /// Create a storage error
    pub fn storage(message: impl Into<String>) -> Self {
        Self::Storage(message.into())
    }

    /// Create a network error
    pub fn network(message: impl Into<String>) -> Self {
        Self::Network(message.into())
    }

    /// Create a transaction error
    pub fn transaction(message: impl Into<String>) -> Self {
        Self::Transaction(message.into())
    }

    /// Create a BLE error
    pub fn ble(message: impl Into<String>) -> Self {
        Self::BLE(message.into())
    }

    /// Create a wallet not found error
    pub fn wallet_not_found(wallet_id: impl Into<String>) -> Self {
        Self::WalletNotFound(format!("Wallet {} not found", wallet_id.into()))
    }

    /// Create a transaction not found error
    pub fn transaction_not_found(transaction_id: impl Into<String>) -> Self {
        Self::TransactionNotFound(format!("Transaction {} not found", transaction_id.into()))
    }

    /// Create an invalid address error
    pub fn invalid_address(address: impl Into<String>) -> Self {
        Self::InvalidAddress(format!("Invalid address: {}", address.into()))
    }

    /// Create an invalid public key error
    pub fn invalid_public_key(key: impl Into<String>) -> Self {
        Self::InvalidPublicKey(format!("Invalid public key: {}", key.into()))
    }

    /// Create an invalid private key error
    pub fn invalid_private_key(key: impl Into<String>) -> Self {
        Self::InvalidPrivateKey(format!("Invalid private key: {}", key.into()))
    }

    /// Create an invalid seed phrase error
    pub fn invalid_seed_phrase(phrase: impl Into<String>) -> Self {
        Self::InvalidSeedPhrase(format!("Invalid seed phrase: {}", phrase.into()))
    }

    /// Create a serialization error
    pub fn serialization(message: impl Into<String>) -> Self {
        Self::Serialization(message.into())
    }

    /// Create a validation error
    pub fn validation(message: impl Into<String>) -> Self {
        Self::Validation(message.into())
    }

    /// Create a rate limit error
    pub fn rate_limit(message: impl Into<String>) -> Self {
        Self::RateLimit(message.into())
    }

    /// Create a timeout error
    pub fn timeout(message: impl Into<String>) -> Self {
        Self::Timeout(message.into())
    }

    /// Create an insufficient funds error
    pub fn insufficient_funds(amount: impl Into<String>) -> Self {
        Self::InsufficientFunds(format!("Insufficient funds: {}", amount.into()))
    }

    /// Create a gas estimation error
    pub fn gas_estimation(message: impl Into<String>) -> Self {
        Self::GasEstimation(message.into())
    }

    /// Create a platform error
    pub fn platform(message: impl Into<String>) -> Self {
        Self::Platform(message.into())
    }

    /// Create a hardware wallet error
    pub fn hardware_wallet(message: impl Into<String>) -> Self {
        Self::HardwareWallet(message.into())
    }

    /// Create a backup error
    pub fn backup(message: impl Into<String>) -> Self {
        Self::Backup(message.into())
    }

    /// Create a restore error
    pub fn restore(message: impl Into<String>) -> Self {
        Self::Restore(message.into())
    }

    /// Create a security error
    pub fn security(message: impl Into<String>) -> Self {
        Self::Security(message.into())
    }

    /// Create a performance error
    pub fn performance(message: impl Into<String>) -> Self {
        Self::Performance(message.into())
    }

    /// Create an internal error
    pub fn internal(message: impl Into<String>) -> Self {
        Self::Internal(message.into())
    }

    /// Create an external service error
    pub fn external_service(message: impl Into<String>) -> Self {
        Self::ExternalService(message.into())
    }

    /// Create a database error
    pub fn database(message: impl Into<String>) -> Self {
        Self::Database(message.into())
    }

    /// Create a file system error
    pub fn file_system(message: impl Into<String>) -> Self {
        Self::FileSystem(message.into())
    }

    /// Create a memory error
    pub fn memory(message: impl Into<String>) -> Self {
        Self::Memory(message.into())
    }

    /// Create a threading error
    pub fn threading(message: impl Into<String>) -> Self {
        Self::Threading(message.into())
    }

    /// Create an async error
    pub fn async_error(message: impl Into<String>) -> Self {
        Self::Async(message.into())
    }

    /// Create an FFI error
    pub fn ffi(message: impl Into<String>) -> Self {
        Self::FFI(message.into())
    }

    /// Create a WASM error
    pub fn wasm(message: impl Into<String>) -> Self {
        Self::WASM(message.into())
    }

    /// Create an unknown error
    pub fn unknown(message: impl Into<String>) -> Self {
        Self::Unknown(message.into())
    }

    /// Get the error code
    pub fn code(&self) -> &'static str {
        match self {
            Self::Configuration(_) => "CONFIG_ERROR",
            Self::Authentication(_) => "AUTH_ERROR",
            Self::Authorization(_) => "AUTHORIZATION_ERROR",
            Self::Crypto(_) => "CRYPTO_ERROR",
            Self::Storage(_) => "STORAGE_ERROR",
            Self::Network(_) => "NETWORK_ERROR",
            Self::Transaction(_) => "TRANSACTION_ERROR",
            Self::BLE(_) => "BLE_ERROR",
            Self::WalletNotFound(_) => "WALLET_NOT_FOUND",
            Self::TransactionNotFound(_) => "TRANSACTION_NOT_FOUND",
            Self::InvalidAddress(_) => "INVALID_ADDRESS",
            Self::InvalidPublicKey(_) => "INVALID_PUBLIC_KEY",
            Self::InvalidPrivateKey(_) => "INVALID_PRIVATE_KEY",
            Self::InvalidSeedPhrase(_) => "INVALID_SEED_PHRASE",
            Self::Serialization(_) => "SERIALIZATION_ERROR",
            Self::Deserialization(_) => "DESERIALIZATION_ERROR",
            Self::Validation(_) => "VALIDATION_ERROR",
            Self::RateLimit(_) => "RATE_LIMIT_ERROR",
            Self::Timeout(_) => "TIMEOUT_ERROR",
            Self::InsufficientFunds(_) => "INSUFFICIENT_FUNDS",
            Self::GasEstimation(_) => "GAS_ESTIMATION_ERROR",
            Self::Platform(_) => "PLATFORM_ERROR",
            Self::HardwareWallet(_) => "HARDWARE_WALLET_ERROR",
            Self::Backup(_) => "BACKUP_ERROR",
            Self::Restore(_) => "RESTORE_ERROR",
            Self::Security(_) => "SECURITY_ERROR",
            Self::Performance(_) => "PERFORMANCE_ERROR",
            Self::Internal(_) => "INTERNAL_ERROR",
            Self::ExternalService(_) => "EXTERNAL_SERVICE_ERROR",
            Self::Database(_) => "DATABASE_ERROR",
            Self::FileSystem(_) => "FILE_SYSTEM_ERROR",
            Self::Memory(_) => "MEMORY_ERROR",
            Self::Threading(_) => "THREADING_ERROR",
            Self::Async(_) => "ASYNC_ERROR",
            Self::FFI(_) => "FFI_ERROR",
            Self::WASM(_) => "WASM_ERROR",
            Self::Unknown(_) => "UNKNOWN_ERROR",
        }
    }

    /// Get the error severity
    pub fn severity(&self) -> ErrorSeverity {
        match self {
            Self::Configuration(_) => ErrorSeverity::Medium,
            Self::Authentication(_) => ErrorSeverity::High,
            Self::Authorization(_) => ErrorSeverity::High,
            Self::Crypto(_) => ErrorSeverity::Critical,
            Self::Storage(_) => ErrorSeverity::High,
            Self::Network(_) => ErrorSeverity::Medium,
            Self::Transaction(_) => ErrorSeverity::Medium,
            Self::BLE(_) => ErrorSeverity::Medium,
            Self::WalletNotFound(_) => ErrorSeverity::Medium,
            Self::TransactionNotFound(_) => ErrorSeverity::Low,
            Self::InvalidAddress(_) => ErrorSeverity::Medium,
            Self::InvalidPublicKey(_) => ErrorSeverity::High,
            Self::InvalidPrivateKey(_) => ErrorSeverity::Critical,
            Self::InvalidSeedPhrase(_) => ErrorSeverity::High,
            Self::Serialization(_) => ErrorSeverity::Medium,
            Self::Deserialization(_) => ErrorSeverity::Medium,
            Self::Validation(_) => ErrorSeverity::Medium,
            Self::RateLimit(_) => ErrorSeverity::Low,
            Self::Timeout(_) => ErrorSeverity::Medium,
            Self::InsufficientFunds(_) => ErrorSeverity::Medium,
            Self::GasEstimation(_) => ErrorSeverity::Medium,
            Self::Platform(_) => ErrorSeverity::Medium,
            Self::HardwareWallet(_) => ErrorSeverity::High,
            Self::Backup(_) => ErrorSeverity::High,
            Self::Restore(_) => ErrorSeverity::High,
            Self::Security(_) => ErrorSeverity::Critical,
            Self::Performance(_) => ErrorSeverity::Low,
            Self::Internal(_) => ErrorSeverity::Critical,
            Self::ExternalService(_) => ErrorSeverity::Medium,
            Self::Database(_) => ErrorSeverity::High,
            Self::FileSystem(_) => ErrorSeverity::Medium,
            Self::Memory(_) => ErrorSeverity::Critical,
            Self::Threading(_) => ErrorSeverity::High,
            Self::Async(_) => ErrorSeverity::Medium,
            Self::FFI(_) => ErrorSeverity::High,
            Self::WASM(_) => ErrorSeverity::High,
            Self::Unknown(_) => ErrorSeverity::Medium,
        }
    }

    /// Check if the error is recoverable
    pub fn is_recoverable(&self) -> bool {
        match self.severity() {
            ErrorSeverity::Low | ErrorSeverity::Medium => true,
            ErrorSeverity::High | ErrorSeverity::Critical => false,
        }
    }

    /// Check if the error is security-related
    pub fn is_security_related(&self) -> bool {
        matches!(
            self,
            Self::Authentication(_)
                | Self::Authorization(_)
                | Self::Crypto(_)
                | Self::InvalidPrivateKey(_)
                | Self::InvalidSeedPhrase(_)
                | Self::Security(_)
                | Self::HardwareWallet(_)
        )
    }
}

/// Error severity levels
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorSeverity {
    Low,
    Medium,
    High,
    Critical,
}

impl fmt::Display for ErrorSeverity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Low => write!(f, "LOW"),
            Self::Medium => write!(f, "MEDIUM"),
            Self::High => write!(f, "HIGH"),
            Self::Critical => write!(f, "CRITICAL"),
        }
    }
}

/// Error context for additional information
#[derive(Debug, Clone)]
pub struct ErrorContext {
    pub error: WalletError,
    pub operation: String,
    pub timestamp: u64,
    pub user_id: Option<String>,
    pub wallet_id: Option<String>,
    pub transaction_id: Option<String>,
    pub stack_trace: Option<String>,
}

impl ErrorContext {
    /// Create a new error context
    pub fn new(error: WalletError, operation: impl Into<String>) -> Self {
        Self {
            error,
            operation: operation.into(),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            user_id: None,
            wallet_id: None,
            transaction_id: None,
            stack_trace: None,
        }
    }

    /// Set user ID
    pub fn with_user_id(mut self, user_id: impl Into<String>) -> Self {
        self.user_id = Some(user_id.into());
        self
    }

    /// Set wallet ID
    pub fn with_wallet_id(mut self, wallet_id: impl Into<String>) -> Self {
        self.wallet_id = Some(wallet_id.into());
        self
    }

    /// Set transaction ID
    pub fn with_transaction_id(mut self, transaction_id: impl Into<String>) -> Self {
        self.transaction_id = Some(transaction_id.into());
        self
    }

    /// Set stack trace
    pub fn with_stack_trace(mut self, stack_trace: impl Into<String>) -> Self {
        self.stack_trace = Some(stack_trace.into());
        self
    }
}

impl fmt::Display for ErrorContext {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Error: {} (Code: {}, Severity: {}) in operation: {}",
            self.error,
            self.error.code(),
            self.error.severity(),
            self.operation
        )?;

        if let Some(user_id) = &self.user_id {
            write!(f, ", User: {}", user_id)?;
        }

        if let Some(wallet_id) = &self.wallet_id {
            write!(f, ", Wallet: {}", wallet_id)?;
        }

        if let Some(transaction_id) = &self.transaction_id {
            write!(f, ", Transaction: {}", transaction_id)?;
        }

        Ok(())
    }
}

// Error conversion implementations
impl From<std::io::Error> for WalletError {
    fn from(err: std::io::Error) -> Self {
        Self::FileSystem(format!("IO error: {}", err))
    }
}

impl From<serde_json::Error> for WalletError {
    fn from(err: serde_json::Error) -> Self {
        Self::Serialization(format!("JSON error: {}", err))
    }
}

impl From<hex::FromHexError> for WalletError {
    fn from(err: hex::FromHexError) -> Self {
        Self::Validation(format!("Hex decoding error: {}", err))
    }
}

impl From<base64::DecodeError> for WalletError {
    fn from(err: base64::DecodeError) -> Self {
        Self::Validation(format!("Base64 decoding error: {}", err))
    }
}

impl From<reqwest::Error> for WalletError {
    fn from(err: reqwest::Error) -> Self {
        Self::Network(format!("HTTP error: {}", err))
    }
}

impl From<tokio::time::error::Elapsed> for WalletError {
    fn from(_: tokio::time::error::Elapsed) -> Self {
        Self::Timeout("Operation timed out".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_creation() {
        let error = WalletError::config("Test config error");
        assert_eq!(error.code(), "CONFIG_ERROR");
        assert_eq!(error.severity(), ErrorSeverity::Medium);
        assert!(error.is_recoverable());
        assert!(!error.is_security_related());
    }

    #[test]
    fn test_security_error() {
        let error = WalletError::crypto("Test crypto error");
        assert_eq!(error.code(), "CRYPTO_ERROR");
        assert_eq!(error.severity(), ErrorSeverity::Critical);
        assert!(!error.is_recoverable());
        assert!(error.is_security_related());
    }

    #[test]
    fn test_error_context() {
        let error = WalletError::wallet_not_found("test_wallet");
        let context = ErrorContext::new(error, "test_operation")
            .with_user_id("test_user")
            .with_wallet_id("test_wallet");

        assert_eq!(context.operation, "test_operation");
        assert_eq!(context.user_id, Some("test_user".to_string()));
        assert_eq!(context.wallet_id, Some("test_wallet".to_string()));
    }

    #[test]
    fn test_error_conversion() {
        let io_error = std::io::Error::new(std::io::ErrorKind::NotFound, "File not found");
        let wallet_error: WalletError = io_error.into();
        
        assert_eq!(wallet_error.code(), "FILE_SYSTEM_ERROR");
        assert_eq!(wallet_error.severity(), ErrorSeverity::Medium);
    }
} 