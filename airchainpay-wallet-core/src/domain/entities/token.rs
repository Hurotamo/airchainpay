//! Token entity for the wallet core

use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenInfo {
    pub symbol: String,
    pub name: String,
    pub decimals: u8,
    pub address: String,
    pub chain_id: u64,
    pub is_native: bool,
    pub is_stablecoin: bool,
} 