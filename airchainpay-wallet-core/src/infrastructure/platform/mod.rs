//! Platform-specific implementations
//! 
//! This module contains platform-specific implementations for different
//! operating systems and platforms (iOS, Android, Linux, macOS, Windows).

use crate::shared::error::WalletError;
use crate::shared::types::SecurityLevel;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce, aead::{Aead, generic_array::GenericArray}};
use argon2::{Argon2, PasswordHasher};
use rand::thread_rng;
use rand::RngCore;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::os::unix::fs::PermissionsExt;

/// Platform-specific features and capabilities
pub struct PlatformFeatures {
    pub has_secure_enclave: bool,
    pub has_biometric_auth: bool,
    pub has_keychain: bool,
    pub has_keystore: bool,
    pub has_hardware_backed_storage: bool,
    pub platform_name: String,
    pub architecture: String,
    pub os_version: String,
}

impl PlatformFeatures {
    /// Detect platform features
    pub fn detect() -> Self {
        let platform_name = "unknown".to_string(); // Placeholder, replace with actual detection
        let architecture = "unknown".to_string(); // Placeholder, replace with actual detection
        
        let (has_secure_enclave, has_biometric_auth, has_keychain, has_keystore, has_hardware_backed_storage) = match platform_name.as_str() {
            "ios" => (true, true, true, false, true),
            "android" => (true, true, true, true, true),
            "macos" => (true, true, true, false, true),
            "linux" => (false, false, false, false, false),
            "windows" => (false, false, false, false, false),
            _ => (false, false, false, false, false),
        };

        Self {
            has_secure_enclave,
            has_biometric_auth,
            has_keychain,
            has_keystore,
            has_hardware_backed_storage,
            platform_name,
            architecture,
            os_version: "1.0.0".to_string(), // In production, detect actual OS version
        }
    }

    /// Check if platform supports secure storage
    pub fn supports_secure_storage(&self) -> bool {
        self.has_keychain || self.has_keystore || self.has_hardware_backed_storage
    }

    /// Check if platform supports biometric authentication
    pub fn supports_biometric_auth(&self) -> bool {
        self.has_biometric_auth
    }

    /// Check if platform has secure enclave
    pub fn has_secure_enclave(&self) -> bool {
        self.has_secure_enclave
    }

    /// Get recommended security level for platform
    pub fn recommended_security_level(&self) -> SecurityLevel {
        if self.has_secure_enclave {
            SecurityLevel::High
        } else if self.has_hardware_backed_storage {
            SecurityLevel::High
        } else {
            SecurityLevel::Medium
        }
    }
}

/// Platform-specific storage implementation
pub trait PlatformStorage {
    /// Store data securely
    fn store(&self, key: &str, data: &[u8]) -> Result<(), WalletError>;
    
    /// Retrieve data securely
    fn retrieve(&self, key: &str) -> Result<Vec<u8>, WalletError>;
    
    /// Delete data securely
    fn delete(&self, key: &str) -> Result<(), WalletError>;
    
    /// Check if data exists
    fn exists(&self, key: &str) -> Result<bool, WalletError>;
    
    /// List all stored keys
    fn list_keys(&self) -> Result<Vec<String>, WalletError>;
}

/// Platform-specific biometric authentication
pub trait BiometricAuth {
    /// Check if biometric authentication is available
    fn is_available(&self) -> Result<bool, WalletError>;
    
    /// Authenticate using biometrics
    fn authenticate(&self, reason: &str) -> Result<bool, WalletError>;
    
    /// Check if biometric authentication is enabled
    fn is_enabled(&self) -> Result<bool, WalletError>;
    
    /// Enable biometric authentication
    fn enable(&self) -> Result<(), WalletError>;
    
    /// Disable biometric authentication
    fn disable(&self) -> Result<(), WalletError>;
}

/// Platform-specific secure enclave operations
pub trait SecureEnclave {
    /// Check if secure enclave is available
    fn is_available(&self) -> Result<bool, WalletError>;
    
    /// Generate key pair in secure enclave
    fn generate_key_pair(&self, key_id: &str) -> Result<String, WalletError>;
    
    /// Sign data using secure enclave
    fn sign(&self, key_id: &str, data: &[u8]) -> Result<Vec<u8>, WalletError>;
    
    /// Get public key from secure enclave
    fn get_public_key(&self, key_id: &str) -> Result<String, WalletError>;
    
    /// Delete key from secure enclave
    fn delete_key(&self, key_id: &str) -> Result<(), WalletError>;
}

/// Platform manager
pub struct PlatformManager {
    features: PlatformFeatures,
    storage: Box<dyn PlatformStorage>,
    biometric_auth: Box<dyn BiometricAuth>,
    secure_enclave: Box<dyn SecureEnclave>,
}

impl PlatformManager {
    /// Create a new platform manager
    pub fn new() -> Result<Self, WalletError> {
        let features = PlatformFeatures::detect();
        
        let storage: Box<dyn PlatformStorage> = match features.platform_name.as_str() {
            "ios" => Box::new(FileStorage::new()?),
            "android" => Box::new(FileStorage::new()?),
            _ => Box::new(FileStorage::new()?),
        };
        
        let biometric_auth: Box<dyn BiometricAuth> = match features.platform_name.as_str() {
            "ios" => Box::new(NoBiometricAuth::new()),
            "android" => Box::new(NoBiometricAuth::new()),
            _ => Box::new(NoBiometricAuth::new()),
        };
        
        let secure_enclave: Box<dyn SecureEnclave> = match features.platform_name.as_str() {
            "ios" => Box::new(NoSecureEnclave::new()),
            "macos" => Box::new(NoSecureEnclave::new()),
            _ => Box::new(NoSecureEnclave::new()),
        };
        
        Ok(Self {
            features,
            storage,
            biometric_auth,
            secure_enclave,
        })
    }

    /// Get platform features
    pub fn features(&self) -> &PlatformFeatures {
        &self.features
    }

    /// Get storage implementation
    pub fn storage(&self) -> &dyn PlatformStorage {
        self.storage.as_ref()
    }

    /// Get biometric authentication implementation
    pub fn biometric_auth(&self) -> &dyn BiometricAuth {
        self.biometric_auth.as_ref()
    }

    /// Get secure enclave implementation
    pub fn secure_enclave(&self) -> &dyn SecureEnclave {
        self.secure_enclave.as_ref()
    }

    /// Initialize platform-specific features
    pub fn init(&self) -> Result<(), WalletError> {
        // All .init() calls removed
        Ok(())
    }
}

// Fallback implementations
pub struct FileStorage;

impl FileStorage {
    pub fn new() -> Result<Self, WalletError> {
        Ok(Self {})
    }

    // Helper: Derive encryption key from password using Argon2
    fn derive_key(password: &str, salt: &[u8]) -> Result<[u8; 32], WalletError> {
        let salt = argon2::password_hash::SaltString::encode_b64(salt)?;
        let argon2 = Argon2::default();
        let password_hash = argon2.hash_password(password.as_bytes(), &salt)
            .map_err(|e| WalletError::crypto(format!("Password hashing failed: {}", e)))?;
        let binding = password_hash.hash.unwrap();
        let hash_bytes = binding.as_bytes();
        let mut key = [0u8; 32];
        key.copy_from_slice(&hash_bytes[..32]);
        Ok(key)
    }

    // Helper: Get file path for a given key
    fn file_path(key: &str) -> PathBuf {
        // Use OS-specific secure app data directory
        let base_dir = dirs::data_dir().unwrap_or_else(|| PathBuf::from("./secure_storage"));
        let mut path = base_dir.join("airchainpay");
        fs::create_dir_all(&path).ok();
        path.push(format!("{}.dat", key));
        path
    }

    // Helper: Get or generate salt for a key
    fn get_salt(key: &str) -> Result<Vec<u8>, WalletError> {
        let base_dir = dirs::data_dir().unwrap_or_else(|| PathBuf::from("./secure_storage"));
        let mut salt_path = base_dir.join("airchainpay");
        fs::create_dir_all(&salt_path).ok();
        salt_path.push(format!("{}.salt", key));
        if salt_path.exists() {
            let mut salt = vec![];
            File::open(&salt_path)?.read_to_end(&mut salt)?;
            Ok(salt)
        } else {
            let mut salt = [0u8; 16];
            rand::thread_rng().fill_bytes(&mut salt);
            let mut f = File::create(&salt_path)?;
            f.write_all(&salt)?;
            Ok(salt.to_vec())
        }
    }
}

impl PlatformStorage for FileStorage {
    fn store(&self, key: &str, data: &[u8]) -> Result<(), WalletError> {
        // Prompt user for password or use OS keyring
        let password = rpassword::prompt_password("Enter password for secure storage: ")
            .map_err(|e| WalletError::crypto(format!("Password prompt failed: {}", e)))?;
        let salt = Self::get_salt(key)?;
        let key_bytes = Self::derive_key(&password, &salt)?;
        let cipher = Aes256Gcm::new(GenericArray::from_slice(&key_bytes));
        let mut nonce = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce);
        let ciphertext = cipher.encrypt(GenericArray::from_slice(&nonce), data)
            .map_err(|e| WalletError::crypto(format!("Encryption failed: {}", e)))?;
        let mut file = File::create(Self::file_path(key))?;
        file.set_permissions(fs::Permissions::from_mode(0o600))?;
        file.write_all(&nonce)?;
        file.write_all(&ciphertext)?;
        Ok(())
    }

    fn retrieve(&self, key: &str) -> Result<Vec<u8>, WalletError> {
        let password = rpassword::prompt_password("Enter password for secure storage: ")
            .map_err(|e| WalletError::crypto(format!("Password prompt failed: {}", e)))?;
        let salt = Self::get_salt(key)?;
        let key_bytes = Self::derive_key(&password, &salt)?;
        let cipher = Aes256Gcm::new(GenericArray::from_slice(&key_bytes));
        let mut file = File::open(Self::file_path(key))?;
        let mut nonce = [0u8; 12];
        file.read_exact(&mut nonce)?;
        let mut ciphertext = vec![];
        file.read_to_end(&mut ciphertext)?;
        let plaintext = cipher.decrypt(GenericArray::from_slice(&nonce), ciphertext.as_slice())
            .map_err(|e| WalletError::crypto(format!("Decryption failed: {}", e)))?;
        Ok(plaintext)
    }

    fn delete(&self, key: &str) -> Result<(), WalletError> {
        let _ = fs::remove_file(Self::file_path(key));
        let base_dir = dirs::data_dir().unwrap_or_else(|| PathBuf::from("./secure_storage"));
        let mut salt_path = base_dir.join("airchainpay");
        salt_path.push(format!("{}.salt", key));
        let _ = fs::remove_file(salt_path);
        Ok(())
    }

    fn exists(&self, key: &str) -> Result<bool, WalletError> {
        Ok(Self::file_path(key).exists())
    }

    fn list_keys(&self) -> Result<Vec<String>, WalletError> {
        let base_dir = dirs::data_dir().unwrap_or_else(|| PathBuf::from("./secure_storage"));
        let dir = base_dir.join("airchainpay");
        let mut keys = vec![];
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(name) = path.file_stem().and_then(|n| n.to_str()) {
                    if path.extension().and_then(|e| e.to_str()) == Some("dat") {
                        keys.push(name.to_string());
                    }
                }
            }
        }
        Ok(keys)
    }
}
// TODO: Replace hardcoded password with secure password management (prompt, config, or OS keyring)
// TODO: Ensure secure file permissions and directory location

// Biometric authentication implementations
pub struct NoBiometricAuth;

impl NoBiometricAuth {
    pub fn new() -> Self {
        Self
    }
}

impl BiometricAuth for NoBiometricAuth {
    fn is_available(&self) -> Result<bool, WalletError> {
        Ok(false)
    }
    
    fn authenticate(&self, _reason: &str) -> Result<bool, WalletError> {
        Ok(false)
    }
    
    fn is_enabled(&self) -> Result<bool, WalletError> {
        Ok(false)
    }
    
    fn enable(&self) -> Result<(), WalletError> {
        Ok(())
    }
    
    fn disable(&self) -> Result<(), WalletError> {
        Ok(())
    }
}

// Secure enclave implementations
pub struct NoSecureEnclave;

impl NoSecureEnclave {
    pub fn new() -> Self {
        Self
    }
}

impl SecureEnclave for NoSecureEnclave {
    fn is_available(&self) -> Result<bool, WalletError> {
        Ok(false)
    }
    
    fn generate_key_pair(&self, _key_id: &str) -> Result<String, WalletError> {
        Err(WalletError::config("Secure enclave not available".to_string()))
    }
    
    fn sign(&self, _key_id: &str, _data: &[u8]) -> Result<Vec<u8>, WalletError> {
        Err(WalletError::config("Secure enclave not available".to_string()))
    }
    
    fn get_public_key(&self, _key_id: &str) -> Result<String, WalletError> {
        Err(WalletError::config("Secure enclave not available".to_string()))
    }
    
    fn delete_key(&self, _key_id: &str) -> Result<(), WalletError> {
        Err(WalletError::config("Secure enclave not available".to_string()))
    }
}

// Initialize platform module
// Remove the free function pub fn init() -> Result<(), Box<dyn std::error::Error>> if it only calls platform_manager.init()?;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_platform_features_detection() {
        let features = PlatformFeatures::detect();
        assert!(!features.platform_name.is_empty());
        assert!(!features.architecture.is_empty());
    }

    #[test]
    fn test_platform_manager_creation() {
        let manager = PlatformManager::new();
        assert!(manager.is_ok());
    }
} 