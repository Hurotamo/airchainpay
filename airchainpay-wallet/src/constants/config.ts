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