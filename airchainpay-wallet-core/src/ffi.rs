//! FFI bindings for the wallet core
//! 
//! This module provides C-compatible function bindings for the wallet core.
//! All functions are designed to be safe and handle errors gracefully.

use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use crate::domain::Wallet;
use crate::shared::types::Network;

/// Create a new wallet
#[no_mangle]
pub extern "C" fn wallet_core_create_wallet(
    name: *const c_char,
    network: i32,
) -> *mut c_char {
    let name_str = unsafe {
        match CStr::from_ptr(name).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    let network_enum = match network {
        1114 => Network::CoreTestnet,
        84532 => Network::BaseSepolia,
        _ => return std::ptr::null_mut(),
    };

    // Create wallet with secure key management
    let file_storage = match crate::infrastructure::platform::FileStorage::new() {
        Ok(storage) => storage,
        Err(_) => return std::ptr::null_mut(),
    };
    
    let key_manager = crate::core::crypto::keys::KeyManager::new(&file_storage);
    
    // Generate a unique key ID for this wallet
    let key_id = format!("wallet_key_{}", uuid::Uuid::new_v4());
    
    // Generate private key securely
    let private_key = match key_manager.generate_private_key(&key_id) {
        Ok(pk) => pk,
        Err(_) => return std::ptr::null_mut(),
    };
    
    // Get public key without loading private key into memory
    let public_key = match key_manager.get_public_key(&private_key) {
        Ok(pk) => pk,
        Err(_) => return std::ptr::null_mut(),
    };
    
    // Get address from public key
    let address = match key_manager.get_address(&public_key) {
        Ok(addr) => addr,
        Err(_) => return std::ptr::null_mut(),
    };
    
    // Create wallet (no private key stored in wallet struct)
    let wallet = match Wallet::new(
        name_str.to_string(),
        address,
        public_key,
        network_enum,
    ) {
        Ok(w) => w,
        Err(_) => return std::ptr::null_mut(),
    };
    
    // Convert to safe WalletInfo for serialization
    let wallet_info = wallet.to_wallet_info();
    
    let wallet_json = match serde_json::to_string(&wallet_info) {
        Ok(json) => json,
        Err(_) => return std::ptr::null_mut(),
    };
    
    match CString::new(wallet_json) {
        Ok(c_string) => c_string.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// Import wallet from seed phrase
#[no_mangle]
pub extern "C" fn wallet_core_import_wallet(
    seed_phrase: *const c_char,
) -> *mut c_char {
    let seed_phrase_str = unsafe {
        match CStr::from_ptr(seed_phrase).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    // Create wallet with secure key management
    let file_storage = match crate::infrastructure::platform::FileStorage::new() {
        Ok(storage) => storage,
        Err(_) => return std::ptr::null_mut(),
    };
    
    let key_manager = crate::core::crypto::keys::KeyManager::new(&file_storage);
    
    // Generate a unique key ID for this wallet
    let key_id = format!("wallet_key_{}", uuid::Uuid::new_v4());
    
    // Derive private key from seed phrase securely
    let private_key = match key_manager.derive_private_key_from_seed(seed_phrase_str, &key_id) {
        Ok(pk) => pk,
        Err(_) => return std::ptr::null_mut(),
    };
    
    // Get public key without loading private key into memory
    let public_key = match key_manager.get_public_key(&private_key) {
        Ok(pk) => pk,
        Err(_) => return std::ptr::null_mut(),
    };
    
    // Get address from public key
    let address = match key_manager.get_address(&public_key) {
        Ok(addr) => addr,
        Err(_) => return std::ptr::null_mut(),
    };
    
    // Create wallet (no private key stored in wallet struct)
    let wallet = match Wallet::new(
        "Imported Wallet".to_string(),
        address,
        public_key,
        Network::CoreTestnet, // Default to CoreTestnet for import
    ) {
        Ok(w) => w,
        Err(_) => return std::ptr::null_mut(),
    };
    
    // Convert to safe WalletInfo for serialization
    let wallet_info = wallet.to_wallet_info();
    
    let wallet_json = match serde_json::to_string(&wallet_info) {
        Ok(json) => json,
        Err(_) => return std::ptr::null_mut(),
    };
    
    match CString::new(wallet_json) {
        Ok(c_string) => c_string.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// Sign a message using a wallet's private key
#[no_mangle]
pub extern "C" fn wallet_core_sign_message(
    wallet_id: *const c_char,
    message: *const c_char,
) -> *mut c_char {
    let wallet_id_str = unsafe {
        match CStr::from_ptr(wallet_id).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    let message_str = unsafe {
        match CStr::from_ptr(message).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    // Get secure storage and key manager
    let file_storage = match crate::infrastructure::platform::FileStorage::new() {
        Ok(storage) => storage,
        Err(_) => return std::ptr::null_mut(),
    };
    
    let key_manager = crate::core::crypto::keys::KeyManager::new(&file_storage);
    
    // Get private key reference (does not load key into memory)
    let private_key = match key_manager.get_private_key(wallet_id_str) {
        Ok(pk) => pk,
        Err(_) => return std::ptr::null_mut(),
    };
    
    // Sign message without loading private key into memory
    let signature = match key_manager.sign_message(&private_key, message_str) {
        Ok(sig) => sig,
        Err(_) => return std::ptr::null_mut(),
    };
    
    match CString::new(signature) {
        Ok(c_string) => c_string.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// Get wallet balance
#[no_mangle]
pub extern "C" fn wallet_core_get_balance(
    wallet_id: *const c_char,
) -> *mut c_char {
    let _wallet_id_str = unsafe {
        match CStr::from_ptr(wallet_id).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    // For now, return a default balance
    // In a real implementation, this would query the blockchain
    let balance = "0".to_string();
    
    match CString::new(balance) {
        Ok(c_string) => c_string.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// Free a C string
#[no_mangle]
pub extern "C" fn wallet_core_free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe {
            let _ = CString::from_raw(ptr);
        }
    }
} 