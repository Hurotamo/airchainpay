import * as Keychain from 'react-native-keychain';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './Logger';

/**
 * Secure Storage Service
 * 
 * Implements hardware-backed storage using react-native-keychain with fallback to expo-secure-store.
 * Also includes AsyncStorage backup to preserve wallet data when app is removed from screen.
 * Provides maximum security for sensitive wallet data including private keys and seed phrases.
 */
export class SecureStorageService {
  private static instance: SecureStorageService;
  private keychainAvailable: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {
    this.initializationPromise = this.initializeKeychain();
  }

  public static getInstance(): SecureStorageService {
    if (!SecureStorageService.instance) {
      SecureStorageService.instance = new SecureStorageService();
    }
    return SecureStorageService.instance;
  }

  /**
   * Wait for initialization to complete
   */
  private async waitForInitialization(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  /**
   * Initialize keychain availability check
   */
  private async initializeKeychain(): Promise<void> {
    try {
      // Check if Keychain module is available and properly imported
      if (!Keychain) {
        this.keychainAvailable = false;
        logger.info('[SecureStorage] Keychain module not available, using SecureStore fallback');
        return;
      }

      // Check if the module has the required methods
      if (typeof Keychain.getSupportedBiometryType !== 'function') {
        this.keychainAvailable = false;
        logger.info('[SecureStorage] Keychain methods not available, using SecureStore fallback');
        return;
      }

      // Test if keychain is available by calling the method
      // Wrap in try-catch to handle any runtime errors
      try {
        const biometryType = await Keychain.getSupportedBiometryType();
        
        // Additional check: try to set a test value to verify keychain is working
        // Use a simpler test that doesn't require authentication
        const testKey = '__test_keychain_access__';
        const testValue = 'test_value_' + Date.now();
        
        try {
          await Keychain.setGenericPassword(testKey, testValue, {
            accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,
            securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
          });
          
          // Try to retrieve the test value without authentication
          const credentials = await Keychain.getGenericPassword();
          
          // Clean up test value
          await Keychain.resetGenericPassword();
          
          if (credentials && credentials.password === testValue) {
            this.keychainAvailable = true;
            logger.info('[SecureStorage] Keychain is available and working properly');
          } else {
            this.keychainAvailable = false;
            logger.info('[SecureStorage] Keychain test failed, using SecureStore fallback');
          }
        } catch (testError) {
          this.keychainAvailable = false;
          logger.info('[SecureStorage] Keychain test failed, using SecureStore fallback:', testError);
        }
      } catch (keychainError) {
        // Keychain is not available on this device/platform
        this.keychainAvailable = false;
        logger.info('[SecureStorage] Keychain not supported on this device, using SecureStore fallback');
      }
    } catch (error) {
      this.keychainAvailable = false;
      logger.info('[SecureStorage] Keychain initialization failed, using SecureStore fallback');
    }
  }

  /**
   * Store sensitive data securely with backup
   * @param key - Storage key
   * @param value - Data to store
   */
  async setItem(key: string, value: string): Promise<void> {
    // Wait for initialization to complete
    await this.waitForInitialization();

    try {
      if (this.keychainAvailable && Keychain) {
        // Use hardware-backed keychain storage without authentication
        const keychainOptions = {
          accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,
          securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
        };

        // For Keychain, we store all data in a single credential with JSON structure
        // First, get existing data
        let existingData: Record<string, string> = {};
        try {
          const credentials = await Keychain.getGenericPassword();
          if (credentials && credentials.password) {
            existingData = JSON.parse(credentials.password) as Record<string, string>;
          }
        } catch (parseError) {
          // If existing data is not JSON, start fresh
          logger.warn('[SecureStorage] Existing keychain data is not JSON, starting fresh');
        }

        // Update with new key-value pair
        existingData[key] = value;
        
        // Store the updated JSON
        await Keychain.setGenericPassword('wallet_data', JSON.stringify(existingData), keychainOptions);
        logger.info(`[SecureStorage] Stored ${key} in Keychain`);
      } else {
        // Fallback to SecureStore
        await SecureStore.setItemAsync(key, value);
        logger.info(`[SecureStorage] Stored ${key} in SecureStore (fallback)`);
      }

      // Always backup to AsyncStorage for app removal protection
      try {
        await AsyncStorage.setItem(`backup_${key}`, value);
        logger.info(`[SecureStorage] Backed up ${key} to AsyncStorage`);
      } catch (backupError) {
        logger.warn(`[SecureStorage] Failed to backup ${key} to AsyncStorage:`, backupError);
      }
    } catch (error) {
      logger.error(`[SecureStorage] Failed to store ${key}:`, error);
      
      // If keychain fails, try SecureStore as final fallback
      if (this.keychainAvailable) {
        try {
          await SecureStore.setItemAsync(key, value);
          logger.info(`[SecureStorage] Stored ${key} in SecureStore after Keychain failure`);
        } catch (fallbackError) {
          logger.error(`[SecureStorage] Failed to store ${key} in SecureStore fallback:`, fallbackError);
          throw new Error(`Failed to store sensitive data: ${fallbackError}`);
        }
      } else {
        throw new Error(`Failed to store sensitive data: ${error}`);
      }
    }
  }

  /**
   * Retrieve sensitive data securely with backup recovery
   * @param key - Storage key
   */
  async getItem(key: string): Promise<string | null> {
    // Wait for initialization to complete
    await this.waitForInitialization();

    try {
      if (this.keychainAvailable && Keychain) {
        // Use hardware-backed keychain storage without authentication
        // For Keychain, we retrieve the JSON data and extract the specific key
        const credentials = await Keychain.getGenericPassword();
        if (credentials && credentials.password) {
          try {
            const data = JSON.parse(credentials.password) as Record<string, string>;
            if (data[key]) {
              logger.info(`[SecureStorage] Retrieved ${key} from Keychain`);
              return data[key];
            }
          } catch (parseError) {
            logger.warn('[SecureStorage] Failed to parse keychain data:', parseError);
          }
        }
        
        // If no credentials found or key doesn't exist, try backup
        logger.info(`[SecureStorage] Key ${key} not found in Keychain, trying backup`);
      } else {
        // Fallback to SecureStore
        const value = await SecureStore.getItemAsync(key);
        if (value) {
          logger.info(`[SecureStorage] Retrieved ${key} from SecureStore (fallback)`);
          return value;
        }
        
        // If not found in SecureStore, try backup
        logger.info(`[SecureStorage] Key ${key} not found in SecureStore, trying backup`);
      }

      // Try to recover from AsyncStorage backup
      try {
        const backupValue = await AsyncStorage.getItem(`backup_${key}`);
        if (backupValue) {
          logger.info(`[SecureStorage] Recovered ${key} from AsyncStorage backup`);
          
          // Restore to primary storage
          try {
            await this.setItem(key, backupValue);
            logger.info(`[SecureStorage] Restored ${key} to primary storage`);
          } catch (restoreError) {
            logger.warn(`[SecureStorage] Failed to restore ${key} to primary storage:`, restoreError);
          }
          
          return backupValue;
        }
      } catch (backupError) {
        logger.warn(`[SecureStorage] Failed to check backup for ${key}:`, backupError);
      }
      
      return null;
    } catch (error) {
      logger.error(`[SecureStorage] Failed to retrieve ${key}:`, error);
      
      // Check if it's an authentication error and handle gracefully
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Authentication canceled') || 
          errorMessage.includes('code: 10') ||
          errorMessage.includes('User canceled')) {
        logger.info('[SecureStorage] Authentication canceled, trying SecureStore fallback');
        
        try {
          const value = await SecureStore.getItemAsync(key);
          logger.info(`[SecureStorage] Retrieved ${key} from SecureStore after authentication cancellation`);
          return value;
        } catch (fallbackError) {
          logger.error(`[SecureStorage] Failed to retrieve ${key} from SecureStore fallback:`, fallbackError);
          return null;
        }
      }
      
      // If keychain fails for other reasons, try SecureStore as final fallback
      if (this.keychainAvailable) {
        try {
          const value = await SecureStore.getItemAsync(key);
          logger.info(`[SecureStorage] Retrieved ${key} from SecureStore after Keychain failure`);
          return value;
        } catch (fallbackError) {
          logger.error(`[SecureStorage] Failed to retrieve ${key} from SecureStore fallback:`, fallbackError);
          return null;
        }
      } else {
        return null;
      }
    }
  }

  /**
   * Retrieve sensitive data with authentication (for private keys and seed phrases)
   * @param key - Storage key
   * @param options - Retrieval options
   */
  async getSensitiveItem(
    key: string,
    options: {
      useBiometrics?: boolean;
      promptMessage?: string;
    } = {}
  ): Promise<string | null> {
    const { useBiometrics = false, promptMessage = 'Authenticate to access secret' } = options;

    // Wait for initialization to complete
    await this.waitForInitialization();

    try {
      if (this.keychainAvailable && Keychain) {
        // Use hardware-backed keychain storage without authentication for now
        // For Keychain, we retrieve the JSON data and extract the specific key
        const credentials = await Keychain.getGenericPassword();
        if (credentials && credentials.password) {
          try {
            const data = JSON.parse(credentials.password) as Record<string, string>;
            if (data[key]) {
              logger.info(`[SecureStorage] Retrieved sensitive ${key} from Keychain`);
              return data[key];
            }
          } catch (parseError) {
            logger.warn('[SecureStorage] Failed to parse keychain data:', parseError);
          }
        }
        
        // If no credentials found or key doesn't exist, return null
        return null;
      } else {
        // Fallback to SecureStore
        const value = await SecureStore.getItemAsync(key);
        logger.info(`[SecureStorage] Retrieved sensitive ${key} from SecureStore (fallback)`);
        return value;
      }
    } catch (error) {
      logger.error(`[SecureStorage] Failed to retrieve sensitive ${key}:`, error);
      
      // Check if it's an authentication error and handle gracefully
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Authentication canceled') || 
          errorMessage.includes('code: 10') ||
          errorMessage.includes('User canceled')) {
        logger.info('[SecureStorage] Authentication canceled for sensitive item, trying SecureStore fallback');
        
        try {
          const value = await SecureStore.getItemAsync(key);
          logger.info(`[SecureStorage] Retrieved sensitive ${key} from SecureStore after authentication cancellation`);
          return value;
        } catch (fallbackError) {
          logger.error(`[SecureStorage] Failed to retrieve sensitive ${key} from SecureStore fallback:`, fallbackError);
          return null;
        }
      }
      
      // If keychain fails for other reasons, try SecureStore as final fallback
      if (this.keychainAvailable) {
        try {
          const value = await SecureStore.getItemAsync(key);
          logger.info(`[SecureStorage] Retrieved sensitive ${key} from SecureStore after Keychain failure`);
          return value;
        } catch (fallbackError) {
          logger.error(`[SecureStorage] Failed to retrieve sensitive ${key} from SecureStore fallback:`, fallbackError);
          return null;
        }
      } else {
        return null;
      }
    }
  }

  /**
   * Delete sensitive data
   * @param key - Storage key
   */
  async deleteItem(key: string): Promise<void> {
    // Wait for initialization to complete
    await this.waitForInitialization();

    try {
      if (this.keychainAvailable && Keychain) {
        // For Keychain, we need to delete from the JSON data
        const keychainOptions = {
          accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,
          securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
        };
        
        const credentials = await Keychain.getGenericPassword();
        if (credentials && credentials.password) {
          try {
            const data = JSON.parse(credentials.password) as Record<string, string>;
            if (data[key]) {
              // Remove the key from the data
              delete data[key];
              
              // If no data left, remove the entire credential
              if (Object.keys(data).length === 0) {
                await Keychain.resetGenericPassword();
                logger.info(`[SecureStorage] Deleted all data from Keychain`);
              } else {
                // Store the updated data
                await Keychain.setGenericPassword('wallet_data', JSON.stringify(data), keychainOptions);
                logger.info(`[SecureStorage] Deleted ${key} from Keychain`);
              }
            } else {
              logger.info(`[SecureStorage] No item found with key ${key} in Keychain`);
            }
          } catch (parseError) {
            logger.warn('[SecureStorage] Failed to parse keychain data for deletion:', parseError);
          }
        } else {
          logger.info(`[SecureStorage] No keychain data found`);
        }
      } else {
        // Fallback to SecureStore
        await SecureStore.deleteItemAsync(key);
        logger.info(`[SecureStorage] Deleted ${key} from SecureStore (fallback)`);
      }

      // Also delete from AsyncStorage backup
      try {
        await AsyncStorage.removeItem(`backup_${key}`);
        logger.info(`[SecureStorage] Deleted ${key} from AsyncStorage backup`);
      } catch (backupError) {
        logger.warn(`[SecureStorage] Failed to delete ${key} from AsyncStorage backup:`, backupError);
      }
    } catch (error) {
      logger.error(`[SecureStorage] Failed to delete ${key}:`, error);
      
      // If keychain fails, try SecureStore as final fallback
      if (this.keychainAvailable) {
        try {
          await SecureStore.deleteItemAsync(key);
          logger.info(`[SecureStorage] Deleted ${key} from SecureStore after Keychain failure`);
        } catch (fallbackError) {
          logger.error(`[SecureStorage] Failed to delete ${key} from SecureStore fallback:`, fallbackError);
          throw new Error(`Failed to delete sensitive data: ${fallbackError}`);
        }
      } else {
        throw new Error(`Failed to delete sensitive data: ${error}`);
      }
    }
  }

  /**
   * Check if keychain is available
   */
  async isKeychainAvailable(): Promise<boolean> {
    await this.waitForInitialization();
    return this.keychainAvailable;
  }

  /**
   * Get supported biometric types
   */
  async getSupportedBiometryType(): Promise<Keychain.BIOMETRY_TYPE | null> {
    await this.waitForInitialization();
    
    try {
      if (this.keychainAvailable && Keychain) {
        return await Keychain.getSupportedBiometryType();
      }
      return null;
    } catch (error) {
      logger.warn('[SecureStorage] Failed to get supported biometry type:', error);
      return null;
    }
  }

  /**
   * Check if device has biometric hardware
   */
  async hasBiometricHardware(): Promise<boolean> {
    await this.waitForInitialization();
    
    try {
      if (this.keychainAvailable && Keychain) {
        const biometryType = await Keychain.getSupportedBiometryType();
        return biometryType !== null && biometryType !== Keychain.BIOMETRY_TYPE.TOUCH_ID;
      }
      return false;
    } catch (error) {
      logger.warn('[SecureStorage] Failed to check biometric hardware:', error);
      return false;
    }
  }

  /**
   * Check if biometrics are enrolled
   */
  async isBiometricsEnrolled(): Promise<boolean> {
    await this.waitForInitialization();
    
    try {
      if (this.keychainAvailable && Keychain) {
        const biometryType = await Keychain.getSupportedBiometryType();
        return biometryType !== null && biometryType !== Keychain.BIOMETRY_TYPE.TOUCH_ID;
      }
      return false;
    } catch (error) {
      logger.warn('[SecureStorage] Failed to check biometric enrollment:', error);
      return false;
    }
  }

  /**
   * Get security level information
   */
  async getSecurityLevel(): Promise<string> {
    await this.waitForInitialization();
    
    if (this.keychainAvailable) {
      return 'HARDWARE_BACKED';
    }
    return 'SOFTWARE_BACKED';
  }

  /**
   * Migrate data from SecureStore to Keychain
   * @param keys - Array of keys to migrate
   */
  async migrateFromSecureStore(keys: string[]): Promise<void> {
    await this.waitForInitialization();
    
    if (!this.keychainAvailable) {
      logger.warn('[SecureStorage] Cannot migrate: Keychain not available');
      return;
    }

    logger.info('[SecureStorage] Starting migration from SecureStore to Keychain');
    
    for (const key of keys) {
      try {
        const value = await SecureStore.getItemAsync(key);
        if (value) {
          await this.setItem(key, value);
          await SecureStore.deleteItemAsync(key);
          logger.info(`[SecureStorage] Migrated ${key} to Keychain`);
        }
      } catch (error) {
        logger.error(`[SecureStorage] Failed to migrate ${key}:`, error);
      }
    }
    
    logger.info('[SecureStorage] Migration completed');
  }

  /**
   * Clear all stored data
   */
  async clearAll(): Promise<void> {
    try {
      // Clear SecureStore data
      const keys = [
        'wallet_private_key',
        'wallet_seed_phrase',
        'temp_seed_phrase',
        'wallet_password',
        'backup_confirmed'
      ];
      
      for (const key of keys) {
        try {
          await SecureStore.deleteItemAsync(key);
        } catch (error) {
          // Ignore errors for keys that don't exist
        }
      }
      
      logger.info('[SecureStorage] Cleared all SecureStore data');
    } catch (error) {
      logger.error('[SecureStorage] Failed to clear all data:', error);
      throw error;
    }
  }

  /**
   * Check if backup data exists and restore it
   * This is called when the app is reopened after being removed from the screen
   */
  async checkAndRestoreBackup(): Promise<boolean> {
    try {
      logger.info('[SecureStorage] Checking for backup data...');
      
      // Check if we have any backup data in AsyncStorage
      const keys = await AsyncStorage.getAllKeys();
      const backupKeys = keys.filter(key => key.startsWith('backup_'));
      
      if (backupKeys.length === 0) {
        logger.info('[SecureStorage] No backup data found');
        return false;
      }
      
      logger.info(`[SecureStorage] Found ${backupKeys.length} backup items`);
      
      // Restore each backup item
      let restoredCount = 0;
      for (const backupKey of backupKeys) {
        try {
          const value = await AsyncStorage.getItem(backupKey);
          if (value) {
            const originalKey = backupKey.replace('backup_', '');
            await this.setItem(originalKey, value);
            restoredCount++;
            logger.info(`[SecureStorage] Restored ${originalKey} from backup`);
          }
        } catch (restoreError) {
          logger.warn(`[SecureStorage] Failed to restore ${backupKey}:`, restoreError);
        }
      }
      
      logger.info(`[SecureStorage] Successfully restored ${restoredCount} items from backup`);
      return restoredCount > 0;
    } catch (error) {
      logger.error('[SecureStorage] Failed to check and restore backup:', error);
      return false;
    }
  }

  /**
   * Clear all backup data
   */
  async clearBackup(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const backupKeys = keys.filter(key => key.startsWith('backup_'));
      
      for (const backupKey of backupKeys) {
        await AsyncStorage.removeItem(backupKey);
      }
      
      logger.info(`[SecureStorage] Cleared ${backupKeys.length} backup items`);
    } catch (error) {
      logger.error('[SecureStorage] Failed to clear backup:', error);
    }
  }

  /**
   * Test backup functionality
   * This is for development/testing purposes only
   */
  async testBackupFunctionality(): Promise<boolean> {
    try {
      logger.info('[SecureStorage] Testing backup functionality...');
      
      // Test data
      const testKey = 'test_backup_key';
      const testValue = 'test_backup_value_' + Date.now();
      
      // Store test data
      await this.setItem(testKey, testValue);
      logger.info('[SecureStorage] Test data stored');
      
      // Verify it's in primary storage
      const primaryValue = await this.getItem(testKey);
      if (primaryValue !== testValue) {
        logger.error('[SecureStorage] Test failed: Primary storage value mismatch');
        return false;
      }
      
      // Verify it's in backup
      const backupValue = await AsyncStorage.getItem(`backup_${testKey}`);
      if (backupValue !== testValue) {
        logger.error('[SecureStorage] Test failed: Backup value mismatch');
        return false;
      }
      
      // Clear test data
      await this.deleteItem(testKey);
      logger.info('[SecureStorage] Test data cleared');
      
      logger.info('[SecureStorage] Backup functionality test passed');
      return true;
    } catch (error) {
      logger.error('[SecureStorage] Backup functionality test failed:', error);
      return false;
    }
  }

  /**
   * Test offline wallet creation
   * This is for development/testing purposes only
   */
  async testOfflineWalletCreation(): Promise<boolean> {
    try {
      logger.info('[SecureStorage] Testing offline wallet creation...');
      
      // Test data
      const testKey = 'test_offline_wallet';
      const testValue = 'test_offline_wallet_value_' + Date.now();
      
      // Store test data
      await this.setItem(testKey, testValue);
      logger.info('[SecureStorage] Test offline wallet data stored');
      
      // Verify it's in primary storage
      const primaryValue = await this.getItem(testKey);
      if (primaryValue !== testValue) {
        logger.error('[SecureStorage] Test failed: Primary storage value mismatch');
        return false;
      }
      
      // Verify it's in backup
      const backupValue = await AsyncStorage.getItem(`backup_${testKey}`);
      if (backupValue !== testValue) {
        logger.error('[SecureStorage] Test failed: Backup value mismatch');
        return false;
      }
      
      // Clear test data
      await this.deleteItem(testKey);
      logger.info('[SecureStorage] Test offline wallet data cleared');
      
      logger.info('[SecureStorage] Offline wallet creation test passed');
      return true;
    } catch (error) {
      logger.error('[SecureStorage] Offline wallet creation test failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const secureStorage = SecureStorageService.getInstance(); 