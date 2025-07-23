//! Secure storage functionality
//! 
//! This module contains secure storage operations for wallet data.

use crate::domain::{Wallet, SecureWallet};
use crate::shared::error::WalletError;
use crate::shared::types::{WalletBackupInfo};
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use aes_gcm::aead::{Aead, generic_array::GenericArray};
use argon2::{Argon2, PasswordHasher};
use rand::rngs::OsRng;
use rand::RngCore;
use sha2::Digest;
use serde_json;
use crate::infrastructure::platform::{PlatformStorage, FileStorage};

/// Secure storage manager
pub struct SecureStorage<'a> {
    storage: &'a dyn PlatformStorage,
}

impl<'a> SecureStorage<'a> {
    pub fn new(storage: &'a dyn PlatformStorage) -> Self {
        Self { storage }
    }

    pub async fn init(&self) -> Result<(), WalletError> {
        log::info!("Initializing secure storage");
        Ok(())
    }

    pub async fn store_data(&self, key: &str, data: &[u8], password: &str) -> Result<(), WalletError> {
        let encrypted = self.encrypt_data(data, password).await?;
        self.storage.store(key, &encrypted)
    }

    pub async fn retrieve_data(&self, key: &str, password: &str) -> Result<Vec<u8>, WalletError> {
        let encrypted = self.storage.retrieve(key)?;
        self.decrypt_data(&encrypted, password).await
    }

    pub async fn delete_data(&self, key: &str) -> Result<(), WalletError> {
        self.storage.delete(key)
    }

    pub async fn backup_wallet(&self, wallet: &Wallet, password: &str) -> Result<WalletBackupInfo, WalletError> {
        // Serialize wallet
        let wallet_bytes = serde_json::to_vec(wallet)
            .map_err(|e| WalletError::validation(format!("Wallet serialization failed: {}", e)))?;
        // Generate salt
        let mut salt = [0u8; 16];
        let mut rng = OsRng;
        rng.fill_bytes(&mut salt);
        // Derive key
        let salt_str = argon2::password_hash::SaltString::encode_b64(&salt)?;
        let argon2 = Argon2::default();
        let password_hash = argon2.hash_password(password.as_bytes(), &salt_str)
            .map_err(|e| WalletError::crypto(format!("Password hashing failed: {}", e)))?;
        let binding = password_hash.hash.unwrap();
        let hash_bytes = binding.as_bytes();
        let key = GenericArray::from_slice(&hash_bytes[..32]);
        // Encrypt
        let cipher = Aes256Gcm::new(key);
        let mut nonce = [0u8; 12];
        let mut rng = OsRng;
        rng.fill_bytes(&mut nonce);
        let mut encrypted_data = nonce.to_vec();
        let ciphertext = cipher.encrypt(GenericArray::from_slice(&nonce), wallet_bytes.as_ref())
            .map_err(|e| WalletError::crypto(format!("Encryption failed: {}", e)))?;
        encrypted_data.extend_from_slice(&ciphertext);
        // Compute checksum (SHA256 of ciphertext)
        let checksum = format!("{:x}", sha2::Sha256::digest(&encrypted_data));
        Ok(WalletBackupInfo {
            wallet_id: wallet.id.clone(),
            encrypted_data: base64::encode(&encrypted_data),
            salt: base64::encode(&salt),
            version: "1.0".to_string(),
        })
    }

    pub async fn restore_wallet(&self, backup: &WalletBackupInfo, password: &str) -> Result<Wallet, WalletError> {
        let encrypted_data = base64::decode(&backup.encrypted_data)
            .map_err(|e| WalletError::crypto(format!("Base64 decode failed: {}", e)))?;
        let salt = base64::decode(&backup.salt)
            .map_err(|e| WalletError::crypto(format!("Base64 decode failed: {}", e)))?;
        if encrypted_data.len() < 12 {
            return Err(WalletError::crypto("Encrypted data too short".to_string()));
        }
        let (nonce, ciphertext) = encrypted_data.split_at(12);
        let salt_str = argon2::password_hash::SaltString::encode_b64(&salt)?;
        let argon2 = Argon2::default();
        let password_hash = argon2.hash_password(password.as_bytes(), &salt_str)
            .map_err(|e| WalletError::crypto(format!("Password hashing failed: {}", e)))?;
        let binding = password_hash.hash.unwrap();
        let hash_bytes = binding.as_bytes();
        let key = GenericArray::from_slice(&hash_bytes[..32]);
        let cipher = Aes256Gcm::new(key);
        let wallet_bytes = cipher.decrypt(GenericArray::from_slice(nonce), ciphertext)
            .map_err(|e| WalletError::crypto(format!("Decryption failed: {}", e)))?;
        let wallet: Wallet = serde_json::from_slice(&wallet_bytes)
            .map_err(|e| WalletError::validation(format!("Wallet deserialization failed: {}", e)))?;
        Ok(wallet)
    }

    async fn encrypt_data(&self, data: &[u8], password: &str) -> Result<Vec<u8>, WalletError> {
        use aes_gcm::{Aes256Gcm, KeyInit, Nonce, aead::{Aead, generic_array::GenericArray}};
        use rand::RngCore;
        use argon2::{Argon2, PasswordHasher};
        let mut salt = [0u8; 32];
        let mut rng = OsRng;
        rng.fill_bytes(&mut salt);
        let salt_str = argon2::password_hash::SaltString::encode_b64(&salt)?;
        let argon2 = Argon2::default();
        let password_hash = argon2.hash_password(password.as_bytes(), &salt_str)
            .map_err(|e| WalletError::crypto(format!("Password hashing failed: {}", e)))?;
        let binding = password_hash.hash.unwrap();
        let hash_bytes = binding.as_bytes();
        let key = GenericArray::from_slice(&hash_bytes[..32]);
        let cipher = Aes256Gcm::new(key);
        let mut nonce = [0u8; 12];
        let mut rng = OsRng;
        rng.fill_bytes(&mut nonce);
        let ciphertext = cipher.encrypt(GenericArray::from_slice(&nonce), data)
            .map_err(|e| WalletError::crypto(format!("Encryption failed: {}", e)))?;
        let mut result = Vec::new();
        result.extend_from_slice(&salt);
        result.extend_from_slice(&nonce);
        result.extend_from_slice(&ciphertext);
        Ok(result)
    }

    async fn decrypt_data(&self, encrypted_data: &[u8], password: &str) -> Result<Vec<u8>, WalletError> {
        use aes_gcm::{Aes256Gcm, KeyInit, Nonce, aead::{Aead, generic_array::GenericArray}};
        use argon2::{Argon2, PasswordHasher};
        if encrypted_data.len() < 32 + 12 {
            return Err(WalletError::crypto("Encrypted data too short".to_string()));
        }
        let salt = &encrypted_data[..32];
        let nonce = &encrypted_data[32..44];
        let ciphertext = &encrypted_data[44..];
        let salt_str = argon2::password_hash::SaltString::encode_b64(salt)?;
        let argon2 = Argon2::default();
        let password_hash = argon2.hash_password(password.as_bytes(), &salt_str)
            .map_err(|e| WalletError::crypto(format!("Password hashing failed: {}", e)))?;
        let binding = password_hash.hash.unwrap();
        let hash_bytes = binding.as_bytes();
        let key = GenericArray::from_slice(&hash_bytes[..32]);
        let cipher = Aes256Gcm::new(key);
        let plaintext = cipher.decrypt(GenericArray::from_slice(nonce), ciphertext)
            .map_err(|e| WalletError::crypto(format!("Decryption failed: {}", e)))?;
        Ok(plaintext)
    }
}

/// Storage manager for wallet data persistence
pub struct StorageManager {
    // Uses FileStorage and SecureStorage for real persistent storage
}

impl StorageManager {
    pub fn new() -> Self {
        Self {}
    }

    pub async fn backup_wallet(&self, wallet: &Wallet, password: &str) -> Result<WalletBackupInfo, WalletError> {
        // Use the same logic as SecureStorage
        let file_storage = FileStorage::new()?;
        let storage = SecureStorage::new(&file_storage);
        storage.backup_wallet(wallet, password).await
    }

    pub async fn restore_wallet(&self, backup: &WalletBackupInfo, password: &str) -> Result<Wallet, WalletError> {
        let file_storage = FileStorage::new()?;
        let storage = SecureStorage::new(&file_storage);
        storage.restore_wallet(backup, password).await
    }

    pub async fn load_wallet(&self, wallet_id: &str, password: &str) -> Result<Wallet, WalletError> {
        let file_storage = FileStorage::new()?;
        let storage = SecureStorage::new(&file_storage);
        let data = storage.retrieve_data(wallet_id, password).await?;
        let wallet: Wallet = serde_json::from_slice(&data)
            .map_err(|e| WalletError::validation(format!("Wallet deserialization failed: {}", e)))?;
        Ok(wallet)
    }
}

/// Initialize storage
pub async fn init() -> Result<(), WalletError> {
    log::info!("Initializing storage");
    Ok(())
    }

/// Cleanup storage
pub async fn cleanup() -> Result<(), WalletError> {
    log::info!("Cleaning up storage");
    Ok(())
}

/// Example function to generate a random AES-GCM Nonce using OsRng
pub fn generate_random_nonce() -> [u8; 12] {
    let mut nonce = [0u8; 12];
    let mut rng = OsRng;
    rng.fill_bytes(&mut nonce);
    nonce
}

/// Note: SecureWallet can be used for enhanced wallet security features.
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_storage_init() {
        let result = init().await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_storage_cleanup() {
        let result = cleanup().await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_secure_storage() {
        let file_storage = FileStorage::new()?;
        let storage = SecureStorage::new(&file_storage);
        storage.init().await.unwrap();

        let data = b"test data";
        let password = "test_password";
        storage.store_data("test_key", data, password).await.unwrap();
        let retrieved = storage.retrieve_data("test_key", password).await.unwrap();
        assert_eq!(retrieved, data);
    }

    #[test]
    fn test_generate_random_nonce() {
        let nonce = generate_random_nonce();
        assert_eq!(nonce.len(), 12);
    }
} 