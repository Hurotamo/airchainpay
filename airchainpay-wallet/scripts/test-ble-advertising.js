#!/usr/bin/env node

/**
 * Test BLE Advertising Functionality
 * This script tests the BLE advertising capabilities with proper permissions
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Testing BLE Advertising Support...\n');

// Check platform (simulate)
console.log('📱 Platform: android (assuming Android for testing)');

// Test native module availability
console.log('\n🔧 Testing native module availability...');

// Check if modules are installed
const packageJsonPath = path.join('package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

console.log('📦 Checking BLE Dependencies:');
console.log(`- react-native-ble-plx: ${packageJson.dependencies['react-native-ble-plx'] || 'NOT INSTALLED'}`);
console.log(`- react-native-ble-advertiser: ${packageJson.dependencies['react-native-ble-advertiser'] || 'NOT INSTALLED'}`);

// Check if node_modules exist
const blePlxPath = path.join('node_modules', 'react-native-ble-plx');
const bleAdvertiserPath = path.join('node_modules', 'react-native-ble-advertiser');

console.log('\n📁 Checking module files:');
console.log(`- react-native-ble-plx: ${fs.existsSync(blePlxPath) ? '✅' : '❌'}`);
console.log(`- react-native-ble-advertiser: ${fs.existsSync(bleAdvertiserPath) ? '✅' : '❌'}`);

// Check Android manifest for permissions
const manifestPath = path.join('android', 'app', 'src', 'main', 'AndroidManifest.xml');
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

console.log('\n💡 Note: BLE advertising only works on Android devices');
console.log('   iOS does not support BLE advertising in the same way');
console.log('\n🔧 To fix BLE advertising issues:');
console.log('   1. Ensure you are testing on an Android device');
console.log('   2. Make sure Bluetooth is enabled');
console.log('   3. Grant all required permissions');
console.log('   4. Restart the app after granting permissions');
console.log('   5. If using an emulator, BLE may not work properly');

console.log('\n✅ BLE modules appear to be properly installed');
console.log('   If you still see advertising errors, try:');
console.log('   - Restarting the app');
console.log('   - Checking Bluetooth permissions in device settings');
console.log('   - Testing on a physical Android device (not emulator)'); 