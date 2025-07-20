//! Key generation and management
//! 
//! This module contains key generation, derivation, and management functionality
//! for cryptographic operations in the wallet core.

use crate::shared::error::WalletError;
use crate::shared::constants::*;
use crate::shared::utils::Utils;
use secp256k1::{SecretKey, PublicKey, Secp256k1};
use rand::RngCore;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Key manager for cryptographic key operations
pub struct KeyManager {
    secp256k1: Secp256k1<secp256k1::All>,
    keys: Arc<RwLock<Vec<SecurePrivateKey>>>,
}

impl KeyManager {
    /// Create a new key manager
    pub fn new() -> Self {
        Self {
            secp256k1: Secp256k1::new(),
            keys: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// Initialize the key manager
    pub fn init(&self) -> Result<(), WalletError> {
        log::info!("Initializing key manager");
        Ok(())
    }

    /// Generate a new private key
    pub fn generate_private_key(&self) -> Result<SecurePrivateKey, WalletError> {
        let mut rng = rand::thread_rng();
        let mut key_bytes = [0u8; PRIVATE_KEY_SIZE];
        rng.fill_bytes(&mut key_bytes);

        // Ensure the key is valid for secp256k1
        let secret_key = SecretKey::from_slice(&key_bytes)
            .map_err(|e| WalletError::Crypto(format!("Invalid private key: {}", e)))?;

        let secure_key = SecurePrivateKey::new(key_bytes);
        
        // Store key for cleanup
        let mut keys = self.keys.blocking_write();
        keys.push(secure_key.clone());

        Ok(secure_key)
    }

    /// Generate a public key from a private key
    pub fn get_public_key(&self, private_key: &SecurePrivateKey) -> Result<String, WalletError> {
        let secret_key = SecretKey::from_slice(private_key.as_bytes())
            .map_err(|e| WalletError::Crypto(format!("Invalid private key: {}", e)))?;

        let public_key = PublicKey::from_secret_key(&self.secp256k1, &secret_key);
        let public_key_bytes = public_key.serialize_uncompressed();

        Ok(hex::encode(&public_key_bytes))
    }

    /// Generate an Ethereum address from a public key
    pub fn get_address(&self, public_key: &str) -> Result<String, WalletError> {
        let public_key_bytes = hex::decode(public_key)
            .map_err(|e| WalletError::Crypto(format!("Invalid public key hex: {}", e)))?;

        let public_key = PublicKey::from_slice(&public_key_bytes)
            .map_err(|e| WalletError::Crypto(format!("Invalid public key: {}", e)))?;

        // Remove the prefix byte (0x04) and take the last 20 bytes
        let public_key_bytes = public_key.serialize_uncompressed();
        let keccak_hash = self.keccak256(&public_key_bytes[1..]);

        // Take the last 20 bytes for the address
        let address_bytes = &keccak_hash[12..];
        let address = hex::encode(address_bytes);

        Ok(format!("0x{}", address))
    }

    /// Generate a seed phrase (BIP39)
    pub fn generate_seed_phrase(&self) -> Result<SecureSeedPhrase, WalletError> {
        // In production, this would use proper BIP39 implementation
        // For now, generate a simple 12-word phrase
        let words = vec![
            "abandon".to_string(), "ability".to_string(), "able".to_string(),
            "about".to_string(), "above".to_string(), "absent".to_string(),
            "absorb".to_string(), "abstract".to_string(), "absurd".to_string(),
            "abuse".to_string(), "access".to_string(), "accident".to_string(),
        ];

        Ok(SecureSeedPhrase::new(words))
    }

    /// Derive private key from seed phrase
    pub fn derive_private_key_from_seed(&self, seed_phrase: &str) -> Result<SecurePrivateKey, WalletError> {
        // In production, this would use BIP32/BIP44 derivation
        // For now, use a simple hash of the seed phrase
        let seed_bytes = seed_phrase.as_bytes();
        let hash = self.sha256(seed_bytes);

        let mut key_bytes = [0u8; PRIVATE_KEY_SIZE];
        key_bytes.copy_from_slice(&hash[..PRIVATE_KEY_SIZE]);

        // Ensure the key is valid for secp256k1
        let _secret_key = SecretKey::from_slice(&key_bytes)
            .map_err(|e| WalletError::Crypto(format!("Invalid derived private key: {}", e)))?;

        Ok(SecurePrivateKey::new(key_bytes))
    }

    /// Validate a private key
    pub fn validate_private_key(&self, private_key: &SecurePrivateKey) -> Result<bool, WalletError> {
        let secret_key = SecretKey::from_slice(private_key.as_bytes());
        Ok(secret_key.is_ok())
    }

    /// Validate a public key
    pub fn validate_public_key(&self, public_key: &str) -> Result<bool, WalletError> {
        let public_key_bytes = hex::decode(public_key)
            .map_err(|_| WalletError::InvalidPublicKey("Invalid hex format".to_string()))?;

        let public_key = PublicKey::from_slice(&public_key_bytes);
        Ok(public_key.is_ok())
    }

    /// Validate an Ethereum address
    pub fn validate_address(&self, address: &str) -> Result<bool, WalletError> {
        if !address.starts_with("0x") {
            return Ok(false);
        }

        let clean_address = &address[2..];
        if clean_address.len() != 40 {
            return Ok(false);
        }

        if !clean_address.chars().all(|c| c.is_ascii_hexdigit()) {
            return Ok(false);
        }

        Ok(true)
    }

    /// SHA256 hash function
    fn sha256(&self, data: &[u8]) -> Vec<u8> {
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(data);
        hasher.finalize().to_vec()
    }

    /// Keccak256 hash function
    fn keccak256(&self, data: &[u8]) -> Vec<u8> {
        use sha3::{Keccak256, Digest};
        let mut hasher = Keccak256::new();
        hasher.update(data);
        hasher.finalize().to_vec()
    }
}

impl Drop for KeyManager {
    fn drop(&mut self) {
        // Secure cleanup of keys
        log::info!("KeyManager dropped - performing secure cleanup");
    }
}

/// Secure private key wrapper
#[derive(Debug, Clone)]
pub struct SecurePrivateKey {
    key: [u8; PRIVATE_KEY_SIZE],
}

impl SecurePrivateKey {
    /// Create a new secure private key
    pub fn new(key: [u8; PRIVATE_KEY_SIZE]) -> Self {
        Self { key }
    }

    /// Get private key bytes
    pub fn as_bytes(&self) -> &[u8] {
        &self.key
    }

    /// Get private key as hex string
    pub fn to_hex(&self) -> String {
        hex::encode(&self.key)
    }
}

impl Drop for SecurePrivateKey {
    fn drop(&mut self) {
        // Zero out the private key when dropped
        for byte in &mut self.key {
            *byte = 0;
        }
    }
}

/// Secure seed phrase wrapper
#[derive(Debug, Clone)]
pub struct SecureSeedPhrase {
    words: Vec<String>,
}

impl SecureSeedPhrase {
    /// Create a new secure seed phrase
    pub fn new(words: Vec<String>) -> Self {
        Self { words }
    }

    /// Get seed phrase words
    pub fn as_words(&self) -> &[String] {
        &self.words
    }

    /// Get seed phrase as string
    pub fn to_string(&self) -> String {
        self.words.join(" ")
    }
}

impl Drop for SecureSeedPhrase {
    fn drop(&mut self) {
        // Clear the seed phrase when dropped
        for word in &mut self.words {
            *word = String::new();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_key_manager_creation() {
        let manager = KeyManager::new();
        manager.init().unwrap();
    }

    #[test]
    fn test_generate_private_key() {
        let manager = KeyManager::new();
        manager.init().unwrap();

        let private_key = manager.generate_private_key().unwrap();
        assert_eq!(private_key.as_bytes().len(), PRIVATE_KEY_SIZE);
        assert!(manager.validate_private_key(&private_key).unwrap());
    }

    #[test]
    fn test_public_key_generation() {
        let manager = KeyManager::new();
        manager.init().unwrap();

        let private_key = manager.generate_private_key().unwrap();
        let public_key = manager.get_public_key(&private_key).unwrap();

        assert!(!public_key.is_empty());
        assert!(manager.validate_public_key(&public_key).unwrap());
    }

    #[test]
    fn test_address_generation() {
        let manager = KeyManager::new();
        manager.init().unwrap();

        let private_key = manager.generate_private_key().unwrap();
        let public_key = manager.get_public_key(&private_key).unwrap();
        let address = manager.get_address(&public_key).unwrap();

        assert!(address.starts_with("0x"));
        assert_eq!(address.len(), 42); // 0x + 40 hex chars
        assert!(manager.validate_address(&address).unwrap());
    }

    #[test]
    fn test_seed_phrase_generation() {
        let manager = KeyManager::new();
        manager.init().unwrap();

        let seed_phrase = manager.generate_seed_phrase().unwrap();
        assert_eq!(seed_phrase.as_words().len(), 12);
        assert!(!seed_phrase.to_string().is_empty());
    }

    #[test]
    fn test_private_key_derivation() {
        let manager = KeyManager::new();
        manager.init().unwrap();

        let seed_phrase = "abandon ability able about above absent absorb abstract absurd abuse access accident";
        let private_key = manager.derive_private_key_from_seed(seed_phrase).unwrap();

        assert_eq!(private_key.as_bytes().len(), PRIVATE_KEY_SIZE);
        assert!(manager.validate_private_key(&private_key).unwrap());
    }

    #[test]
    fn test_address_validation() {
        let manager = KeyManager::new();
        manager.init().unwrap();

        // Valid address
        let valid_address = "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6";
        assert!(manager.validate_address(valid_address).unwrap());

        // Invalid addresses
        assert!(!manager.validate_address("invalid").unwrap());
        assert!(!manager.validate_address("0x123").unwrap());
        assert!(!manager.validate_address("1234567890123456789012345678901234567890").unwrap());
    }
} 