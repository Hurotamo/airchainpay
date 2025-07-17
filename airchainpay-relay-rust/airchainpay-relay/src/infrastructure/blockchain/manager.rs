use crate::infrastructure::config::Config;
use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use ethers::{
    providers::{Provider, Http},
    core::types::{Address, U256, H256, Log},
    prelude::*,
};
use ethers::types::Bytes;
use crate::app::transaction_service::QueuedTransaction;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GasEstimate {
    pub gas_limit: U256,
    pub gas_price: U256,
    pub max_fee_per_gas: Option<U256>,
    pub max_priority_fee_per_gas: Option<U256>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionReceipt {
    pub transaction_hash: H256,
    pub block_number: Option<U256>,
    pub gas_used: U256,
    pub status: Option<U256>,
    pub logs: Vec<Log>,
}

pub struct BlockchainManager {

    providers: HashMap<u64, Provider<Http>>,
    // critical_error_handler: Option<Arc<CriticalErrorHandler>>, // Removed
}

impl BlockchainManager {
    pub fn new(config: Config) -> Result<Self> {
        let mut providers = HashMap::new();
        let mut contracts = HashMap::new();
        
        // Initialize providers for all supported chains
        for (chain_id, chain_config) in &config.supported_chains {
            let provider = Provider::<Http>::try_from(&chain_config.rpc_url)
                .map_err(|e| anyhow!("Failed to create HTTP provider for chain {}: {}", chain_id, e))?;
            
            providers.insert(*chain_id, provider.clone());
            
            // Initialize contract if address is provided
            if !chain_config.contract_address.is_empty() {
                let contract_address: Address = chain_config.contract_address.parse()
                    .map_err(|e| anyhow!("Invalid contract address for chain {}: {}", chain_id, e))?;
                
                // Fix ABI usage by converting bytes to ABI
                let abi_bytes = include_bytes!("../../abi/AirChainPay.json");
                let abi_value: serde_json::Value = serde_json::from_slice(abi_bytes).unwrap();
                let abi: ethers::abi::Abi = serde_json::from_value(abi_value).unwrap();
                let contract = Contract::new(contract_address, abi, Arc::new(provider));
                contracts.insert(*chain_id, contract);
            }
        }
        
        Ok(Self {
            providers,
            // critical_error_handler: None, // Removed
        })
    }

    // pub fn with_critical_error_handler(mut self, handler: Arc<CriticalErrorHandler>) -> Self { // Removed
    //     self.critical_error_handler = Some(handler); // Removed
    //     self // Removed
    // } // Removed









    pub async fn get_network_status(&self) -> Result<HashMap<String, String>> {
        // Return overall network status for all chains
        let mut status = HashMap::new();
        status.insert("overall_status".to_string(), "healthy".to_string());
        status.insert("total_chains".to_string(), self.providers.len().to_string());
        status.insert("timestamp".to_string(), chrono::Utc::now().to_rfc3339());
        Ok(status)
    }

    pub async fn send_transaction(&self, tx: &QueuedTransaction) -> Result<H256> {
        let chain_id = tx.chain_id;
        let signed_tx_hex = match &tx.metadata.get("signedTx") {
            Some(val) => val.as_str().ok_or_else(|| anyhow!("signedTx is not a string"))?,
            None => return Err(anyhow!("No signedTx in transaction metadata")),
        };
        let provider = self.providers.get(&chain_id)
            .ok_or_else(|| anyhow!("No provider for chain_id {}", chain_id))?;
        let raw_tx_bytes = hex::decode(signed_tx_hex.trim_start_matches("0x"))?;
        let pending_tx = provider.send_raw_transaction(Bytes::from(raw_tx_bytes)).await?;
        let receipt = pending_tx.await?;
        Ok(receipt.unwrap().transaction_hash)
    }
}
 