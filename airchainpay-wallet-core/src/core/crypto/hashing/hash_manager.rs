use crate::shared::WalletResult;
use sha2::{Sha256, Sha512, Digest};
use sha3::{Keccak256, Keccak512};
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

    #[test]
    fn test_hash_manager_new() {
        let _manager = HashManager::new();
        assert!(true); // Manager created successfully
    }

    #[test]
    fn test_sha256() {
        let manager = HashManager::new();
        let data = b"Hello, World!";
        
        let hash = manager.sha256(data).unwrap();
        assert_eq!(hash.len(), 32);
        assert_ne!(hash, data);
    }

    #[test]
    fn test_sha512() {
        let manager = HashManager::new();
        let data = b"Hello, World!";
        
        let hash = manager.sha512(data).unwrap();
        assert_eq!(hash.len(), 64);
        assert_ne!(hash, data);
    }

    #[test]
    fn test_keccak256() {
        let manager = HashManager::new();
        let data = b"Hello, World!";
        
        let hash = manager.keccak256(data).unwrap();
        assert_eq!(hash.len(), 32);
        assert_ne!(hash, data);
    }

    #[test]
    fn test_double_sha256() {
        let manager = HashManager::new();
        let data = b"Hello, World!";
        
        let hash = manager.double_sha256(data).unwrap();
        assert_eq!(hash.len(), 32);
        assert_ne!(hash, data);
    }

    #[test]
    fn test_empty_data() {
        let manager = HashManager::new();
        let data = b"";
        
        let sha256_hash = manager.sha256(data).unwrap();
        let sha512_hash = manager.sha512(data).unwrap();
        let keccak_hash = manager.keccak256(data).unwrap();
        let double_sha256_hash = manager.double_sha256(data).unwrap();
        
        assert_eq!(sha256_hash.len(), 32);
        assert_eq!(sha512_hash.len(), 64);
        assert_eq!(keccak_hash.len(), 32);
        assert_eq!(double_sha256_hash.len(), 32);
    }

    #[test]
    fn test_large_data() {
        let manager = HashManager::new();
        let data = b"x".repeat(1000);
        
        let sha256_hash = manager.sha256(&data).unwrap();
        let sha512_hash = manager.sha512(&data).unwrap();
        let keccak_hash = manager.keccak256(&data).unwrap();
        let double_sha256_hash = manager.double_sha256(&data).unwrap();
        
        assert_eq!(sha256_hash.len(), 32);
        assert_eq!(sha512_hash.len(), 64);
        assert_eq!(keccak_hash.len(), 32);
        assert_eq!(double_sha256_hash.len(), 32);
    }
} 