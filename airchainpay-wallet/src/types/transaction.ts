export interface Transaction {
  id: string;
  to: string;
  amount: string;
  status: 'pending' | 'completed' | 'failed' | 'queued';
  timestamp: number;
  chainId?: string;
  hash?: string;
  error?: string;
  // Offline support properties
  signedTx?: string;
  transport?: 'qr' | 'ble' | 'secure_ble' | 'onchain' | 'manual' | 'relay';
  metadata?: {
    token?: any;
    paymentReference?: string;
    merchant?: string;
    location?: string;
    [key: string]: any;
  };
} 