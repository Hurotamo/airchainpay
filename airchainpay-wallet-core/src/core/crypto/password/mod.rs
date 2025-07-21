//! Password management for the wallet core
//! 
//! This module handles password hashing, verification, and generation.

use crate::shared::error::WalletError;
use crate::shared::constants::{PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH};
use crate::shared::utils::generate_secure_random_bytes;
use argon2::{Argon2, PasswordHasher, PasswordVerifier};
use argon2::password_hash::{rand_core::OsRng, PasswordHash, SaltString};
use hmac::Hmac;
use sha2::Sha256;
use rand::Rng;
use zeroize::Zeroize;

/// Password configuration
#[derive(Debug, Clone)]
pub struct PasswordConfig {
    pub min_length: usize,
    pub max_length: usize,
    pub require_uppercase: bool,
    pub require_lowercase: bool,
    pub require_numbers: bool,
    pub require_special: bool,
}

impl Default for PasswordConfig {
    fn default() -> Self {
        Self {
            min_length: PASSWORD_MIN_LENGTH,
            max_length: PASSWORD_MAX_LENGTH,
            require_uppercase: true,
            require_lowercase: true,
            require_numbers: true,
            require_special: true,
        }
    }
}

/// Password manager for handling password operations
pub struct PasswordManager {
    config: PasswordConfig,
}

impl PasswordManager {
    /// Create a new password manager
    pub fn new(config: Option<PasswordConfig>) -> Self {
        Self {
            config: config.unwrap_or_default(),
        }
    }
    
    /// Hash a password using Argon2
    pub async fn hash_password(&self, password: &str) -> Result<String, WalletError> {
        // Validate password
        self.validate_password(password)?;
        
        // Generate salt using OsRng
        let salt = SaltString::generate(&mut OsRng);
        
        // Hash password
        let argon2 = Argon2::default();
        let password_hash = argon2.hash_password(password.as_bytes(), &salt)
            .map_err(|e| WalletError::crypto(format!("Password hashing failed: {}", e)))?;
        
        Ok(password_hash.to_string())
    }
    
    /// Verify a password against a hash
    pub async fn verify_password(&self, password: &str, hash: &str) -> Result<bool, WalletError> {
        let parsed_hash = PasswordHash::new(hash)
            .map_err(|e| WalletError::crypto(format!("Invalid hash format: {}", e)))?;
        
        let argon2 = Argon2::default();
        let is_valid = argon2.verify_password(password.as_bytes(), &parsed_hash).is_ok();
        
        Ok(is_valid)
    }
    
    /// Hash a password using PBKDF2
    ///
    /// PHC string format: $pbkdf2-sha256$<iterations>$<base64(salt)>$<base64(hash)>
    pub async fn hash_password_pbkdf2(&self, password: &str) -> Result<String, WalletError> {
        self.validate_password(password)?;
        let salt = generate_secure_random_bytes(32)?;
        let mut hash = [0u8; 32];
        let iterations = 100_000;
        pbkdf2::pbkdf2::<hmac::Hmac<sha2::Sha256>>(
            password.as_bytes(),
            &salt,
            iterations,
            &mut hash
        ).map_err(|e| WalletError::crypto(&format!("PBKDF2 error: {:?}", e)))?;
        Ok(format!(
            "$pbkdf2-sha256${}${}${}",
            iterations,
            base64::encode(&salt),
            base64::encode(&hash)
        ))
    }

    /// Verify a password against a PBKDF2 hash (PHC string format)
    pub async fn verify_password_pbkdf2(&self, password: &str, hash: &str) -> Result<bool, WalletError> {
        // PHC format: $pbkdf2-sha256$<iterations>$<base64(salt)>$<base64(hash)>
        let parts: Vec<&str> = hash.split('$').collect();
        if parts.len() != 5 || parts[1] != "pbkdf2-sha256" {
            return Err(WalletError::crypto("Invalid PBKDF2 PHC hash format"));
        }
        let iterations: u32 = parts[2].parse()
            .map_err(|_| WalletError::crypto("Invalid iterations in hash"))?;
        let salt = base64::decode(parts[3])
            .map_err(|_| WalletError::crypto("Invalid salt encoding"))?;
        let stored_hash = base64::decode(parts[4])
            .map_err(|_| WalletError::crypto("Invalid hash encoding"))?;
        let mut computed_hash = [0u8; 32];
        pbkdf2::pbkdf2::<hmac::Hmac<sha2::Sha256>>(
            password.as_bytes(),
            &salt,
            iterations,
            &mut computed_hash
        ).map_err(|e| WalletError::crypto(&format!("PBKDF2 error: {:?}", e)))?;
        Ok(computed_hash == stored_hash.as_slice())
    }
    
    /// Generate a secure password
    pub async fn generate_password(&self) -> Result<String, WalletError> {
        let mut rng = rand::rng();
        let length = rng.random_range(self.config.min_length..=self.config.max_length);
        
        let mut password = String::new();
        let mut has_uppercase = false;
        let mut has_lowercase = false;
        let mut has_number = false;
        let mut has_special = false;
        
        let uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        let lowercase = "abcdefghijklmnopqrstuvwxyz";
        let numbers = "0123456789";
        let special = "!@#$%^&*()_+-=[]{}|;:,.<>?";
        
        let all_chars = format!("{}{}{}{}", uppercase, lowercase, numbers, special);
        
        // Generate password
        for _ in 0..length {
            let idx = rng.random_range(0..all_chars.len());
            let ch = all_chars.chars().nth(idx).unwrap();
            password.push(ch);
            
            // Track character types
            if uppercase.contains(ch) { has_uppercase = true; }
            if lowercase.contains(ch) { has_lowercase = true; }
            if numbers.contains(ch) { has_number = true; }
            if special.contains(ch) { has_special = true; }
        }
        
        // Ensure all required character types are present
        if self.config.require_uppercase && !has_uppercase {
            let idx = rng.random_range(0..password.len());
            let uppercase_char = uppercase.chars().nth(rng.random_range(0..uppercase.len())).unwrap();
            password.replace_range(idx..idx+1, &uppercase_char.to_string());
        }
        
        if self.config.require_lowercase && !has_lowercase {
            let idx = rng.random_range(0..password.len());
            let lowercase_char = lowercase.chars().nth(rng.random_range(0..lowercase.len())).unwrap();
            password.replace_range(idx..idx+1, &lowercase_char.to_string());
        }
        
        if self.config.require_numbers && !has_number {
            let idx = rng.random_range(0..password.len());
            let number_char = numbers.chars().nth(rng.random_range(0..numbers.len())).unwrap();
            password.replace_range(idx..idx+1, &number_char.to_string());
        }
        
        if self.config.require_special && !has_special {
            let idx = rng.random_range(0..password.len());
            let special_char = special.chars().nth(rng.random_range(0..special.len())).unwrap();
            password.replace_range(idx..idx+1, &special_char.to_string());
        }
        
        Ok(password)
    }
    
    /// Validate a password against the configuration
    pub fn validate_password(&self, password: &str) -> Result<(), WalletError> {
        if password.len() < self.config.min_length {
            return Err(WalletError::validation(
                format!("Password too short, minimum length is {}", self.config.min_length)
            ));
        }
        
        if password.len() > self.config.max_length {
            return Err(WalletError::validation(
                format!("Password too long, maximum length is {}", self.config.max_length)
            ));
        }
        
        if self.config.require_uppercase && !password.chars().any(|c| c.is_uppercase()) {
            return Err(WalletError::validation("Password must contain uppercase letter"));
        }
        
        if self.config.require_lowercase && !password.chars().any(|c| c.is_lowercase()) {
            return Err(WalletError::validation("Password must contain lowercase letter"));
        }
        
        if self.config.require_numbers && !password.chars().any(|c| c.is_numeric()) {
            return Err(WalletError::validation("Password must contain number"));
        }
        
        if self.config.require_special && !password.chars().any(|c| "!@#$%^&*()_+-=[]{}|;:,.<>?".contains(c)) {
            return Err(WalletError::validation("Password must contain special character"));
        }
        
        Ok(())
    }
    
    /// Initialize the password manager
    pub async fn init(&self) -> Result<(), WalletError> {
        // Test password hashing
        let test_password = "test_password_123";
        let hash = self.hash_password(test_password).await?;
        let is_valid = self.verify_password(test_password, &hash).await?;
        
        if !is_valid {
            return Err(WalletError::crypto("Password hashing test failed"));
        }
        
        Ok(())
    }
    
    /// Cleanup the password manager
    pub async fn cleanup(&self) -> Result<(), WalletError> {
        // No cleanup needed for password manager
        Ok(())
    }
}

/// Secure password wrapper
#[derive(Debug)]
pub struct SecurePassword {
    password: String,
}

impl SecurePassword {
    /// Create a new secure password
    pub fn new(password: String) -> Self {
        Self { password }
    }
    
    /// Get the password as a string
    pub fn as_str(&self) -> &str {
        &self.password
    }
    
    /// Get the password as bytes
    pub fn as_bytes(&self) -> &[u8] {
        self.password.as_bytes()
    }
}

impl Zeroize for SecurePassword {
    fn zeroize(&mut self) {
        self.password.zeroize();
    }
}

/// Compute HMAC-SHA256 of a password (for demonstration)
pub fn compute_password_hmac(password: &str, key: &[u8]) -> Vec<u8> {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC can take key of any size");
    mac.update(password.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_password_manager_creation() {
        let manager = PasswordManager::new(None);
        assert!(manager.init().await.is_ok());
    }

    #[tokio::test]
    async fn test_password_hashing() {
        let manager = PasswordManager::new(None);
        let password = "test_password_123";
        
        let hash = manager.hash_password(password).await.unwrap();
        let is_valid = manager.verify_password(password, &hash).await.unwrap();
        
        assert!(!hash.is_empty());
        assert!(is_valid);
    }

    #[tokio::test]
    async fn test_password_verification_wrong_password() {
        let manager = PasswordManager::new(None);
        let password = "test_password_123";
        let wrong_password = "wrong_password";
        
        let hash = manager.hash_password(password).await.unwrap();
        let is_valid = manager.verify_password(wrong_password, &hash).await.unwrap();
        
        assert!(!is_valid);
    }

    #[tokio::test]
    async fn test_pbkdf2_hashing() {
        let manager = PasswordManager::new(None);
        let password = "test_password_123";
        
        let hash = manager.hash_password_pbkdf2(password).await.unwrap();
        let is_valid = manager.verify_password_pbkdf2(password, &hash).await.unwrap();
        
        assert!(hash.starts_with("$pbkdf2-sha256$"));
        assert!(is_valid);
    }

    #[tokio::test]
    async fn test_password_generation() {
        let manager = PasswordManager::new(None);
        let password = manager.generate_password().await.unwrap();
        
        assert!(password.len() >= PASSWORD_MIN_LENGTH);
        assert!(password.len() <= PASSWORD_MAX_LENGTH);
        assert!(password.chars().any(|c| c.is_uppercase()));
        assert!(password.chars().any(|c| c.is_lowercase()));
        assert!(password.chars().any(|c| c.is_numeric()));
        assert!(password.chars().any(|c| "!@#$%^&*()_+-=[]{}|;:,.<>?".contains(c)));
    }

    #[test]
    fn test_password_validation() {
        let manager = PasswordManager::new(None);
        
        // Valid password
        assert!(manager.validate_password("Test123!@#").is_ok());
        
        // Too short
        assert!(manager.validate_password("Test1!").is_err());
        
        // No uppercase
        assert!(manager.validate_password("test123!@#").is_err());
        
        // No lowercase
        assert!(manager.validate_password("TEST123!@#").is_err());
        
        // No number
        assert!(manager.validate_password("TestABC!@#").is_err());
        
        // No special character
        assert!(manager.validate_password("Test123ABC").is_err());
    }

    #[test]
    fn test_secure_password() {
        let password = "test_password_123".to_string();
        let secure_password = SecurePassword::new(password.clone());
        
        assert_eq!(secure_password.as_str(), password);
        assert_eq!(secure_password.as_bytes(), password.as_bytes());
    }

    #[test]
    fn test_compute_password_hmac() {
        let password = "test_password_123";
        let key = b"supersecretkey";
        let hmac = compute_password_hmac(password, key);
        assert!(!hmac.is_empty());
    }
} 