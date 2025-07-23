//! FFI bindings for React Native integration
//! 
//! This module provides C-compatible function signatures for integration with React Native.

use crate::core::storage::StorageManager;
use crate::domain::Wallet;
use crate::shared::types::{Network, Address, Amount, Transaction, SignedTransaction, WalletBackupInfo, WalletBackup};
use crate::shared::types::BLEPaymentData;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use serde_json;
use ethers::providers::{Provider, Http, Middleware};
use ethers::types::{Address as EthersAddress, U256, TransactionRequest};
use ethers::signers::{LocalWallet, Signer};
use ethers::contract::abigen;
use std::sync::Arc;
use tokio::runtime::Runtime;
use ethers::middleware::SignerMiddleware;
use std::ptr;

abigen!(ERC20, r#"[
    function balanceOf(address) view returns (uint256)
]"#);

async fn get_wallet_balance(address: &str, network: Network) -> Result<String, Box<dyn std::error::Error>> {
    let provider = Arc::new(Provider::<Http>::try_from(network.rpc_url())?);
    let addr: EthersAddress = address.parse()?;
    let balance = provider.get_balance(addr, None).await?;
    Ok(balance.to_string())
}

async fn get_token_balance(address: &str, token_address: &str, network: Network) -> Result<String, Box<dyn std::error::Error>> {
    let provider = Arc::new(Provider::<Http>::try_from(network.rpc_url())?);
    let addr: EthersAddress = address.parse()?;
    let token_addr: EthersAddress = token_address.parse()?;
    let contract = ERC20::new(token_addr, provider.clone());
    let balance: U256 = contract.balance_of(addr).call().await?;
    Ok(balance.to_string())
}

async fn send_transaction(wallet_private_key: &str, to: &str, amount: &str, network: Network) -> Result<String, Box<dyn std::error::Error>> {
    let provider = Arc::new(Provider::<Http>::try_from(network.rpc_url())?);
    let wallet: LocalWallet = wallet_private_key.parse()?;
    let wallet = wallet.with_chain_id(network.chain_id());
    let client = Arc::new(SignerMiddleware::new(provider, wallet));
    let to_addr: EthersAddress = to.parse()?;
    let value = U256::from_dec_str(amount)?;
    let tx = TransactionRequest::pay(to_addr, value);
    let pending_tx = client.send_transaction(tx, None).await?;
    let tx_hash = pending_tx.tx_hash();
    Ok(format!("0x{:x}", tx_hash))
}

/// Initialize the wallet core
#[no_mangle]
pub extern "C" fn wallet_core_init() -> i32 {
    // match crate::init() {
    //     Ok(_) => 0,
    //     Err(_) => 1,
    // }
    0
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

    // Minimal: generate private key, get address, construct Wallet
    let file_storage = crate::infrastructure::platform::FileStorage::new().unwrap();
    let key_manager = crate::core::crypto::keys::KeyManager::new(&file_storage);
    let private_key = match key_manager.get_private_key("temp_id") {
        Ok(pk) => pk,
        Err(_) => return std::ptr::null_mut(),
    };
    let public_key = match key_manager.get_public_key(&private_key) {
        Ok(pk) => pk,
        Err(_) => return std::ptr::null_mut(),
    };
    let address = match key_manager.get_address(&public_key) {
        Ok(addr) => addr,
        Err(_) => return std::ptr::null_mut(),
    };
    let wallet = match Wallet::new(
        name_str.to_string(),
        address,
        "".to_string(),
        network_enum,
    ) {
        Ok(w) => w,
        Err(_) => return std::ptr::null_mut(),
    };
    let wallet_json = match serde_json::to_string(&wallet) {
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

    // Minimal: derive private key from seed, get address, construct Wallet
    let file_storage = crate::infrastructure::platform::FileStorage::new().unwrap();
    let key_manager = crate::core::crypto::keys::KeyManager::new(&file_storage);
    let private_key = match key_manager.get_private_key(seed_phrase_str) {
        Ok(pk) => pk,
        Err(_) => return std::ptr::null_mut(),
    };
    let public_key = match key_manager.get_public_key(&private_key) {
        Ok(pk) => pk,
        Err(_) => return std::ptr::null_mut(),
    };
    let address = match key_manager.get_address(&public_key) {
        Ok(addr) => addr,
        Err(_) => return std::ptr::null_mut(),
    };
    let wallet = match Wallet::new(
        "Imported Wallet".to_string(),
        address,
        "".to_string(), // public_key not needed for minimal info
        Network::CoreTestnet, // Default to CoreTestnet for import
    ) {
        Ok(w) => w,
        Err(_) => return std::ptr::null_mut(),
    };
    let wallet_json = match serde_json::to_string(&wallet) {
        Ok(json) => json,
        Err(_) => return std::ptr::null_mut(),
    };
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

    // Minimal: sign the message with the private key for wallet_id
    // NOTE: For now, generate a key for demonstration (replace with real lookup when available)
    let file_storage = crate::infrastructure::platform::FileStorage::new().unwrap();
    let key_manager = crate::core::crypto::keys::KeyManager::new(&file_storage);
    let private_key = match key_manager.get_private_key(wallet_id_str) {
        Ok(pk) => pk,
        Err(_) => return std::ptr::null_mut(),
    };
    let signature_manager = crate::core::crypto::signatures::SignatureManager::new();
    let signature = match signature_manager.sign_message(message_str.as_bytes(), &private_key) {
        Ok(sig) => format!("0x{}", hex::encode(sig.serialize_compact())),
        Err(_) => return std::ptr::null_mut(),
    };
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
    password: *const c_char,
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
    let password_str = unsafe {
        match CStr::from_ptr(password).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };
    let network_enum = match network {
        1114 => Network::CoreTestnet,
        84532 => Network::BaseSepolia,
        _ => return std::ptr::null_mut(),
    };
    // Minimal: load wallet, sign, and send real transaction
    let rt = Runtime::new().unwrap();
    let file_storage = crate::infrastructure::platform::FileStorage::new().unwrap();
    let key_manager = crate::core::crypto::keys::KeyManager::new(&file_storage);
    let wallet = match rt.block_on(key_manager.load_wallet(wallet_id_str, password_str)) {
        Ok(w) => w,
        Err(_) => return std::ptr::null_mut(),
    };
    let private_key = &wallet.id; // Replace with real key retrieval
    let tx_hash = match rt.block_on(async {
        let provider = Arc::new(Provider::<Http>::try_from(network_enum.rpc_url()).unwrap());
        let local_wallet: LocalWallet = private_key.parse().unwrap();
        let local_wallet = local_wallet.with_chain_id(network_enum.chain_id());
        let client = Arc::new(SignerMiddleware::new(provider, local_wallet));
        let to_addr: EthersAddress = to_address_str.parse().unwrap();
        let value = U256::from_dec_str(amount_str).unwrap();
        let tx = TransactionRequest::pay(to_addr, value);
        let pending_tx = client.send_transaction(tx, None).await.unwrap();
        let tx_hash = pending_tx.tx_hash();
        Ok::<_, ()>(format!("0x{:x}", tx_hash))
    }) {
        Ok(h) => h,
        Err(_) => return std::ptr::null_mut(),
    };
    match CString::new(tx_hash) {
        Ok(c_string) => c_string.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// Get wallet balance
#[no_mangle]
pub extern "C" fn wallet_core_get_balance(
    wallet_id: *const c_char,
    network: i32,
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
    let network_enum = match network {
        1114 => Network::CoreTestnet,
        84532 => Network::BaseSepolia,
        _ => return std::ptr::null_mut(),
    };
    // Minimal: load wallet and query real balance
    let rt = Runtime::new().unwrap();
    let file_storage = crate::infrastructure::platform::FileStorage::new().unwrap();
    let key_manager = crate::core::crypto::keys::KeyManager::new(&file_storage);
    let wallet = match rt.block_on(key_manager.load_wallet(wallet_id_str, password_str)) {
        Ok(w) => w,
        Err(_) => return std::ptr::null_mut(),
    };
    let balance = match rt.block_on(get_wallet_balance(&wallet.address, network_enum.clone())) {
        Ok(b) => b,
        Err(_) => return std::ptr::null_mut(),
    };
    let balance_json = format!(
        r#"{{"wallet_id":"{}","network":"{:?}","amount":"{}","currency":"{}"}}"#,
        wallet_id_str, network_enum, balance, network_enum.native_currency()
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
    password: *const c_char,
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
    let password_str = unsafe {
        match CStr::from_ptr(password).to_str() {
            Ok(s) => s,
            Err(_) => return std::ptr::null_mut(),
        }
    };
    let network_enum = match network {
        1114 => Network::CoreTestnet,
        84532 => Network::BaseSepolia,
        _ => return std::ptr::null_mut(),
    };
    // Minimal: load wallet and query real token balance
    let rt = Runtime::new().unwrap();
    let file_storage = crate::infrastructure::platform::FileStorage::new().unwrap();
    let key_manager = crate::core::crypto::keys::KeyManager::new(&file_storage);
    let wallet = match rt.block_on(key_manager.load_wallet(wallet_id_str, password_str)) {
        Ok(w) => w,
        Err(_) => return std::ptr::null_mut(),
    };
    let balance = match rt.block_on(get_token_balance(&wallet.address, token_address_str, network_enum.clone())) {
        Ok(b) => b,
        Err(_) => return std::ptr::null_mut(),
    };
    let balance_json = format!(
        r#"{{"wallet_id":"{}","token_address":"{}","network":"{:?}","balance":"{}"}}"#,
        wallet_id_str, token_address_str, network_enum, balance
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
    let rt = Runtime::new().unwrap();
    let file_storage = crate::infrastructure::platform::FileStorage::new().unwrap();
    let key_manager = crate::core::crypto::keys::KeyManager::new(&file_storage);
    // Load wallet from storage
    let wallet = match rt.block_on(key_manager.load_wallet(wallet_id_str, password_str)) {
        Ok(w) => w,
        Err(_) => return std::ptr::null_mut(),
    };
    // Backup wallet using SecureStorage
    let backup_info = match rt.block_on(key_manager.backup_wallet(&wallet, password_str)) {
        Ok(info) => info,
        Err(_) => return std::ptr::null_mut(),
    };
    let backup_json = match serde_json::to_string(&backup_info) {
        Ok(json) => json,
        Err(_) => return std::ptr::null_mut(),
    };
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
    let backup_info: crate::shared::types::WalletBackupInfo = match serde_json::from_str(backup_data_str) {
        Ok(info) => info,
        Err(_) => return std::ptr::null_mut(),
    };
    let rt = Runtime::new().unwrap();
    let file_storage = crate::infrastructure::platform::FileStorage::new().unwrap();
    let key_manager = crate::core::crypto::keys::KeyManager::new(&file_storage);
    // Restore wallet using SecureStorage
    let wallet = match rt.block_on(key_manager.restore_wallet(&backup_info, password_str)) {
        Ok(w) => w,
        Err(_) => return std::ptr::null_mut(),
    };
    let wallet_json = match serde_json::to_string(&wallet) {
        Ok(json) => json,
        Err(_) => return std::ptr::null_mut(),
    };
    match CString::new(wallet_json) {
        Ok(c_string) => c_string.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
} 

#[no_mangle]
pub extern "C" fn wallet_core_ble_send_payment(payment_json: *const c_char) -> i32 {
    let c_str = unsafe {
        if payment_json.is_null() { return 1; }
        CStr::from_ptr(payment_json)
    };
    let payment: BLEPaymentData = match serde_json::from_str(c_str.to_str().unwrap_or("")) {
        Ok(p) => p,
        Err(_) => return 1,
    };
    let rt = Runtime::new().unwrap();
    let file_storage = crate::infrastructure::platform::FileStorage::new().unwrap();
    let key_manager = crate::core::crypto::keys::KeyManager::new(&file_storage);
    match rt.block_on(key_manager.send_payment(&payment)) {
        Ok(_) => 0,
        Err(_) => 1,
    }
}

#[no_mangle]
pub extern "C" fn wallet_core_ble_receive_payment(result_buf: *mut c_char, buf_len: usize) -> i32 {
    if result_buf.is_null() || buf_len == 0 { return 1; }
    let rt = Runtime::new().unwrap();
    let file_storage = crate::infrastructure::platform::FileStorage::new().unwrap();
    let key_manager = crate::core::crypto::keys::KeyManager::new(&file_storage);
    match rt.block_on(key_manager.receive_payment()) {
        Ok(payment) => {
            let json = match serde_json::to_string(&payment) {
                Ok(j) => j,
                Err(_) => return 1,
            };
            let bytes = json.as_bytes();
            let copy_len = usize::min(bytes.len(), buf_len - 1);
            unsafe {
                ptr::copy_nonoverlapping(bytes.as_ptr(), result_buf as *mut u8, copy_len);
                *result_buf.add(copy_len) = 0;
            }
            0
        },
        Err(_) => 1,
    }
} 