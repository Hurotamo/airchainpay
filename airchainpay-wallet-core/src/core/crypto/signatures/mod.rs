//! Digital signature functionality for the wallet core
//! 
//! This module handles ECDSA signatures for transactions and messages.

use crate::shared::error::WalletError;
use crate::shared::types::{Transaction, SignedTransaction};
use secp256k1::{SecretKey, PublicKey, Secp256k1, Message};
use secp256k1::ecdsa::Signature;
use sha2::{Sha256, Digest};
use std::sync::Arc;

/// Transaction signature manager
pub struct SignatureManager {
    secp: Arc<Secp256k1<secp256k1::All>>,
}

impl SignatureManager {
    /// Create a new signature manager
    pub fn new() -> Result<Self, WalletError> {
        let secp = Secp256k1::new();
        Ok(Self {
            secp: Arc::new(secp),
        })
    }
    
    /// Sign a transaction (DEPRECATED: use sign_ethereum_transaction for EVM compatibility)
    // pub async fn sign_transaction(
    //     &self,
    //     transaction: &Transaction,
    //     private_key: &[u8],
    // ) -> Result<SignedTransaction, WalletError> {
    //     // Create the transaction hash
    //     let tx_hash = self.create_transaction_hash(transaction)?;
        
    //     // Create the message to sign
    //     let message = Message::from_digest(tx_hash);
        
    //     // Create the secret key
    //     let secret_key = SecretKey::from_byte_array(private_key.try_into()
    //         .map_err(|_| WalletError::validation("Invalid private key size"))?)
    //         .map_err(|e| WalletError::crypto(format!("Invalid private key: {}", e)))?;
        
    //     // Sign the message
    //     let signature = self.secp.sign_ecdsa(message, &secret_key);
        
    //     // Serialize the signature
    //     let signature_bytes = signature.serialize_compact();
        
    //     // Create the signed transaction
    //     let signed_tx = SignedTransaction {
    //         transaction: transaction.clone(),
    //         signature: signature_bytes.to_vec(),
    //         hash: format!("0x{}", hex::encode(&tx_hash)),
    //     };
        
    //     Ok(signed_tx)
    // }
    
    /// Verify a transaction signature
    pub async fn verify_transaction_signature(
        &self,
        signed_transaction: &SignedTransaction,
        public_key: &[u8],
    ) -> Result<bool, WalletError> {
        // Create the transaction hash
        let tx_hash = self.create_transaction_hash(&signed_transaction.transaction)?;
        
        // Create the message
        let message = Message::from_digest(tx_hash);
        
        // Create the public key
        let pub_key = PublicKey::from_slice(public_key)
            .map_err(|e| WalletError::crypto(format!("Invalid public key: {}", e)))?;
        
        // Parse the signature
        let signature = Signature::from_compact(&signed_transaction.signature)
            .map_err(|e| WalletError::crypto(format!("Invalid signature: {}", e)))?;
        
        // Verify the signature
        let is_valid = self.secp.verify_ecdsa(message, &signature, &pub_key).is_ok();
        
        Ok(is_valid)
    }
    
    /// Sign a message
    pub async fn sign_message(
        &self,
        message: &[u8],
        private_key: &[u8],
    ) -> Result<Vec<u8>, WalletError> {
        // Hash the message
        let mut hasher = Sha256::new();
        hasher.update(message);
        let message_hash = hasher.finalize();
        
        // Create the message to sign
        let secp_message = Message::from_digest(message_hash.into());
        
        // Create the secret key
        let secret_key = SecretKey::from_byte_array(private_key.try_into()
            .map_err(|_| WalletError::validation("Invalid private key size"))?)
            .map_err(|e| WalletError::crypto(format!("Invalid private key: {}", e)))?;
        
        // Sign the message
        let signature = self.secp.sign_ecdsa(secp_message, &secret_key);
        
        // Return the signature bytes
        Ok(signature.serialize_compact().to_vec())
    }
    
    /// Verify a message signature
    pub async fn verify_message_signature(
        &self,
        message: &[u8],
        signature: &[u8],
        public_key: &[u8],
    ) -> Result<bool, WalletError> {
        // Hash the message
        let mut hasher = Sha256::new();
        hasher.update(message);
        let message_hash = hasher.finalize();
        
        // Create the message
        let secp_message = Message::from_digest(message_hash.into());
        
        // Create the public key
        let pub_key = PublicKey::from_slice(public_key)
            .map_err(|e| WalletError::crypto(format!("Invalid public key: {}", e)))?;
        
        // Parse the signature
        let sig = Signature::from_compact(signature)
            .map_err(|e| WalletError::crypto(format!("Invalid signature: {}", e)))?;
        
        // Verify the signature
        let is_valid = self.secp.verify_ecdsa(secp_message, &sig, &pub_key).is_ok();
        
        Ok(is_valid)
    }
    
    /// Create a transaction hash for signing
    fn create_transaction_hash(&self, transaction: &Transaction) -> Result<[u8; 32], WalletError> {
        // Create a deterministic representation of the transaction
        let tx_data = format!(
            "{}:{}:{}:{}:{}:{}",
            transaction.to,
            transaction.value,
            transaction.chain_id,
            transaction.gas_limit.unwrap_or(21000),
            transaction.gas_price.unwrap_or(20000000000),
            transaction.nonce.unwrap_or(0)
        );
        
        // Hash the transaction data
        let mut hasher = Sha256::new();
        hasher.update(tx_data.as_bytes());
        let hash = hasher.finalize();
        
        Ok(hash.into())
    }
    
    /// Initialize the signature manager
    pub async fn init(&self) -> Result<(), WalletError> {
        // Initialize cryptographic libraries
        let _secp = Secp256k1::new();
        Ok(())
    }
    
    /// Cleanup the signature manager
    pub async fn cleanup(&self) -> Result<(), WalletError> {
        // No cleanup needed for signature manager
        Ok(())
    }

    pub fn sign_ethereum_transaction(&self, _transaction: &crate::shared::types::Transaction, _private_key: &crate::core::crypto::keys::SecurePrivateKey) -> Result<crate::core::crypto::signatures::TransactionSignature, crate::shared::error::WalletError> {
        Err(crate::shared::error::WalletError::not_implemented("sign_ethereum_transaction is not implemented"))
    }
}

/// Transaction signature wrapper
#[derive(Debug, Clone)]
pub struct TransactionSignature {
    pub r: Vec<u8>,
    pub s: Vec<u8>,
    pub v: u8,
}

impl TransactionSignature {
    /// Create a signature from raw components
    pub fn new(r: Vec<u8>, s: Vec<u8>, v: u8) -> Self {
        Self { r, s, v }
    }
    
    /// Create a signature from a compact signature
    pub fn from_compact(compact: &[u8]) -> Result<Self, WalletError> {
        if compact.len() != 64 {
            return Err(WalletError::validation("Invalid compact signature length"));
        }
        
        let r = compact[..32].to_vec();
        let s = compact[32..].to_vec();
        
        // For Ethereum, v is typically 27 or 28
        let v = 27;
        
        Ok(Self { r, s, v })
    }
    
    /// Convert to compact format
    pub fn to_compact(&self) -> Vec<u8> {
        let mut compact = Vec::new();
        compact.extend_from_slice(&self.r);
        compact.extend_from_slice(&self.s);
        compact
    }
    
    /// Convert to hex string
    pub fn to_hex(&self) -> String {
        let mut signature = Vec::new();
        signature.extend_from_slice(&self.r);
        signature.extend_from_slice(&self.s);
        signature.push(self.v);
        
        format!("0x{}", hex::encode(signature))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shared::types::Network;

    #[tokio::test]
    async fn test_signature_manager_creation() {
        let manager = SignatureManager::new().unwrap();
        assert!(manager.init().await.is_ok());
    }

    #[tokio::test]
    async fn test_message_signing() {
        let manager = SignatureManager::new().unwrap();
        
        let message = b"Hello, World!";
        let private_key = hex::decode("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef").unwrap();
        
        let signature = manager.sign_message(message, &private_key).await.unwrap();
        assert_eq!(signature.len(), 64);
    }

    #[tokio::test]
    async fn test_message_verification() {
        let manager = SignatureManager::new().unwrap();
        
        let message = b"Hello, World!";
        let private_key = hex::decode("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef").unwrap();
        
        // Get the public key
        let secp = Secp256k1::new();
        let secret_key = SecretKey::from_byte_array(private_key.try_into().unwrap()).unwrap();
        let public_key = PublicKey::from_secret_key(&secp, &secret_key);
        
        let signature = manager.sign_message(message, &private_key).await.unwrap();
        let is_valid = manager.verify_message_signature(message, &signature, &public_key.serialize()).await.unwrap();
        
        assert!(is_valid);
    }

    #[tokio::test]
    async fn test_transaction_signing() {
        let manager = SignatureManager::new().unwrap();
        
        let transaction = Transaction {
            to: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6".to_string(),
            value: "1000000000000000000".to_string(),
            data: None,
            gas_limit: Some(21000),
            gas_price: Some(20000000000),
            nonce: Some(0),
            chain_id: 1114,
        };
        
        let private_key = hex::decode("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef").unwrap();
        
        let signed_tx = manager.sign_transaction(&transaction, &private_key).await.unwrap();
        
        assert!(!signed_tx.signature.is_empty());
        assert!(signed_tx.hash.starts_with("0x"));
    }

    #[tokio::test]
    async fn test_transaction_verification() {
        let manager = SignatureManager::new().unwrap();
        
        let transaction = Transaction {
            to: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6".to_string(),
            value: "1000000000000000000".to_string(),
            data: None,
            gas_limit: Some(21000),
            gas_price: Some(20000000000),
            nonce: Some(0),
            chain_id: 1114,
        };
        
        let private_key = hex::decode("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef").unwrap();
        
        // Get the public key
        let secp = Secp256k1::new();
        let secret_key = SecretKey::from_byte_array(private_key.try_into().unwrap()).unwrap();
        let public_key = PublicKey::from_secret_key(&secp, &secret_key);
        
        let signed_tx = manager.sign_transaction(&transaction, &private_key).await.unwrap();
        let is_valid = manager.verify_transaction_signature(&signed_tx, &public_key.serialize()).await.unwrap();
        
        assert!(is_valid);
    }

    #[test]
    fn test_transaction_signature_creation() {
        let r = vec![1u8; 32];
        let s = vec![2u8; 32];
        let v = 27;
        
        let signature = TransactionSignature::new(r.clone(), s.clone(), v);
        
        assert_eq!(signature.r, r);
        assert_eq!(signature.s, s);
        assert_eq!(signature.v, v);
    }

    #[test]
    fn test_transaction_signature_from_compact() {
        let compact = vec![1u8; 64];
        let signature = TransactionSignature::from_compact(&compact).unwrap();
        
        assert_eq!(signature.r.len(), 32);
        assert_eq!(signature.s.len(), 32);
        assert_eq!(signature.v, 27);
    }

    #[test]
    fn test_transaction_signature_to_hex() {
        let r = vec![1u8; 32];
        let s = vec![2u8; 32];
        let v = 27;
        
        let signature = TransactionSignature::new(r, s, v);
        let hex = signature.to_hex();
        
        assert!(hex.starts_with("0x"));
        assert_eq!(hex.len(), 132); // 64 bytes + 0x prefix
    }
} 