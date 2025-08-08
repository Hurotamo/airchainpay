use serde::{Deserialize, Serialize};

// Basic types for wallet operations
pub type Address = String;
pub type PrivateKey = String;
pub type PublicKey = String;
pub type TransactionHash = String;
pub type BlockNumber = u64;
pub type GasPrice = u64;
pub type GasLimit = u64;
pub type Amount = String; 
pub type Balance = String;

// Network types - Core Testnet, Base Sepolia, Lisk Sepolia, Ethereum Holesky
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum Network {
    CoreTestnet,
    BaseSepolia,
    LiskSepolia,
    EthereumHolesky,
}

impl Network {
    pub fn chain_id(&self) -> u64 {
        match self {
            Network::CoreTestnet => 1114,
            Network::BaseSepolia => 84532,
            Network::LiskSepolia => 4202,
            Network::EthereumHolesky => 17000,
        }
    }

    pub fn name(&self) -> &'static str {
        match self {
            Network::CoreTestnet => "Core Testnet",
            Network::BaseSepolia => "Base Sepolia",
            Network::LiskSepolia => "Lisk Sepolia",
            Network::EthereumHolesky => "Ethereum Holesky",
        }
    }

    pub fn rpc_url(&self) -> &'static str {
        match self {
            Network::CoreTestnet => "https://rpc.test2.btcs.network",
            Network::BaseSepolia => "https://sepolia.base.org",
            // For these networks, require env overrides; return empty to force config
            Network::LiskSepolia => "",
            Network::EthereumHolesky => "",
        }
    }

    pub fn native_currency(&self) -> &'static str {
        match self {
            Network::CoreTestnet => "TCORE2",
            Network::BaseSepolia => "ETH",
            Network::LiskSepolia => "ETH",
            Network::EthereumHolesky => "ETH",
        }
    }

    pub fn block_explorer(&self) -> &'static str {
        match self {
            Network::CoreTestnet => "https://scan.test2.btcs.network",
            Network::BaseSepolia => "https://sepolia.basescan.org",
            Network::LiskSepolia => "https://sepolia.lisk.com",
            Network::EthereumHolesky => "https://holesky.etherscan.io",
        }
    }

    pub fn contract_address(&self) -> &'static str {
        match self {
            Network::CoreTestnet => "0x8d7eaB03a72974F5D9F5c99B4e4e1B393DBcfCAB",
            Network::BaseSepolia => "0x7B79117445C57eea1CEAb4733020A55e1D503934",
            Network::LiskSepolia => "0xaBEEEc6e6c1f6bfDE1d05db74B28847Ba5b44EAF",
            Network::EthereumHolesky => "0x26C59cd738Df90604Ebb13Ed8DB76657cfD51f40",
        }
    }
}

// Transaction types - minimal and aligned with TypeScript
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub to: Address,
    pub value: Amount,
    pub data: Option<Vec<u8>>,
    pub gas_limit: Option<GasLimit>,
    pub gas_price: Option<GasPrice>,
    pub nonce: Option<u64>,
    pub chain_id: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedTransaction {
    pub transaction: Transaction,
    pub signature: Vec<u8>,
    pub hash: TransactionHash,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TransactionStatus {
    Pending,
    Confirmed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionReceipt {
    pub hash: TransactionHash,
    pub status: TransactionStatus,
    pub block_number: Option<BlockNumber>,
    pub gas_used: Option<GasLimit>,
    pub effective_gas_price: Option<GasPrice>,
    pub chain_id: u64,
}

// Token types - aligned with TypeScript TokenInfo
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenInfo {
    pub symbol: String,
    pub name: String,
    pub decimals: u8,
    pub address: Address,
    pub chain_id: String,
    pub is_native: bool,
    pub is_stablecoin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenBalance {
    pub token: TokenInfo,
    pub balance: Amount,
    pub formatted_balance: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenTransaction {
    pub hash: TransactionHash,
    pub status: TransactionStatus,
    pub chain_id: String,
    pub block_explorer: Option<String>,
}

// Wallet types - minimal and focused
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletInfo {
    pub address: Address,
    pub balance: Balance,
    pub network: Network,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletBackup {
    pub wallet_id: String,
    pub encrypted_data: String,
    pub salt: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletBackupInfo {
    pub wallet_id: String,
    pub encrypted_data: String,
    pub salt: String,
    pub version: String,
}

impl From<WalletBackupInfo> for WalletBackup {
    fn from(info: WalletBackupInfo) -> Self {
        Self {
            wallet_id: info.wallet_id,
            encrypted_data: info.encrypted_data,
            salt: info.salt,
            version: info.version,
        }
    }
}

impl From<WalletBackup> for WalletBackupInfo {
    fn from(backup: WalletBackup) -> Self {
        Self {
            wallet_id: backup.wallet_id,
            encrypted_data: backup.encrypted_data,
            salt: backup.salt,
            version: backup.version,
        }
    }
}

// BLE types - minimal for payment functionality
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BLEPaymentData {
    pub amount: Amount,
    pub to_address: Address,
    pub token_symbol: String,
    pub network: Network,
    pub reference: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BLEDeviceInfo {
    pub id: String,
    pub name: String,
    pub address: String,
    pub rssi: i32,
}

// Configuration types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletConfig {
    pub networks: Vec<Network>,
    pub default_network: Network,
    pub gas_price_strategy: GasPriceStrategy,
    pub security_level: SecurityLevel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GasPriceStrategy {
    Low,
    Medium,
    High,
    Custom(GasPrice),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SecurityLevel {
    Low,
    Medium,
    High,
}

// Utility types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkStatus {
    pub network: Network,
    pub is_connected: bool,
    pub block_number: Option<BlockNumber>,
    pub gas_price: Option<GasPrice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentRequest {
    pub amount: Amount,
    pub to_address: Address,
    pub token: TokenInfo,
    pub network: Network,
    pub reference: Option<String>,
    pub gas_price: Option<GasPrice>,
}

// Result types for better error handling
pub type WalletResult<T> = Result<T, crate::shared::error::WalletError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_network_chain_ids() {
        assert_eq!(Network::CoreTestnet.chain_id(), 1114);
        assert_eq!(Network::BaseSepolia.chain_id(), 84532);
    }

    #[test]
    fn test_network_names() {
        assert_eq!(Network::CoreTestnet.name(), "Core Testnet");
        assert_eq!(Network::BaseSepolia.name(), "Base Sepolia");
    }

    #[test]
    fn test_network_rpc_urls() {
        assert_eq!(Network::CoreTestnet.rpc_url(), "https://rpc.test2.btcs.network");
        assert_eq!(Network::BaseSepolia.rpc_url(), "https://sepolia.base.org");
    }

    #[test]
    fn test_network_native_currencies() {
        assert_eq!(Network::CoreTestnet.native_currency(), "TCORE2");
        assert_eq!(Network::BaseSepolia.native_currency(), "ETH");
    }

    #[test]
    fn test_transaction_creation() {
        let transaction = Transaction {
            to: "0x1234".to_string(),
            value: "1000000000000000000".to_string(),
            data: None,
            gas_limit: None,
            gas_price: None,
            nonce: None,
            chain_id: 1114,
        };

        assert_eq!(transaction.to, "0x1234");
        assert_eq!(transaction.value, "1000000000000000000");
        assert_eq!(transaction.chain_id, 1114);
    }

    #[test]
    fn test_token_info_creation() {
        let token = TokenInfo {
            symbol: "USDC".to_string(),
            name: "USD Coin".to_string(),
            decimals: 6,
            address: "0x1234".to_string(),
            chain_id: "core_testnet".to_string(),
            is_native: false,
            is_stablecoin: true,
        };

        assert_eq!(token.symbol, "USDC");
        assert_eq!(token.decimals, 6);
        assert!(token.is_stablecoin);
        assert!(!token.is_native);
    }
} 