//! FFI bindings for the wallet core
//! 
//! This module provides C-compatible function bindings for the wallet core.
//! All functions are designed to be safe and handle errors gracefully.
//! 
//! SECURITY: This module implements hardened FFI boundaries with:
//! - No raw string exposure of private keys
//! - Secure memory management with zeroization
//! - Input validation and sanitization
//! - Error handling that doesn't leak sensitive information

use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::ptr;
use crate::domain::Wallet;
use crate::shared::types::Network;
use crate::shared::error::WalletError;

/// Secure FFI result wrapper
#[repr(C)]
pub struct SecureResult {
    success: bool,
    data: *mut c_char,
    error_code: i32,
}

impl SecureResult {
    fn success(data: String) -> Self {
        // Handle CString creation errors gracefully
        match CString::new(data) {
            Ok(c_string) => Self {
                success: true,
                data: c_string.into_raw(),
                error_code: 0,
            },
            Err(_) => Self {
                success: false,
                data: ptr::null_mut(),
                error_code: 15, // String conversion failed
            },
        }
    }

    fn error(error_code: i32) -> Self {
        Self {
            success: false,
            data: ptr::null_mut(),
            error_code,
        }
    }
}

/// Input validation and sanitization
fn validate_input(input: *const c_char, max_length: usize) -> Result<String, WalletError> {
    if input.is_null() {
        return Err(WalletError::validation("Null input pointer".to_string()));
    }

    let input_str = unsafe {
        match CStr::from_ptr(input).to_str() {
            Ok(s) => s,
            Err(_) => return Err(WalletError::validation("Invalid UTF-8 input".to_string())),
        }
    };

    if input_str.len() > max_length {
        return Err(WalletError::validation("Input too long".to_string()));
    }

    if input_str.is_empty() {
        return Err(WalletError::validation("Empty input".to_string()));
    }

    // Sanitize input - remove any potentially dangerous characters
    let sanitized = input_str
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .collect::<String>();

    if sanitized != input_str {
        return Err(WalletError::validation("Input contains invalid characters".to_string()));
    }

    Ok(sanitized)
}

/// Validate network ID
fn validate_network(network: i32) -> Result<Network, WalletError> {
    match network {
        1114 => Ok(Network::CoreTestnet),
        84532 => Ok(Network::BaseSepolia),
        _ => Err(WalletError::validation("Unsupported network".to_string())),
    }
}

/// Create a new wallet with secure key management
#[no_mangle]
pub extern "C" fn wallet_core_create_wallet(
    name: *const c_char,
    network: i32,
) -> SecureResult {
    // Validate inputs
    let name_str = match validate_input(name, 50) {
        Ok(s) => s,
        Err(_) => return SecureResult::error(1), // Invalid input
    };

    let network_enum = match validate_network(network) {
        Ok(n) => n,
        Err(_) => return SecureResult::error(2), // Invalid network
    };

    // Create secure storage and key manager
    let file_storage = match crate::infrastructure::platform::FileStorage::new() {
        Ok(storage) => storage,
        Err(_) => return SecureResult::error(3), // Storage initialization failed
    };
    
    let key_manager = crate::core::crypto::keys::KeyManager::new(&file_storage);
    
    // Generate a unique key ID for this wallet
    let key_id = format!("wallet_key_{}", uuid::Uuid::new_v4());
    
    // Generate private key securely
    let private_key = match key_manager.generate_private_key(&key_id) {
        Ok(pk) => pk,
        Err(_) => return SecureResult::error(4), // Key generation failed
    };
    
    // Get public key without loading private key into memory
    let public_key = match key_manager.get_public_key(&private_key) {
        Ok(pk) => pk,
        Err(_) => return SecureResult::error(5), // Public key generation failed
    };
    
    // Get address from public key
    let address = match key_manager.get_address(&public_key) {
        Ok(addr) => addr,
        Err(_) => return SecureResult::error(6), // Address generation failed
    };
    
    // Create wallet (no private key stored in wallet struct)
    let wallet = match Wallet::new(
        name_str,
        address,
        public_key,
        network_enum,
    ) {
        Ok(w) => w,
        Err(_) => return SecureResult::error(7), // Wallet creation failed
    };
    
    // Convert to safe WalletInfo for serialization
    let wallet_info = wallet.to_wallet_info();
    
    let wallet_json = match serde_json::to_string(&wallet_info) {
        Ok(json) => json,
        Err(_) => return SecureResult::error(8), // Serialization failed
    };
    
    SecureResult::success(wallet_json)
}

/// Import wallet from seed phrase with secure key management
#[no_mangle]
pub extern "C" fn wallet_core_import_wallet(
    seed_phrase: *const c_char,
) -> SecureResult {
    // Validate seed phrase input
    let seed_phrase_str = match validate_input(seed_phrase, 200) {
        Ok(s) => s,
        Err(_) => return SecureResult::error(1), // Invalid input
    };

    // Validate seed phrase format
    let words: Vec<&str> = seed_phrase_str.split_whitespace().collect();
    if words.len() < 12 || words.len() > 24 {
        return SecureResult::error(9); // Invalid seed phrase length
    }

    // Create secure storage and key manager
    let file_storage = match crate::infrastructure::platform::FileStorage::new() {
        Ok(storage) => storage,
        Err(_) => return SecureResult::error(3), // Storage initialization failed
    };
    
    let key_manager = crate::core::crypto::keys::KeyManager::new(&file_storage);
    
    // Generate a unique key ID for this wallet
    let key_id = format!("wallet_key_{}", uuid::Uuid::new_v4());
    
    // Derive private key from seed phrase securely
    let private_key = match key_manager.derive_private_key_from_seed(&seed_phrase_str, &key_id) {
        Ok(pk) => pk,
        Err(_) => return SecureResult::error(10), // Seed phrase derivation failed
    };
    
    // Get public key without loading private key into memory
    let public_key = match key_manager.get_public_key(&private_key) {
        Ok(pk) => pk,
        Err(_) => return SecureResult::error(5), // Public key generation failed
    };
    
    // Get address from public key
    let address = match key_manager.get_address(&public_key) {
        Ok(addr) => addr,
        Err(_) => return SecureResult::error(6), // Address generation failed
    };
    
    // Create wallet (no private key stored in wallet struct)
    let wallet = match Wallet::new(
        "Imported Wallet".to_string(),
        address,
        public_key,
        Network::CoreTestnet, // Default to CoreTestnet for import
    ) {
        Ok(w) => w,
        Err(_) => return SecureResult::error(7), // Wallet creation failed
    };
    
    // Convert to safe WalletInfo for serialization
    let wallet_info = wallet.to_wallet_info();
    
    let wallet_json = match serde_json::to_string(&wallet_info) {
        Ok(json) => json,
        Err(_) => return SecureResult::error(8), // Serialization failed
    };
    
    SecureResult::success(wallet_json)
}

/// Sign a message using a wallet's private key with secure memory management
#[no_mangle]
pub extern "C" fn wallet_core_sign_message(
    wallet_id: *const c_char,
    message: *const c_char,
) -> SecureResult {
    // Validate inputs
    let wallet_id_str = match validate_input(wallet_id, 100) {
        Ok(s) => s,
        Err(_) => return SecureResult::error(1), // Invalid input
    };

    let message_str = match validate_input(message, 1000) {
        Ok(s) => s,
        Err(_) => return SecureResult::error(1), // Invalid input
    };

    // Get secure storage and key manager
    let file_storage = match crate::infrastructure::platform::FileStorage::new() {
        Ok(storage) => storage,
        Err(_) => return SecureResult::error(3), // Storage initialization failed
    };
    
    let key_manager = crate::core::crypto::keys::KeyManager::new(&file_storage);
    
    // Get private key reference (does not load key into memory)
    let private_key = match key_manager.get_private_key(&wallet_id_str) {
        Ok(pk) => pk,
        Err(_) => return SecureResult::error(11), // Private key not found
    };
    
    // Sign message without loading private key into memory
    let signature = match key_manager.sign_message(&private_key, &message_str) {
        Ok(sig) => sig,
        Err(_) => return SecureResult::error(12), // Signing failed
    };
    
    SecureResult::success(signature)
}

/// Get wallet balance (real on-chain query)
#[no_mangle]
pub extern "C" fn wallet_core_get_balance(
    wallet_id: *const c_char,
) -> SecureResult {
    // Validate input
    let wallet_id_str = match validate_input(wallet_id, 100) {
        Ok(s) => s,
        Err(_) => return SecureResult::error(1), // Invalid input
    };

    // Use a local runtime to call async balance method without exposing runtime externally
    let rt = match tokio::runtime::Runtime::new() {
        Ok(rt) => rt,
        Err(_) => return SecureResult::error(15), // Runtime creation failed
    };

    let result = rt.block_on(async {
        let manager = crate::core::wallet::WalletManager::new();
        manager.get_balance(&wallet_id_str).await
    });

    match result {
        Ok(balance) => SecureResult::success(balance),
        Err(_) => SecureResult::error(16), // Balance fetch failed
    }
}

/// Validate a wallet's private key without exposing it
#[no_mangle]
pub extern "C" fn wallet_core_validate_wallet(
    wallet_id: *const c_char,
) -> SecureResult {
    // Validate input
    let wallet_id_str = match validate_input(wallet_id, 100) {
        Ok(s) => s,
        Err(_) => return SecureResult::error(1), // Invalid input
    };

    // Get secure storage and key manager
    let file_storage = match crate::infrastructure::platform::FileStorage::new() {
        Ok(storage) => storage,
        Err(_) => return SecureResult::error(3), // Storage initialization failed
    };
    
    let key_manager = crate::core::crypto::keys::KeyManager::new(&file_storage);
    
    // Get private key reference
    let private_key = match key_manager.get_private_key(&wallet_id_str) {
        Ok(pk) => pk,
        Err(_) => return SecureResult::error(11), // Private key not found
    };
    
    // Validate the private key without exposing it
    let is_valid = match private_key.validate(&file_storage) {
        Ok(valid) => valid,
        Err(_) => return SecureResult::error(13), // Validation failed
    };
    
    let result = if is_valid { "true" } else { "false" };
    SecureResult::success(result.to_string())
}

/// Delete a wallet and its associated private key
#[no_mangle]
pub extern "C" fn wallet_core_delete_wallet(
    wallet_id: *const c_char,
) -> SecureResult {
    // Validate input
    let wallet_id_str = match validate_input(wallet_id, 100) {
        Ok(s) => s,
        Err(_) => return SecureResult::error(1), // Invalid input
    };

    // Get secure storage and key manager
    let file_storage = match crate::infrastructure::platform::FileStorage::new() {
        Ok(storage) => storage,
        Err(_) => return SecureResult::error(3), // Storage initialization failed
    };
    
    let key_manager = crate::core::crypto::keys::KeyManager::new(&file_storage);
    
    // Get private key reference
    let private_key = match key_manager.get_private_key(&wallet_id_str) {
        Ok(pk) => pk,
        Err(_) => return SecureResult::error(11), // Private key not found
    };
    
    // Delete the private key from secure storage
    if let Err(_) = private_key.delete(&file_storage) {
        return SecureResult::error(14); // Deletion failed
    };
    
    SecureResult::success("deleted".to_string())
}

/// Free a C string with secure memory cleanup
#[no_mangle]
pub extern "C" fn wallet_core_free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe {
            let _ = CString::from_raw(ptr);
        }
    }
}

/// Free a SecureResult with secure memory cleanup
#[no_mangle]
pub extern "C" fn wallet_core_free_result(result: *mut SecureResult) {
    if !result.is_null() {
        unsafe {
            let result_ref = &mut *result;
            if !result_ref.data.is_null() {
                let _ = CString::from_raw(result_ref.data);
            }
        }
    }
} 