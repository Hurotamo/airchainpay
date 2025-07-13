use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use ethers::{
    contract::Contract,
    core::types::{Address, Bytes, U256, U64, H256, TxHash},
    providers::{Http, Provider},
    middleware::Middleware,
};
use serde::{Deserialize, Serialize};
use crate::logger::Logger;
use chrono::{DateTime, Utc};

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
    pub last_block_time: Option<DateTime<Utc>>,
    pub gas_price_updates: u32,
    pub pending_transactions: u32,
    pub failed_transactions: u32,
    pub total_networks: u32,
    pub average_response_time_ms: f64,
    pub last_error: Option<String>,
    pub uptime_seconds: f64,
    pub network_details: HashMap<String, serde_json::Value>,
}

pub struct BlockchainManager {
    providers: Arc<RwLock<HashMap<u64, Arc<Provider<Http>>>>>,
    contracts: Arc<RwLock<HashMap<u64, Contract<Arc<Provider<Http>>>>>,
    supported_chains: HashMap<u64, ChainConfig>,
}

impl BlockchainManager {
    pub fn new(_config: crate::config::Config) -> Result<Self, Box<dyn std::error::Error>> {
        let supported_chains = Self::load_supported_chains()?;
        
        Ok(Self {
            providers: Arc::new(RwLock::new(HashMap::new())),
            contracts: Arc::new(RwLock::new(HashMap::new())),
            supported_chains,
        })
    }

    fn load_supported_chains() -> Result<HashMap<u64, ChainConfig>, Box<dyn std::error::Error>> {
        let mut chains = HashMap::new();
        
        // Core Testnet 2
        chains.insert(1114, ChainConfig {
            chain_id: 1114,
            rpc_url: std::env::var("CORE_TESTNET2_RPC_URL")
                .unwrap_or_else(|_| "https://rpc.test2.btcs.network".to_string()),
            contract_address: None,
            name: "Core Testnet 2".to_string(),
            native_currency: NativeCurrency {
                name: "TCORE2".to_string(),
                symbol: "TCORE2".to_string(),
                decimals: 18,
            },
            block_time: 3,
        });
        
        // Base Sepolia Testnet
        chains.insert(84532, ChainConfig {
            chain_id: 84532,
            rpc_url: std::env::var("BASE_SEPOLIA_RPC_URL")
                .unwrap_or_else(|_| "https://sepolia.base.org".to_string()),
            contract_address: None,
            name: "Base Sepolia Testnet".to_string(),
            native_currency: NativeCurrency {
                name: "Ether".to_string(),
                symbol: "ETH".to_string(),
                decimals: 18,
            },
            block_time: 2,
        });
        
        Ok(chains)
    }

    pub async fn get_provider(&self, chain_id: u64) -> Result<Arc<Provider<Http>>, Box<dyn std::error::Error>> {
        if !self.supported_chains.contains_key(&chain_id) {
            return Err(format!("Unsupported chain: {}", chain_id).into());
        }

        let mut providers = self.providers.write().await;
        
        if !providers.contains_key(&chain_id) {
            let config = self.supported_chains.get(&chain_id).unwrap();
            let provider = Provider::<Http>::try_from(&config.rpc_url)?;
            providers.insert(chain_id, Arc::new(provider));
        }

        Ok(providers.get(&chain_id).unwrap().clone())
    }

    pub async fn get_contract(&self, chain_id: u64) -> Result<Contract<Arc<Provider<Http>>>, Box<dyn std::error::Error>> {
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
            let contract = Contract::new(contract_address, abi.into(), provider);
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
        if tx_data.amount.is_empty() {
            return ValidationResult {
                is_valid: false,
                error: Some("Amount is missing".to_string()),
            };
        }

        // Validate chain ID
        if !self.supported_chains.contains_key(&tx_data.chain_id) {
            return ValidationResult {
                is_valid: false,
                error: Some(format!("Unsupported chain ID: {}", tx_data.chain_id)),
            };
        }

        ValidationResult {
            is_valid: true,
            error: None,
        }
    }

    pub async fn estimate_gas(&self, tx_data: &TransactionData) -> GasEstimate {
        match self.get_provider(tx_data.chain_id).await {
            Ok(provider) => {
                let mut tx = ethers::types::TransactionRequest::new()
                    .to(tx_data.to)
                    .data(Bytes::from(vec![]));
                let typed_tx: ethers::types::TypedTransaction = tx.into();
                let gas_limit = provider
                    .estimate_gas(&typed_tx, None)
                    .await;

                match gas_limit {
                    Ok(limit) => GasEstimate {
                        gas_limit: limit,
                        error: None,
                    },
                    Err(e) => GasEstimate {
                        gas_limit: U256::from(21000), // Default gas limit
                        error: Some(format!("Failed to estimate gas: {}", e)),
                    },
                }
            }
            Err(e) => GasEstimate {
                gas_limit: U256::from(21000), // Default gas limit
                error: Some(format!("Failed to get provider: {}", e)),
            },
        }
    }

    pub async fn send_transaction(&self, signed_tx: Bytes, rpc_url: &str) -> Result<TxHash, Box<dyn std::error::Error>> {
        let provider = Provider::<Http>::try_from(rpc_url)?;
        
        let pending_tx = provider.send_raw_transaction(signed_tx).await?;
        
        Ok(pending_tx.tx_hash())
    }

    pub async fn get_transaction_status(&self, tx_hash: TxHash, chain_id: u64) -> Result<String, Box<dyn std::error::Error>> {
        let provider = self.get_provider(chain_id).await?;
        
        match provider.get_transaction_receipt(tx_hash).await? {
            Some(receipt) => {
                if let Some(status) = receipt.status {
                    if status.as_u64() == 1 {
                        Ok("confirmed".to_string())
                    } else {
                        Ok("failed".to_string())
                    }
                } else {
                    Ok("pending".to_string())
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
        // Cleanup logic here
        Logger::info("Blockchain manager cleanup completed");
    }

    pub async fn health_check(&self) -> HashMap<String, serde_json::Value> {
        let mut health_status = HashMap::new();
        
        for (chain_id, config) in &self.supported_chains {
            match self.get_provider(*chain_id).await {
                Ok(provider) => {
                    match provider.get_block_number().await {
                        Ok(block_number) => {
                            health_status.insert(
                                config.name.clone(),
                                serde_json::json!({
                                    "status": "healthy",
                                    "block_number": block_number.as_u64(),
                                    "chain_id": chain_id
                                })
                            );
                        }
                        Err(e) => {
                            health_status.insert(
                                config.name.clone(),
                                serde_json::json!({
                                    "status": "unhealthy",
                                    "error": e.to_string(),
                                    "chain_id": chain_id
                                })
                            );
                        }
                    }
                }
                Err(e) => {
                    health_status.insert(
                        config.name.clone(),
                        serde_json::json!({
                            "status": "unhealthy",
                            "error": e.to_string(),
                            "chain_id": chain_id
                        })
                    );
                }
            }
        }
        
        health_status
    }

    pub async fn get_network_status(&self) -> NetworkStatus {
        let mut connected_networks = 0;
        let mut total_networks = self.supported_chains.len() as u32;
        let mut last_error = None;
        
        for (chain_id, _) in &self.supported_chains {
            match self.get_provider(*chain_id).await {
                Ok(_) => {
                    connected_networks += 1;
                }
                Err(e) => {
                    last_error = Some(e.to_string());
                }
            }
        }
        
        NetworkStatus {
            is_healthy: connected_networks > 0,
            connected_networks,
            last_block_time: Some(Utc::now()),
            gas_price_updates: 0,
            pending_transactions: 0,
            failed_transactions: 0,
            total_networks,
            average_response_time_ms: 0.0,
            last_error,
            uptime_seconds: 0.0,
            network_details: HashMap::new(),
        }
    }
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
    Ok(amount.parse::<U256>()?)
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