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

#[allow(dead_code)]
pub fn validate_ethereum_address(address: &str) -> bool {
    address.parse::<Address>().is_ok()
}

#[allow(dead_code)]
pub fn validate_transaction_hash(hash: &str) -> bool {
    hash.parse::<H256>().is_ok()
}

#[allow(dead_code)]
pub fn parse_wei(amount: &str) -> Result<U256, Box<dyn std::error::Error>> {
    Ok(amount.parse::<U256>()?)
}

#[allow(dead_code)]
pub fn format_wei(amount: U256) -> String {
    amount.to_string()
}

#[allow(dead_code)]
pub fn parse_ether(amount: &str) -> Result<U256, Box<dyn std::error::Error>> {
    Ok(ethers::utils::parse_ether(amount)?)
}

#[allow(dead_code)]
pub fn format_ether(amount: U256) -> String {
    ethers::utils::format_ether(amount)
} 