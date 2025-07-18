use std::collections::HashMap;
use ethers::{
    core::types::{Address, Bytes, U256, H256, TxHash},
    providers::{Http, Provider},
    middleware::Middleware,
};
use serde::{Deserialize, Serialize};
// Remove logger import and replace with simple logging
// use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChainConfig {
    pub chain_id: u64,
    pub rpc_url: String,
    pub contract_address: Option<Address>,
    pub name: String,
    pub native_currency: NativeCurrency,
    pub block_time: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeCurrency {
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionData {
    pub id: String,
    pub to: Address,
    pub amount: String,
    pub chain_id: u64,
    pub token_address: Option<Address>,
    pub timestamp: u64,
    pub status: String,
    pub metadata: Option<TransactionMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionMetadata {
    pub device_id: Option<String>,
    pub retry_count: Option<u32>,
    pub gas_price: Option<String>,
    pub gas_limit: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GasEstimate {
    pub gas_limit: U256,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkStatus {
    pub is_healthy: bool,
    pub connected_networks: u32,
    pub last_block_time: Option<chrono::DateTime<chrono::Utc>>,
    pub gas_price_updates: u32,
    pub pending_transactions: u32,
    pub failed_transactions: u32,
    pub total_networks: u32,
    pub average_response_time_ms: f64,
    pub last_error: Option<String>,
    pub uptime_seconds: f64,
    pub network_details: HashMap<String, serde_json::Value>,
}









pub async fn send_transaction(signed_tx: Vec<u8>, rpc_url: &str) -> Result<TxHash, Box<dyn std::error::Error>> {
    let provider = Provider::<Http>::try_from(rpc_url)?;
    
    let pending_tx = provider.send_raw_transaction(Bytes::from(signed_tx)).await?;
    
    Ok(pending_tx.tx_hash())
}


pub fn validate_ethereum_address(address: &str) -> bool {
    address.parse::<Address>().is_ok()
}

pub fn validate_transaction_hash(hash: &str) -> bool {
    hash.parse::<H256>().is_ok()
}

pub fn parse_wei(amount: &str) -> Result<U256, Box<dyn std::error::Error>> {
    // Parse as base-10 integer (wei is always a whole number)
    Ok(U256::from_dec_str(amount)?)
}

pub fn format_wei(amount: U256) -> String {
    amount.to_string()
}

pub fn parse_ether(amount: &str) -> Result<U256, Box<dyn std::error::Error>> {
    Ok(ethers::utils::parse_ether(amount)?)
}

pub fn format_ether(amount: U256) -> String {
    ethers::utils::format_ether(amount)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_ethereum_address() {
        // Valid addresses
        assert!(validate_ethereum_address("0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6"));
        assert!(validate_ethereum_address("0x0000000000000000000000000000000000000000"));
        
        // Invalid addresses
        assert!(!validate_ethereum_address("0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b")); // Too short
        assert!(!validate_ethereum_address("0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8bG")); // Invalid character
    }

    #[test]
    fn test_validate_transaction_hash() {
        // Valid transaction hashes
        assert!(validate_transaction_hash("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"));
        assert!(validate_transaction_hash("0x0000000000000000000000000000000000000000000000000000000000000000"));
        
        // Invalid transaction hashes
        assert!(!validate_transaction_hash("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcde")); // Too short
        assert!(!validate_transaction_hash("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeg")); // Invalid character
    }

    #[test]
    fn test_parse_and_format_wei() {
        // Test with a smaller amount that fits in u64
        let small_amount = "1000000";
        let parsed_small = parse_wei(small_amount).unwrap();
        let formatted_small = format_wei(parsed_small);
        assert_eq!(formatted_small, small_amount);
        
        // Test with a medium amount
        let medium_amount = "100000000000000000"; // 0.1 ETH in wei
        let parsed_medium = parse_wei(medium_amount).unwrap();
        let formatted_medium = format_wei(parsed_medium);
        assert_eq!(formatted_medium, medium_amount);
    }

    #[test]
    fn test_parse_and_format_ether() {
        let amount_str = "1.5";
        let parsed = parse_ether(amount_str).unwrap();
        let formatted = format_ether(parsed);
        // ethers::utils::format_ether returns with full precision
        assert_eq!(formatted, "1.500000000000000000");
        
        // Test with whole number
        let whole_amount = "1";
        let parsed_whole = parse_ether(whole_amount).unwrap();
        let formatted_whole = format_ether(parsed_whole);
        assert_eq!(formatted_whole, "1.000000000000000000");
    }

    #[test]
    fn test_performance_comparison() {
        use std::time::Instant;
        
        // Test performance of our validation functions
        let test_addresses = vec![
            "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
            "0x0000000000000000000000000000000000000000",
            "0x1234567890123456789012345678901234567890",
        ];
        
        let start = Instant::now();
        for _ in 0..10000 {
            for addr in &test_addresses {
                let _ = validate_ethereum_address(addr);
            }
        }
        let duration = start.elapsed();
        
        println!("Validated 30,000 addresses in {:?}", duration);
        println!("Average time per validation: {:?}", duration / 30000);
    }
} 