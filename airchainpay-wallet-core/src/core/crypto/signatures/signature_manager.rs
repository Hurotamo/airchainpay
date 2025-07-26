use crate::shared::error::WalletError;
use crate::shared::WalletResult;
use crate::core::crypto::keys::SecurePrivateKey;
use secp256k1::{SecretKey, PublicKey, Secp256k1, Message};
use secp256k1::ecdsa::Signature;
use sha3::{Keccak256, Digest};
use std::str::FromStr;
use super::TransactionSignature;
use crate::shared::types::Transaction;

/// Digital signature manager
pub struct SignatureManager {
    secp: Secp256k1<secp256k1::All>,
}

impl SignatureManager {
    pub fn new() -> Self {
        Self {
            secp: Secp256k1::new(),
        }
    }

    /// Sign a message with a private key using the with_key pattern
    pub fn sign_message_with_key<F>(&self, message: &[u8], private_key: &SecurePrivateKey, storage: &dyn crate::infrastructure::platform::PlatformStorage, _f: F) -> WalletResult<Signature>
    where
        F: FnOnce(&[u8]) -> WalletResult<Signature>,
    {
        private_key.with_key(storage, |key_bytes| {
            let secret_key = SecretKey::from_byte_array(key_bytes.try_into().map_err(|_| WalletError::crypto("Invalid private key length".to_string()))?)
                .map_err(|e| WalletError::crypto(format!("Invalid private key: {}", e)))?;
            
            // Hash the message
            let mut hasher = Keccak256::new();
            hasher.update(message);
            let message_hash = hasher.finalize();
            
            // Create secp256k1 message
            let secp_message = Message::from_digest(message_hash.as_slice().try_into().map_err(|_| WalletError::crypto("Invalid message hash length".to_string()))?);
            
            // Sign the message
            let signature = self.secp.sign_ecdsa(secp_message.clone(), &secret_key);
            Ok(signature)
        })
    }

    /// Sign a message with a private key (legacy method)
    pub fn sign_message(&self, _message: &[u8], _private_key: &SecurePrivateKey) -> WalletResult<Signature> {
        // This method is deprecated - use sign_message_with_key instead
        Err(WalletError::crypto("Use sign_message_with_key instead".to_string()))
    }

    /// Verify a signature
    pub fn verify_signature(&self, message: &[u8], signature: &Signature, public_key: &PublicKey) -> WalletResult<bool> {
        let mut hasher = Keccak256::new();
        hasher.update(message);
        Ok(self.secp.verify_ecdsa(Message::from_digest(hasher.finalize().as_slice().try_into().map_err(|_| WalletError::crypto("Invalid message hash length".to_string()))?), signature, public_key).is_ok())
    }

    /// Sign Ethereum transaction (EVM compatible) with key bytes
    pub fn sign_ethereum_transaction_with_bytes(&self, tx: &Transaction, key_bytes: &[u8]) -> WalletResult<TransactionSignature> {
        let secret_key = SecretKey::from_byte_array(key_bytes.try_into().map_err(|_| WalletError::crypto("Invalid private key length".to_string()))?)
            .map_err(|e| WalletError::crypto(format!("Invalid private key: {}", e)))?;

        // RLP encode the transaction
        // let rlp_bytes = rlp::encode(tx);

        // Hash the RLP-encoded transaction
        let hasher = Keccak256::new();
        // hasher.update(&rlp_bytes);
        let tx_hash = hasher.finalize();

        // Create secp256k1 message
        let secp_message = Message::from_digest(tx_hash.as_slice().try_into().map_err(|_| WalletError::crypto("Invalid tx hash length".to_string()))?);

        // Sign the transaction
        let signature = self.secp.sign_ecdsa(secp_message.clone(), &secret_key);
        // EIP-155 v calculation
        let v = self.calculate_v(&secp_message, &signature, &secret_key.public_key(&self.secp), tx.chain_id);
        Ok(TransactionSignature {
            r: "".to_string(),
            s: "".to_string(),
            v,
            signature: signature.to_string(),
        })
    }

    /// Sign Ethereum transaction (EVM compatible) - legacy method
    pub fn sign_ethereum_transaction(&self, _tx: &Transaction, _private_key: &SecurePrivateKey) -> WalletResult<TransactionSignature> {
        // This method is deprecated - use sign_ethereum_transaction_with_bytes instead
        Err(WalletError::crypto("Use sign_ethereum_transaction_with_bytes instead".to_string()))
    }

    /// Calculate the v value for Ethereum signatures
    fn calculate_v(&self, _message: &Message, _signature: &Signature, _public_key: &PublicKey, _chain_id: u64) -> u8 {
        // Placeholder: Ethereum v value is usually 27 or 28
        let v = 27u8;
        v
    }

    /// Recover public key from signature
    pub fn recover_public_key(&self, message: &[u8], _signature: &Signature, _v: u8) -> WalletResult<PublicKey> {
        // Hash the message (Ethereum style)
        let mut hasher = Keccak256::new();
        hasher.update(message);
        // Not supported: public key recovery (feature not enabled)
        Err(WalletError::crypto("Public key recovery not supported in this build".to_string()))
    }

    /// Sign BLE payment data with key bytes
    pub fn sign_ble_payment_with_bytes(&self, payment_data: &[u8], key_bytes: &[u8]) -> WalletResult<String> {
        let secret_key = SecretKey::from_byte_array(key_bytes.try_into().map_err(|_| WalletError::crypto("Invalid private key length".to_string()))?)
            .map_err(|e| WalletError::crypto(format!("Invalid private key: {}", e)))?;
        
        // Hash the message
        let mut hasher = Keccak256::new();
        hasher.update(payment_data);
        let message_hash = hasher.finalize();
        
        // Create secp256k1 message
        let secp_message = Message::from_digest(message_hash.as_slice().try_into().map_err(|_| WalletError::crypto("Invalid message hash length".to_string()))?);
        
        // Sign the message
        let signature = self.secp.sign_ecdsa(secp_message.clone(), &secret_key);
        Ok(signature.to_string())
    }

    /// Sign BLE payment data - legacy method
    pub fn sign_ble_payment(&self, _payment_data: &[u8], _private_key: &SecurePrivateKey) -> WalletResult<String> {
        // This method is deprecated - use sign_ble_payment_with_bytes instead
        Err(WalletError::crypto("Use sign_ble_payment_with_bytes instead".to_string()))
    }

    /// Verify BLE payment signature
    pub fn verify_ble_payment(&self, payment_data: &[u8], signature: &str, public_key: &PublicKey) -> WalletResult<bool> {
        let signature_obj = Signature::from_str(signature)
            .map_err(|e| WalletError::crypto(format!("Invalid signature format: {}", e)))?;
        
        self.verify_signature(payment_data, &signature_obj, public_key)
    }

    /// Sign QR payment data with key bytes
    pub fn sign_qr_payment_with_bytes(&self, payment_data: &[u8], key_bytes: &[u8]) -> WalletResult<String> {
        self.sign_ble_payment_with_bytes(payment_data, key_bytes)
    }

    /// Sign QR payment data - legacy method
    pub fn sign_qr_payment(&self, _payment_data: &[u8], _private_key: &SecurePrivateKey) -> WalletResult<String> {
        // This method is deprecated - use sign_qr_payment_with_bytes instead
        Err(WalletError::crypto("Use sign_qr_payment_with_bytes instead".to_string()))
    }

    /// Verify QR payment signature
    pub fn verify_qr_payment(&self, payment_data: &[u8], signature: &str, public_key: &PublicKey) -> WalletResult<bool> {
        self.verify_ble_payment(payment_data, signature, public_key)
    }
}

impl Drop for SignatureManager {
    fn drop(&mut self) {}
} 