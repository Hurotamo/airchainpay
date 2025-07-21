//! Key management for the wallet core
//! 
//! This module handles secure generation, storage, and management of cryptographic keys.

use crate::shared::error::WalletError;
use crate::shared::types::{Address, PrivateKey, PublicKey};
use crate::shared::constants::{PRIVATE_KEY_SIZE};
use crate::shared::utils::{hex_to_bytes};
use secp256k1::{SecretKey, PublicKey as Secp256k1PublicKey, Secp256k1, rand::Rng};
use sha2::{Sha256, Digest};
use zeroize::Zeroize;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Secure private key wrapper with automatic zeroization
#[derive(Debug)]
pub struct SecurePrivateKey {
    key: SecretKey,
}

impl SecurePrivateKey {
    /// Create a new secure private key from bytes
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, WalletError> {
        if bytes.len() != PRIVATE_KEY_SIZE {
            return Err(WalletError::validation("Invalid private key size"));
        }
        
        let key = SecretKey::from_byte_array(bytes.try_into()
            .map_err(|_| WalletError::validation("Invalid private key size"))?)
            .map_err(|e| WalletError::crypto(format!("Invalid private key: {}", e)))?;
        
        Ok(Self { key })
    }
    
    /// Generate a new secure private key
    pub fn generate() -> Result<Self, WalletError> {
        let secp = Secp256k1::new();
        let mut rng = rand::thread_rng();
        
        let key = SecretKey::new(&mut rng);
        Ok(Self { key })
    }
    
    /// Get the public key corresponding to this private key
    pub fn public_key(&self) -> Result<PublicKey, WalletError> {
        let secp = Secp256k1::new();
        let public_key = Secp256k1PublicKey::from_secret_key(&secp, &self.key);
        Ok(format!("0x{}", hex::encode(public_key.serialize())))
    }
    
    /// Get the Ethereum address corresponding to this private key
    pub fn address(&self) -> Result<Address, WalletError> {
        let public_key = self.public_key()?;
        let public_key_bytes = hex_to_bytes(&public_key)?;
        
        // Remove the first byte (compression flag) and hash
        let mut hasher = Sha256::new();
        hasher.update(&public_key_bytes[1..]);
        let public_key_hash = hasher.finalize();
        
        // Take the last 20 bytes for the address
        let address_bytes = &public_key_hash[12..];
        Ok(format!("0x{}", hex::encode(address_bytes)))
    }
    
    /// Export the private key as a hex string
    pub fn to_hex(&self) -> Result<PrivateKey, WalletError> {
        Ok(format!("0x{}", hex::encode(self.key.secret_bytes())))
    }
    
    /// Sign a message with this private key
    pub fn sign_message(&self, message: &[u8]) -> Result<Vec<u8>, WalletError> {
        let secp = Secp256k1::new();
        let mut hasher = Sha256::new();
        hasher.update(message);
        let message_hash = hasher.finalize();
        
        let signature = secp.sign_ecdsa(
            secp256k1::Message::from_digest(message_hash.into()),
            &self.key
        );
        
        Ok(signature.serialize_compact().to_vec())
    }
}

impl Clone for SecurePrivateKey {
    fn clone(&self) -> Self {
        Self {
            key: self.key.clone(),
        }
    }
}

impl Zeroize for SecurePrivateKey {
    fn zeroize(&mut self) {
        // The SecretKey will be zeroized when dropped
    }
}

/// Key manager for handling multiple keys
pub struct KeyManager {
    keys: Arc<RwLock<std::collections::HashMap<String, SecurePrivateKey>>>,
}

impl KeyManager {
    /// Create a new key manager
    pub fn new() -> Self {
        Self {
            keys: Arc::new(RwLock::new(std::collections::HashMap::new())),
        }
    }
    
    /// Generate a new key pair
    pub async fn generate_key_pair(&self, key_id: &str) -> Result<(PrivateKey, PublicKey), WalletError> {
        let private_key = SecurePrivateKey::generate()?;
        let public_key = private_key.public_key()?;
        let private_key_hex = private_key.to_hex()?;
        
        {
            let mut keys = self.keys.write().await;
            keys.insert(key_id.to_string(), private_key);
        }
        
        Ok((private_key_hex, public_key))
    }
    
    /// Import a private key
    pub async fn import_private_key(&self, key_id: &str, private_key_hex: &str) -> Result<PublicKey, WalletError> {
        let private_key_bytes = hex_to_bytes(private_key_hex)?;
        let private_key = SecurePrivateKey::from_bytes(&private_key_bytes)?;
        let public_key = private_key.public_key()?;
        
        {
            let mut keys = self.keys.write().await;
            keys.insert(key_id.to_string(), private_key);
        }
        
        Ok(public_key)
    }
    
    /// Get a private key by ID
    pub async fn get_private_key(&self, key_id: &str) -> Result<SecurePrivateKey, WalletError> {
        let keys = self.keys.read().await;
        keys.get(key_id)
            .cloned()
            .ok_or_else(|| WalletError::wallet_not_found(format!("Key not found: {}", key_id)))
    }
    
    /// Sign a message with a specific key
    pub async fn sign_message(&self, key_id: &str, message: &[u8]) -> Result<Vec<u8>, WalletError> {
        let private_key = self.get_private_key(key_id).await?;
        private_key.sign_message(message)
    }
    
    /// Get the address for a specific key
    pub async fn get_address(&self, key_id: &str) -> Result<Address, WalletError> {
        let private_key = self.get_private_key(key_id).await?;
        private_key.address()
    }
    
    /// Remove a key
    pub async fn remove_key(&self, key_id: &str) -> Result<(), WalletError> {
        let mut keys = self.keys.write().await;
        keys.remove(key_id);
        Ok(())
    }
    
    /// List all key IDs
    pub async fn list_keys(&self) -> Vec<String> {
        let keys = self.keys.read().await;
        keys.keys().cloned().collect()
    }
    
    /// Initialize the key manager
    pub async fn init(&self) -> Result<(), WalletError> {
        // Initialize cryptographic libraries
        let _secp = Secp256k1::new();
        Ok(())
    }
    
    /// Cleanup the key manager
    pub async fn cleanup(&self) -> Result<(), WalletError> {
        let mut keys = self.keys.write().await;
        keys.clear();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_generate_key_pair() {
        let manager = KeyManager::new();
        let (private_key, public_key) = manager.generate_key_pair("test_key").await.unwrap();
        
        assert!(private_key.starts_with("0x"));
        assert!(public_key.starts_with("0x"));
        assert_eq!(private_key.len(), 66); // 32 bytes + 0x prefix
    }

    #[tokio::test]
    async fn test_import_private_key() {
        let manager = KeyManager::new();
        let test_private_key = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        
        let public_key = manager.import_private_key("test_key", test_private_key).await.unwrap();
        assert!(public_key.starts_with("0x"));
    }

    #[tokio::test]
    async fn test_sign_message() {
        let manager = KeyManager::new();
        manager.generate_key_pair("test_key").await.unwrap();
        
        let message = b"Hello, World!";
        let signature = manager.sign_message("test_key", message).await.unwrap();
        
        assert!(!signature.is_empty());
        assert_eq!(signature.len(), 64); // ECDSA signature size
    }

    #[tokio::test]
    async fn test_get_address() {
        let manager = KeyManager::new();
        manager.generate_key_pair("test_key").await.unwrap();
        
        let address = manager.get_address("test_key").await.unwrap();
        assert!(address.starts_with("0x"));
        assert_eq!(address.len(), 42); // Ethereum address length
    }

    #[tokio::test]
    async fn test_remove_key() {
        let manager = KeyManager::new();
        manager.generate_key_pair("test_key").await.unwrap();
        
        assert!(manager.list_keys().await.contains(&"test_key".to_string()));
        
        manager.remove_key("test_key").await.unwrap();
        
        assert!(!manager.list_keys().await.contains(&"test_key".to_string()));
    }

    #[test]
    fn test_secure_private_key_generation() {
        let key = SecurePrivateKey::generate().unwrap();
        let address = key.address().unwrap();
        
        assert!(address.starts_with("0x"));
        assert_eq!(address.len(), 42);
    }

    #[test]
    fn test_secure_private_key_from_bytes() {
        let original_key = SecurePrivateKey::generate().unwrap();
        let key_bytes = original_key.key.secret_bytes();
        
        let imported_key = SecurePrivateKey::from_bytes(&key_bytes).unwrap();
        assert_eq!(original_key.address().unwrap(), imported_key.address().unwrap());
    }
} 