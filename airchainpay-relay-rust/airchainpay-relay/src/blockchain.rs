use crate::config::{Config, ChainConfig};
use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use ethers::{
    providers::{Provider, Http},
    core::types::{Address, U256, H256, Log},
    prelude::*,
};

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
    config: Config,
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
                let abi_bytes = include_bytes!("abi/AirChainPay.json");
                let abi_value: serde_json::Value = serde_json::from_slice(abi_bytes).unwrap();
                let abi: ethers::abi::Abi = serde_json::from_value(abi_value).unwrap();
                let contract = Contract::new(contract_address, abi, Arc::new(provider));
                contracts.insert(*chain_id, contract);
            }
        }
        
        Ok(Self {
            config,
            providers,
            // critical_error_handler: None, // Removed
        })
    }

    // pub fn with_critical_error_handler(mut self, handler: Arc<CriticalErrorHandler>) -> Self { // Removed
    //     self.critical_error_handler = Some(handler); // Removed
    //     self // Removed
    // } // Removed

    pub fn get_provider(&self, chain_id: u64) -> Result<&Provider<Http>> {
        self.providers.get(&chain_id)
            .ok_or_else(|| anyhow!("No provider found for chain ID: {}", chain_id))
    }

    pub fn get_chain_config(&self, chain_id: u64) -> Option<&ChainConfig> {
        self.config.get_chain_config(chain_id)
    }

    pub async fn send_transaction(&self, tx_bytes: Vec<u8>, rpc_url: &str, chain_id: u64) -> Result<String> {
        let mut context = HashMap::new();
        context.insert("chain_id".to_string(), chain_id.to_string());
        context.insert("rpc_url".to_string(), rpc_url.to_string());
        context.insert("tx_size".to_string(), tx_bytes.len().to_string());

        // if let Some(handler) = &self.critical_error_handler { // Removed
        //     return handler.execute_critical_operation( // Removed
        //         CriticalPath::BlockchainTransaction, // Removed
        //         || async { // Removed
        //             let provider = self.get_provider(chain_id)?; // Removed
        //             
        //             // Create transaction request // Removed
        //             let tx_hash = provider // Removed
        //                 .send_raw_transaction(tx_bytes.clone().into()) // Removed
        //                 .await // Removed
        //                 .map_err(|e| anyhow!("Failed to send transaction: {}", e))?; // Removed
        //             
        //             println!("Transaction sent: {:?}", tx_hash); // Removed
        //             
        //             Ok(format!("0x{:x}", tx_hash.tx_hash())) // Removed
        //         }, // Removed
        //         context, // Removed
        //     ).await.map_err(|e| anyhow!("Critical error in blockchain transaction: {}", e.error_message)); // Removed
        // } // Removed

        // Fallback to direct execution if no critical error handler
        let provider = self.get_provider(chain_id)?;
        
        // Create transaction request
        let tx_hash = provider
            .send_raw_transaction(tx_bytes.into())
            .await
            .map_err(|e| anyhow!("Failed to send transaction: {}", e))?;
        
        println!("Transaction sent: {tx_hash:?}");
        
        Ok(format!("0x{:x}", tx_hash.tx_hash()))
    }







    pub async fn get_network_status(&self) -> Result<HashMap<String, String>> {
        // Return overall network status for all chains
        let mut status = HashMap::new();
        status.insert("overall_status".to_string(), "healthy".to_string());
        status.insert("total_chains".to_string(), self.providers.len().to_string());
        status.insert("timestamp".to_string(), chrono::Utc::now().to_rfc3339());
        Ok(status)
    }





    pub async fn wait_for_transaction_receipt(&self, tx_hash: &str, rpc_url: &str, chain_id: u64) -> Result<TransactionReceipt> {
        let mut context = HashMap::new();
        context.insert("chain_id".to_string(), chain_id.to_string());
        context.insert("tx_hash".to_string(), tx_hash.to_string());
        context.insert("rpc_url".to_string(), rpc_url.to_string());

        // if let Some(handler) = &self.critical_error_handler { // Removed
        //     return handler.execute_critical_operation( // Removed
        //         CriticalPath::BlockchainTransaction, // Removed
        //         || async { // Removed
        //             let provider = self.get_provider(chain_id)?; // Removed
        //             
        //             let hash: H256 = tx_hash.parse() // Removed
        //                 .map_err(|e| anyhow!("Invalid transaction hash: {}", e))?; // Removed
        //             
        //             // Wait for transaction receipt with timeout // Removed
        //             let mut attempts = 0; // Removed
        //             let max_attempts = 60; // 5 minutes with 5-second intervals // Removed
        //             
        //             while attempts < max_attempts { // Removed
        //                 match provider.get_transaction_receipt(hash).await { // Removed
        //                     Ok(Some(receipt)) => { // Removed
        //                         return Ok(TransactionReceipt { // Removed
        //                             transaction_hash: receipt.transaction_hash, // Removed
        //                             block_number: receipt.block_number.map(|b| b.as_u64().into()), // Removed
        //                             gas_used: receipt.gas_used.unwrap_or_default(), // Removed
        //                             status: receipt.status.map(|s| s.as_u64().into()), // Removed
        //                             logs: receipt.logs, // Removed
        //                         }); // Removed
        //                     } // Removed
        //                     Ok(None) => { // Removed
        //                         // Transaction not yet mined // Removed
        //                         tokio::time::sleep(tokio::time::Duration::from_secs(5)).await; // Removed
        //                         attempts += 1; // Removed
        //                     } // Removed
        //                     Err(e) => { // Removed
        //                         println!("Error checking transaction receipt: {}", e); // Removed
        //                         tokio::time::sleep(tokio::time::Duration::from_secs(5)).await; // Removed
        //                         attempts += 1; // Removed
        //                     } // Removed
        //                 } // Removed
        //             } // Removed
        //             
        //             Err(anyhow!("Transaction receipt not found after {} attempts", max_attempts)) // Removed
        //         }, // Removed
        //         context, // Removed
        //     ).await.map_err(|e| anyhow!("Critical error waiting for transaction receipt: {}", e.error_message)); // Removed
        // } // Removed

        // Fallback to direct execution
        let provider = self.get_provider(chain_id)?;
        
        let hash: H256 = tx_hash.parse()
            .map_err(|e| anyhow!("Invalid transaction hash: {}", e))?;
        
        // Wait for transaction receipt with timeout
        let mut attempts = 0;
        let max_attempts = 60; // 5 minutes with 5-second intervals
        
        while attempts < max_attempts {
            match provider.get_transaction_receipt(hash).await {
                Ok(Some(receipt)) => {
                    return Ok(TransactionReceipt {
                        transaction_hash: receipt.transaction_hash,
                        block_number: receipt.block_number.map(|b| b.as_u64().into()),
                        gas_used: receipt.gas_used.unwrap_or_default(),
                        status: receipt.status.map(|s| s.as_u64().into()),
                        logs: receipt.logs,
                    });
                }
                Ok(None) => {
                    // Transaction not yet mined
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                    attempts += 1;
                }
                Err(e) => {
                    println!("Error checking transaction receipt: {e}");
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                    attempts += 1;
                }
            }
        }
        
        Err(anyhow!("Transaction receipt not found after {} attempts", max_attempts))
    }
} 