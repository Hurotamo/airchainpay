import { Platform, PermissionsAndroid, Alert } from 'react-native';
import { BleManager, Device, State, Characteristic, Service } from 'react-native-ble-plx';
import BleAdvertiser from 'react-native-ble-advertiser';
import { logger } from '../utils/Logger';
import { openAppSettings } from '../utils/PermissionsHelper';

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
// and BLE advertising using react-native-ble-advertiser
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
  
  private constructor() {
    // Initialize BLE manager
    logger.info('[BLE] Initializing BluetoothManager with react-native-ble-plx and react-native-ble-advertiser');
    
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
            try {
              this.advertiser = BleAdvertiser;
              console.log('[BLE] BleAdvertiser initialized successfully');
            } catch (advertiserError) {
              console.warn('[BLE] BleAdvertiser initialization failed:', advertiserError);
              this.advertiser = null;
            }
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
   * Request BLE permissions for Android
   * OVERRIDDEN: No-op, never show permission dialog
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
        
        const results = await PermissionsAndroid.requestMultiple(permissions);
        console.log('[BLE] Permission request results:', results);
        
        // Check if any permissions were denied
        const deniedPermissions = Object.entries(results)
          .filter(([_, status]) => status === 'denied')
          .map(([permission, _]) => permission);
        
        if (deniedPermissions.length > 0) {
          console.warn('[BLE] Some permissions were denied:', deniedPermissions);
          throw new BluetoothError(
            `Required permissions denied: ${deniedPermissions.join(', ')}`,
            'PERMISSION_DENIED'
          );
        }
      }
    } catch (error) {
      console.error('[BLE] Error requesting permissions:', error);
      throw new BluetoothError(
        `Failed to request permissions: ${error instanceof Error ? error.message : String(error)}`,
        'PERMISSION_ERROR'
      );
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
    if (Platform.OS !== 'android') return false;
    if (!this.advertiser) return false;
    const hasPerms = await this.hasAllPermissions();
    return hasPerms;
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

      // Request permissions before advertising
      await this.requestPermissions();

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

      // Start advertising using react-native-ble-advertiser with timeout
      const startAdvertisingPromise = this.advertiser.startAdvertising(advertisingData);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Advertising start timeout')), 10000);
      });

      const result = await Promise.race([startAdvertisingPromise, timeoutPromise]);

      if (result) {
        this.isAdvertising = true;
        logger.info('[BLE] Started advertising successfully');
        
        // Set up advertising state monitoring with enhanced error handling
        try {
          this.advertisingSubscription = this.advertiser.onAdvertisingStateChanged((state: any) => {
            console.log('[BLE] Advertising state changed:', state);
            if (state === 'stopped' || state === 'error') {
              this.isAdvertising = false;
              logger.info('[BLE] Advertising stopped or failed:', state);
              
              // Attempt to restart advertising if it was stopped unexpectedly
              if (state === 'stopped') {
                setTimeout(() => {
                  if (!this.isAdvertising) {
                    console.log('[BLE] Attempting to restart advertising...');
                    this.startAdvertising().catch(error => {
                      console.warn('[BLE] Failed to restart advertising:', error);
                    });
                  }
                }, 2000);
              }
            } else if (state === 'started') {
              this.isAdvertising = true;
              logger.info('[BLE] Advertising confirmed as started');
            }
          });
        } catch (monitoringError) {
          console.warn('[BLE] Failed to set up advertising state monitoring:', monitoringError);
          // Continue even if monitoring fails
        }
        
        // Set up periodic advertising health check
        this.startAdvertisingHealthCheck();
        
      } else {
        logger.error('[BLE] Failed to start advertising: No result');
        throw new BluetoothError('Failed to start advertising', 'ADVERTISING_FAILED');
      }
      
    } catch (error) {
      this.isAdvertising = false;
      logger.error('[BLE] Exception thrown during advertising:', error);
      throw new BluetoothError(
        `Failed to start advertising: ${error instanceof Error ? error.message : String(error)}`,
        'ADVERTISING_ERROR'
      );
    }
  }

  /**
   * Start periodic advertising health check
   */
  private startAdvertisingHealthCheck(): void {
    // Check advertising status every 30 seconds
    const healthCheckInterval = setInterval(() => {
      if (this.isAdvertising && this.advertiser) {
        // Verify advertising is still active
        this.advertiser.isAdvertising().then((isActive: boolean) => {
          if (!isActive && this.isAdvertising) {
            console.log('[BLE] Advertising health check failed, attempting restart...');
            this.isAdvertising = false;
            this.startAdvertising().catch(error => {
              console.warn('[BLE] Failed to restart advertising during health check:', error);
            });
          }
                 }).catch((error: any) => {
           console.warn('[BLE] Advertising health check error:', error);
         });
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
      // Stop advertising using react-native-ble-advertiser
      if (this.advertiser) {
        await this.advertiser.stopAdvertising();
        console.log('[BLE] Advertising stopped via BleAdvertiser');
      }
      
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

      // Check advertising feature (now supported by react-native-ble-advertiser)
      details.hasAdvertisingFeature = this.advertiser !== null && Platform.OS === 'android';
      if (!details.hasAdvertisingFeature) {
        missingRequirements.push('Advertising not supported on this platform or advertiser not available');
      } else {
        details.availableMethods.push('react-native-ble-advertiser');
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
        // Ensure BLUETOOTH_ADVERTISE is always included
        if (!permissions.includes(PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE)) {
          permissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE);
        }
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
      return {
        granted: missing.length === 0,
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
} 