import * as SecureStore from 'expo-secure-store';
import { secureStorage } from './SecureStorageService';
import { logger } from './Logger';

/**
 * Storage Migration Utility
 * 
 * Helps migrate existing wallet data from SecureStore to hardware-backed storage
 * and provides migration status tracking.
 */
export class StorageMigration {
  private static readonly MIGRATION_STATUS_KEY = 'storage_migration_completed';
  private static readonly MIGRATION_VERSION_KEY = 'storage_migration_version';
  private static readonly CURRENT_MIGRATION_VERSION = '2.0.0';

  /**
   * Check if migration is needed
   */
  static async isMigrationNeeded(): Promise<boolean> {
    try {
      const migrationStatus = await SecureStore.getItemAsync(this.MIGRATION_STATUS_KEY);
      const migrationVersion = await SecureStore.getItemAsync(this.MIGRATION_VERSION_KEY);
      
      // Migration needed if:
      // 1. Migration status is not 'completed'
      // 2. Migration version is not current
      // 3. Keychain is available (we can upgrade)
      const keychainAvailable = await secureStorage.isKeychainAvailable();
      const needsMigration = migrationStatus !== 'completed' || 
                           migrationVersion !== this.CURRENT_MIGRATION_VERSION ||
                           keychainAvailable;
      
      logger.info('[StorageMigration] Migration check:', {
        migrationStatus,
        migrationVersion,
        currentVersion: this.CURRENT_MIGRATION_VERSION,
        keychainAvailable,
        needsMigration
      });
      
      return needsMigration;
    } catch (error) {
      logger.error('[StorageMigration] Failed to check migration status:', error);
      return true; // Assume migration is needed if we can't check
    }
  }

  /**
   * Perform migration from SecureStore to hardware-backed storage
   */
  static async migrateToHardwareStorage(): Promise<{
    success: boolean;
    migratedKeys: string[];
    errors: string[];
  }> {
    const migratedKeys: string[] = [];
    const errors: string[] = [];

    try {
      logger.info('[StorageMigration] Starting migration to hardware-backed storage');

      // Check if keychain is available
      const keychainAvailable = await secureStorage.isKeychainAvailable();
      if (!keychainAvailable) {
        logger.warn('[StorageMigration] Keychain not available, skipping migration');
        return {
          success: false,
          migratedKeys: [],
          errors: ['Keychain not available on this device']
        };
      }

      // Define keys to migrate
      const keysToMigrate = [
        'wallet_private_key',
        'wallet_seed_phrase',
        'temp_seed_phrase',
        'wallet_password',
        'backup_confirmed'
      ];

      // Migrate each key
      for (const key of keysToMigrate) {
        try {
          const value = await SecureStore.getItemAsync(key);
          if (value) {
            // Store in hardware-backed storage
            await secureStorage.setItem(key, value);
            
            // Verify migration
            const migratedValue = await secureStorage.getItem(key);
            if (migratedValue === value) {
              // Remove from SecureStore
              await SecureStore.deleteItemAsync(key);
              migratedKeys.push(key);
              logger.info(`[StorageMigration] Successfully migrated ${key}`);
            } else {
              errors.push(`Verification failed for ${key}`);
              logger.error(`[StorageMigration] Verification failed for ${key}`);
            }
          }
        } catch (error) {
          const errorMsg = `Failed to migrate ${key}: ${error}`;
          errors.push(errorMsg);
          logger.error(`[StorageMigration] ${errorMsg}`);
        }
      }

      // Mark migration as completed
      if (migratedKeys.length > 0) {
        await SecureStore.setItemAsync(this.MIGRATION_STATUS_KEY, 'completed');
        await SecureStore.setItemAsync(this.MIGRATION_VERSION_KEY, this.CURRENT_MIGRATION_VERSION);
        
        logger.info('[StorageMigration] Migration completed successfully', {
          migratedKeys,
          errors
        });
      }

      return {
        success: migratedKeys.length > 0,
        migratedKeys,
        errors
      };

    } catch (error) {
      logger.error('[StorageMigration] Migration failed:', error);
      return {
        success: false,
        migratedKeys,
        errors: [`Migration failed: ${error}`]
      };
    }
  }

  /**
   * Get migration status
   */
  static async getMigrationStatus(): Promise<{
    isCompleted: boolean;
    version: string | null;
    keychainAvailable: boolean;
    securityLevel: string;
  }> {
    try {
      const migrationStatus = await SecureStore.getItemAsync(this.MIGRATION_STATUS_KEY);
      const migrationVersion = await SecureStore.getItemAsync(this.MIGRATION_VERSION_KEY);
      
      const keychainAvailable = await secureStorage.isKeychainAvailable();
      const securityLevel = await secureStorage.getSecurityLevel();
      
      return {
        isCompleted: migrationStatus === 'completed',
        version: migrationVersion,
        keychainAvailable,
        securityLevel
      };
    } catch (error) {
      logger.error('[StorageMigration] Failed to get migration status:', error);
      
      const keychainAvailable = await secureStorage.isKeychainAvailable();
      const securityLevel = await secureStorage.getSecurityLevel();
      
      return {
        isCompleted: false,
        version: null,
        keychainAvailable,
        securityLevel
      };
    }
  }

  /**
   * Reset migration status (for testing or manual migration)
   */
  static async resetMigrationStatus(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(this.MIGRATION_STATUS_KEY);
      await SecureStore.deleteItemAsync(this.MIGRATION_VERSION_KEY);
      logger.info('[StorageMigration] Migration status reset');
    } catch (error) {
      logger.error('[StorageMigration] Failed to reset migration status:', error);
    }
  }

  /**
   * Get security improvement recommendations
   */
  static async getSecurityRecommendations(): Promise<string[]> {
    const recommendations: string[] = [];
    
    try {
      const status = await this.getMigrationStatus();
      
      if (!status.keychainAvailable) {
        recommendations.push('Enable biometric authentication on your device for maximum security');
      }
      
      if (!status.isCompleted) {
        recommendations.push('Migrate to hardware-backed storage for enhanced security');
      }
      
      if (status.securityLevel === 'SOFTWARE_BACKED') {
        recommendations.push('Consider upgrading to a device with hardware security module');
      }
      
      return recommendations;
    } catch (error) {
      logger.error('[StorageMigration] Failed to get security recommendations:', error);
      return ['Enable device security features for maximum protection'];
    }
  }

  /**
   * Validate migrated data integrity
   */
  static async validateMigrationIntegrity(): Promise<{
    isValid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];
    
    try {
      const keysToValidate = [
        'wallet_private_key',
        'wallet_seed_phrase',
        'wallet_password'
      ];

      for (const key of keysToValidate) {
        try {
          // Check if data exists in new storage
          const newValue = await secureStorage.getItem(key);
          if (!newValue) {
            // Check if data exists in old storage
            const oldValue = await SecureStore.getItemAsync(key);
            if (oldValue) {
              issues.push(`Data exists in old storage but not in new storage: ${key}`);
            }
          }
        } catch (error) {
          issues.push(`Failed to validate ${key}: ${error}`);
        }
      }

      return {
        isValid: issues.length === 0,
        issues
      };
    } catch (error) {
      logger.error('[StorageMigration] Failed to validate migration integrity:', error);
      return {
        isValid: false,
        issues: [`Validation failed: ${error}`]
      };
    }
  }
}

// Export migration utility
export const storageMigration = StorageMigration; 