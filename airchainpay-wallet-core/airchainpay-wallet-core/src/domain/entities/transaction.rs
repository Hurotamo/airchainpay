//! Transaction entity for the wallet core

use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub to: String,
    pub value: String,
    pub data: Option<String>,
    pub gas_limit: Option<u64>,
    pub gas_price: Option<u64>,
    pub nonce: Option<u64>,
    pub chain_id: u64,
} 