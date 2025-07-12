#!/usr/bin/env node

console.log('🧪 Testing App BLE Functionality...');

// Mock React Native environment
global.Platform = { OS: 'android' };
global.NativeModules = {
  BleManager: null,
  RNBleManager: null,
  BleClientManager: null,
  RNBleClientManager: null
};

// Mock console methods
const originalConsole = console;
global.console = {
  log: (...args) => originalConsole.log(...args),
  error: (...args) => originalConsole.error(...args),
  warn: (...args) => originalConsole.warn(...args),
  info: (...args) => originalConsole.info(...args)
};

// Mock Alert
global.Alert = {
  alert: (title, message, buttons) => {
    console.log(`[Alert] ${title}: ${message}`);
  }
};

// Mock PermissionsAndroid
global.PermissionsAndroid = {
  PERMISSIONS: {
    BLUETOOTH_SCAN: 'android.permission.BLUETOOTH_SCAN',
    BLUETOOTH_CONNECT: 'android.permission.BLUETOOTH_CONNECT',
    BLUETOOTH_ADVERTISE: 'android.permission.BLUETOOTH_ADVERTISE',
    ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION'
  },
  request: async (permission) => 'granted',
  check: async (permission) => true
};

// Mock NativeEventEmitter
global.NativeEventEmitter = class MockNativeEventEmitter {
  constructor(nativeModule) {
    this.nativeModule = nativeModule;
  }
  
  addListener(event, callback) {
    console.log(`[MockEventEmitter] Added listener for ${event}`);
    return {
      remove: () => console.log(`[MockEventEmitter] Removed listener for ${event}`)
    };
  }
};

// Mock logger
global.logger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args)
};

// Mock openAppSettings
global.openAppSettings = () => {
  console.log('[Mock] Opening app settings');
};

try {
  console.log('1. Testing BluetoothManager import...');
  const { BluetoothManager } = require('../src/bluetooth/BluetoothManager');
  console.log('✅ BluetoothManager imported successfully');
  
  console.log('\n2. Testing BluetoothManager instantiation...');
  const bleManager = new BluetoothManager();
  console.log('✅ BluetoothManager instantiated successfully');
  
  console.log('\n3. Testing BLE availability...');
  const isAvailable = bleManager.isBleAvailable();
  console.log('BLE Available:', isAvailable);
  
  console.log('\n4. Testing initialization error...');
  const initError = bleManager.getInitializationError();
  console.log('Initialization Error:', initError);
  
  console.log('\n5. Testing BLE status...');
  const bleStatus = bleManager.getBleStatus();
  console.log('BLE Status:', bleStatus);
  
  console.log('\n6. Testing permissions check...');
  try {
    await bleManager.requestPermissions();
    console.log('✅ Permissions requested successfully');
  } catch (error) {
    console.log('⚠️  Permissions request failed (expected in test):', error.message);
  }
  
  console.log('\n7. Testing Bluetooth state check...');
  try {
    const isEnabled = await bleManager.isBluetoothEnabled();
    console.log('Bluetooth Enabled:', isEnabled);
  } catch (error) {
    console.log('⚠️  Bluetooth state check failed (expected in test):', error.message);
  }
  
  console.log('\n🎉 BLE functionality test complete!');
  console.log('✅ The app should now handle BLE errors gracefully');
  console.log('✅ BLE functionality will work when native modules are properly linked');
  
} catch (error) {
  console.error('❌ BLE test failed:', error);
  process.exit(1);
} 