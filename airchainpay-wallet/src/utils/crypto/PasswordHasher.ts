import CryptoJS from 'crypto-js';
import { logger } from '../Logger';

/**
 * Password Hasher Utility
 * 
 * Implements secure password hashing with salt using crypto-js.
 * Provides bcrypt-like functionality for React Native with:
 * - Unique salt generation for each password
 * - Configurable iteration count for security
 * - Secure comparison without timing attacks
 * - Migration support for existing plain text passwords
 */
export class PasswordHasher {
  // Security configuration
  private static readonly SALT_LENGTH = 32; // 256 bits
  private static readonly HASH_LENGTH = 64; // 512 bits
  private static readonly ITERATIONS = 100000; // High iteration count for security
  private static readonly VERSION = 1;
  private static readonly HASH_PREFIX = 'v1$'; // Version prefix for migration

  /**
   * Generate a cryptographically secure random salt
   */
  private static generateSalt(): string {
    return CryptoJS.lib.WordArray.random(this.SALT_LENGTH).toString();
  }

  /**
   * Hash a password with salt using PBKDF2
   * @param password - Plain text password
   * @param salt - Salt (optional, will generate if not provided)
   * @returns Hashed password with salt and metadata
   */
  static hashPassword(password: string, salt?: string): string {
    try {
      // Generate salt if not provided
      const generatedSalt = salt || this.generateSalt();
      
      // Use PBKDF2 for secure password hashing
      const hash = CryptoJS.PBKDF2(password, generatedSalt, {
        keySize: this.HASH_LENGTH / 32, // 64 bytes = 512 bits
        iterations: this.ITERATIONS,
        hasher: CryptoJS.algo.SHA256
      });

      // Create hash string with metadata
      const hashString = `${this.HASH_PREFIX}${this.ITERATIONS}$${generatedSalt}$${hash.toString()}`;
      
      logger.info('[PasswordHasher] Password hashed successfully');
      return hashString;
    } catch (error) {
      logger.error('[PasswordHasher] Failed to hash password:', error);
      throw new Error('Failed to hash password');
    }
  }

  /**
   * Verify a password against a stored hash
   * @param password - Plain text password to verify
   * @param storedHash - Stored hash string
   * @returns True if password matches, false otherwise
   */
  static verifyPassword(password: string, storedHash: string): boolean {
    try {
      // Check if this is a legacy plain text password
      if (!storedHash.startsWith(this.HASH_PREFIX)) {
        logger.warn('[PasswordHasher] Legacy plain text password detected');
        return false; // Don't allow plain text passwords
      }

      // Parse the stored hash
      const parts = storedHash.split('$');
      if (parts.length !== 4) {
        logger.error('[PasswordHasher] Invalid hash format');
        return false;
      }

      const version = parts[0];
      const iterations = parseInt(parts[1], 10);
      const salt = parts[2];
      const storedHashValue = parts[3];

      // Verify version
      if (version !== this.HASH_PREFIX.slice(0, -1)) {
        logger.error('[PasswordHasher] Unsupported hash version');
        return false;
      }

      // Hash the provided password with the same salt and iterations
      const hash = CryptoJS.PBKDF2(password, salt, {
        keySize: this.HASH_LENGTH / 32,
        iterations: iterations,
        hasher: CryptoJS.algo.SHA256
      });

      const hashValue = hash.toString();

      // Use constant-time comparison to prevent timing attacks
      const isValid = this.constantTimeCompare(hashValue, storedHashValue);
      
      logger.info('[PasswordHasher] Password verification completed', { isValid });
      return isValid;
    } catch (error) {
      logger.error('[PasswordHasher] Failed to verify password:', error);
      return false;
    }
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   * @param a - First string
   * @param b - Second string
   * @returns True if strings are equal, false otherwise
   */
  private static constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  /**
   * Check if a stored hash is in the new secure format
   * @param storedHash - Hash to check
   * @returns True if hash is in secure format, false if plain text
   */
  static isSecureHash(storedHash: string): boolean {
    return storedHash.startsWith(this.HASH_PREFIX);
  }

  /**
   * Migrate a plain text password to secure hash format
   * @param plainTextPassword - Current plain text password
   * @returns New secure hash
   */
  static migratePlainTextPassword(plainTextPassword: string): string {
    logger.info('[PasswordHasher] Migrating plain text password to secure hash');
    return this.hashPassword(plainTextPassword);
  }

  /**
   * Generate a secure random password
   * @param length - Password length (default: 16)
   * @returns Secure random password
   */
  static generateSecurePassword(length: number = 16): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    
    // Ensure at least one character from each required category
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]; // Uppercase
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]; // Lowercase
    password += '0123456789'[Math.floor(Math.random() * 10)]; // Number
    password += '!@#$%^&*'[Math.floor(Math.random() * 8)]; // Special character
    
    // Fill the rest with random characters
    for (let i = 4; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
    
    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Validate password strength
   * @param password - Password to validate
   * @returns Validation result with details
   */
  static validatePasswordStrength(password: string): {
    isValid: boolean;
    score: number;
    feedback: string[];
  } {
    const feedback: string[] = [];
    let score = 0;

    // Length check
    if (password.length < 8) {
      feedback.push('Password must be at least 8 characters long');
    } else {
      score += Math.min(password.length - 8, 4); // Up to 4 points for length
    }

    // Character variety checks
    if (/[A-Z]/.test(password)) {
      score += 1;
    } else {
      feedback.push('Include at least one uppercase letter');
    }

    if (/[a-z]/.test(password)) {
      score += 1;
    } else {
      feedback.push('Include at least one lowercase letter');
    }

    if (/[0-9]/.test(password)) {
      score += 1;
    } else {
      feedback.push('Include at least one number');
    }

    if (/[^A-Za-z0-9]/.test(password)) {
      score += 1;
    } else {
      feedback.push('Include at least one special character');
    }

    // Common password check (basic)
    const commonPasswords = ['password', '123456', 'qwerty', 'admin', 'letmein'];
    if (commonPasswords.includes(password.toLowerCase())) {
      score -= 2;
      feedback.push('Avoid common passwords');
    }

    const isValid = score >= 3 && password.length >= 8;

    return {
      isValid,
      score: Math.max(0, score),
      feedback
    };
  }

  /**
   * Get hash metadata for debugging/migration
   * @param storedHash - Hash to analyze
   * @returns Hash metadata
   */
  static getHashMetadata(storedHash: string): {
    version: string;
    iterations: number;
    saltLength: number;
    hashLength: number;
    isSecure: boolean;
  } {
    if (!this.isSecureHash(storedHash)) {
      return {
        version: 'legacy',
        iterations: 0,
        saltLength: 0,
        hashLength: 0,
        isSecure: false
      };
    }

    const parts = storedHash.split('$');
    return {
      version: parts[0],
      iterations: parseInt(parts[1], 10),
      saltLength: parts[2].length,
      hashLength: parts[3].length,
      isSecure: true
    };
  }
} 