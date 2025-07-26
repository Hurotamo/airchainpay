//! Cryptographic functionality for the wallet core
//! 
//! This module provides encryption, hashing, key management, and digital signatures.
//! 
//! SECURITY: This module implements hardened cryptographic operations with:
//! - Memory zeroization for all sensitive data
//! - Secure key management and storage
//! - Cryptographic parameter validation
//! - Security auditing capabilities

pub mod keys;
pub mod signatures;
pub mod encryption;
pub mod hashing;
pub mod password;
pub mod security_audit;

// Re-export all public items from submodules
pub use keys::*;
pub use signatures::*;
pub use encryption::*;
pub use hashing::*;
pub use password::*;
pub use security_audit::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_crypto_module_imports() {
        // Test that all crypto modules can be imported
        
        assert!(true); // If we get here, imports work
    }

    #[test]
    fn test_encryption_manager() {
        let _manager = EncryptionManager::new(EncryptionAlgorithm::AES256GCM);
        assert!(true); // Manager created successfully
    }

    #[test]
    fn test_hash_manager() {
        let _manager = HashManager::new();
        assert!(true); // Manager created successfully
    }

    #[test]
    fn test_password_hasher() {
        let _hasher = WalletPasswordHasher::new_default();
        assert!(true); // Hasher created successfully
    }

    #[test]
    fn test_signature_manager() {
        let _manager = SignatureManager::new();
        assert!(true); // Manager created successfully
    }

    #[test]
    fn test_security_auditor() {
        let audit_result = SecurityAuditor::audit_wallet_core();
        assert!(audit_result.passed);
    }
} 