import { Platform } from 'react-native';
import { Device } from 'react-native-ble-plx';
import { logger } from '../utils/Logger';
import { BluetoothManager, BLEPaymentPayload, BLEScanResult } from '../bluetooth/BluetoothManager';
import { BLEAdvertisingEnhancements } from '../bluetooth/BLEAdvertisingEnhancements';
import { BLEAdvertisingSecurity, SecurityConfig } from '../bluetooth/BLEAdvertisingSecurity';

/**
 * BLE Payment Service
 * Simplified interface for offline BLE communication with wallet address and payment intent broadcasting
 */

export interface BLEPaymentDevice {
  device: Device;
  payload: BLEPaymentPayload;
  rssi: number;
  timestamp: number;
  distance?: number; // Estimated distance based on RSSI
}

export interface BLEPaymentOptions {
  autoStopMs?: number;
  enableEncryption?: boolean;
  enableAuthentication?: boolean;
  encryptionKey?: string;
  scanTimeoutMs?: number;
  logActivity?: boolean;
}

export interface BLEPaymentStatus {
  isAdvertising: boolean;
  isScanning: boolean;
  currentPayload: BLEPaymentPayload | null;
  discoveredDevices: BLEPaymentDevice[];
  lastError?: string;
  advertisingTimeRemaining?: number;
}

export class BLEPaymentService {
  private static instance: BLEPaymentService | null = null;
  private bluetoothManager: BluetoothManager;
  private advertisingEnhancements: BLEAdvertisingEnhancements;
  private advertisingSecurity: BLEAdvertisingSecurity;
  
  private isScanning: boolean = false;
  private discoveredDevices: BLEPaymentDevice[] = [];
  private scanTimeout: any = null;
  private advertisingTimeout: any = null;
  private currentPayload: BLEPaymentPayload | null = null;
  private lastError: string | null = null;
  private logActivity: boolean = true;

  private constructor() {
    this.bluetoothManager = BluetoothManager.getInstance();
    this.advertisingEnhancements = BLEAdvertisingEnhancements.getInstance();
    this.advertisingSecurity = BLEAdvertisingSecurity.getInstance();
  }

  public static getInstance(): BLEPaymentService {
    if (!BLEPaymentService.instance) {
      BLEPaymentService.instance = new BLEPaymentService();
    }
    return BLEPaymentService.instance;
  }

  /**
   * Start advertising wallet address and payment intent
   */
  async startAdvertising(
    walletAddress: string,
    amount?: string,
    token: string = 'PYUSDT',
    chain: string = 'Core Testnet',
    options: BLEPaymentOptions = {}
  ): Promise<{ success: boolean; error?: string }> {
    try {
      this.log('[BLE] Starting payment advertising', { walletAddress, amount, token, chain });

      // Create payment payload
      const payload = this.bluetoothManager.createPaymentPayload(
        walletAddress,
        amount,
        token,
        chain
      );

      // Check if BLE is available
      if (!this.bluetoothManager.isBleAvailable()) {
        const error = 'BLE not available on this device';
        this.setError(error);
        return { success: false, error };
      }

      // Check platform support
      if (Platform.OS !== 'android') {
        const error = 'BLE advertising is only supported on Android';
        this.setError(error);
        return { success: false, error };
      }

      // Start advertising with payload
      const result = await this.bluetoothManager.startAdvertisingWithPayload(
        payload,
        options.autoStopMs || 60000
      );

      if (result.success) {
        this.currentPayload = payload;
        this.clearError();
        this.log('[BLE] Payment advertising started successfully');
        return { success: true };
      } else {
        this.setError(result.message || 'Failed to start advertising');
        return { success: false, error: result.message };
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.setError(errorMessage);
      this.log('[BLE] Payment advertising failed', { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Start secure advertising with encryption and authentication
   */
  async startSecureAdvertising(
    walletAddress: string,
    securityConfig: SecurityConfig,
    amount?: string,
    token: string = 'PYUSDT',
    chain: string = 'Core Testnet',
    options: BLEPaymentOptions = {}
  ): Promise<{ success: boolean; error?: string; sessionId?: string }> {
    try {
      this.log('[BLE] Starting secure payment advertising', { walletAddress, amount, token, chain });

      // Create payment payload
      const payload = this.bluetoothManager.createPaymentPayload(
        walletAddress,
        amount,
        token,
        chain
      );

      // Check if BLE is available
      if (!this.bluetoothManager.isBleAvailable()) {
        const error = 'BLE not available on this device';
        this.setError(error);
        return { success: false, error };
      }

      // Check platform support
      if (Platform.OS !== 'android') {
        const error = 'BLE advertising is only supported on Android';
        this.setError(error);
        return { success: false, error };
      }

      // Get advertiser instance
      const advertiser = (this.bluetoothManager as any).advertiser;
      if (!advertiser) {
        const error = 'BLE advertiser not available';
        this.setError(error);
        return { success: false, error };
      }

      // Start secure advertising
      const result = await this.advertisingSecurity.startSecurePaymentAdvertising(
        advertiser,
        payload,
        securityConfig
      );

      if (result.success) {
        this.currentPayload = payload;
        this.clearError();
        this.log('[BLE] Secure payment advertising started successfully', { sessionId: result.sessionId });
        return result;
      } else {
        this.setError(result.error || 'Failed to start secure advertising');
        return result;
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.setError(errorMessage);
      this.log('[BLE] Secure payment advertising failed', { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Stop advertising
   */
  async stopAdvertising(): Promise<{ success: boolean; error?: string }> {
    try {
      this.log('[BLE] Stopping payment advertising');

      // Clear timeout
      if (this.advertisingTimeout) {
        clearTimeout(this.advertisingTimeout);
        this.advertisingTimeout = null;
      }

      // Stop advertising
      await this.bluetoothManager.stopAdvertising();
      
      this.currentPayload = null;
      this.clearError();
      this.log('[BLE] Payment advertising stopped successfully');
      
      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.setError(errorMessage);
      this.log('[BLE] Failed to stop advertising', { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Start scanning for nearby payment devices
   */
  async startScanning(
    options?: BLEPaymentOptions,
    onDeviceFound?: (device: BLEPaymentDevice) => void
  ): Promise<{ success: boolean; error?: string }> {
    try {
      this.log('[BLE] Starting payment device scanning');

      // Check if BLE is available
      if (!this.bluetoothManager.isBleAvailable()) {
        const error = 'BLE not available on this device';
        this.setError(error);
        return { success: false, error };
      }

      // Clear previous scan results
      this.discoveredDevices = [];
      this.isScanning = true;

      // Start scanning
      this.bluetoothManager.startScanForPaymentDevices(
        (scanResult: BLEScanResult) => {
          if (scanResult.payload) {
            const device: BLEPaymentDevice = {
              device: scanResult.device,
              payload: scanResult.payload,
              rssi: scanResult.rssi,
              timestamp: scanResult.timestamp,
              distance: this.estimateDistance(scanResult.rssi)
            };

            // Add to discovered devices
            this.discoveredDevices.push(device);
            
            // Call callback if provided
            if (onDeviceFound) {
              onDeviceFound(device);
            }

            this.log('[BLE] Found payment device', {
              name: device.device.name || device.device.localName,
              walletAddress: device.payload.walletAddress,
              amount: device.payload.amount,
              rssi: device.rssi,
              distance: device.distance
            });
          }
        },
        (options?.scanTimeoutMs) || 30000
      );

      this.clearError();
      this.log('[BLE] Payment device scanning started successfully');
      
      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.setError(errorMessage);
      this.log('[BLE] Failed to start scanning', { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Stop scanning
   */
  async stopScanning(): Promise<{ success: boolean; error?: string }> {
    try {
      this.log('[BLE] Stopping payment device scanning');

      this.bluetoothManager.stopScan();
      this.isScanning = false;

      // Clear timeout
      if (this.scanTimeout) {
        clearTimeout(this.scanTimeout);
        this.scanTimeout = null;
      }

      this.clearError();
      this.log('[BLE] Payment device scanning stopped successfully');
      
      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.setError(errorMessage);
      this.log('[BLE] Failed to stop scanning', { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get current status
   */
  getStatus(): BLEPaymentStatus {
    return {
      isAdvertising: this.bluetoothManager.isCurrentlyAdvertising(),
      isScanning: this.isScanning,
      currentPayload: this.currentPayload,
      discoveredDevices: [...this.discoveredDevices],
      lastError: this.lastError || undefined,
      advertisingTimeRemaining: this.advertisingTimeout ? undefined : undefined
    };
  }

  /**
   * Get discovered devices
   */
  getDiscoveredDevices(): BLEPaymentDevice[] {
    return [...this.discoveredDevices];
  }

  /**
   * Clear discovered devices
   */
  clearDiscoveredDevices(): void {
    this.discoveredDevices = [];
    this.log('[BLE] Cleared discovered devices');
  }

  /**
   * Estimate distance based on RSSI
   */
  private estimateDistance(rssi: number): number {
    // Simple distance estimation based on RSSI
    // RSSI typically ranges from -100 (far) to -30 (close)
    if (rssi >= -50) return 0.5; // Very close
    if (rssi >= -60) return 1.0; // Close
    if (rssi >= -70) return 2.0; // Medium
    if (rssi >= -80) return 5.0; // Far
    return 10.0; // Very far
  }

  /**
   * Check if BLE is supported and available
   */
  async checkBLESupport(): Promise<{
    supported: boolean;
    available: boolean;
    platform: string;
    permissions: boolean;
    error?: string;
  }> {
    try {
      const status = await this.bluetoothManager.getBleStatus();
      
      return {
        supported: status.available,
        available: status.available,
        platform: status.platform,
        permissions: status.permissionsGranted,
        error: status.error || undefined
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        supported: false,
        available: false,
        platform: Platform.OS,
        permissions: false,
        error: errorMessage
      };
    }
  }

  /**
   * Request BLE permissions
   */
  async requestPermissions(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.bluetoothManager.requestPermissionsEnhanced();
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Enable/disable activity logging
   */
  setLoggingEnabled(enabled: boolean): void {
    this.logActivity = enabled;
    this.log('[BLE] Logging ' + (enabled ? 'enabled' : 'disabled'));
  }

  /**
   * Log activity if enabled
   */
  private log(message: string, data?: any): void {
    if (this.logActivity) {
      if (data) {
        logger.info(message, data);
      } else {
        logger.info(message);
      }
    }
  }

  /**
   * Set error message
   */
  private setError(error: string): void {
    this.lastError = error;
    if (this.logActivity) {
      logger.error('[BLE] Error:', error);
    }
  }

  /**
   * Clear error message
   */
  private clearError(): void {
    this.lastError = null;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopAdvertising();
    this.stopScanning();
    this.discoveredDevices = [];
    this.currentPayload = null;
    this.lastError = null;
    this.log('[BLE] Service destroyed');
  }
} 