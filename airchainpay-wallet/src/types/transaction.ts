export interface Transaction {
  id: string;
  to: string;
  amount: string;
  status: string;
  chainId: string;
  timestamp: number;
  signedTx?: string;
  transport?: string;
  token?: {
    address: string;
    symbol: string;
    decimals: number;
    isNative: boolean;
  };
  paymentReference?: string;
  metadata?: {
    merchant?: string;
    location?: string;
    maxAmount?: string;
    minAmount?: string;
    timestamp?: number;
    expiry?: number;
  };
  [key: string]: unknown;
} 