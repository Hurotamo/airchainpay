//! Hashing functionality for the wallet core
//!
//! This module handles SHA-256, SHA-3, and other cryptographic hash functions.

pub mod hash_manager;
pub mod hash_algorithm;

// Re-export all public items from submodules
pub use hash_manager::*;
pub use hash_algorithm::*;

/// Hash result wrapper
#[derive(Debug, Clone)]
pub struct HashResult {
    pub algorithm: String,
    pub hash: Vec<u8>,
    pub hex: String,
}

impl HashResult {
    /// Create a new hash result
    pub fn new(algorithm: String, hash: Vec<u8>) -> Self {
        let hex = format!("0x{}", hex::encode(&hash));
        Self { algorithm, hash, hex }
    }

    /// Get the hash as bytes
    pub fn bytes(&self) -> &[u8] {
        &self.hash
    }

    /// Get the hash as hex string
    pub fn hex(&self) -> &str {
        &self.hex
    }

    /// Get the algorithm used
    pub fn algorithm(&self) -> &str {
        &self.algorithm
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_hash_manager_creation() {
        let manager = HashManager::new();
        assert!(manager.init().await.is_ok());
    }

    #[tokio::test]
    async fn test_sha256_hashing() {
        let manager = HashManager::new();

        let data = b"Hello, World!";
        let hash = manager.sha256(data).await;
        let hash_hex = manager.sha256_hex(data).await;

        assert_eq!(hash.len(), 32);
        assert!(hash_hex.starts_with("0x"));
        assert_eq!(hash_hex.len(), 66); // 32 bytes + 0x prefix
    }

    #[tokio::test]
    async fn test_sha512_hashing() {
        let manager = HashManager::new();

        let data = b"Hello, World!";
        let hash = manager.sha512(data).await;
        let hash_hex = manager.sha512_hex(data).await;

        assert_eq!(hash.len(), 64);
        assert!(hash_hex.starts_with("0x"));
        assert_eq!(hash_hex.len(), 130); // 64 bytes + 0x prefix
    }

    #[tokio::test]
    async fn test_keccak256_hashing() {
        let manager = HashManager::new();

        let data = b"Hello, World!";
        let hash = manager.keccak256(data).await;
        let hash_hex = manager.keccak256_hex(data).await;

        assert_eq!(hash.len(), 32);
        assert!(hash_hex.starts_with("0x"));
    }

    #[tokio::test]
    async fn test_sha3_256_hashing() {
        let manager = HashManager::new();

        let data = b"Hello, World!";
        let hash = manager.sha3_256(data).await;
        let hash_hex = manager.sha3_256_hex(data).await;

        assert_eq!(hash.len(), 32);
        assert!(hash_hex.starts_with("0x"));
    }

    #[tokio::test]
    async fn test_double_sha256_hashing() {
        let manager = HashManager::new();

        let data = b"Hello, World!";
        let hash = manager.double_sha256(data).await;
        let hash_hex = manager.double_sha256_hex(data).await;

        assert_eq!(hash.len(), 32);
        assert!(hash_hex.starts_with("0x"));
    }

    #[tokio::test]
    async fn test_ethereum_address_generation() {
        let manager = HashManager::new();

        // Test with a sample public key (65 bytes, uncompressed)
        let public_key = vec![0x04; 65]; // Dummy public key
        let address = manager.ethereum_address(&public_key).await;

        assert!(address.starts_with("0x"));
        assert_eq!(address.len(), 42); // 20 bytes + 0x prefix
    }

    #[tokio::test]
    async fn test_checksum_calculation() {
        let manager = HashManager::new();

        let data = b"test data";
        let checksum = manager.calculate_checksum(data).await;
        let is_valid = manager.verify_checksum(data, &checksum).await;

        assert_eq!(checksum.len(), 16); // 8 bytes as hex
        assert!(is_valid);
    }

    #[tokio::test]
    async fn test_password_hashing() {
        let manager = HashManager::new();

        let password = "test_password_123";
        let salt = b"test_salt_123";

        let hash = manager.hash_password(password, salt).await.unwrap();
        let is_valid = manager.verify_password(password, &hash).await.unwrap();

        assert!(!hash.is_empty());
        assert!(is_valid);
    }

    #[tokio::test]
    async fn test_password_verification_wrong_password() {
        let manager = HashManager::new();

        let password = "test_password_123";
        let wrong_password = "wrong_password";
        let salt = b"test_salt_123";

        let hash = manager.hash_password(password, salt).await.unwrap();
        let is_valid = manager.verify_password(wrong_password, &hash).await.unwrap();

        assert!(!is_valid);
    }

    #[test]
    fn test_hash_result_creation() {
        let algorithm = "SHA-256".to_string();
        let hash = vec![1u8; 32];

        let result = HashResult::new(algorithm.clone(), hash.clone());

        assert_eq!(result.algorithm(), algorithm);
        assert_eq!(result.bytes(), &hash);
        assert!(result.hex().starts_with("0x"));
    }
} 