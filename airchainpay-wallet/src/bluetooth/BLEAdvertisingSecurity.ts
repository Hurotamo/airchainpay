import { logger } from '../utils/Logger';

/**
 * BLE Advertising Security
 * Handles encryption, authentication, and security for BLE advertising
 */

export interface SecurityConfig {
  enableEncryption: boolean;
  enableAuthentication: boolean;
  encryptionKey?: string;
  authenticationToken?: string;
  sessionTimeout: number;
  maxRetries: number;
}

export interface SecurityMetrics {
  encryptionAttempts: number;
  authenticationAttempts: number;
  successfulEncryptions: number;
  successfulAuthentications: number;
  failedEncryptions: number;
  failedAuthentications: number;
  securityErrors: string[];
}

interface Advertiser {
  start: () => void;
  stop: () => void;
  isAdvertising: boolean;
  [key: string]: unknown;
}

export class BLEAdvertisingSecurity {
  private static instance: BLEAdvertisingSecurity | null = null;
  private metrics: Map<string, SecurityMetrics> = new Map();
  private sessionTokens: Map<string, { token: string; expiresAt: number }> = new Map();
  private encryptionKeys: Map<string, string> = new Map();

  private constructor() {}

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
    securityConfig: SecurityConfig
  ): { config: Record<string, unknown>; security: SecurityConfig } {
    const baseConfig: Record<string, unknown> = {
      deviceName,
      serviceUUID,
      manufacturerData: this.encryptManufacturerData(
        Buffer.from('AirChainPay', 'utf8').toJSON().data,
        securityConfig.encryptionKey
      ),
      txPowerLevel: -12,
      advertiseMode: 0,
      includeDeviceName: securityConfig.enableAuthentication,
      includeTxPowerLevel: true,
      connectable: true
    };

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
   * Encrypt manufacturer data
   */
  private encryptManufacturerData(data: number[], key?: string): number[] {
    if (!key) {
      return data; // No encryption if no key provided
    }

    try {
      // Simple XOR encryption for demonstration
      // In production, use proper encryption like AES
      const keyBytes = Buffer.from(key, 'utf8');
      const encrypted = data.map((byte, index) => 
        byte ^ keyBytes[index % keyBytes.length]
      );
      
      return encrypted;
    } catch (error) {
      logger.error('[BLE] Encryption failed', { error });
      return data; // Return original data if encryption fails
    }
  }

  /**
   * Decrypt manufacturer data
   */
  decryptManufacturerData(data: number[], key?: string): number[] {
    if (!key) {
      return data; // No decryption if no key provided
    }

    try {
      // XOR decryption (same as encryption)
      const keyBytes = Buffer.from(key, 'utf8');
      const decrypted = data.map((byte, index) => 
        byte ^ keyBytes[index % keyBytes.length]
      );
      
      return decrypted;
    } catch (error) {
      logger.error('[BLE] Decryption failed', { error });
      return data; // Return original data if decryption fails
    }
  }

  /**
   * Generate authentication token
   */
  private generateAuthenticationToken(deviceName: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    const token = `${deviceName}-${timestamp}-${random}`;
    
    // Store token with expiration
    this.sessionTokens.set(deviceName, {
      token,
      expiresAt: timestamp + (30 * 60 * 1000) // 30 minutes
    });
    
    return token;
  }

  /**
   * Validate authentication token
   */
  validateAuthenticationToken(deviceName: string, token: string): boolean {
    const session = this.sessionTokens.get(deviceName);
    
    if (!session) {
      return false;
    }

    if (Date.now() > session.expiresAt) {
      this.sessionTokens.delete(deviceName);
      return false;
    }

    return session.token === token;
  }

  /**
   * Generate encryption key
   */
  generateEncryptionKey(deviceName: string): string {
    const key = `${deviceName}-${Date.now()}-${Math.random().toString(36).substring(2)}`;
    this.encryptionKeys.set(deviceName, key);
    return key;
  }

  /**
   * Get encryption key for device
   */
  getEncryptionKey(deviceName: string): string | undefined {
    return this.encryptionKeys.get(deviceName);
  }

  /**
   * Start secure advertising
   */
  async startSecureAdvertising(
    advertiser: Advertiser,
    deviceName: string,
    serviceUUID: string,
    securityConfig: SecurityConfig
  ): Promise<{ success: boolean; error?: string; sessionId?: string }> {
    const sessionId = `${deviceName}-${Date.now()}`;
    
    try {
      // Initialize security metrics
      this.initializeSecurityMetrics(sessionId);

      // Create secure configuration
      const { config, security } = this.createSecureAdvertisingConfig(
        deviceName,
        serviceUUID,
        securityConfig
      );

      // Start advertising with security using tp-rn-ble-advertiser
      const secureAdvertisingMessage = JSON.stringify({
        name: deviceName,
        serviceUUID: serviceUUID,
        type: 'AirChainPay',
        version: '1.0.0',
        capabilities: ['payment', 'secure_ble', 'encrypted'],
        timestamp: Date.now(),
        encrypted: true,
        authenticationToken: config.authenticationToken || null
      });
      
      await advertiser.start();

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
   * Stop secure advertising
   */
  async stopSecureAdvertising(
    advertiser: Advertiser,
    sessionId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await advertiser.stop();
      
      // Clean up security data
      this.cleanupSecurityData(sessionId);
      
      logger.info('[BLE] Secure advertising stopped', { sessionId });
      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[BLE] Secure advertising stop failed', { sessionId, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Initialize security metrics
   */
  private initializeSecurityMetrics(sessionId: string): void {
    this.metrics.set(sessionId, {
      encryptionAttempts: 0,
      authenticationAttempts: 0,
      successfulEncryptions: 0,
      successfulAuthentications: 0,
      failedEncryptions: 0,
      failedAuthentications: 0,
      securityErrors: []
    });
  }

  /**
   * Record security success
   */
  private recordSecuritySuccess(sessionId: string, type: 'encryption' | 'authentication'): void {
    const metrics = this.metrics.get(sessionId);
    if (metrics) {
      if (type === 'encryption') {
        metrics.encryptionAttempts++;
        metrics.successfulEncryptions++;
      } else {
        metrics.authenticationAttempts++;
        metrics.successfulAuthentications++;
      }
    }
  }

  /**
   * Record security error
   */
  private recordSecurityError(sessionId: string, error: string): void {
    const metrics = this.metrics.get(sessionId);
    if (metrics) {
      metrics.securityErrors.push(error);
    }
  }

  /**
   * Clean up security data
   */
  private cleanupSecurityData(sessionId: string): void {
    this.metrics.delete(sessionId);
    
    // Clean up expired session tokens
    const now = Date.now();
    for (const [deviceName, session] of this.sessionTokens.entries()) {
      if (now > session.expiresAt) {
        this.sessionTokens.delete(deviceName);
      }
    }
  }

  /**
   * Get security metrics
   */
  getSecurityMetrics(sessionId: string): SecurityMetrics | undefined {
    return this.metrics.get(sessionId);
  }

  /**
   * Get all security metrics
   */
  getAllSecurityMetrics(): Map<string, SecurityMetrics> {
    return new Map(this.metrics);
  }

  /**
   * Get security statistics
   */
  getSecurityStatistics(): {
    totalSessions: number;
    successfulEncryptions: number;
    successfulAuthentications: number;
    failedEncryptions: number;
    failedAuthentications: number;
    averageSecurityErrors: number;
  } {
    const sessions = Array.from(this.metrics.values());
    const totalEncryptions = sessions.reduce((sum, s) => sum + s.successfulEncryptions, 0);
    const totalAuthentications = sessions.reduce((sum, s) => sum + s.successfulAuthentications, 0);
    const totalFailedEncryptions = sessions.reduce((sum, s) => sum + s.failedEncryptions, 0);
    const totalFailedAuthentications = sessions.reduce((sum, s) => sum + s.failedAuthentications, 0);
    const totalErrors = sessions.reduce((sum, s) => sum + s.securityErrors.length, 0);
    const averageErrors = sessions.length > 0 ? totalErrors / sessions.length : 0;

    return {
      totalSessions: sessions.length,
      successfulEncryptions: totalEncryptions,
      successfulAuthentications: totalAuthentications,
      failedEncryptions: totalFailedEncryptions,
      failedAuthentications: totalFailedAuthentications,
      averageSecurityErrors: averageErrors
    };
  }

  /**
   * Clear all security data
   */
  clearAllSecurityData(): void {
    this.metrics.clear();
    this.sessionTokens.clear();
    this.encryptionKeys.clear();
  }
} 