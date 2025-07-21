//! Encryption functionality for the wallet core
//! 
//! This module handles AES-256-GCM and ChaCha20-Poly1305 encryption for sensitive data.

use crate::shared::error::WalletError;
use crate::shared::constants::{KEY_SIZE, NONCE_SIZE};
use crate::shared::utils::{generate_secure_random_bytes};
use aes_gcm::{Aes256Gcm, KeyInit, Nonce, aead::Aead};
use chacha20poly1305::{ChaCha20Poly1305, KeyInit as ChaChaKeyInit, aead::Aead as ChaChaAead, Nonce as ChaChaNonce};
use rand::RngCore;
use zeroize::Zeroize;
use std::sync::Arc;
use tokio::sync::RwLock;
use generic_array::GenericArray;

/// Secure encryption manager
pub struct EncryptionManager {
    aes_gcm: Arc<Aes256Gcm>,
    chacha20: Arc<ChaCha20Poly1305>,
}

impl EncryptionManager {
    /// Create a new encryption manager
    pub fn new() -> Result<Self, WalletError> {
        // Generate random keys for AES-GCM and ChaCha20-Poly1305
        let aes_key = generate_secure_random_bytes(KEY_SIZE)?;
        let chacha_key = generate_secure_random_bytes(KEY_SIZE)?;
        
        let aes_gcm = Aes256Gcm::new(GenericArray::from_slice(&aes_key))
            .map_err(|e| WalletError::crypto(format!("Failed to initialize AES-GCM: {}", e)))?;
        
        let chacha20 = ChaCha20Poly1305::new(GenericArray::from_slice(&chacha_key))
            .map_err(|e| WalletError::crypto(format!("Failed to initialize ChaCha20-Poly1305: {}", e)))?;
        
        Ok(Self {
            aes_gcm: Arc::new(aes_gcm),
            chacha20: Arc::new(chacha20),
        })
    }
    
    /// Encrypt data using AES-256-GCM
    pub async fn encrypt_aes_gcm(&self, data: &[u8]) -> Result<Vec<u8>, WalletError> {
        // Generate a random nonce
        let mut nonce_bytes = [0u8; NONCE_SIZE];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        
        // Encrypt the data
        let ciphertext = self.aes_gcm.encrypt(nonce, data)
            .map_err(|e| WalletError::crypto(format!("AES-GCM encryption failed: {}", e)))?;
        
        // Combine nonce and ciphertext
        let mut result = Vec::new();
        result.extend_from_slice(&nonce_bytes);
        result.extend_from_slice(&ciphertext);
        
        Ok(result)
    }
    
    /// Decrypt data using AES-256-GCM
    pub async fn decrypt_aes_gcm(&self, encrypted_data: &[u8]) -> Result<Vec<u8>, WalletError> {
        if encrypted_data.len() < NONCE_SIZE {
            return Err(WalletError::validation("Encrypted data too short"));
        }
        
        // Extract nonce and ciphertext
        let nonce_bytes = &encrypted_data[..NONCE_SIZE];
        let ciphertext = &encrypted_data[NONCE_SIZE..];
        
        let nonce = Nonce::from_slice(nonce_bytes);
        
        // Decrypt the data
        let plaintext = self.aes_gcm.decrypt(nonce, ciphertext)
            .map_err(|e| WalletError::crypto(format!("AES-GCM decryption failed: {}", e)))?;
        
        Ok(plaintext)
    }
    
    /// Encrypt data using ChaCha20-Poly1305
    pub async fn encrypt_chacha20(&self, data: &[u8]) -> Result<Vec<u8>, WalletError> {
        // Generate a random nonce
        let mut nonce_bytes = [0u8; NONCE_SIZE];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = ChaChaNonce::from_slice(&nonce_bytes);
        
        // Encrypt the data
        let ciphertext = self.chacha20.encrypt(nonce, data)
            .map_err(|e| WalletError::crypto(format!("ChaCha20-Poly1305 encryption failed: {}", e)))?;
        
        // Combine nonce and ciphertext
        let mut result = Vec::new();
        result.extend_from_slice(&nonce_bytes);
        result.extend_from_slice(&ciphertext);
        
        Ok(result)
    }
    
    /// Decrypt data using ChaCha20-Poly1305
    pub async fn decrypt_chacha20(&self, encrypted_data: &[u8]) -> Result<Vec<u8>, WalletError> {
        if encrypted_data.len() < NONCE_SIZE {
            return Err(WalletError::validation("Encrypted data too short"));
        }
        
        // Extract nonce and ciphertext
        let nonce_bytes = &encrypted_data[..NONCE_SIZE];
        let ciphertext = &encrypted_data[NONCE_SIZE..];
        
        let nonce = ChaChaNonce::from_slice(nonce_bytes);
        
        // Decrypt the data
        let plaintext = self.chacha20.decrypt(nonce, ciphertext)
            .map_err(|e| WalletError::crypto(format!("ChaCha20-Poly1305 decryption failed: {}", e)))?;
        
        Ok(plaintext)
    }
    
    /// Encrypt wallet data
    pub async fn encrypt_wallet_data(&self, wallet_data: &[u8], password: &str) -> Result<Vec<u8>, WalletError> {
        // Derive encryption key from password
        let salt = generate_secure_random_bytes(32)?;
        let key = self.derive_key_from_password(password, &salt)?;
        
        // Create a temporary AES-GCM instance with the derived key
        let temp_aes = Aes256Gcm::new(GenericArray::from_slice(&key))
            .map_err(|e| WalletError::crypto(format!("Failed to create AES-GCM with derived key: {}", e)))?;
        
        // Generate nonce
        let mut nonce_bytes = [0u8; NONCE_SIZE];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        
        // Encrypt the wallet data
        let ciphertext = temp_aes.encrypt(nonce, wallet_data)
            .map_err(|e| WalletError::crypto(format!("Wallet encryption failed: {}", e)))?;
        
        // Combine salt, nonce, and ciphertext
        let mut result = Vec::new();
        result.extend_from_slice(&salt);
        result.extend_from_slice(&nonce_bytes);
        result.extend_from_slice(&ciphertext);
        
        Ok(result)
    }
    
    /// Decrypt wallet data
    pub async fn decrypt_wallet_data(&self, encrypted_data: &[u8], password: &str) -> Result<Vec<u8>, WalletError> {
        if encrypted_data.len() < 32 + NONCE_SIZE {
            return Err(WalletError::validation("Encrypted wallet data too short"));
        }
        
        // Extract salt, nonce, and ciphertext
        let salt = &encrypted_data[..32];
        let nonce_bytes = &encrypted_data[32..32 + NONCE_SIZE];
        let ciphertext = &encrypted_data[32 + NONCE_SIZE..];
        
        // Derive key from password
        let key = self.derive_key_from_password(password, salt)?;
        
        // Create a temporary AES-GCM instance with the derived key
        let temp_aes = Aes256Gcm::new(GenericArray::from_slice(&key))
            .map_err(|e| WalletError::crypto(format!("Failed to create AES-GCM with derived key: {}", e)))?;
        
        let nonce = Nonce::from_slice(nonce_bytes);
        
        // Decrypt the wallet data
        let plaintext = temp_aes.decrypt(nonce, ciphertext)
            .map_err(|e| WalletError::crypto(format!("Wallet decryption failed: {}", e)))?;
        
        Ok(plaintext)
    }
    
    /// Derive encryption key from password using Argon2
    fn derive_key_from_password(&self, password: &str, salt: &[u8]) -> Result<Vec<u8>, WalletError> {
        use argon2::{Argon2, PasswordHasher};
        
        let salt_string = argon2::password_hash::SaltString::encode_b64(salt)
            .map_err(|e| WalletError::crypto(format!("Invalid salt: {}", e)))?;
        
        let argon2 = Argon2::default();
        let password_hash = argon2.hash_password(password.as_bytes(), &salt_string)
            .map_err(|e| WalletError::crypto(format!("Password hashing failed: {}", e)))?;
        
        // Use the first 32 bytes of the hash as the key
        let binding = password_hash.hash.unwrap();
        let hash_bytes = binding.as_bytes();
        Ok(hash_bytes[..KEY_SIZE].to_vec())
    }
    
    /// Initialize the encryption manager
    pub async fn init(&self) -> Result<(), WalletError> {
        // Test encryption/decryption to ensure everything is working
        let test_data = b"test encryption";
        let encrypted = self.encrypt_aes_gcm(test_data).await?;
        let decrypted = self.decrypt_aes_gcm(&encrypted).await?;
        
        if test_data != decrypted.as_slice() {
            return Err(WalletError::crypto("Encryption test failed"));
        }
        
        Ok(())
    }
    
    /// Cleanup the encryption manager
    pub async fn cleanup(&self) -> Result<(), WalletError> {
        // No cleanup needed for encryption manager
        Ok(())
    }
}

/// Secure encrypted data wrapper
#[derive(Debug)]
pub struct EncryptedData {
    data: Vec<u8>,
    algorithm: String,
}

impl EncryptedData {
    /// Create new encrypted data
    pub fn new(data: Vec<u8>, algorithm: String) -> Self {
        Self { data, algorithm }
    }
    
    /// Get the encrypted data
    pub fn data(&self) -> &[u8] {
        &self.data
    }
    
    /// Get the algorithm used
    pub fn algorithm(&self) -> &str {
        &self.algorithm
    }
    
    /// Convert to bytes
    pub fn to_bytes(&self) -> Vec<u8> {
        self.data.clone()
    }
}

impl Zeroize for EncryptedData {
    fn zeroize(&mut self) {
        self.data.zeroize();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_encryption_manager_creation() {
        let manager = EncryptionManager::new().unwrap();
        assert!(manager.init().await.is_ok());
    }

    #[tokio::test]
    async fn test_aes_gcm_encryption_decryption() {
        let manager = EncryptionManager::new().unwrap();
        
        let test_data = b"Hello, World! This is a test message.";
        let encrypted = manager.encrypt_aes_gcm(test_data).await.unwrap();
        let decrypted = manager.decrypt_aes_gcm(&encrypted).await.unwrap();
        
        assert_eq!(test_data, decrypted.as_slice());
    }

    #[tokio::test]
    async fn test_chacha20_encryption_decryption() {
        let manager = EncryptionManager::new().unwrap();
        
        let test_data = b"Hello, World! This is a test message.";
        let encrypted = manager.encrypt_chacha20(test_data).await.unwrap();
        let decrypted = manager.decrypt_chacha20(&encrypted).await.unwrap();
        
        assert_eq!(test_data, decrypted.as_slice());
    }

    #[tokio::test]
    async fn test_wallet_data_encryption() {
        let manager = EncryptionManager::new().unwrap();
        
        let wallet_data = b"{\"id\":\"test_wallet\",\"address\":\"0x1234\"}";
        let password = "test_password_123";
        
        let encrypted = manager.encrypt_wallet_data(wallet_data, password).await.unwrap();
        let decrypted = manager.decrypt_wallet_data(&encrypted, password).await.unwrap();
        
        assert_eq!(wallet_data, decrypted.as_slice());
    }

    #[tokio::test]
    async fn test_wallet_data_encryption_wrong_password() {
        let manager = EncryptionManager::new().unwrap();
        
        let wallet_data = b"{\"id\":\"test_wallet\",\"address\":\"0x1234\"}";
        let password = "test_password_123";
        let wrong_password = "wrong_password";
        
        let encrypted = manager.encrypt_wallet_data(wallet_data, password).await.unwrap();
        let result = manager.decrypt_wallet_data(&encrypted, wrong_password).await;
        
        assert!(result.is_err());
    }

    #[test]
    fn test_encrypted_data_creation() {
        let data = vec![1, 2, 3, 4, 5];
        let algorithm = "AES-256-GCM".to_string();
        
        let encrypted_data = EncryptedData::new(data.clone(), algorithm.clone());
        
        assert_eq!(encrypted_data.data(), &data);
        assert_eq!(encrypted_data.algorithm(), algorithm);
    }

    #[test]
    fn test_encrypted_data_to_bytes() {
        let data = vec![1, 2, 3, 4, 5];
        let algorithm = "ChaCha20-Poly1305".to_string();
        
        let encrypted_data = EncryptedData::new(data.clone(), algorithm);
        let bytes = encrypted_data.to_bytes();
        
        assert_eq!(bytes, data);
    }
} 