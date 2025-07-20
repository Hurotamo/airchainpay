#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing tp-rn-ble-advertiser migration...\n');

// Check package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

console.log('📦 Package.json dependencies:');
const hasTpBleAdvertiser = packageJson.dependencies['tp-rn-ble-advertiser'];
const hasOldBleAdvertiser = packageJson.dependencies['react-native-ble-advertiser'];

console.log(`✅ tp-rn-ble-advertiser: ${hasTpBleAdvertiser || 'NOT INSTALLED'}`);
console.log(`❌ react-native-ble-advertiser: ${hasOldBleAdvertiser || 'REMOVED'}`);

if (hasTpBleAdvertiser && !hasOldBleAdvertiser) {
  console.log('\n✅ Package.json migration: SUCCESS');
} else {
  console.log('\n❌ Package.json migration: FAILED');
}

// Check if node_modules has the new package
const tpBleAdvertiserExists = fs.existsSync('node_modules/tp-rn-ble-advertiser');
const oldBleAdvertiserExists = fs.existsSync('node_modules/react-native-ble-advertiser');

console.log('\n📁 Node modules:');
console.log(`✅ tp-rn-ble-advertiser: ${tpBleAdvertiserExists ? 'INSTALLED' : 'NOT INSTALLED'}`);
console.log(`❌ react-native-ble-advertiser: ${oldBleAdvertiserExists ? 'STILL EXISTS' : 'REMOVED'}`);

if (tpBleAdvertiserExists && !oldBleAdvertiserExists) {
  console.log('\n✅ Node modules migration: SUCCESS');
} else {
  console.log('\n❌ Node modules migration: FAILED');
}

// Check Android manifest
const androidManifestPath = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const androidManifest = fs.readFileSync(androidManifestPath, 'utf8');

console.log('\n📱 Android manifest:');
const hasForegroundService = androidManifest.includes('android.permission.FOREGROUND_SERVICE');
const hasRestartReceiver = androidManifest.includes('com.tulparyazilim.ble.RestartReceiver');

console.log(`✅ FOREGROUND_SERVICE permission: ${hasForegroundService ? 'ADDED' : 'MISSING'}`);
console.log(`✅ RestartReceiver: ${hasRestartReceiver ? 'ADDED' : 'MISSING'}`);

if (hasForegroundService && hasRestartReceiver) {
  console.log('\n✅ Android manifest migration: SUCCESS');
} else {
  console.log('\n❌ Android manifest migration: FAILED');
}

// Check source code imports
const bluetoothManagerPath = path.join(__dirname, '..', 'src', 'bluetooth', 'BluetoothManager.ts');
const bluetoothManager = fs.readFileSync(bluetoothManagerPath, 'utf8');

console.log('\n🔧 Source code:');
const hasTpImport = bluetoothManager.includes("import ReactNativeBleAdvertiser from 'tp-rn-ble-advertiser'");
const hasOldImport = bluetoothManager.includes("import BleAdvertiser from 'react-native-ble-advertiser'");
const hasStartBroadcast = bluetoothManager.includes('startBroadcast');
const hasStopBroadcast = bluetoothManager.includes('stopBroadcast');

console.log(`✅ tp-rn-ble-advertiser import: ${hasTpImport ? 'UPDATED' : 'MISSING'}`);
console.log(`❌ react-native-ble-advertiser import: ${hasOldImport ? 'STILL EXISTS' : 'REMOVED'}`);
console.log(`✅ startBroadcast method: ${hasStartBroadcast ? 'USED' : 'MISSING'}`);
console.log(`✅ stopBroadcast method: ${hasStopBroadcast ? 'USED' : 'MISSING'}`);

if (hasTpImport && !hasOldImport && hasStartBroadcast && hasStopBroadcast) {
  console.log('\n✅ Source code migration: SUCCESS');
} else {
  console.log('\n❌ Source code migration: FAILED');
}

// Overall status
const allChecks = [
  hasTpBleAdvertiser && !hasOldBleAdvertiser,
  tpBleAdvertiserExists && !oldBleAdvertiserExists,
  hasForegroundService && hasRestartReceiver,
  hasTpImport && !hasOldImport && hasStartBroadcast && hasStopBroadcast
];

const allPassed = allChecks.every(check => check);

console.log('\n' + '='.repeat(50));
if (allPassed) {
  console.log('🎉 ALL MIGRATION CHECKS PASSED!');
  console.log('✅ tp-rn-ble-advertiser migration completed successfully');
} else {
  console.log('❌ SOME MIGRATION CHECKS FAILED');
  console.log('Please review the issues above and fix them');
}
console.log('='.repeat(50));

console.log('\n📋 Next steps:');
console.log('1. Run: npm run android (to test on Android)');
console.log('2. Test BLE advertising functionality');
console.log('3. Verify that the new advertiser works correctly'); 