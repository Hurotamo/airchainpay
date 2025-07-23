//! Cryptographic functionality for the wallet core
//! 
//! This module provides encryption, hashing, key management, and digital signatures.

pub mod keys;
pub mod signatures;
pub mod encryption;
pub mod hashing;
pub mod password;

// Re-export all public items from submodules
pub use keys::*;
pub use signatures::*;
pub use encryption::*;
pub use hashing::*;
pub use password::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_crypto_manager_creation() {
        let manager = CryptoManager::new();
        assert!(manager.init().await.is_ok());
    }

    #[tokio::test]
    async fn test_crypto_init_cleanup() {
        assert!(init().await.is_ok());
        assert!(cleanup().await.is_ok());
    }
} 