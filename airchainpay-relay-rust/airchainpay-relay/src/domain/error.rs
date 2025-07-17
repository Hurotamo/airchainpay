use actix_web::{HttpResponse, ResponseError};
use serde::{Deserialize, Serialize};
use std::fmt;

/// Main error type for the AirChainPay relay
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RelayError {
    // Blockchain errors
    Blockchain(BlockchainError),
    
    // Validation errors
    Validation(ValidationError),
    
    // Storage errors
    Storage(StorageError),
    
    // API errors
    API(APIError),
    
    // Configuration errors
    Config(ConfigError),
    
    // Security errors
    Security(SecurityError),
    
    // Compression errors
    Compression(CompressionError),
    
    // Authentication errors
    Auth(AuthError),
    
    // Monitoring errors
    Monitoring(MonitoringError),
    
    // Recovery errors
    Recovery(RecoveryError),
    
    // Circuit breaker errors
    CircuitBreaker(CircuitBreakerError),
    
    // Generic errors
    Generic(String),
}

impl fmt::Display for RelayError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RelayError::Blockchain(e) => write!(f, "Blockchain error: {e}"),
            RelayError::Validation(e) => write!(f, "Validation error: {e}"),
            RelayError::Storage(e) => write!(f, "Storage error: {e}"),
            RelayError::API(e) => write!(f, "API error: {e}"),
            RelayError::Config(e) => write!(f, "Configuration error: {e}"),
            RelayError::Security(e) => write!(f, "Security error: {e}"),
            RelayError::Compression(e) => write!(f, "Compression error: {e}"),
            RelayError::Auth(e) => write!(f, "Authentication error: {e}"),
            RelayError::Monitoring(e) => write!(f, "Monitoring error: {e}"),
            RelayError::Recovery(e) => write!(f, "Recovery error: {e}"),
            RelayError::CircuitBreaker(e) => write!(f, "Circuit breaker error: {e}"),
            RelayError::Generic(msg) => write!(f, "Error: {msg}"),
        }
    }
}

impl std::error::Error for RelayError {}

impl ResponseError for RelayError {
    fn error_response(&self) -> HttpResponse {
        let (status_code, error_response) = match self {
            RelayError::Blockchain(e) => e.to_http_response(),
            RelayError::Validation(e) => e.to_http_response(),
            RelayError::Storage(e) => e.to_http_response(),
            RelayError::API(e) => e.to_http_response(),
            RelayError::Config(e) => e.to_http_response(),
            RelayError::Security(e) => e.to_http_response(),
            RelayError::Compression(e) => e.to_http_response(),
            RelayError::Auth(e) => e.to_http_response(),
            RelayError::Monitoring(e) => e.to_http_response(),
            RelayError::Recovery(e) => e.to_http_response(),
            RelayError::CircuitBreaker(e) => e.to_http_response(),
            RelayError::Generic(msg) => (
                actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
                serde_json::json!({
                    "error": "Internal server error",
                    "message": msg,
                    "timestamp": chrono::Utc::now().to_rfc3339(),
                })
            ),
        };

        HttpResponse::build(status_code).json(error_response)
    }
}

impl From<anyhow::Error> for RelayError {
    fn from(err: anyhow::Error) -> Self {
        RelayError::Generic(err.to_string())
    }
}

impl From<std::io::Error> for RelayError {
    fn from(err: std::io::Error) -> Self {
        RelayError::Storage(StorageError::IO(err.to_string()))
    }
}

impl From<serde_json::Error> for RelayError {
    fn from(err: serde_json::Error) -> Self {
        RelayError::Validation(ValidationError::InvalidJson(err.to_string()))
    }
}

impl From<hex::FromHexError> for RelayError {
    fn from(err: hex::FromHexError) -> Self {
        RelayError::Validation(ValidationError::InvalidHex(err.to_string()))
    }
}

// Recovery Error Types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RecoveryError {
    RetryExhausted(String),
    FallbackFailed(String),
    CircuitBreakerOpen(String),
    RecoveryTimeout(String),
    PartialRecovery(String),
    DegradedMode(String),
}

impl fmt::Display for RecoveryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RecoveryError::RetryExhausted(msg) => write!(f, "Retry exhausted: {msg}"),
            RecoveryError::FallbackFailed(msg) => write!(f, "Fallback failed: {msg}"),
            RecoveryError::CircuitBreakerOpen(msg) => write!(f, "Circuit breaker open: {msg}"),
            RecoveryError::RecoveryTimeout(msg) => write!(f, "Recovery timeout: {msg}"),
            RecoveryError::PartialRecovery(msg) => write!(f, "Partial recovery: {msg}"),
            RecoveryError::DegradedMode(msg) => write!(f, "Degraded mode: {msg}"),
        }
    }
}

impl RecoveryError {
    pub fn to_http_response(&self) -> (actix_web::http::StatusCode, serde_json::Value) {
        let (status_code, error_type) = match self {
            RecoveryError::RetryExhausted(_) => {
                (actix_web::http::StatusCode::SERVICE_UNAVAILABLE, "RETRY_EXHAUSTED")
            }
            RecoveryError::FallbackFailed(_) => {
                (actix_web::http::StatusCode::SERVICE_UNAVAILABLE, "FALLBACK_FAILED")
            }
            RecoveryError::CircuitBreakerOpen(_) => {
                (actix_web::http::StatusCode::SERVICE_UNAVAILABLE, "CIRCUIT_BREAKER_OPEN")
            }
            RecoveryError::RecoveryTimeout(_) => {
                (actix_web::http::StatusCode::REQUEST_TIMEOUT, "RECOVERY_TIMEOUT")
            }
            RecoveryError::PartialRecovery(_) => {
                (actix_web::http::StatusCode::PARTIAL_CONTENT, "PARTIAL_RECOVERY")
            }
            RecoveryError::DegradedMode(_) => {
                (actix_web::http::StatusCode::SERVICE_UNAVAILABLE, "DEGRADED_MODE")
            }
        };

        (status_code, serde_json::json!({
            "error": error_type,
            "message": self.to_string(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }))
    }
}

// Circuit Breaker Error Types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CircuitBreakerError {
    Open(String),
    HalfOpen(String),
    ThresholdExceeded(String),
    Timeout(String),
}

impl fmt::Display for CircuitBreakerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CircuitBreakerError::Open(msg) => write!(f, "Circuit breaker open: {msg}"),
            CircuitBreakerError::HalfOpen(msg) => write!(f, "Circuit breaker half-open: {msg}"),
            CircuitBreakerError::ThresholdExceeded(msg) => write!(f, "Threshold exceeded: {msg}"),
            CircuitBreakerError::Timeout(msg) => write!(f, "Circuit breaker timeout: {msg}"),
        }
    }
}

impl CircuitBreakerError {
    pub fn to_http_response(&self) -> (actix_web::http::StatusCode, serde_json::Value) {
        let (status_code, error_type) = match self {
            CircuitBreakerError::Open(_) => {
                (actix_web::http::StatusCode::SERVICE_UNAVAILABLE, "CIRCUIT_BREAKER_OPEN")
            }
            CircuitBreakerError::HalfOpen(_) => {
                (actix_web::http::StatusCode::SERVICE_UNAVAILABLE, "CIRCUIT_BREAKER_HALF_OPEN")
            }
            CircuitBreakerError::ThresholdExceeded(_) => {
                (actix_web::http::StatusCode::SERVICE_UNAVAILABLE, "THRESHOLD_EXCEEDED")
            }
            CircuitBreakerError::Timeout(_) => {
                (actix_web::http::StatusCode::REQUEST_TIMEOUT, "CIRCUIT_BREAKER_TIMEOUT")
            }
        };

        (status_code, serde_json::json!({
            "error": error_type,
            "message": self.to_string(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }))
    }
}

// Blockchain Errors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BlockchainError {
    InvalidChainId(u64),
    UnsupportedChain(u64),
    InvalidAddress(String),
    InvalidTransactionHash(String),
    TransactionFailed(String),
    NetworkError(String),
    RPCError(String),
    GasEstimationFailed(String),
    NonceError(String),
    BalanceInsufficient(String),
    ContractError(String),
    ProviderNotFound(u64),
    RetryableError(String),
    NonRetryableError(String),
}

impl fmt::Display for BlockchainError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            BlockchainError::InvalidChainId(id) => write!(f, "Invalid chain ID: {id}"),
            BlockchainError::UnsupportedChain(id) => write!(f, "Unsupported chain: {id}"),
            BlockchainError::InvalidAddress(addr) => write!(f, "Invalid address: {addr}"),
            BlockchainError::InvalidTransactionHash(hash) => write!(f, "Invalid transaction hash: {hash}"),
            BlockchainError::TransactionFailed(msg) => write!(f, "Transaction failed: {msg}"),
            BlockchainError::NetworkError(msg) => write!(f, "Network error: {msg}"),
            BlockchainError::RPCError(msg) => write!(f, "RPC error: {msg}"),
            BlockchainError::GasEstimationFailed(msg) => write!(f, "Gas estimation failed: {msg}"),
            BlockchainError::NonceError(msg) => write!(f, "Nonce error: {msg}"),
            BlockchainError::BalanceInsufficient(msg) => write!(f, "Insufficient balance: {msg}"),
            BlockchainError::ContractError(msg) => write!(f, "Contract error: {msg}"),
            BlockchainError::ProviderNotFound(chain_id) => write!(f, "Provider not found for chain: {chain_id}"),
            BlockchainError::RetryableError(msg) => write!(f, "Retryable error: {msg}"),
            BlockchainError::NonRetryableError(msg) => write!(f, "Non-retryable error: {msg}"),
        }
    }
}

impl BlockchainError {
    pub fn to_http_response(&self) -> (actix_web::http::StatusCode, serde_json::Value) {
        let (status_code, error_type) = match self {
            BlockchainError::InvalidChainId(_) | BlockchainError::UnsupportedChain(_) => {
                (actix_web::http::StatusCode::BAD_REQUEST, "INVALID_CHAIN")
            }
            BlockchainError::InvalidAddress(_) | BlockchainError::InvalidTransactionHash(_) => {
                (actix_web::http::StatusCode::BAD_REQUEST, "INVALID_INPUT")
            }
            BlockchainError::TransactionFailed(_) | BlockchainError::NetworkError(_) | BlockchainError::RPCError(_) => {
                (actix_web::http::StatusCode::SERVICE_UNAVAILABLE, "BLOCKCHAIN_ERROR")
            }
            BlockchainError::BalanceInsufficient(_) => {
                (actix_web::http::StatusCode::BAD_REQUEST, "INSUFFICIENT_BALANCE")
            }
            BlockchainError::RetryableError(_) => {
                (actix_web::http::StatusCode::SERVICE_UNAVAILABLE, "RETRYABLE_ERROR")
            }
            BlockchainError::NonRetryableError(_) => {
                (actix_web::http::StatusCode::BAD_REQUEST, "NON_RETRYABLE_ERROR")
            }
            _ => (actix_web::http::StatusCode::INTERNAL_SERVER_ERROR, "BLOCKCHAIN_ERROR"),
        };

        (status_code, serde_json::json!({
            "error": error_type,
            "message": self.to_string(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }))
    }


}

// Validation Errors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ValidationError {
    InvalidInput(String),
    MissingField(String),
    InvalidFormat(String),
    InvalidHex(String),
    InvalidJson(String),
    InvalidSignature(String),
    InvalidTransaction(String),
    InvalidDeviceId(String),
    InvalidChainId(String),
    InvalidAddress(String),
    InvalidAmount(String),
    InvalidNonce(String),
    InvalidGasLimit(String),
    InvalidGasPrice(String),
    PayloadTooLarge(usize),
    PayloadTooSmall(usize),
    InvalidContentType(String),
    XSSAttempt(String),
    SQLInjectionAttempt(String),
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::InvalidInput(msg) => write!(f, "Invalid input: {msg}"),
            ValidationError::MissingField(field) => write!(f, "Missing required field: {field}"),
            ValidationError::InvalidFormat(msg) => write!(f, "Invalid format: {msg}"),
            ValidationError::InvalidHex(msg) => write!(f, "Invalid hex: {msg}"),
            ValidationError::InvalidJson(msg) => write!(f, "Invalid JSON: {msg}"),
            ValidationError::InvalidSignature(msg) => write!(f, "Invalid signature: {msg}"),
            ValidationError::InvalidTransaction(msg) => write!(f, "Invalid transaction: {msg}"),
            ValidationError::InvalidDeviceId(id) => write!(f, "Invalid device ID: {id}"),
            ValidationError::InvalidChainId(id) => write!(f, "Invalid chain ID: {id}"),
            ValidationError::InvalidAddress(addr) => write!(f, "Invalid address: {addr}"),
            ValidationError::InvalidAmount(amount) => write!(f, "Invalid amount: {amount}"),
            ValidationError::InvalidNonce(nonce) => write!(f, "Invalid nonce: {nonce}"),
            ValidationError::InvalidGasLimit(limit) => write!(f, "Invalid gas limit: {limit}"),
            ValidationError::InvalidGasPrice(price) => write!(f, "Invalid gas price: {price}"),
            ValidationError::PayloadTooLarge(size) => write!(f, "Payload too large: {size} bytes"),
            ValidationError::PayloadTooSmall(size) => write!(f, "Payload too small: {size} bytes"),
            ValidationError::InvalidContentType(content_type) => write!(f, "Invalid content type: {content_type}"),
            ValidationError::XSSAttempt(msg) => write!(f, "XSS attempt detected: {msg}"),
            ValidationError::SQLInjectionAttempt(msg) => write!(f, "SQL injection attempt detected: {msg}"),
        }
    }
}

impl ValidationError {
    pub fn to_http_response(&self) -> (actix_web::http::StatusCode, serde_json::Value) {
        let (status_code, error_type) = match self {
            ValidationError::XSSAttempt(_) | ValidationError::SQLInjectionAttempt(_) => {
                (actix_web::http::StatusCode::FORBIDDEN, "SECURITY_VIOLATION")
            }
            ValidationError::PayloadTooLarge(_) | ValidationError::PayloadTooSmall(_) => {
                (actix_web::http::StatusCode::PAYLOAD_TOO_LARGE, "PAYLOAD_ERROR")
            }
            _ => (actix_web::http::StatusCode::BAD_REQUEST, "VALIDATION_ERROR"),
        };

        (status_code, serde_json::json!({
            "error": error_type,
            "message": self.to_string(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }))
    }
}

// Storage Errors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StorageError {
    FileNotFound(String),
    IO(String),
    Serialization(String),
    Deserialization(String),
    DatabaseError(String),
    TransactionNotFound(String),
    DeviceNotFound(String),
    DuplicateEntry(String),
    StorageFull(String),
    PermissionDenied(String),
    CorruptedData(String),
}

impl fmt::Display for StorageError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            StorageError::FileNotFound(file) => write!(f, "File not found: {file}"),
            StorageError::IO(msg) => write!(f, "IO error: {msg}"),
            StorageError::Serialization(msg) => write!(f, "Serialization error: {msg}"),
            StorageError::Deserialization(msg) => write!(f, "Deserialization error: {msg}"),
            StorageError::DatabaseError(msg) => write!(f, "Database error: {msg}"),
            StorageError::TransactionNotFound(id) => write!(f, "Transaction not found: {id}"),
            StorageError::DeviceNotFound(id) => write!(f, "Device not found: {id}"),
            StorageError::DuplicateEntry(msg) => write!(f, "Duplicate entry: {msg}"),
            StorageError::StorageFull(msg) => write!(f, "Storage full: {msg}"),
            StorageError::PermissionDenied(msg) => write!(f, "Permission denied: {msg}"),
            StorageError::CorruptedData(msg) => write!(f, "Corrupted data: {msg}"),
        }
    }
}

impl StorageError {
    pub fn to_http_response(&self) -> (actix_web::http::StatusCode, serde_json::Value) {
        let (status_code, error_type) = match self {
            StorageError::TransactionNotFound(_) | StorageError::DeviceNotFound(_) => {
                (actix_web::http::StatusCode::NOT_FOUND, "NOT_FOUND")
            }
            StorageError::PermissionDenied(_) => {
                (actix_web::http::StatusCode::FORBIDDEN, "PERMISSION_DENIED")
            }
            StorageError::StorageFull(_) => {
                (actix_web::http::StatusCode::SERVICE_UNAVAILABLE, "STORAGE_FULL")
            }
            _ => (actix_web::http::StatusCode::INTERNAL_SERVER_ERROR, "STORAGE_ERROR"),
        };

        (status_code, serde_json::json!({
            "error": error_type,
            "message": self.to_string(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }))
    }
}

// API Errors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum APIError {
    BadRequest(String),
    Unauthorized(String),
    Forbidden(String),
    NotFound(String),
    MethodNotAllowed(String),
    RequestTimeout(String),
    TooManyRequests(String),
    InternalServerError(String),
    ServiceUnavailable(String),
    GatewayTimeout(String),
}

impl fmt::Display for APIError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            APIError::BadRequest(msg) => write!(f, "Bad request: {msg}"),
            APIError::Unauthorized(msg) => write!(f, "Unauthorized: {msg}"),
            APIError::Forbidden(msg) => write!(f, "Forbidden: {msg}"),
            APIError::NotFound(msg) => write!(f, "Not found: {msg}"),
            APIError::MethodNotAllowed(msg) => write!(f, "Method not allowed: {msg}"),
            APIError::RequestTimeout(msg) => write!(f, "Request timeout: {msg}"),
            APIError::TooManyRequests(msg) => write!(f, "Too many requests: {msg}"),
            APIError::InternalServerError(msg) => write!(f, "Internal server error: {msg}"),
            APIError::ServiceUnavailable(msg) => write!(f, "Service unavailable: {msg}"),
            APIError::GatewayTimeout(msg) => write!(f, "Gateway timeout: {msg}"),
        }
    }
}

impl APIError {
    pub fn to_http_response(&self) -> (actix_web::http::StatusCode, serde_json::Value) {
        let status_code = match self {
            APIError::BadRequest(_) => actix_web::http::StatusCode::BAD_REQUEST,
            APIError::Unauthorized(_) => actix_web::http::StatusCode::UNAUTHORIZED,
            APIError::Forbidden(_) => actix_web::http::StatusCode::FORBIDDEN,
            APIError::NotFound(_) => actix_web::http::StatusCode::NOT_FOUND,
            APIError::MethodNotAllowed(_) => actix_web::http::StatusCode::METHOD_NOT_ALLOWED,
            APIError::RequestTimeout(_) => actix_web::http::StatusCode::REQUEST_TIMEOUT,
            APIError::TooManyRequests(_) => actix_web::http::StatusCode::TOO_MANY_REQUESTS,
            APIError::InternalServerError(_) => actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
            APIError::ServiceUnavailable(_) => actix_web::http::StatusCode::SERVICE_UNAVAILABLE,
            APIError::GatewayTimeout(_) => actix_web::http::StatusCode::GATEWAY_TIMEOUT,
        };

        (status_code, serde_json::json!({
            "error": "API_ERROR",
            "message": self.to_string(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }))
    }
}

// Configuration Errors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConfigError {
    MissingEnvironmentVariable(String),
    InvalidConfiguration(String),
    InvalidChainConfig(String),
    InvalidRPCUrl(String),
    InvalidContractAddress(String),
    InvalidPrivateKey(String),
    InvalidPort(String),
    InvalidLogLevel(String),
    InvalidSecurityConfig(String),
}

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ConfigError::MissingEnvironmentVariable(var) => write!(f, "Missing environment variable: {var}"),
            ConfigError::InvalidConfiguration(msg) => write!(f, "Invalid configuration: {msg}"),
            ConfigError::InvalidChainConfig(msg) => write!(f, "Invalid chain configuration: {msg}"),
            ConfigError::InvalidRPCUrl(url) => write!(f, "Invalid RPC URL: {url}"),
            ConfigError::InvalidContractAddress(addr) => write!(f, "Invalid contract address: {addr}"),
            ConfigError::InvalidPrivateKey(msg) => write!(f, "Invalid private key: {msg}"),
            ConfigError::InvalidPort(port) => write!(f, "Invalid port: {port}"),
            ConfigError::InvalidLogLevel(level) => write!(f, "Invalid log level: {level}"),
            ConfigError::InvalidSecurityConfig(msg) => write!(f, "Invalid security configuration: {msg}"),
        }
    }
}

impl ConfigError {
    pub fn to_http_response(&self) -> (actix_web::http::StatusCode, serde_json::Value) {
        (actix_web::http::StatusCode::INTERNAL_SERVER_ERROR, serde_json::json!({
            "error": "CONFIG_ERROR",
            "message": self.to_string(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }))
    }
}

// Security Errors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SecurityError {
    AuthenticationFailed(String),
    AuthorizationFailed(String),
    InvalidToken(String),
    TokenExpired(String),
    InvalidSignature(String),
    InvalidHash(String),
    SecurityViolation(String),
    RateLimitExceeded(String),
    IPBlocked(String),
    MaliciousRequest(String),
}

impl fmt::Display for SecurityError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SecurityError::AuthenticationFailed(msg) => write!(f, "Authentication failed: {msg}"),
            SecurityError::AuthorizationFailed(msg) => write!(f, "Authorization failed: {msg}"),
            SecurityError::InvalidToken(msg) => write!(f, "Invalid token: {msg}"),
            SecurityError::TokenExpired(msg) => write!(f, "Token expired: {msg}"),
            SecurityError::InvalidSignature(msg) => write!(f, "Invalid signature: {msg}"),
            SecurityError::InvalidHash(msg) => write!(f, "Invalid hash: {msg}"),
            SecurityError::SecurityViolation(msg) => write!(f, "Security violation: {msg}"),
            SecurityError::RateLimitExceeded(msg) => write!(f, "Rate limit exceeded: {msg}"),
            SecurityError::IPBlocked(msg) => write!(f, "IP blocked: {msg}"),
            SecurityError::MaliciousRequest(msg) => write!(f, "Malicious request: {msg}"),
        }
    }
}

impl SecurityError {
    pub fn to_http_response(&self) -> (actix_web::http::StatusCode, serde_json::Value) {
        let (status_code, error_type) = match self {
            SecurityError::AuthenticationFailed(_) => {
                (actix_web::http::StatusCode::UNAUTHORIZED, "AUTH_FAILED")
            }
            SecurityError::AuthorizationFailed(_) => {
                (actix_web::http::StatusCode::FORBIDDEN, "AUTHZ_FAILED")
            }
            SecurityError::InvalidToken(_) | SecurityError::TokenExpired(_) => {
                (actix_web::http::StatusCode::UNAUTHORIZED, "INVALID_TOKEN")
            }
            SecurityError::RateLimitExceeded(_) => {
                (actix_web::http::StatusCode::TOO_MANY_REQUESTS, "RATE_LIMIT")
            }
            SecurityError::IPBlocked(_) => {
                (actix_web::http::StatusCode::FORBIDDEN, "IP_BLOCKED")
            }
            _ => (actix_web::http::StatusCode::FORBIDDEN, "SECURITY_VIOLATION"),
        };

        (status_code, serde_json::json!({
            "error": error_type,
            "message": self.to_string(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }))
    }
}

// Compression Errors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CompressionError {
    CompressionFailed(String),
    DecompressionFailed(String),
    InvalidFormat(String),
    UnsupportedAlgorithm(String),
    DataCorrupted(String),
    MemoryError(String),
    InvalidPayload(String),
}

impl fmt::Display for CompressionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CompressionError::CompressionFailed(msg) => write!(f, "Compression failed: {msg}"),
            CompressionError::DecompressionFailed(msg) => write!(f, "Decompression failed: {msg}"),
            CompressionError::InvalidFormat(msg) => write!(f, "Invalid format: {msg}"),
            CompressionError::UnsupportedAlgorithm(algo) => write!(f, "Unsupported algorithm: {algo}"),
            CompressionError::DataCorrupted(msg) => write!(f, "Data corrupted: {msg}"),
            CompressionError::MemoryError(msg) => write!(f, "Memory error: {msg}"),
            CompressionError::InvalidPayload(msg) => write!(f, "Invalid payload: {msg}"),
        }
    }
}

impl CompressionError {
    pub fn to_http_response(&self) -> (actix_web::http::StatusCode, serde_json::Value) {
        (actix_web::http::StatusCode::BAD_REQUEST, serde_json::json!({
            "error": "COMPRESSION_ERROR",
            "message": self.to_string(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }))
    }
}

// Authentication Errors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AuthError {
    InvalidCredentials(String),
    UserNotFound(String),
    AccountLocked(String),
    PasswordExpired(String),
    TooManyAttempts(String),
    InvalidDevice(String),
    SessionExpired(String),
    InvalidChallenge(String),
}

impl fmt::Display for AuthError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AuthError::InvalidCredentials(msg) => write!(f, "Invalid credentials: {msg}"),
            AuthError::UserNotFound(user) => write!(f, "User not found: {user}"),
            AuthError::AccountLocked(user) => write!(f, "Account locked: {user}"),
            AuthError::PasswordExpired(msg) => write!(f, "Password expired: {msg}"),
            AuthError::TooManyAttempts(msg) => write!(f, "Too many attempts: {msg}"),
            AuthError::InvalidDevice(device) => write!(f, "Invalid device: {device}"),
            AuthError::SessionExpired(msg) => write!(f, "Session expired: {msg}"),
            AuthError::InvalidChallenge(msg) => write!(f, "Invalid challenge: {msg}"),
        }
    }
}

impl AuthError {
    pub fn to_http_response(&self) -> (actix_web::http::StatusCode, serde_json::Value) {
        let (status_code, error_type) = match self {
            AuthError::InvalidCredentials(_) | AuthError::UserNotFound(_) => {
                (actix_web::http::StatusCode::UNAUTHORIZED, "INVALID_CREDENTIALS")
            }
            AuthError::AccountLocked(_) => {
                (actix_web::http::StatusCode::FORBIDDEN, "ACCOUNT_LOCKED")
            }
            AuthError::TooManyAttempts(_) => {
                (actix_web::http::StatusCode::TOO_MANY_REQUESTS, "TOO_MANY_ATTEMPTS")
            }
            _ => (actix_web::http::StatusCode::UNAUTHORIZED, "AUTH_ERROR"),
        };

        (status_code, serde_json::json!({
            "error": error_type,
            "message": self.to_string(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }))
    }
}

// Monitoring Errors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MonitoringError {
    MetricsError(String),
    HealthCheckFailed(String),
    AlertError(String),
    PrometheusError(String),
    LoggingError(String),
    PerformanceError(String),
}

impl fmt::Display for MonitoringError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MonitoringError::MetricsError(msg) => write!(f, "Metrics error: {msg}"),
            MonitoringError::HealthCheckFailed(msg) => write!(f, "Health check failed: {msg}"),
            MonitoringError::AlertError(msg) => write!(f, "Alert error: {msg}"),
            MonitoringError::PrometheusError(msg) => write!(f, "Prometheus error: {msg}"),
            MonitoringError::LoggingError(msg) => write!(f, "Logging error: {msg}"),
            MonitoringError::PerformanceError(msg) => write!(f, "Performance error: {msg}"),
        }
    }
}

impl MonitoringError {
    pub fn to_http_response(&self) -> (actix_web::http::StatusCode, serde_json::Value) {
        (actix_web::http::StatusCode::INTERNAL_SERVER_ERROR, serde_json::json!({
            "error": "MONITORING_ERROR",
            "message": self.to_string(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }))
    }
}

