// Minimal, production-ready error classes for wallet, BLE, and transaction errors

export class WalletError extends Error {
  public code: string;
  constructor(message: string, code: string = 'WALLET_ERROR') {
    super(message);
    this.name = 'WalletError';
    this.code = code;
  }
}

export class BLEError extends WalletError {
  public deviceId?: string;
  constructor(message: string, deviceId?: string) {
    super(message, 'BLE_ERROR');
    this.name = 'BLEError';
    this.deviceId = deviceId;
  }
}

export class TransactionError extends WalletError {
  public txHash?: string;
  constructor(message: string, txHash?: string) {
    super(message, 'TRANSACTION_ERROR');
    this.name = 'TransactionError';
    this.txHash = txHash;
  }
} 