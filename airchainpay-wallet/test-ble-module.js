#!/usr/bin/env node

console.log('🧪 Testing BLE Module Import...');

// Test react-native-ble-manager import
try {
  console.log('1. Testing react-native-ble-manager import...');
  const BleManager = require('react-native-ble-manager');
  console.log('✅ react-native-ble-manager imported successfully');
  console.log('BleManager type:', typeof BleManager);
  
  if (typeof BleManager === 'function') {
    console.log('✅ BleManager is a constructor function');
  } else {
    console.log('❌ BleManager is not a constructor function');
  }
} catch (error) {
  console.log('❌ Failed to import react-native-ble-manager:', error.message);
}

// Test react-native-ble-plx import
try {
  console.log('\n2. Testing react-native-ble-plx import...');
  const { BleManager: BleManagerPlx } = require('react-native-ble-plx');
  console.log('✅ react-native-ble-plx imported successfully');
  console.log('BleManager type:', typeof BleManagerPlx);
  
  if (typeof BleManagerPlx === 'function') {
    console.log('✅ BleManager is a constructor function');
  } else {
    console.log('❌ BleManager is not a constructor function');
  }
} catch (error) {
  console.log('❌ Failed to import react-native-ble-plx:', error.message);
}

// Test NativeModules
try {
  console.log('\n3. Testing NativeModules...');
  const { NativeModules } = require('react-native');
  
  console.log('Available native modules:', Object.keys(NativeModules));
  
  // Check for BLE-related modules
  const bleModules = Object.keys(NativeModules).filter(name => 
    name.toLowerCase().includes('ble') || 
    name.toLowerCase().includes('bluetooth')
  );
  
  if (bleModules.length > 0) {
    console.log('✅ Found BLE-related native modules:', bleModules);
  } else {
    console.log('❌ No BLE-related native modules found');
  }
} catch (error) {
  console.log('❌ Failed to check NativeModules:', error.message);
}

console.log('\n🎉 BLE module test complete!'); 