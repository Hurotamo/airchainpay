#![allow(dead_code, unused_variables)]
use crate::config::Config;
use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

#[allow(dead_code)]
pub struct ChainValidationRules {
    pub min_gas_limit: u64,
    pub max_gas_limit: u64,
    pub max_transaction_size: usize,
    pub allowed_contract_addresses: Vec<String>,
}

#[allow(dead_code)]
pub struct TransactionValidator {
    config: Config,
    supported_chains: HashMap<u64, ChainValidationRules>,
}

impl Default for TransactionValidator {
    fn default() -> Self {
        Self::new()
    }
}

impl TransactionValidator {
    pub fn new() -> Self {
        let config = Config::new().unwrap_or_else(|_| {
            // Fallback configuration
            Config::development_config().unwrap()
        });
        
        let mut supported_chains = HashMap::new();
        
        // Base Sepolia rules
        supported_chains.insert(84532, ChainValidationRules {
            min_gas_limit: 21000,
            max_gas_limit: 1000000,
            max_transaction_size: 128000,
            allowed_contract_addresses: vec![
                "0x7B79117445C57eea1CEAb4733020A55e1D503934".to_string(),
            ],
        });
        
        // Core Testnet 2 rules
        supported_chains.insert(1114, ChainValidationRules {
            min_gas_limit: 21000,
            max_gas_limit: 10000000,
            max_transaction_size: 128000,
            allowed_contract_addresses: vec![
                "0x8d7eaB03a72974F5D9F5c99B4e4e1B393DBcfCAB".to_string(),
            ],
        });
        
        Self {
            config,
            supported_chains,
        }
    }

    pub async fn validate_transaction(&self, signed_tx: &str) -> Result<ValidationResult> {
        let mut result = ValidationResult {
            valid: true,
            errors: Vec::new(),
            warnings: Vec::new(),
        };
        
        // Basic format validation
        if let Err(e) = self.validate_transaction_format(signed_tx) {
            result.valid = false;
            result.errors.push(format!("Invalid transaction format: {e}"));
        }
        
        // Chain ID validation - extract from transaction data or use default
        let chain_id = self.extract_chain_id_from_transaction(signed_tx).unwrap_or(84532);
        if let Err(e) = self.validate_chain_id(chain_id) {
            result.valid = false;
            result.errors.push(format!("Invalid chain ID: {e}"));
        }
        
        // Transaction size validation
        if let Err(e) = self.validate_transaction_size(signed_tx) {
            result.valid = false;
            result.errors.push(format!("Invalid transaction size: {e}"));
        }
        
        // Hex format validation
        if let Err(e) = self.validate_hex_format(signed_tx) {
            result.valid = false;
            result.errors.push(format!("Invalid hex format: {e}"));
        }
        
        // Signature validation
        if let Err(e) = self.validate_signature(signed_tx).await {
            result.valid = false;
            result.errors.push(format!("Invalid signature: {e}"));
        }
        
        // Gas limit validation
        if let Err(e) = self.validate_gas_limits(signed_tx, chain_id) {
            result.valid = false;
            result.errors.push(format!("Invalid gas limits: {e}"));
        }
        
        // Nonce validation
        if let Err(e) = self.validate_nonce(signed_tx, chain_id).await {
            result.warnings.push(format!("Nonce validation warning: {e}"));
        }
        
        // Contract interaction validation
        if let Err(e) = self.validate_contract_interaction(signed_tx, chain_id) {
            result.valid = false;
            result.errors.push(format!("Invalid contract interaction: {e}"));
        }
        
        // Rate limiting check
        if let Err(e) = self.check_rate_limits().await {
            result.valid = false;
            result.errors.push(format!("Rate limit exceeded: {e}"));
        }
        
        Ok(result)
    }

    fn validate_transaction_format(&self, signed_tx: &str) -> Result<()> {
        if signed_tx.is_empty() {
            return Err(anyhow!("Transaction is empty"));
        }
        
        if !signed_tx.starts_with("0x") {
            return Err(anyhow!("Transaction must start with 0x"));
        }
        
        if signed_tx.len() < 66 {
            return Err(anyhow!("Transaction too short"));
        }
        
        Ok(())
    }

    fn validate_chain_id(&self, chain_id: u64) -> Result<()> {
        if !self.supported_chains.contains_key(&chain_id) {
            return Err(anyhow!("Unsupported chain ID: {}", chain_id));
        }
        
        Ok(())
    }

    fn validate_transaction_size(&self, signed_tx: &str) -> Result<()> {
        let size = signed_tx.len();
        let max_size = 128000; // 128KB max transaction size
        
        if size > max_size {
            return Err(anyhow!("Transaction too large: {} bytes (max: {})", size, max_size));
        }
        
        Ok(())
    }

    fn validate_hex_format(&self, signed_tx: &str) -> Result<()> {
        let hex_part = signed_tx.trim_start_matches("0x");
        
        if hex_part.is_empty() {
            return Err(anyhow!("Empty hex data"));
        }
        
        if hex_part.len() % 2 != 0 {
            return Err(anyhow!("Invalid hex length"));
        }
        
        // Check if all characters are valid hex
        for c in hex_part.chars() {
            if !c.is_ascii_hexdigit() {
                return Err(anyhow!("Invalid hex character: {}", c));
            }
        }
        
        Ok(())
    }

    async fn validate_signature(&self, signed_tx: &str) -> Result<()> {
        // Decode the transaction
        let tx_bytes = hex::decode(signed_tx.trim_start_matches("0x"))
            .map_err(|e| anyhow!("Failed to decode hex: {}", e))?;
        
        if tx_bytes.len() < 65 {
            return Err(anyhow!("Transaction too short for signature"));
        }
        
        // Basic signature format validation
        // In a real implementation, you would verify the signature cryptographically
        let signature_start = tx_bytes.len() - 65;
        let signature = &tx_bytes[signature_start..];
        
        // Check signature format (r, s, v)
        if signature.len() != 65 {
            return Err(anyhow!("Invalid signature length"));
        }
        
        let v = signature[64];
        if v != 27 && v != 28 && v != 0 && v != 1 {
            return Err(anyhow!("Invalid signature v value"));
        }
        
        // For now, we'll assume the signature is valid
        // In production, you would verify it against the sender's public key
        Ok(())
    }

    fn validate_gas_limits(&self, signed_tx: &str, chain_id: u64) -> Result<()> {
        let _rules = self.supported_chains.get(&chain_id)
            .ok_or_else(|| anyhow!("No validation rules for chain ID: {}", chain_id))?;
        
        // Decode transaction to extract gas limit
        let tx_bytes = hex::decode(signed_tx.trim_start_matches("0x"))
            .map_err(|e| anyhow!("Failed to decode hex: {}", e))?;
        
        // This is a simplified gas limit check
        // In a real implementation, you would parse the transaction properly
        if tx_bytes.len() < 100 {
            return Err(anyhow!("Transaction too short to extract gas limit"));
        }
        
        // For now, we'll assume the gas limit is reasonable
        // In production, you would extract and validate the actual gas limit
        Ok(())
    }

    async fn validate_nonce(&self, _signed_tx: &str, _chain_id: u64) -> Result<()> {
        // In a real implementation, you would check the nonce against the sender's account
        // For now, we'll assume it's valid
        Ok(())
    }

    fn validate_contract_interaction(&self, signed_tx: &str, chain_id: u64) -> Result<()> {
        let _rules = self.supported_chains.get(&chain_id)
            .ok_or_else(|| anyhow!("No validation rules for chain ID: {}", chain_id))?;
        
        // Decode transaction to check if it's a contract interaction
        let tx_bytes = hex::decode(signed_tx.trim_start_matches("0x"))
            .map_err(|e| anyhow!("Failed to decode hex: {}", e))?;
        
        // Check if transaction has data (contract interaction)
        if tx_bytes.len() > 21 {
            // This is a simplified check for contract interaction
            // In a real implementation, you would parse the transaction properly
            // and check if the target address is in the allowed list
            
            // For now, we'll assume contract interactions are allowed
            // In production, you would validate against the allowed contract addresses
        }
        
        Ok(())
    }

    async fn check_rate_limits(&self) -> Result<()> {
        // In a real implementation, you would check rate limits for the device
        // For now, we'll assume no rate limiting issues
        Ok(())
    }

    fn extract_chain_id_from_transaction(&self, _signed_tx: &str) -> Option<u64> {
        // In a real implementation, you would parse the transaction to extract chain ID
        // For now, we'll use a default chain ID
        // This could be extracted from the transaction data or metadata
        Some(84532) // Default to Base Sepolia testnet
    }

    pub fn validate_public_key(&self, public_key: &str) -> Result<()> {
        if public_key.is_empty() {
            return Err(anyhow!("Public key cannot be empty"));
        }
        
        if !public_key.starts_with("0x") {
            return Err(anyhow!("Public key must start with 0x"));
        }
        
        let key_bytes = hex::decode(public_key.trim_start_matches("0x"))
            .map_err(|e| anyhow!("Invalid public key format: {}", e))?;
        
        if key_bytes.len() != 65 {
            return Err(anyhow!("Invalid public key length: {} bytes", key_bytes.len()));
        }
        
        Ok(())
    }

    pub fn validate_challenge_response(&self, challenge: &str, signature: &str) -> Result<()> {
        if challenge.is_empty() {
            return Err(anyhow!("Challenge cannot be empty"));
        }
        
        if signature.is_empty() {
            return Err(anyhow!("Signature cannot be empty"));
        }
        
        if !signature.starts_with("0x") {
            return Err(anyhow!("Signature must start with 0x"));
        }
        
        // Validate signature format
        let sig_bytes = hex::decode(signature.trim_start_matches("0x"))
            .map_err(|e| anyhow!("Invalid signature format: {}", e))?;
        
        if sig_bytes.len() != 65 {
            return Err(anyhow!("Invalid signature length: {} bytes", sig_bytes.len()));
        }
        
        Ok(())
    }
} 