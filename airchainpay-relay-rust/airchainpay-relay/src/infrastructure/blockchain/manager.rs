use crate::infrastructure::config::Config;
use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use ethers::{
    providers::{Provider, Http},
    core::types::{Address, U256, H256, Log, Bytes},
    prelude::*,
};
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

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ContractType {
    AirChainPay,
    AirChainPayToken,
}

pub struct BlockchainManager {
    providers: HashMap<u64, Provider<Http>>,
    contracts: HashMap<u64, HashMap<ContractType, Contract<Provider<Http>>>>,
}

impl BlockchainManager {
    pub fn new(config: Config) -> Result<Self> {
        let mut providers = HashMap::new();
        let mut contracts = HashMap::new();
        
        for (chain_id, chain_config) in &config.supported_chains {
            let provider = Provider::<Http>::try_from(&chain_config.rpc_url)
                .map_err(|e| anyhow!("Failed to create HTTP provider for chain {}: {}", chain_id, e))?;
            
            providers.insert(*chain_id, provider.clone());
            
            // Initialize contracts if addresses are provided
            let mut chain_contracts = HashMap::new();
            
            // Load AirChainPay contract
            if !chain_config.contract_address.is_empty() {
                let contract_address: Address = chain_config.contract_address.parse()
                    .map_err(|e| anyhow!("Invalid contract address for chain {}: {}", chain_id, e))?;
                
                let abi_bytes = include_bytes!("../../abi/AirChainPay.json");
                let abi_value: serde_json::Value = serde_json::from_slice(abi_bytes).unwrap();
                let abi: ethers::abi::Abi = serde_json::from_value(abi_value).unwrap();
                let contract = Contract::new(contract_address, abi, Arc::new(provider.clone()));
                chain_contracts.insert(ContractType::AirChainPay, contract);
            }
            
            // Load AirChainPayToken contract (using the same address for now, but could be different)
            if !chain_config.contract_address.is_empty() {
                let contract_address: Address = chain_config.contract_address.parse()
                    .map_err(|e| anyhow!("Invalid contract address for chain {}: {}", chain_id, e))?;
                
                let abi_bytes = include_bytes!("../../abi/AirChainPayToken.json");
                let abi_value: serde_json::Value = serde_json::from_slice(abi_bytes).unwrap();
                let abi: ethers::abi::Abi = serde_json::from_value(abi_value).unwrap();
                let contract = Contract::new(contract_address, abi, Arc::new(provider.clone()));
                chain_contracts.insert(ContractType::AirChainPayToken, contract);
            }
            
            if !chain_contracts.is_empty() {
                contracts.insert(*chain_id, chain_contracts);
            }
        }
        
        Ok(Self {
            providers,
            contracts,
        })
    }

    /// Execute a meta-transaction on the AirChainPay contract
    pub async fn execute_meta_transaction(
        &self,
        chain_id: u64,
        from: Address,
        to: Address,
        amount: U256,
        payment_reference: String,
        deadline: U256,
        signature: Bytes,
    ) -> Result<H256> {
        let contract = self.get_contract(chain_id, ContractType::AirChainPay)?;
        
        let call = contract.method::<_, H256>(
            "executeMetaTransaction",
            (from, to, amount, payment_reference, deadline, signature)
        )?;
        
        let pending_tx = call.send().await?;
        let receipt = pending_tx.await?;
        Ok(receipt.unwrap().transaction_hash)
    }

    /// Execute a token meta-transaction on the AirChainPayToken contract
    pub async fn execute_token_meta_transaction(
        &self,
        chain_id: u64,
        from: Address,
        to: Address,
        token: Address,
        amount: U256,
        payment_reference: String,
        deadline: U256,
        signature: Bytes,
    ) -> Result<H256> {
        let contract = self.get_contract(chain_id, ContractType::AirChainPayToken)?;
        
        let call = contract.method::<_, H256>(
            "executeTokenMetaTransaction",
            (from, to, token, amount, payment_reference, deadline, signature)
        )?;
        
        let pending_tx = call.send().await?;
        let receipt = pending_tx.await?;
        Ok(receipt.unwrap().transaction_hash)
    }

    /// Process a direct native payment
    pub async fn process_native_payment(
        &self,
        chain_id: u64,
        recipient: Address,
        payment_reference: String,
        value: U256,
    ) -> Result<H256> {
        let contract = self.get_contract(chain_id, ContractType::AirChainPay)?;
        
        let call = contract.method::<_, H256>(
            "pay",
            (recipient, payment_reference)
        )?.value(value);
        
        let pending_tx = call.send().await?;
        let receipt = pending_tx.await?;
        Ok(receipt.unwrap().transaction_hash)
    }

    /// Process a direct token payment
    pub async fn process_token_payment(
        &self,
        chain_id: u64,
        token: Address,
        amount: U256,
        recipient: Address,
        payment_reference: String,
    ) -> Result<H256> {
        let contract = self.get_contract(chain_id, ContractType::AirChainPayToken)?;
        
        let call = contract.method::<_, H256>(
            "processTokenPayment",
            (token, amount, recipient, payment_reference)
        )?;
        
        let pending_tx = call.send().await?;
        let receipt = pending_tx.await?;
        Ok(receipt.unwrap().transaction_hash)
    }

    /// Get the nonce for a user address
    pub async fn get_nonce(&self, chain_id: u64, address: Address) -> Result<U256> {
        let contract = self.get_contract(chain_id, ContractType::AirChainPay)?;
        
        let nonce: U256 = contract.method("nonces", address)?.call().await?;
        Ok(nonce)
    }

    /// Get the payment typehash for EIP-712 signing
    pub async fn get_payment_typehash(&self, chain_id: u64) -> Result<H256> {
        let contract = self.get_contract(chain_id, ContractType::AirChainPay)?;
        
        let typehash: H256 = contract.method("PAYMENT_TYPEHASH", ())?.call().await?;
        Ok(typehash)
    }

    /// Get the token payment typehash for EIP-712 signing
    pub async fn get_token_payment_typehash(&self, chain_id: u64) -> Result<H256> {
        let contract = self.get_contract(chain_id, ContractType::AirChainPayToken)?;
        
        let typehash: H256 = contract.method("TOKEN_PAYMENT_TYPEHASH", ())?.call().await?;
        Ok(typehash)
    }

    /// Get the EIP-712 domain for signing
    pub async fn get_eip712_domain(&self, chain_id: u64) -> Result<(u8, String, String, U256, Address, H256, Vec<U256>)> {
        let contract = self.get_contract(chain_id, ContractType::AirChainPay)?;
        
        let domain: (u8, String, String, U256, Address, H256, Vec<U256>) = contract.method("eip712Domain", ())?.call().await?;
        Ok(domain)
    }

    /// Check if a token is supported
    pub async fn is_token_supported(&self, chain_id: u64, token: Address) -> Result<bool> {
        let contract = self.get_contract(chain_id, ContractType::AirChainPayToken)?;
        
        let token_config: (bool, bool, u8, String, U256, U256) = 
            contract.method("supportedTokens", token)?.call().await?;
        
        Ok(token_config.0) // isSupported field
    }

    /// Get contract instance for a specific chain and type
    fn get_contract(&self, chain_id: u64, contract_type: ContractType) -> Result<&Contract<Provider<Http>>> {
        let chain_contracts = self.contracts.get(&chain_id)
            .ok_or_else(|| anyhow!("No contracts found for chain_id {}", chain_id))?;
        
        let contract = chain_contracts.get(&contract_type)
            .ok_or_else(|| anyhow!("Contract {:?} not found for chain_id {}", contract_type, chain_id))?;
        
        Ok(contract)
    }

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
 