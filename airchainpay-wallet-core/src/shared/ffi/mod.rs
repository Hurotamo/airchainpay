use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use crate::error::{WalletError, WalletResult};
use crate::crypto::{PasswordHasher, KeyManager, SignatureManager};
use crate::types::{SecurePrivateKey, SecureSeedPhrase};

/// FFI wrapper for password hashing
#[no_mangle]
pub extern "C" fn hash_password(password: *const c_char) -> *mut c_char {
    let password_str = unsafe {
        match CStr::from_ptr(password).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    let hasher = PasswordHasher::new_default();
    match hasher.hash_password(password_str) {
        Ok(hash) => {
            match CString::new(hash) {
                Ok(c_string) => c_string.into_raw(),
                Err(_) => std::ptr::null_mut(),
            }
        }
        Err(_) => std::ptr::null_mut(),
    }
}

/// FFI wrapper for password verification
#[no_mangle]
pub extern "C" fn verify_password(password: *const c_char, hash: *const c_char) -> bool {
    let password_str = unsafe {
        match CStr::from_ptr(password).to_str() {
            Ok(s) => s,
            Err(_) => return false,
        }
    };

    let hash_str = unsafe {
        match CStr::from_ptr(hash).to_str() {
            Ok(s) => s,
            Err(_) => return false,
        }
    };

    let hasher = PasswordHasher::new_default();
    hasher.verify_password(password_str, hash_str).unwrap_or(false)
}

/// FFI wrapper for private key generation
#[no_mangle]
pub extern "C" fn generate_private_key() -> *mut c_char {
    let key_manager = KeyManager::new();
    match key_manager.generate_private_key() {
        Ok(private_key) => {
            let hex_key = private_key.to_hex();
            match CString::new(hex_key) {
                Ok(c_string) => c_string.into_raw(),
                Err(_) => std::ptr::null_mut(),
            }
        }
        Err(_) => std::ptr::null_mut(),
    }
}

/// FFI wrapper for public key generation
#[no_mangle]
pub extern "C" fn get_public_key(private_key_hex: *const c_char) -> *mut c_char {
    let private_key_str = unsafe {
        match CStr::from_ptr(private_key_hex).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    let key_manager = KeyManager::new();
    match hex::decode(private_key_str.trim_start_matches("0x")) {
        Ok(key_bytes) => {
            if key_bytes.len() != 32 {
                return std::ptr::null_mut();
            }
            
            let mut key_array = [0u8; 32];
            key_array.copy_from_slice(&key_bytes);
            let private_key = SecurePrivateKey::new(key_array);
            
            match key_manager.public_key_from_private(&private_key) {
                Ok(public_key) => {
                    let public_key_hex = hex::encode(public_key.serialize());
                    match CString::new(public_key_hex) {
                        Ok(c_string) => c_string.into_raw(),
                        Err(_) => std::ptr::null_mut(),
                    }
                }
                Err(_) => std::ptr::null_mut(),
            }
        }
        Err(_) => std::ptr::null_mut(),
    }
}

/// FFI wrapper for address generation
#[no_mangle]
pub extern "C" fn get_address(public_key_hex: *const c_char) -> *mut c_char {
    let public_key_str = unsafe {
        match CStr::from_ptr(public_key_hex).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    let key_manager = KeyManager::new();
    match hex::decode(public_key_str.trim_start_matches("0x")) {
        Ok(key_bytes) => {
            let secp = secp256k1::Secp256k1::new();
            match secp256k1::PublicKey::from_slice(&key_bytes) {
                Ok(public_key) => {
                    match key_manager.address_from_public(&public_key) {
                        Ok(address) => {
                            match CString::new(address) {
                                Ok(c_string) => c_string.into_raw(),
                                Err(_) => std::ptr::null_mut(),
                            }
                        }
                        Err(_) => std::ptr::null_mut(),
                    }
                }
                Err(_) => std::ptr::null_mut(),
            }
        }
        Err(_) => std::ptr::null_mut(),
    }
}

/// FFI wrapper for message signing
#[no_mangle]
pub extern "C" fn sign_message(message: *const c_char, private_key_hex: *const c_char) -> *mut c_char {
    let message_str = unsafe {
        match CStr::from_ptr(message).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    let private_key_str = unsafe {
        match CStr::from_ptr(private_key_hex).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    let signature_manager = SignatureManager::new();
    match hex::decode(private_key_str.trim_start_matches("0x")) {
        Ok(key_bytes) => {
            if key_bytes.len() != 32 {
                return std::ptr::null_mut();
            }
            
            let mut key_array = [0u8; 32];
            key_array.copy_from_slice(&key_bytes);
            let private_key = SecurePrivateKey::new(key_array);
            
            match signature_manager.sign_message(message_str.as_bytes(), &private_key) {
                Ok(signature) => {
                    let signature_hex = hex::encode(signature.serialize());
                    match CString::new(signature_hex) {
                        Ok(c_string) => c_string.into_raw(),
                        Err(_) => std::ptr::null_mut(),
                    }
                }
                Err(_) => std::ptr::null_mut(),
            }
        }
        Err(_) => std::ptr::null_mut(),
    }
}

/// Free memory allocated by FFI functions
#[no_mangle]
pub extern "C" fn free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe {
            let _ = CString::from_raw(ptr);
        }
    }
} 