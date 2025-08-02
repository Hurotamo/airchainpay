import * as Keychain from 'react-native-keychain';
import * as SecureStore from 'expo-secure-store';
import { logger } from './Logger';

/**
 * Secure Storage Service
 * 
 * Implements hardware-backed storage using react-native-keychain with fallback to expo-secure-store.
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
        const testKey = '__test_keychain_access__';
        const testValue = 'test_value_' + Date.now();
        
        try {
          await Keychain.setGenericPassword(testKey, testValue, {
            accessControl: Keychain.ACCESS_CONTROL.DEVICE_PASSCODE,
            accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,
            securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
          });
          
          // Try to retrieve the test value
          const credentials = await Keychain.getGenericPassword({
            accessControl: Keychain.ACCESS_CONTROL.DEVICE_PASSCODE,
          });
          
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
   * Store sensitive data securely (no authentication required)
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
          accessControl: Keychain.ACCESS_CONTROL.DEVICE_PASSCODE,
          accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,
          securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
        };

        // For Keychain, we store all data in a single credential with JSON structure
        // First, get existing data
        let existingData = {};
        try {
          const credentials = await Keychain.getGenericPassword(keychainOptions);
          if (credentials && credentials.password) {
            existingData = JSON.parse(credentials.password);
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
   * Retrieve sensitive data securely (no authentication required)
   * @param key - Storage key
   */
  async getItem(key: string): Promise<string | null> {
    // Wait for initialization to complete
    await this.waitForInitialization();

    try {
      if (this.keychainAvailable && Keychain) {
        // Use hardware-backed keychain storage without authentication
        const keychainOptions = {
          accessControl: Keychain.ACCESS_CONTROL.DEVICE_PASSCODE,
        };

        // For Keychain, we retrieve the JSON data and extract the specific key
        const credentials = await Keychain.getGenericPassword(keychainOptions);
        if (credentials && credentials.password) {
          try {
            const data = JSON.parse(credentials.password);
            if (data[key]) {
              logger.info(`[SecureStorage] Retrieved ${key} from Keychain`);
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
        logger.info(`[SecureStorage] Retrieved ${key} from SecureStore (fallback)`);
        return value;
      }
    } catch (error) {
      logger.error(`[SecureStorage] Failed to retrieve ${key}:`, error);
      
      // If keychain fails, try SecureStore as final fallback
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
        // Use hardware-backed keychain storage with authentication
        const keychainOptions = {
          accessControl: useBiometrics 
            ? Keychain.ACCESS_CONTROL.BIOMETRY_ANY 
            : Keychain.ACCESS_CONTROL.DEVICE_PASSCODE,
        };

        // For Keychain, we retrieve the JSON data and extract the specific key
        const credentials = await Keychain.getGenericPassword(keychainOptions);
        if (credentials && credentials.password) {
          try {
            const data = JSON.parse(credentials.password);
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
      
      // If keychain fails, try SecureStore as final fallback
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
          accessControl: Keychain.ACCESS_CONTROL.DEVICE_PASSCODE,
        };
        
        const credentials = await Keychain.getGenericPassword(keychainOptions);
        if (credentials && credentials.password) {
          try {
            const data = JSON.parse(credentials.password);
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
}

// Export singleton instance
export const secureStorage = SecureStorageService.getInstance(); 