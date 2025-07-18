import { logger } from '../Logger';
import { secureStorage } from '../SecureStorageService';
import { PasswordHasher } from './PasswordHasher';

/**
 * Password Migration Utility
 * 
 * Handles migration from plain text passwords to secure hashed passwords.
 * Provides safe migration with rollback capabilities and user notification.
 */
export class PasswordMigration {
  private static readonly MIGRATION_STATUS_KEY = 'password_migration_completed';
  private static readonly MIGRATION_VERSION_KEY = 'password_migration_version';
  private static readonly CURRENT_MIGRATION_VERSION = '2.0.0';
  private static readonly WALLET_PASSWORD_KEY = 'wallet_password';

  /**
   * Check if password migration is needed
   */
  static async isMigrationNeeded(): Promise<boolean> {
    try {
      const migrationStatus = await secureStorage.getItem(this.MIGRATION_STATUS_KEY);
      const migrationVersion = await secureStorage.getItem(this.MIGRATION_VERSION_KEY);
      const storedPassword = await secureStorage.getItem(this.WALLET_PASSWORD_KEY);
      
      // Migration needed if:
      // 1. Migration status is not 'completed'
      // 2. Migration version is not current
      // 3. Stored password exists and is not in secure format
             const needsMigration = migrationStatus !== 'completed' || 
                            migrationVersion !== this.CURRENT_MIGRATION_VERSION ||
                            (storedPassword !== null && !PasswordHasher.isSecureHash(storedPassword));
      
      logger.info('[PasswordMigration] Migration check:', {
        migrationStatus,
        migrationVersion,
        currentVersion: this.CURRENT_MIGRATION_VERSION,
        hasStoredPassword: !!storedPassword,
        isSecureHash: storedPassword ? PasswordHasher.isSecureHash(storedPassword) : false,
        needsMigration
      });
      
      return needsMigration;
    } catch (error) {
      logger.error('[PasswordMigration] Failed to check migration status:', error);
      return true; // Assume migration is needed if we can't check
    }
  }

  /**
   * Perform password migration from plain text to secure hash
   */
  static async migratePasswords(): Promise<{
    success: boolean;
    migratedCount: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let migratedCount = 0;

    try {
      logger.info('[PasswordMigration] Starting password migration');

      // Check if there's a stored password
      const storedPassword = await secureStorage.getItem(this.WALLET_PASSWORD_KEY);
      
      if (!storedPassword) {
        logger.info('[PasswordMigration] No stored password found, migration not needed');
        await this.markMigrationComplete();
        return {
          success: true,
          migratedCount: 0,
          errors: []
        };
      }

      // Check if password is already in secure format
      if (PasswordHasher.isSecureHash(storedPassword)) {
        logger.info('[PasswordMigration] Password already in secure format');
        await this.markMigrationComplete();
        return {
          success: true,
          migratedCount: 0,
          errors: []
        };
      }

      
      logger.warn('[PasswordMigration] Plain text password detected, migration requires user interaction');
      
      return {
        success: false,
        migratedCount: 0,
        errors: ['Password migration requires user interaction. Please re-enter your password.']
      };

    } catch (error) {
      const errorMsg = `Migration failed: ${error}`;
      errors.push(errorMsg);
      logger.error(`[PasswordMigration] ${errorMsg}`);
      return {
        success: false,
        migratedCount: 0,
        errors
      };
    }
  }

  /**
   * Migrate a specific password with user interaction
   * @param plainTextPassword - The current plain text password
   * @returns Success status and any errors
   */
  static async migrateUserPassword(plainTextPassword: string): Promise<{
    success: boolean;
    errors: string[];
  }> {
    try {
      logger.info('[PasswordMigration] Migrating user password to secure hash');

      // Hash the plain text password
      const hashedPassword = PasswordHasher.hashPassword(plainTextPassword);
      
      // Store the hashed password
      await secureStorage.setItem(this.WALLET_PASSWORD_KEY, hashedPassword);
      
      // Mark migration as complete
      await this.markMigrationComplete();
      
      logger.info('[PasswordMigration] Password migration completed successfully');
      
      return {
        success: true,
        errors: []
      };
    } catch (error) {
      const errorMsg = `Failed to migrate password: ${error}`;
      logger.error(`[PasswordMigration] ${errorMsg}`);
      return {
        success: false,
        errors: [errorMsg]
      };
    }
  }

  /**
   * Mark migration as complete
   */
  private static async markMigrationComplete(): Promise<void> {
    try {
      await secureStorage.setItem(this.MIGRATION_STATUS_KEY, 'completed');
      await secureStorage.setItem(this.MIGRATION_VERSION_KEY, this.CURRENT_MIGRATION_VERSION);
      logger.info('[PasswordMigration] Migration marked as complete');
    } catch (error) {
      logger.error('[PasswordMigration] Failed to mark migration complete:', error);
      throw error;
    }
  }

  /**
   * Get migration status for debugging
   */
  static async getMigrationStatus(): Promise<{
    isCompleted: boolean;
    version: string | null;
    hasStoredPassword: boolean;
    isSecureHash: boolean;
  }> {
    try {
      const migrationStatus = await secureStorage.getItem(this.MIGRATION_STATUS_KEY);
      const migrationVersion = await secureStorage.getItem(this.MIGRATION_VERSION_KEY);
      const storedPassword = await secureStorage.getItem(this.WALLET_PASSWORD_KEY);
      
      return {
        isCompleted: migrationStatus === 'completed',
        version: migrationVersion,
        hasStoredPassword: !!storedPassword,
        isSecureHash: storedPassword ? PasswordHasher.isSecureHash(storedPassword) : false
      };
    } catch (error) {
      logger.error('[PasswordMigration] Failed to get migration status:', error);
      return {
        isCompleted: false,
        version: null,
        hasStoredPassword: false,
        isSecureHash: false
      };
    }
  }

  /**
   * Reset migration status (for testing/debugging)
   */
  static async resetMigrationStatus(): Promise<void> {
    try {
      await secureStorage.deleteItem(this.MIGRATION_STATUS_KEY);
      await secureStorage.deleteItem(this.MIGRATION_VERSION_KEY);
      logger.info('[PasswordMigration] Migration status reset');
    } catch (error) {
      logger.error('[PasswordMigration] Failed to reset migration status:', error);
      throw error;
    }
  }

  /**
   * Validate password strength and provide feedback
   */
  static validatePassword(password: string): {
    isValid: boolean;
    score: number;
    feedback: string[];
    suggestions: string[];
  } {
    const validation = PasswordHasher.validatePasswordStrength(password);
    const suggestions: string[] = [];

    if (validation.score < 3) {
      suggestions.push('Consider using a longer password with more character variety');
    }
    if (password.length < 12) {
      suggestions.push('A password of 12+ characters is recommended for maximum security');
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      suggestions.push('Special characters make passwords harder to guess');
    }

    return {
      ...validation,
      suggestions
    };
  }

  /**
   * Generate a secure password suggestion
   */
  static generateSecurePassword(): string {
    return PasswordHasher.generateSecurePassword(16);
  }
} 