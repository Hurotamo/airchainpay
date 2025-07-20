// config.ts
// Centralized access to environment variables from Expo config.
// Usage: import { RELAY_SERVER_URL } from '../constants/config';
// All variables are loaded from Constants.expoConfig.extra at runtime.

import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra || {};

export const BASE_SEPOLIA_RPC_URL = extra.BASE_SEPOLIA_RPC_URL;
export const CORE_TESTNET_RPC_URL = extra.CORE_TESTNET_RPC_URL;
export const BASESCAN_API_KEY = extra.BASESCAN_API_KEY;
export const ETHERSCAN_API_KEY = extra.ETHERSCAN_API_KEY;
export const INFURA_PROJECT_ID = extra.INFURA_PROJECT_ID;
export const INFURA_PROJECT_SECRET = extra.INFURA_PROJECT_SECRET;
export const ALCHEMY_API_KEY = extra.ALCHEMY_API_KEY;
export const QUICKNODE_API_KEY = extra.QUICKNODE_API_KEY;
export const RELAY_SERVER_URL = extra.RELAY_SERVER_URL;
export const RELAY_API_KEY = extra.RELAY_API_KEY; 

// Relay configuration
export const RELAY_CONFIG = {
  // Development URLs (local development only)
  development: {
    relayEndpoints: [
      'http://localhost:4000',
      'http://127.0.0.1:4000',
      'http://10.0.2.2:4000' // Android emulator localhost
    ],
    healthEndpoint: '/health',
    transactionEndpoint: '/api/send_tx'
  },
  
  // Production URLs (to be configured per environment)
  production: {
    relayEndpoints: [
      process.env.RELAY_URL || 'https://relay.airchainpay.com',
      process.env.RELAY_BACKUP_URL || 'https://relay-backup.airchainpay.com'
    ],
    healthEndpoint: '/health',
    transactionEndpoint: '/api/send_tx'
  },
  
  // Staging URLs
  staging: {
    relayEndpoints: [
      process.env.STAGING_RELAY_URL || 'https://staging-relay.airchainpay.com'
    ],
    healthEndpoint: '/health',
    transactionEndpoint: '/api/send_tx'
  }
};

// Get current environment
export const getEnvironment = (): 'development' | 'staging' | 'production' => {
  if (__DEV__) return 'development';
  // In a real app, you'd check actual environment variables
  return process.env.NODE_ENV === 'production' ? 'production' : 'staging';
};

// Get relay configuration for current environment
export const getRelayConfig = () => {
  const env = getEnvironment();
  return RELAY_CONFIG[env];
}; 