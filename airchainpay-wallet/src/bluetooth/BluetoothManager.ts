import { Platform, PermissionsAndroid, NativeModules } from 'react-native';
import { BleManager, Device, State, Service, Subscription } from 'react-native-ble-plx';
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

// BLE Advertiser interface
interface BLEAdvertiser {
  startBroadcast: (deviceName: string) => void;
  stopBroadcast: () => void;
  setDeviceName?: (name: string) => Promise<void>;
  setManufacturerData?: (companyId: number[], data: string) => Promise<void>;
  [key: string]: unknown;
}

// Advertising configuration interface
interface AdvertisingConfig {
  advertiseMode?: string;
  txPowerLevel?: string;
  connectable?: boolean;
  includeDeviceName?: boolean;
  includeTxPowerLevel?: boolean;
}

// Native Android Location Enabler interface
interface AndroidLocationEnabler {
  isLocationEnabled?: () => Promise<boolean>;
  checkLocationSetting?: (options: { needGPSEnable: boolean }) => Promise<boolean | string>;
  [key: string]: unknown;
}

// Native BLE Advertiser interface
interface NativeBLEAdvertiser {
  canAdvertise?: () => Promise<boolean>;
  isMultipleAdvertisementSupported?: () => Promise<boolean>;
  isAdvertiseSupported?: () => Promise<boolean>;
  isSupported?: () => Promise<boolean>;
  [key: string]: unknown;
}


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
  private advertiser: BLEAdvertiser | null = null;
  private isAdvertising: boolean = false;
  private connectedDevices: Map<string, DeviceConnectionState> = new Map();
  private scanSubscription: Subscription | null = null;
  public deviceName: string = '';
  private connectionListeners: Set<(deviceId: string, status: ConnectionStatus) => void> = new Set();
  private discoveryListeners: Set<(device: Device, paymentData?: BLEPaymentData) => void> = new Set();
  private bleAvailable: boolean = false;
  private initializationError: string | null = null;
  private stateSubscription: Subscription | null = null;
  private advertisingTimeout: NodeJS.Timeout | null = null;
  private isScanning: boolean = false;
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
    
    // Don't generate device name here - generate it when advertising starts
    this.deviceName = '';
    logger.info('[BLE] BluetoothManager initialized - device name will be set when advertising starts');
    
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
        
        // Initialize availability from current state
        try {
          this.manager.state().then((state) => {
            this.bleAvailable = state === State.PoweredOn;
            console.log('[BLE] Initial state:', state);
          }).catch(() => {
            this.bleAvailable = false;
          });
        } catch {
          this.bleAvailable = false;
        }
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
    } catch {
      console.log('[BLE] tp-rn-ble-advertiser initialization skipped');
      this.initializationError = null; // Not an error, just not available
    }
  }

  /**
   * Ensure Location Services are enabled (Android ≤ 11 requirement for BLE scan visibility)
   */
  async ensureLocationServicesEnabled(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }

    const apiLevel = typeof Platform.Version === 'number'
      ? Platform.Version
      : parseInt(String(Platform.Version), 10) || 0;

    // Only enforce on Android API < 31
    if (apiLevel >= 31) {
      return true;
    }

    // Use NativeModules if RNAndroidLocationEnabler is present; otherwise do not block
    const RNAndroidLocationEnabler: AndroidLocationEnabler = (NativeModules as Record<string, unknown>).RNAndroidLocationEnabler as AndroidLocationEnabler;
    if (RNAndroidLocationEnabler) {
      try {
        if (typeof RNAndroidLocationEnabler.isLocationEnabled === 'function') {
          const enabled = await RNAndroidLocationEnabler.isLocationEnabled();
          return !!enabled;
        }
        if (typeof RNAndroidLocationEnabler.checkLocationSetting === 'function') {
          const status = await RNAndroidLocationEnabler.checkLocationSetting({ needGPSEnable: false });
          return status === true || status === 'enabled';
        }
      } catch {
        return false;
      }
    }

    console.log('[BLE] ensureLocationServicesEnabled: native checker not available; assuming enabled');
    return true;
  }

  /**
   * Check if location services are enabled and provide user guidance
   */
  async checkLocationServicesStatus(): Promise<{
    enabled: boolean;
    needsLocation: boolean;
    message: string;
    canScan: boolean;
  }> {
    if (Platform.OS !== 'android') {
      return {
        enabled: true,
        needsLocation: false,
        message: 'Location services not required on this platform',
        canScan: true
      };
    }

    const apiLevel = typeof Platform.Version === 'number'
      ? Platform.Version
      : parseInt(String(Platform.Version), 10) || 0;

    // API >= 31 doesn't require location services for BLE scanning
    if (apiLevel >= 31) {
      return {
        enabled: true,
        needsLocation: false,
        message: 'Location services not required on Android 12+',
        canScan: true
      };
    }

    // API < 31 requires location services for BLE scanning
    const locationEnabled = await this.ensureLocationServicesEnabled();
    
    if (!locationEnabled) {
      return {
        enabled: false,
        needsLocation: true,
        message: 'Location services must be enabled for BLE scanning on Android 11 and below. Please enable location services in your device settings.',
        canScan: false
      };
    }

    return {
      enabled: true,
      needsLocation: true,
      message: 'Location services are enabled - BLE scanning should work',
      canScan: true
    };
  }

  /**
   * Best-effort check for BLE peripheral advertising capability on Android
   */
  private async canAdvertise(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }

    if (!this.manager) {
      return false;
    }

    const state = await this.manager.state();
    if (state !== State.PoweredOn) {
      return false;
    }

    // Require advertiser module presence
    if (!this.advertiser || typeof this.advertiser.startBroadcast !== 'function' || typeof this.advertiser.stopBroadcast !== 'function') {
      return false;
    }

    // If the native module exposes a capability probe, use it
    const nativeAdvertiser: NativeBLEAdvertiser = (NativeModules as Record<string, unknown>).TpBleAdvertiser as NativeBLEAdvertiser
       || (NativeModules as Record<string, unknown>).ReactNativeBleAdvertiser as NativeBLEAdvertiser
       || (NativeModules as Record<string, unknown>).BleAdvertiser as NativeBLEAdvertiser
      || null;

    try {
      const probeNames = [
        'canAdvertise',
        'isMultipleAdvertisementSupported',
        'isAdvertiseSupported',
        'isSupported',
      ];
      for (const name of probeNames) {
        const fn = nativeAdvertiser && typeof nativeAdvertiser[name] === 'function' ? nativeAdvertiser[name] : null;
        if (fn) {
          const result = await fn();
          return !!result;
        }
      }
    } catch {
      // Ignore and use fallback below
    }

    // Fallback: assume supported if advertiser module exists and Bluetooth is powered on
    return true;
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
   * Subscribe to discovered AirChainPay devices
   */
  onDeviceDiscovered(listener: (device: Device, paymentData?: BLEPaymentData) => void): { remove: () => void } {
    this.discoveryListeners.add(listener);
    return {
      remove: () => this.discoveryListeners.delete(listener)
    };
  }

  private emitDeviceDiscovered(device: Device, paymentData?: BLEPaymentData): void {
    this.discoveryListeners.forEach(cb => {
      try { cb(device, paymentData); } catch (err) { console.warn('[BLE] discovery listener error', err); }
    });
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

    const apiLevel = typeof Platform.Version === 'number'
      ? Platform.Version
      : parseInt(String(Platform.Version), 10) || 0;

    const requiredPermissions = apiLevel >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        ]
      : [
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
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

    const apiLevel = typeof Platform.Version === 'number'
      ? Platform.Version
      : parseInt(String(Platform.Version), 10) || 0;

    const requiredPermissions = apiLevel >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        ]
      : [
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
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

    const apiLevel = typeof Platform.Version === 'number'
      ? Platform.Version
      : parseInt(String(Platform.Version), 10) || 0;

    // API-gated critical permissions
    const criticalPermissions = apiLevel >= 31
      ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
      : [
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ];

    const secondaryPermissions = apiLevel >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        ]
      : [];

    const missing: string[] = [];
    let details = '';

    console.log('[BLE] Checking critical permissions...');

    // Check critical permissions (API logic: on <31, either fine or coarse is acceptable)
    if (apiLevel >= 31) {
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
    } else {
      // API < 31: consider granted if either FINE or COARSE is granted
      try {
        const fineGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        const coarseGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
        if (!fineGranted && !coarseGranted) {
          missing.push(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION
          );
          details += 'Critical permission missing: location (fine or coarse)\n';
        } else {
          console.log('[BLE] ✅ Critical permission granted: location (fine or coarse)');
        }
      } catch (error) {
        missing.push(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION
        );
        details += `Error checking critical location permission: ${error}\n`;
      }
    }

    // Check secondary permissions (for debugging) only on API >= 31
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

    if (!this.advertiser || typeof this.advertiser.startBroadcast !== 'function' || typeof this.advertiser.stopBroadcast !== 'function') {
      return false;
    }

    const state = await this.manager!.state();
    if (state !== State.PoweredOn) {
      return false;
    }

    const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10) || 0;

    // On legacy Android (<31), do not gate by BLUETOOTH_* runtime perms. Check hardware capability.
    if (apiLevel < 31) {
      return await this.canAdvertise();
    }

    // API >= 31: require runtime permissions PLUS capability
    const permissionStatus = await this.checkPermissions();
    const criticalPermissions = [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    ];
    const criticalMissing = permissionStatus.missing.filter((perm) => criticalPermissions.includes(perm as (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS]));
    if (criticalMissing.length > 0) {
      return false;
    }

    return await this.canAdvertise();
  }

  /**
   * Start scanning for AirChainPay BLE devices
   */
  async startScan(onDeviceFound: (device: Device, paymentData?: BLEPaymentData) => void, timeoutMs: number = 30000): Promise<void> {
    logger.info('[BLE] Starting scan for AirChainPay devices');
    
    if (!this.isBleAvailable()) {
      throw new BluetoothError('BLE not supported or not initialized', 'BLE_NOT_AVAILABLE');
    }
    
    try {
      // Ensure Bluetooth radio is powered on
      const state = await this.manager!.state();
      if (state !== State.PoweredOn) {
        throw new BluetoothError('Bluetooth is not powered on', 'BLUETOOTH_OFF');
      }

      // Ensure runtime permissions are granted on Android
      if (Platform.OS === 'android') {
        const permissionStatus = await this.checkPermissions();
        if (!permissionStatus.granted) {
          const req = await this.requestPermissionsEnhanced();
          if (!req.success) {
            throw new BluetoothError('Bluetooth permissions denied', 'PERMISSION_DENIED');
          }
        }
      }

      // Check location services status for Android
      if (Platform.OS === 'android') {
        const locationStatus = await this.checkLocationServicesStatus();
        
        if (!locationStatus.canScan) {
          throw new BluetoothError(
            locationStatus.message,
            'LOCATION_SERVICES_DISABLED'
          );
        }
        
        logger.info('[BLE] Location services check passed:', locationStatus.message);
      }

      // Avoid concurrent scans with proper async handling
      if (this.isScanning) {
        logger.info('[BLE] Scan already in progress, stopping before restart');
        await this.forceResetScanState();
        // Wait for the native layer to fully stop scanning
        await new Promise(resolve => setTimeout(resolve, 800));
      }
      
      // Double-check that we're not still scanning
      try {
        this.manager!.stopDeviceScan();
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        // Ignore errors from stopping non-existent scan
        logger.debug('[BLE] Ignored error stopping scan:', error);
      }
      
      this.isScanning = true;
      
      try {
        this.manager!.startDeviceScan(
          null,
          { allowDuplicates: false },
          (error, device) => {
            if (error) {
              // Handle specific BLE errors
              if (error.message?.includes('Location services are disabled')) {
                logger.error('[BLE] Location services disabled - cannot scan for devices');
                logger.error('[BLE] Please enable location services in device settings');
              } else if (error.message?.includes('Cannot start scanning operation')) {
                logger.warn('[BLE] Scanning operation conflict detected - attempting recovery');
                // Try to recover from scanning conflict
                setTimeout(async () => {
                  try {
                    await this.forceResetScanState();
                    logger.info('[BLE] Recovery completed, scan state reset');
                  } catch (recoveryError) {
                    logger.error('[BLE] Recovery failed:', recoveryError);
                  }
                }, 500);
              } else {
                logger.warn('[BLE] Scan error:', error);
              }
              // End scanning state on error from native
              this.isScanning = false;
              // Best-effort stop to clear native scanning state
              try { this.manager!.stopDeviceScan(); } catch {}
              return;
            }
            
            if (device) {
              const deviceName = device.name || '';
              const localName = device.localName || '';
              const displayName = deviceName || localName || 'UNNAMED';
              
              // Log ALL discovered devices for debugging
              logger.info('[BLE] Device discovered:', {
                name: deviceName || 'NO_NAME',
                localName: localName || 'NO_LOCAL_NAME',
                id: device.id,
                rssi: device.rssi,
                manufacturerData: device.manufacturerData ? 'PRESENT' : 'NONE'
              });
              
              // Enhanced filtering for AirChainPay devices
              const isAirChainPayDevice = this.isAirChainPayDevice(device);
              
              logger.info(`[BLE] Device "${displayName}" is AirChainPay: ${isAirChainPayDevice}`);
              
              if (isAirChainPayDevice) {
                logger.info('[BLE] ✅ Found AirChainPay device:', {
                  name: displayName,
                  id: device.id,
                  rssi: device.rssi,
                  manufacturerData: device.manufacturerData
                });
                
                // Try to parse payment data from device
                const paymentData = this.parsePaymentDataFromDevice(device);
                if (paymentData) {
                  logger.info('[BLE] ✅ Parsed payment data:', paymentData);
                } else {
                  logger.warn('[BLE] ⚠️ Could not parse payment data from device');
                }
                
                onDeviceFound(device, paymentData);
                this.emitDeviceDiscovered(device, paymentData);
              } else {
                logger.info(`[BLE] ❌ Device "${displayName}" filtered out (not AirChainPay)`);
              }
            }
          }
        );
      } catch (startScanError) {
        this.isScanning = false;
        logger.error('[BLE] Failed to start device scan:', startScanError);
        
        // If it's a "Cannot start scanning operation" error, try recovery
        if (startScanError instanceof Error && startScanError.message?.includes('Cannot start scanning operation')) {
          logger.warn('[BLE] Attempting scan recovery after start failure');
          setTimeout(async () => {
            try {
              await this.forceResetScanState();
              logger.info('[BLE] Scan recovery completed');
            } catch (recoveryError) {
              logger.error('[BLE] Scan recovery failed:', recoveryError);
            }
          }, 1000);
        }
        
        throw new BluetoothError(
          `Failed to start scanning: ${startScanError instanceof Error ? startScanError.message : String(startScanError)}`,
          'SCAN_START_ERROR'
        );
      }
      
      if (timeoutMs > 0) {
        setTimeout(() => {
          this.stopScan();
        }, timeoutMs);
      }
    } catch (error) {
      this.isScanning = false;
      // Provide specific error messages for common issues
      if (error instanceof BluetoothError) {
        throw error;
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('Location services')) {
        throw new BluetoothError(
          'Location services are disabled. Please enable location services in your device settings to scan for BLE devices.',
          'LOCATION_SERVICES_DISABLED'
        );
      }
      
      throw new BluetoothError(
        `Failed to start scan: ${errorMessage}`,
        'SCAN_ERROR'
      );
    }
  }

  /**
   * Public API used by UI: start scanning and notify listeners only for AirChainPay devices
   */
  async startScanning(timeoutMs: number = 30000): Promise<boolean> {
    try {
      await this.startScan((device, paymentData) => {
        this.emitDeviceDiscovered(device, paymentData);
      }, timeoutMs);
      return true;
    } catch (error) {
      logger.error('[BLE] startScanning error:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /**
   * Public API used by UI to stop scanning
   */
  async stopScanning(): Promise<void> {
    this.stopScan();
  }

  /**
   * Start debug scanning to see all BLE devices (for troubleshooting)
   */
  async startDebugScan(timeoutMs: number = 30000): Promise<void> {
    if (!this.isBleAvailable()) {
      throw new BluetoothError('BLE not supported or not initialized', 'BLE_NOT_AVAILABLE');
    }
    
    try {
      if (Platform.OS === 'android') {
        const locationStatus = await this.checkLocationServicesStatus();
        
        if (!locationStatus.canScan) {
          throw new BluetoothError(
            locationStatus.message,
            'LOCATION_SERVICES_DISABLED'
          );
        }
      }

      this.stopScan();
      
      this.manager!.startDeviceScan(
        null,
        { allowDuplicates: false },
        (error, device) => {
          if (error) {
            if (error.message?.includes('Location services are disabled')) {
              logger.error('[BLE] Location services disabled - cannot scan for devices');
            } else {
              logger.warn('[BLE] Scan error:', error);
            }
            return;
          }
          
          if (device) {
            const deviceName = device.name || '';
            const localName = device.localName || '';
            const manufacturerData = device.manufacturerData;
            
            logger.info('[BLE] Found device:', {
              name: deviceName || 'NO_NAME',
              localName: localName || 'NO_LOCAL_NAME',
              id: device.id,
              rssi: device.rssi,
              manufacturerData: manufacturerData ? 'PRESENT' : 'NONE',
              isAirChainPay: this.isAirChainPayDevice(device),
              rawManufacturerData: manufacturerData || 'NONE'
            });
            
            // Additional debug info for AirChainPay-like devices
            if (deviceName?.includes('AirChainPay') || localName?.includes('AirChainPay')) {
              logger.info('[BLE] 🔍 Potential AirChainPay device detected:', {
                deviceName,
                localName,
                manufacturerData
              });
            }
            
            if (this.isAirChainPayDevice(device)) {
              logger.info('[BLE] 🎯 This IS an AirChainPay device!');
            }
          }
        }
      );
      
      if (timeoutMs > 0) {
        setTimeout(() => {
          this.stopScan();
          logger.info('[BLE] Debug scan completed');
        }, timeoutMs);
      }
    } catch (error) {
      if (error instanceof BluetoothError) {
        throw error;
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('Location services')) {
        throw new BluetoothError(
          'Location services are disabled. Please enable location services in your device settings to scan for BLE devices.',
          'LOCATION_SERVICES_DISABLED'
        );
      }
      
      throw new BluetoothError(
        `Failed to start debug scan: ${errorMessage}`,
        'DEBUG_SCAN_ERROR'
      );
    }
  }

  /**
   * Check if device is an AirChainPay device using multiple detection methods
   */
  private isAirChainPayDevice(device: Device): boolean {
    const deviceName = device.name || '';
    const localName = device.localName || '';
    const name = deviceName || localName;
    const displayName = name || 'UNNAMED';
    
    logger.info(`[BLE] Checking device "${displayName}" (deviceName: "${deviceName}", localName: "${localName}")`);
    
    if (!name) {
      logger.info(`[BLE] Device "${displayName}" rejected: no name`);
      return false;
    }

    // Enhanced matching for AirChainPay devices with various formats:
    // - Exact match: "AirChainPay"
    // - Hyphenated: "AirChainPay-1234" or "AirChainPay-wallet-amount-token"
    // - Underscore with payment data: "AirChainPay_0x1234...abcd_USDC"
    // - Case insensitive matching for robustness
    const nameUpper = name.toUpperCase();
    const prefixUpper = AIRCHAINPAY_DEVICE_PREFIX.toUpperCase();
    
    const exactMatch = nameUpper === prefixUpper;
    const hyphenMatch = nameUpper.startsWith(`${prefixUpper}-`);
    const underscoreMatch = nameUpper.startsWith(`${prefixUpper}_`);
    const containsMatch = nameUpper.includes(prefixUpper); // More permissive matching
    
    logger.info(`[BLE] Device "${displayName}" name checks:`, {
      exactMatch,
      hyphenMatch,
      underscoreMatch,
      containsMatch,
      prefix: AIRCHAINPAY_DEVICE_PREFIX,
      nameLength: name.length
    });
    
    if (exactMatch || hyphenMatch || underscoreMatch || containsMatch) {
      logger.info(`[BLE] Device "${displayName}" ACCEPTED by name matching`);
      return true;
    }

    // Manufacturer data may also carry the identifier
    const manufacturerData = device.manufacturerData;
    if (manufacturerData) {
      try {
        const decoded = Buffer.from(manufacturerData, 'base64').toString('utf8');
        const manufacturerMatch = decoded.toUpperCase().includes(prefixUpper);
        logger.info(`[BLE] Device "${displayName}" manufacturer data check: ${manufacturerMatch}`);
        if (manufacturerMatch) {
          logger.info(`[BLE] Device "${displayName}" ACCEPTED by manufacturer data`);
          return true;
        }
      } catch (error) {
        logger.warn(`[BLE] Device "${displayName}" manufacturer data decode error:`, error);
      }
    } else {
      logger.info(`[BLE] Device "${displayName}" has no manufacturer data`);
    }

    logger.info(`[BLE] Device "${displayName}" REJECTED: does not match AirChainPay patterns`);
    return false;
  }

  /**
   * Parse payment data from BLE device
   */
  private parsePaymentDataFromDevice(device: Device): BLEPaymentData | undefined {
    try {
      const deviceName = device.name || device.localName || '';
      const displayName = deviceName || 'UNNAMED';
      
      logger.info(`[BLE] Parsing payment data from device "${displayName}"`);
      
      // Parse wallet address and token from device name
      // Format: AirChainPay_0x1234567890abcdef1234567890abcdef12345678_USDC
      if (deviceName.startsWith(AIRCHAINPAY_DEVICE_PREFIX)) {
        logger.info(`[BLE] Device "${displayName}" starts with AirChainPay prefix`);
        const parts = deviceName.split('_');
        logger.info(`[BLE] Device "${displayName}" name parts:`, parts);
        
        if (parts.length >= 3) {
          const walletAddress = parts[1];
          const token = parts[2] as SupportedToken;
          
          logger.info(`[BLE] Device "${displayName}" extracted: address="${walletAddress}", token="${token}"`);
          
          // Validate wallet address format (should start with 0x and be 42 characters)
          if (walletAddress.startsWith('0x') && walletAddress.length === 42) {
            if (Object.keys(SUPPORTED_TOKENS).includes(token)) {
              logger.info(`[BLE] Device "${displayName}" token "${token}" is valid`);
              const paymentData = {
                walletAddress,
                amount: '0', // Amount not in advertising for security
                token,
                timestamp: Date.now()
              };
              logger.info(`[BLE] Device "${displayName}" payment data created:`, paymentData);
              return paymentData;
            } else {
              logger.warn(`[BLE] Device "${displayName}" token "${token}" is not supported. Supported tokens:`, Object.keys(SUPPORTED_TOKENS));
            }
          } else {
            logger.warn(`[BLE] Device "${displayName}" wallet address "${walletAddress}" is invalid format`);
          }
        } else {
          logger.warn(`[BLE] Device "${displayName}" name has insufficient parts (expected >= 3, got ${parts.length})`);
        }
      } else {
        logger.info(`[BLE] Device "${displayName}" does not start with AirChainPay prefix`);
      }
      
      logger.warn(`[BLE] Device "${displayName}" could not extract payment data`);
      return undefined;
    } catch (error) {
      logger.warn('[BLE] Error parsing payment data from device:', error);
      return undefined;
    }
  }

  /**
   * Validate payment data structure
   */
  private isValidPaymentData(data: unknown): data is BLEPaymentData {
    return (
      typeof data === 'object' &&
      data !== null &&
      typeof (data as Record<string, unknown>).walletAddress === 'string' &&
      typeof (data as Record<string, unknown>).amount === 'string' &&
      typeof (data as Record<string, unknown>).token === 'string' &&
      Object.keys(SUPPORTED_TOKENS).includes((data as Record<string, unknown>).token as string) &&
      typeof (data as Record<string, unknown>).timestamp === 'number'
    );
  }

  /**
   * Stop scanning for BLE devices
   */
  stopScan(): void {
    if (this.manager && this.isBleAvailable()) {
      this.manager.stopDeviceScan();
    }
    this.isScanning = false;
    logger.info('[BLE] Scan stopped');
  }

  private async stopScanAsync(): Promise<void> {
    return new Promise((resolve) => {
      if (this.manager && this.isBleAvailable()) {
        try {
          this.manager.stopDeviceScan();
        } catch (error) {
          logger.debug('[BLE] Error stopping scan:', error);
        }
      }
      this.isScanning = false;
      logger.info('[BLE] Scan stopped (async)');
      // Give the native layer time to process the stop command
      setTimeout(resolve, 300);
    });
  }

  /**
   * Force reset scanning state - use when scan is stuck
   */
  async forceResetScanState(): Promise<void> {
    logger.info('[BLE] Force resetting scan state');
    
    // Multiple attempts to stop scanning
    for (let i = 0; i < 3; i++) {
      try {
        if (this.manager && this.isBleAvailable()) {
          this.manager.stopDeviceScan();
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        logger.debug(`[BLE] Stop attempt ${i + 1} failed:`, error);
      }
    }
    
    this.isScanning = false;
    logger.info('[BLE] Scan state force reset completed');
  }

  /**
   * Start advertising with payment data
   */
  async startAdvertising(paymentData: BLEPaymentData): Promise<{
    success: boolean;
    needsSettingsRedirect?: boolean;
    message?: string;
  }> {
    if (this.isAdvertising) {
      return { success: true };
    }

    if (Platform.OS !== 'android') {
      return { success: false, message: 'BLE advertising is not supported on iOS. Scanning is available.' };
    }

    if (!this.advertiser) {
      return { 
        success: false, 
        message: 'BLE advertiser not available. Please ensure tp-rn-ble-advertiser is properly installed.' 
      };
    }

    try {
      // Generate advertising message with payment data as device name
      this.deviceName = this.createAdvertisingMessage(paymentData);
      
      if (!this.isBleAvailable()) {
        return {
          success: false,
          message: 'Bluetooth LE is not available on this device'
        };
      }

      const canAdv = await this.canAdvertise();
      if (!canAdv) {
        return { success: false, message: 'Device does not support BLE peripheral advertising' };
      }

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
           PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE].includes(perm as (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS])
        );
        
        return {
          success: false,
          message: `Missing critical Bluetooth permissions: ${missingPermissions.join(', ')}. Please grant permissions in Settings.`,
          needsSettingsRedirect: needsSettings
        };
      }

      const bluetoothEnabled = await this.isBluetoothEnabled();
      if (!bluetoothEnabled) {
        return {
          success: false,
          message: 'Bluetooth is not enabled. Please enable Bluetooth in your device settings.'
        };
      }

      // Device name is already set with payment data, use it for advertising
      await this.startAdvertisingWithRetry(this.deviceName);
      
      this.advertisingTimeout = setTimeout(() => {
        this.stopAdvertising();
      }, 60000);
      
      return { success: true };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
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
    // Use full wallet address in device name for scanner visibility
    // Scanner needs to see the actual wallet address for payment selection
    return `${AIRCHAINPAY_DEVICE_PREFIX}_${paymentData.walletAddress}_${paymentData.token}`;
  }

  /**
   * Check if the advertiser module supports setting device names
   */
  private async checkAdvertiserCapabilities(): Promise<{
    supportsDeviceName: boolean;
    supportsCustomData: boolean;
    methods: string[];
  }> {
    if (!this.advertiser) {
      return {
        supportsDeviceName: false,
        supportsCustomData: false,
        methods: []
      };
    }
    
    const methods = Object.keys(this.advertiser);
    const supportsDeviceName = typeof this.advertiser.setDeviceName === 'function';
    const supportsCustomData = typeof this.advertiser.startBroadcast === 'function';
    
    return {
      supportsDeviceName,
      supportsCustomData,
      methods
    };
  }

  /**
   * Start advertising with retry mechanism
   */
  private async startAdvertisingWithRetry(advertisingMessage: string): Promise<void> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.advertiser || typeof this.advertiser.startBroadcast !== 'function') {
          throw new Error('Advertiser not available or missing startBroadcast method');
        }
        
        // Force stop any existing advertising first
        if (typeof this.advertiser.stopBroadcast === 'function') {
          try {
            this.advertiser.stopBroadcast();
            logger.info('[BLE] Stopped existing advertising');
          } catch (stopError) {
            logger.warn('[BLE] Error stopping existing advertising:', stopError);
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Set device name first - this is critical for scanner visibility
        // Note: tp-rn-ble-advertiser uses device name in startBroadcast() call instead of separate setDeviceName
        if (typeof this.advertiser.setDeviceName === 'function') {
          try {
            await this.advertiser.setDeviceName(advertisingMessage);
            logger.info(`[BLE] ✅ Set device name to: "${advertisingMessage}"`);
          } catch (nameError) {
            logger.warn('[BLE] Error setting device name:', nameError);
            // Continue anyway as some devices may still work
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          // tp-rn-ble-advertiser doesn't provide setDeviceName - device name is set via startBroadcast
          logger.info('[BLE] Using device name in startBroadcast call (tp-rn-ble-advertiser)');
        }
        
        // Also set manufacturer data as backup for device identification
        if (typeof this.advertiser.setManufacturerData === 'function') {
          try {
            const manufacturerData = Buffer.from(advertisingMessage, 'utf8').toString('base64');
            await this.advertiser.setManufacturerData([255, 255], manufacturerData);
            logger.info(`[BLE] ✅ Set manufacturer data for backup identification`);
          } catch (mfgError) {
            logger.warn('[BLE] Error setting manufacturer data:', mfgError);
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Start broadcasting with device name
        if (typeof this.advertiser.startBroadcast === 'function') {
          // The tp-rn-ble-advertiser startBroadcast method expects a device name string
          try {
            // Call startBroadcast with the advertising message (device name)
            this.advertiser.startBroadcast(advertisingMessage);
            logger.info(`[BLE] ✅ Started advertising with device name: "${advertisingMessage}"`);
          } catch (broadcastError) {
            logger.error('[BLE] Broadcast failed:', broadcastError);
            throw broadcastError;
          }
        }
        
        logger.info(`[BLE] 🎯 Advertising active with device name: "${advertisingMessage}"`);
        
        // Wait for advertising to fully initialize
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        this.isAdvertising = true;
        this.deviceName = advertisingMessage; // Store the current device name
        return;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(`[BLE] Advertising attempt ${attempt} failed:`, error);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000));
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
   * Force refresh advertising to ensure device is visible
   */
  async forceRefreshAdvertising(): Promise<boolean> {
    if (!this.advertiser) {
      return false;
    }
    
    try {
      // Stop current advertising
      if (typeof this.advertiser.stopBroadcast === 'function') {
        this.advertiser.stopBroadcast();
        this.isAdvertising = false;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Generate new device name
      this.deviceName = `${AIRCHAINPAY_DEVICE_PREFIX}-${Math.floor(Math.random() * 10000)}`;
      
      // Start fresh advertising
      if (typeof this.advertiser.startBroadcast === 'function') {
        this.advertiser.startBroadcast(this.deviceName);
        await new Promise(resolve => setTimeout(resolve, 3000));
        this.isAdvertising = true;
        return true;
      }
      
      return false;
    } catch {
      return false;
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
        logger.info('[BLE] Data sent successfully:', (characteristic as { uuid?: string }).uuid || 'unknown');
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
   * Get current advertising status
   */
  getAdvertisingStatus(): {
    isAdvertising: boolean;
    deviceName: string;
    advertiserAvailable: boolean;
    capabilities: {
      supportsDeviceName: boolean;
      supportsCustomData: boolean;
    };
  } {
    return {
      isAdvertising: this.isAdvertising,
      deviceName: this.deviceName,
      advertiserAvailable: this.advertiser !== null,
      capabilities: {
        supportsDeviceName: this.advertiser ? typeof this.advertiser.setDeviceName === 'function' : false,
        supportsCustomData: this.advertiser ? typeof this.advertiser.startBroadcast === 'function' : false
      }
    };
  }

  /**
   * Get detailed advertising status (async version with permission checks)
   */
  async getDetailedAdvertisingStatus(): Promise<{
    isAdvertising: boolean;
    deviceName: string;
    advertiserAvailable: boolean;
    platform: string;
    bluetoothEnabled: boolean;
    permissionsGranted: boolean;
    permissionDetails: { [key: string]: string };
    lastError?: string;
    canAdvertise: boolean;
  }> {
    const permissionStatus = await this.checkPermissions();
    const canAdv = await this.canAdvertise();
    
    return {
      isAdvertising: this.isAdvertising,
      deviceName: this.deviceName,
      advertiserAvailable: this.advertiser !== null,
      platform: Platform.OS,
      bluetoothEnabled: this.bleAvailable,
      permissionsGranted: permissionStatus.granted,
      permissionDetails: permissionStatus.details,
      lastError: this.initializationError || undefined,
      canAdvertise: canAdv
    };
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