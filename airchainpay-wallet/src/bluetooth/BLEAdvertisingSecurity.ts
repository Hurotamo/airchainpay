import { Platform } from 'react-native';
import { logger } from '../utils/Logger';
import { BLEPaymentData, SupportedToken, SUPPORTED_TOKENS } from './BluetoothManager';

/**
 * Security configuration for BLE advertising
 */
export interface SecurityConfig {
  enableEncryption: boolean;
  enableAuthentication: boolean;
  encryptionKey?: string;
  authenticationToken?: string;
}

/**
 * BLE Advertising Security for simplified payment data
 */
export interface Advertiser {
  startBroadcast(message: string): Promise<any>;
  stopBroadcast(): Promise<any>;
}

export class BLEAdvertisingSecurity {
  private static instance: BLEAdvertisingSecurity | null = null;
  private securityMetrics: Map<string, {
    startTime: number;
    endTime?: number;
    success: boolean;
    encryptionSuccess: boolean;
    authenticationSuccess: boolean;
    error?: string;
  }> = new Map();

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): BLEAdvertisingSecurity {
    if (!BLEAdvertisingSecurity.instance) {
      BLEAdvertisingSecurity.instance = new BLEAdvertisingSecurity();
    }
    return BLEAdvertisingSecurity.instance;
  }

  /**
   * Create secure advertising configuration
   */
  createSecureAdvertisingConfig(
    deviceName: string,
    serviceUUID: string,
    paymentData: BLEPaymentData,
    securityConfig: SecurityConfig
  ): { config: Record<string, unknown>; security: SecurityConfig } {
    const baseConfig: Record<string, unknown> = {
      deviceName,
      serviceUUID,
      paymentData: {
        walletAddress: paymentData.walletAddress,
        amount: paymentData.amount,
        token: paymentData.token,
        chainId: paymentData.chainId,
        timestamp: paymentData.timestamp
      },
      timestamp: Date.now()
    };

    // Add encryption if enabled
    if (securityConfig.enableEncryption && securityConfig.encryptionKey) {
      baseConfig.encrypted = true;
      baseConfig.encryptionKey = this.generateEncryptionKey(securityConfig.encryptionKey);
    }

    // Add authentication token if enabled
    if (securityConfig.enableAuthentication && securityConfig.authenticationToken) {
      baseConfig.authenticationToken = this.generateAuthenticationToken(deviceName);
    }

    return {
      config: baseConfig,
      security: securityConfig
    };
  }

  /**
   * Start secure advertising with payment data
   */
  async startSecureAdvertising(
    advertiser: Advertiser,
    deviceName: string,
    serviceUUID: string,
    paymentData: BLEPaymentData,
    securityConfig: SecurityConfig
  ): Promise<{ success: boolean; error?: string; sessionId?: string }> {
    const sessionId = `${deviceName}-${Date.now()}`;
    const startTime = Date.now();
    
    try {
      // Initialize security metrics
      this.initializeSecurityMetrics(sessionId);

      // Create secure configuration
      const { config, security } = this.createSecureAdvertisingConfig(
        deviceName,
        serviceUUID,
        paymentData,
        securityConfig
      );

      // Create secure advertising message
      const secureAdvertisingMessage = JSON.stringify({
        name: deviceName,
        serviceUUID: serviceUUID,
        type: 'AirChainPay',
        version: '1.0.0',
        capabilities: ['payment', 'secure_ble', 'encrypted'],
        timestamp: Date.now(),
        encrypted: security.enableEncryption,
        authenticationToken: config.authenticationToken || null,
        paymentData: config.paymentData
      });
      
      // Start advertising
      await advertiser.startBroadcast(secureAdvertisingMessage);

      // Record successful security metrics
      this.recordSecuritySuccess(sessionId, 'encryption');
      this.recordSecuritySuccess(sessionId, 'authentication');

      logger.info('[BLE] Secure advertising started', { sessionId, deviceName });
      
      return { success: true, sessionId };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordSecurityError(sessionId, errorMessage);
      logger.error('[BLE] Secure advertising failed', { sessionId, error: errorMessage });
      
      return { success: false, error: errorMessage, sessionId };
    }
  }

  /**
   * Generate encryption key
   */
  private generateEncryptionKey(baseKey: string): string {
    // Simple key derivation for demo purposes
    // In production, use proper cryptographic key derivation
    const timestamp = Date.now().toString();
    const combined = `${baseKey}-${timestamp}`;
    return Buffer.from(combined).toString('base64').substring(0, 32);
  }

  /**
   * Generate authentication token
   */
  private generateAuthenticationToken(deviceName: string): string {
    // Simple token generation for demo purposes
    // In production, use proper cryptographic token generation
    const timestamp = Date.now().toString();
    const combined = `${deviceName}-${timestamp}`;
    return Buffer.from(combined).toString('base64').substring(0, 16);
  }

  /**
   * Initialize security metrics
   */
  private initializeSecurityMetrics(sessionId: string): void {
    this.securityMetrics.set(sessionId, {
      startTime: Date.now(),
      success: false,
      encryptionSuccess: false,
      authenticationSuccess: false
    });
  }

  /**
   * Record security success
   */
  private recordSecuritySuccess(sessionId: string, type: 'encryption' | 'authentication'): void {
    const metrics = this.securityMetrics.get(sessionId);
    if (metrics) {
      if (type === 'encryption') {
        metrics.encryptionSuccess = true;
      } else if (type === 'authentication') {
        metrics.authenticationSuccess = true;
      }
      metrics.success = metrics.encryptionSuccess && metrics.authenticationSuccess;
      metrics.endTime = Date.now();
    }
  }

  /**
   * Record security error
   */
  private recordSecurityError(sessionId: string, error: string): void {
    const metrics = this.securityMetrics.get(sessionId);
    if (metrics) {
      metrics.error = error;
      metrics.endTime = Date.now();
    }
  }

  /**
   * Get security statistics
   */
  getSecurityStatistics(): {
    totalSessions: number;
    successfulSessions: number;
    successfulEncryptions: number;
    successfulAuthentications: number;
    failedSessions: number;
    averageSessionDuration: number;
  } {
    const sessions = Array.from(this.securityMetrics.values());
    const totalSessions = sessions.length;
    const successfulSessions = sessions.filter(s => s.success).length;
    const successfulEncryptions = sessions.filter(s => s.encryptionSuccess).length;
    const successfulAuthentications = sessions.filter(s => s.authenticationSuccess).length;
    const failedSessions = totalSessions - successfulSessions;
    
    const totalDuration = sessions.reduce((sum, session) => {
      if (session.endTime) {
        return sum + (session.endTime - session.startTime);
      }
      return sum;
    }, 0);
    
    const averageSessionDuration = totalSessions > 0 ? totalDuration / totalSessions : 0;

    return {
      totalSessions,
      successfulSessions,
      successfulEncryptions,
      successfulAuthentications,
      failedSessions,
      averageSessionDuration
    };
  }

  /**
   * Validate payment data for security
   */
  validatePaymentDataForSecurity(paymentData: BLEPaymentData): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!paymentData.walletAddress) {
      errors.push('Wallet address is required for secure advertising');
    }

    if (!paymentData.amount) {
      errors.push('Amount is required for secure advertising');
    } else {
      const num = parseFloat(paymentData.amount);
      if (isNaN(num) || num <= 0) {
        errors.push('Amount must be a positive number');
      }
    }

    if (!paymentData.token) {
      errors.push('Token is required for secure advertising');
    } else if (!Object.keys(SUPPORTED_TOKENS).includes(paymentData.token)) {
      errors.push(`Unsupported token: ${paymentData.token}`);
    }

    if (!paymentData.timestamp) {
      errors.push('Timestamp is required for secure advertising');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Format secure amount for display
   */
  formatSecureAmount(amount: string, token: SupportedToken): string {
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
   * Get supported tokens for secure advertising
   */
  getSupportedTokensForSecurity(): SupportedToken[] {
    return Object.keys(SUPPORTED_TOKENS) as SupportedToken[];
  }

  /**
   * Get token info for security
   */
  getTokenInfoForSecurity(token: SupportedToken) {
    return SUPPORTED_TOKENS[token];
  }

  /**
   * Clear old security metrics
   */
  clearOldSecurityMetrics(maxAge: number = 24 * 60 * 60 * 1000): void { // 24 hours default
    const now = Date.now();
    const oldSessions = Array.from(this.securityMetrics.entries()).filter(([_, session]) => {
      return (now - session.startTime) > maxAge;
    });

    oldSessions.forEach(([sessionId, _]) => {
      this.securityMetrics.delete(sessionId);
    });

    if (oldSessions.length > 0) {
      logger.info('[BLE] Cleared old security metrics', { count: oldSessions.length });
    }
  }
} 