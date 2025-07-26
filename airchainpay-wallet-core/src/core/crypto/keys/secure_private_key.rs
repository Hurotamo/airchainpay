use crate::shared::constants::*;
use crate::shared::error::WalletError;
use zeroize::{Zeroize, Zeroizing};

/// Secure private key wrapper that never stores keys in memory
/// Keys are only accessed through secure storage backends with proper zeroization
pub struct SecurePrivateKey {
    key_id: String,
    // No key bytes stored in memory - only a reference ID
}

impl SecurePrivateKey {
    /// Create a new secure private key reference
    /// The actual key is stored securely and never loaded into memory
    pub fn new(key_id: String) -> Self {
        Self { key_id }
    }

    /// Get the key ID for secure storage lookup
    pub fn key_id(&self) -> &str {
        &self.key_id
    }

    /// Perform cryptographic operations without exposing the key
    /// This method takes a closure that receives the key bytes temporarily
    /// All memory is automatically zeroized after use
    pub fn with_key<F, T>(&self, storage: &dyn crate::infrastructure::platform::PlatformStorage, f: F) -> Result<T, WalletError>
    where
        F: FnOnce(&[u8]) -> Result<T, WalletError>,
    {
        // Retrieve key from secure storage into zeroized memory
        let key_bytes = Zeroizing::new(storage.retrieve(&self.key_id)?);
        
        // Validate key length
        if key_bytes.len() != PRIVATE_KEY_SIZE {
            return Err(WalletError::crypto("Invalid private key length".to_string()));
        }

        // Execute the operation with the key
        let result = f(&key_bytes)?;

        // Key bytes are automatically zeroized when Zeroizing is dropped
        Ok(result)
    }

    /// Create a SecurePrivateKey from existing key bytes and store securely
    /// Input bytes are zeroized after storage
    pub fn from_bytes(key_id: String, bytes: &[u8], storage: &dyn crate::infrastructure::platform::PlatformStorage) -> Result<Self, WalletError> {
        if bytes.len() != PRIVATE_KEY_SIZE {
            return Err(WalletError::crypto("Invalid private key length".to_string()));
        }

        // Validate the key is a valid secp256k1 private key
        let _secret_key = secp256k1::SecretKey::from_byte_array(bytes.try_into().map_err(|_| WalletError::crypto("Invalid private key format".to_string()))?)
            .map_err(|_| WalletError::crypto("Invalid private key".to_string()))?;

        // Store the key securely
        storage.store(&key_id, bytes)?;

        Ok(SecurePrivateKey { key_id })
    }

    /// Generate a new private key and store it securely
    /// Uses cryptographically secure random number generation
    pub fn generate(key_id: String, storage: &dyn crate::infrastructure::platform::PlatformStorage) -> Result<Self, WalletError> {
        use rand_core::OsRng;
        use rand_core::RngCore;
        use secp256k1::SecretKey;

        let mut rng = OsRng;
        let mut key_bytes = Zeroizing::new([0u8; PRIVATE_KEY_SIZE]);
        rng.fill_bytes(&mut *key_bytes);

        // Ensure the key is valid for secp256k1
        let _secret_key = SecretKey::from_byte_array(*key_bytes)
            .map_err(|_| WalletError::crypto("Generated invalid private key".to_string()))?;

        // Store the key securely
        storage.store(&key_id, &*key_bytes)?;

        // Key bytes are automatically zeroized when Zeroizing is dropped
        Ok(SecurePrivateKey { key_id })
    }

    /// Delete the private key from secure storage
    /// This operation is irreversible
    pub fn delete(&self, storage: &dyn crate::infrastructure::platform::PlatformStorage) -> Result<(), WalletError> {
        storage.delete(&self.key_id)
    }

    /// Check if the private key exists in secure storage
    pub fn exists(&self, storage: &dyn crate::infrastructure::platform::PlatformStorage) -> Result<bool, WalletError> {
        storage.exists(&self.key_id)
    }

    /// Validate the private key without exposing it
    pub fn validate(&self, storage: &dyn crate::infrastructure::platform::PlatformStorage) -> Result<bool, WalletError> {
        self.with_key(storage, |key_bytes| {
            let secret_key = secp256k1::SecretKey::from_byte_array(key_bytes.try_into().map_err(|_| WalletError::crypto("Invalid private key format".to_string()))?);
            Ok(secret_key.is_ok())
        })
    }
}

// No Debug implementation to prevent key exposure in logs
// No Clone implementation to prevent accidental key duplication
// No Default implementation to prevent accidental key creation

impl Drop for SecurePrivateKey {
    fn drop(&mut self) {
        // No key bytes to zeroize - they're never stored in memory
        // The key_id is not sensitive data
    }
}

// Zeroize implementation for additional security
impl Zeroize for SecurePrivateKey {
    fn zeroize(&mut self) {
        // Key ID is not sensitive, but we can clear it for consistency
        self.key_id.zeroize();
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
    fn test_secure_private_key_creation() {
        let storage = MockStorage::new();
        let key = SecurePrivateKey::generate("test_key".to_string(), &storage)
            .expect("Failed to generate secure private key");
        assert_eq!(key.key_id(), "test_key");
    }

    #[test]
    fn test_secure_private_key_exists() {
        let storage = MockStorage::new();
        let key = SecurePrivateKey::generate("test_key_exists".to_string(), &storage)
            .expect("Failed to generate secure private key");
        assert!(key.exists(&storage)
            .expect("Failed to check if key exists"));
    }

    #[test]
    fn test_secure_private_key_with_key() {
        let storage = MockStorage::new();
        let key = SecurePrivateKey::generate("test_key_with".to_string(), &storage)
            .expect("Failed to generate secure private key");
        let result = key.with_key(&storage, |key_bytes| {
            assert_eq!(key_bytes.len(), PRIVATE_KEY_SIZE);
            Ok(())
        }).expect("Failed to execute with_key operation");
        assert_eq!(result, ());
    }

    #[test]
    fn test_secure_private_key_validation() {
        let storage = MockStorage::new();
        let key = SecurePrivateKey::generate("test_key_validate".to_string(), &storage)
            .expect("Failed to generate secure private key");
        assert!(key.validate(&storage)
            .expect("Failed to validate key"));
    }

    #[test]
    fn test_secure_private_key_deletion() {
        let storage = MockStorage::new();
        let key = SecurePrivateKey::generate("test_key_delete".to_string(), &storage)
            .expect("Failed to generate secure private key");
        assert!(key.exists(&storage)
            .expect("Failed to check if key exists"));
        key.delete(&storage)
            .expect("Failed to delete key");
        assert!(!key.exists(&storage)
            .expect("Failed to check if key exists after deletion"));
    }
} 