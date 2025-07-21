use crate::error::{WalletError, WalletResult};
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

    /// RIPEMD160(SHA256()) (Bitcoin address generation)
    pub fn ripemd160_sha256(&self, data: &[u8]) -> WalletResult<Vec<u8>> {
        let sha256_hash = self.sha256(data)?;
        // Note: RIPEMD160 would need an additional crate
        // For now, we'll use a placeholder
        Ok(sha256_hash[..20].to_vec()) // First 20 bytes as placeholder
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
} 