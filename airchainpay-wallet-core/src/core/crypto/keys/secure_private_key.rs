use crate::shared::constants::*;

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

    /// Create a SecurePrivateKey from a byte slice
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, crate::shared::error::WalletError> {
        if bytes.len() != PRIVATE_KEY_SIZE {
            return Err(crate::shared::error::WalletError::crypto(format!(
                "Invalid private key length: expected {} bytes, got {}",
                PRIVATE_KEY_SIZE,
                bytes.len()
            )));
        }
        let mut key = [0u8; PRIVATE_KEY_SIZE];
        key.copy_from_slice(bytes);
        Ok(SecurePrivateKey { key })
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_secure_private_key_creation() {
        let key_bytes = [1u8; PRIVATE_KEY_SIZE];
        let key = SecurePrivateKey::new(key_bytes);
        assert_eq!(key.as_bytes().len(), PRIVATE_KEY_SIZE);
    }

    #[test]
    fn test_secure_private_key_hex() {
        let key_bytes = [1u8; PRIVATE_KEY_SIZE];
        let key = SecurePrivateKey::new(key_bytes);
        let hex = key.to_hex();
        assert!(!hex.is_empty());
        assert_eq!(hex.len(), PRIVATE_KEY_SIZE * 2);
    }
} 