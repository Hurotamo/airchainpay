import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './Logger';

const SECURE_STORE_SIZE_LIMIT = 2048; // 2KB limit for SecureStore

export class StorageManager {
  /**
   * Store data, automatically choosing between SecureStore and AsyncStorage
   * based on data size and sensitivity
   */
  static async setItem(
    key: string, 
    value: string, 
    options: { 
      useSecureStore?: boolean; 
      sensitive?: boolean;
    } = {}
  ): Promise<void> {
    const { useSecureStore = false, sensitive = false } = options;
    const sizeInBytes = new Blob([value]).size;
    
    // Use SecureStore for sensitive data or if explicitly requested
    if (sensitive || useSecureStore) {
      if (sizeInBytes > SECURE_STORE_SIZE_LIMIT) {
        logger.warn(`[StorageManager] Data for key '${key}' is ${sizeInBytes} bytes, which exceeds SecureStore limit. Using AsyncStorage instead.`);
        await AsyncStorage.setItem(key, value);
      } else {
        await SecureStore.setItemAsync(key, value);
      }
    } else {
      // Use AsyncStorage for non-sensitive data
      await AsyncStorage.setItem(key, value);
    }
  }

  /**
   * Get data, trying SecureStore first, then AsyncStorage
   */
  static async getItem(key: string): Promise<string | null> {
    try {
      // Try SecureStore first
      const secureValue = await SecureStore.getItemAsync(key);
      if (secureValue !== null) {
        return secureValue;
      }
      
      // Fallback to AsyncStorage
      const asyncValue = await AsyncStorage.getItem(key);
      return asyncValue;
    } catch (error) {
      logger.error(`[StorageManager] Failed to get item ${key}:`, error);
      return null;
    }
  }

  /**
   * Remove data from both SecureStore and AsyncStorage
   */
  static async removeItem(key: string): Promise<void> {
    try {
      await Promise.all([
        SecureStore.deleteItemAsync(key),
        AsyncStorage.removeItem(key)
      ]);
    } catch (error) {
      logger.error(`[StorageManager] Failed to remove item ${key}:`, error);
    }
  }

  /**
   * Check if data size is within SecureStore limits
   */
  static isWithinSecureStoreLimit(data: string): boolean {
    const sizeInBytes = new Blob([data]).size;
    return sizeInBytes <= SECURE_STORE_SIZE_LIMIT;
  }

  /**
   * Get the size of data in bytes
   */
  static getDataSize(data: string): number {
    return new Blob([data]).size;
  }
} 