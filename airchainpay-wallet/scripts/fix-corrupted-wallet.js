const { SecureStorageService } = require('../src/utils/SecureStorageService');

/**
 * Script to fix corrupted wallet data
 * This script clears all wallet storage and allows the wallet to be recreated properly
 */
async function fixCorruptedWallet() {
  try {
    console.log('[FixCorruptedWallet] Starting wallet corruption fix...');
    
    const secureStorage = SecureStorageService.getInstance();
    
    // Clear all wallet data
    const keysToDelete = [
      'wallet_private_key',
      'wallet_seed_phrase', 
      'temp_seed_phrase',
      'wallet_password',
      'backup_confirmed'
    ];
    
    console.log('[FixCorruptedWallet] Clearing all wallet storage...');
    
    for (const key of keysToDelete) {
      try {
        await secureStorage.deleteItem(key);
        console.log(`[FixCorruptedWallet] Deleted: ${key}`);
      } catch (error) {
        console.log(`[FixCorruptedWallet] Failed to delete ${key}:`, error.message);
      }
    }
    
    console.log('[FixCorruptedWallet] Wallet corruption fix completed successfully');
    console.log('[FixCorruptedWallet] You can now restart the app to create a new wallet');
    
  } catch (error) {
    console.error('[FixCorruptedWallet] Failed to fix corrupted wallet:', error);
  }
}

// Run the fix
fixCorruptedWallet(); 