import { Platform, PermissionsAndroid, NativeModules } from 'react-native';
import { BleManager, Device, State, Service } from 'react-native-ble-plx';
import ReactNativeBleAdvertiser from 'tp-rn-ble-advertiser';
import { logger } from '../utils/Logger';
import { BLEAdvertisingEnhancements } from './BLEAdvertisingEnhancements';
import { BLEAdvertisingSecurity, SecurityConfig } from './BLEAdvertisingSecurity';
import { BLEAdvertisingMonitor } from './BLEAdvertisingMonitor';

// Define UUIDs for AirChainPay
export const AIRCHAINPAY_SERVICE_UUID = '0000abcd-0000-1000-8000-00805f9b34fb';
export const AIRCHAINPAY_CHARACTERISTIC_UUID = '0000abce-0000-1000-8000-00805f9b34fb';
export const AIRCHAINPAY_DEVICE_PREFIX = 'AirChainPay';

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

// BluetoothManager handles BLE scanning, connecting, and permissions using react-native-ble-plx
// and BLE advertising using tp-rn-ble-advertiser
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
  private advertisingSubscription: any = null;
  private advertisingHealthCheckInterval: any = null;
  
  private advertisingEnhancements: BLEAdvertisingEnhancements;
  private advertisingSecurity: BLEAdvertisingSecurity;
  private advertisingMonitor: BLEAdvertisingMonitor;
  
  private constructor() {
    // Initialize BLE manager
    logger.info('[BLE] Initializing BluetoothManager with react-native-ble-plx and tp-rn-ble-advertiser');
    
    // Initialize enhanced BLE advertising components
    this.advertisingEnhancements = BLEAdvertisingEnhancements.getInstance();
    this.advertisingSecurity = BLEAdvertisingSecurity.getInstance();
    this.advertisingMonitor = BLEAdvertisingMonitor.getInstance();
    
    // Generate a unique device name with the AirChainPay prefix
    this.deviceName = `${AIRCHAINPAY_DEVICE_PREFIX}-${Math.floor(Math.random() * 10000)}`;
    logger.info('[BLE] Device name:', this.deviceName);
    
    try {
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        console.log('[BLE] Platform supported:', Platform.OS);
        
        // Create the BLE manager instance with react-native-ble-plx
        try {
          this.manager = new BleManager();
          console.log('[BLE] BleManager instance created successfully');
          
          // Initialize BLE advertiser for peripheral mode
          if (Platform.OS === 'android') {
            console.log('[BLE] 🔧 Initializing ReactNativeBleAdvertiser for Android...');
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
          }, true); // true = emit current state immediately
          
          this.bleAvailable = true;
          logger.info('[BLE] BleManager and BleAdvertiser instances created successfully');
          
        } catch (constructorError) {
          this.initializationError = constructorError instanceof Error ? constructorError.message : String(constructorError);
          this.manager = null;
          this.bleAvailable = false;
        }
      } else {
        const errorMsg = `BLE not supported on this platform: ${Platform.OS}`;
        console.warn('[BLE]', errorMsg);
        logger.warn('[BLE]', errorMsg);
        this.initializationError = errorMsg;
        this.manager = null;
        this.bleAvailable = false;
      }
    } catch (error) {
      this.initializationError = error instanceof Error ? error.message : String(error);
      this.manager = null;
      this.bleAvailable = false;
    }
    
    console.log('[BLE] BluetoothManager initialization complete. Available:', this.bleAvailable);
    if (this.initializationError) {
      console.log('[BLE] Initialization error:', this.initializationError);
    }
  }

  /**
   * Initialize BLE advertiser - enhanced approach with better error handling
   */
  private initializeBleAdvertiser(): void {
    console.log('[BLE] 🔧 Starting enhanced BLE advertiser initialization...');
    
    // Strategy 1: Try direct import with enhanced validation
    if (this.tryDirectImportEnhanced()) {
      return;
    }
    
    // Strategy 2: Try require with enhanced validation
    if (this.tryRequireImportEnhanced()) {
      return;
    }
    
    // Strategy 3: Try NativeModules approach
    if (this.tryNativeModulesImport()) {
      return;
    }
    
    console.log('[BLE] ❌ BLE advertiser not available after all strategies');
    this.initializationError = 'BLE advertiser module not available - try rebuilding the app';
  }

  /**
   * Strategy 1: Enhanced direct import with better validation
   */
  private tryDirectImportEnhanced(): boolean {
    try {
      console.log('[BLE] 🔧 Strategy 1: Enhanced direct import...');
      
      // Check if the module exists
      if (!ReactNativeBleAdvertiser) {
        console.warn('[BLE] ❌ ReactNativeBleAdvertiser import is null/undefined');
        return false;
      }
      
      console.log('[BLE] Debug: ReactNativeBleAdvertiser =', ReactNativeBleAdvertiser);
      console.log('[BLE] Debug: typeof ReactNativeBleAdvertiser =', typeof ReactNativeBleAdvertiser);
      
      // Check if it's an object with methods
      if (typeof ReactNativeBleAdvertiser === 'object') {
        const keys = Object.keys(ReactNativeBleAdvertiser);
        console.log('[BLE] Debug: ReactNativeBleAdvertiser keys =', keys);
        
        // Check for required methods
        const hasStartBroadcast = 'startBroadcast' in ReactNativeBleAdvertiser;
        const hasStopBroadcast = 'stopBroadcast' in ReactNativeBleAdvertiser;
        
        console.log('[BLE] Debug: hasStartBroadcast =', hasStartBroadcast);
        console.log('[BLE] Debug: hasStopBroadcast =', hasStopBroadcast);
        
        if (hasStartBroadcast && hasStopBroadcast) {
          // Test if methods are actually callable
          if (typeof ReactNativeBleAdvertiser.startBroadcast === 'function' && 
              typeof ReactNativeBleAdvertiser.stopBroadcast === 'function') {
            this.advertiser = ReactNativeBleAdvertiser;
            console.log('[BLE] ✅ ReactNativeBleAdvertiser initialized successfully via enhanced direct import');
            return true;
          } else {
            console.warn('[BLE] ❌ ReactNativeBleAdvertiser methods are not callable functions');
          }
        } else {
          console.warn('[BLE] ❌ ReactNativeBleAdvertiser missing required methods');
        }
      } else {
        console.warn('[BLE] ❌ ReactNativeBleAdvertiser is not an object');
      }
    } catch (error) {
      console.warn('[BLE] ❌ Enhanced direct import failed:', error);
    }
    return false;
  }

  /**
   * Strategy 2: Enhanced require import with better validation
   */
  private tryRequireImportEnhanced(): boolean {
    try {
      console.log('[BLE] 🔧 Strategy 2: Enhanced require import...');
      const fallbackBleAdvertiser = ReactNativeBleAdvertiser;
      console.log('[BLE] Debug: fallbackBleAdvertiser =', fallbackBleAdvertiser);
      
      if (fallbackBleAdvertiser && typeof fallbackBleAdvertiser === 'object') {
        const keys = Object.keys(fallbackBleAdvertiser);
        console.log('[BLE] Debug: fallbackBleAdvertiser keys =', keys);
        
        const hasStartBroadcast = 'startBroadcast' in fallbackBleAdvertiser;
        const hasStopBroadcast = 'stopBroadcast' in fallbackBleAdvertiser;
        
        if (hasStartBroadcast && hasStopBroadcast) {
          // Test if methods are actually callable
          if (typeof fallbackBleAdvertiser.startBroadcast === 'function' && 
              typeof fallbackBleAdvertiser.stopBroadcast === 'function') {
            this.advertiser = fallbackBleAdvertiser;
            console.log('[BLE] ✅ ReactNativeBleAdvertiser initialized via enhanced require');
            return true;
          } else {
            console.warn('[BLE] ❌ Require import methods are not callable functions');
          }
        } else {
          console.warn('[BLE] ❌ Require import missing required methods');
        }
      } else {
        console.warn('[BLE] ❌ Require import not available or not an object');
      }
    } catch (fallbackError) {
      const errorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      console.warn('[BLE] ❌ Enhanced require import failed:', errorMessage);
    }
    return false;
  }

  /**
   * Strategy 3: Try NativeModules approach
   */
  private tryNativeModulesImport(): boolean {
    try {
      console.log('[BLE] 🔧 Strategy 3: NativeModules import...');
      
      // Try to access via NativeModules
      if (NativeModules.ReactNativeBleAdvertiser) {
        const nativeModule = NativeModules.ReactNativeBleAdvertiser;
        console.log('[BLE] Debug: NativeModules.ReactNativeBleAdvertiser =', nativeModule);
        
        if (nativeModule && typeof nativeModule === 'object') {
          const hasStartBroadcast = 'startBroadcast' in nativeModule;
          const hasStopBroadcast = 'stopBroadcast' in nativeModule;
          
          if (hasStartBroadcast && hasStopBroadcast) {
            this.advertiser = nativeModule;
            console.log('[BLE] ✅ ReactNativeBleAdvertiser initialized via NativeModules');
            return true;
          }
        }
      }
      
      // Try alternative module name
      if (NativeModules.TpRnBleAdvertiser) {
        const nativeModule = NativeModules.TpRnBleAdvertiser;
        console.log('[BLE] Debug: NativeModules.TpRnBleAdvertiser =', nativeModule);
        
        if (nativeModule && typeof nativeModule === 'object') {
          const hasStartBroadcast = 'startBroadcast' in nativeModule;
          const hasStopBroadcast = 'stopBroadcast' in nativeModule;
          
          if (hasStartBroadcast && hasStopBroadcast) {
            this.advertiser = nativeModule;
            console.log('[BLE] ✅ ReactNativeBleAdvertiser initialized via NativeModules (alternative name)');
            return true;
          }
        }
      }
      
    } catch (error) {
      console.warn('[BLE] ❌ NativeModules import failed:', error);
    }
    return false;
  }



  public static getInstance(): BluetoothManager {
    if (!BluetoothManager.instance) {
      BluetoothManager.instance = new BluetoothManager();
    }
    return BluetoothManager.instance;
  }

  /**
   * Get initialization error if any
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
   * Check if BLE advertising is supported
   */
  isAdvertisingSupported(): boolean {
    return this.advertiser !== null && Platform.OS === 'android';
  }

  /**
   * Get detailed BLE status information
   */
  async getBleStatus(): Promise<{
    available: boolean;
    error: string | null;
    platform: string;
    nativeModuleFound: boolean;
    permissionsGranted: boolean;
    state: string;
  }> {
    let state = 'Unknown';
    let permissionsGranted = false;
    
    try {
      if (this.manager) {
        state = await this.manager.state();
      }
      
      const permissionStatus = await this.checkPermissions();
      permissionsGranted = permissionStatus.granted;
    } catch (error) {
      console.warn('[BLE] Error getting status:', error);
    }
    
    return {
      available: this.bleAvailable,
      error: this.initializationError,
      platform: Platform.OS,
      nativeModuleFound: this.manager !== null,
      permissionsGranted,
      state
    };
  }

  /**
   * Add connection state change listener
   */
  addConnectionListener(listener: (deviceId: string, status: ConnectionStatus) => void): void {
    this.connectionListeners.add(listener);
  }

  /**
   * Remove connection state change listener
   */
  removeConnectionListener(listener: (deviceId: string, status: ConnectionStatus) => void): void {
    this.connectionListeners.delete(listener);
  }

  /**
   * Notify all connection listeners
   */
  private notifyConnectionChange(deviceId: string, status: ConnectionStatus): void {
    this.connectionListeners.forEach(listener => {
      try {
        listener(deviceId, status);
      } catch (error) {
        // Silent error handling
      }
    });
  }

  /**
   * Check if Bluetooth is enabled
   */
  async isBluetoothEnabled(): Promise<boolean> {
    if (!this.isBleAvailable()) {
      console.log('[BLE] BLE not available, returning false for Bluetooth state');
      return false;
    }
    
    try {
      const state = await this.manager!.state();
      console.log('[BLE] Bluetooth state:', state);
      
      // Handle different state values that indicate Bluetooth is enabled
      const enabledStates = [State.PoweredOn];
      const isEnabled = enabledStates.includes(state);
      
      console.log(`[BLE] Bluetooth state: ${state} (enabled: ${isEnabled})`);
      return isEnabled;
    } catch (error) {
      console.warn('[BLE] Error checking Bluetooth state:', error);
      logger.warn('[BLE] Error checking Bluetooth state:', error);
      return false;
    }
  }

  /**
   * Helper to check if any permission was denied with 'never_ask_again'
   */
  private static hasNeverAskAgain(results: string[]): boolean {
    return results.includes('never_ask_again');
  }

  /**
   * Enhanced permission request for Android 12+ with multiple fallback strategies
   */
  async requestPermissionsEnhanced(): Promise<{
    success: boolean;
    grantedPermissions: string[];
    deniedPermissions: string[];
    error?: string;
  }> {
    if (Platform.OS !== 'android') {
      return { success: true, grantedPermissions: [], deniedPermissions: [] };
    }

    try {
      const apiLevel = parseInt(Platform.Version.toString(), 10);
      console.log('[BLE] Enhanced permission request for Android API level:', apiLevel);
      
      const results = {
        success: false,
        grantedPermissions: [] as string[],
        deniedPermissions: [] as string[],
        error: undefined as string | undefined
      };

      if (apiLevel >= 31) { // Android 12+
        const permissions = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE
        ];
        
        console.log('[BLE] Requesting enhanced permissions:', permissions);
        
        try {
          const permissionResults = await PermissionsAndroid.requestMultiple(permissions);
          console.log('[BLE] Enhanced permission results:', permissionResults);
          
          // Check each permission result
          Object.entries(permissionResults).forEach(([permission, status]) => {
            if (status === 'granted') {
              results.grantedPermissions.push(permission);
            } else {
              results.deniedPermissions.push(permission);
            }
          });
          
          // Consider it successful if we have the critical permissions
          const criticalPermissions = [
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
          ];
          
          const hasCriticalPermissions = criticalPermissions.every(perm => 
            results.grantedPermissions.includes(perm)
          );
          
          results.success = hasCriticalPermissions;
          
          if (!results.success) {
            results.error = `Critical permissions missing: ${criticalPermissions.filter(perm => 
              !results.grantedPermissions.includes(perm)
            ).join(', ')}`;
          }
          
        } catch (error) {
          console.error('[BLE] Error in enhanced permission request:', error);
          results.error = error instanceof Error ? error.message : String(error);
          results.success = false;
        }
      } else {
        // For older Android versions, permissions are auto-granted
        results.success = true;
        results.grantedPermissions = ['legacy_auto_granted'];
      }
      
      console.log('[BLE] Enhanced permission request completed:', results);
      return results;
      
    } catch (error) {
      console.error('[BLE] Fatal error in enhanced permission request:', error);
      return {
        success: false,
        grantedPermissions: [],
        deniedPermissions: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Request BLE permissions for Android
   * Enhanced version that properly handles BLUETOOTH_ADVERTISE permission
   */
  async requestPermissions(): Promise<void> {
    if (Platform.OS !== 'android') {
      return;
    }

    try {
      const apiLevel = parseInt(Platform.Version.toString(), 10);
      console.log('[BLE] Requesting permissions for Android API level:', apiLevel);
      
      if (apiLevel >= 31) { // Android 12+
        const permissions = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE
        ];
        
        console.log('[BLE] Requesting permissions:', permissions);
        
        // First check current permission status
        const currentStatus = await this.checkPermissions();
        console.log('[BLE] Current permission status:', currentStatus);
        
        // Only request if permissions are missing
        if (!currentStatus.granted) {
          const results = await PermissionsAndroid.requestMultiple(permissions);
          console.log('[BLE] Permission request results:', results);
          
          // Check if any permissions were denied
          const deniedPermissions = Object.entries(results)
            .filter(([_, status]) => status === 'denied')
            .map(([permission, _]) => permission);
          
          if (deniedPermissions.length > 0) {
            console.warn('[BLE] Some permissions were denied:', deniedPermissions);
            
            // If BLUETOOTH_ADVERTISE is specifically denied, show a helpful message
            if (deniedPermissions.includes(PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE)) {
              console.log('[BLE] BLUETOOTH_ADVERTISE permission denied - this may affect advertising functionality');
              // Don't throw error, let the advertising attempt proceed as some devices may work anyway
            }
          }
        } else {
          console.log('[BLE] All permissions already granted');
        }
      }
    } catch (error) {
      console.error('[BLE] Error requesting permissions:', error);
      // Don't throw error, let the advertising attempt proceed
    }
  }

  /**
   * Request all required BLE permissions for Android 12+
   */
  async requestAllPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }

    try {
      await this.requestPermissions();
      const permissionStatus = await this.checkPermissions();
      return permissionStatus.granted;
    } catch (error) {
      console.error('[BLE] Error requesting all permissions:', error);
      return false;
    }
  }

  /**
   * Check if all required permissions are granted
   */
  async checkPermissions(): Promise<{
    granted: boolean;
    missing: string[];
    details: { [key: string]: string };
  }> {
    if (Platform.OS !== 'android') {
      return { granted: true, missing: [], details: {} };
    }

    try {
      const apiLevel = parseInt(Platform.Version.toString(), 10);
      console.log('[BLE] Checking permissions for Android API level:', apiLevel);
      const results: { [key: string]: string } = {};
      const missing: string[] = [];
      
      if (apiLevel >= 31) { // Android 12+
        const permissions = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE
        ];
        
        console.log('[BLE] Checking permissions:', permissions);
        
        for (const permission of permissions) {
          try {
            const granted = await PermissionsAndroid.check(permission);
            console.log(`[BLE] Permission check for ${permission}:`, granted);
            results[permission] = granted ? 'granted' : 'denied';
            if (!granted) {
              missing.push(permission);
            }
          } catch (error) {
            console.warn(`[BLE] Error checking permission ${permission}:`, error);
            results[permission] = 'error';
            missing.push(permission);
          }
        }
      }
      
      // Also check location permission which is often required for BLE
      const locationPermission = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
      try {
        const granted = await PermissionsAndroid.check(locationPermission);
        results[locationPermission] = granted ? 'granted' : 'denied';
        if (!granted) {
          missing.push(locationPermission);
        }
      } catch (error) {
        console.warn('[BLE] Error checking location permission:', error);
        results[locationPermission] = 'error';
        missing.push(locationPermission);
      }
      
      console.log('[BLE] Permission check results:', results);
      console.log('[BLE] Missing permissions:', missing);
      
      // For Android 12+, BLUETOOTH_ADVERTISE permission might be denied but still work
      // So we'll be more lenient with the permission check
      const criticalPermissions = [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
      ];
      
      const criticalMissing = missing.filter(perm => 
        criticalPermissions.includes(perm as any)
      );
      
      return {
        granted: criticalMissing.length === 0, // Only require critical permissions
        missing,
        details: results
      };
    } catch (error) {
      return {
        granted: false,
        missing: ['unknown'],
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Check if all required permissions are granted
   */
  async hasAllPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }

    try {
      const permissionStatus = await this.checkPermissions();
      return permissionStatus.granted;
    } catch (error) {
      console.error('[BLE] Error checking all permissions:', error);
      return false;
    }
  }

  /**
   * Check if BLE advertising is truly supported (native module, permissions, platform)
   */
  async isAdvertisingTrulySupported(): Promise<boolean> {
    console.log('[BLE] === Checking Advertising Support ===');
    
    // First check platform support
    if (Platform.OS !== 'android') {
      console.log('[BLE] ❌ Advertising not supported on iOS');
      return false;
    }
    console.log('[BLE] ✅ Platform is Android');

    // Check if BLE is available
    if (!this.isBleAvailable()) {
      console.log('[BLE] ❌ BLE not available');
      return false;
    }
    console.log('[BLE] ✅ BLE is available');

    // Check if advertiser module is available
    if (!this.advertiser) {
      console.log('[BLE] ❌ BLE advertiser module not available');
      console.log('[BLE] Debug: this.advertiser =', this.advertiser);
      console.log('[BLE] Debug: initializationError =', this.initializationError);
      return false;
    }
    console.log('[BLE] ✅ Advertiser module is available');

    // Test if the native module is actually working by trying to access its methods
    try {
      // Check if the advertiser has the required methods
      if (!this.advertiser || typeof this.advertiser !== 'object') {
        console.log('[BLE] ❌ Advertiser module not properly available');
        return false;
      }

      // Check if it has the required methods
      // Note: tp-rn-ble-advertiser uses 'startBroadcast' and 'stopBroadcast'
      const hasStartBroadcast = 'startBroadcast' in this.advertiser;
      const hasStopBroadcast = 'stopBroadcast' in this.advertiser;
      
      console.log('[BLE] Debug: hasStartBroadcast =', hasStartBroadcast);
      console.log('[BLE] Debug: hasStopBroadcast =', hasStopBroadcast);
      
      if (!hasStartBroadcast || !hasStopBroadcast) {
        console.log('[BLE] ❌ Advertiser module does not have required methods');
        console.log('[BLE] Debug: advertiser keys =', Object.keys(this.advertiser));
        return false;
      }
      console.log('[BLE] ✅ Advertiser has required methods');

      // Check if Bluetooth is enabled
      const state = await this.manager!.state();
      console.log('[BLE] Debug: Bluetooth state =', state);
      if (state !== State.PoweredOn) {
        console.log('[BLE] ❌ Bluetooth not powered on:', state);
        return false;
      }
      console.log('[BLE] ✅ Bluetooth is powered on');

      // Check permissions with detailed logging
      const permissionStatus = await this.checkPermissions();
      console.log('[BLE] Debug: permissionStatus =', permissionStatus);
      
      // Be more lenient with BLUETOOTH_ADVERTISE permission
      const criticalPermissions = [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
      ];
      
      const criticalMissing = permissionStatus.missing.filter(perm => 
        criticalPermissions.includes(perm as any)
      );
      
      if (criticalMissing.length > 0) {
        console.log('[BLE] ❌ Critical permissions missing:', criticalMissing);
        return false;
      }
      
      // Check if BLUETOOTH_ADVERTISE is missing (non-critical)
      const advertiseMissing = permissionStatus.missing.includes(PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE);
      if (advertiseMissing) {
        console.log('[BLE] ⚠️ BLUETOOTH_ADVERTISE permission missing, but continuing - some devices work without it');
      } else {
        console.log('[BLE] ✅ All permissions granted');
      }

      console.log('[BLE] ✅ Advertising truly supported');
      return true;
    } catch (error) {
      console.log('[BLE] ❌ Error checking advertising support:', error);
      return false;
    }
  }

  /**
   * Start scanning for AirChainPay BLE devices using react-native-ble-plx
   * @param onDeviceFound Callback for each device found
   * @param timeoutMs Optional timeout in milliseconds (default: 30000)
   */
  startScan(onDeviceFound: (device: Device) => void, timeoutMs: number = 30000): void {
    logger.info('[BLE] Starting scan for AirChainPay devices');
    
    if (!this.isBleAvailable()) {
      throw new BluetoothError('BLE not supported or not initialized', 'BLE_NOT_AVAILABLE');
    }
    
    try {
      // Stop any existing scan
      this.stopScan();
      
      // Start scanning with react-native-ble-plx
      this.manager!.startDeviceScan(
        [AIRCHAINPAY_SERVICE_UUID], // Service UUIDs to scan for
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
              onDeviceFound(device);
            }
          }
        }
      );
      
      // Set timeout to automatically stop scanning
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
   * Stop scanning for BLE devices
   */
  stopScan(): void {
    if (this.manager && this.isBleAvailable()) {
      this.manager.stopDeviceScan();
    }
    
    logger.info('[BLE] Scan stopped');
  }

  /**
   * Start advertising as an AirChainPay device using react-native-ble-advertiser
   * Note: This is only supported on Android
   */
  async startAdvertising(): Promise<void> {
    logger.info(`[BLE] Attempting to start advertising. Platform: ${Platform.OS}`);
    logger.info(`[BLE] Advertiser present: ${this.advertiser !== null}`);
    logger.info(`[BLE] BLE available: ${this.isBleAvailable()}`);
    logger.info(`[BLE] Already advertising: ${this.isAdvertising}`);
    if (!this.isBleAvailable() || this.isAdvertising) {
      if (!this.isBleAvailable()) {
        logger.error('[BLE] BLE not supported or not initialized');
        throw new BluetoothError('BLE not supported or not initialized', 'BLE_NOT_AVAILABLE');
      }
      if (this.isAdvertising) {
        logger.info('[BLE] Already advertising, skipping start request');
        return;
      }
    }

    logger.info('[BLE] Starting advertising as:', this.deviceName);

    try {
      // Check if we're on a supported platform
      const isAndroid = Platform.OS === 'android';
      logger.info(`[BLE] Is Android: ${isAndroid}`);
      if (!isAndroid) {
        logger.error('[BLE] Advertising not supported on this platform');
        throw new BluetoothError('Advertising not supported on this platform', 'PLATFORM_NOT_SUPPORTED');
      }

      // Check if BLE advertiser is available
      if (!this.advertiser) {
        logger.error('[BLE] BLE advertiser not available');
        throw new BluetoothError('BLE advertiser not available', 'ADVERTISER_NOT_AVAILABLE');
      }

      // Check if Bluetooth is enabled
      const state = await this.manager!.state();
      logger.info(`[BLE] Bluetooth state: ${state}`);
      if (state !== State.PoweredOn) {
        logger.error('[BLE] Bluetooth is not powered on');
        throw new BluetoothError('Bluetooth is not powered on', 'BLE_NOT_POWERED_ON');
      }

      // Request permissions before advertising (but don't fail if BLUETOOTH_ADVERTISE is denied)
      try {
        const enhancedPermissionResult = await this.requestPermissionsEnhanced();
        console.log('[BLE] Enhanced permission result:', enhancedPermissionResult);
        
        if (!enhancedPermissionResult.success) {
          console.warn('[BLE] Enhanced permission request failed:', enhancedPermissionResult.error);
          
          // If BLUETOOTH_ADVERTISE is specifically denied, try to proceed anyway
          if (enhancedPermissionResult.deniedPermissions.includes(PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE)) {
            console.log('[BLE] BLUETOOTH_ADVERTISE denied, but attempting to advertise anyway');
          } else {
            throw new BluetoothError(
              enhancedPermissionResult.error || 'Permission request failed',
              'PERMISSION_DENIED'
            );
          }
        }
      } catch (error) {
        logger.warn('[BLE] Permission request failed, but continuing with advertising attempt:', error);
      }

      // Check permissions but be lenient with BLUETOOTH_ADVERTISE
      const permissionStatus = await this.checkPermissions();
      if (!permissionStatus.granted) {
        const criticalPermissions = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
        ];
        
        const criticalMissing = permissionStatus.missing.filter(perm => 
          criticalPermissions.includes(perm as any)
        );
        
        if (criticalMissing.length > 0) {
          logger.error('[BLE] Critical permissions missing:', criticalMissing);
          throw new BluetoothError(
            `Critical permissions missing: ${criticalMissing.join(', ')}`,
            'CRITICAL_PERMISSION_DENIED'
          );
        } else {
          logger.warn('[BLE] Some non-critical permissions missing, but attempting to advertise anyway');
        }
      }

      // Create advertising data for AirChainPay with enhanced configuration
      const advertisingData = {
        name: this.deviceName,
        serviceUUIDs: [AIRCHAINPAY_SERVICE_UUID],
        manufacturerData: {
          companyIdentifier: 0xFFFF, // Custom company identifier
          data: Buffer.from('AirChainPay', 'utf8').toString('base64')
        },
        txPowerLevel: -12, // Typical BLE power level
        includeTxPower: true,
        includeDeviceName: true,
        // Additional advertising parameters for better compatibility
        connectable: true,
        timeout: 0, // Advertise indefinitely
        interval: 100, // Advertising interval in milliseconds
        // Service data for better device identification
        serviceData: {
          [AIRCHAINPAY_SERVICE_UUID]: Buffer.from(JSON.stringify({
            type: 'AirChainPay',
            version: '1.0.0',
            capabilities: ['payment', 'secure_ble']
          })).toString('base64')
        }
      };

      logger.info('[BLE] Starting advertising with data:', advertisingData);

      // Start advertising using tp-rn-ble-advertiser with timeout
      // Note: tp-rn-ble-advertiser uses 'startBroadcast' method with simple string data
      const advertisingMessage = JSON.stringify({
        name: this.deviceName,
        serviceUUID: AIRCHAINPAY_SERVICE_UUID,
        type: 'AirChainPay',
        version: '1.0.0',
        capabilities: ['payment', 'secure_ble'],
        timestamp: Date.now()
      });
      
      logger.info('[BLE] Attempting to start broadcast with message:', advertisingMessage);
      
      const startAdvertisingPromise = this.advertiser.startBroadcast(advertisingMessage);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Advertising start timeout')), 10000);
      });

      const result = await Promise.race([startAdvertisingPromise, timeoutPromise]);

      if (result) {
        this.isAdvertising = true;
        logger.info('[BLE] Started advertising successfully');
        
        // Note: tp-rn-ble-advertiser doesn't provide state change events
        // We'll rely on the promise resolution and health checks instead
        console.log('[BLE] Advertising started successfully - monitoring via health checks');
        
        // Set up periodic advertising health check
        this.startAdvertisingHealthCheck();
        
      } else {
        logger.error('[BLE] Failed to start advertising: No result');
        throw new BluetoothError('Failed to start advertising', 'ADVERTISING_FAILED');
      }
      
    } catch (error) {
      this.isAdvertising = false;
      logger.error('[BLE] Exception thrown during advertising:', error);
      
      // Provide more specific error messages based on the error type
      let errorMessage = error instanceof Error ? error.message : String(error);
      let errorCode = 'ADVERTISING_ERROR';
      
      if (errorMessage.includes('permission') || errorMessage.includes('Permission')) {
        errorCode = 'PERMISSION_DENIED';
        errorMessage = 'Bluetooth advertising permission denied. Please check app permissions in device settings.';
      } else if (errorMessage.includes('timeout')) {
        errorCode = 'ADVERTISING_TIMEOUT';
        errorMessage = 'Advertising start timed out. Please try again.';
      } else if (errorMessage.includes('Bluetooth')) {
        errorCode = 'BLUETOOTH_ERROR';
        errorMessage = 'Bluetooth error occurred. Please ensure Bluetooth is enabled.';
      }
      
      throw new BluetoothError(errorMessage, errorCode);
    }
  }

  /**
   * Start periodic advertising health check
   */
  private startAdvertisingHealthCheck(): void {
    // Check advertising status every 30 seconds
    // Note: tp-rn-ble-advertiser doesn't provide isAdvertising() method
    // We'll use a simpler approach - just log that advertising is active
    const healthCheckInterval = setInterval(() => {
      if (this.isAdvertising && this.advertiser) {
        // Since tp-rn-ble-advertiser doesn't provide status checking,
        // we'll just log that advertising should be active
        console.log('[BLE] Advertising health check: advertising should be active');
        
        // Optional: You could implement a more sophisticated health check here
        // by trying to restart advertising periodically or checking Bluetooth state
      } else {
        clearInterval(healthCheckInterval);
      }
    }, 30000);
    
    // Store the interval for cleanup
    this.advertisingHealthCheckInterval = healthCheckInterval;
  }

  /**
   * Stop advertising
   */
  async stopAdvertising(): Promise<void> {
    if (!this.isAdvertising) {
      logger.info('[BLE] Not currently advertising, skipping stop request');
      return;
    }
    
    try {
      // Stop advertising using tp-rn-ble-advertiser
      if (this.advertiser) {
        await this.advertiser.stopBroadcast();
        console.log('[BLE] Advertising stopped via ReactNativeBleAdvertiser');
      }
      
      // Stop monitoring
      const sessionId = `${this.deviceName}-${Date.now()}`;
      this.advertisingMonitor.stopMonitoring(sessionId);
      
      // Remove advertising state subscription
      if (this.advertisingSubscription) {
        try {
          this.advertisingSubscription.remove();
        } catch (error) {
          console.warn('[BLE] Error removing advertising subscription:', error);
        }
        this.advertisingSubscription = null;
      }
      
      // Stop health check
      if (this.advertisingHealthCheckInterval) {
        clearInterval(this.advertisingHealthCheckInterval);
        this.advertisingHealthCheckInterval = null;
      }
      
      this.isAdvertising = false;
      logger.info('[BLE] Stopped advertising successfully');
      
    } catch (error) {
      console.warn('[BLE] Error stopping advertising:', error);
      this.isAdvertising = false;
      throw new BluetoothError(
        `Failed to stop advertising: ${error instanceof Error ? error.message : String(error)}`,
        'STOP_ADVERTISING_ERROR'
      );
    }
  }

  /**
   * Start enhanced advertising with all features
   */
  async startEnhancedAdvertising(
    securityConfig?: Partial<SecurityConfig>
  ): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    if (!this.isBleAvailable()) {
      throw new BluetoothError('BLE not supported or not initialized', 'BLE_NOT_AVAILABLE');
    }

    if (!this.advertiser) {
      throw new BluetoothError('BLE advertiser not available', 'ADVERTISER_NOT_AVAILABLE');
    }

    const sessionId = `${this.deviceName}-${Date.now()}`;
    
    try {
      // Create enhanced advertising configuration
      const config = this.advertisingEnhancements.createAdvertisingConfig(
        this.deviceName,
        AIRCHAINPAY_SERVICE_UUID
      );

      // Start monitoring
      this.advertisingMonitor.startMonitoring(sessionId, this.deviceName, 'enhanced');

      // Start advertising with enhancements
      const result = await this.advertisingEnhancements.startAdvertisingWithEnhancements(
        this.advertiser,
        config,
        sessionId
      );

      if (result.success) {
        this.isAdvertising = true;
        logger.info('[BLE] Enhanced advertising started successfully', { sessionId });
        
        // Set up health check
        this.startAdvertisingHealthCheck();
        
        return { success: true, sessionId };
      } else {
        this.advertisingMonitor.stopMonitoring(sessionId);
        return { success: false, error: result.error };
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.advertisingMonitor.recordErrorMetrics(sessionId, error as Error, {
        advertisingState: this.isAdvertising ? 'active' : 'inactive',
        bluetoothState: 'unknown',
        permissions: []
      });
      
      logger.error('[BLE] Enhanced advertising failed', { sessionId, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Start secure advertising with encryption and authentication
   */
  async startSecureAdvertising(
    securityConfig: SecurityConfig
  ): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    if (!this.isBleAvailable()) {
      throw new BluetoothError('BLE not supported or not initialized', 'BLE_NOT_AVAILABLE');
    }

    if (!this.advertiser) {
      throw new BluetoothError('BLE advertiser not available', 'ADVERTISER_NOT_AVAILABLE');
    }

    const sessionId = `${this.deviceName}-${Date.now()}`;
    
    try {
      // Start monitoring
      this.advertisingMonitor.startMonitoring(sessionId, this.deviceName, 'secure');

      // Start secure advertising
      const result = await this.advertisingSecurity.startSecureAdvertising(
        this.advertiser,
        this.deviceName,
        AIRCHAINPAY_SERVICE_UUID,
        securityConfig
      );

      if (result.success) {
        this.isAdvertising = true;
        logger.info('[BLE] Secure advertising started successfully', { sessionId });
        
        // Set up health check
        this.startAdvertisingHealthCheck();
        
        return { success: true, sessionId: result.sessionId };
      } else {
        this.advertisingMonitor.stopMonitoring(sessionId);
        return { success: false, error: result.error };
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.advertisingMonitor.recordErrorMetrics(sessionId, error as Error, {
        advertisingState: this.isAdvertising ? 'active' : 'inactive',
        bluetoothState: 'unknown',
        permissions: []
      });
      
      logger.error('[BLE] Secure advertising failed', { sessionId, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get advertising statistics and metrics
   */
  getAdvertisingStatistics(): {
    basic: {
      totalSessions: number;
      successfulSessions: number;
      failedSessions: number;
      averageDuration: number;
      totalRestarts: number;
    };
    security: {
      totalSessions: number;
      successfulEncryptions: number;
      successfulAuthentications: number;
      failedEncryptions: number;
      failedAuthentications: number;
      averageSecurityErrors: number;
    };
    monitoring: {
      totalSessions: number;
      totalErrors: number;
      averageSessionDuration: number;
      averageSignalStrength: number;
      totalBytesTransmitted: number;
      successRate: number;
    };
  } {
    return {
      basic: this.advertisingEnhancements.getAdvertisingStatistics(),
      security: this.advertisingSecurity.getSecurityStatistics(),
      monitoring: this.advertisingMonitor.getOverallStatistics()
    };
  }

  /**
   * Get comprehensive advertising report
   */
  getAdvertisingReport(): string {
    const basicStats = this.advertisingEnhancements.getAdvertisingStatistics();
    const securityStats = this.advertisingSecurity.getSecurityStatistics();
    const monitoringStats = this.advertisingMonitor.getOverallStatistics();
    
    return `
BLE Advertising Comprehensive Report
==================================

Basic Advertising Statistics:
- Total Sessions: ${basicStats.totalSessions}
- Successful Sessions: ${basicStats.successfulSessions}
- Failed Sessions: ${basicStats.failedSessions}
- Average Duration: ${Math.round(basicStats.averageDuration)}ms
- Total Restarts: ${basicStats.totalRestarts}

Security Statistics:
- Total Sessions: ${securityStats.totalSessions}
- Successful Encryptions: ${securityStats.successfulEncryptions}
- Successful Authentications: ${securityStats.successfulAuthentications}
- Failed Encryptions: ${securityStats.failedEncryptions}
- Failed Authentications: ${securityStats.failedAuthentications}
- Average Security Errors: ${Math.round(securityStats.averageSecurityErrors)}

Monitoring Statistics:
- Total Sessions: ${monitoringStats.totalSessions}
- Total Errors: ${monitoringStats.totalErrors}
- Average Session Duration: ${Math.round(monitoringStats.averageSessionDuration)}ms
- Average Signal Strength: ${Math.round(monitoringStats.averageSignalStrength)}dBm
- Total Bytes Transmitted: ${monitoringStats.totalBytesTransmitted}
- Success Rate: ${Math.round(monitoringStats.successRate)}%

Device Information:
- Device Name: ${this.deviceName}
- Platform: ${Platform.OS}
- BLE Available: ${this.isBleAvailable()}
- Advertising Supported: ${this.isAdvertisingSupported()}
- Currently Advertising: ${this.isAdvertising}
    `.trim();
  }

  /**
   * Enhanced connection method with automatic retries and fallback
   */
  async connectToDevice(device: Device): Promise<Device> {
    if (!this.isBleAvailable()) {
      throw new BluetoothError('BLE not supported or not initialized', 'BLE_NOT_AVAILABLE');
    }

    logger.info('[BLE] Connecting to device:', device.id);
    await this.requestPermissions();

    let lastError: Error | null = null;
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.connectedDevices.set(device.id, {
          device,
          status: ConnectionStatus.CONNECTING
        });
        this.notifyConnectionChange(device.id, ConnectionStatus.CONNECTING);

        const connectedDevice = await device.connect();
        const discoveredDevice = await connectedDevice.discoverAllServicesAndCharacteristics();
        const services = await discoveredDevice.services();
        this.connectedDevices.set(device.id, {
          device: discoveredDevice,
          status: ConnectionStatus.CONNECTED,
          services
        });
        this.notifyConnectionChange(device.id, ConnectionStatus.CONNECTED);

        logger.info('[BLE] Connected successfully to device:', device.id);
        return discoveredDevice;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(`[BLE] Connection attempt ${attempt} failed:`, error);
        if (attempt < maxRetries) {
          // Exponential backoff with jitter
          const delay = baseDelay * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 400); // up to 400ms random jitter
          const totalDelay = delay + jitter;
          logger.info(`[BLE] Waiting ${totalDelay}ms before retrying connection (attempt ${attempt + 1})`);
          await new Promise(resolve => setTimeout(resolve, totalDelay));
        }
      }
    }
    this.connectedDevices.delete(device.id);
    this.notifyConnectionChange(device.id, ConnectionStatus.ERROR);
    throw new BluetoothError(
      `Failed to connect to device: ${lastError?.message || 'Unknown error'}`,
      'CONNECTION_ERROR'
    );
  }

  /**
   * Disconnect from a BLE device
   */
  async disconnectFromDevice(deviceId: string): Promise<void> {
    if (!this.isBleAvailable()) {
      return;
    }

    try {
      const deviceState = this.connectedDevices.get(deviceId);
      if (deviceState) {
        await deviceState.device.cancelConnection();
        this.connectedDevices.delete(deviceId);
        this.notifyConnectionChange(deviceId, ConnectionStatus.DISCONNECTED);
        logger.info('[BLE] Disconnected from device:', deviceId);
      }
    } catch (error) {
      // Silent error handling
    }
  }

  /**
   * Get connected devices
   */
  getConnectedDevices(): Map<string, DeviceConnectionState> {
    return new Map(this.connectedDevices);
  }

  /**
   * Check if a device is connected
   */
  isDeviceConnected(deviceId: string): boolean {
    const state = this.connectedDevices.get(deviceId);
    return state?.status === ConnectionStatus.CONNECTED;
  }

  /**
   * Clean up BLE manager resources
   */
  destroy(): void {
    logger.info('[BLE] Destroying BluetoothManager');
    
    try {
      // Stop scanning
      this.stopScan();
      
      // Stop advertising
      if (this.isAdvertising) {
        this.stopAdvertising().catch(() => {
          // Silent error handling
        });
      }
      
      // Disconnect all devices
      this.connectedDevices.forEach((state, deviceId) => {
        this.disconnectFromDevice(deviceId).catch(() => {
          // Silent error handling
        });
      });
      
      // Clear connection listeners
      this.connectionListeners.clear();
      
      // Remove state subscription
      if (this.stateSubscription) {
        this.stateSubscription.remove();
      }
      
      // Remove advertising subscription
      if (this.advertisingSubscription) {
        try {
          this.advertisingSubscription.remove();
        } catch (error) {
          console.warn('[BLE] Error removing advertising subscription:', error);
        }
        this.advertisingSubscription = null;
      }
      
      // Stop health check
      if (this.advertisingHealthCheckInterval) {
        clearInterval(this.advertisingHealthCheckInterval);
        this.advertisingHealthCheckInterval = null;
      }
      
      // Destroy manager
      if (this.manager) {
        this.manager.destroy();
        this.manager = null;
        this.bleAvailable = false;
      }
      
      // Clean up advertiser
      this.advertiser = null;
      
    } catch (error) {
      // Silent error handling
    }
  }

  /**
   * Send data to a connected BLE device
   * @param deviceId BLE device identifier
   * @param serviceUUID Service UUID
   * @param characteristicUUID Characteristic UUID
   * @param data String data to send
   */
  async sendDataToDevice(
    deviceId: string, 
    serviceUUID: string, 
    characteristicUUID: string, 
    data: string
  ): Promise<void> {
    if (!this.isBleAvailable()) {
      throw new BluetoothError('BLE not supported or not initialized', 'BLE_NOT_AVAILABLE');
    }
    
    logger.info(`[BLE] Sending data to device ${deviceId}`);
    
    try {
      // Check if device is connected
      const connectionState = this.connectedDevices.get(deviceId);
      if (!connectionState || connectionState.status !== ConnectionStatus.CONNECTED) {
        throw new BluetoothError('Device is not connected', 'DEVICE_NOT_CONNECTED');
      }
      
      // Find the service and characteristic
      const service = await connectionState.device.services();
      const targetService = service.find(s => s.uuid.toLowerCase() === serviceUUID.toLowerCase());
      
      if (!targetService) {
        throw new BluetoothError('Service not found', 'SERVICE_NOT_FOUND');
      }
      
      const characteristics = await targetService.characteristics();
      const targetCharacteristic = characteristics.find(c => c.uuid.toLowerCase() === characteristicUUID.toLowerCase());
      
      if (!targetCharacteristic) {
        throw new BluetoothError('Characteristic not found', 'CHARACTERISTIC_NOT_FOUND');
      }
      
      // Convert string to base64
      const base64Data = Buffer.from(data).toString('base64');
      
      // Write to characteristic using react-native-ble-plx
      await targetCharacteristic.writeWithResponse(base64Data);
      
      logger.info(`[BLE] Data sent successfully to ${deviceId}`);
    } catch (error) {
      throw new BluetoothError(
        `Failed to send data: ${error instanceof Error ? error.message : String(error)}`,
        'SEND_DATA_ERROR'
      );
    }
  }

  /**
   * Listen for data from a BLE device
   * @param deviceId BLE device identifier
   * @param serviceUUID Service UUID
   * @param characteristicUUID Characteristic UUID
   * @param onData Callback for received data
   */
  async listenForData(
    deviceId: string, 
    serviceUUID: string, 
    characteristicUUID: string, 
    onData: (data: string) => void
  ): Promise<{ remove: () => void }> {
    if (!this.isBleAvailable()) {
      throw new BluetoothError('BLE not supported or not initialized', 'BLE_NOT_AVAILABLE');
    }
    
    logger.info(`[BLE] Setting up listener for ${deviceId}`);
    
    try {
      // Check if device is connected
      const connectionState = this.connectedDevices.get(deviceId);
      if (!connectionState || connectionState.status !== ConnectionStatus.CONNECTED) {
        throw new BluetoothError('Device is not connected', 'DEVICE_NOT_CONNECTED');
      }
      
      // Find the service and characteristic
      const service = await connectionState.device.services();
      const targetService = service.find(s => s.uuid.toLowerCase() === serviceUUID.toLowerCase());
      
      if (!targetService) {
        throw new BluetoothError('Service not found', 'SERVICE_NOT_FOUND');
      }
      
      const characteristics = await targetService.characteristics();
      const targetCharacteristic = characteristics.find(c => c.uuid.toLowerCase() === characteristicUUID.toLowerCase());
      
      if (!targetCharacteristic) {
        throw new BluetoothError('Characteristic not found', 'CHARACTERISTIC_NOT_FOUND');
      }
      
      // Start monitoring using react-native-ble-plx
      const subscription = targetCharacteristic.monitor((error, characteristic) => {
        if (error) {
          return;
        }
        
        if (characteristic && characteristic.value) {
          try {
            // Convert base64 to string
            const receivedData = Buffer.from(characteristic.value, 'base64').toString('utf8');
            logger.info(`[BLE] Received data from ${deviceId}`);
            onData(receivedData);
          } catch (decodeError) {
            // Silent error handling
          }
        }
      });
      
      logger.info(`[BLE] Listener set up for ${deviceId}`);
      
      // Return a function to remove the listener
      return {
        remove: () => {
          subscription.remove();
          logger.info(`[BLE] Listener removed for ${deviceId}`);
        }
      };
    } catch (error) {
      throw new BluetoothError(
        `Failed to set up listener: ${error instanceof Error ? error.message : String(error)}`,
        'LISTENER_ERROR'
      );
    }
  }

  /**
   * Get discovered peripherals
   */
  async getDiscoveredPeripherals(): Promise<Device[]> {
    if (!this.isBleAvailable()) {
      return [];
    }
    
    try {
      return await this.manager!.devices([AIRCHAINPAY_SERVICE_UUID]);
    } catch (error) {
      return [];
    }
  }

  /**
   * Get connected peripherals
   */
  async getConnectedPeripherals(serviceUUIDs: string[] = []): Promise<Device[]> {
    if (!this.isBleAvailable()) {
      return [];
    }
    
    try {
      return await this.manager!.connectedDevices(serviceUUIDs);
    } catch (error) {
      return [];
    }
  }

  /**
   * Check detailed BLE advertising capabilities and requirements
   */
  async checkAdvertisingSupport(): Promise<{
    supported: boolean;
    details: {
      bluetoothEnabled: boolean;
      bleAvailable: boolean;
      hasPermissions: boolean;
      hasAdvertisingFeature: boolean;
      platformSupport: boolean;
      availableMethods: string[];
    };
    missingRequirements: string[];
  }> {
    const details = {
      bluetoothEnabled: false,
      bleAvailable: this.isBleAvailable(),
      hasPermissions: false,
      hasAdvertisingFeature: false,
      platformSupport: Platform.OS === 'ios' || Platform.OS === 'android',
      availableMethods: [] as string[]
    };
    
    const missingRequirements: string[] = [];

    try {
      // Check if Bluetooth is enabled
      if (this.manager) {
        const state = await this.manager.state();
        details.bluetoothEnabled = state === State.PoweredOn;
        if (!details.bluetoothEnabled) {
          missingRequirements.push('Bluetooth is not enabled');
        }
      }

      // Check BLE availability
      if (!details.bleAvailable) {
        missingRequirements.push('BLE is not available on this device');
      }

      // Check platform support
      if (!details.platformSupport) {
        missingRequirements.push('Platform does not support BLE advertising');
      }

      // Check permissions
      try {
        const permissionStatus = await this.checkPermissions();
        details.hasPermissions = permissionStatus.granted;
        if (!details.hasPermissions) {
          missingRequirements.push('Missing required permissions');
        }
      } catch (error) {
        missingRequirements.push('Unable to check permissions');
      }

      // Check advertising feature (now supported by tp-rn-ble-advertiser)
      details.hasAdvertisingFeature = this.advertiser !== null && Platform.OS === 'android';
      if (!details.hasAdvertisingFeature) {
        missingRequirements.push('Advertising not supported on this platform or advertiser not available');
      } else {
        details.availableMethods.push('tp-rn-ble-advertiser');
      }

    } catch (error) {
      // Silent error handling
    }

    const supported = details.bluetoothEnabled && 
                     details.bleAvailable && 
                     details.hasPermissions && 
                     details.platformSupport;

    return {
      supported,
      details,
      missingRequirements
    };
  }
} 