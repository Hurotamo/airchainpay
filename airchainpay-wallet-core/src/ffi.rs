//! FFI bindings for React Native integration
//! 
//! This module provides C-compatible function signatures for integration with React Native.

use crate::shared::error::WalletError;
use crate::shared::types::{Network, Address, Amount, Transaction, SignedTransaction, Wallet};
use std::ffi::{CStr, CString};
use std::os::raw::c_char;

/// Initialize the wallet core
#[no_mangle]
pub extern "C" fn wallet_core_init() -> i32 {
    match crate::init() {
        Ok(_) => 0,
        Err(_) => -1,
    }
}

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

    // Mock implementation - in production, this would create a real wallet
    let wallet_json = format!(
        r#"{{"id":"wallet_123","name":"{}","address":"0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6","network":"{:?}"}}"#,
        name_str, network_enum
    );

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

    // Mock implementation - in production, this would import a real wallet
    let wallet_json = format!(
        r#"{{"id":"imported_wallet_123","name":"Imported Wallet","address":"0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6","network":"CoreTestnet"}}"#
    );

    match CString::new(wallet_json) {
        Ok(c_string) => c_string.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// Sign a message
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

    // Mock implementation - in production, this would sign with real private key
    let signature = format!("0x{}", hex::encode(format!("signed_{}", message_str).as_bytes()));

    match CString::new(signature) {
        Ok(c_string) => c_string.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// Send a transaction
#[no_mangle]
pub extern "C" fn wallet_core_send_transaction(
    wallet_id: *const c_char,
    to_address: *const c_char,
    amount: *const c_char,
    network: i32,
) -> *mut c_char {
    let wallet_id_str = unsafe {
        match CStr::from_ptr(wallet_id).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    let to_address_str = unsafe {
        match CStr::from_ptr(to_address).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    let amount_str = unsafe {
        match CStr::from_ptr(amount).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    let network_enum = match network {
        1114 => Network::CoreTestnet,
        84532 => Network::BaseSepolia,
        _ => return std::ptr::null_mut(),
    };

    // Mock implementation - in production, this would send a real transaction
    let transaction_hash = format!("0x{}", hex::encode(format!("tx_{}_{}_{}", wallet_id_str, to_address_str, amount_str).as_bytes()));

    match CString::new(transaction_hash) {
        Ok(c_string) => c_string.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// Get wallet balance
#[no_mangle]
pub extern "C" fn wallet_core_get_balance(
    wallet_id: *const c_char,
    network: i32,
) -> *mut c_char {
    let wallet_id_str = unsafe {
        match CStr::from_ptr(wallet_id).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    let network_enum = match network {
        1114 => Network::CoreTestnet,
        84532 => Network::BaseSepolia,
        _ => return std::ptr::null_mut(),
    };

    // Mock implementation - in production, this would query blockchain
    let balance_json = format!(
        r#"{{"wallet_id":"{}","network":"{:?}","amount":"0.0","currency":"{}"}}"#,
        wallet_id_str, network_enum, network_enum.native_currency()
    );

    match CString::new(balance_json) {
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

/// Get supported networks
#[no_mangle]
pub extern "C" fn wallet_core_get_supported_networks() -> *mut c_char {
    let networks_json = r#"[{"chain_id":1114,"name":"Core Testnet"},{"chain_id":84532,"name":"Base Sepolia"}]"#;

    match CString::new(networks_json) {
        Ok(c_string) => c_string.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// Get token balance
#[no_mangle]
pub extern "C" fn wallet_core_get_token_balance(
    wallet_id: *const c_char,
    token_address: *const c_char,
    network: i32,
) -> *mut c_char {
    let wallet_id_str = unsafe {
        match CStr::from_ptr(wallet_id).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    let token_address_str = unsafe {
        match CStr::from_ptr(token_address).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    // Mock implementation - in production, this would query token contract
    let balance_json = format!(
        r#"{{"token_address":"{}","balance":"0.0","formatted_balance":"0.0"}}"#,
        token_address_str
    );

    match CString::new(balance_json) {
        Ok(c_string) => c_string.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// Backup wallet
#[no_mangle]
pub extern "C" fn wallet_core_backup_wallet(
    wallet_id: *const c_char,
    password: *const c_char,
) -> *mut c_char {
    let wallet_id_str = unsafe {
        match CStr::from_ptr(wallet_id).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    let password_str = unsafe {
        match CStr::from_ptr(password).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    // Mock implementation - in production, this would create encrypted backup
    let backup_json = format!(
        r#"{{"version":"1.0.0","wallet_id":"{}","encrypted_data":"mock_encrypted_data","checksum":"mock_checksum"}}"#,
        wallet_id_str
    );

    match CString::new(backup_json) {
        Ok(c_string) => c_string.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// Restore wallet from backup
#[no_mangle]
pub extern "C" fn wallet_core_restore_wallet(
    backup_data: *const c_char,
    password: *const c_char,
) -> *mut c_char {
    let backup_data_str = unsafe {
        match CStr::from_ptr(backup_data).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    let password_str = unsafe {
        match CStr::from_ptr(password).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    // Mock implementation - in production, this would decrypt and restore wallet
    let wallet_json = format!(
        r#"{{"id":"restored_wallet_123","name":"Restored Wallet","address":"0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6","network":"CoreTestnet"}}"#
    );

    match CString::new(wallet_json) {
        Ok(c_string) => c_string.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::CString;

    #[test]
    fn test_wallet_core_init() {
        let result = wallet_core_init();
        assert_eq!(result, 0);
    }

    #[test]
    fn test_create_wallet() {
        let name = CString::new("Test Wallet").unwrap();
        let wallet_ptr = wallet_core_create_wallet(name.as_ptr(), 1114);
        assert!(!wallet_ptr.is_null());
        
        let wallet_str = unsafe { CStr::from_ptr(wallet_ptr).to_str().unwrap() };
        assert!(wallet_str.contains("Test Wallet"));
        
        wallet_core_free_string(wallet_ptr);
    }

    #[test]
    fn test_import_wallet() {
        let seed_phrase = CString::new("abandon ability able about above absent absorb abstract absurd abuse access accident").unwrap();
        let wallet_ptr = wallet_core_import_wallet(seed_phrase.as_ptr());
        assert!(!wallet_ptr.is_null());
        
        let wallet_str = unsafe { CStr::from_ptr(wallet_ptr).to_str().unwrap() };
        assert!(wallet_str.contains("Imported Wallet"));
        
        wallet_core_free_string(wallet_ptr);
    }

    #[test]
    fn test_sign_message() {
        let wallet_id = CString::new("test_wallet").unwrap();
        let message = CString::new("Hello World").unwrap();
        let signature_ptr = wallet_core_sign_message(wallet_id.as_ptr(), message.as_ptr());
        assert!(!signature_ptr.is_null());
        
        let signature_str = unsafe { CStr::from_ptr(signature_ptr).to_str().unwrap() };
        assert!(signature_str.starts_with("0x"));
        
        wallet_core_free_string(signature_ptr);
    }

    #[test]
    fn test_send_transaction() {
        let wallet_id = CString::new("test_wallet").unwrap();
        let to_address = CString::new("0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6").unwrap();
        let amount = CString::new("1000000000000000000").unwrap();
        let tx_hash_ptr = wallet_core_send_transaction(wallet_id.as_ptr(), to_address.as_ptr(), amount.as_ptr(), 1114);
        assert!(!tx_hash_ptr.is_null());
        
        let tx_hash_str = unsafe { CStr::from_ptr(tx_hash_ptr).to_str().unwrap() };
        assert!(tx_hash_str.starts_with("0x"));
        
        wallet_core_free_string(tx_hash_ptr);
    }

    #[test]
    fn test_get_balance() {
        let wallet_id = CString::new("test_wallet").unwrap();
        let balance_ptr = wallet_core_get_balance(wallet_id.as_ptr(), 1114);
        assert!(!balance_ptr.is_null());
        
        let balance_str = unsafe { CStr::from_ptr(balance_ptr).to_str().unwrap() };
        assert!(balance_str.contains("0.0"));
        
        wallet_core_free_string(balance_ptr);
    }

    #[test]
    fn test_get_supported_networks() {
        let networks_ptr = wallet_core_get_supported_networks();
        assert!(!networks_ptr.is_null());
        
        let networks_str = unsafe { CStr::from_ptr(networks_ptr).to_str().unwrap() };
        assert!(networks_str.contains("Core Testnet"));
        assert!(networks_str.contains("Base Sepolia"));
        
        wallet_core_free_string(networks_ptr);
    }
} 