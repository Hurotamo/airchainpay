//! Key generation and management
//! 
//! This module contains key generation, derivation, and management functionality
//! for cryptographic operations in the wallet core.

use crate::shared::error::WalletError;
use secp256k1::{SecretKey, PublicKey, Secp256k1};
use super::SecurePrivateKey;
use bip32::{XPrv, DerivationPath};
use std::str::FromStr;
use crate::infrastructure::platform::PlatformStorage;

/// Key manager for cryptographic key operations
pub struct KeyManager<'a> {
    secp256k1: Secp256k1<secp256k1::All>,
    storage: &'a dyn PlatformStorage,
}

impl<'a> KeyManager<'a> {
    /// Create a new key manager with a platform storage backend
    pub fn new(storage: &'a dyn PlatformStorage) -> Self {
        Self {
            secp256k1: Secp256k1::new(),
            storage,
        }
    }

    /// Initialize the key manager
    pub fn init(&self) -> Result<(), WalletError> {
        log::info!("Initializing key manager");
        Ok(())
    }

    /// Generate a new private key and persist it securely
    pub fn generate_private_key(&self, key_id: &str) -> Result<SecurePrivateKey, WalletError> {
        SecurePrivateKey::generate(key_id.to_string(), self.storage)
    }

    /// Import a private key and persist it securely
    pub fn import_private_key(&self, key_id: &str, key_bytes: &[u8]) -> Result<SecurePrivateKey, WalletError> {
        SecurePrivateKey::from_bytes(key_id.to_string(), key_bytes, self.storage)
    }

    /// Get a private key reference (does not load the key into memory)
    pub fn get_private_key(&self, key_id: &str) -> Result<SecurePrivateKey, WalletError> {
        // Verify the key exists in storage
        if !self.storage.exists(key_id)? {
            return Err(WalletError::crypto("Private key not found in storage".to_string()));
        }
        Ok(SecurePrivateKey::new(key_id.to_string()))
    }

    /// Generate a public key from a private key without loading the private key into memory
    pub fn get_public_key(&self, private_key: &SecurePrivateKey) -> Result<String, WalletError> {
        private_key.with_key(self.storage, |key_bytes| {
            let secret_key = SecretKey::from_byte_array(key_bytes.try_into().map_err(|_| WalletError::crypto("Invalid private key length".to_string()))?)
                .map_err(|e| WalletError::crypto(format!("Invalid private key: {}", e)))?;

            let public_key = PublicKey::from_secret_key(&self.secp256k1, &secret_key);
            let public_key_bytes = public_key.serialize_uncompressed();

            Ok(hex::encode(&public_key_bytes))
        })
    }

    /// Generate an Ethereum address from a public key
    pub fn get_address(&self, public_key: &str) -> Result<String, WalletError> {
        let public_key_bytes = hex::decode(public_key)
            .map_err(|_| WalletError::validation("Invalid hex format".to_string()))?;

        let public_key = PublicKey::from_slice(&public_key_bytes)
            .map_err(|e| WalletError::crypto(format!("Invalid public key: {}", e)))?;

        // Remove the 0x04 prefix if present
        let public_key_bytes = public_key.serialize_uncompressed();
        let keccak_hash = self.keccak256(&public_key_bytes[1..]);

        // Take the last 20 bytes for the address
        let address_bytes = &keccak_hash[12..];
        let address = hex::encode(address_bytes);

        Ok(format!("0x{}", address))
    }

    /// Sign a message using a private key without loading it into memory
    pub fn sign_message(&self, private_key: &SecurePrivateKey, message: &str) -> Result<String, WalletError> {
        private_key.with_key(self.storage, |key_bytes| {
            let secret_key = SecretKey::from_byte_array(key_bytes.try_into().map_err(|_| WalletError::crypto("Invalid private key length".to_string()))?)
                .map_err(|e| WalletError::crypto(format!("Invalid private key: {}", e)))?;

            let message_hash = self.keccak256(message.as_bytes());
            let message_hash = secp256k1::Message::from_digest(message_hash.as_slice().try_into().map_err(|_| WalletError::crypto("Invalid message hash length".to_string()))?);

            let signature = self.secp256k1.sign_ecdsa(message_hash, &secret_key);
            let signature_bytes = signature.serialize_compact();

            Ok(hex::encode(&signature_bytes))
        })
    }

    /// Derive a private key from a seed phrase without storing the seed phrase in memory
    pub fn derive_private_key_from_seed(&self, seed_phrase: &str, key_id: &str) -> Result<SecurePrivateKey, WalletError> {
        use bip39::Mnemonic;
        
        // Parse the mnemonic
        let mnemonic = Mnemonic::parse_in_normalized(bip39::Language::English, seed_phrase)
            .map_err(|e| WalletError::validation(format!("Invalid BIP39 seed phrase: {}", e)))?;
        
        let seed = bip32::Seed::new(mnemonic.to_seed_normalized("")); // No passphrase
        
        // Derive the BIP32 root key
        let xprv = XPrv::new(seed.as_bytes())
            .map_err(|e| WalletError::crypto(format!("Failed to create XPrv: {}", e)))?;
        
        // Standard Ethereum path: m/44'/60'/0'/0/0
        let derivation_path = DerivationPath::from_str("m/44'/60'/0'/0/0")
            .map_err(|e| WalletError::crypto(format!("Invalid derivation path: {}", e)))?;
        
        let mut child_xprv = xprv;
        for child_number in derivation_path.into_iter() {
            child_xprv = child_xprv.derive_child(child_number)
                .map_err(|e| WalletError::crypto(format!("Failed to derive child XPrv: {}", e)))?;
        }
        
        let private_key_bytes = child_xprv.private_key().to_bytes();
        
        // Store the derived private key securely
        SecurePrivateKey::from_bytes(key_id.to_string(), &private_key_bytes, self.storage)
    }

    /// Validate a private key without loading it into memory
    pub fn validate_private_key(&self, private_key: &SecurePrivateKey) -> Result<bool, WalletError> {
        private_key.with_key(self.storage, |key_bytes| {
            let secret_key = SecretKey::from_byte_array(key_bytes.try_into().map_err(|_| WalletError::crypto("Invalid private key length".to_string()))?);
            Ok(secret_key.is_ok())
        })
    }

    /// Validate a public key
    pub fn validate_public_key(&self, public_key: &str) -> Result<bool, WalletError> {
        let public_key_bytes = hex::decode(public_key)
            .map_err(|_| WalletError::validation("Invalid hex format".to_string()))?;

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

    /// Keccak256 hash function
    fn keccak256(&self, data: &[u8]) -> Vec<u8> {
        use sha3::{Keccak256, Digest};
        let mut hasher = Keccak256::new();
        hasher.update(data);
        hasher.finalize().to_vec()
    }

    // --- Minimal wallet storage and BLE payment methods ---
    pub async fn load_wallet(&self, wallet_id: &str, password: &str) -> Result<crate::domain::Wallet, WalletError> {
        use crate::core::storage::StorageManager;
        let storage = StorageManager::new();
        storage.load_wallet(wallet_id, password).await
    }

    pub async fn backup_wallet(&self, wallet: &crate::domain::Wallet, password: &str) -> Result<crate::shared::types::WalletBackupInfo, WalletError> {
        use crate::core::storage::StorageManager;
        let storage = StorageManager::new();
        storage.backup_wallet(wallet, password).await
    }

    pub async fn restore_wallet(&self, backup: &crate::shared::types::WalletBackupInfo, password: &str) -> Result<crate::domain::Wallet, WalletError> {
        use crate::core::storage::StorageManager;
        let storage = StorageManager::new();
        storage.restore_wallet(backup, password).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::platform::PlatformStorage;
    use std::collections::HashMap;
    use std::sync::Mutex;

    // Mock storage for tests
    struct MockStorage {
        data: Mutex<HashMap<String, Vec<u8>>>,
    }

    impl MockStorage {
        fn new() -> Self {
            Self {
                data: Mutex::new(HashMap::new()),
            }
        }
    }

    impl PlatformStorage for MockStorage {
        fn store(&self, key: &str, data: &[u8]) -> Result<(), WalletError> {
            let mut storage = self.data.lock()
                .expect("Failed to acquire lock for storage write");
            storage.insert(key.to_string(), data.to_vec());
            Ok(())
        }

        fn retrieve(&self, key: &str) -> Result<Vec<u8>, WalletError> {
            let storage = self.data.lock()
                .expect("Failed to acquire lock for storage read");
            storage.get(key)
                .cloned()
                .ok_or_else(|| WalletError::crypto("Key not found".to_string()))
        }

        fn delete(&self, key: &str) -> Result<(), WalletError> {
            let mut storage = self.data.lock()
                .expect("Failed to acquire lock for storage delete");
            storage.remove(key);
            Ok(())
        }

        fn exists(&self, key: &str) -> Result<bool, WalletError> {
            let storage = self.data.lock()
                .expect("Failed to acquire lock for storage exists check");
            Ok(storage.contains_key(key))
        }

        fn list_keys(&self) -> Result<Vec<String>, WalletError> {
            let storage = self.data.lock()
                .expect("Failed to acquire lock for storage list");
            Ok(storage.keys().cloned().collect())
        }
    }

    #[test]
    fn test_key_manager_creation() {
        let storage = MockStorage::new();
        let manager = KeyManager::new(&storage);
        assert!(manager.init().is_ok());
    }

    #[test]
    fn test_private_key_generation() {
        let storage = MockStorage::new();
        let manager = KeyManager::new(&storage);
        let private_key = manager.generate_private_key("test_key")
            .expect("Failed to generate private key");
        assert_eq!(private_key.key_id(), "test_key");
    }

    #[test]
    fn test_public_key_generation() {
        let storage = MockStorage::new();
        let manager = KeyManager::new(&storage);
        let private_key = manager.generate_private_key("test_public_key")
            .expect("Failed to generate private key");
        let public_key = manager.get_public_key(&private_key)
            .expect("Failed to get public key");
        assert!(!public_key.is_empty());
        assert_eq!(public_key.len(), 130); // 65 bytes * 2 for hex
    }

    #[test]
    fn test_address_generation() {
        let storage = MockStorage::new();
        let manager = KeyManager::new(&storage);
        let private_key = manager.generate_private_key("test_address")
            .expect("Failed to generate private key");
        let public_key = manager.get_public_key(&private_key)
            .expect("Failed to get public key");
        let address = manager.get_address(&public_key)
            .expect("Failed to get address");
        assert!(address.starts_with("0x"));
        assert_eq!(address.len(), 42); // 0x + 40 hex chars
    }

    #[test]
    fn test_message_signing() {
        let storage = MockStorage::new();
        let manager = KeyManager::new(&storage);
        let private_key = manager.generate_private_key("test_signing")
            .expect("Failed to generate private key");
        let message = "Hello, World!";
        let signature = manager.sign_message(&private_key, message)
            .expect("Failed to sign message");
        assert!(!signature.is_empty());
    }

    #[test]
    fn test_seed_phrase_derivation() {
        let storage = MockStorage::new();
        let manager = KeyManager::new(&storage);
        // Use a valid BIP39 seed phrase (12 words)
        let seed_phrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let private_key = manager.derive_private_key_from_seed(seed_phrase, "test_id")
            .expect("Failed to derive private key from seed");
        assert_eq!(private_key.key_id(), "test_id");
    }
} 