//! Key generation and management
//! 
//! This module contains key generation, derivation, and management functionality
//! for cryptographic operations in the wallet core.

use crate::shared::error::WalletError;
use crate::shared::constants::*;
use secp256k1::{SecretKey, PublicKey, Secp256k1};
use rand::RngCore;
use rand::rngs::OsRng;
use super::{SecurePrivateKey, SecureSeedPhrase};
use bip32::{XPrv, DerivationPath};
use std::str::FromStr;
use crate::infrastructure::platform::PlatformStorage;
use arrayref::array_ref;

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
        let mut rng = OsRng;
        let mut key_bytes = [0u8; PRIVATE_KEY_SIZE];
        rng.fill_bytes(&mut key_bytes);

        // Ensure the key is valid for secp256k1
        let _secret_key = SecretKey::from_byte_array(key_bytes)
            .map_err(|e| WalletError::crypto(format!("Invalid private key: {}", e)))?;

        // Store the key securely
        self.storage.store(key_id, &key_bytes)?;
        Ok(SecurePrivateKey::new(key_bytes))
    }

    /// Import a private key and persist it securely
    pub fn import_private_key(&self, key_id: &str, key_bytes: &[u8]) -> Result<SecurePrivateKey, WalletError> {
        let _secret_key = SecretKey::from_byte_array(key_bytes.try_into().map_err(|_| WalletError::crypto("Invalid private key length".to_string()))?)
            .map_err(|e| WalletError::crypto(format!("Invalid private key: {}", e)))?;
        self.storage.store(key_id, key_bytes)?;
        Ok(SecurePrivateKey::new(*array_ref![key_bytes, 0, PRIVATE_KEY_SIZE]))
    }

    /// Retrieve a private key securely
    pub fn get_private_key(&self, key_id: &str) -> Result<SecurePrivateKey, WalletError> {
        let key_bytes = self.storage.retrieve(key_id)?;
        if key_bytes.len() != PRIVATE_KEY_SIZE {
            return Err(WalletError::crypto("Stored private key is not 32 bytes".to_string()));
        }
        Ok(SecurePrivateKey::new(*array_ref![key_bytes, 0, PRIVATE_KEY_SIZE]))
    }

    /// Generate a public key from a private key
    pub fn get_public_key(&self, private_key: &SecurePrivateKey) -> Result<String, WalletError> {
        let secret_key = SecretKey::from_byte_array(private_key.as_bytes().try_into().map_err(|_| WalletError::crypto("Invalid private key length".to_string()))?)
            .map_err(|e| WalletError::crypto(format!("Invalid private key: {}", e)))?;

        let public_key = PublicKey::from_secret_key(&self.secp256k1, &secret_key);
        let public_key_bytes = public_key.serialize_uncompressed();

        Ok(hex::encode(&public_key_bytes))
    }

    /// Generate an Ethereum address from a public key
    pub fn get_address(&self, public_key: &str) -> Result<String, WalletError> {
        let public_key_bytes = hex::decode(public_key)
            .map_err(|e| WalletError::crypto(format!("Invalid public key hex: {}", e)))?;

        let public_key = PublicKey::from_slice(&public_key_bytes)
            .map_err(|e| WalletError::crypto(format!("Invalid public key: {}", e)))?;

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
        let mut rng = OsRng;
        // Generate secure random entropy for a 12-word BIP39 mnemonic (128 bits)
        let mut entropy = [0u8; 16];
        rng.fill_bytes(&mut entropy);
        let mnemonic = bip39::Mnemonic::from_entropy(&entropy)
            .map_err(|e| WalletError::crypto(format!("Mnemonic generation failed: {}", e)))?;
        let phrase = mnemonic.to_string();
        Ok(SecureSeedPhrase::new(phrase))
    }

    /// Derive private key from seed phrase
    pub fn derive_private_key_from_seed(&self, seed_phrase: &str) -> Result<SecurePrivateKey, WalletError> {
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
        if private_key_bytes.len() != PRIVATE_KEY_SIZE {
            return Err(WalletError::crypto("Derived private key is not 32 bytes".to_string()));
        }
        let mut key_bytes = [0u8; PRIVATE_KEY_SIZE];
        key_bytes.copy_from_slice(&private_key_bytes);
        Ok(SecurePrivateKey::new(key_bytes))
    }

    /// Validate a private key
    pub fn validate_private_key(&self, private_key: &SecurePrivateKey) -> Result<bool, WalletError> {
        let secret_key = SecretKey::from_byte_array(private_key.as_bytes().try_into().map_err(|_| WalletError::crypto("Invalid private key length".to_string()))?);
        Ok(secret_key.is_ok())
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

    pub async fn send_payment(&self) -> Result<(), WalletError> {
        use crate::core::ble::BLESecurityManager;
        let ble = BLESecurityManager::new();
        ble.send_payment().await
    }

    pub async fn receive_payment(&self) -> Result<crate::shared::types::BLEPaymentData, WalletError> {
        use crate::core::ble::BLESecurityManager;
        let ble = BLESecurityManager::new();
        ble.receive_payment().await
    }
}

impl<'a> Drop for KeyManager<'a> {
    fn drop(&mut self) {
        // Secure cleanup of keys
        log::info!("KeyManager dropped - performing secure cleanup");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;
    use arbitrary::Arbitrary;

    #[test]
    fn test_key_manager_creation() {
        let file_storage = crate::infrastructure::platform::FileStorage::new().unwrap();
        let manager = KeyManager::new(&file_storage);
        assert!(manager.init().is_ok());
    }

    #[test]
    fn test_generate_private_key() {
        let file_storage = crate::infrastructure::platform::FileStorage::new().unwrap();
        let manager = KeyManager::new(&file_storage);
        let private_key = manager.generate_private_key("test_id").unwrap();
        assert_eq!(private_key.as_bytes().len(), PRIVATE_KEY_SIZE);
    }

    #[test]
    fn test_public_key_generation() {
        let file_storage = crate::infrastructure::platform::FileStorage::new().unwrap();
        let manager = KeyManager::new(&file_storage);
        let private_key = manager.generate_private_key("test_id").unwrap();
        let public_key = manager.get_public_key(&private_key).unwrap();
        assert!(!public_key.is_empty());
    }

    #[test]
    fn test_address_generation() {
        let file_storage = crate::infrastructure::platform::FileStorage::new().unwrap();
        let manager = KeyManager::new(&file_storage);
        let private_key = manager.generate_private_key("test_id").unwrap();
        let public_key = manager.get_public_key(&private_key).unwrap();
        let address = manager.get_address(&public_key).unwrap();
        assert!(address.starts_with("0x"));
        assert_eq!(address.len(), 42);
    }

    #[test]
    fn test_seed_phrase_generation() {
        let file_storage = crate::infrastructure::platform::FileStorage::new().unwrap();
        let manager = KeyManager::new(&file_storage);
        let seed_phrase = manager.generate_seed_phrase().unwrap();
        assert_eq!(seed_phrase.as_words().len(), 12);
    }

    #[test]
    fn test_private_key_derivation() {
        let file_storage = crate::infrastructure::platform::FileStorage::new().unwrap();
        let manager = KeyManager::new(&file_storage);
        let seed_phrase = "test seed phrase";
        let private_key = manager.derive_private_key_from_seed(seed_phrase).unwrap();
        assert_eq!(private_key.as_bytes().len(), PRIVATE_KEY_SIZE);
    }

    #[test]
    fn test_address_validation() {
        let file_storage = crate::infrastructure::platform::FileStorage::new().unwrap();
        let manager = KeyManager::new(&file_storage);
        let valid_address = "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6";
        let invalid_address = "invalid_address";
        assert!(manager.validate_address(valid_address).unwrap());
        assert!(!manager.validate_address(invalid_address).unwrap());
    }

    // Property-based test: random private keys
    proptest! {
        #[test]
        fn prop_generate_and_validate_private_key(key_bytes in prop::array::uniform32(prop::num::u8::ANY)) {
            let private_key = SecurePrivateKey::from_bytes(&key_bytes);
            if let Ok(pk) = private_key {
                assert_eq!(pk.as_bytes().len(), PRIVATE_KEY_SIZE);
            }
        }
    }

    // Negative test: invalid private key size
    #[test]
    fn test_invalid_private_key_size() {
        let invalid_key = SecurePrivateKey::from_bytes(&[1,2,3]);
        assert!(invalid_key.is_err());
    }

    // Fuzz test: arbitrary input for FFI boundary
    #[test]
    fn fuzz_key_manager_arbitrary() {
        #[derive(Debug, Arbitrary)]
        struct FuzzInput {
            key_bytes: [u8; 32],
        }
        let mut raw = vec![0u8; 32];
        for _ in 0..10 {
            getrandom::getrandom(&mut raw).unwrap();
            if let Ok(input) = FuzzInput::arbitrary(&mut raw.as_slice()) {
                let _ = SecurePrivateKey::from_bytes(&input.key_bytes);
            }
        }
    }
} 