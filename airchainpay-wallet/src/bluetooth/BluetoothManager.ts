import { Platform, PermissionsAndroid } from 'react-native';
import { BleManager, Device, State, Service } from 'react-native-ble-plx';
import TpBleAdvertiser from 'tp-rn-ble-advertiser';
import { logger } from '../utils/Logger';

// Define UUIDs for AirChainPay
export const AIRCHAINPAY_SERVICE_UUID = '0000abcd-0000-1000-8000-00805f9b34fb';
export const AIRCHAINPAY_CHARACTERISTIC_UUID = '0000abce-0000-1000-8000-00805f9b34fb';
export const AIRCHAINPAY_DEVICE_PREFIX = 'AirChainPay';

// Supported tokens for BLE advertising
export const SUPPORTED_TOKENS = {
  USDC: { symbol: 'USDC', decimals: 6 },
  USDT: { symbol: 'USDT', decimals: 6 },
  ETH: { symbol: 'ETH', decimals: 18 },
  CORE: { symbol: 'CORE', decimals: 18 }
} as const;

export type SupportedToken = keyof typeof SUPPORTED_TOKENS;

// BLE Payment Data Interface
export interface BLEPaymentData {
  walletAddress: string;
  amount: string;
  token: SupportedToken;
  chainId?: string;
  timestamp: number;
}

// Connection status enum
export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

// Device connection state interface
interface DeviceConnectionState {
  device: Device;
  status: ConnectionStatus;
  services?: Service[];
  paymentData?: BLEPaymentData;
}

// Bluetooth error class
export class BluetoothError extends Error {
  public code: string;
  
  constructor(message: string, code: string) {
    super(message);
    this.name = 'BluetoothError';
    this.code = code;
  }
}

// BluetoothManager handles BLE scanning, connecting, and permissions
export class BluetoothManager {
  private static instance: BluetoothManager | null = null;
  private manager: BleManager | null = null;
  private advertiser: any = null;
  private isAdvertising: boolean = false;
  private connectedDevices: Map<string, DeviceConnectionState> = new Map();
  private scanSubscription: any = null;
  public deviceName: string = '';
  private connectionListeners: Set<(deviceId: string, status: ConnectionStatus) => void> = new Set();
  private bleAvailable: boolean = false;
  private initializationError: string | null = null;
  private stateSubscription: any = null;
  private advertisingTimeout: NodeJS.Timeout | null = null;
  private static readonly CONFIG = {
    CHUNK_PAYLOAD_SIZE: 160, // bytes of base64 per write
    LARGE_MESSAGE_THRESHOLD: 4096, // bytes
    CONNECT_TIMEOUT_MS: 10000,
    WRITE_TIMEOUT_MS: 5000,
    LISTEN_MESSAGE_TIMEOUT_MS: 30000,
    MAX_WRITE_RETRIES: 3,
  } as const;
  
  private constructor() {
    logger.info('[BLE] Initializing BluetoothManager');
    
    // Generate a unique device name
    this.deviceName = `${AIRCHAINPAY_DEVICE_PREFIX}-${Math.floor(Math.random() * 10000)}`;
    logger.info('[BLE] Device name:', this.deviceName);
    
    try {
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        console.log('[BLE] Platform supported:', Platform.OS);
        
        // Create the BLE manager instance
        this.manager = new BleManager();
        console.log('[BLE] BleManager instance created successfully');
        
        // Initialize BLE advertiser for Android
        if (Platform.OS === 'android') {
          console.log('[BLE] Initializing ReactNativeBleAdvertiser for Android...');
          this.initializeBleAdvertiser();
        }
        
        // Set up state change listener
        this.stateSubscription = this.manager.onStateChange((state) => {
          console.log('[BLE] State changed:', state);
          if (state === State.PoweredOn) {
            this.bleAvailable = true;
            console.log('[BLE] Bluetooth is powered on');
          } else {
            this.bleAvailable = false;
            console.log('[BLE] Bluetooth is not powered on:', state);
          }
        }, true);
        
        this.bleAvailable = true;
        logger.info('[BLE] BluetoothManager initialized successfully');
        
      } else {
        this.initializationError = 'Platform not supported';
        logger.error('[BLE] Platform not supported:', Platform.OS);
      }
    } catch (error) {
      this.initializationError = error instanceof Error ? error.message : String(error);
      logger.error('[BLE] Initialization error:', error);
    }
  }

  /**
   * Initialize BLE advertiser
   */
  private initializeBleAdvertiser(): void {
    console.log('[BLE] Initializing BLE advertiser...');
    
    try {
      // Check if the module is available
      if (TpBleAdvertiser && typeof TpBleAdvertiser === 'object') {
        const moduleMethods = Object.keys(TpBleAdvertiser);
        console.log('[BLE] Available methods:', moduleMethods);
        
        const hasStartBroadcast = typeof TpBleAdvertiser.startBroadcast === 'function';
        const hasStopBroadcast = typeof TpBleAdvertiser.stopBroadcast === 'function';
        
        if (hasStartBroadcast && hasStopBroadcast) {
          this.advertiser = TpBleAdvertiser;
          console.log('[BLE] ✅ tp-rn-ble-advertiser initialized successfully');
          this.initializationError = null;
        } else {
          console.error('[BLE] ❌ tp-rn-ble-advertiser module missing required methods');
          console.error('[BLE] Expected methods: startBroadcast, stopBroadcast');
          console.error('[BLE] Available methods:', moduleMethods);
          this.initializationError = 'tp-rn-ble-advertiser module missing required methods';
        }
      } else {
        console.log('[BLE] tp-rn-ble-advertiser not available on this platform');
        this.initializationError = null; // Not an error, just not available
      }
    } catch (error) {
      console.log('[BLE] tp-rn-ble-advertiser initialization skipped');
      this.initializationError = null; // Not an error, just not available
    }
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): BluetoothManager {
    if (!BluetoothManager.instance) {
      BluetoothManager.instance = new BluetoothManager();
    }
    return BluetoothManager.instance;
  }

  /**
   * Get initialization error
   */
  getInitializationError(): string | null {
    return this.initializationError;
  }

  /**
   * Check if BLE is available
   */
  isBleAvailable(): boolean {
    return this.bleAvailable && this.manager !== null;
  }

  /**
   * Check if advertising is supported
   */
  isAdvertisingSupported(): boolean {
    return Platform.OS === 'android' && this.advertiser !== null;
  }

  /**
   * Get BLE status
   */
  async getBleStatus(): Promise<{
    available: boolean;
    error: string | null;
    platform: string;
    nativeModuleFound: boolean;
    permissionsGranted: boolean;
    state: string;
  }> {
    const status = {
      available: this.isBleAvailable(),
      error: this.initializationError,
      platform: Platform.OS,
      nativeModuleFound: this.advertiser !== null,
      permissionsGranted: false,
      state: 'unknown'
    };

    try {
      if (this.manager) {
        const state = await this.manager.state();
        status.state = state;
      }

      const permissionStatus = await this.checkPermissions();
      status.permissionsGranted = permissionStatus.granted;
    } catch (error) {
      status.error = error instanceof Error ? error.message : String(error);
    }

    return status;
  }

  /**
   * Add connection listener
   */
  addConnectionListener(listener: (deviceId: string, status: ConnectionStatus) => void): void {
    this.connectionListeners.add(listener);
  }

  /**
   * Remove connection listener
   */
  removeConnectionListener(listener: (deviceId: string, status: ConnectionStatus) => void): void {
    this.connectionListeners.delete(listener);
  }

  /**
   * Notify connection change
   */
  private notifyConnectionChange(deviceId: string, status: ConnectionStatus): void {
    this.connectionListeners.forEach(listener => {
      try {
        listener(deviceId, status);
      } catch (error) {
        console.error('[BLE] Error in connection listener:', error);
      }
    });
  }

  /**
   * Check if Bluetooth is enabled
   */
  async isBluetoothEnabled(): Promise<boolean> {
    try {
      if (!this.manager) {
        return false;
      }
      
      const state = await this.manager.state();
      return state === State.PoweredOn;
    } catch (error) {
      console.error('[BLE] Error checking Bluetooth state:', error);
      return false;
    }
  }

  /**
   * Check if user selected "Don't ask again"
   */
  private static hasNeverAskAgain(results: string[]): boolean {
    return results.some(result => result === 'never_ask_again');
  }

  /**
   * Request permissions with improved logic for already-granted permissions
   */
  async requestPermissionsEnhanced(): Promise<{
    success: boolean;
    grantedPermissions: string[];
    deniedPermissions: string[];
    error?: string;
    needsSettingsRedirect?: boolean;
  }> {
    if (Platform.OS !== 'android') {
      return {
        success: true,
        grantedPermissions: [],
        deniedPermissions: [],
      };
    }

    const requiredPermissions = [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
    ];

    const grantedPermissions: string[] = [];
    const deniedPermissions: string[] = [];

    console.log('[BLE] Starting enhanced permission request...');

    try {
      // First, check which permissions are already granted
      for (const permission of requiredPermissions) {
        try {
          const alreadyGranted = await PermissionsAndroid.check(permission);
          if (alreadyGranted) {
            grantedPermissions.push(permission);
            console.log(`[BLE] ✅ Permission already granted: ${permission}`);
          }
        } catch (error) {
          console.log(`[BLE] Error checking ${permission}:`, error);
        }
      }

      // Request only the permissions that aren't already granted
      for (const permission of requiredPermissions) {
        if (!grantedPermissions.includes(permission)) {
          try {
            console.log(`[BLE] Requesting permission: ${permission}`);
            const result = await PermissionsAndroid.request(permission);
            
            if (result === PermissionsAndroid.RESULTS.GRANTED) {
              grantedPermissions.push(permission);
              console.log(`[BLE] ✅ Permission granted: ${permission}`);
            } else {
              deniedPermissions.push(permission);
              console.log(`[BLE] ❌ Permission denied: ${permission} (result: ${result})`);
            }
          } catch (error) {
            deniedPermissions.push(permission);
            console.log(`[BLE] ❌ Error requesting ${permission}:`, error);
          }
        }
      }

      const hasNeverAskAgain = BluetoothManager.hasNeverAskAgain(deniedPermissions);
      const success = deniedPermissions.length === 0;
      
      console.log(`[BLE] Permission request completed:`);
      console.log(`  - Granted: ${grantedPermissions.length}/${requiredPermissions.length}`);
      console.log(`  - Denied: ${deniedPermissions.length}/${requiredPermissions.length}`);
      console.log(`  - Success: ${success}`);
      console.log(`  - Needs settings: ${hasNeverAskAgain}`);
      
      return {
        success,
        grantedPermissions,
        deniedPermissions,
        needsSettingsRedirect: hasNeverAskAgain
      };

    } catch (error) {
      console.error('[BLE] Error in permission request:', error);
      return {
        success: false,
        grantedPermissions,
        deniedPermissions,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Request all permissions
   */
  async requestAllPermissions(): Promise<boolean> {
    try {
      console.log('[BLE] Requesting all Bluetooth permissions...');
      const result = await this.requestPermissionsEnhanced();
      
      if (result.success) {
        console.log('[BLE] ✅ All Bluetooth permissions granted');
      } else {
        console.warn('[BLE] ❌ Some Bluetooth permissions were denied:', result.deniedPermissions);
        if (result.needsSettingsRedirect) {
          console.warn('[BLE] User needs to go to Settings to grant permissions');
        }
      }
      
      return result.success;
    } catch (error) {
      console.error('[BLE] Error requesting permissions:', error);
      return false;
    }
  }

  /**
   * Check permissions with better handling of already-granted permissions
   */
  async checkPermissions(): Promise<{
    granted: boolean;
    missing: string[];
    details: { [key: string]: string };
  }> {
    if (Platform.OS !== 'android') {
      return { granted: true, missing: [], details: {} };
    }

    const requiredPermissions = [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
    ];

    const details: { [key: string]: string } = {};
    const missing: string[] = [];

    console.log('[BLE] Checking current permission status...');

    for (const permission of requiredPermissions) {
      try {
        const result = await PermissionsAndroid.check(permission);
        details[permission] = result ? 'granted' : 'denied';
        
        if (!result) {
          missing.push(permission);
          console.log(`[BLE] ❌ Permission denied: ${permission}`);
        } else {
          console.log(`[BLE] ✅ Permission granted: ${permission}`);
        }
      } catch (error) {
        details[permission] = 'error';
        missing.push(permission);
        console.log(`[BLE] ❌ Error checking permission ${permission}:`, error);
      }
    }

    const granted = missing.length === 0;
    console.log(`[BLE] Permission check result: ${granted ? '✅ All granted' : '❌ Missing permissions'}`);
    
    return {
      granted,
      missing,
      details
    };
  }

  /**
   * Check if all permissions are granted
   */
  async hasAllPermissions(): Promise<boolean> {
    const status = await this.checkPermissions();
    return status.granted;
  }

  /**
   * Check critical permissions with more lenient logic
   */
  async hasCriticalPermissions(): Promise<{
    granted: boolean;
    missing: string[];
    details: string;
  }> {
    if (Platform.OS !== 'android') {
      return { granted: true, missing: [], details: 'Not Android' };
    }

    // For advertising, we primarily need BLUETOOTH_CONNECT
    // BLUETOOTH_SCAN and BLUETOOTH_ADVERTISE are secondary
    const criticalPermissions = [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ];

    const secondaryPermissions = [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
    ];

    const missing: string[] = [];
    let details = '';

    console.log('[BLE] Checking critical permissions...');

    // Check critical permissions
    for (const permission of criticalPermissions) {
      try {
        const granted = await PermissionsAndroid.check(permission);
        if (!granted) {
          missing.push(permission);
          details += `Critical permission missing: ${permission}\n`;
        } else {
          console.log(`[BLE] ✅ Critical permission granted: ${permission}`);
        }
      } catch (error) {
        missing.push(permission);
        details += `Error checking critical permission ${permission}: ${error}\n`;
      }
    }

    // Check secondary permissions (for debugging)
    for (const permission of secondaryPermissions) {
      try {
        const granted = await PermissionsAndroid.check(permission);
        if (!granted) {
          details += `Secondary permission missing: ${permission}\n`;
        } else {
          console.log(`[BLE] ✅ Secondary permission granted: ${permission}`);
        }
      } catch (error) {
        details += `Error checking secondary permission ${permission}: ${error}\n`;
      }
    }

    const granted = missing.length === 0;
    console.log(`[BLE] Critical permissions: ${granted ? '✅ Granted' : '❌ Missing'}`);
    
    return {
      granted,
      missing,
      details: details.trim()
    };
  }

  /**
   * Check if BLE advertising is truly supported
   */
  async isAdvertisingTrulySupported(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }

    if (!this.isBleAvailable()) {
      return false;
    }

    if (!this.advertiser || 
        typeof this.advertiser.startBroadcast !== 'function' ||
        typeof this.advertiser.stopBroadcast !== 'function') {
      return false;
    }

    const state = await this.manager!.state();
    if (state !== State.PoweredOn) {
      return false;
    }

    const permissionStatus = await this.checkPermissions();
    const criticalPermissions = [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
    ];
    const criticalMissing = permissionStatus.missing.filter(perm =>
      criticalPermissions.includes(perm as any)
    );
    
    return criticalMissing.length === 0;
  }

  /**
   * Start scanning for AirChainPay BLE devices
   */
  startScan(onDeviceFound: (device: Device, paymentData?: BLEPaymentData) => void, timeoutMs: number = 30000): void {
    logger.info('[BLE] Starting scan for AirChainPay devices');
    
    if (!this.isBleAvailable()) {
      throw new BluetoothError('BLE not supported or not initialized', 'BLE_NOT_AVAILABLE');
    }
    
    try {
      this.stopScan();
      
      this.manager!.startDeviceScan(
        null,
        { allowDuplicates: false },
        (error, device) => {
          if (error) {
            return;
          }
          
          if (device) {
            const deviceName = device.name || '';
            const localName = device.localName || '';
            
            // Filter for AirChainPay devices
            if (deviceName.includes(AIRCHAINPAY_DEVICE_PREFIX) || 
                localName.includes(AIRCHAINPAY_DEVICE_PREFIX)) {
              logger.info('[BLE] Found AirChainPay device:', deviceName || localName, device.id);
              
              // Try to parse payment data from device name or manufacturer data
              const paymentData = this.parsePaymentDataFromDevice(device);
              onDeviceFound(device, paymentData);
            }
          }
        }
      );
      
      if (timeoutMs > 0) {
        setTimeout(() => {
          this.stopScan();
        }, timeoutMs);
      }
    } catch (error) {
      throw new BluetoothError(
        `Failed to start scan: ${error instanceof Error ? error.message : String(error)}`,
        'SCAN_ERROR'
      );
    }
  }

  /**
   * Parse payment data from BLE device
   */
  private parsePaymentDataFromDevice(device: Device): BLEPaymentData | undefined {
    try {
      // Try to parse from device name first
      const deviceName = device.name || device.localName || '';
      
      // Look for JSON data in device name (fallback for older devices)
      if (deviceName.includes('{') && deviceName.includes('}')) {
        const jsonStart = deviceName.indexOf('{');
        const jsonEnd = deviceName.lastIndexOf('}') + 1;
        const jsonStr = deviceName.substring(jsonStart, jsonEnd);
        
        const parsed = JSON.parse(jsonStr);
        if (this.isValidPaymentData(parsed)) {
          return parsed;
        }
      }
      
      // Try to parse from manufacturer data if available
      if (device.manufacturerData) {
        const manufacturerData = device.manufacturerData;
        try {
          const decoded = Buffer.from(manufacturerData, 'base64').toString('utf8');
          const parsed = JSON.parse(decoded);
          if (this.isValidPaymentData(parsed)) {
            return parsed;
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }
      
      return undefined;
    } catch (error) {
      logger.warn('[BLE] Error parsing payment data from device:', error);
      return undefined;
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
   * Stop scanning for BLE devices
   */
  stopScan(): void {
    if (this.manager && this.isBleAvailable()) {
      this.manager.stopDeviceScan();
    }
    logger.info('[BLE] Scan stopped');
  }

  /**
   * Start advertising with payment data
   */
  async startAdvertising(paymentData: BLEPaymentData): Promise<{
    success: boolean;
    needsSettingsRedirect?: boolean;
    message?: string;
  }> {
    console.log('[BLE] Starting advertising with payment data:', paymentData);
    
    if (this.isAdvertising) {
      console.log('[BLE] Already advertising, skipping start request');
      return { success: true };
    }

    // Check platform support first (disable advertising on iOS)
    if (Platform.OS !== 'android') {
      console.log('[BLE] Advertising not supported on this platform');
      return { success: false, message: 'BLE advertising is not supported on iOS. Scanning is available.' };
    }

    // Check advertiser availability
      if (!this.advertiser) {
      console.warn('[BLE] No advertiser available');
      return { 
        success: false, 
        message: 'BLE advertiser not available. Please ensure tp-rn-ble-advertiser is properly installed.' 
      };
    }

    try {
      // Check BLE availability
      if (!this.isBleAvailable()) {
        return {
          success: false,
          message: 'Bluetooth LE is not available on this device'
        };
      }

      // Check permissions with detailed feedback
      const criticalPermissionStatus = await this.hasCriticalPermissions();
      if (!criticalPermissionStatus.granted) {
        const missingPermissions = criticalPermissionStatus.missing.map(perm => {
          switch (perm) {
            case PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN:
              return 'Bluetooth Scan';
            case PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT:
              return 'Bluetooth Connect';
            case PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE:
              return 'Bluetooth Advertise';
            default:
              return perm;
          }
        });
        
        const needsSettings = criticalPermissionStatus.missing.some(perm => 
          [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, 
           PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT, 
           PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE].includes(perm as any)
        );
        
        return {
          success: false,
          message: `Missing critical Bluetooth permissions: ${missingPermissions.join(', ')}. Please grant permissions in Settings.`,
          needsSettingsRedirect: needsSettings
        };
      }

      // Check Bluetooth state
      const bluetoothEnabled = await this.isBluetoothEnabled();
      if (!bluetoothEnabled) {
        return {
          success: false,
          message: 'Bluetooth is not enabled. Please enable Bluetooth in your device settings.'
        };
      }

      // Create advertising message
      const advertisingMessage = this.createAdvertisingMessage(paymentData);
      console.log('[BLE] Created advertising message:', advertisingMessage);

      // Start advertising with retry
      await this.startAdvertisingWithRetry(advertisingMessage);
      
      // Auto-stop after 60 seconds
      this.advertisingTimeout = setTimeout(() => {
        this.stopAdvertising();
      }, 60000);
      
      console.log('[BLE] ✅ Advertising started successfully!');
      return { success: true };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[BLE] Advertising failed:', errorMessage);
      
      // Provide more specific error messages
      if (errorMessage.includes('timeout')) {
        return { success: false, message: 'Advertising start timed out. Please try again.' };
      } else if (errorMessage.includes('permission')) {
        return { success: false, message: 'Permission denied. Please grant Bluetooth permissions.' };
      } else if (errorMessage.includes('bluetooth')) {
        return { success: false, message: 'Bluetooth error. Please ensure Bluetooth is enabled and try again.' };
      } else {
        return { success: false, message: `Advertising failed: ${errorMessage}` };
      }
    }
  }

  /**
   * Create advertising message with payment data
   */
  private createAdvertisingMessage(paymentData: BLEPaymentData): string {
    return JSON.stringify({
      name: this.deviceName,
      serviceUUID: AIRCHAINPAY_SERVICE_UUID,
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
   * Start advertising with retry mechanism
   */
  private async startAdvertisingWithRetry(advertisingMessage: string): Promise<void> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[BLE] Advertising attempt ${attempt}/${maxRetries}`);
        
        // Ensure advertiser is still available
        if (!this.advertiser || typeof this.advertiser.startBroadcast !== 'function') {
          throw new Error('Advertiser not available or missing startBroadcast method');
        }
        
        // The startBroadcast method is synchronous and doesn't return a Promise
        // It starts the advertising process immediately
        this.advertiser.startBroadcast(advertisingMessage);
        
        // Give the advertising a moment to start
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if advertising started successfully by checking the state
        // Since we can't directly check the advertising state, we'll assume success
        // and let the native module handle any errors
        this.isAdvertising = true;
        console.log(`[BLE] ✅ Advertising started successfully on attempt ${attempt}`);
        return;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`[BLE] Advertising attempt ${attempt} failed:`, lastError.message);
        
        if (attempt < maxRetries) {
          console.log(`[BLE] Retrying in 2s...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Increased delay
        }
      }
    }
    
    throw new BluetoothError(
      `Advertising failed after ${maxRetries} attempts: ${lastError?.message}`,
      'ADVERTISING_RETRY_FAILED'
    );
  }

  /**
   * Start fallback advertising
   */
  private async startFallbackAdvertising(paymentData: BLEPaymentData): Promise<void> {
    console.log('[BLE] Starting fallback advertising...');
    
    // Simulate successful advertising for non-Android platforms
    await new Promise(resolve => setTimeout(resolve, 500));
    
    this.isAdvertising = true;
    console.log('[BLE] ✅ Fallback advertising started successfully');
  }

  /**
   * Stop advertising
   */
  async stopAdvertising(): Promise<void> {
    if (!this.isAdvertising) {
      console.log('[BLE] Not advertising, nothing to stop');
      return;
    }

    console.log('[BLE] Stopping advertising...');

    // Clear auto-stop timeout
    if (this.advertisingTimeout) {
      clearTimeout(this.advertisingTimeout);
      this.advertisingTimeout = null;
    }

    try {
      if (this.advertiser && Platform.OS === 'android') {
        if (typeof this.advertiser.stopBroadcast === 'function') {
          // The stopBroadcast method is synchronous and doesn't return a Promise
          this.advertiser.stopBroadcast();
        } else {
          console.warn('[BLE] stopBroadcast method not available');
        }
      }
      
      this.isAdvertising = false;
      console.log('[BLE] ✅ Advertising stopped successfully');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[BLE] Error stopping advertising:', errorMessage);
      
      // Force stop even if there's an error
      this.isAdvertising = false;
    }
  }

  /**
   * Connect to a BLE device
   */
  async connectToDevice(device: Device): Promise<Device> {
    if (!this.isBleAvailable()) {
      throw new BluetoothError('BLE not available', 'BLE_NOT_AVAILABLE');
    }

    try {
      logger.info('[BLE] Connecting to device:', device.name || device.id);
      
      this.notifyConnectionChange(device.id, ConnectionStatus.CONNECTING);
      // Enforce connect timeout
      const connectedDevice = await Promise.race([
        device.connect(),
        new Promise<Device>((_, reject) => setTimeout(() => reject(new BluetoothError('Connect timeout', 'CONNECT_TIMEOUT')), BluetoothManager.CONFIG.CONNECT_TIMEOUT_MS))
      ]) as Device;
      await connectedDevice.discoverAllServicesAndCharacteristics();
      
      this.connectedDevices.set(device.id, {
        device: connectedDevice,
        status: ConnectionStatus.CONNECTED
      });
      
      this.notifyConnectionChange(device.id, ConnectionStatus.CONNECTED);
      
      logger.info('[BLE] ✅ Device connected successfully');
      return connectedDevice;
      
    } catch (error) {
      this.notifyConnectionChange(device.id, ConnectionStatus.ERROR);
      throw new BluetoothError(
        `Failed to connect to device: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof BluetoothError ? error.code : 'CONNECTION_ERROR'
      );
    }
  }

  /**
   * Disconnect from a BLE device
   */
  async disconnectFromDevice(deviceId: string): Promise<void> {
    const deviceState = this.connectedDevices.get(deviceId);
    if (!deviceState) {
      return;
    }

    try {
      await deviceState.device.cancelConnection();
      this.connectedDevices.delete(deviceId);
      this.notifyConnectionChange(deviceId, ConnectionStatus.DISCONNECTED);
      logger.info('[BLE] Device disconnected:', deviceId);
    } catch (error) {
      logger.error('[BLE] Error disconnecting device:', error);
    }
  }

  /**
   * Get connected devices
   */
  getConnectedDevices(): Map<string, DeviceConnectionState> {
    return this.connectedDevices;
  }

  /**
   * Check if device is connected
   */
  isDeviceConnected(deviceId: string): boolean {
    const deviceState = this.connectedDevices.get(deviceId);
    return deviceState?.status === ConnectionStatus.CONNECTED;
  }

  /**
   * Send data to connected device
   */
  async sendDataToDevice(
    deviceId: string, 
    serviceUUID: string, 
    characteristicUUID: string, 
    data: string
  ): Promise<void> {
    const deviceState = this.connectedDevices.get(deviceId);
    if (!deviceState || deviceState.status !== ConnectionStatus.CONNECTED) {
      throw new BluetoothError('Device not connected', 'DEVICE_NOT_CONNECTED');
    }

    const payloadBase64 = Buffer.from(data, 'utf8').toString('base64');
    await this.writeWithTimeoutAndRetry(deviceState.device, serviceUUID, characteristicUUID, payloadBase64);
  }

  /**
   * Listen for data from connected device
   */
  async listenForData(
    deviceId: string, 
    serviceUUID: string, 
    characteristicUUID: string, 
    onData: (data: string) => void
  ): Promise<{ remove: () => void }> {
    const deviceState = this.connectedDevices.get(deviceId);
    if (!deviceState || deviceState.status !== ConnectionStatus.CONNECTED) {
      throw new BluetoothError('Device not connected', 'DEVICE_NOT_CONNECTED');
    }

    try {
      const subscription = await deviceState.device.monitorCharacteristicForService(
        serviceUUID,
        characteristicUUID,
        (error, characteristic) => {
          if (error) {
            logger.error('[BLE] Error monitoring characteristic:', error);
            return;
          }
          
          if (characteristic?.value) {
            const data = Buffer.from(characteristic.value, 'base64').toString('utf8');
            onData(data);
          }
        }
      );
      
      logger.info('[BLE] Started listening for data:', characteristicUUID);
      
      return {
        remove: () => {
          // Remove the subscription if available
          if (subscription && typeof subscription.remove === 'function') {
            subscription.remove();
          }
          logger.info('[BLE] Data listener removed');
        }
      };
    } catch (error) {
      throw new BluetoothError(
        `Failed to start listening: ${error instanceof Error ? error.message : String(error)}`,
        'LISTEN_ERROR'
      );
    }
  }

  /**
   * Send large data by chunking into small frames. base64Data must be a base64-encoded string of the raw payload.
   */
  async sendLargeDataToDevice(
    deviceId: string,
    serviceUUID: string,
    characteristicUUID: string,
    base64Data: string
  ): Promise<void> {
    const deviceState = this.connectedDevices.get(deviceId);
    if (!deviceState || deviceState.status !== ConnectionStatus.CONNECTED) {
      throw new BluetoothError('Device not connected', 'DEVICE_NOT_CONNECTED');
    }

    const id = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const total = Math.ceil(base64Data.length / BluetoothManager.CONFIG.CHUNK_PAYLOAD_SIZE);

    for (let i = 0; i < total; i++) {
      const start = i * BluetoothManager.CONFIG.CHUNK_PAYLOAD_SIZE;
      const end = Math.min(start + BluetoothManager.CONFIG.CHUNK_PAYLOAD_SIZE, base64Data.length);
      const d = base64Data.slice(start, end);
      const frame = JSON.stringify({ t: 'chunk', id, i, n: total, d });
      const frameB64 = Buffer.from(frame, 'utf8').toString('base64');
      await this.writeWithTimeoutAndRetry(deviceState.device, serviceUUID, characteristicUUID, frameB64);
    }

    // Send end marker
    const endFrame = JSON.stringify({ t: 'end', id });
    const endFrameB64 = Buffer.from(endFrame, 'utf8').toString('base64');
    await this.writeWithTimeoutAndRetry(deviceState.device, serviceUUID, characteristicUUID, endFrameB64);
  }

  /**
   * Listen and reassemble chunked messages.
   */
  async listenForChunks(
    deviceId: string,
    serviceUUID: string,
    characteristicUUID: string,
    onMessage: (utf8Data: string) => void
  ): Promise<{ remove: () => void }> {
    const assemblies = new Map<string, { parts: string[]; total: number; timer?: NodeJS.Timeout }>();

    const clearAssembly = (id: string) => {
      const a = assemblies.get(id);
      if (a?.timer) clearTimeout(a.timer);
      assemblies.delete(id);
    };

    const listener = await this.listenForData(
      deviceId,
      serviceUUID,
      characteristicUUID,
      (data: string) => {
        try {
          const obj = JSON.parse(data);
          if (obj && (obj.t === 'chunk' || obj.t === 'end')) {
            const id: string = obj.id;
            if (obj.t === 'chunk') {
              const total: number = obj.n;
              const index: number = obj.i;
              const part: string = obj.d;
              let asm = assemblies.get(id);
              if (!asm) {
                asm = { parts: new Array(total).fill(''), total, timer: undefined };
                // Cleanup timer per message
                asm.timer = setTimeout(() => clearAssembly(id), BluetoothManager.CONFIG.LISTEN_MESSAGE_TIMEOUT_MS);
                assemblies.set(id, asm);
              }
              asm.parts[index] = part;
            } else if (obj.t === 'end') {
              const asm = assemblies.get(id);
              if (asm) {
                const fullBase64 = asm.parts.join('');
                const utf8Data = Buffer.from(fullBase64, 'base64').toString('utf8');
                clearAssembly(id);
                onMessage(utf8Data);
              }
            }
            return;
          }
          // Not a chunked frame, pass through
          onMessage(data);
        } catch {
          onMessage(data);
        }
      }
    );

    return listener;
  }

  /**
   * Internal helper: write with timeout and retry using exponential backoff
   */
  private async writeWithTimeoutAndRetry(device: Device, serviceUUID: string, characteristicUUID: string, base64Value: string): Promise<void> {
    let attempt = 0;
    const max = BluetoothManager.CONFIG.MAX_WRITE_RETRIES;
    const writeOnce = async () => {
      return await Promise.race([
        device.writeCharacteristicWithResponseForService(serviceUUID, characteristicUUID, base64Value),
        new Promise((_, reject) => setTimeout(() => reject(new BluetoothError('Write timeout', 'WRITE_TIMEOUT')), BluetoothManager.CONFIG.WRITE_TIMEOUT_MS))
      ]);
    };

    while (true) {
      try {
        const characteristic = await writeOnce();
        logger.info('[BLE] Data sent successfully:', (characteristic as any).uuid);
        return;
      } catch (error) {
        attempt++;
        if (attempt > max) {
          throw new BluetoothError(
            `Failed to send data: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof BluetoothError ? error.code : 'SEND_ERROR'
          );
        }
        const delayMs = Math.pow(2, attempt - 1) * 200; // 200, 400, 800ms
        await new Promise(res => setTimeout(res, delayMs));
      }
    }
  }

  /**
   * Get discovered peripherals
   */
  async getDiscoveredPeripherals(): Promise<Device[]> {
    if (!this.manager) {
      return [];
    }

    try {
      return await this.manager.devices([]);
    } catch (error) {
      logger.error('[BLE] Error getting discovered peripherals:', error);
      return [];
    }
  }

  /**
   * Get connected peripherals
   */
  async getConnectedPeripherals(serviceUUIDs: string[] = []): Promise<Device[]> {
    if (!this.manager) {
      return [];
    }

    try {
      return await this.manager.connectedDevices(serviceUUIDs);
    } catch (error) {
      logger.error('[BLE] Error getting connected peripherals:', error);
      return [];
    }
  }



  /**
   * Clean up resources
   */
  destroy(): void {
    logger.info('[BLE] Destroying BluetoothManager...');
    
    // Stop advertising
    if (this.isAdvertising) {
      this.stopAdvertising();
    }
    
    // Stop scanning
    this.stopScan();
    
    // Disconnect all devices
    this.connectedDevices.forEach((deviceState, deviceId) => {
      this.disconnectFromDevice(deviceId);
    });
    
    // Clear listeners
    this.connectionListeners.clear();
    
    // Clear subscriptions
    if (this.stateSubscription) {
      this.stateSubscription.remove();
      this.stateSubscription = null;
    }
    
    // Clear timeouts
    if (this.advertisingTimeout) {
      clearTimeout(this.advertisingTimeout);
      this.advertisingTimeout = null;
    }
    
    // Destroy manager
    if (this.manager) {
      this.manager.destroy();
      this.manager = null;
    }
    
    // Clear instance
    BluetoothManager.instance = null;
    
    logger.info('[BLE] BluetoothManager destroyed');
  }


} 