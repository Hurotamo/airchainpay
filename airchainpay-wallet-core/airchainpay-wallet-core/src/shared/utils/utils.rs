//! Common utilities and helper functions
//! 
//! This module contains utility functions used throughout the wallet core,
//! including validation, formatting, conversion, and other helper functions.

use crate::shared::constants::*;
use crate::shared::error::WalletError;
use std::time::{SystemTime, UNIX_EPOCH};
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

/// Utility functions for common operations
pub struct Utils;

impl Utils {
    /// Generate a unique identifier
    pub fn generate_id() -> String {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        
        let random_bytes = rand::random::<[u8; 8]>();
        let random_hex = hex::encode(random_bytes);
        
        format!("{}_{}", timestamp, random_hex)
    }

    /// Validate an Ethereum address
    pub fn validate_ethereum_address(address: &str) -> Result<bool, WalletError> {
        let clean_address = address.trim_start_matches("0x");
        
        if clean_address.len() != 40 {
            return Ok(false);
        }
        
        if !clean_address.chars().all(|c| c.is_ascii_hexdigit()) {
            return Ok(false);
        }
        
        Ok(true)
    }

    /// Validate a private key
    pub fn validate_private_key(private_key: &str) -> Result<bool, WalletError> {
        let clean_key = private_key.trim_start_matches("0x");
        
        if clean_key.len() != 64 {
            return Ok(false);
        }
        
        if !clean_key.chars().all(|c| c.is_ascii_hexdigit()) {
            return Ok(false);
        }
        
        Ok(true)
    }

    /// Validate a seed phrase
    pub fn validate_seed_phrase(seed_phrase: &str) -> Result<bool, WalletError> {
        let words: Vec<&str> = seed_phrase.split_whitespace().collect();
        
        if words.len() != RECOVERY_PHRASE_LENGTH {
            return Ok(false);
        }
        
        // Check if all words are in the BIP39 word list
        // This is a simplified check - in production, use a proper BIP39 implementation
        for word in &words {
            if word.is_empty() {
                return Ok(false);
            }
        }
        
        Ok(true)
    }

    /// Validate a password
    pub fn validate_password(password: &str) -> Result<bool, WalletError> {
        if password.len() < MIN_PASSWORD_LENGTH as usize {
            return Ok(false);
        }
        
        if password.len() > MAX_PASSWORD_LENGTH as usize {
            return Ok(false);
        }
        
        // Check for at least one uppercase letter, one lowercase letter, and one digit
        let has_uppercase = password.chars().any(|c| c.is_uppercase());
        let has_lowercase = password.chars().any(|c| c.is_lowercase());
        let has_digit = password.chars().any(|c| c.is_numeric());
        
        if !has_uppercase || !has_lowercase || !has_digit {
            return Ok(false);
        }
        
        Ok(true)
    }

    /// Format an amount in wei to a human-readable string
    pub fn format_amount(amount_wei: u64, decimals: u8) -> String {
        let amount_decimal = amount_wei as f64 / 10_f64.powi(decimals as i32);
        format!("{:.6}", amount_decimal)
    }

    /// Parse an amount from a human-readable string to wei
    pub fn parse_amount(amount_str: &str, decimals: u8) -> Result<u64, WalletError> {
        let amount_decimal: f64 = amount_str.parse()
            .map_err(|_| WalletError::Configuration("Invalid amount format".to_string()))?;
        
        let amount_wei = (amount_decimal * 10_f64.powi(decimals as i32)) as u64;
        Ok(amount_wei)
    }

    /// Format gas price in Gwei
    pub fn format_gas_price(gas_price_wei: u64) -> String {
        let gas_price_gwei = gas_price_wei as f64 / 1_000_000_000.0;
        format!("{:.2} Gwei", gas_price_gwei)
    }

    /// Parse gas price from Gwei string
    pub fn parse_gas_price(gas_price_str: &str) -> Result<u64, WalletError> {
        let clean_str = gas_price_str.replace(" Gwei", "").replace(" gwei", "");
        let gas_price_gwei: f64 = clean_str.parse()
            .map_err(|_| WalletError::Configuration("Invalid gas price format".to_string()))?;
        
        let gas_price_wei = (gas_price_gwei * 1_000_000_000.0) as u64;
        Ok(gas_price_wei)
    }

    /// Validate gas price
    pub fn validate_gas_price(gas_price: u64) -> Result<bool, WalletError> {
        if gas_price < MIN_GAS_PRICE || gas_price > MAX_GAS_PRICE {
            return Ok(false);
        }
        Ok(true)
    }

    /// Validate gas limit
    pub fn validate_gas_limit(gas_limit: u64) -> Result<bool, WalletError> {
        if gas_limit < MIN_GAS_LIMIT || gas_limit > MAX_GAS_LIMIT {
            return Ok(false);
        }
        Ok(true)
    }

    /// Validate transaction amount
    pub fn validate_transaction_amount(amount: u64) -> Result<bool, WalletError> {
        if amount < MIN_TRANSACTION_AMOUNT || amount > MAX_TRANSACTION_AMOUNT {
            return Ok(false);
        }
        Ok(true)
    }

    /// Get current timestamp
    pub fn current_timestamp() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
    }

    /// Check if a timestamp is expired
    pub fn is_timestamp_expired(timestamp: u64, max_age_seconds: u64) -> bool {
        let current_time = Self::current_timestamp();
        current_time > timestamp + max_age_seconds
    }

    /// Generate a random string
    pub fn generate_random_string(length: usize) -> String {
        use rand::Rng;
        const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let mut rng = rand::thread_rng();
        
        (0..length)
            .map(|_| {
                let idx = rng.gen_range(0..CHARSET.len());
                CHARSET[idx] as char
            })
            .collect()
    }

    /// Generate a secure random bytes
    pub fn generate_random_bytes(length: usize) -> Vec<u8> {
        use rand::RngCore;
        let mut bytes = vec![0u8; length];
        rand::thread_rng().fill_bytes(&mut bytes);
        bytes
    }

    /// Convert bytes to hex string
    pub fn bytes_to_hex(bytes: &[u8]) -> String {
        hex::encode(bytes)
    }

    /// Convert hex string to bytes
    pub fn hex_to_bytes(hex_str: &str) -> Result<Vec<u8>, WalletError> {
        hex::decode(hex_str.trim_start_matches("0x"))
            .map_err(|e| WalletError::Crypto(format!("Invalid hex string: {}", e)))
    }

    /// Convert bytes to base64 string
    pub fn bytes_to_base64(bytes: &[u8]) -> String {
        base64::encode(bytes)
    }

    /// Convert base64 string to bytes
    pub fn base64_to_bytes(base64_str: &str) -> Result<Vec<u8>, WalletError> {
        base64::decode(base64_str)
            .map_err(|e| WalletError::Crypto(format!("Invalid base64 string: {}", e)))
    }

    /// Compress data using gzip
    pub fn compress_data(data: &[u8]) -> Result<Vec<u8>, WalletError> {
        use flate2::write::GzEncoder;
        use flate2::Compression;
        use std::io::Write;
        
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(data)
            .map_err(|e| WalletError::Storage(format!("Compression failed: {}", e)))?;
        
        encoder.finish()
            .map_err(|e| WalletError::Storage(format!("Compression finalization failed: {}", e)))
    }

    /// Decompress data using gzip
    pub fn decompress_data(compressed_data: &[u8]) -> Result<Vec<u8>, WalletError> {
        use flate2::read::GzDecoder;
        use std::io::Read;
        
        let mut decoder = GzDecoder::new(compressed_data);
        let mut decompressed = Vec::new();
        
        decoder.read_to_end(&mut decompressed)
            .map_err(|e| WalletError::Storage(format!("Decompression failed: {}", e)))?;
        
        Ok(decompressed)
    }

    /// Calculate checksum for data
    pub fn calculate_checksum(data: &[u8]) -> u32 {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        
        let mut hasher = DefaultHasher::new();
        data.hash(&mut hasher);
        hasher.finish() as u32
    }

    /// Validate checksum
    pub fn validate_checksum(data: &[u8], expected_checksum: u32) -> bool {
        let actual_checksum = Self::calculate_checksum(data);
        actual_checksum == expected_checksum
    }

    /// Safe string truncation
    pub fn truncate_string(s: &str, max_length: usize) -> String {
        if s.len() <= max_length {
            s.to_string()
        } else {
            format!("{}...", &s[..max_length - 3])
        }
    }

    /// Safe string sanitization
    pub fn sanitize_string(s: &str) -> String {
        s.chars()
            .filter(|c| c.is_alphanumeric() || c.is_whitespace() || *c == '-' || *c == '_' || *c == '.')
            .collect()
    }

    /// Convert a HashMap to a sorted Vec of tuples
    pub fn hashmap_to_sorted_vec<K: Clone + Ord, V: Clone>(map: &HashMap<K, V>) -> Vec<(K, V)> {
        let mut vec: Vec<_> = map.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        vec.sort_by(|a, b| a.0.cmp(&b.0));
        vec
    }

    /// Convert a Vec of tuples to a HashMap
    pub fn vec_to_hashmap<K, V>(vec: Vec<(K, V)>) -> HashMap<K, V> {
        vec.into_iter().collect()
    }
}

/// Configuration utilities
pub struct ConfigUtils;

impl ConfigUtils {
    /// Load configuration from environment variables
    pub fn load_from_env() -> HashMap<String, String> {
        std::env::vars().collect()
    }

    /// Get configuration value with default
    pub fn get_config_value(key: &str, default: &str) -> String {
        std::env::var(key).unwrap_or_else(|_| default.to_string())
    }

    /// Get configuration value as boolean
    pub fn get_config_bool(key: &str, default: bool) -> bool {
        std::env::var(key)
            .map(|v| v.to_lowercase() == "true" || v == "1")
            .unwrap_or(default)
    }

    /// Get configuration value as integer
    pub fn get_config_int(key: &str, default: i64) -> i64 {
        std::env::var(key)
            .and_then(|v| v.parse().ok())
            .unwrap_or(default)
    }

    /// Get configuration value as float
    pub fn get_config_float(key: &str, default: f64) -> f64 {
        std::env::var(key)
            .and_then(|v| v.parse().ok())
            .unwrap_or(default)
    }
}

/// Network utilities
pub struct NetworkUtils;

impl NetworkUtils {
    /// Validate RPC URL
    pub fn validate_rpc_url(url: &str) -> Result<bool, WalletError> {
        if url.is_empty() {
            return Ok(false);
        }
        
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return Ok(false);
        }
        
        Ok(true)
    }

    /// Extract chain ID from RPC URL
    pub fn extract_chain_id_from_url(url: &str) -> Option<u64> {
        // This is a simplified implementation
        // In production, you would make an RPC call to get the chain ID
        if url.contains("mainnet") {
            Some(1)
        } else if url.contains("sepolia") {
            Some(11155111)
        } else if url.contains("goerli") {
            Some(5)
        } else {
            None
        }
    }

    /// Format RPC URL with API key
    pub fn format_rpc_url(base_url: &str, api_key: &str) -> String {
        if base_url.contains("alchemy.com") {
            format!("{}{}", base_url, api_key)
        } else {
            base_url.to_string()
        }
    }
}

/// Time utilities
pub struct TimeUtils;

impl TimeUtils {
    /// Get current time as ISO 8601 string
    pub fn current_time_iso() -> String {
        use chrono::Utc;
        Utc::now().to_rfc3339()
    }

    /// Parse ISO 8601 time string
    pub fn parse_time_iso(time_str: &str) -> Result<u64, WalletError> {
        use chrono::DateTime;
        let datetime: DateTime<chrono::Utc> = time_str.parse()
            .map_err(|e| WalletError::Configuration(format!("Invalid time format: {}", e)))?;
        
        Ok(datetime.timestamp() as u64)
    }

    /// Format duration in human-readable format
    pub fn format_duration(seconds: u64) -> String {
        if seconds < 60 {
            format!("{} seconds", seconds)
        } else if seconds < 3600 {
            format!("{} minutes", seconds / 60)
        } else if seconds < 86400 {
            format!("{} hours", seconds / 3600)
        } else {
            format!("{} days", seconds / 86400)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_id() {
        let id1 = Utils::generate_id();
        let id2 = Utils::generate_id();
        
        assert!(!id1.is_empty());
        assert!(!id2.is_empty());
        assert_ne!(id1, id2);
    }

    #[test]
    fn test_validate_ethereum_address() {
        let valid_address = "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6";
        let invalid_address = "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b";
        
        assert!(Utils::validate_ethereum_address(valid_address).unwrap());
        assert!(!Utils::validate_ethereum_address(invalid_address).unwrap());
    }

    #[test]
    fn test_validate_private_key() {
        let valid_key = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        let invalid_key = "1234567890abcdef";
        
        assert!(Utils::validate_private_key(valid_key).unwrap());
        assert!(!Utils::validate_private_key(invalid_key).unwrap());
    }

    #[test]
    fn test_format_amount() {
        let amount_wei = 1_000_000_000_000_000_000u64; // 1 ETH
        let formatted = Utils::format_amount(amount_wei, 18);
        assert_eq!(formatted, "1.000000");
    }

    #[test]
    fn test_parse_amount() {
        let amount_str = "1.5";
        let parsed = Utils::parse_amount(amount_str, 18).unwrap();
        assert_eq!(parsed, 1_500_000_000_000_000_000u64);
    }

    #[test]
    fn test_generate_random_string() {
        let random = Utils::generate_random_string(10);
        assert_eq!(random.len(), 10);
    }

    #[test]
    fn test_bytes_conversion() {
        let original = b"Hello, World!";
        let hex = Utils::bytes_to_hex(original);
        let bytes = Utils::hex_to_bytes(&hex).unwrap();
        assert_eq!(original, bytes.as_slice());
    }
} 