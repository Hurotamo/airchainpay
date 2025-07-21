//! Hashing functionality for the wallet core
//! 
//! This module handles SHA-256, SHA-3, and other cryptographic hash functions.

use crate::shared::error::WalletError;
use sha2::{Sha256, Sha512, Digest};
use sha3::{Sha3_256, Keccak256};

/// Hash manager for cryptographic hashing operations
pub struct HashManager {
    // No state needed for hashing operations
}

impl HashManager {
    /// Create a new hash manager
    pub fn new() -> Self {
        Self {}
    }
    
    /// Calculate SHA-256 hash
    pub async fn sha256(&self, data: &[u8]) -> Vec<u8> {
        let mut hasher = Sha256::new();
        hasher.update(data);
        hasher.finalize().to_vec()
    }
    
    /// Calculate SHA-256 hash and return as hex string
    pub async fn sha256_hex(&self, data: &[u8]) -> String {
        let hash = self.sha256(data).await;
        format!("0x{}", hex::encode(hash))
    }
    
    /// Calculate SHA-512 hash
    pub async fn sha512(&self, data: &[u8]) -> Vec<u8> {
        let mut hasher = Sha512::new();
        hasher.update(data);
        hasher.finalize().to_vec()
    }
    
    /// Calculate SHA-512 hash and return as hex string
    pub async fn sha512_hex(&self, data: &[u8]) -> String {
        let hash = self.sha512(data).await;
        format!("0x{}", hex::encode(hash))
    }
    
    /// Calculate Keccak-256 hash (Ethereum's hash function)
    pub async fn keccak256(&self, data: &[u8]) -> Vec<u8> {
        use sha3::Keccak256;
        let mut hasher = Keccak256::new();
        hasher.update(data);
        hasher.finalize().to_vec()
    }
    
    /// Calculate Keccak-256 hash and return as hex string
    pub async fn keccak256_hex(&self, data: &[u8]) -> String {
        let hash = self.keccak256(data).await;
        format!("0x{}", hex::encode(hash))
    }
    
    /// Calculate SHA3-256 hash
    pub async fn sha3_256(&self, data: &[u8]) -> Vec<u8> {
        let mut hasher = Sha3_256::new();
        hasher.update(data);
        hasher.finalize().to_vec()
    }
    
    /// Calculate SHA3-256 hash and return as hex string
    pub async fn sha3_256_hex(&self, data: &[u8]) -> String {
        let hash = self.sha3_256(data).await;
        format!("0x{}", hex::encode(hash))
    }
    
    /// Calculate double SHA-256 hash
    pub async fn double_sha256(&self, data: &[u8]) -> Vec<u8> {
        let first_hash = self.sha256(data).await;
        self.sha256(&first_hash).await
    }
    
    /// Calculate double SHA-256 hash and return as hex string
    pub async fn double_sha256_hex(&self, data: &[u8]) -> String {
        let hash = self.double_sha256(data).await;
        format!("0x{}", hex::encode(hash))
    }
    
    /// Calculate RIPEMD-160 hash (for Bitcoin address generation)
    pub async fn ripemd160(&self, data: &[u8]) -> Vec<u8> {
        use ripemd::{Ripemd160, Digest as RipemdDigest};
        
        let mut hasher = Ripemd160::new();
        hasher.update(data);
        hasher.finalize().to_vec()
    }
    
    /// Calculate RIPEMD-160 hash and return as hex string
    pub async fn ripemd160_hex(&self, data: &[u8]) -> String {
        let hash = self.ripemd160(data).await;
        format!("0x{}", hex::encode(hash))
    }
    
    /// Calculate Bitcoin address hash (SHA256 + RIPEMD160)
    pub async fn bitcoin_address_hash(&self, public_key: &[u8]) -> Vec<u8> {
        let sha256_hash = self.sha256(public_key).await;
        self.ripemd160(&sha256_hash).await
    }
    
    /// Calculate Bitcoin address hash and return as hex string
    pub async fn bitcoin_address_hash_hex(&self, public_key: &[u8]) -> String {
        let hash = self.bitcoin_address_hash(public_key).await;
        format!("0x{}", hex::encode(hash))
    }
    
    /// Calculate Ethereum address from public key
    pub async fn ethereum_address(&self, public_key: &[u8]) -> String {
        // Remove the first byte (compression flag) if present
        let key_data = if public_key.len() == 65 && public_key[0] == 0x04 {
            &public_key[1..]
        } else {
            public_key
        };
        
        let keccak_hash = self.keccak256(key_data).await;
        
        // Take the last 20 bytes for the address
        let address_bytes = &keccak_hash[12..];
        format!("0x{}", hex::encode(address_bytes))
    }
    
    /// Calculate checksum for data
    pub async fn calculate_checksum(&self, data: &[u8]) -> String {
        let hash = self.sha256(data).await;
        hex::encode(&hash[..8]) // Use first 8 bytes for checksum
    }
    
    /// Verify checksum
    pub async fn verify_checksum(&self, data: &[u8], checksum: &str) -> bool {
        let calculated_checksum = self.calculate_checksum(data).await;
        calculated_checksum == checksum
    }
    
    /// Hash password with salt using Argon2
    pub async fn hash_password(&self, password: &str, salt: &[u8]) -> Result<String, WalletError> {
        use argon2::{Argon2, PasswordHasher};
        
        let salt_string = argon2::password_hash::SaltString::b64_encode(salt)
            .map_err(|e| WalletError::crypto(format!("Invalid salt: {}", e)))?;
        
        let argon2 = Argon2::default();
        let password_hash = argon2.hash_password(password.as_bytes(), &salt_string)
            .map_err(|e| WalletError::crypto(format!("Password hashing failed: {}", e)))?;
        
        Ok(password_hash.to_string())
    }
    
    /// Verify password hash
    pub async fn verify_password(&self, password: &str, hash: &str) -> Result<bool, WalletError> {
        use argon2::{Argon2, PasswordVerifier};
        
        let argon2 = Argon2::default();
        let parsed_hash = argon2::PasswordHash::new(hash)
            .map_err(|e| WalletError::crypto(format!("Invalid hash format: {}", e)))?;
        
        let is_valid = argon2.verify_password(password.as_bytes(), &parsed_hash).is_ok();
        Ok(is_valid)
    }
    
    /// Initialize the hash manager
    pub async fn init(&self) -> Result<(), WalletError> {
        // Test hashing to ensure everything is working
        let test_data = b"test hash";
        let hash = self.sha256(test_data).await;
        
        if hash.len() != 32 {
            return Err(WalletError::crypto("Hash test failed"));
        }
        
        Ok(())
    }
    
    /// Cleanup the hash manager
    pub async fn cleanup(&self) -> Result<(), WalletError> {
        // No cleanup needed for hash manager
        Ok(())
    }
}

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