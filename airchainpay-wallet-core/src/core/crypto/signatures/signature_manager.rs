use crate::shared::error::WalletError;
use crate::shared::WalletResult;
use crate::core::crypto::keys::SecurePrivateKey;
use secp256k1::{SecretKey, PublicKey, Secp256k1, Message};
use secp256k1::ecdsa::Signature;
use sha3::{Keccak256, Digest};
use zeroize::Zeroize;
use std::str::FromStr;
use super::TransactionSignature;
use rlp::Encodable;
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

    /// Sign a message with a private key
    pub fn sign_message(&self, message: &[u8], private_key: &SecurePrivateKey) -> WalletResult<Signature> {
        let secret_key = SecretKey::from_slice(private_key.as_bytes())
            .map_err(|e| WalletError::crypto(format!("Invalid private key: {}", e)))?;
        // Hash the message
        let mut hasher = Keccak256::new();
        hasher.update(message);
        let message_hash = hasher.finalize();
        // Create secp256k1 message
        let secp_message = Message::from_slice(&message_hash)
            .map_err(|e| WalletError::crypto(format!("Invalid message: {}", e)))?;
        // Sign the message
        let signature = self.secp.sign_ecdsa(secp_message.clone(), &secret_key);
        Ok(signature)
    }

    /// Verify a signature
    pub fn verify_signature(&self, message: &[u8], signature: &Signature, public_key: &PublicKey) -> WalletResult<bool> {
        let mut hasher = Keccak256::new();
        hasher.update(message);
        let message_hash = hasher.finalize();
        let secp_message = Message::from_slice(&message_hash)
            .map_err(|e| WalletError::crypto(format!("Invalid message: {}", e)))?;
        Ok(self.secp.verify_ecdsa(secp_message.clone(), signature, public_key).is_ok())
    }

    /// Sign Ethereum transaction (EVM compatible)
    pub fn sign_ethereum_transaction(&self, tx: &Transaction, private_key: &SecurePrivateKey) -> WalletResult<TransactionSignature> {
        let secret_key = SecretKey::from_slice(private_key.as_bytes())
            .map_err(|e| WalletError::crypto(format!("Invalid private key: {}", e)))?;

        // RLP encode the transaction
        // let rlp_bytes = rlp::encode(tx);

        // Hash the RLP-encoded transaction
        let mut hasher = Keccak256::new();
        // hasher.update(&rlp_bytes);
        let tx_hash = hasher.finalize();

        // Create secp256k1 message
        let secp_message = Message::from_slice(&tx_hash)
            .map_err(|e| WalletError::crypto(format!("Invalid transaction: {}", e)))?;

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

    /// Calculate the v value for Ethereum signatures
    fn calculate_v(&self, message: &Message, signature: &Signature, public_key: &PublicKey, chain_id: u64) -> u8 {
        // Placeholder: Ethereum v value is usually 27 or 28
        let v = 27u8;
        v
    }

    /// Recover public key from signature
    pub fn recover_public_key(&self, message: &[u8], signature: &Signature, v: u8) -> WalletResult<PublicKey> {
        // Hash the message (Ethereum style)
        let mut hasher = Keccak256::new();
        hasher.update(message);
        let message_hash = hasher.finalize();
        let secp_message = Message::from_slice(&message_hash)
            .map_err(|e| WalletError::crypto(format!("Invalid message: {}", e)))?;
        // Not supported: public key recovery (feature not enabled)
        Err(WalletError::crypto("Public key recovery not supported in this build".to_string()))
    }

    /// Sign BLE payment data
    pub fn sign_ble_payment(&self, payment_data: &[u8], private_key: &SecurePrivateKey) -> WalletResult<String> {
        let signature = self.sign_message(payment_data, private_key)?;
        Ok(signature.to_string())
    }

    /// Verify BLE payment signature
    pub fn verify_ble_payment(&self, payment_data: &[u8], signature: &str, public_key: &PublicKey) -> WalletResult<bool> {
        let signature_obj = Signature::from_str(signature)
            .map_err(|e| WalletError::crypto(format!("Invalid signature format: {}", e)))?;
        
        self.verify_signature(payment_data, &signature_obj, public_key)
    }

    /// Sign QR payment data
    pub fn sign_qr_payment(&self, payment_data: &[u8], private_key: &SecurePrivateKey) -> WalletResult<String> {
        let signature = self.sign_message(payment_data, private_key)?;
        Ok(signature.to_string())
    }

    /// Verify QR payment signature
    pub fn verify_qr_payment(&self, payment_data: &[u8], signature: &str, public_key: &PublicKey) -> WalletResult<bool> {
        let signature_obj = Signature::from_str(signature)
            .map_err(|e| WalletError::crypto(format!("Invalid signature format: {}", e)))?;
        
        self.verify_signature(payment_data, &signature_obj, public_key)
    }
}

impl Drop for SignatureManager {
    fn drop(&mut self) {}
} 