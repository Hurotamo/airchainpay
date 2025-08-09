use dotenv::dotenv;
use std::env;

fn main() {
    dotenv().ok();
    let default_network = env::var("WALLET_CORE_DEFAULT_NETWORK").unwrap_or_else(|_| "core_testnet".to_string());
    let core_testnet_url = env::var("WALLET_CORE_RPC_CORE_TESTNET").unwrap_or_else(|_| "https://rpc.test2.btcs.network".to_string());
    let base_sepolia_url = env::var("WALLET_CORE_RPC_BASE_SEPOLIA").unwrap_or_else(|_| "https://sepolia.base.org".to_string());
    let lisk_sepolia_url = env::var("WALLET_CORE_RPC_LISK_SEPOLIA").unwrap_or_else(|_| "".to_string());
    let holesky_url = env::var("WALLET_CORE_RPC_HOLESKY").unwrap_or_else(|_| "".to_string());

    let selected_url = match default_network.as_str() {
        "base_sepolia" => &base_sepolia_url,
        "lisk_sepolia" => &lisk_sepolia_url,
        "holesky" => &holesky_url,
        _ => &core_testnet_url,
    };

    println!("AirChainPay Wallet Core Network Configuration:\n");
    println!("  Default Network: {}", default_network);
    println!("  Core Testnet RPC URL: {}", core_testnet_url);
    println!("  Base Sepolia RPC URL: {}", base_sepolia_url);
    println!("  Lisk Sepolia RPC URL: {}", if lisk_sepolia_url.is_empty() { "(not set)" } else { &lisk_sepolia_url });
    println!("  Holesky RPC URL: {}", if holesky_url.is_empty() { "(not set)" } else { &holesky_url });
    println!("  Selected RPC URL: {}", selected_url);
} 