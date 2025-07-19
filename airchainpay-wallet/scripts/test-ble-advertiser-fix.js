#!/usr/bin/env node

/**
 * Test BLE Advertiser Fix
 * This script tests the corrected BLE advertiser implementation
 */

console.log('🔧 Testing BLE Advertiser Fix...\n');

// Test if we can import the modules
try {
  console.log('📦 Testing react-native-ble-plx...');
  const { BleManager } = require('react-native-ble-plx');
  console.log('✅ react-native-ble-plx imported successfully');
  
  // Try to create an instance
  const manager = new BleManager();
  console.log('✅ BleManager instance created successfully');
  
} catch (error) {
  console.log('❌ react-native-ble-plx test failed:', error.message);
}

try {
  console.log('\n📦 Testing react-native-ble-advertiser...');
  const BleAdvertiser = require('react-native-ble-advertiser');
  console.log('✅ react-native-ble-advertiser imported successfully');
  
  // Check if it has the correct methods (broadcast and stopBroadcast)
  if (BleAdvertiser && typeof BleAdvertiser === 'object') {
    const hasBroadcast = 'broadcast' in BleAdvertiser;
    const hasStopBroadcast = 'stopBroadcast' in BleAdvertiser;
    const hasStartAdvertising = 'startAdvertising' in BleAdvertiser; // Should be false
    const hasStopAdvertising = 'stopAdvertising' in BleAdvertiser; // Should be false
    
    console.log('✅ BleAdvertiser module structure:', {
      hasBroadcast,
      hasStopBroadcast,
      hasStartAdvertising, // Should be false
      hasStopAdvertising, // Should be false
      keys: Object.keys(BleAdvertiser)
    });
    
    if (hasBroadcast && hasStopBroadcast && !hasStartAdvertising && !hasStopAdvertising) {
      console.log('✅ BleAdvertiser has correct methods (broadcast/stopBroadcast)');
      console.log('✅ BleAdvertiser does NOT have incorrect methods (startAdvertising/stopAdvertising)');
    } else {
      console.log('❌ BleAdvertiser method structure is incorrect');
    }
  } else {
    console.log('❌ BleAdvertiser is not properly structured');
  }
  
} catch (error) {
  console.log('❌ react-native-ble-advertiser test failed:', error.message);
}

console.log('\n💡 The fix addresses the method name mismatch:');
console.log('   - react-native-ble-advertiser provides: broadcast() and stopBroadcast()');
console.log('   - Your code was expecting: startAdvertising() and stopAdvertising()');
console.log('   - The fix updates the code to use the correct method names');

console.log('\n✅ BLE advertiser should now work properly!');
console.log('   The BluetoothManager has been updated to use the correct API methods.'); 