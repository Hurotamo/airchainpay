//! Digital signature functionality for the wallet core
//!
//! This module handles ECDSA signatures for transactions and messages.

pub mod signature_manager;
pub mod transaction_signature;

// Re-export all public items from submodules
pub use signature_manager::*;
pub use transaction_signature::*;

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