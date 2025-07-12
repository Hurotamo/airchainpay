/**
 * API Keys and RPC URLs configuration
 * Replace placeholder values with your actual API keys
 */

interface ChainAPIKeys {
  rpcUrl: string;
  explorerApiKey?: string;
}

interface ExplorerAPIKeys {
  etherscan: string;
  basescan: string;
}

interface InfuraConfig {
  projectId: string;
  projectSecret: string;
}

interface APIConfig {
  apiKey: string;
}

// Make API_KEYS private by removing 'export'
const API_KEYS = {
  base_sepolia: {
    // Get from providers like Infura, Alchemy, or QuickNode
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    // Get from https://basescan.org/apis
    explorerApiKey: process.env.BASESCAN_API_KEY || '',
  } as ChainAPIKeys,
  core_testnet: {
    // Core testnet RPC
    rpcUrl: process.env.CORE_TESTNET_RPC_URL || 'https://rpc.test2.btcs.network',
    chainId: 1114,
    contractAddress: '0x8d7eaB03a72974F5D9F5c99B4e4e1B393DBcfCAB',
    explorer: 'https://scan.test2.btcs.network',
  } as ChainAPIKeys,
  // Block explorer APIs
  explorers: {
    etherscan: process.env.ETHERSCAN_API_KEY || '',
    basescan: process.env.BASESCAN_API_KEY || '',
  } as ExplorerAPIKeys,
  // General purpose APIs
  infura: {
    projectId: process.env.INFURA_PROJECT_ID || '',
    projectSecret: process.env.INFURA_PROJECT_SECRET || '',
  } as InfuraConfig,
  alchemy: {
    apiKey: process.env.ALCHEMY_API_KEY || '',
  } as APIConfig,
  quicknode: {
    apiKey: process.env.QUICKNODE_API_KEY || '',
  } as APIConfig,
};

// RPC URL helper functions
export const getRpcUrl = (chainId: string): string => {
  const chain = API_KEYS[chainId as keyof typeof API_KEYS];
  if (chain && 'rpcUrl' in chain) {
    return (chain as ChainAPIKeys).rpcUrl;
  }
  return '';
};

// Supported chains configuration
export const SUPPORTED_CHAINS = {
  base_sepolia: {
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    chainId: 84532,
    contractAddress: '0x7B79117445C57eea1CEAb4733020A55e1D503934',
    explorer: 'https://sepolia.basescan.org',
  },
  core_testnet: {
    rpcUrl: process.env.CORE_TESTNET_RPC_URL || 'https://rpc.test2.btcs.network',
    chainId: 1114,
    contractAddress: '0x8d7eaB03a72974F5D9F5c99B4e4e1B393DBcfCAB',
    explorer: 'https://scan.test2.btcs.network',
  },
} as const;

export const RPC_URLS: { [key: string]: { rpcUrl: string } } = {
  base_sepolia: {
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
  },
  core_testnet: {
    rpcUrl: process.env.CORE_TESTNET_RPC_URL || 'https://rpc.test2.btcs.network',
  },
};

// Export API keys for use in other modules
export const getAPIKeys = () => API_KEYS; 