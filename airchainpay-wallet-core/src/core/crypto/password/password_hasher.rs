use crate::shared::error::WalletError;
use crate::shared::WalletResult;
use argon2::{Argon2, PasswordHash, PasswordVerifier};
use pbkdf2::pbkdf2;
use rand_core::OsRng;
use rand_core::RngCore;
use zeroize::Zeroize;
use super::{PasswordConfig, PasswordAlgorithm};
use argon2::PasswordHasher;
use argon2::password_hash::SaltString;
use base64::Engine;

/// Secure password hasher
pub struct WalletPasswordHasher {
    config: PasswordConfig,
}

impl WalletPasswordHasher {
    pub fn new(config: PasswordConfig) -> Self {
        Self { config }
    }

    pub fn new_default() -> Self {
        Self::new(PasswordConfig::default())
    }

    /// Hash a password securely
    pub fn hash_password(&self, password: &str) -> WalletResult<String> {
        let salt = self.generate_salt();
        
        match self.config.algorithm {
            PasswordAlgorithm::Argon2 => self.hash_argon2(password, &salt),
            PasswordAlgorithm::PBKDF2 => self.hash_pbkdf2(password, &salt),
        }
    }

    /// Verify a password against a hash
    pub fn verify_password(&self, password: &str, hash: &str) -> WalletResult<bool> {
        match self.config.algorithm {
            PasswordAlgorithm::Argon2 => self.verify_argon2(password, hash),
            PasswordAlgorithm::PBKDF2 => self.verify_pbkdf2(password, hash),
        }
    }

    /// Generate a secure random salt
    fn generate_salt(&self) -> Vec<u8> {
        let mut salt = vec![0u8; self.config.salt_length];
        let mut rng = OsRng;
        rng.fill_bytes(&mut salt);
        salt
    }

    /// Hash password using Argon2
    fn hash_argon2(&self, password: &str, salt: &[u8]) -> WalletResult<String> {
        let argon2 = Argon2::new(
            argon2::Algorithm::Argon2id,
            argon2::Version::V0x13,
            argon2::Params::new(
                self.config.memory_cost,
                self.config.iterations,
                self.config.parallelism,
                Some(self.config.salt_length),
            ).map_err(|e| WalletError::crypto(e.to_string()))?,
        );

        let salt_str = SaltString::encode_b64(salt).unwrap();
        let password_hash = argon2.hash_password(
            password.as_bytes(),
            &salt_str,
        )?;

        Ok(password_hash.to_string())
    }

    /// Verify password using Argon2
    fn verify_argon2(&self, password: &str, hash: &str) -> WalletResult<bool> {
        let password_hash = PasswordHash::new(hash)?;
        Ok(Argon2::default().verify_password(password.as_bytes(), &password_hash).is_ok())
    }

    /// Hash password using PBKDF2
    ///
    /// PHC string format: $pbkdf2-sha256$<iterations>$<base64(salt)>$<base64(hash)>
    fn hash_pbkdf2(&self, password: &str, salt: &[u8]) -> WalletResult<String> {
        let mut key = vec![0u8; 32]; // 256-bit key
        pbkdf2::<hmac::Hmac<sha2::Sha256>>(
            password.as_bytes(),
            salt,
            self.config.iterations,
            &mut key,
        ).map_err(|e| WalletError::Crypto(format!("PBKDF2 error: {:?}", e)))?;
        let hash = format!(
            "$pbkdf2-sha256${}${}${}",
            self.config.iterations,
            base64::engine::general_purpose::STANDARD.encode(salt),
            base64::engine::general_purpose::STANDARD.encode(&key)
        );
        key.zeroize();
        Ok(hash)
    }

    /// Verify password using PBKDF2 (PHC string format)
    fn verify_pbkdf2(&self, password: &str, hash: &str) -> WalletResult<bool> {
        // PHC format: $pbkdf2-sha256$<iterations>$<base64(salt)>$<base64(hash)>
        let parts: Vec<&str> = hash.split('$').collect();
        if parts.len() != 5 || parts[1] != "pbkdf2-sha256" {
            return Err(WalletError::Crypto("Invalid PBKDF2 PHC hash format".to_string()));
        }
        let iterations: u32 = parts[2].parse()
            .map_err(|_| WalletError::Crypto("Invalid iterations in hash".to_string()))?;
        let salt = base64::engine::general_purpose::STANDARD.decode(parts[3])
            .map_err(|_| WalletError::Crypto("Invalid salt encoding".to_string()))?;
        let stored_key = base64::engine::general_purpose::STANDARD.decode(parts[4])
            .map_err(|_| WalletError::Crypto("Invalid key encoding".to_string()))?;
        let mut computed_key = vec![0u8; stored_key.len()];
        pbkdf2::<hmac::Hmac<sha2::Sha256>>(
            password.as_bytes(),
            &salt,
            iterations,
            &mut computed_key,
        ).map_err(|e| WalletError::Crypto(format!("PBKDF2 error: {:?}", e)))?;
        let result = computed_key == stored_key;
        computed_key.zeroize();
        Ok(result)
    }
}

impl Drop for WalletPasswordHasher {
    fn drop(&mut self) {
        // Clear any sensitive data
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_password_hasher_new() {
        let _hasher = WalletPasswordHasher::new_default();
        assert!(true); // Hasher created successfully
    }

    #[test]
    fn test_hash_password() {
        let hasher = WalletPasswordHasher::new_default();
        let password = "my_secure_password";
        
        let hash = hasher.hash_password(password).unwrap();
        assert!(!hash.is_empty());
        assert_ne!(hash, password);
    }

    #[test]
    fn test_verify_password() {
        let hasher = WalletPasswordHasher::new_default();
        let password = "my_secure_password";
        
        let hash = hasher.hash_password(password).unwrap();
        let is_valid = hasher.verify_password(password, &hash).unwrap();
        assert!(is_valid);
    }

    #[test]
    fn test_verify_wrong_password() {
        let hasher = WalletPasswordHasher::new_default();
        let password = "my_secure_password";
        let wrong_password = "wrong_password";
        
        let hash = hasher.hash_password(password).unwrap();
        let is_valid = hasher.verify_password(wrong_password, &hash).unwrap();
        assert!(!is_valid);
    }

    #[test]
    fn test_empty_password() {
        let hasher = WalletPasswordHasher::new_default();
        let password = "";
        
        let hash = hasher.hash_password(password).unwrap();
        let is_valid = hasher.verify_password(password, &hash).unwrap();
        assert!(is_valid);
    }

    #[test]
    fn test_long_password() {
        let hasher = WalletPasswordHasher::new_default();
        let password = "a".repeat(1000);
        
        let hash = hasher.hash_password(&password).unwrap();
        let is_valid = hasher.verify_password(&password, &hash).unwrap();
        assert!(is_valid);
    }

    #[test]
    fn test_different_salts_produce_different_hashes() {
        let hasher = WalletPasswordHasher::new_default();
        let password = "my_secure_password";
        
        let hash1 = hasher.hash_password(password).unwrap();
        let hash2 = hasher.hash_password(password).unwrap();
        
        assert_ne!(hash1, hash2);
    }
} 