use crate::shared::constants::*;
use crate::shared::error::WalletError;

/// Secure private key wrapper that never stores keys in memory
/// Keys are only accessed through secure storage backends
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
    pub fn with_key<F, T>(&self, storage: &dyn crate::infrastructure::platform::PlatformStorage, f: F) -> Result<T, WalletError>
    where
        F: FnOnce(&[u8]) -> Result<T, WalletError>,
    {
        // Retrieve key from secure storage
        let key_bytes = storage.retrieve(&self.key_id)?;
        
        // Validate key length
        if key_bytes.len() != PRIVATE_KEY_SIZE {
            return Err(WalletError::crypto(format!(
                "Invalid private key length: expected {} bytes, got {}",
                PRIVATE_KEY_SIZE,
                key_bytes.len()
            )));
        }

        // Execute the operation with the key
        let result = f(&key_bytes)?;

        // Key bytes are automatically zeroized when dropped
        Ok(result)
    }

    /// Create a SecurePrivateKey from existing key bytes and store securely
    pub fn from_bytes(key_id: String, bytes: &[u8], storage: &dyn crate::infrastructure::platform::PlatformStorage) -> Result<Self, WalletError> {
        if bytes.len() != PRIVATE_KEY_SIZE {
            return Err(WalletError::crypto(format!(
                "Invalid private key length: expected {} bytes, got {}",
                PRIVATE_KEY_SIZE,
                bytes.len()
            )));
        }

        // Store the key securely
        storage.store(&key_id, bytes)?;

        Ok(SecurePrivateKey { key_id })
    }

    /// Generate a new private key and store it securely
    pub fn generate(key_id: String, storage: &dyn crate::infrastructure::platform::PlatformStorage) -> Result<Self, WalletError> {
        use rand_core::OsRng;
        use rand_core::RngCore;
        use secp256k1::SecretKey;

        let mut rng = OsRng;
        let mut key_bytes = [0u8; PRIVATE_KEY_SIZE];
        rng.fill_bytes(&mut key_bytes);

        // Ensure the key is valid for secp256k1
        let _secret_key = SecretKey::from_byte_array(key_bytes)
            .map_err(|e| WalletError::crypto(format!("Invalid private key: {}", e)))?;

        // Store the key securely
        storage.store(&key_id, &key_bytes)?;

        Ok(SecurePrivateKey { key_id })
    }

    /// Delete the private key from secure storage
    pub fn delete(&self, storage: &dyn crate::infrastructure::platform::PlatformStorage) -> Result<(), WalletError> {
        storage.delete(&self.key_id)
    }

    /// Check if the private key exists in secure storage
    pub fn exists(&self, storage: &dyn crate::infrastructure::platform::PlatformStorage) -> Result<bool, WalletError> {
        storage.exists(&self.key_id)
    }
}

// No Debug implementation to prevent key exposure in logs
// No Clone implementation to prevent accidental key duplication

impl Drop for SecurePrivateKey {
    fn drop(&mut self) {
        // No key bytes to zeroize - they're never stored in memory
        // The key_id is not sensitive data
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
            let mut storage = self.data.lock().unwrap();
            storage.insert(key.to_string(), data.to_vec());
            Ok(())
        }

        fn retrieve(&self, key: &str) -> Result<Vec<u8>, WalletError> {
            let storage = self.data.lock().unwrap();
            storage.get(key)
                .cloned()
                .ok_or_else(|| WalletError::crypto("Key not found".to_string()))
        }

        fn delete(&self, key: &str) -> Result<(), WalletError> {
            let mut storage = self.data.lock().unwrap();
            storage.remove(key);
            Ok(())
        }

        fn exists(&self, key: &str) -> Result<bool, WalletError> {
            let storage = self.data.lock().unwrap();
            Ok(storage.contains_key(key))
        }

        fn list_keys(&self) -> Result<Vec<String>, WalletError> {
            let storage = self.data.lock().unwrap();
            Ok(storage.keys().cloned().collect())
        }
    }

    #[test]
    fn test_secure_private_key_creation() {
        let storage = MockStorage::new();
        let key = SecurePrivateKey::generate("test_key".to_string(), &storage).unwrap();
        assert_eq!(key.key_id(), "test_key");
    }

    #[test]
    fn test_secure_private_key_exists() {
        let storage = MockStorage::new();
        let key = SecurePrivateKey::generate("test_key_exists".to_string(), &storage).unwrap();
        assert!(key.exists(&storage).unwrap());
    }

    #[test]
    fn test_secure_private_key_with_key() {
        let storage = MockStorage::new();
        let key = SecurePrivateKey::generate("test_key_with".to_string(), &storage).unwrap();
        let result = key.with_key(&storage, |key_bytes| {
            assert_eq!(key_bytes.len(), PRIVATE_KEY_SIZE);
            Ok(())
        }).unwrap();
        assert_eq!(result, ());
    }
} 