//! Storage repository for data access
//! 
//! This module handles secure storage operations.

use crate::shared::error::WalletError;
use async_trait::async_trait;
use crate::infrastructure::platform::FileStorage;

/// Storage repository trait
#[async_trait]
pub trait StorageRepository {
    /// Store encrypted data
    async fn store(&self, key: &str, data: &[u8]) -> Result<(), WalletError>;
    
    /// Retrieve encrypted data
    async fn retrieve(&self, key: &str) -> Result<Vec<u8>, WalletError>;
    
    /// Delete stored data
    async fn delete(&self, key: &str) -> Result<(), WalletError>;
    
    /// Check if key exists
    async fn exists(&self, key: &str) -> Result<bool, WalletError>;
}

#[async_trait]
impl StorageRepository for FileStorage {
    async fn store(&self, key: &str, data: &[u8]) -> Result<(), WalletError> {
        FileStorage::store(self, key, data).await
    }
    async fn retrieve(&self, key: &str) -> Result<Vec<u8>, WalletError> {
        FileStorage::retrieve(self, key).await
    }
    async fn delete(&self, key: &str) -> Result<(), WalletError> {
        FileStorage::delete(self, key).await
    }
    async fn exists(&self, key: &str) -> Result<bool, WalletError> {
        FileStorage::exists(self, key).await
    }
} 