//! Network entity for the wallet core

use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum Network {
    CoreTestnet,
    BaseSepolia,
}

impl Network {
    pub fn native_currency(&self) -> &'static str {
        match self {
            Network::CoreTestnet => "TCORE2",
            Network::BaseSepolia => "ETH",
        }
    }
    pub fn chain_id(&self) -> u64 {
        match self {
            Network::CoreTestnet => 1114,
            Network::BaseSepolia => 84532,
        }
    }
} 