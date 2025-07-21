use crate::error::{WalletError, WalletResult};
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier, PasswordHashString};
use pbkdf2::{pbkdf2, pbkdf2_verify};
use rand::{Rng, RngCore};
use zeroize::Zeroize;
use super::{PasswordConfig, PasswordAlgorithm};

/// Secure password hasher
pub struct PasswordHasher {
    config: PasswordConfig,
}

impl PasswordHasher {
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
        rand::thread_rng().fill_bytes(&mut salt);
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
            )?,
        );

        let password_hash = argon2.hash_password(
            password.as_bytes(),
            salt,
        )?;

        Ok(password_hash.to_string())
    }

    /// Verify password using Argon2
    fn verify_argon2(&self, password: &str, hash: &str) -> WalletResult<bool> {
        let parsed_hash = PasswordHashString::new(hash)?;
        let password_hash = PasswordHash::new(&parsed_hash)?;
        
        Ok(Argon2::default().verify_password(password.as_bytes(), &password_hash).is_ok())
    }

    /// Hash password using PBKDF2
    fn hash_pbkdf2(&self, password: &str, salt: &[u8]) -> WalletResult<String> {
        let mut key = vec![0u8; 32]; // 256-bit key
        
        pbkdf2::<hmac::Hmac<sha2::Sha256>>(
            password.as_bytes(),
            salt,
            self.config.iterations,
            &mut key,
        );

        let hash = format!(
            "pbkdf2:sha256:{}:{}:{}",
            self.config.iterations,
            base64::encode(salt),
            base64::encode(&key)
        );

        // Zero out the key
        key.zeroize();
        
        Ok(hash)
    }

    /// Verify password using PBKDF2
    fn verify_pbkdf2(&self, password: &str, hash: &str) -> WalletResult<bool> {
        let parts: Vec<&str> = hash.split(':').collect();
        if parts.len() != 4 || parts[0] != "pbkdf2" {
            return Err(WalletError::Crypto("Invalid PBKDF2 hash format".to_string()));
        }

        let iterations: u32 = parts[2].parse()
            .map_err(|_| WalletError::Crypto("Invalid iterations in hash".to_string()))?;
        
        let salt = base64::decode(parts[3])
            .map_err(|_| WalletError::Crypto("Invalid salt encoding".to_string()))?;
        
        let stored_key = base64::decode(parts[4])
            .map_err(|_| WalletError::Crypto("Invalid key encoding".to_string()))?;

        let mut computed_key = vec![0u8; stored_key.len()];
        
        pbkdf2::<hmac::Hmac<sha2::Sha256>>(
            password.as_bytes(),
            &salt,
            iterations,
            &mut computed_key,
        );

        let result = computed_key == stored_key;
        
        // Zero out the keys
        computed_key.zeroize();
        
        Ok(result)
    }
}

impl Drop for PasswordHasher {
    fn drop(&mut self) {
        // Clear any sensitive data
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_password_hashing_argon2() {
        let hasher = PasswordHasher::new(PasswordConfig {
            algorithm: PasswordAlgorithm::Argon2,
            ..Default::default()
        });

        let password = "test_password_123";
        let hash = hasher.hash_password(password).unwrap();
        
        assert!(hasher.verify_password(password, &hash).unwrap());
        assert!(!hasher.verify_password("wrong_password", &hash).unwrap());
    }

    #[test]
    fn test_password_hashing_pbkdf2() {
        let hasher = PasswordHasher::new(PasswordConfig {
            algorithm: PasswordAlgorithm::PBKDF2,
            ..Default::default()
        });

        let password = "test_password_123";
        let hash = hasher.hash_password(password).unwrap();
        
        assert!(hasher.verify_password(password, &hash).unwrap());
        assert!(!hasher.verify_password("wrong_password", &hash).unwrap());
    }
} 