use crate::shared::error::WalletError;
use crate::shared::WalletResult;
use sha2::{Sha256, Sha512, Digest};
use sha3::{Keccak256, Keccak512, Digest as Sha3Digest};
use zeroize::Zeroize;
use super::HashAlgorithm;

/// Hash manager
pub struct HashManager;

impl HashManager {
    pub fn new() -> Self {
        Self
    }

    /// Hash data with specified algorithm
    pub fn hash(&self, data: &[u8], algorithm: HashAlgorithm) -> WalletResult<Vec<u8>> {
        match algorithm {
            HashAlgorithm::SHA256 => self.sha256(data),
            HashAlgorithm::SHA512 => self.sha512(data),
            HashAlgorithm::Keccak256 => self.keccak256(data),
            HashAlgorithm::Keccak512 => self.keccak512(data),
        }
    }

    /// Hash data with SHA256
    pub fn sha256(&self, data: &[u8]) -> WalletResult<Vec<u8>> {
        let mut hasher = Sha256::new();
        hasher.update(data);
        Ok(hasher.finalize().to_vec())
    }

    /// Hash data with SHA512
    pub fn sha512(&self, data: &[u8]) -> WalletResult<Vec<u8>> {
        let mut hasher = Sha512::new();
        hasher.update(data);
        Ok(hasher.finalize().to_vec())
    }

    /// Hash data with Keccak256
    pub fn keccak256(&self, data: &[u8]) -> WalletResult<Vec<u8>> {
        let mut hasher = Keccak256::new();
        hasher.update(data);
        Ok(hasher.finalize().to_vec())
    }

    /// Hash data with Keccak512
    pub fn keccak512(&self, data: &[u8]) -> WalletResult<Vec<u8>> {
        let mut hasher = Keccak512::new();
        hasher.update(data);
        Ok(hasher.finalize().to_vec())
    }

    /// Hash to hex string
    pub fn hash_to_hex(&self, data: &[u8], algorithm: HashAlgorithm) -> WalletResult<String> {
        let hash = self.hash(data, algorithm)?;
        Ok(hex::encode(hash))
    }

    /// Double SHA256 (Bitcoin style)
    pub fn double_sha256(&self, data: &[u8]) -> WalletResult<Vec<u8>> {
        let first_hash = self.sha256(data)?;
        self.sha256(&first_hash)
    }

    /// Generate transaction hash
    pub fn transaction_hash(&self, transaction_data: &[u8]) -> WalletResult<String> {
        let hash = self.keccak256(transaction_data)?;
        Ok(format!("0x{}", hex::encode(hash)))
    }

    /// Generate message hash for signing
    pub fn message_hash(&self, message: &[u8]) -> WalletResult<String> {
        let hash = self.keccak256(message)?;
        Ok(format!("0x{}", hex::encode(hash)))
    }
}

impl Drop for HashManager {
    fn drop(&mut self) {
        // Clear any sensitive data
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;
    use arbitrary::Arbitrary;

    #[test]
    fn test_sha256() {
        let manager = HashManager::new();
        let data = b"Hello, World!";
        let hash = manager.sha256(data).unwrap();
        
        assert_eq!(hash.len(), 32);
        assert_ne!(hash, vec![0u8; 32]);
    }

    #[test]
    fn test_keccak256() {
        let manager = HashManager::new();
        let data = b"Hello, World!";
        let hash = manager.keccak256(data).unwrap();
        
        assert_eq!(hash.len(), 32);
        assert_ne!(hash, vec![0u8; 32]);
    }

    #[test]
    fn test_transaction_hash() {
        let manager = HashManager::new();
        let transaction_data = b"transaction_data_here";
        let hash = manager.transaction_hash(transaction_data).unwrap();
        
        assert!(hash.starts_with("0x"));
        assert_eq!(hash.len(), 66); // 0x + 64 hex chars
    }

    // Property-based test: random data for sha256
    proptest! {
        #[test]
        fn prop_sha256_random(data in any::<Vec<u8>>()) {
            let manager = HashManager::new();
            let hash = manager.sha256(&data).unwrap();
            prop_assert_eq!(hash.len(), 32);
        }
    }

    // Negative test: empty data for sha256
    #[test]
    fn test_sha256_empty() {
        let manager = HashManager::new();
        let hash = manager.sha256(&[]).unwrap();
        assert_eq!(hash.len(), 32);
    }

    // Fuzz test: arbitrary input for FFI boundary
    #[test]
    fn fuzz_hash_manager_arbitrary() {
        #[derive(Debug, Arbitrary)]
        struct FuzzInput {
            data: Vec<u8>,
        }
        let mut raw = vec![0u8; 32];
        for _ in 0..10 {
            getrandom::getrandom(&mut raw).unwrap();
            if let Ok(input) = FuzzInput::arbitrary(&mut raw.as_slice()) {
                let manager = HashManager::new();
                let _ = manager.sha256(&input.data);
            }
        }
    }
} 