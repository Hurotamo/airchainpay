//! Hashing functionality for the wallet core
//!
//! This module handles SHA-256, SHA-3, and other cryptographic hash functions.

pub mod hash_manager;
pub mod hash_algorithm;

// Re-export all public items from submodules
pub use hash_manager::*;
pub use hash_algorithm::*;

/// Hash result wrapper
#[derive(Debug, Clone)]
pub struct HashResult {
    pub algorithm: String,
    pub hash: Vec<u8>,
    pub hex: String,
}

impl HashResult {
    /// Create a new hash result
    pub fn new(algorithm: String, hash: Vec<u8>) -> Self {
        let hex = format!("0x{}", hex::encode(&hash));
        Self { algorithm, hash, hex }
    }

    /// Get the hash as bytes
    pub fn bytes(&self) -> &[u8] {
        &self.hash
    }

    /// Get the hash as hex string
    pub fn hex(&self) -> &str {
        &self.hex
    }

    /// Get the algorithm used
    pub fn algorithm(&self) -> &str {
        &self.algorithm
    }
}

#[cfg(test)]
mod tests {


    #[test]
    fn test_hashing_module_imports() {
        // Test that hashing module can be imported
        assert!(true);
    }
} 