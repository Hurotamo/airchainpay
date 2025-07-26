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


    #[test]
    fn test_signature_manager_new() {
        let _manager = SignatureManager::new();
        assert!(true); // Manager created successfully
    }

    #[test]
    fn test_sign_ble_payment() {
        let manager = SignatureManager::new();
        let payment_data = b"payment_data";
        let private_key = [1u8; 32];
        
        let signature = manager.sign_ble_payment_with_bytes(payment_data, &private_key).unwrap();
        assert!(!signature.is_empty());
    }

    #[test]
    fn test_sign_qr_payment() {
        let manager = SignatureManager::new();
        let payment_data = b"qr_payment_data";
        let private_key = [1u8; 32];
        
        let signature = manager.sign_qr_payment_with_bytes(payment_data, &private_key).unwrap();
        assert!(!signature.is_empty());
    }

    #[test]
    fn test_empty_message() {
        let manager = SignatureManager::new();
        let payment_data = b"";
        let private_key = [1u8; 32];
        
        let signature = manager.sign_ble_payment_with_bytes(payment_data, &private_key).unwrap();
        assert!(!signature.is_empty());
    }

    #[test]
    fn test_large_message() {
        let manager = SignatureManager::new();
        let payment_data = b"x".repeat(1000);
        let private_key = [1u8; 32];
        
        let signature = manager.sign_ble_payment_with_bytes(&payment_data, &private_key).unwrap();
        assert!(!signature.is_empty());
    }
} 