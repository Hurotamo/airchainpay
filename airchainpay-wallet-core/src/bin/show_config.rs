use dotenv::dotenv;
use std::env;

fn main() {
    dotenv().ok();
    let default_network = env::var("WALLET_CORE_DEFAULT_NETWORK").unwrap_or_else(|_| "core_testnet".to_string());
    let core_testnet_url = env::var("CORE_TESTNET_RPC_URL").unwrap_or_else(|_| "=https://rpc.test2.btcs.network".to_string());
    let base_sepolia_url = env::var("BASE_SEPOLIA_RPC_URL").unwrap_or_else(|_| "https://sepolia.base.org".to_string());

    let selected_url = match default_network.as_str() {
        "base_sepolia" => &base_sepolia_url,
        _ => &core_testnet_url,
    };

    println!("AirChainPay Wallet Core Network Configuration:\n");
    println!("  Default Network: {}", default_network);
    println!("  Core Testnet RPC URL: {}", core_testnet_url);
    println!("  Base Sepolia RPC URL: {}", base_sepolia_url);
    println!("  Selected RPC URL: {}", selected_url);
} 