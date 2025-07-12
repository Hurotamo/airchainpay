import { ImageSourcePropType } from 'react-native';

export interface TokenInfo {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  chainId: string;
  chainName: string;
  logoUri?: ImageSourcePropType | string;
  isNative: boolean;
  isStablecoin?: boolean;
  contractAddress?: string;
  balance?: string;
  usdValue?: number;
}