/**
 * Global app configuration settings
 */

import Constants from 'expo-constants';

// Get RPC URL from environment or use defaults
function getRpcUrl(chainId: string): string {
  const extra = Constants.expoConfig?.extra || {};
  
  console.log(`[AppConfig] Getting RPC URL for chainId: ${chainId}`);
  console.log(`[AppConfig] Constants.expoConfig?.extra:`, extra);
  
  let rpcUrl = '';
  switch (chainId) {
    case 'base_sepolia':
      rpcUrl = extra.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
      break;
    case 'core_testnet':
      rpcUrl = extra.CORE_TESTNET_RPC_URL || 'https://rpc.test2.btcs.network';
      break;
    default:
      rpcUrl = '';
  }
  
  console.log(`[AppConfig] Resolved RPC URL for ${chainId}: ${rpcUrl}`);
  return rpcUrl;
}

export type ChainType = 'evm' | 'bitcoin' | 'other';

export interface ChainConfig {
  id: string;
  name: string;
  chainId: number;
  rpcUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  blockExplorer: string;
  contractAddress: string;
  type: ChainType;
}

export const SUPPORTED_CHAINS: { [key: string]: ChainConfig } = {
  base_sepolia: {
    id: 'base_sepolia',
    name: 'Base Sepolia',
    chainId: 84532,
    rpcUrl: getRpcUrl('base_sepolia'),
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
    },
    blockExplorer: 'https://sepolia.basescan.org',
    contractAddress: '0x7B79117445C57eea1CEAb4733020A55e1D503934',
    type: 'evm',
  },
  core_testnet: {
    id: 'core_testnet',
    name: 'Core Testnet',
    chainId: 1114,
    rpcUrl: getRpcUrl('core_testnet'),
    nativeCurrency: {
      name: 'TCORE2',
      symbol: 'TCORE2',
      decimals: 18,
    },
    blockExplorer: 'https://scan.test2.btcs.network',
    contractAddress: '0x8d7eaB03a72974F5D9F5c99B4e4e1B393DBcfCAB',
    type: 'evm',
  },
};

// Default chain configuration
export const DEFAULT_CHAIN_ID = 'base_sepolia';
export const DEFAULT_CHAIN_CONFIG = SUPPORTED_CHAINS[DEFAULT_CHAIN_ID];

// Ensure contract addresses are loaded
if (!DEFAULT_CHAIN_CONFIG.contractAddress) {
  throw new Error('Contract address not configured for default chain');
}

// Legacy exports for backward compatibility
export const DEFAULT_RPC_URL = DEFAULT_CHAIN_CONFIG.rpcUrl;


// Relay server configuration
export const RELAY_SERVER_CONFIG = {
  baseUrl: process.env.RELAY_SERVER_URL || 'http://localhost:4000',
  apiKey: process.env.RELAY_API_KEY || 'your-api-key-here',
  timeout: 30000,
};

// BLE configuration
export const BLE_CONFIG = {
  serviceUUID: '0000abcd-0000-1000-8000-00805f9b34fb',
  characteristicUUID: '0000dcba-0000-1000-8000-00805f9b34fb',
  scanTimeout: 30000,
  connectionTimeout: 15000,
};

// QR code configuration
export const QR_CONFIG = {
  version: '1.0',
  errorCorrectionLevel: 'M',
  margin: 2,
  width: 256,
};

// Storage keys for secure storage
export const STORAGE_KEYS = {
  WALLET_PRIVATE_KEY: 'wallet_private_key',
  WALLET_MNEMONIC: 'wallet_mnemonic',
  WALLET_PASSWORD: 'wallet_password',
  WALLET_ADDRESS: 'wallet_address',
  WALLET_BACKUP: 'wallet_backup',
  WALLET_ENCRYPTED: 'wallet_encrypted',
  WALLET_INITIALIZED: 'wallet_initialized',
  WALLET_LOCKED: 'wallet_locked',
  WALLET_NETWORK: 'wallet_network',
  WALLET_TOKENS: 'wallet_tokens',
  WALLET_TRANSACTIONS: 'wallet_transactions',
  WALLET_SETTINGS: 'wallet_settings',
  SELECTED_CHAIN: 'selected_chain',
  TRANSACTION_HISTORY: 'transaction_history',
};

// Transaction configuration
export const TRANSACTION_CONFIG = {
  maxRetries: 3,
  retryDelay: 2000,
  timeout: 60000,
  maxGasPrice: {
    base_sepolia: '20000000000', // 20 gwei
    core_testnet: '50000000000', // 50 gwei
  },
};

// Network status configuration
export const NETWORK_STATUS_CONFIG = {
  checkInterval: 30000, // 30 seconds
  timeout: 10000, // 10 seconds
  retryAttempts: 3,
};

// Logging configuration
export const LOGGING_CONFIG = {
  level: 'info',
  enableConsole: true,
  enableFile: false,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
};

// Security configuration
export const SECURITY_CONFIG = {
  maxLoginAttempts: 5,
  lockoutDuration: 300000, // 5 minutes
  sessionTimeout: 1800000, // 30 minutes
  requireBiometric: false,
};

// Feature flags
export const FEATURE_FLAGS = {
  enableBLE: true,
  enableQR: true,
  enableMultiChain: true,
  enableTokenSupport: true,
  enableTransactionHistory: true,
  enableBackup: true,
  enableBiometric: false,
};

// Camera configuration
export const ENABLE_CAMERA_FEATURES = true;

// API endpoints
export const API_ENDPOINTS = {
  relay: {
    submitTransaction: '/transaction/submit',
    getTransactionStatus: '/transaction/status',
    getContractPayments: '/contract/payments',
    bleProcessTransaction: '/ble/process-transaction',
  },
  blockchain: {
    getGasPrice: '/gas/price',
    estimateGas: '/gas/estimate',
    getBlockNumber: '/block/number',
  },
};

// Error messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network connection failed',
  INSUFFICIENT_BALANCE: 'Insufficient balance',
  INVALID_ADDRESS: 'Invalid address format',
  TRANSACTION_FAILED: 'Transaction failed',
  WALLET_NOT_INITIALIZED: 'Wallet not initialized',
  BLE_NOT_AVAILABLE: 'Bluetooth not available',
  QR_SCAN_FAILED: 'QR code scan failed',
  TOKEN_NOT_SUPPORTED: 'Token not supported',
  CHAIN_NOT_SUPPORTED: 'Chain not supported',
};

// Success messages
export const SUCCESS_MESSAGES = {
  TRANSACTION_SENT: 'Transaction sent successfully',
  WALLET_CREATED: 'Wallet created successfully',
  WALLET_IMPORTED: 'Wallet imported successfully',
  BACKUP_CREATED: 'Backup created successfully',
  SETTINGS_SAVED: 'Settings saved successfully',
  BLE_CONNECTED: 'Bluetooth device connected',
  QR_SCANNED: 'QR code scanned successfully',
};

// Validation rules
export const VALIDATION_RULES = {
  ADDRESS_LENGTH: 42,
  PRIVATE_KEY_LENGTH: 64,
  MNEMONIC_WORDS: 12,
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 128,
  MIN_AMOUNT: '0.000001',
  MAX_AMOUNT: '1000000',
};

// UI configuration
export const UI_CONFIG = {
  animationDuration: 300,
  debounceDelay: 500,
  refreshInterval: 10000,
  maxRetries: 3,
  loadingTimeout: 30000,
};

// Default values
export const DEFAULT_VALUES = {
  GAS_LIMIT: '21000',
  GAS_PRICE: '20000000000',
  TRANSACTION_TIMEOUT: 60000,
  SCAN_TIMEOUT: 30000,
  CONNECTION_TIMEOUT: 15000,
};

// Chain-specific configurations
export const CHAIN_CONFIGS = {
  base_sepolia: {
    name: 'Base Sepolia',
    nativeCurrency: 'ETH',
    blockTime: 2,
    confirmations: 12,
  },
  core_testnet: {
    name: 'Core Testnet',
    nativeCurrency: 'TCORE2',
    blockTime: 3,
    confirmations: 6,
  },
}; 