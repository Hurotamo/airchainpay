/**
 * Logo configuration for AirChainPay
 * Contains all network and token logos from official sources
 */

export const NETWORK_LOGOS = {
  base_sepolia: 'https://raw.githubusercontent.com/base-org/brand-kit/main/logo/symbol/Base_Symbol_Blue.png',
  core_testnet: 'https://rose-imaginative-lion-87.mypinata.cloud/ipfs/bafkreidlgylpefyha2y3z7uhwestzi2zxsdxluiakugha6wxk2p3lozoci',
} as const;

// Token-specific logos with reliable URLs
export const TOKEN_LOGOS = {
  // Stablecoins with proper logos
  USDC: 'https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png',
  USDT: 'https://s2.coinmarketcap.com/static/img/coins/64x64/825.png',
  
  // Native tokens with exact network logos
  ETH: 'https://raw.githubusercontent.com/base-org/brand-kit/main/logo/symbol/Base_Symbol_Blue.png', // Base native token
  CORE: 'https://rose-imaginative-lion-87.mypinata.cloud/ipfs/bafkreidlgylpefyha2y3z7uhwestzi2zxsdxluiakugha6wxk2p3lozoci', // Core DAO native token
  TCORE2: 'https://rose-imaginative-lion-87.mypinata.cloud/ipfs/bafkreidlgylpefyha2y3z7uhwestzi2zxsdxluiakugha6wxk2p3lozoci', // Core Testnet native token
} as const;

// Network-specific token logos with fallbacks
export const NETWORK_TOKEN_LOGOS = {
  base_sepolia: {
    ETH: 'https://raw.githubusercontent.com/base-org/brand-kit/main/logo/symbol/Base_Symbol_Blue.png',
    USDC: 'https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png',
    USDT: 'https://s2.coinmarketcap.com/static/img/coins/64x64/825.png',
  },
  core_testnet: {
    TCORE2: 'https://rose-imaginative-lion-87.mypinata.cloud/ipfs/bafkreidlgylpefyha2y3z7uhwestzi2zxsdxluiakugha6wxk2p3lozoci',
    USDC: 'https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png',
    USDT: 'https://s2.coinmarketcap.com/static/img/coins/64x64/825.png',
  },
} as const;

// Fallback logo URLs for when primary URLs fail
export const FALLBACK_LOGOS = {
  USDC: 'https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png',
  USDT: 'https://s2.coinmarketcap.com/static/img/coins/64x64/825.png',
  ETH: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png',
  CORE: 'https://rose-imaginative-lion-87.mypinata.cloud/ipfs/bafkreidlgylpefyha2y3z7uhwestzi2zxsdxluiakugha6wxk2p3lozoci',
  TCORE2: 'https://rose-imaginative-lion-87.mypinata.cloud/ipfs/bafkreidlgylpefyha2y3z7uhwestzi2zxsdxluiakugha6wxk2p3lozoci',
} as const;

// Utility function to get logo for a token symbol
export const getTokenLogo = (symbol: string, chainId?: string): string | any => {
  // If chainId is provided, try to get network-specific logo first
  if (chainId && NETWORK_TOKEN_LOGOS[chainId as keyof typeof NETWORK_TOKEN_LOGOS]) {
    const networkLogos = NETWORK_TOKEN_LOGOS[chainId as keyof typeof NETWORK_TOKEN_LOGOS];
    if (networkLogos[symbol as keyof typeof networkLogos]) {
      return networkLogos[symbol as keyof typeof networkLogos];
    }
  }
  
  // Try general token logos
  if (TOKEN_LOGOS[symbol as keyof typeof TOKEN_LOGOS]) {
    return TOKEN_LOGOS[symbol as keyof typeof TOKEN_LOGOS];
  }
  
  // Try fallback logos
  if (FALLBACK_LOGOS[symbol as keyof typeof FALLBACK_LOGOS]) {
    return FALLBACK_LOGOS[symbol as keyof typeof FALLBACK_LOGOS];
  }
  
  // Final fallback to generic icon (empty string)
  return '';
};

// Utility function to get network logo
export const getNetworkLogo = (chainId: string): string => {
  return NETWORK_LOGOS[chainId as keyof typeof NETWORK_LOGOS] || '';
};

// Utility function to get logo URI
export const getLogoUri = (logo: string | any): any => {
  if (typeof logo === 'string' && logo.startsWith('http')) {
    return { uri: logo };
  }
  return logo;
}; 