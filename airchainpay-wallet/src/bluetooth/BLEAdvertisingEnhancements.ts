import { Platform } from 'react-native';
import { logger } from '../utils/Logger';
import { BLEPaymentData, SupportedToken, SUPPORTED_TOKENS } from './BluetoothManager';

/**
 * BLE Advertising Enhancements for simplified payment data
 */
export interface AdvertisingConfig {
  deviceName: string;
  serviceUUID: string;
  paymentData: BLEPaymentData;
  timeout?: number;
  interval?: number;
}

export interface Advertiser {
  startBroadcast(message: string): Promise<any>;
  stopBroadcast(): Promise<any>;
}

export class BLEAdvertisingEnhancements {
  private static instance: BLEAdvertisingEnhancements | null = null;
  private metrics: Map<string, {
    startTime: number;
    endTime?: number;
    success: boolean;
    error?: string;
  }> = new Map();

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): BLEAdvertisingEnhancements {
    if (!BLEAdvertisingEnhancements.instance) {
      BLEAdvertisingEnhancements.instance = new BLEAdvertisingEnhancements();
    }
    return BLEAdvertisingEnhancements.instance;
  }

  /**
   * Create advertising configuration
   */
  createAdvertisingConfig(
    deviceName: string, 
    serviceUUID: string, 
    paymentData: BLEPaymentData
  ): AdvertisingConfig {
    return {
      deviceName,
      serviceUUID,
      paymentData,
      timeout: 60000, // 60 seconds auto-stop
      interval: 100 // 100ms advertising interval
    };
  }

  /**
   * Validate advertising configuration
   */
  validateAdvertisingConfig(config: AdvertisingConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.deviceName) {
      errors.push('Device name is required');
    }

    if (!config.serviceUUID) {
      errors.push('Service UUID is required');
    }

    if (!config.paymentData) {
      errors.push('Payment data is required');
    } else {
      if (!config.paymentData.walletAddress) {
        errors.push('Wallet address is required');
      }
      if (!config.paymentData.amount) {
        errors.push('Amount is required');
      }
      if (!config.paymentData.token) {
        errors.push('Token is required');
      }
      if (!Object.keys(SUPPORTED_TOKENS).includes(config.paymentData.token)) {
        errors.push(`Unsupported token: ${config.paymentData.token}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Start advertising with simplified payment data
   */
  async startAdvertisingWithPaymentData(
    advertiser: Advertiser,
    config: AdvertisingConfig,
    sessionId: string
  ): Promise<{ success: boolean; error?: string }> {
    const startTime = Date.now();
    
    try {
      // Validate configuration
      const validation = this.validateAdvertisingConfig(config);
      if (!validation.valid) {
        const error = `Invalid advertising configuration: ${validation.errors.join(', ')}`;
        this.recordMetrics(sessionId, startTime, false, error);
        return { success: false, error };
      }

      // Check platform support
      if (Platform.OS !== 'android') {
        const error = 'BLE advertising is only supported on Android';
        this.recordMetrics(sessionId, startTime, false, error);
        return { success: false, error };
      }

      // Create advertising message
      const advertisingMessage = this.createPaymentAdvertisingMessage(config);
      
      // Start advertising
      await advertiser.startBroadcast(advertisingMessage);

      this.recordMetrics(sessionId, startTime, true);
      logger.info('[BLE] Payment advertising started successfully', { sessionId, config });
      
      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordMetrics(sessionId, startTime, false, errorMessage);
      logger.error('[BLE] Payment advertising failed', { sessionId, error: errorMessage });
      
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Create advertising message with payment data
   */
  private createPaymentAdvertisingMessage(config: AdvertisingConfig): string {
    const { deviceName, serviceUUID, paymentData } = config;
    
    return JSON.stringify({
      name: deviceName,
      serviceUUID: serviceUUID,
      type: 'AirChainPay',
      version: '1.0.0',
      capabilities: ['payment', 'ble'],
      timestamp: Date.now(),
      paymentData: {
        walletAddress: paymentData.walletAddress,
        amount: paymentData.amount,
        token: paymentData.token,
        chainId: paymentData.chainId,
        timestamp: paymentData.timestamp
      }
    });
  }

  /**
   * Record advertising metrics
   */
  private recordMetrics(sessionId: string, startTime: number, success: boolean, error?: string): void {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    this.metrics.set(sessionId, {
      startTime,
      endTime,
      success,
      error,
    });

    logger.info('[BLE] Advertising metrics recorded', {
      sessionId,
      success,
      duration,
      error
    });
  }

  /**
   * Get advertising statistics
   */
  getAdvertisingStatistics(): {
    totalSessions: number;
    successfulSessions: number;
    failedSessions: number;
    averageDuration: number;
  } {
    const sessions = Array.from(this.metrics.values());
    const totalSessions = sessions.length;
    const successfulSessions = sessions.filter(s => s.success).length;
    const failedSessions = totalSessions - successfulSessions;
    
    const totalDuration = sessions.reduce((sum, session) => {
      if (session.endTime) {
        return sum + (session.endTime - session.startTime);
      }
      return sum;
    }, 0);
    
    const averageDuration = totalSessions > 0 ? totalDuration / totalSessions : 0;

    return {
      totalSessions,
      successfulSessions,
      failedSessions,
      averageDuration
    };
  }

  /**
   * Clear old metrics
   */
  clearOldMetrics(maxAge: number = 24 * 60 * 60 * 1000): void { // 24 hours default
    const now = Date.now();
    const oldSessions = Array.from(this.metrics.entries()).filter(([_, session]) => {
      return (now - session.startTime) > maxAge;
    });

    oldSessions.forEach(([sessionId, _]) => {
      this.metrics.delete(sessionId);
    });

    if (oldSessions.length > 0) {
      logger.info('[BLE] Cleared old advertising metrics', { count: oldSessions.length });
    }
  }

  /**
   * Format amount for display
   */
  formatAmount(amount: string, token: SupportedToken): string {
    const tokenConfig = SUPPORTED_TOKENS[token];
    const num = parseFloat(amount);
    
    if (isNaN(num)) {
      return '0';
    }
    
    // Format based on token decimals
    if (tokenConfig.decimals === 6) {
      return num.toFixed(6).replace(/\.?0+$/, '');
    } else {
      return num.toFixed(4).replace(/\.?0+$/, '');
    }
  }

  /**
   * Validate payment data
   */
  validatePaymentData(paymentData: BLEPaymentData): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!paymentData.walletAddress) {
      errors.push('Wallet address is required');
    }

    if (!paymentData.amount) {
      errors.push('Amount is required');
    } else {
      const num = parseFloat(paymentData.amount);
      if (isNaN(num) || num <= 0) {
        errors.push('Amount must be a positive number');
      }
    }

    if (!paymentData.token) {
      errors.push('Token is required');
    } else if (!Object.keys(SUPPORTED_TOKENS).includes(paymentData.token)) {
      errors.push(`Unsupported token: ${paymentData.token}`);
    }

    if (!paymentData.timestamp) {
      errors.push('Timestamp is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get supported tokens
   */
  getSupportedTokens(): SupportedToken[] {
    return Object.keys(SUPPORTED_TOKENS) as SupportedToken[];
  }

  /**
   * Get token info
   */
  getTokenInfo(token: SupportedToken) {
    return SUPPORTED_TOKENS[token];
  }
} 