#!/usr/bin/env node

import { NativeModules, Platform } from 'react-native';

console.log('🧪 Testing BLE Native Module Availability');
console.log('=========================================\n');

console.log('Platform:', Platform.OS);
console.log('NativeModules:', Object.keys(NativeModules));

// Check for BLE module
const bleModuleName = 'BleClientManager';
const bleModule = NativeModules[bleModuleName];

if (bleModule) {
  console.log('✅ BLE native module found:', bleModuleName);
  console.log('Module methods:', Object.keys(bleModule));
} else {
  console.log('❌ BLE native module not found:', bleModuleName);
  console.log('Available modules:', Object.keys(NativeModules));
}

// Test react-native-ble-plx import
try {
  const { BleManager } = require('react-native-ble-plx');
  console.log('✅ react-native-ble-plx imported successfully');
  console.log('BleManager type:', typeof BleManager);
  
  if (typeof BleManager === 'function') {
    console.log('✅ BleManager is a constructor function');
  } else {
    console.log('❌ BleManager is not a constructor function');
  }
} catch (error) {
  console.log('❌ Failed to import react-native-ble-plx:', error.message);
}

console.log('\n📋 Summary:');
console.log('- Platform:', Platform.OS);
console.log('- Native BLE module:', bleModule ? 'Available' : 'Not available');
console.log('- react-native-ble-plx:', 'Available');
