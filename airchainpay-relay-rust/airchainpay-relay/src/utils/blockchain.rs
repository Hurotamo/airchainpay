use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use ethers::{
    providers::{Http, Provider},
    types::{Address, U256, Bytes, TransactionRequest},
    utils::hex,
};
use serde::{Deserialize, Serialize};
use crate::logger::Logger;

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

pub struct BlockchainManager {
    providers: Arc<RwLock<HashMap<u64, Provider<Http>>>>,
    contracts: Arc<RwLock<HashMap<u64, ethers::contract::Contract<Http>>>>,
    supported_chains: HashMap<u64, ChainConfig>,
}

impl BlockchainManager {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let supported_chains = Self::load_supported_chains()?;
        
        Ok(Self {
            providers: Arc::new(RwLock::new(HashMap::new())),
            contracts: Arc::new(RwLock::new(HashMap::new())),
            supported_chains,
        })
    }

    fn load_supported_chains() -> Result<HashMap<u64, ChainConfig>, Box<dyn std::error::Error>> {
        let mut chains = HashMap::new();
        
        // Ethereum Mainnet
        chains.insert(1, ChainConfig {
            chain_id: 1,
            rpc_url: std::env::var("ETHEREUM_RPC_URL")
                .unwrap_or_else(|_| "https://mainnet.infura.io/v3/your-project-id".to_string()),
            contract_address: None,
            name: "Ethereum Mainnet".to_string(),
            native_currency: NativeCurrency {
                name: "Ether".to_string(),
                symbol: "ETH".to_string(),
                decimals: 18,
            },
            block_time: 12,
        });
        
        // Polygon
        chains.insert(137, ChainConfig {
            chain_id: 137,
            rpc_url: std::env::var("POLYGON_RPC_URL")
                .unwrap_or_else(|_| "https://polygon-rpc.com".to_string()),
            contract_address: None,
            name: "Polygon".to_string(),
            native_currency: NativeCurrency {
                name: "MATIC".to_string(),
                symbol: "MATIC".to_string(),
                decimals: 18,
            },
            block_time: 2,
        });
        
        // BSC
        chains.insert(56, ChainConfig {
            chain_id: 56,
            rpc_url: std::env::var("BSC_RPC_URL")
                .unwrap_or_else(|_| "https://bsc-dataseed.binance.org".to_string()),
            contract_address: None,
            name: "Binance Smart Chain".to_string(),
            native_currency: NativeCurrency {
                name: "BNB".to_string(),
                symbol: "BNB".to_string(),
                decimals: 18,
            },
            block_time: 3,
        });
        
        Ok(chains)
    }

    pub async fn get_provider(&self, chain_id: u64) -> Result<Provider<Http>, Box<dyn std::error::Error>> {
        if !self.supported_chains.contains_key(&chain_id) {
            return Err(format!("Unsupported chain: {}", chain_id).into());
        }

        let mut providers = self.providers.write().await;
        
        if !providers.contains_key(&chain_id) {
            let config = self.supported_chains.get(&chain_id).unwrap();
            let provider = Provider::<Http>::try_from(&config.rpc_url)?;
            providers.insert(chain_id, provider);
        }

        Ok(providers.get(&chain_id).unwrap().clone())
    }

    pub async fn get_contract(&self, chain_id: u64) -> Result<ethers::contract::Contract<Http>, Box<dyn std::error::Error>> {
        if !self.supported_chains.contains_key(&chain_id) {
            return Err(format!("Unsupported chain: {}", chain_id).into());
        }

        let mut contracts = self.contracts.write().await;
        
        if !contracts.contains_key(&chain_id) {
            let config = self.supported_chains.get(&chain_id).unwrap();
            let contract_address = config.contract_address.ok_or("No contract address configured")?;
            let provider = self.get_provider(chain_id).await?;
            
            // Load contract ABI
            let abi = include_bytes!("../../abi/AirChainPay.json");
            let contract = ethers::contract::Contract::new(contract_address, abi.into(), provider);
            contracts.insert(chain_id, contract);
        }

        Ok(contracts.get(&chain_id).unwrap().clone())
    }

    pub async fn validate_transaction(&self, tx_data: &TransactionData) -> ValidationResult {
        // Check required fields
        if tx_data.id.is_empty() {
            return ValidationResult {
                is_valid: false,
                error: Some("Transaction ID is missing".to_string()),
            };
        }

        // Validate recipient address
        if tx_data.to == Address::zero() {
            return ValidationResult {
                is_valid: false,
                error: Some("Invalid recipient address".to_string()),
            };
        }

        // Validate amount
        if let Err(_) = tx_data.amount.parse::<f64>() {
            return ValidationResult {
                is_valid: false,
                error: Some("Invalid transaction amount".to_string()),
            };
        }

        // Validate chain ID
        if !self.supported_chains.contains_key(&tx_data.chain_id) {
            return ValidationResult {
                is_valid: false,
                error: Some(format!("Unsupported chain ID: {}", tx_data.chain_id)),
            };
        }

        // Validate token address if present
        if let Some(token_address) = tx_data.token_address {
            if token_address == Address::zero() {
                return ValidationResult {
                    is_valid: false,
                    error: Some("Invalid token address".to_string()),
                };
            }
        }

        // Validate timestamp
        if tx_data.timestamp == 0 {
            return ValidationResult {
                is_valid: false,
                error: Some("Invalid timestamp".to_string()),
            };
        }

        // Validate status
        let valid_statuses = ["pending", "sending", "completed", "failed"];
        if !valid_statuses.contains(&tx_data.status.as_str()) {
            return ValidationResult {
                is_valid: false,
                error: Some("Invalid transaction status".to_string()),
            };
        }

        // Validate metadata if present
        if let Some(metadata) = &tx_data.metadata {
            if let Some(device_id) = &metadata.device_id {
                if device_id.is_empty() {
                    return ValidationResult {
                        is_valid: false,
                        error: Some("Invalid device ID in metadata".to_string()),
                    };
                }
            }

            if let Some(retry_count) = metadata.retry_count {
                if retry_count > 10 {
                    return ValidationResult {
                        is_valid: false,
                        error: Some("Retry count too high".to_string()),
                    };
                }
            }
        }

        ValidationResult {
            is_valid: true,
            error: None,
        }
    }

    pub async fn estimate_gas(&self, tx_data: &TransactionData) -> GasEstimate {
        match self.get_provider(tx_data.chain_id).await {
            Ok(provider) => {
                let tx_request = TransactionRequest::new()
                    .to(tx_data.to)
                    .value(U256::from_dec_str(&tx_data.amount).unwrap_or_default());

                match provider.estimate_gas(&tx_request, None).await {
                    Ok(gas_limit) => GasEstimate {
                        gas_limit,
                        error: None,
                    },
                    Err(e) => {
                        Logger::error(&format!("Gas estimation error: {:?}", e));
                        GasEstimate {
                            gas_limit: U256::from(21000), // Default gas limit
                            error: Some(format!("Gas estimation failed: {}", e)),
                        }
                    }
                }
            }
            Err(e) => {
                Logger::error(&format!("Provider error: {:?}", e));
                GasEstimate {
                    gas_limit: U256::from(21000), // Default gas limit
                    error: Some(format!("Provider error: {}", e)),
                }
            }
        }
    }

    pub async fn send_transaction(&self, signed_tx: Bytes, rpc_url: &str) -> Result<U256, Box<dyn std::error::Error>> {
        let provider = Provider::<Http>::try_from(rpc_url)?;
        
        // Decode the signed transaction
        let tx = ethers::types::Transaction::from_bytes(signed_tx)?;
        
        // Send the transaction
        let pending_tx = provider.send_transaction(tx, None).await?;
        
        // Wait for the transaction to be mined
        let receipt = pending_tx.await?;
        
        match receipt {
            Some(receipt) => {
                if let Some(hash) = receipt.transaction_hash {
                    Logger::info(&format!("Transaction sent successfully: {:?}", hash));
                    Ok(hash)
                } else {
                    Err("Transaction hash not found in receipt".into())
                }
            }
            None => Err("Transaction receipt not found".into()),
        }
    }

    pub async fn get_transaction_status(&self, tx_hash: U256, chain_id: u64) -> Result<String, Box<dyn std::error::Error>> {
        let provider = self.get_provider(chain_id).await?;
        
        match provider.get_transaction_receipt(tx_hash).await? {
            Some(receipt) => {
                if receipt.status == Some(U256::from(1)) {
                    Ok("completed".to_string())
                } else {
                    Ok("failed".to_string())
                }
            }
            None => Ok("pending".to_string()),
        }
    }

    pub async fn get_balance(&self, address: Address, chain_id: u64) -> Result<U256, Box<dyn std::error::Error>> {
        let provider = self.get_provider(chain_id).await?;
        Ok(provider.get_balance(address, None).await?)
    }

    pub async fn get_gas_price(&self, chain_id: u64) -> Result<U256, Box<dyn std::error::Error>> {
        let provider = self.get_provider(chain_id).await?;
        Ok(provider.get_gas_price().await?)
    }

    pub async fn get_block_number(&self, chain_id: u64) -> Result<u64, Box<dyn std::error::Error>> {
        let provider = self.get_provider(chain_id).await?;
        Ok(provider.get_block_number().await?.as_u64())
    }

    pub fn get_supported_chains(&self) -> &HashMap<u64, ChainConfig> {
        &self.supported_chains
    }

    pub async fn cleanup(&self) {
        let mut providers = self.providers.write().await;
        providers.clear();
        
        let mut contracts = self.contracts.write().await;
        contracts.clear();
        
        Logger::info("Blockchain manager cleaned up");
    }

    pub async fn health_check(&self) -> HashMap<String, serde_json::Value> {
        let mut health = HashMap::new();
        
        for (chain_id, config) in &self.supported_chains {
            match self.get_provider(*chain_id).await {
                Ok(provider) => {
                    match provider.get_block_number().await {
                        Ok(block_number) => {
                            health.insert(
                                format!("chain_{}_status", chain_id),
                                serde_json::Value::String("healthy".to_string()),
                            );
                            health.insert(
                                format!("chain_{}_block", chain_id),
                                serde_json::Value::Number(serde_json::Number::from(block_number.as_u64())),
                            );
                        }
                        Err(_) => {
                            health.insert(
                                format!("chain_{}_status", chain_id),
                                serde_json::Value::String("unhealthy".to_string()),
                            );
                        }
                    }
                }
                Err(_) => {
                    health.insert(
                        format!("chain_{}_status", chain_id),
                        serde_json::Value::String("unhealthy".to_string()),
                    );
                }
            }
        }
        
        health
    }
}

pub async fn send_transaction(signed_tx: Vec<u8>, rpc_url: &str) -> Result<U256, Box<dyn std::error::Error>> {
    let provider = Provider::<Http>::try_from(rpc_url)?;
    let tx = ethers::types::Transaction::from_bytes(Bytes::from(signed_tx))?;
    
    let pending_tx = provider.send_transaction(tx, None).await?;
    let receipt = pending_tx.await?;
    
    match receipt {
        Some(receipt) => {
            if let Some(hash) = receipt.transaction_hash {
                Ok(hash)
            } else {
                Err("Transaction hash not found".into())
            }
        }
        None => Err("Transaction receipt not found".into()),
    }
}

pub fn validate_ethereum_address(address: &str) -> bool {
    if !address.starts_with("0x") {
        return false;
    }
    if address.len() != 42 {
        return false;
    }
    address[2..].chars().all(|c| c.is_ascii_hexdigit())
}

pub fn validate_transaction_hash(hash: &str) -> bool {
    if !hash.starts_with("0x") {
        return false;
    }
    if hash.len() != 66 {
        return false;
    }
    hash[2..].chars().all(|c| c.is_ascii_hexdigit())
}

pub fn parse_wei(amount: &str) -> Result<U256, Box<dyn std::error::Error>> {
    Ok(U256::from_dec_str(amount)?)
}

pub fn format_wei(amount: U256) -> String {
    amount.to_string()
}

pub fn parse_ether(amount: &str) -> Result<U256, Box<dyn std::error::Error>> {
    let amount_f64: f64 = amount.parse()?;
    let wei = amount_f64 * 1e18;
    Ok(U256::from_dec_str(&wei.to_string())?)
}

pub fn format_ether(amount: U256) -> String {
    let wei = amount.as_u128() as f64;
    let ether = wei / 1e18;
    format!("{:.18}", ether)
} 