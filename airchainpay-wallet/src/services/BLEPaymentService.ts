import { Platform } from 'react-native';
import { Device } from 'react-native-ble-plx';
import { BluetoothManager, BLEPaymentData, SupportedToken, SUPPORTED_TOKENS } from '../bluetooth/BluetoothManager';
import { logger } from '../utils/Logger';

// BLE Payment Service for handling simplified payment data
export class BLEPaymentService {
  private static instance: BLEPaymentService | null = null;
  private bleManager: BluetoothManager;
  private isScanning: boolean = false;
  private isAdvertising: boolean = false;
  private discoveredDevices: Map<string, { device: Device; paymentData?: BLEPaymentData }> = new Map();
  private scanListeners: Set<(devices: Array<{ device: Device; paymentData?: BLEPaymentData }>) => void> = new Set();
  private advertisingListeners: Set<(status: boolean) => void> = new Set();

  private constructor() {
    this.bleManager = BluetoothManager.getInstance();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): BLEPaymentService {
    if (!BLEPaymentService.instance) {
      BLEPaymentService.instance = new BLEPaymentService();
    }
    return BLEPaymentService.instance;
  }

  /**
   * Check if BLE is available
   */
  isBleAvailable(): boolean {
    return this.bleManager.isBleAvailable();
  }

  /**
   * Check if advertising is supported
   */
  isAdvertisingSupported(): boolean {
    return this.bleManager.isAdvertisingSupported();
  }

  /**
   * Get BLE status
   */
  async getBleStatus() {
    return this.bleManager.getBleStatus();
  }

  /**
   * Request permissions
   */
  async requestPermissions(): Promise<boolean> {
    return this.bleManager.requestAllPermissions();
  }

  /**
   * Start scanning for nearby payment devices
   */
  startScanning(onDevicesFound?: (devices: Array<{ device: Device; paymentData?: BLEPaymentData }>) => void): void {
    if (this.isScanning) {
      logger.info('[BLE Payment] Already scanning, skipping start request');
      return;
    }

    if (!this.bleManager.isBleAvailable()) {
      logger.error('[BLE Payment] BLE not available for scanning');
      return;
    }

    logger.info('[BLE Payment] Starting scan for payment devices');
    this.isScanning = true;
    this.discoveredDevices.clear();

    // Add listener if provided
    if (onDevicesFound) {
      this.scanListeners.add(onDevicesFound);
    }

    try {
      this.bleManager.startScan(
        (device, paymentData) => {
          logger.info('[BLE Payment] Found device:', device.name || device.id);
          
          // Store device with payment data
          this.discoveredDevices.set(device.id, { device, paymentData });
          
          // Notify listeners
          this.notifyScanListeners();
        },
        30000 // 30 second timeout
      );
    } catch (error) {
      logger.error('[BLE Payment] Error starting scan:', error);
      this.isScanning = false;
    }
  }

  /**
   * Stop scanning
   */
  stopScanning(): void {
    if (!this.isScanning) {
      return;
    }

    logger.info('[BLE Payment] Stopping scan');
    this.bleManager.stopScan();
    this.isScanning = false;
  }

  /**
   * Get discovered devices
   */
  getDiscoveredDevices(): Array<{ device: Device; paymentData?: BLEPaymentData }> {
    return Array.from(this.discoveredDevices.values());
  }

  /**
   * Clear discovered devices
   */
  clearDiscoveredDevices(): void {
    this.discoveredDevices.clear();
    this.notifyScanListeners();
  }

  /**
   * Start advertising payment availability
   */
  async startAdvertising(
    walletAddress: string,
    amount: string,
    token: SupportedToken,
    chainId?: string
  ): Promise<{ success: boolean; message?: string }> {
    if (this.isAdvertising) {
      logger.info('[BLE Payment] Already advertising, stopping first');
      await this.stopAdvertising();
    }

    if (!this.bleManager.isAdvertisingSupported()) {
      return { success: false, message: 'BLE advertising not supported on this device' };
    }

    // Validate token
    if (!Object.keys(SUPPORTED_TOKENS).includes(token)) {
      return { success: false, message: `Unsupported token: ${token}` };
    }

    // Validate amount
    if (!this.isValidAmount(amount, token)) {
      return { success: false, message: `Invalid amount: ${amount} ${token}` };
    }

    // Create payment data
    const paymentData: BLEPaymentData = {
      walletAddress,
      amount,
      token,
      chainId,
      timestamp: Date.now()
    };

    logger.info('[BLE Payment] Starting advertising with payment data:', paymentData);

    try {
      const result = await this.bleManager.startAdvertising(paymentData);
      
      if (result.success) {
        this.isAdvertising = true;
        this.notifyAdvertisingListeners(true);
        logger.info('[BLE Payment] ✅ Advertising started successfully');
      } else {
        logger.error('[BLE Payment] ❌ Advertising failed:', result.message);
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[BLE Payment] Error starting advertising:', errorMessage);
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Stop advertising
   */
  async stopAdvertising(): Promise<void> {
    if (!this.isAdvertising) {
      return;
    }

    logger.info('[BLE Payment] Stopping advertising');
    
    try {
      await this.bleManager.stopAdvertising();
      this.isAdvertising = false;
      this.notifyAdvertisingListeners(false);
      logger.info('[BLE Payment] ✅ Advertising stopped successfully');
    } catch (error) {
      logger.error('[BLE Payment] Error stopping advertising:', error);
      // Force stop even if there's an error
      this.isAdvertising = false;
      this.notifyAdvertisingListeners(false);
    }
  }

  /**
   * Check if currently advertising
   */
  isCurrentlyAdvertising(): boolean {
    return this.isAdvertising;
  }

  /**
   * Check if currently scanning
   */
  isCurrentlyScanning(): boolean {
    return this.isScanning;
  }

  /**
   * Connect to a payment device
   */
  async connectToDevice(device: Device): Promise<Device> {
    logger.info('[BLE Payment] Connecting to device:', device.name || device.id);
    
    try {
      const connectedDevice = await this.bleManager.connectToDevice(device);
      logger.info('[BLE Payment] ✅ Device connected successfully');
      return connectedDevice;
    } catch (error) {
      logger.error('[BLE Payment] Error connecting to device:', error);
      throw error;
    }
  }

  /**
   * Disconnect from a device
   */
  async disconnectFromDevice(deviceId: string): Promise<void> {
    logger.info('[BLE Payment] Disconnecting from device:', deviceId);
    
    try {
      await this.bleManager.disconnectFromDevice(deviceId);
      logger.info('[BLE Payment] ✅ Device disconnected successfully');
    } catch (error) {
      logger.error('[BLE Payment] Error disconnecting from device:', error);
    }
  }

  /**
   * Send payment data to connected device
   */
  async sendPaymentData(
    deviceId: string,
    paymentData: BLEPaymentData
  ): Promise<void> {
    if (!this.bleManager.isDeviceConnected(deviceId)) {
      throw new Error('Device not connected');
    }

    const data = JSON.stringify(paymentData);
    
    try {
      await this.bleManager.sendDataToDevice(
        deviceId,
        '0000abcd-0000-1000-8000-00805f9b34fb', // AirChainPay service UUID
        '0000abce-0000-1000-8000-00805f9b34fb', // AirChainPay characteristic UUID
        data
      );
      logger.info('[BLE Payment] ✅ Payment data sent successfully');
    } catch (error) {
      logger.error('[BLE Payment] Error sending payment data:', error);
      throw error;
    }
  }

  /**
   * Listen for payment data from connected device
   */
  async listenForPaymentData(
    deviceId: string,
    onPaymentData: (paymentData: BLEPaymentData) => void
  ): Promise<{ remove: () => void }> {
    if (!this.bleManager.isDeviceConnected(deviceId)) {
      throw new Error('Device not connected');
    }

    try {
      const listener = await this.bleManager.listenForData(
        deviceId,
        '0000abcd-0000-1000-8000-00805f9b34fb', // AirChainPay service UUID
        '0000abce-0000-1000-8000-00805f9b34fb', // AirChainPay characteristic UUID
        (data) => {
          try {
            const paymentData = JSON.parse(data) as BLEPaymentData;
            if (this.isValidPaymentData(paymentData)) {
              onPaymentData(paymentData);
            } else {
              logger.warn('[BLE Payment] Received invalid payment data:', data);
            }
          } catch (error) {
            logger.error('[BLE Payment] Error parsing payment data:', error);
          }
        }
      );
      
      logger.info('[BLE Payment] ✅ Started listening for payment data');
      return listener;
    } catch (error) {
      logger.error('[BLE Payment] Error starting payment data listener:', error);
      throw error;
    }
  }

  /**
   * Add scan listener
   */
  addScanListener(listener: (devices: Array<{ device: Device; paymentData?: BLEPaymentData }>) => void): void {
    this.scanListeners.add(listener);
  }

  /**
   * Remove scan listener
   */
  removeScanListener(listener: (devices: Array<{ device: Device; paymentData?: BLEPaymentData }>) => void): void {
    this.scanListeners.delete(listener);
  }

  /**
   * Add advertising listener
   */
  addAdvertisingListener(listener: (isAdvertising: boolean) => void): void {
    this.advertisingListeners.add(listener);
  }

  /**
   * Remove advertising listener
   */
  removeAdvertisingListener(listener: (isAdvertising: boolean) => void): void {
    this.advertisingListeners.delete(listener);
  }

  /**
   * Notify scan listeners
   */
  private notifyScanListeners(): void {
    const devices = this.getDiscoveredDevices();
    this.scanListeners.forEach(listener => {
      try {
        listener(devices);
      } catch (error) {
        logger.error('[BLE Payment] Error in scan listener:', error);
      }
    });
  }

  /**
   * Notify advertising listeners
   */
  private notifyAdvertisingListeners(isAdvertising: boolean): void {
    this.advertisingListeners.forEach(listener => {
      try {
        listener(isAdvertising);
      } catch (error) {
        logger.error('[BLE Payment] Error in advertising listener:', error);
      }
    });
  }

  /**
   * Validate amount for token
   */
  private isValidAmount(amount: string, token: SupportedToken): boolean {
    try {
      const num = parseFloat(amount);
      if (isNaN(num) || num <= 0) {
        return false;
      }
      
      // Check decimal places based on token
      const tokenConfig = SUPPORTED_TOKENS[token];
      const decimalPlaces = (amount.split('.')[1] || '').length;
      
      return decimalPlaces <= tokenConfig.decimals;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate payment data structure
   */
  private isValidPaymentData(data: any): data is BLEPaymentData {
    return (
      typeof data === 'object' &&
      typeof data.walletAddress === 'string' &&
      typeof data.amount === 'string' &&
      typeof data.token === 'string' &&
      Object.keys(SUPPORTED_TOKENS).includes(data.token) &&
      typeof data.timestamp === 'number'
    );
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
      return num.toFixed(6).replace(/\.?0+$/, ''); // Remove trailing zeros for 6 decimals
    } else {
      return num.toFixed(4).replace(/\.?0+$/, ''); // Remove trailing zeros for 18 decimals
    }
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

  /**
   * Run comprehensive BLE advertising diagnostics
   */
  async runAdvertisingDiagnostics(): Promise<{
    supported: boolean;
    issues: string[];
    recommendations: string[];
    details: {
      platform: string;
      bluetoothEnabled: boolean;
      bleAvailable: boolean;
      permissionsGranted: boolean;
      advertiserAvailable: boolean;
      moduleMethods: string[];
    };
  }> {
    const issues: Array<string> = [];
    const recommendations: Array<string> = [];
    
    const details = {
      platform: Platform.OS,
      bluetoothEnabled: false,
      bleAvailable: this.isBleAvailable(),
      permissionsGranted: false,
      advertiserAvailable: this.isAdvertisingSupported(),
      moduleMethods: [] as string[]
    };

    try {
      // Check platform
      if (Platform.OS !== 'android') {
        issues.push('BLE advertising is only supported on Android devices');
        recommendations.push('Use an Android device for BLE advertising functionality');
        return { supported: false, issues, recommendations, details };
      }

      // Check BLE availability
      if (!details.bleAvailable) {
        issues.push('Bluetooth LE is not available on this device');
        recommendations.push('This device may not support Bluetooth LE');
      }

      // Check Bluetooth state
      const bleStatus = await this.getBleStatus();
      details.bluetoothEnabled = bleStatus.available;
      if (!details.bluetoothEnabled) {
        issues.push('Bluetooth is not enabled');
        recommendations.push('Enable Bluetooth in your device settings');
      }

      // Check permissions
      const permissionStatus = await this.bleManager.checkPermissions();
      details.permissionsGranted = permissionStatus.granted;
      if (!details.permissionsGranted) {
        issues.push('Missing Bluetooth permissions');
        recommendations.push('Grant Bluetooth permissions in Settings > Apps > AirChainPay > Permissions');
      }

      // Check advertiser module
      if (!details.advertiserAvailable) {
        issues.push('BLE advertiser module not available');
        recommendations.push('The tp-rn-ble-advertiser module may not be properly installed');
        recommendations.push('Try reinstalling the app or updating to the latest version');
      }

      // Get detailed advertising support info
      const advertisingSupport = await this.bleManager.checkAdvertisingSupport();
      details.moduleMethods = advertisingSupport.details.availableMethods;
      
      if (advertisingSupport.missingRequirements.length > 0) {
        issues.push(...advertisingSupport.missingRequirements);
      }
      
      if (advertisingSupport.recommendations.length > 0) {
        recommendations.push(...advertisingSupport.recommendations);
      }

    } catch (error) {
      issues.push('Unable to run diagnostics');
      recommendations.push('Try restarting the app');
    }

    return {
      supported: issues.length === 0,
      issues,
      recommendations,
      details
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    logger.info('[BLE Payment] Destroying BLEPaymentService...');
    
    // Stop scanning
    this.stopScanning();
    
    // Stop advertising
    this.stopAdvertising();
    
    // Clear listeners
    this.scanListeners.clear();
    this.advertisingListeners.clear();
    
    // Clear discovered devices
    this.discoveredDevices.clear();
    
    // Clear instance
    BLEPaymentService.instance = null;
    
    logger.info('[BLE Payment] BLEPaymentService destroyed');
  }
} 