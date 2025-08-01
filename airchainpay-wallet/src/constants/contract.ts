import { SUPPORTED_CHAINS } from './AppConfig';

// Get contract address for a specific chain
export function getContractAddress(chainId: string): string {
  const chain = SUPPORTED_CHAINS[chainId];
  if (!chain?.contractAddress) {
    throw new Error(`Contract address not configured for chain: ${chainId}`);
  }
  return chain.contractAddress;
}

// All deployed contract addresses
export const CONTRACT_ADDRESSES = {
  base_sepolia: SUPPORTED_CHAINS.base_sepolia.contractAddress,
  core_testnet: SUPPORTED_CHAINS.core_testnet.contractAddress,
  morph_holesky: SUPPORTED_CHAINS.morph_holesky.contractAddress,
  lisk_sepolia: SUPPORTED_CHAINS.lisk_sepolia.contractAddress,
};

// Contract deployment information
export const DEPLOYMENT_INFO = {
  base_sepolia: {
    address: '0x8d7eaB03a72974F5D9F5c99B4e4e1B393DBcfCAB',
    owner: '0x01FfCfd0AFC24a42014EDCE646d6725cdA93c02e',
    explorer: 'https://sepolia.basescan.org/address/0x8d7eaB03a72974F5D9F5c99B4e4e1B393DBcfCAB',
    deployedAt: '2025-08-01T13:49:07.159Z'
  },
  core_testnet: {
    address: '0xcE2D2A50DaA794c12d079F2E2E2aF656ebB981fF',
    owner: '0x01FfCfd0AFC24a42014EDCE646d6725cdA93c02e',
    explorer: 'https://scan.test2.btcs.network/address/0xcE2D2A50DaA794c12d079F2E2E2aF656ebB981fF',
    deployedAt: '2025-08-01T13:46:20.747Z'
  },
  morph_holesky: {
    address: '0x26C59cd738Df90604Ebb13Ed8DB76657cfD51f40',
    owner: '0x01FfCfd0AFC24a42014EDCE646d6725cdA93c02e',
    explorer: 'https://holesky.etherscan.io/address/0x26C59cd738Df90604Ebb13Ed8DB76657cfD51f40',
    deployedAt: '2025-08-01T13:49:28.820Z'
  },
  lisk_sepolia: {
    address: '0xaBEEEc6e6c1f6bfDE1d05db74B28847Ba5b44EAF',
    owner: '0x01FfCfd0AFC24a42014EDCE646d6725cdA93c02e',
    explorer: 'https://sepolia.lisk.com/address/0xaBEEEc6e6c1f6bfDE1d05db74B28847Ba5b44EAF',
    deployedAt: '2025-08-01T13:50:01.992Z'
  }
};

// Contract ABI imports
export { AIRCHAINPAY_TOKEN_ABI as AIRCHAINPAY_TOKEN_ABI } from './abi';
export { AIRCHAINPAY_ABI } from './abi';
export { MOCK_ERC20_ABI } from './abi';
export { ERC20_ABI } from './abi';

// Contract function signatures
export const CONTRACT_FUNCTIONS = {
  // AirChainPay contract functions
  payNative: 'payNative(address,string)',
  payToken: 'payToken(address,address,uint256,string)',
  batchPay: 'batchPay(address,address[],uint256[],string)',
  addToken: 'addToken(address,string,bool,uint8,uint256,uint256)',
  getSupportedTokens: 'getSupportedTokens()',
  getTokenConfig: 'getTokenConfig(address)',
  
  // ERC-20 functions
  transfer: 'transfer(address,uint256)',
  balanceOf: 'balanceOf(address)',
  decimals: 'decimals()',
  symbol: 'symbol()',
  name: 'name()',
};

// Gas estimation for different operations
export const GAS_ESTIMATES = {
  nativeTransfer: 21000,
  erc20Transfer: 65000,
  contractPayment: 100000,
  batchPayment: 150000,
  tokenApproval: 46000,
};

// Contract events
export const CONTRACT_EVENTS = {
  PaymentProcessed: 'PaymentProcessed(bytes32,address,address,uint256,address,uint8,string)',
  TokenAdded: 'TokenAdded(address,string,bool)',
  TokenRemoved: 'TokenRemoved(address)',
  FeeRatesUpdated: 'FeeRatesUpdated(uint256,uint256)',
  FeesWithdrawn: 'FeesWithdrawn(address,uint256)',
}; 