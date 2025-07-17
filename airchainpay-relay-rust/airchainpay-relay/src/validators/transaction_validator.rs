use crate::config::Config;
use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use ethers::types::Transaction;
use ethers::core::utils::rlp::{Rlp, Decodable};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

pub struct TransactionValidator {
    config: Arc<Config>,
    // For rate limiting (simple in-memory, per-process)
    rate_limit_state: Arc<Mutex<HashMap<String, (u64, u32)>>>, // (window_start, count)
}

impl TransactionValidator {
    pub fn new(config: Arc<Config>) -> Self {
        Self {
            config,
            rate_limit_state: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn validate_transaction(&self, signed_tx: &str) -> Result<ValidationResult> {
        let mut result = ValidationResult {
            valid: true,
            errors: Vec::new(),
            warnings: Vec::new(),
        };
        if let Err(e) = self.validate_transaction_format(signed_tx) {
            result.valid = false;
            result.errors.push(format!("Invalid transaction format: {e}"));
        }
        let chain_id = self.extract_chain_id_from_transaction(signed_tx).unwrap_or(self.config.chain_id);
        if let Err(e) = self.validate_chain_id(chain_id) {
            result.valid = false;
            result.errors.push(format!("Invalid chain ID: {e}"));
        }
        if let Err(e) = self.validate_transaction_size(signed_tx) {
            result.valid = false;
            result.errors.push(format!("Invalid transaction size: {e}"));
        }
        if let Err(e) = self.validate_hex_format(signed_tx) {
            result.valid = false;
            result.errors.push(format!("Invalid hex format: {e}"));
        }
        if let Err(e) = self.validate_signature(signed_tx).await {
            result.valid = false;
            result.errors.push(format!("Invalid signature: {e}"));
        }
        if let Err(e) = self.validate_gas_limits(signed_tx, chain_id) {
            result.valid = false;
            result.errors.push(format!("Invalid gas limits: {e}"));
        }
        if let Err(e) = self.validate_nonce(signed_tx, chain_id).await {
            result.warnings.push(format!("Nonce validation warning: {e}"));
        }
        if let Err(e) = self.validate_contract_interaction(signed_tx, chain_id) {
            result.valid = false;
            result.errors.push(format!("Invalid contract interaction: {e}"));
        }
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
        // Use supported_chains from config
        if !self.config.supported_chains.is_empty() && !self.config.supported_chains.contains_key(&chain_id) {
            return Err(anyhow!("Chain ID {chain_id} is not supported"));
        }
        Ok(())
    }

    fn validate_transaction_size(&self, signed_tx: &str) -> Result<()> {
        let size = signed_tx.len();
        // Optionally make max_size configurable
        let max_size = 128000;
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
        for c in hex_part.chars() {
            if !c.is_ascii_hexdigit() {
                return Err(anyhow!("Invalid hex character: {}", c));
            }
        }
        Ok(())
    }

    async fn validate_signature(&self, signed_tx: &str) -> Result<()> {
        let tx_bytes = hex::decode(signed_tx.trim_start_matches("0x"))
            .map_err(|e| anyhow!("Failed to decode hex: {}", e))?;
        if tx_bytes.len() < 65 {
            return Err(anyhow!("Transaction too short for signature"));
        }
        let signature_start = tx_bytes.len() - 65;
        let signature = &tx_bytes[signature_start..];
        if signature.len() != 65 {
            return Err(anyhow!("Invalid signature length"));
        }
        let v = signature[64];
        if v != 27 && v != 28 && v != 0 && v != 1 {
            return Err(anyhow!("Invalid signature v value"));
        }
        Ok(())
    }

    /// Helper to decode a signed transaction into ethers::types::Transaction
    fn decode_transaction(&self, signed_tx: &str) -> Result<Transaction> {
        let tx_bytes = hex::decode(signed_tx.trim_start_matches("0x"))
            .map_err(|e| anyhow!("Failed to decode hex: {}", e))?;
        let rlp = Rlp::new(&tx_bytes);
        Transaction::decode(&rlp).map_err(|e| anyhow!("Failed to decode transaction: {}", e))
    }

    fn extract_gas_limit_from_transaction(&self, signed_tx: &str) -> Option<u64> {
        self.decode_transaction(signed_tx).ok().map(|tx| tx.gas.as_u64())
    }

    fn extract_nonce_from_transaction(&self, signed_tx: &str) -> Option<u64> {
        self.decode_transaction(signed_tx).ok().map(|tx| tx.nonce.as_u64())
    }

    fn extract_to_address_from_transaction(&self, signed_tx: &str) -> Option<String> {
        self.decode_transaction(signed_tx).ok().and_then(|tx| tx.to.map(|to| format!("0x{:x}", to)))
    }

    fn validate_gas_limits(&self, signed_tx: &str, chain_id: u64) -> Result<()> {
        // Use per-chain max gas limit if available, otherwise fallback
        let default_max_gas_limit: u64 = 12_500_000;
        let max_gas_limit = self.config.supported_chains.get(&chain_id)
            .and_then(|chain_cfg| chain_cfg.max_gas_limit)
            .unwrap_or(default_max_gas_limit);
        let gas_limit = self.extract_gas_limit_from_transaction(signed_tx)
            .ok_or_else(|| anyhow!("Failed to extract gas limit from transaction"))?;
        if gas_limit == 0 {
            return Err(anyhow!("Gas limit cannot be zero"));
        }
        if gas_limit > max_gas_limit {
            return Err(anyhow!("Gas limit {} exceeds max allowed {}", gas_limit, max_gas_limit));
        }
        Ok(())
    }

    async fn validate_nonce(&self, signed_tx: &str, _chain_id: u64) -> Result<()> {
        // Parse nonce from transaction
        let nonce = self.extract_nonce_from_transaction(signed_tx)
            .ok_or_else(|| anyhow!("Failed to extract nonce from transaction"))?;
        // In a real implementation, compare with on-chain nonce
        if nonce > u64::MAX {
            return Err(anyhow!("Nonce is out of range"));
        }
        Ok(())
    }

    fn validate_contract_interaction(&self, signed_tx: &str, chain_id: u64) -> Result<()> {
        if let Some(chain_cfg) = self.config.supported_chains.get(&chain_id) {
            if !chain_cfg.contract_address.is_empty() {
                let to_addr = self.extract_to_address_from_transaction(signed_tx)
                    .ok_or_else(|| anyhow!("Failed to extract 'to' address from transaction"))?;
                // Compare lowercase for safety
                if to_addr.to_lowercase() != chain_cfg.contract_address.to_lowercase() {
                    return Err(anyhow!("Transaction 'to' address {} does not match expected contract address {}", to_addr, chain_cfg.contract_address));
                }
            }
        }
        Ok(())
    }

    async fn check_rate_limits(&self) -> Result<()> {
        // Use config.rate_limits
        let window_ms = self.config.rate_limits.window_ms;
        let max_requests = self.config.rate_limits.max_requests;
        if window_ms == 0 || max_requests == 0 {
            return Ok(()); // No rate limiting
        }
        // For demo: use a single key for all requests (could use IP or user in real use)
        let key = "global".to_string();
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64;
        let mut state = self.rate_limit_state.lock().await;
        let (window_start, count) = state.get(&key).cloned().unwrap_or((now, 0));
        if now - window_start > window_ms {
            // Reset window
            state.insert(key, (now, 1));
            Ok(())
        } else if count < max_requests {
            state.insert(key, (window_start, count + 1));
            Ok(())
        } else {
            Err(anyhow!("Rate limit exceeded: {count} requests in {window_ms}ms"))
        }
    }

    fn extract_chain_id_from_transaction(&self, signed_tx: &str) -> Option<u64> {
        self.decode_transaction(signed_tx).ok().and_then(|tx| tx.chain_id).map(|id| id.as_u64()).or(Some(self.config.chain_id))
    }
} 