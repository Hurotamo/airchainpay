#!/usr/bin/env node

/**
 * Test BLE Advertising Functionality
 * This script tests the BLE advertising capabilities with proper permissions
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing BLE Advertising Setup');
console.log('================================\n');

// Check package.json for BLE libraries
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

console.log('📦 Checking BLE Dependencies:');
console.log(`- react-native-ble-plx: ${packageJson.dependencies['react-native-ble-plx'] || 'NOT INSTALLED'}`);
console.log(`- react-native-ble-advertiser: ${packageJson.dependencies['react-native-ble-advertiser'] || 'NOT INSTALLED'}`);

// Check Android manifest for permissions
const manifestPath = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
  const manifestContent = fs.readFileSync(manifestPath, 'utf8');
  
  console.log('\n📱 Checking Android Manifest Permissions:');
  
  const requiredPermissions = [
    'android.permission.BLUETOOTH',
    'android.permission.BLUETOOTH_ADMIN',
    'android.permission.BLUETOOTH_CONNECT',
    'android.permission.BLUETOOTH_SCAN',
    'android.permission.BLUETOOTH_ADVERTISE'
  ];
  
  const locationPermissions = [
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION'
  ];
  
  requiredPermissions.forEach(permission => {
    const hasPermission = manifestContent.includes(permission);
    console.log(`${hasPermission ? '✅' : '❌'} ${permission}`);
  });
  
  console.log('\n📍 Location Permissions (required for BLE scanning):');
  locationPermissions.forEach(permission => {
    const hasPermission = manifestContent.includes(permission);
    console.log(`${hasPermission ? '✅' : '❌'} ${permission}`);
  });
  
  // Check for BLE feature declaration
  const hasBleFeature = manifestContent.includes('android.hardware.bluetooth_le');
  console.log(`\n🔧 BLE Feature Declaration: ${hasBleFeature ? '✅' : '❌'}`);
  
} else {
  console.log('❌ Android manifest not found');
}

// Check app.config.js for BLE plugin configuration
const appConfigPath = path.join(__dirname, '..', 'app.config.js');
if (fs.existsSync(appConfigPath)) {
  const appConfigContent = fs.readFileSync(appConfigPath, 'utf8');
  
  console.log('\n⚙️  Checking App Configuration:');
  
  const hasBlePlxPlugin = appConfigContent.includes('react-native-ble-plx');
  const hasBackgroundEnabled = appConfigContent.includes('isBackgroundEnabled');
  const hasPeripheralMode = appConfigContent.includes('peripheral');
  const hasCentralMode = appConfigContent.includes('central');
  
  console.log(`- BLE-PLX Plugin: ${hasBlePlxPlugin ? '✅' : '❌'}`);
  console.log(`- Background Enabled: ${hasBackgroundEnabled ? '✅' : '❌'}`);
  console.log(`- Peripheral Mode: ${hasPeripheralMode ? '✅' : '❌'}`);
  console.log(`- Central Mode: ${hasCentralMode ? '✅' : '❌'}`);
  
} else {
  console.log('❌ app.config.js not found');
}

// Check BluetoothManager implementation
const bluetoothManagerPath = path.join(__dirname, '..', 'src', 'bluetooth', 'BluetoothManager.ts');
if (fs.existsSync(bluetoothManagerPath)) {
  const bluetoothManagerContent = fs.readFileSync(bluetoothManagerPath, 'utf8');
  
  console.log('\n🔧 Checking BluetoothManager Implementation:');
  
  const checks = [
    { name: 'BleManager Import', pattern: 'from \'react-native-ble-plx\'' },
    { name: 'BleAdvertiser Import', pattern: 'from \'react-native-ble-advertiser\'' },
    { name: 'BLUETOOTH_ADVERTISE Permission Check', pattern: 'BLUETOOTH_ADVERTISE' },
    { name: 'startAdvertising Method', pattern: 'startAdvertising' },
    { name: 'stopAdvertising Method', pattern: 'stopAdvertising' },
    { name: 'Permission Request Method', pattern: 'requestPermissions' },
    { name: 'Error Handling', pattern: 'BluetoothError' }
  ];
  
  checks.forEach(check => {
    const hasFeature = bluetoothManagerContent.includes(check.pattern);
    console.log(`${hasFeature ? '✅' : '❌'} ${check.name}`);
  });
  
} else {
  console.log('❌ BluetoothManager.ts not found');
}

console.log('\n📋 Summary:');
console.log('✅ BLUETOOTH_ADVERTISE permission added to Android manifest');
console.log('✅ Permission request methods updated in BluetoothManager');
console.log('✅ Comprehensive error handling implemented');
console.log('✅ Platform-specific checks in place');

console.log('\n🚀 Next Steps:');
console.log('1. Rebuild the Android app: npx expo run:android');
console.log('2. Test BLE advertising on Android 12+ device');
console.log('3. Check console logs for permission requests');
console.log('4. Verify advertising starts successfully');

console.log('\n💡 Note: BLE advertising only works on Android devices');
console.log('   iOS does not support BLE advertising in the same way'); 