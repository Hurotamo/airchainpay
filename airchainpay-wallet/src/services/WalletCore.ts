import { NativeModules } from 'react-native';

const { WalletCore } = NativeModules;

export function init(): Promise<number> {
  return WalletCore.init();
}

export function createWallet(name: string, network: number): Promise<string> {
  return WalletCore.createWallet(name, network);
}

export function importWallet(seedPhrase: string): Promise<string> {
  return WalletCore.importWallet(seedPhrase);
}

export function signMessage(walletId: string, message: string): Promise<string> {
  return WalletCore.signMessage(walletId, message);
}

export function sendTransaction(walletId: string, toAddress: string, amount: string, network: number, password: string): Promise<string> {
  return WalletCore.sendTransaction(walletId, toAddress, amount, network, password);
}

export function getBalance(walletId: string, network: number, password: string): Promise<string> {
  return WalletCore.getBalance(walletId, network, password);
}

export function getSupportedNetworks(): Promise<string> {
  return WalletCore.getSupportedNetworks();
}

export function getTokenBalance(walletId: string, tokenAddress: string, network: number, password: string): Promise<string> {
  return WalletCore.getTokenBalance(walletId, tokenAddress, network, password);
}

export function backupWallet(walletId: string, password: string): Promise<string> {
  return WalletCore.backupWallet(walletId, password);
}

export function restoreWallet(backupData: string, password: string): Promise<string> {
  return WalletCore.restoreWallet(backupData, password);
}

export function bleSendPayment(): Promise<number> {
  return WalletCore.bleSendPayment();
} 