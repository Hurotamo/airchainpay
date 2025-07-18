import { ethers } from 'ethers';
import * as CryptoJS from 'crypto-js';
import { logger } from '../Logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../../constants/AppConfig';
import { PasswordHasher } from './PasswordHasher';

interface EncryptedWallet {
  encryptedData: string;
  salt: string;
  iv: string;
  version: number;
  timestamp: number;
}

interface PasswordAttempt {
  timestamp: number;
  count: number;
}

export class WalletEncryption {
  private static readonly ITERATIONS = 100000;
  private static readonly KEY_SIZE = 256;
  private static readonly STORAGE_KEY_PREFIX = '@wallet_credentials_';
  private static readonly MAX_PASSWORD_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION = 300000;
  private static readonly VERSION = 1;

  private static async getPasswordAttempts(): Promise<PasswordAttempt> {
    try {
      const attempts = await AsyncStorage.getItem('@password_attempts');
      return attempts ? JSON.parse(attempts) : { timestamp: 0, count: 0 };
    } catch {
      return { timestamp: 0, count: 0 };
    }
  }

  private static async updatePasswordAttempts(success: boolean): Promise<void> {
    try {
      const now = Date.now();
      const attempts = await this.getPasswordAttempts();

      if (now - attempts.timestamp > this.LOCKOUT_DURATION) {
        await AsyncStorage.setItem('@password_attempts', JSON.stringify({
          timestamp: now,
          count: success ? 0 : 1
        }));
        return;
      }

      const newCount = success ? 0 : attempts.count + 1;
      await AsyncStorage.setItem('@password_attempts', JSON.stringify({
        timestamp: now,
        count: newCount
      }));

      if (newCount >= this.MAX_PASSWORD_ATTEMPTS) {
        throw new Error(`Too many failed attempts. Please try again in ${Math.ceil(this.LOCKOUT_DURATION / 60000)} minutes.`);
      }
    } catch (error) {
      logger.error('Error updating password attempts:', error);
      throw error;
    }
  }

  /**
   * Encrypt wallet credentials (seed phrase or private key)
   */
  static async encryptCredentials(
    credentials: string,
    password: string,
    type: 'seedphrase' | 'privatekey'
  ): Promise<void> {
    try {
      const salt = CryptoJS.lib.WordArray.random(32).toString();
      const iv = CryptoJS.lib.WordArray.random(16).toString();

      const key = CryptoJS.PBKDF2(password, salt, {
        keySize: this.KEY_SIZE / 32,
        iterations: this.ITERATIONS,
      });

      const entropy = CryptoJS.lib.WordArray.random(32).toString();
      const dataToEncrypt = JSON.stringify({
        credentials,
        entropy,
        timestamp: Date.now()
      });

      const encrypted = CryptoJS.AES.encrypt(dataToEncrypt, key, {
        iv: CryptoJS.enc.Hex.parse(iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });

      const encryptedWallet: EncryptedWallet = {
        encryptedData: encrypted.toString(),
        salt,
        iv,
        version: this.VERSION,
        timestamp: Date.now()
      };

      await AsyncStorage.setItem(
        this.STORAGE_KEY_PREFIX + type,
        JSON.stringify(encryptedWallet)
      );
    } catch (error) {
      logger.error('Error encrypting credentials:', error);
      throw new Error('Failed to encrypt wallet credentials');
    }
  }

  /**
   * Decrypt and retrieve wallet credentials
   */
  static async retrieveCredentials(
    password: string,
    type: 'seedphrase' | 'privatekey'
  ): Promise<string> {
    try {
      const attempts = await this.getPasswordAttempts();
      const now = Date.now();
      
      if (attempts.count >= this.MAX_PASSWORD_ATTEMPTS && 
          now - attempts.timestamp < this.LOCKOUT_DURATION) {
        const remainingTime = Math.ceil((this.LOCKOUT_DURATION - (now - attempts.timestamp)) / 60000);
        throw new Error(`Too many failed attempts. Please try again in ${remainingTime} minutes.`);
      }

      const storedData = await AsyncStorage.getItem(this.STORAGE_KEY_PREFIX + type);
      if (!storedData) {
        throw new Error('No stored credentials found');
      }

      const encryptedWallet: EncryptedWallet = JSON.parse(storedData);
      const { encryptedData, salt, iv, version } = encryptedWallet;

      const key = CryptoJS.PBKDF2(password, salt, {
        keySize: this.KEY_SIZE / 32,
        iterations: this.ITERATIONS,
      });

      const decrypted = CryptoJS.AES.decrypt(encryptedData, key, {
        iv: CryptoJS.enc.Hex.parse(iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });

      const decryptedData = decrypted.toString(CryptoJS.enc.Utf8);
      if (!decryptedData) {
        await this.updatePasswordAttempts(false);
        throw new Error('Invalid password');
      }

      const { credentials } = JSON.parse(decryptedData);
      await this.updatePasswordAttempts(true);

      return credentials;
    } catch (error) {
      logger.error('Error retrieving credentials:', error);
      throw error;
    }
  }

  /**
   * Change wallet encryption password
   */
  static async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    try {
      const types: ('seedphrase' | 'privatekey')[] = ['seedphrase', 'privatekey'];
      const storedCredentials: Record<string, string> = {};

      for (const type of types) {
        try {
          const credentials = await this.retrieveCredentials(currentPassword, type);
          if (credentials) {
            storedCredentials[type] = credentials;
          }
        } catch (error) {
          continue;
        }
      }

      if (Object.keys(storedCredentials).length === 0) {
        throw new Error('Invalid current password');
      }

      for (const [type, credentials] of Object.entries(storedCredentials)) {
        await this.encryptCredentials(
          credentials,
          newPassword,
          type as 'seedphrase' | 'privatekey'
        );
      }

      await AsyncStorage.setItem('@password_attempts', JSON.stringify({
        timestamp: Date.now(),
        count: 0
      }));
    } catch (error) {
      logger.error('Error changing password:', error);
      throw new Error('Failed to change password');
    }
  }

  /**
   * Verify if password is correct without revealing credentials
   * This method tries to decrypt stored credentials to verify the password
   */
  static async verifyPassword(password: string): Promise<boolean> {
    try {
      const attempts = await this.getPasswordAttempts();
      const now = Date.now();
      
      if (attempts.count >= this.MAX_PASSWORD_ATTEMPTS && 
          now - attempts.timestamp < this.LOCKOUT_DURATION) {
        return false;
      }

      const types: ('seedphrase' | 'privatekey')[] = ['seedphrase', 'privatekey'];
      
      for (const type of types) {
        try {
          await this.retrieveCredentials(password, type);
          await this.updatePasswordAttempts(true);
          return true;
        } catch (error) {
          continue;
        }
      }

      await this.updatePasswordAttempts(false);
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Verify password using the new hashing system
   * This method is used for wallet password verification
   */
  static async verifyPasswordHash(password: string, storedHash: string): Promise<boolean> {
    try {
      // Check if this is a legacy plain text password
      if (!PasswordHasher.isSecureHash(storedHash)) {
        logger.warn('[WalletEncryption] Legacy plain text password detected');
        return false; // Don't allow plain text passwords
      }

      // Verify against the stored hash
      const isValid = PasswordHasher.verifyPassword(password, storedHash);
      
      if (isValid) {
        logger.info('[WalletEncryption] Password verification successful');
      } else {
        logger.warn('[WalletEncryption] Password verification failed');
      }
      
      return isValid;
    } catch (error) {
      logger.error('[WalletEncryption] Failed to verify password hash:', error);
      return false;
    }
  }
} 