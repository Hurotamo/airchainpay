use crate::shared::error::WalletError;
use crate::shared::WalletResult;
use crate::core::crypto::keys::SecurePrivateKey;
use secp256k1::{SecretKey, PublicKey, Secp256k1, Message};
use secp256k1::ecdsa::{Signature, RecoverableSignature, RecoveryId};
use sha3::{Keccak256, Digest};
use std::str::FromStr;
use super::TransactionSignature;
use crate::shared::types::Transaction;
use ethers::types::U256;
use rlp::RlpStream;

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
        // Keep legacy API for compatibility, but prefer sign_legacy_raw for production
        let (raw_tx, _hash) = self.sign_legacy_raw(tx, key_bytes)?;
        // Extract r,s,v for compatibility reporting
        // Not strictly needed by callers that use raw_tx
        Ok(TransactionSignature {
            r: String::new(),
            s: String::new(),
            v: 0u8,
            signature: hex::encode(raw_tx),
        })
    }

    /// Sign Ethereum transaction (EVM compatible) - legacy method
    pub fn sign_ethereum_transaction(&self, _tx: &Transaction, _private_key: &SecurePrivateKey) -> WalletResult<TransactionSignature> {
        // This method is deprecated - use sign_ethereum_transaction_with_bytes instead
        Err(WalletError::crypto("Use sign_ethereum_transaction_with_bytes instead".to_string()))
    }

    /// Calculate the v value for Ethereum signatures
    fn calculate_v_eip155(&self, rec_id: RecoveryId, chain_id: u64) -> u64 {
        let rec_num: i32 = i32::from(rec_id);
        (rec_num as u64) + 35 + 2 * chain_id
    }

    fn u256_to_bytes_be(val: U256) -> Vec<u8> {
        if val.is_zero() {
            return Vec::new();
        }
        let mut buf = [0u8; 32];
        val.to_big_endian(&mut buf);
        let first_non_zero = buf.iter().position(|&b| b != 0).unwrap_or(31);
        buf[first_non_zero..].to_vec()
    }

    fn encode_legacy_signing_payload(
        &self,
        tx: &Transaction,
        nonce: u64,
        gas_price: u64,
        gas_limit: u64,
        to_bytes: Vec<u8>,
        value_bytes: Vec<u8>,
        data_bytes: Vec<u8>,
    ) -> Vec<u8> {
        let mut s = RlpStream::new_list(9);
        s.append(&nonce);
        s.append(&gas_price);
        s.append(&gas_limit);
        if to_bytes.is_empty() {
            s.append_empty_data();
        } else {
            s.append(&to_bytes.as_slice());
        }
        s.append(&value_bytes.as_slice());
        s.append(&data_bytes.as_slice());
        s.append(&tx.chain_id);
        s.append_empty_data();
        s.append_empty_data();
        s.out().to_vec()
    }

    fn encode_legacy_raw_tx(
        &self,
        nonce: u64,
        gas_price: u64,
        gas_limit: u64,
        to_bytes: Vec<u8>,
        value_bytes: Vec<u8>,
        data_bytes: Vec<u8>,
        v: U256,
        r: Vec<u8>,
        s: Vec<u8>,
    ) -> Vec<u8> {
        let mut st = RlpStream::new_list(9);
        st.append(&nonce);
        st.append(&gas_price);
        st.append(&gas_limit);
        if to_bytes.is_empty() {
            st.append_empty_data();
        } else {
            st.append(&to_bytes.as_slice());
        }
        st.append(&value_bytes.as_slice());
        st.append(&data_bytes.as_slice());
        let mut v_bytes = [0u8; 32];
        v.to_big_endian(&mut v_bytes);
        let v_trim = Self::u256_to_bytes_be(v);
        st.append(&v_trim.as_slice());
        st.append(&r.as_slice());
        st.append(&s.as_slice());
        st.out().to_vec()
    }

    /// Sign a legacy (pre-1559) Ethereum transaction with EIP-155 semantics and return raw tx and tx hash
    pub fn sign_legacy_raw(&self, tx: &Transaction, key_bytes: &[u8]) -> WalletResult<(Vec<u8>, String)> {
        let secret_key = SecretKey::from_byte_array(key_bytes.try_into().map_err(|_| WalletError::crypto("Invalid private key length".to_string()))?)
            .map_err(|e| WalletError::crypto(format!("Invalid private key: {}", e)))?;

        let nonce = tx.nonce.ok_or_else(|| WalletError::validation("Missing nonce"))?;
        let gas_price = tx.gas_price.ok_or_else(|| WalletError::validation("Missing gas price"))?;
        let gas_limit = tx.gas_limit.ok_or_else(|| WalletError::validation("Missing gas limit"))?;

        let to_bytes = if tx.to.is_empty() { Vec::new() } else { hex::decode(tx.to.trim_start_matches("0x")).map_err(|_| WalletError::validation("Invalid to address"))? };
        let value_u256 = U256::from_dec_str(&tx.value).map_err(|_| WalletError::validation("Invalid value"))?;
        let value_bytes = Self::u256_to_bytes_be(value_u256);
        let data_bytes = tx.data.clone().unwrap_or_default();

        // Signing payload per EIP-155
        let signing_rlp = self.encode_legacy_signing_payload(tx, nonce, gas_price, gas_limit, to_bytes.clone(), value_bytes.clone(), data_bytes.clone());
        let mut hasher = Keccak256::new();
        hasher.update(&signing_rlp);
        let sighash = hasher.finalize();
        let msg = Message::from_digest(sighash.as_slice().try_into().map_err(|_| WalletError::crypto("Invalid tx hash length"))?);

        let rec_sig: RecoverableSignature = self.secp.sign_ecdsa_recoverable(msg, &secret_key);
        let (rec_id, compact) = rec_sig.serialize_compact();
        let r = compact[0..32].to_vec();
        let s = compact[32..64].to_vec();
        let v_num = self.calculate_v_eip155(rec_id, tx.chain_id);
        let v_u256 = U256::from(v_num);

        // Raw tx assembly
        let raw_tx = self.encode_legacy_raw_tx(nonce, gas_price, gas_limit, to_bytes, value_bytes, data_bytes, v_u256, r.clone(), s.clone());
        let mut hasher2 = Keccak256::new();
        hasher2.update(&raw_tx);
        let tx_hash = format!("0x{}", hex::encode(hasher2.finalize()));
        Ok((raw_tx, tx_hash))
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