use crate::config::{Config, ChainConfig};
use crate::logger::Logger;
use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use web3::{
    Web3, 
    transports::Http, 
    types::{TransactionRequest, H256, U256, Address},
    contract::{Contract, Options},
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
    pub logs: Vec<web3::types::Log>,
}

pub struct BlockchainManager {
    config: Config,
    providers: HashMap<u64, Web3<Http>>,
    contracts: HashMap<u64, Contract<Http>>,
}

impl BlockchainManager {
    pub fn new(config: Config) -> Result<Self> {
        let mut providers = HashMap::new();
        let mut contracts = HashMap::new();
        
        // Initialize providers for all supported chains
        for (chain_id, chain_config) in &config.supported_chains {
            let transport = Http::new(&chain_config.rpc_url)
                .map_err(|e| anyhow!("Failed to create HTTP transport for chain {}: {}", chain_id, e))?;
            
            let web3 = Web3::new(transport);
            providers.insert(*chain_id, web3.clone());
            
            // Initialize contract if address is provided
            if !chain_config.contract_address.is_empty() {
                let contract_address: Address = chain_config.contract_address.parse()
                    .map_err(|e| anyhow!("Invalid contract address for chain {}: {}", chain_id, e))?;
                
                // Load contract ABI (simplified for now)
                let contract = Contract::new(web3.eth(), contract_address, include_bytes!("../abi/AirChainPay.json"));
                contracts.insert(*chain_id, contract);
            }
        }
        
        Ok(Self {
            config,
            providers,
            contracts,
        })
    }

    pub fn get_provider(&self, chain_id: u64) -> Result<&Web3<Http>> {
        self.providers.get(&chain_id)
            .ok_or_else(|| anyhow!("No provider found for chain ID: {}", chain_id))
    }

    pub fn get_contract(&self, chain_id: u64) -> Result<&Contract<Http>> {
        self.contracts.get(&chain_id)
            .ok_or_else(|| anyhow!("No contract found for chain ID: {}", chain_id))
    }

    pub fn get_chain_config(&self, chain_id: u64) -> Option<&ChainConfig> {
        self.config.get_chain_config(chain_id)
    }

    pub async fn send_transaction(&self, tx_bytes: Vec<u8>, rpc_url: &str, chain_id: u64) -> Result<String> {
        let provider = self.get_provider(chain_id)?;
        
        // Create transaction request
        let tx_hash = provider.eth()
            .send_raw_transaction(tx_bytes.into())
            .await
            .map_err(|e| anyhow!("Failed to send transaction: {}", e))?;
        
        Logger::info(&format!("Transaction sent: {:?}", tx_hash));
        
        Ok(format!("0x{:x}", tx_hash))
    }

    pub async fn get_transaction_receipt(&self, tx_hash: &str, chain_id: u64) -> Result<TransactionReceipt> {
        let provider = self.get_provider(chain_id)?;
        
        let hash: H256 = tx_hash.parse()
            .map_err(|e| anyhow!("Invalid transaction hash: {}", e))?;
        
        let receipt = provider.eth()
            .transaction_receipt(hash)
            .await
            .map_err(|e| anyhow!("Failed to get transaction receipt: {}", e))?
            .ok_or_else(|| anyhow!("Transaction receipt not found"))?;
        
        Ok(TransactionReceipt {
            transaction_hash: receipt.transaction_hash,
            block_number: receipt.block_number.map(|b| b.as_u256()),
            gas_used: receipt.gas_used,
            status: receipt.status,
            logs: receipt.logs,
        })
    }

    pub async fn estimate_gas(&self, to: &str, data: &str, chain_id: u64) -> Result<GasEstimate> {
        let provider = self.get_provider(chain_id)?;
        
        let to_address: Address = to.parse()
            .map_err(|e| anyhow!("Invalid address: {}", e))?;
        
        let data_bytes = hex::decode(data.trim_start_matches("0x"))
            .map_err(|e| anyhow!("Invalid data hex: {}", e))?;
        
        let gas_limit = provider.eth()
            .estimate_gas(TransactionRequest {
                to: Some(to_address),
                data: Some(data_bytes.into()),
                ..Default::default()
            }, None)
            .await
            .map_err(|e| anyhow!("Failed to estimate gas: {}", e))?;
        
        let gas_price = provider.eth()
            .gas_price()
            .await
            .map_err(|e| anyhow!("Failed to get gas price: {}", e))?;
        
        // For EIP-1559 chains, get max fee and priority fee
        let max_fee_per_gas = if chain_id == 84532 || chain_id == 8453 { // Base chains
            Some(gas_price * U256::from(2)) // 2x current gas price
        } else {
            None
        };
        
        let max_priority_fee_per_gas = if chain_id == 84532 || chain_id == 8453 {
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
        let provider = self.get_provider(chain_id)?;
        
        let address: Address = address.parse()
            .map_err(|e| anyhow!("Invalid address: {}", e))?;
        
        let balance = provider.eth()
            .balance(address, None)
            .await
            .map_err(|e| anyhow!("Failed to get balance: {}", e))?;
        
        Ok(balance)
    }

    pub async fn get_nonce(&self, address: &str, chain_id: u64) -> Result<U256> {
        let provider = self.get_provider(chain_id)?;
        
        let address: Address = address.parse()
            .map_err(|e| anyhow!("Invalid address: {}", e))?;
        
        let nonce = provider.eth()
            .transaction_count(address, None)
            .await
            .map_err(|e| anyhow!("Failed to get nonce: {}", e))?;
        
        Ok(nonce)
    }

    pub async fn get_block_number(&self, chain_id: u64) -> Result<U256> {
        let provider = self.get_provider(chain_id)?;
        
        let block_number = provider.eth()
            .block_number()
            .await
            .map_err(|e| anyhow!("Failed to get block number: {}", e))?;
        
        Ok(block_number)
    }

    pub async fn call_contract(&self, contract_address: &str, data: &str, chain_id: u64) -> Result<Vec<u8>> {
        let provider = self.get_provider(chain_id)?;
        
        let contract_address: Address = contract_address.parse()
            .map_err(|e| anyhow!("Invalid contract address: {}", e))?;
        
        let data_bytes = hex::decode(data.trim_start_matches("0x"))
            .map_err(|e| anyhow!("Invalid data hex: {}", e))?;
        
        let result = provider.eth()
            .call(TransactionRequest {
                to: Some(contract_address),
                data: Some(data_bytes.into()),
                ..Default::default()
            }, None)
            .await
            .map_err(|e| anyhow!("Failed to call contract: {}", e))?;
        
        Ok(result.0)
    }

    pub async fn get_contract_events(&self, contract_address: &str, from_block: u64, to_block: u64, chain_id: u64) -> Result<Vec<web3::types::Log>> {
        let provider = self.get_provider(chain_id)?;
        
        let contract_address: Address = contract_address.parse()
            .map_err(|e| anyhow!("Invalid contract address: {}", e))?;
        
        let filter = web3::types::FilterBuilder::default()
            .address(vec![contract_address])
            .from_block(web3::types::BlockNumber::Number(from_block.into()))
            .to_block(web3::types::BlockNumber::Number(to_block.into()))
            .build();
        
        let logs = provider.eth()
            .logs(filter)
            .await
            .map_err(|e| anyhow!("Failed to get contract events: {}", e))?;
        
        Ok(logs)
    }

    pub async fn is_transaction_confirmed(&self, tx_hash: &str, chain_id: u64, confirmations: u64) -> Result<bool> {
        let provider = self.get_provider(chain_id)?;
        
        let hash: H256 = tx_hash.parse()
            .map_err(|e| anyhow!("Invalid transaction hash: {}", e))?;
        
        let receipt = provider.eth()
            .transaction_receipt(hash)
            .await
            .map_err(|e| anyhow!("Failed to get transaction receipt: {}", e))?
            .ok_or_else(|| anyhow!("Transaction receipt not found"))?;
        
        if let Some(block_number) = receipt.block_number {
            let current_block = provider.eth()
                .block_number()
                .await
                .map_err(|e| anyhow!("Failed to get current block number: {}", e))?;
            
            let confirmations_needed = current_block - block_number.as_u256();
            Ok(confirmations_needed >= U256::from(confirmations))
        } else {
            Ok(false)
        }
    }

    pub async fn get_network_info(&self, chain_id: u64) -> Result<HashMap<String, String>> {
        let provider = self.get_provider(chain_id)?;
        let chain_config = self.get_chain_config(chain_id)
            .ok_or_else(|| anyhow!("Chain config not found"))?;
        
        let mut info = HashMap::new();
        info.insert("chain_id".to_string(), chain_id.to_string());
        info.insert("chain_name".to_string(), chain_config.name.clone());
        info.insert("rpc_url".to_string(), chain_config.rpc_url.clone());
        info.insert("explorer".to_string(), chain_config.explorer.clone());
        
        // Get current block number
        match provider.eth().block_number().await {
            Ok(block_number) => {
                info.insert("current_block".to_string(), block_number.as_u64().to_string());
            }
            Err(e) => {
                Logger::warn(&format!("Failed to get block number: {}", e));
            }
        }
        
        // Get gas price
        match provider.eth().gas_price().await {
            Ok(gas_price) => {
                info.insert("gas_price".to_string(), gas_price.as_u64().to_string());
            }
            Err(e) => {
                Logger::warn(&format!("Failed to get gas price: {}", e));
            }
        }
        
        Ok(info)
    }

    pub async fn validate_chain_connection(&self, chain_id: u64) -> Result<bool> {
        match self.get_provider(chain_id) {
            Ok(provider) => {
                match provider.eth().block_number().await {
                    Ok(_) => Ok(true),
                    Err(e) => {
                        Logger::error(&format!("Chain {} connection failed: {}", chain_id, e));
                        Ok(false)
                    }
                }
            }
            Err(e) => {
                Logger::error(&format!("No provider for chain {}: {}", chain_id, e));
                Ok(false)
            }
        }
    }
} 