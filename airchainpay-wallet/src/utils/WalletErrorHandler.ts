import { logger } from './Logger';
import { MultiChainWalletManager } from '../wallet/MultiChainWalletManager';

export class WalletErrorHandler {
  /**
   * Automatically handle wallet errors and corruption
   * Returns true if wallet was fixed, false if no action needed
   */
  static async handleWalletError(error: any): Promise<boolean> {
    try {
      const errorMessage = error?.message || String(error);
      
      // Check if error is related to invalid private key or corrupted data
      if (errorMessage.includes('invalid BytesLike value') || 
          errorMessage.includes('0xtrue') || 
          errorMessage.includes('0xfalse') ||
          errorMessage.includes('Corrupted private key detected') ||
          errorMessage.includes('Invalid private key format') ||
          errorMessage.includes('Failed to create/load wallet')) {
        
        logger.warn('[WalletErrorHandler] Detected corrupted wallet data, attempting to fix...');
        
        const walletManager = MultiChainWalletManager.getInstance();
        await walletManager.resetCorruptedWallet();
        
        logger.info('[WalletErrorHandler] Successfully fixed corrupted wallet data');
        return true;
      }
      
      return false;
    } catch (fixError) {
      logger.error('[WalletErrorHandler] Failed to handle wallet error:', fixError);
      return false;
    }
  }

  /**
   * Check if wallet data is corrupted and fix it
   */
  static async checkAndFixWallet(): Promise<boolean> {
    try {
      const walletManager = MultiChainWalletManager.getInstance();
      return await walletManager.checkAndFixCorruptedWallet();
    } catch (error) {
      logger.error('[WalletErrorHandler] Failed to check and fix wallet:', error);
      return false;
    }
  }

  /**
   * Get user-friendly error message for wallet errors
   */
  static getErrorMessage(error: any): string {
    const errorMessage = error?.message || String(error);
    
    if (errorMessage.includes('invalid BytesLike value') || 
        errorMessage.includes('0xtrue') || 
        errorMessage.includes('0xfalse') ||
        errorMessage.includes('Corrupted private key detected') ||
        errorMessage.includes('Invalid private key format')) {
      return 'Wallet data corrupted. The app will automatically fix this issue. Please try again.';
    }
    
    if (errorMessage.includes('Failed to create/load wallet')) {
      return 'Unable to load wallet. The app will create a new wallet for you. Please try again.';
    }
    
    return 'An error occurred with your wallet. Please try again.';
  }
} 