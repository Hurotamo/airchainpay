use crate::config::{Config, ChainConfig};
use crate::utils::error_handler::EnhancedErrorHandler;
use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use ethers::{
    providers::{Provider, Http},
    signers::{LocalWallet, Signer},
    core::types::{Address, U256, H256, BlockNumber, Log},
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
    contracts: HashMap<u64, ContractInstance<Arc<Provider<Http>>, Provider<Http>>>,
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
            contracts,
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

    pub fn get_contract(&self, chain_id: u64) -> Result<&ContractInstance<Arc<Provider<Http>>, Provider<Http>>> {
        self.contracts.get(&chain_id)
            .ok_or_else(|| anyhow!("No contract found for chain ID: {}", chain_id))
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
        
        println!("Transaction sent: {:?}", tx_hash);
        
        Ok(format!("0x{:x}", tx_hash.tx_hash()))
    }

    pub async fn get_transaction_receipt(&self, tx_hash: &str, chain_id: u64) -> Result<TransactionReceipt> {
        let mut context = HashMap::new();
        context.insert("chain_id".to_string(), chain_id.to_string());
        context.insert("tx_hash".to_string(), tx_hash.to_string());

        // if let Some(handler) = &self.critical_error_handler { // Removed
        //     return handler.execute_critical_operation( // Removed
        //         CriticalPath::BlockchainTransaction, // Removed
        //         || async { // Removed
        //             let provider = self.get_provider(chain_id)?; // Removed
        //             
        //             let hash: H256 = tx_hash.parse() // Removed
        //                 .map_err(|e| anyhow!("Invalid transaction hash: {}", e))?; // Removed
        //             
        //             let receipt = provider // Removed
        //                 .get_transaction_receipt(hash) // Removed
        //                 .await // Removed
        //                 .map_err(|e| anyhow!("Failed to get transaction receipt: {}", e))? // Removed
        //                 .ok_or_else(|| anyhow!("Transaction receipt not found"))?; // Removed
        //             
        //             Ok(TransactionReceipt { // Removed
        //                 transaction_hash: receipt.transaction_hash, // Removed
        //                 block_number: receipt.block_number.map(|b| b.as_u64().into()), // Removed
        //                 gas_used: receipt.gas_used.unwrap_or_default(), // Removed
        //                 status: receipt.status.map(|s| s.as_u64().into()), // Removed
        //                 logs: receipt.logs, // Removed
        //             }) // Removed
        //         }, // Removed
        //         context, // Removed
        //     ).await.map_err(|e| anyhow!("Critical error getting transaction receipt: {}", e.error_message)); // Removed
        // } // Removed

        // Fallback to direct execution
        let provider = self.get_provider(chain_id)?;
        
        let hash: H256 = tx_hash.parse()
            .map_err(|e| anyhow!("Invalid transaction hash: {}", e))?;
        
        let receipt = provider
            .get_transaction_receipt(hash)
            .await
            .map_err(|e| anyhow!("Failed to get transaction receipt: {}", e))?
            .ok_or_else(|| anyhow!("Transaction receipt not found"))?;
        
        Ok(TransactionReceipt {
            transaction_hash: receipt.transaction_hash,
            block_number: receipt.block_number.map(|b| b.as_u64().into()),
            gas_used: receipt.gas_used.unwrap_or_default(),
            status: receipt.status.map(|s| s.as_u64().into()),
            logs: receipt.logs,
        })
    }

    pub async fn estimate_gas(&self, to: &str, data: &str, chain_id: u64) -> Result<GasEstimate> {
        let mut context = HashMap::new();
        context.insert("chain_id".to_string(), chain_id.to_string());
        context.insert("to_address".to_string(), to.to_string());
        context.insert("data_length".to_string(), data.len().to_string());

        // if let Some(handler) = &self.critical_error_handler { // Removed
        //     return handler.execute_critical_operation( // Removed
        //         CriticalPath::BlockchainTransaction, // Removed
        //         || async { // Removed
        //             let provider = self.get_provider(chain_id)?; // Removed
        //             
        //             let to_address: Address = to.parse() // Removed
        //                 .map_err(|e| anyhow!("Invalid address: {}", e))?; // Removed
        //             
        //             let data_bytes = hex::decode(data.trim_start_matches("0x")) // Removed
        //                 .map_err(|e| anyhow!("Invalid data hex: {}", e))?; // Removed
        //             
        //             let mut tx = ethers::types::TransactionRequest::new() // Removed
        //                 .to(to_address) // Removed
        //                 .data(data_bytes); // Removed
        //             let typed_tx = tx; // Removed
        //             let gas_limit = provider // Removed
        //                 .estimate_gas(&typed_tx.into(), None) // Removed
        //                 .await // Removed
        //                 .map_err(|e| anyhow!("Failed to estimate gas: {}", e))?; // Removed
        //             
        //             let gas_price = provider // Removed
        //                 .get_gas_price() // Removed
        //                 .await // Removed
        //                 .map_err(|e| anyhow!("Failed to get gas price: {}", e))?; // Removed
        //             
        //             // For EIP-1559 chains, get max fee and priority fee // Removed
        //             let max_fee_per_gas = if chain_id == 84532 { // Base Sepolia // Removed
        //                 Some(gas_price * U256::from(2)) // 2x current gas price // Removed
        //             } else { // Removed
        //                 None // Removed
        //             }; // Removed
        //             
        //             let max_priority_fee_per_gas = if chain_id == 84532 { // Removed
        //                 Some(U256::from(1500000000u64)) // 1.5 gwei // Removed
        //             } else { // Removed
        //                 None // Removed
        //             }; // Removed
        //             
        //             Ok(GasEstimate { // Removed
        //                 gas_limit, // Removed
        //                 gas_price, // Removed
        //                 max_fee_per_gas, // Removed
        //                 max_priority_fee_per_gas, // Removed
        //             }) // Removed
        //         }, // Removed
        //         context, // Removed
        //     ).await.map_err(|e| anyhow!("Critical error estimating gas: {}", e.error_message)); // Removed
        // } // Removed

        // Fallback to direct execution
        let provider = self.get_provider(chain_id)?;
        
        let to_address: Address = to.parse()
            .map_err(|e| anyhow!("Invalid address: {}", e))?;
        
        let data_bytes = hex::decode(data.trim_start_matches("0x"))
            .map_err(|e| anyhow!("Invalid data hex: {}", e))?;
        
        let mut tx = ethers::types::TransactionRequest::new()
            .to(to_address)
            .data(data_bytes);
        let typed_tx = tx;
        let gas_limit = provider
            .estimate_gas(&typed_tx.into(), None)
            .await
            .map_err(|e| anyhow!("Failed to estimate gas: {}", e))?;
        
        let gas_price = provider
            .get_gas_price()
            .await
            .map_err(|e| anyhow!("Failed to get gas price: {}", e))?;
        
        // For EIP-1559 chains, get max fee and priority fee
        let max_fee_per_gas = if chain_id == 84532 { // Base Sepolia
            Some(gas_price * U256::from(2)) // 2x current gas price
        } else {
            None
        };
        
        let max_priority_fee_per_gas = if chain_id == 84532 {
            Some(U256::from(1500000000u64)) // 1.5 gwei
        } else {
            None
        };
        
        Ok(GasEstimate {
            gas_limit,
            gas_price,
            max_fee_per_gas,
            max_priority_fee_per_gas,
        })
    }

    pub async fn get_balance(&self, address: &str, chain_id: u64) -> Result<U256> {
        let mut context = HashMap::new();
        context.insert("chain_id".to_string(), chain_id.to_string());
        context.insert("address".to_string(), address.to_string());

        // if let Some(handler) = &self.critical_error_handler { // Removed
        //     return handler.execute_critical_operation( // Removed
        //         CriticalPath::BlockchainTransaction, // Removed
        //         || async { // Removed
        //             let provider = self.get_provider(chain_id)?; // Removed
        //             
        //             let address: Address = address.parse() // Removed
        //                 .map_err(|e| anyhow!("Invalid address: {}", e))?; // Removed
        //             
        //             let balance = provider // Removed
        //                 .get_balance(address, None) // Removed
        //                 .await // Removed
        //                 .map_err(|e| anyhow!("Failed to get balance: {}", e))?; // Removed
        //             
        //             Ok(balance) // Removed
        //         }, // Removed
        //         context, // Removed
        //     ).await.map_err(|e| anyhow!("Critical error getting balance: {}", e.error_message)); // Removed
        // } // Removed

        // Fallback to direct execution
        let provider = self.get_provider(chain_id)?;
        
        let address: Address = address.parse()
            .map_err(|e| anyhow!("Invalid address: {}", e))?;
        
        let balance = provider
            .get_balance(address, None)
            .await
            .map_err(|e| anyhow!("Failed to get balance: {}", e))?;
        
        Ok(balance)
    }

    pub async fn get_nonce(&self, address: &str, chain_id: u64) -> Result<U256> {
        let mut context = HashMap::new();
        context.insert("chain_id".to_string(), chain_id.to_string());
        context.insert("address".to_string(), address.to_string());

        // if let Some(handler) = &self.critical_error_handler { // Removed
        //     return handler.execute_critical_operation( // Removed
        //         CriticalPath::BlockchainTransaction, // Removed
        //         || async { // Removed
        //             let provider = self.get_provider(chain_id)?; // Removed
        //             
        //             let address: Address = address.parse() // Removed
        //                 .map_err(|e| anyhow!("Invalid address: {}", e))?; // Removed
        //             
        //             let nonce = provider // Removed
        //                 .get_transaction_count(address, None) // Removed
        //                 .await // Removed
        //                 .map_err(|e| anyhow!("Failed to get nonce: {}", e))?; // Removed
        //             
        //             Ok(nonce) // Removed
        //         }, // Removed
        //         context, // Removed
        //     ).await.map_err(|e| anyhow!("Critical error getting nonce: {}", e.error_message)); // Removed
        // } // Removed

        // Fallback to direct execution
        let provider = self.get_provider(chain_id)?;
        
        let address: Address = address.parse()
            .map_err(|e| anyhow!("Invalid address: {}", e))?;
        
        let nonce = provider
            .get_transaction_count(address, None)
            .await
            .map_err(|e| anyhow!("Failed to get nonce: {}", e))?;
        
        Ok(nonce)
    }

    pub async fn get_block_number(&self, chain_id: u64) -> Result<U256> {
        let mut context = HashMap::new();
        context.insert("chain_id".to_string(), chain_id.to_string());

        // if let Some(handler) = &self.critical_error_handler { // Removed
        //     return handler.execute_critical_operation( // Removed
        //         CriticalPath::BlockchainTransaction, // Removed
        //         || async { // Removed
        //             let provider = self.get_provider(chain_id)?; // Removed
        //             
        //             let block_number = provider // Removed
        //                 .get_block_number() // Removed
        //                 .await // Removed
        //                 .map_err(|e| anyhow!("Failed to get block number: {}", e))?; // Removed
        //             
        //             Ok(block_number.as_u64().into()) // Removed
        //         }, // Removed
        //         context, // Removed
        //     ).await.map_err(|e| anyhow!("Critical error getting block number: {}", e.error_message)); // Removed
        // } // Removed

        // Fallback to direct execution
        let provider = self.get_provider(chain_id)?;
        
        let block_number = provider
            .get_block_number()
            .await
            .map_err(|e| anyhow!("Failed to get block number: {}", e))?;
        
        Ok(block_number.as_u64().into())
    }

    pub async fn get_contract_events(&self, contract_address: &str, from_block: u64, to_block: u64, chain_id: u64) -> Result<Vec<Log>> {
        let mut context = HashMap::new();
        context.insert("chain_id".to_string(), chain_id.to_string());
        context.insert("contract_address".to_string(), contract_address.to_string());
        context.insert("from_block".to_string(), from_block.to_string());
        context.insert("to_block".to_string(), to_block.to_string());

        // if let Some(handler) = &self.critical_error_handler { // Removed
        //     return handler.execute_critical_operation( // Removed
        //         CriticalPath::BlockchainTransaction, // Removed
        //         || async { // Removed
        //             let provider = self.get_provider(chain_id)?; // Removed
        //             
        //             let address: Address = contract_address.parse() // Removed
        //                 .map_err(|e| anyhow!("Invalid contract address: {}", e))?; // Removed
        //             
        //             let filter = ethers::types::Filter::new() // Removed
        //                 .address(address) // Removed
        //                 .from_block(BlockNumber::Number(from_block.into())) // Removed
        //                 .to_block(BlockNumber::Number(to_block.into())); // Removed
        //             
        //             let logs = provider // Removed
        //                 .get_logs(&filter) // Removed
        //                 .await // Removed
        //                 .map_err(|e| anyhow!("Failed to get logs: {}", e))?; // Removed
        //             
        //             Ok(logs) // Removed
        //         }, // Removed
        //         context, // Removed
        //     ).await.map_err(|e| anyhow!("Critical error getting contract events: {}", e.error_message)); // Removed
        // } // Removed

        // Fallback to direct execution
        let provider = self.get_provider(chain_id)?;
        
        let address: Address = contract_address.parse()
            .map_err(|e| anyhow!("Invalid contract address: {}", e))?;
        
        let filter = ethers::types::Filter::new()
            .address(address)
            .from_block(BlockNumber::Number(from_block.into()))
            .to_block(BlockNumber::Number(to_block.into()));
        
        let logs = provider
            .get_logs(&filter)
            .await
            .map_err(|e| anyhow!("Failed to get logs: {}", e))?;
        
        Ok(logs)
    }

    pub async fn is_transaction_confirmed(&self, tx_hash: &str, chain_id: u64, confirmations: u64) -> Result<bool> {
        let mut context = HashMap::new();
        context.insert("chain_id".to_string(), chain_id.to_string());
        context.insert("tx_hash".to_string(), tx_hash.to_string());
        context.insert("confirmations".to_string(), confirmations.to_string());

        // if let Some(handler) = &self.critical_error_handler { // Removed
        //     return handler.execute_critical_operation( // Removed
        //         CriticalPath::BlockchainTransaction, // Removed
        //         || async { // Removed
        //             let provider = self.get_provider(chain_id)?; // Removed
        //             
        //             let hash: H256 = tx_hash.parse() // Removed
        //                 .map_err(|e| anyhow!("Invalid transaction hash: {}", e))?; // Removed
        //             
        //             let receipt = provider // Removed
        //                 .get_transaction_receipt(hash) // Removed
        //                 .await // Removed
        //                 .map_err(|e| anyhow!("Failed to get transaction receipt: {}", e))? // Removed
        //                 .ok_or_else(|| anyhow!("Transaction receipt not found"))?; // Removed
        //             
        //             if let Some(block_number) = receipt.block_number { // Removed
        //                 let current_block = provider // Removed
        //                     .get_block_number() // Removed
        //                     .await // Removed
        //                     .map_err(|e| anyhow!("Failed to get current block number: {}", e))?; // Removed
        //                 
        //                 let confirmations_actual = current_block.as_u64().saturating_sub(block_number.as_u64()); // Removed
        //                 Ok(confirmations_actual >= confirmations) // Removed
        //             } else { // Removed
        //                 Ok(false) // Removed
        //             } // Removed
        //         }, // Removed
        //         context, // Removed
        //     ).await.map_err(|e| anyhow!("Critical error checking transaction confirmation: {}", e.error_message)); // Removed
        // } // Removed

        // Fallback to direct execution
        let provider = self.get_provider(chain_id)?;
        
        let hash: H256 = tx_hash.parse()
            .map_err(|e| anyhow!("Invalid transaction hash: {}", e))?;
        
        let receipt = provider
            .get_transaction_receipt(hash)
            .await
            .map_err(|e| anyhow!("Failed to get transaction receipt: {}", e))?
            .ok_or_else(|| anyhow!("Transaction receipt not found"))?;
        
        if let Some(block_number) = receipt.block_number {
            let current_block = provider
                .get_block_number()
                .await
                .map_err(|e| anyhow!("Failed to get current block number: {}", e))?;
            
            let confirmations_actual = current_block.as_u64().saturating_sub(block_number.as_u64());
            Ok(confirmations_actual >= confirmations)
        } else {
            Ok(false)
        }
    }

    pub async fn get_network_status(&self) -> Result<HashMap<String, String>> {
        // Return overall network status for all chains
        let mut status = HashMap::new();
        status.insert("overall_status".to_string(), "healthy".to_string());
        status.insert("total_chains".to_string(), self.providers.len().to_string());
        status.insert("timestamp".to_string(), chrono::Utc::now().to_rfc3339());
        Ok(status)
    }

    pub async fn get_network_info(&self, chain_id: u64) -> Result<HashMap<String, String>> {
        let mut context = HashMap::new();
        context.insert("chain_id".to_string(), chain_id.to_string());

        // if let Some(handler) = &self.critical_error_handler { // Removed
        //     return handler.execute_critical_operation( // Removed
        //         CriticalPath::BlockchainTransaction, // Removed
        //         || async { // Removed
        //             let provider = self.get_provider(chain_id)?; // Removed
        //             let chain_config = self.get_chain_config(chain_id) // Removed
        //                 .ok_or_else(|| anyhow!("Chain config not found for chain ID: {}", chain_id))?; // Removed
        //             
        //             let mut info = HashMap::new(); // Removed
        //             info.insert("chain_id".to_string(), chain_id.to_string()); // Removed
        //             info.insert("name".to_string(), chain_config.name.clone()); // Removed
        //             info.insert("rpc_url".to_string(), chain_config.rpc_url.clone()); // Removed
        //             info.insert("explorer".to_string(), chain_config.explorer.clone()); // Removed
        //             
        //             if let Some(symbol) = &chain_config.currency_symbol { // Removed
        //                 info.insert("currency_symbol".to_string(), symbol.clone()); // Removed
        //             } // Removed
        //             
        //             // Get current block number // Removed
        //             match provider.get_block_number().await { // Removed
        //                 Ok(block_number) => { // Removed
        //                     info.insert("current_block".to_string(), block_number.as_u64().to_string()); // Removed
        //                 } // Removed
        //                 Err(e) => { // Removed
        //                     println!("Failed to get block number for chain {}: {}", chain_id, e); // Removed
        //                 } // Removed
        //             } // Removed
        //             
        //             // Get gas price // Removed
        //             match provider.get_gas_price().await { // Removed
        //                 Ok(gas_price) => { // Removed
        //                     info.insert("gas_price".to_string(), gas_price.as_u64().to_string()); // Removed
        //                 } // Removed
        //                 Err(e) => { // Removed
        //                     println!("Failed to get gas price for chain {}: {}", chain_id, e); // Removed
        //                 } // Removed
        //             } // Removed
        //             
        //             Ok(info) // Removed
        //         }, // Removed
        //         context, // Removed
        //     ).await.map_err(|e| anyhow!("Critical error getting network info: {}", e.error_message)); // Removed
        // } // Removed

        // Fallback to direct execution
        let provider = self.get_provider(chain_id)?;
        let chain_config = self.get_chain_config(chain_id)
            .ok_or_else(|| anyhow!("Chain config not found for chain ID: {}", chain_id))?;
        
        let mut info = HashMap::new();
        info.insert("chain_id".to_string(), chain_id.to_string());
        info.insert("name".to_string(), chain_config.name.clone());
        info.insert("rpc_url".to_string(), chain_config.rpc_url.clone());
        info.insert("explorer".to_string(), chain_config.explorer.clone());
        
        if let Some(symbol) = &chain_config.currency_symbol {
            info.insert("currency_symbol".to_string(), symbol.clone());
        }
        
        // Get current block number
        match provider.get_block_number().await {
            Ok(block_number) => {
                info.insert("current_block".to_string(), block_number.as_u64().to_string());
            }
            Err(e) => {
                println!("Failed to get block number for chain {}: {}", chain_id, e);
            }
        }
        
        // Get gas price
        match provider.get_gas_price().await {
            Ok(gas_price) => {
                info.insert("gas_price".to_string(), gas_price.as_u64().to_string());
            }
            Err(e) => {
                println!("Failed to get gas price for chain {}: {}", chain_id, e);
            }
        }
        
        Ok(info)
    }

    pub async fn validate_chain_connection(&self, chain_id: u64) -> Result<bool> {
        let mut context = HashMap::new();
        context.insert("chain_id".to_string(), chain_id.to_string());

        // if let Some(handler) = &self.critical_error_handler { // Removed
        //     return handler.execute_critical_operation( // Removed
        //         CriticalPath::BlockchainTransaction, // Removed
        //         || async { // Removed
        //             let provider = self.get_provider(chain_id)?; // Removed
        //             
        //             // Try to get the latest block number // Removed
        //             match provider.get_block_number().await { // Removed
        //                 Ok(_) => { // Removed
        //                     println!("Chain {} connection validated successfully", chain_id); // Removed
        //                     Ok(true) // Removed
        //                 } // Removed
        //                 Err(e) => { // Removed
        //                     println!("Chain {} connection validation failed: {}", chain_id, e); // Removed
        //                     Ok(false) // Removed
        //                 } // Removed
        //             } // Removed
        //         }, // Removed
        //         context, // Removed
        //     ).await.map_err(|e| anyhow!("Critical error validating chain connection: {}", e.error_message)); // Removed
        // } // Removed

        // Fallback to direct execution
        let provider = self.get_provider(chain_id)?;
        
        // Try to get the latest block number
        match provider.get_block_number().await {
            Ok(_) => {
                println!("Chain {} connection validated successfully", chain_id);
                Ok(true)
            }
            Err(e) => {
                println!("Chain {} connection validation failed: {}", chain_id, e);
                Ok(false)
            }
        }
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
                    println!("Error checking transaction receipt: {}", e);
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                    attempts += 1;
                }
            }
        }
        
        Err(anyhow!("Transaction receipt not found after {} attempts", max_attempts))
    }
} 