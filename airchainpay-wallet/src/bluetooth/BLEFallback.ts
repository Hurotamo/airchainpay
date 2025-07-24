// BLE Fallback Module for when native module is not available
import { BLEError } from '../utils/ErrorClasses';

export class BLEFallback {
  private isAvailable: boolean = false;
  private error: string | null = null;

  constructor() {
    this.isAvailable = false;
    this.error = 'Native BLE module not available - using fallback mode';
    console.log('[BLE] Initializing BLE fallback module');
  }

  isBleAvailable(): boolean {
    return this.isAvailable;
  }

  getInitializationError(): string | null {
    return this.error;
  }

  async requestPermissions(): Promise<boolean> {
    console.warn('[BLE] Permissions requested but BLE not available - using fallback');
    return false;
  }

  async isBluetoothEnabled(): Promise<boolean> {
    console.warn('[BLE] Bluetooth state check requested but BLE not available - using fallback');
    return false;
  }

  async startScan(): Promise<void> {
    console.warn('[BLE] Scan requested but BLE not available - using fallback');
    throw new BLEError('BLE not available - native module missing. Please ensure react-native-ble-plx is properly installed and linked.');
  }

  async stopScan(): Promise<void> {
    console.log('[BLE] Stop scan called on fallback - no-op');
    // No-op
  }

  async connectToDevice(deviceId: string): Promise<unknown> {
    console.warn('[BLE] Connect requested but BLE not available - using fallback');
    throw new BLEError('BLE not available - native module missing. Please ensure react-native-ble-plx is properly installed and linked.');
  }

  async disconnectFromDevice(deviceId: string): Promise<void> {
    console.log('[BLE] Disconnect called on fallback - no-op');
    // No-op
  }

  async startAdvertising(): Promise<void> {
    console.warn('[BLE] Advertising requested but BLE not available - using fallback');
    throw new BLEError('BLE not available - native module missing. Please ensure react-native-ble-plx is properly installed and linked.');
  }

  async stopAdvertising(): Promise<void> {
    console.log('[BLE] Stop advertising called on fallback - no-op');
    // No-op
  }

  destroy(): void {
    console.log('[BLE] Destroy called on fallback - no-op');
    // No-op
  }

  async checkAdvertisingSupport(): Promise<{
    supported: boolean;
    details: unknown;
    missingRequirements: string[];
  }> {
    return {
      supported: false,
      details: {
        bluetoothEnabled: false,
        bleAvailable: false,
        hasPermissions: false,
        hasAdvertisingFeature: false,
        platformSupport: false,
        availableMethods: []
      },
      missingRequirements: [
        'Native BLE module not available',
        'react-native-ble-plx not properly installed',
        'Native module not linked correctly'
      ]
    };
  }

  // Add state method to match the interface
  async state(): Promise<string> {
    console.log('[BLE] State check called on fallback - returning PoweredOff');
    return 'PoweredOff';
  }

  // Add other methods that might be called
  startDeviceScan(): void {
    console.warn('[BLE] Start device scan called on fallback');
  }

  stopDeviceScan(): void {
    console.log('[BLE] Stop device scan called on fallback - no-op');
  }

  cancelDeviceConnection(): Promise<void> {
    console.log('[BLE] Cancel device connection called on fallback - no-op');
    return Promise.resolve();
  }
}

export default BLEFallback;
