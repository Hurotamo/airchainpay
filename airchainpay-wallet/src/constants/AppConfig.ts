/**
 * Global app configuration settings
 */

import Constants from 'expo-constants';

// Get RPC URL from environment or use defaults
function getRpcUrl(chainId: string): string {
  const extra = Constants.expoConfig?.extra || {};
  
  console.log(`[AppConfig] Getting RPC URL for chainId: ${chainId}`);
  // Remove sensitive logging - don't log the entire extra object
  console.log(`[AppConfig] Configuration loaded for chain: ${chainId}`);
  
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
  
  // Remove sensitive logging - don't log the actual RPC URL
  console.log(`[AppConfig] RPC URL resolved for ${chainId}: [REDACTED]`);
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

// Gas configuration for better organization
export const GAS_CONFIG = {
  // Gas price limits in gwei (must match GasPriceValidator.ts)
  limits: {
    base_sepolia: {
      min: 0.1,      // 0.1 gwei minimum
      max: 50,       // 50 gwei maximum
      warning: 20,   // Warning at 20 gwei
      emergency: 100 // Emergency limit
    },
    core_testnet: {
      min: 0.1,
      max: 100,      // Higher limit for Core
      warning: 50,
      emergency: 200
    }
  },
  
  // Gas limit bounds for different transaction types
  gasLimits: {
    nativeTransfer: {
      min: 21000,
      max: 25000,
      recommended: 21000
    },
    erc20Transfer: {
      min: 65000,
      max: 80000,
      recommended: 65000
    },
    contractInteraction: {
      min: 100000,
      max: 500000,
      recommended: 150000
    },
    complexTransaction: {
      min: 200000,
      max: 1000000,
      recommended: 300000
    }
  },
  
  // Default gas settings
  defaults: {
    gasLimit: '21000',
    gasPrice: '50000000000', // 50 gwei
    maxPriorityFeePerGas: '1500000000', // 1.5 gwei
    maxFeePerGas: '50000000000', // 50 gwei
  },
  
  // Gas estimation settings
  estimation: {
    priorityMultipliers: {
      low: 0.8,
      normal: 1.0,
      high: 1.5,
      urgent: 2.0
    },
    maxRetries: 3,
    timeout: 30000,
  }
};

// Default chain configuration
export const DEFAULT_CHAIN_ID = 'base_sepolia';
export const DEFAULT_CHAIN_CONFIG = SUPPORTED_CHAINS[DEFAULT_CHAIN_ID];

// Ensure contract addresses are loaded
if (!DEFAULT_CHAIN_CONFIG.contractAddress) {
  throw new Error('Contract address not configured for default chain');
}

// Validate gas configuration consistency
const validateGasConfig = () => {
  const supportedChains = Object.keys(SUPPORTED_CHAINS);
  
  for (const chainId of supportedChains) {
    const gasLimits = GAS_CONFIG.limits[chainId as keyof typeof GAS_CONFIG.limits];
    const maxGasPrice = TRANSACTION_CONFIG.maxGasPrice[chainId as keyof typeof TRANSACTION_CONFIG.maxGasPrice];
    
    if (!gasLimits) {
      console.warn(`[AppConfig] No gas limits configured for chain: ${chainId}`);
      continue;
    }
    
    if (!maxGasPrice) {
      console.warn(`[AppConfig] No max gas price configured for chain: ${chainId}`);
      continue;
    }
    
    // Convert maxGasPrice from wei to gwei for comparison
    const maxGasPriceGwei = Number(maxGasPrice) / 1e9;
    
    if (Math.abs(maxGasPriceGwei - gasLimits.max) > 0.1) {
      console.warn(`[AppConfig] Gas price limit mismatch for ${chainId}: maxGasPrice=${maxGasPriceGwei}gwei, gasLimits.max=${gasLimits.max}gwei`);
    }
  }
};

// Run validation in development - moved after GAS_CONFIG definition

// Legacy exports for backward compatibility
export const DEFAULT_RPC_URL = DEFAULT_CHAIN_CONFIG.rpcUrl;

// Gas configuration helper functions
export const GasConfigHelpers = {
  /**
   * Get gas price limits for a specific chain
   */
  getGasPriceLimits: (chainId: string) => {
    return GAS_CONFIG.limits[chainId as keyof typeof GAS_CONFIG.limits];
  },
  
  /**
   * Get gas limit bounds for a transaction type
   */
  getGasLimitBounds: (transactionType: keyof typeof GAS_CONFIG.gasLimits) => {
    return GAS_CONFIG.gasLimits[transactionType];
  },
  
  /**
   * Check if gas price is within limits for a chain
   */
  isGasPriceValid: (gasPriceGwei: number, chainId: string): boolean => {
    const limits = GAS_CONFIG.limits[chainId as keyof typeof GAS_CONFIG.limits];
    if (!limits) return false;
    return gasPriceGwei >= limits.min && gasPriceGwei <= limits.max;
  },
  
  /**
   * Get default gas price for a chain
   */
  getDefaultGasPrice: (chainId: string): string => {
    const limits = GAS_CONFIG.limits[chainId as keyof typeof GAS_CONFIG.limits];
    if (!limits) return GAS_CONFIG.defaults.gasPrice;
    
    // Use warning level as default, but ensure it's within bounds
    const defaultGwei = Math.min(limits.warning, limits.max);
    return (defaultGwei * 1e9).toString();
  },
  
  /**
   * Get priority multiplier for gas estimation
   */
  getPriorityMultiplier: (priority: 'low' | 'normal' | 'high' | 'urgent'): number => {
    return GAS_CONFIG.estimation.priorityMultipliers[priority];
  }
};


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
    base_sepolia: '50000000000', // 50 gwei (updated to match GasPriceValidator)
    core_testnet: '100000000000', // 100 gwei (updated to match GasPriceValidator)
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
    getGasEstimate: '/gas/estimate',
    getFeeHistory: '/gas/fee-history',
  },
};

// Gas-related constants
export const GAS_CONSTANTS = {
  // Gas price units
  WEI_PER_GWEI: 1e9,
  GWEI_PER_ETH: 1e9,
  
  // Common gas limits
  ETH_TRANSFER_GAS: 21000,
  ERC20_TRANSFER_GAS: 65000,
  CONTRACT_DEPLOYMENT_GAS: 500000,
  
  // Gas price thresholds (in gwei)
  LOW_GAS_THRESHOLD: 5,
  NORMAL_GAS_THRESHOLD: 20,
  HIGH_GAS_THRESHOLD: 50,
  URGENT_GAS_THRESHOLD: 100,
  
  // Gas estimation timeouts
  ESTIMATION_TIMEOUT: 30000,
  VALIDATION_TIMEOUT: 10000,
  
  // Gas price update intervals
  PRICE_UPDATE_INTERVAL: 60000, // 1 minute
  HISTORY_WINDOW: 600000, // 10 minutes
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
  GAS_PRICE: '50000000000', // Updated to 50 gwei for better compatibility
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

// Safety check to ensure GAS_CONFIG is properly loaded
if (typeof GAS_CONFIG === 'undefined' || !GAS_CONFIG.limits) {
  console.error('[AppConfig] GAS_CONFIG is not properly initialized');
  // Provide fallback configuration
  (global as any).GAS_CONFIG = GAS_CONFIG;
}

// Run validation in development - now that GAS_CONFIG is defined
if (process.env.NODE_ENV === 'development') {
  validateGasConfig();
} 