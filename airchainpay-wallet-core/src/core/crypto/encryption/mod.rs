//! Encryption functionality for the wallet core
//!
//! This module handles AES-256-GCM and ChaCha20-Poly1305 encryption for sensitive data.

pub mod encryption_manager;
pub mod encryption_algorithm;
pub mod encrypted_data;

// Re-export all public items from submodules
pub use encryption_manager::*;
pub use encryption_algorithm::*;
pub use encrypted_data::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_encryption_manager_creation() {
        let manager = EncryptionManager::new().unwrap();
        assert!(manager.init().await.is_ok());
    }

    #[tokio::test]
    async fn test_aes_gcm_encryption_decryption() {
        let manager = EncryptionManager::new().unwrap();
        
        let test_data = b"Hello, World! This is a test message.";
        let encrypted = manager.encrypt_aes_gcm(test_data).await.unwrap();
        let decrypted = manager.decrypt_aes_gcm(&encrypted).await.unwrap();
        
        assert_eq!(test_data, decrypted.as_slice());
    }

    #[tokio::test]
    async fn test_chacha20_encryption_decryption() {
        let manager = EncryptionManager::new().unwrap();
        
        let test_data = b"Hello, World! This is a test message.";
        let encrypted = manager.encrypt_chacha20(test_data).await.unwrap();
        let decrypted = manager.decrypt_chacha20(&encrypted).await.unwrap();
        
        assert_eq!(test_data, decrypted.as_slice());
    }

    #[tokio::test]
    async fn test_wallet_data_encryption() {
        let manager = EncryptionManager::new().unwrap();
        
        let wallet_data = b"{\"id\":\"test_wallet\",\"address\":\"0x1234\"}";
        let password = "test_password_123";
        
        let encrypted = manager.encrypt_wallet_data(wallet_data, password).await.unwrap();
        let decrypted = manager.decrypt_wallet_data(&encrypted, password).await.unwrap();
        
        assert_eq!(wallet_data, decrypted.as_slice());
    }

    #[tokio::test]
    async fn test_wallet_data_encryption_wrong_password() {
        let manager = EncryptionManager::new().unwrap();
        
        let wallet_data = b"{\"id\":\"test_wallet\",\"address\":\"0x1234\"}";
        let password = "test_password_123";
        let wrong_password = "wrong_password";
        
        let encrypted = manager.encrypt_wallet_data(wallet_data, password).await.unwrap();
        let result = manager.decrypt_wallet_data(&encrypted, wrong_password).await;
        
        assert!(result.is_err());
    }

    #[test]
    fn test_encrypted_data_creation() {
        let data = vec![1, 2, 3, 4, 5];
        let algorithm = "AES-256-GCM".to_string();
        
        let encrypted_data = EncryptedData::new(data.clone(), algorithm.clone());
        
        assert_eq!(encrypted_data.data(), &data);
        assert_eq!(encrypted_data.algorithm(), algorithm);
    }

    #[test]
    fn test_encrypted_data_to_bytes() {
        let data = vec![1, 2, 3, 4, 5];
        let algorithm = "ChaCha20-Poly1305".to_string();
        
        let encrypted_data = EncryptedData::new(data.clone(), algorithm);
        let bytes = encrypted_data.to_bytes();
        
        assert_eq!(bytes, data);
    }
} 