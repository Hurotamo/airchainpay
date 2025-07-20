use crate::error::{WalletError, WalletResult};
use crate::types::SecurePrivateKey;
use secp256k1::{SecretKey, PublicKey, Secp256k1, Message, Signature};
use sha3::{Keccak256, Digest};
use zeroize::Zeroize;

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
            .map_err(|e| WalletError::InvalidPrivateKey(e.to_string()))?;

        // Hash the message
        let mut hasher = Keccak256::new();
        hasher.update(message);
        let message_hash = hasher.finalize();

        // Create secp256k1 message
        let secp_message = Message::from_slice(&message_hash)
            .map_err(|e| WalletError::Crypto(format!("Invalid message: {}", e)))?;

        // Sign the message
        let signature = self.secp.sign(&secp_message, &secret_key);
        
        Ok(signature)
    }

    /// Verify a signature
    pub fn verify_signature(&self, message: &[u8], signature: &Signature, public_key: &PublicKey) -> WalletResult<bool> {
        // Hash the message
        let mut hasher = Keccak256::new();
        hasher.update(message);
        let message_hash = hasher.finalize();

        // Create secp256k1 message
        let secp_message = Message::from_slice(&message_hash)
            .map_err(|e| WalletError::Crypto(format!("Invalid message: {}", e)))?;

        // Verify the signature
        Ok(self.secp.verify(&secp_message, signature, public_key).is_ok())
    }

    /// Sign Ethereum transaction
    pub fn sign_transaction(&self, transaction_data: &[u8], private_key: &SecurePrivateKey, chain_id: u64) -> WalletResult<TransactionSignature> {
        let secret_key = SecretKey::from_slice(private_key.as_bytes())
            .map_err(|e| WalletError::InvalidPrivateKey(e.to_string()))?;

        // Hash the transaction data
        let mut hasher = Keccak256::new();
        hasher.update(transaction_data);
        let transaction_hash = hasher.finalize();

        // Create secp256k1 message
        let secp_message = Message::from_slice(&transaction_hash)
            .map_err(|e| WalletError::Crypto(format!("Invalid transaction: {}", e)))?;

        // Sign the transaction
        let signature = self.secp.sign(&secp_message, &secret_key);
        
        // Get signature components
        let (r, s) = signature.split();
        let v = self.calculate_v(&secp_message, &signature, &secret_key.public_key(&self.secp), chain_id);

        Ok(TransactionSignature {
            r: r.to_string(),
            s: s.to_string(),
            v,
            signature: signature.to_string(),
        })
    }

    /// Calculate the v value for Ethereum signatures
    fn calculate_v(&self, message: &Message, signature: &Signature, public_key: &PublicKey, chain_id: u64) -> u8 {
        // Standard Ethereum v calculation
        let mut v = signature.serialize_compact()[64];
        
        // Adjust for chain_id
        if chain_id > 0 {
            v += (chain_id * 2 + 35) as u8;
        }
        
        v
    }

    /// Recover public key from signature
    pub fn recover_public_key(&self, message: &[u8], signature: &Signature, v: u8) -> WalletResult<PublicKey> {
        // Hash the message
        let mut hasher = Keccak256::new();
        hasher.update(message);
        let message_hash = hasher.finalize();

        // Create secp256k1 message
        let secp_message = Message::from_slice(&message_hash)
            .map_err(|e| WalletError::Crypto(format!("Invalid message: {}", e)))?;

        // Recover public key
        let public_key = self.secp.recover(&secp_message, signature)
            .map_err(|e| WalletError::Crypto(format!("Failed to recover public key: {}", e)))?;

        Ok(public_key)
    }

    /// Sign BLE payment data
    pub fn sign_ble_payment(&self, payment_data: &[u8], private_key: &SecurePrivateKey) -> WalletResult<String> {
        let signature = self.sign_message(payment_data, private_key)?;
        Ok(signature.to_string())
    }

    /// Verify BLE payment signature
    pub fn verify_ble_payment(&self, payment_data: &[u8], signature: &str, public_key: &PublicKey) -> WalletResult<bool> {
        let signature_obj = Signature::from_str(signature)
            .map_err(|e| WalletError::Crypto(format!("Invalid signature format: {}", e)))?;
        
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
            .map_err(|e| WalletError::Crypto(format!("Invalid signature format: {}", e)))?;
        
        self.verify_signature(payment_data, &signature_obj, public_key)
    }
}

impl Drop for SignatureManager {
    fn drop(&mut self) {
        // Clear any sensitive data
    }
}

/// Transaction signature structure
#[derive(Debug, Clone)]
pub struct TransactionSignature {
    pub r: String,
    pub s: String,
    pub v: u8,
    pub signature: String,
}

impl TransactionSignature {
    pub fn to_hex(&self) -> String {
        format!("0x{}{}{:02x}", self.r, self.s, self.v)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::keys::KeyManager;

    #[test]
    fn test_message_signing() {
        let signature_manager = SignatureManager::new();
        let key_manager = KeyManager::new();
        
        let private_key = key_manager.generate_private_key().unwrap();
        let public_key = key_manager.public_key_from_private(&private_key).unwrap();
        
        let message = b"Hello, World!";
        let signature = signature_manager.sign_message(message, &private_key).unwrap();
        
        assert!(signature_manager.verify_signature(message, &signature, &public_key).unwrap());
    }

    #[test]
    fn test_transaction_signing() {
        let signature_manager = SignatureManager::new();
        let key_manager = KeyManager::new();
        
        let private_key = key_manager.generate_private_key().unwrap();
        
        let transaction_data = b"transaction_data_here";
        let chain_id = 1;
        
        let signature = signature_manager.sign_transaction(transaction_data, &private_key, chain_id).unwrap();
        
        assert!(!signature.r.is_empty());
        assert!(!signature.s.is_empty());
        assert!(signature.v > 0);
    }
} 