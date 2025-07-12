#!/usr/bin/env node

import { BluetoothManager } from '../src/bluetooth/BluetoothManager.ts';

console.log('🧪 Testing BLE Fix');
console.log('==================\n');

async function testBLEFix() {
  try {
    console.log('1. Creating BluetoothManager instance...');
    const manager = new BluetoothManager();
    
    console.log('2. Checking BLE availability...');
    const isAvailable = manager.isBleAvailable();
    console.log(`   BLE Available: ${isAvailable ? '✅ YES' : '❌ NO'}`);
    
    console.log('3. Checking initialization error...');
    const initError = manager.getInitializationError();
    if (initError) {
      console.log(`   Initialization Error: ❌ ${initError}`);
    } else {
      console.log('   Initialization Error: ✅ NONE');
    }
    
    console.log('4. Testing Bluetooth state...');
    try {
      const bluetoothEnabled = await manager.isBluetoothEnabled();
      console.log(`   Bluetooth Enabled: ${bluetoothEnabled ? '✅ YES' : '❌ NO'}`);
    } catch (error) {
      console.log(`   Bluetooth State Error: ❌ ${error.message}`);
    }
    
    console.log('5. Testing permissions...');
    try {
      await manager.requestPermissions();
      console.log('   Permissions: ✅ GRANTED');
    } catch (error) {
      console.log(`   Permissions Error: ❌ ${error.message}`);
    }
    
    console.log('\n📊 Summary:');
    if (isAvailable && !initError) {
      console.log('✅ BLE module is working correctly!');
      console.log('💡 You can now use BLE functionality in your app.');
    } else {
      console.log('❌ BLE module has issues that need to be resolved.');
      console.log('💡 Run "npm run fix-ble" for more detailed diagnostics.');
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.log('💡 This indicates the BLE module is not properly linked.');
  }
}

testBLEFix(); 