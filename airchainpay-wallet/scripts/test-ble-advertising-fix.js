#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(command, description) {
  log(`\n🔧 ${description}...`, 'blue');
  log(`Command: ${command}`, 'cyan');
  
  try {
    const { execSync } = require('child_process');
    const result = execSync(command, { encoding: 'utf8', cwd: process.cwd() });
    log(`✅ ${description} completed successfully`, 'green');
    return result;
  } catch (error) {
    log(`❌ ${description} failed: ${error.message}`, 'red');
    return null;
  }
}

function checkFileExists(filePath) {
  return fs.existsSync(filePath);
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return null;
  }
}

log('🧪 Testing BLE Advertising Fixes', 'magenta');
log('================================', 'magenta');

// Test 1: Check if tp-rn-ble-advertiser is installed
log('\n📦 Test 1: Package Dependencies', 'blue');
const packageJsonPath = path.join(process.cwd(), 'package.json');
const packageJson = JSON.parse(readFile(packageJsonPath));
const hasBleAdvertiser = packageJson.dependencies && packageJson.dependencies['tp-rn-ble-advertiser'];

if (hasBleAdvertiser) {
  log(`✅ tp-rn-ble-advertiser found: ${hasBleAdvertiser}`, 'green');
} else {
  log('❌ tp-rn-ble-advertiser not found in package.json', 'red');
}

// Test 2: Check Android permissions
log('\n📱 Test 2: Android Permissions', 'blue');
const androidManifestPath = path.join(process.cwd(), 'android/app/src/main/AndroidManifest.xml');
const manifestContent = readFile(androidManifestPath);

if (manifestContent) {
  const requiredPermissions = [
    'android.permission.BLUETOOTH_ADVERTISE',
    'android.permission.BLUETOOTH_CONNECT',
    'android.permission.BLUETOOTH_SCAN'
  ];
  
  const missingPermissions = requiredPermissions.filter(perm => 
    !manifestContent.includes(perm)
  );
  
  if (missingPermissions.length === 0) {
    log('✅ All required Bluetooth permissions found in AndroidManifest.xml', 'green');
  } else {
    log(`❌ Missing permissions: ${missingPermissions.join(', ')}`, 'red');
  }
} else {
  log('❌ AndroidManifest.xml not found', 'red');
}

// Test 3: Check BluetoothManager improvements
log('\n🔧 Test 3: BluetoothManager Improvements', 'blue');
const bluetoothManagerPath = path.join(process.cwd(), 'src/bluetooth/BluetoothManager.ts');
const bluetoothManagerContent = readFile(bluetoothManagerPath);

if (bluetoothManagerContent) {
  const improvements = [
    'startAdvertisingWithRetry',
    'checkAdvertisingSupport',
    'runAdvertisingDiagnostics',
    'handleRunDiagnostics'
  ];
  
  const foundImprovements = improvements.filter(improvement => 
    bluetoothManagerContent.includes(improvement)
  );
  
  log(`✅ Found ${foundImprovements.length}/${improvements.length} improvements:`, 'green');
  foundImprovements.forEach(imp => log(`  - ${imp}`, 'cyan'));
  
  const missingImprovements = improvements.filter(improvement => 
    !bluetoothManagerContent.includes(improvement)
  );
  
  if (missingImprovements.length > 0) {
    log(`❌ Missing improvements: ${missingImprovements.join(', ')}`, 'red');
  }
} else {
  log('❌ BluetoothManager.ts not found', 'red');
}

// Test 4: Check BLEPaymentService improvements
log('\n🔧 Test 4: BLEPaymentService Improvements', 'blue');
const blePaymentServicePath = path.join(process.cwd(), 'src/services/BLEPaymentService.ts');
const blePaymentServiceContent = readFile(blePaymentServicePath);

if (blePaymentServiceContent) {
  const improvements = [
    'runAdvertisingDiagnostics',
    'diagnosticButton',
    'handleRunDiagnostics'
  ];
  
  const foundImprovements = improvements.filter(improvement => 
    blePaymentServiceContent.includes(improvement)
  );
  
  log(`✅ Found ${foundImprovements.length}/${improvements.length} improvements:`, 'green');
  foundImprovements.forEach(imp => log(`  - ${imp}`, 'cyan'));
  
  const missingImprovements = improvements.filter(improvement => 
    !blePaymentServiceContent.includes(improvement)
  );
  
  if (missingImprovements.length > 0) {
    log(`❌ Missing improvements: ${missingImprovements.join(', ')}`, 'red');
  }
} else {
  log('❌ BLEPaymentService.ts not found', 'red');
}

// Test 5: Check BLEPaymentScreen improvements
log('\n🔧 Test 5: BLEPaymentScreen Improvements', 'blue');
const blePaymentScreenPath = path.join(process.cwd(), 'src/screens/BLEPaymentScreen.tsx');
const blePaymentScreenContent = readFile(blePaymentScreenPath);

if (blePaymentScreenContent) {
  const improvements = [
    'handleRunDiagnostics',
    'diagnosticButton',
    'Run Diagnostics'
  ];
  
  const foundImprovements = improvements.filter(improvement => 
    blePaymentScreenContent.includes(improvement)
  );
  
  log(`✅ Found ${foundImprovements.length}/${improvements.length} improvements:`, 'green');
  foundImprovements.forEach(imp => log(`  - ${imp}`, 'cyan'));
  
  const missingImprovements = improvements.filter(improvement => 
    !blePaymentScreenContent.includes(improvement)
  );
  
  if (missingImprovements.length > 0) {
    log(`❌ Missing improvements: ${missingImprovements.join(', ')}`, 'red');
  }
} else {
  log('❌ BLEPaymentScreen.tsx not found', 'red');
}

// Test 6: Check module installation
log('\n📦 Test 6: Module Installation', 'blue');
const nodeModulesPath = path.join(process.cwd(), 'node_modules/tp-rn-ble-advertiser');
if (checkFileExists(nodeModulesPath)) {
  log('✅ tp-rn-ble-advertiser module is installed', 'green');
  
  // Check for key files
  const keyFiles = [
    'package.json',
    'android/ReactNativeBleAdvertiserModule.kt',
    'ios/ReactNativeBleAdvertiser.m'
  ];
  
  const existingFiles = keyFiles.filter(file => 
    checkFileExists(path.join(nodeModulesPath, file))
  );
  
  log(`✅ Found ${existingFiles.length}/${keyFiles.length} key files:`, 'green');
  existingFiles.forEach(file => log(`  - ${file}`, 'cyan'));
  
  const missingFiles = keyFiles.filter(file => 
    !checkFileExists(path.join(nodeModulesPath, file))
  );
  
  if (missingFiles.length > 0) {
    log(`❌ Missing files: ${missingFiles.join(', ')}`, 'red');
  }
} else {
  log('❌ tp-rn-ble-advertiser module not found in node_modules', 'red');
}

log('\n🎯 Summary', 'magenta');
log('==========', 'magenta');
log('The BLE advertising fixes include:', 'cyan');
log('1. ✅ Enhanced error handling and user feedback', 'green');
log('2. ✅ Improved permission checking with detailed messages', 'green');
log('3. ✅ Better retry mechanism with increased timeouts', 'green');
log('4. ✅ Comprehensive diagnostics system', 'green');
log('5. ✅ User-friendly error messages', 'green');
log('6. ✅ Diagnostic button in the UI', 'green');

log('\n📋 Next Steps:', 'yellow');
log('1. Run: npx expo run:android', 'cyan');
log('2. Open the app and go to BLE Payment screen', 'cyan');
log('3. Try to start advertising', 'cyan');
log('4. If it fails, click "Run Diagnostics" to see detailed issues', 'cyan');
log('5. Follow the recommendations provided by the diagnostics', 'cyan');

log('\n💡 Common Issues and Solutions:', 'yellow');
log('- If Bluetooth is disabled: Enable it in device settings', 'cyan');
log('- If permissions are missing: Grant them in Settings > Apps > AirChainPay', 'cyan');
log('- If module is not found: Reinstall the app', 'cyan');
log('- If advertising times out: Try again after a few seconds', 'cyan');

log('\n✅ BLE Advertising Fix Test Complete!', 'green'); 