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
};

// Contract deployment information
export const DEPLOYMENT_INFO = {
  base_sepolia: {
    address: '0x7B79117445C57eea1CEAb4733020A55e1D503934',
    owner: '0x01FfCfd0AFC24a42014EDCE646d6725cdA93c02e',
    explorer: 'https://sepolia.basescan.org/address/0x7B79117445C57eea1CEAb4733020A55e1D503934',
    deployedAt: '2024-12-13T00:00:00.000Z'
  },
  core_testnet: {
    address: '0x8d7eaB03a72974F5D9F5c99B4e4e1B393DBcfCAB',
    owner: '0x01FfCfd0AFC24a42014EDCE646d6725cdA93c02e',
    explorer: 'https://scan.test2.btcs.network/address/0x8d7eaB03a72974F5D9F5c99B4e4e1B393DBcfCAB',
    deployedAt: '2024-12-13T00:00:00.000Z'
  }
};

// Contract ABI imports
export { AIRCHAINPAY_ABI } from './abi';
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