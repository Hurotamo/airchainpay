import { secureStorage } from './SecureStorageService';
import { logger } from './Logger';

/**
 * Utility to fix corrupted wallet data
 */
export class WalletCorruptionFix {
  /**
   * Clear all wallet storage to fix corruption issues
   */
  static async clearAllWalletData(): Promise<void> {
    try {
      logger.info('[WalletCorruptionFix] Starting wallet data cleanup...');
      
      const keysToDelete = [
        'wallet_private_key',
        'wallet_seed_phrase', 
        'temp_seed_phrase',
        'wallet_password',
        'backup_confirmed'
      ];
      
      for (const key of keysToDelete) {
        try {
          await secureStorage.deleteItem(key);
          logger.info(`[WalletCorruptionFix] Deleted: ${key}`);
        } catch (error) {
          logger.warn(`[WalletCorruptionFix] Failed to delete ${key}:`, error);
        }
      }
      
      logger.info('[WalletCorruptionFix] Wallet data cleanup completed successfully');
    } catch (error) {
      logger.error('[WalletCorruptionFix] Failed to clear wallet data:', error);
      throw error;
    }
  }

  /**
   * Check if wallet data is corrupted and fix it
   */
  static async checkAndFixCorruption(): Promise<boolean> {
    try {
      const privateKey = await secureStorage.getItem('wallet_private_key');
      
      if (!privateKey) {
        return false; // No wallet to fix
      }

      // Check for corrupted values
      const corruptedValues = ['true', 'false', '0xtrue', '0xfalse', 'null', 'undefined', 'NaN', '0xNaN'];
      if (corruptedValues.includes(privateKey)) {
        logger.warn('[WalletCorruptionFix] Corrupted private key detected:', privateKey);
        await this.clearAllWalletData();
        return true;
      }

      // Check format
      if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
        logger.warn('[WalletCorruptionFix] Invalid private key format:', privateKey);
        await this.clearAllWalletData();
        return true;
      }

      return false; // No corruption detected
    } catch (error) {
      logger.error('[WalletCorruptionFix] Failed to check corruption:', error);
      return false;
    }
  }
} 