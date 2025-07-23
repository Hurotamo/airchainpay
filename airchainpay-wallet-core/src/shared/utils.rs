//! Utility functions for the wallet core
//! 
//! This module contains common utility functions used throughout the wallet core.

use crate::shared::error::WalletError;
use std::time::{SystemTime, UNIX_EPOCH};
use bip39::Mnemonic;
use rand_core::OsRng;
use rand_core::RngCore;

/// Generate a unique ID
pub fn generate_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Get current timestamp in seconds
pub fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

/// Validate Ethereum address format
pub fn validate_ethereum_address(address: &str) -> Result<(), WalletError> {
    if !address.starts_with("0x") {
        return Err(WalletError::validation("Address must start with 0x"));
    }
    
    if address.len() != 42 {
        return Err(WalletError::validation("Address must be 42 characters long"));
    }
    
    // Check if all characters after 0x are valid hex
    if !address[2..].chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(WalletError::validation("Address contains invalid hex characters"));
    }
    
    Ok(())
}

/// Validate private key format
pub fn validate_private_key(private_key: &str) -> Result<(), WalletError> {
    if !private_key.starts_with("0x") {
        return Err(WalletError::validation("Private key must start with 0x"));
    }
    
    if private_key.len() != 66 {
        return Err(WalletError::validation("Private key must be 66 characters long"));
    }
    
    // Check if all characters after 0x are valid hex
    if !private_key[2..].chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(WalletError::validation("Private key contains invalid hex characters"));
    }
    
    Ok(())
}

/// Validate seed phrase
pub fn validate_seed_phrase(seed_phrase: &str) -> Result<(), WalletError> {
    match Mnemonic::parse_in_normalized(bip39::Language::English, seed_phrase) {
        Ok(_) => Ok(()),
        Err(e) => Err(WalletError::validation(format!("Invalid BIP39 seed phrase: {}", e))),
    }
}

/// Validate password strength
pub fn validate_password(password: &str) -> Result<(), WalletError> {
    if password.len() < 8 {
        return Err(WalletError::validation("Password must be at least 8 characters long"));
    }
    
    if password.len() > 128 {
        return Err(WalletError::validation("Password must be at most 128 characters long"));
    }
    
    Ok(())
}

/// Convert hex string to bytes
pub fn hex_to_bytes(hex: &str) -> Result<Vec<u8>, WalletError> {
    let hex = hex.trim_start_matches("0x");
    hex::decode(hex)
        .map_err(|e| WalletError::validation(format!("Invalid hex string: {}", e)))
}

/// Convert bytes to hex string
pub fn bytes_to_hex(bytes: &[u8]) -> String {
    format!("0x{}", hex::encode(bytes))
}

/// Calculate SHA256 hash
pub fn sha256_hash(data: &[u8]) -> Vec<u8> {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().to_vec()
}

/// Calculate checksum for data
pub fn calculate_checksum(data: &[u8]) -> String {
    hex::encode(sha256_hash(data))
}

/// Validate checksum
pub fn validate_checksum(data: &[u8], checksum: &str) -> bool {
    let calculated_checksum = calculate_checksum(data);
    calculated_checksum == checksum
}

/// Format amount with decimals
pub fn format_amount(amount: &str, decimals: u8) -> Result<String, WalletError> {
    if amount.is_empty() {
        return Err(WalletError::validation("Amount cannot be empty"));
    }
    
    // Parse as u128 to handle large numbers
    let amount_u128 = amount.parse::<u128>()
        .map_err(|_| WalletError::validation("Invalid amount format"))?;
    
    // Convert to string with proper decimal formatting
    let amount_str = amount_u128.to_string();
    
    if amount_str.len() <= decimals as usize {
        // Pad with leading zeros
        let mut formatted = "0.".to_string();
        for _ in 0..(decimals as usize - amount_str.len()) {
            formatted.push('0');
        }
        formatted.push_str(&amount_str);
        Ok(formatted)
    } else {
        // Insert decimal point
        let mut formatted = amount_str.clone();
        let decimal_pos = formatted.len() - decimals as usize;
        formatted.insert(decimal_pos, '.');
        Ok(formatted)
    }
}

/// Parse amount from formatted string
pub fn parse_amount(amount: &str, decimals: u8) -> Result<String, WalletError> {
    if amount.is_empty() {
        return Err(WalletError::validation("Amount cannot be empty"));
    }
    
    // Remove decimal point and convert to smallest unit
    let parts: Vec<&str> = amount.split('.').collect();
    
    match parts.len() {
        1 => {
            // No decimal point, treat as whole number
            let whole = parts[0];
            if whole.is_empty() {
                return Err(WalletError::validation("Invalid amount format"));
            }
            
            let mut result = whole.to_string();
            for _ in 0..decimals {
                result.push('0');
            }
            Ok(result)
        }
        2 => {
            // Has decimal point
            let whole = parts[0];
            let decimal = parts[1];
            
            if whole.is_empty() && decimal.is_empty() {
                return Err(WalletError::validation("Invalid amount format"));
            }
            
            let mut result = if whole.is_empty() { "0".to_string() } else { whole.to_string() };
            
            // Pad or truncate decimal part
            if decimal.len() > decimals as usize {
                // Truncate
                result.push_str(&decimal[..decimals as usize]);
            } else {
                // Pad with zeros
                result.push_str(decimal);
                for _ in 0..(decimals as usize - decimal.len()) {
                    result.push('0');
                }
            }
            
            Ok(result)
        }
        _ => {
            Err(WalletError::validation("Invalid amount format"))
        }
    }
}

/// Generate random bytes
pub fn generate_random_bytes(length: usize) -> Vec<u8> {
    let mut bytes = vec![0u8; length];
    let mut rng = OsRng;
    rng.fill_bytes(&mut bytes);
    bytes
}

/// Generate secure random bytes
pub fn generate_secure_random_bytes(length: usize) -> Result<Vec<u8>, WalletError> {
    let mut bytes = vec![0u8; length];
    let mut rng = OsRng;
    rng.fill_bytes(&mut bytes);
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_id() {
        let id1 = generate_id();
        let id2 = generate_id();
        assert_ne!(id1, id2);
        assert_eq!(id1.len(), 36); // UUID length
    }

    #[test]
    fn test_current_timestamp() {
        let timestamp = current_timestamp();
        assert!(timestamp > 0);
    }

    #[test]
    fn test_validate_ethereum_address() {
        // Valid address
        assert!(validate_ethereum_address("0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6").is_ok());
        
        // Invalid addresses
        assert!(validate_ethereum_address("742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6").is_err()); // No 0x
        assert!(validate_ethereum_address("0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b").is_err()); // Too short
        assert!(validate_ethereum_address("0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6g").is_err()); // Invalid char
    }

    #[test]
    fn test_validate_private_key() {
        // Valid private key
        assert!(validate_private_key("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef").is_ok());
        
        // Invalid private keys
        assert!(validate_private_key("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef").is_err()); // No 0x
        assert!(validate_private_key("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcde").is_err()); // Too short
    }

    #[test]
    fn test_validate_seed_phrase() {
        // Valid seed phrases
        assert!(validate_seed_phrase("abandon ability able about above absent absorb abstract absurd abuse access accident").is_ok());
        assert!(validate_seed_phrase("abandon ability able about above absent absorb abstract absurd abuse access accident abandon ability able").is_ok());
        
        // Invalid seed phrases
        assert!(validate_seed_phrase("abandon ability able about above absent absorb abstract absurd abuse access").is_err()); // Too short
        assert!(validate_seed_phrase("abandon ability able about above absent absorb abstract absurd abuse access accident abandon").is_err()); // Too long
        assert!(validate_seed_phrase("abandon ability able about above absent absorb abstract absurd abuse access  accident").is_err()); // Empty word
    }

    #[test]
    fn test_validate_password() {
        // Valid passwords
        assert!(validate_password("password123").is_ok());
        assert!(validate_password("a".repeat(8)).is_ok());
        assert!(validate_password("a".repeat(128)).is_ok());
        
        // Invalid passwords
        assert!(validate_password("short").is_err()); // Too short
        assert!(validate_password(&"a".repeat(129)).is_err()); // Too long
    }

    #[test]
    fn test_hex_conversion() {
        let original = vec![1, 2, 3, 4, 5];
        let hex = bytes_to_hex(&original);
        let converted = hex_to_bytes(&hex).unwrap();
        assert_eq!(original, converted);
    }

    #[test]
    fn test_checksum() {
        let data = b"test data";
        let checksum = calculate_checksum(data);
        assert!(validate_checksum(data, &checksum));
        assert!(!validate_checksum(data, "invalid"));
    }

    #[test]
    fn test_format_amount() {
        // Test formatting
        assert_eq!(format_amount("1000000", 6).unwrap(), "1.000000");
        assert_eq!(format_amount("100000", 6).unwrap(), "0.100000");
        assert_eq!(format_amount("1000000000000000000", 18).unwrap(), "1.000000000000000000");
    }

    #[test]
    fn test_parse_amount() {
        // Test parsing
        assert_eq!(parse_amount("1.000000", 6).unwrap(), "1000000");
        assert_eq!(parse_amount("0.100000", 6).unwrap(), "100000");
        assert_eq!(parse_amount("1.000000000000000000", 18).unwrap(), "1000000000000000000");
    }

    #[test]
    fn test_random_bytes() {
        let bytes1 = generate_random_bytes(32);
        let bytes2 = generate_random_bytes(32);
        assert_eq!(bytes1.len(), 32);
        assert_eq!(bytes2.len(), 32);
        assert_ne!(bytes1, bytes2);
    }
} 