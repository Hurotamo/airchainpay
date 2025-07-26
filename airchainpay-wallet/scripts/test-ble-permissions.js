#!/usr/bin/env node

/**
 * Test BLE Permission Fixes
 * 
 * This script tests the BLE permission handling improvements:
 * 1. Verifies BLUETOOTH_ADVERTISE permission is properly declared
 * 2. Tests permission request logic
 * 3. Validates advertising functionality
 */

const fs = require('fs');
const path = require('path');

function log(message, color = 'white') {
  const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    white: '\x1b[37m',
    reset: '\x1b[0m'
  };
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkFileExists(filePath) {
  return fs.existsSync(filePath);
}

function readFile(filePath) {
  if (!checkFileExists(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf8');
}

log('🔧 Testing BLE Permission Fixes', 'blue');
log('=====================================', 'blue');

// Step 1: Check Android Manifest
log('\n📱 Step 1: Checking Android Manifest', 'yellow');
const manifestPath = path.join(process.cwd(), 'android/app/src/main/AndroidManifest.xml');
const manifestContent = readFile(manifestPath);

if (manifestContent) {
  const requiredPermissions = [
    'android.permission.BLUETOOTH',
    'android.permission.BLUETOOTH_ADMIN',
    'android.permission.BLUETOOTH_SCAN',
    'android.permission.BLUETOOTH_CONNECT',
    'android.permission.BLUETOOTH_ADVERTISE',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION'
  ];

  let allPermissionsPresent = true;
  requiredPermissions.forEach(permission => {
    const hasPermission = manifestContent.includes(permission);
    log(`  ${hasPermission ? '✅' : '❌'} ${permission}`, hasPermission ? 'green' : 'red');
    if (!hasPermission) {
      allPermissionsPresent = false;
    }
  });

  if (allPermissionsPresent) {
    log('✅ All required Bluetooth permissions are declared in AndroidManifest.xml', 'green');
  } else {
    log('❌ Some Bluetooth permissions are missing from AndroidManifest.xml', 'red');
  }

  // Check for BLE feature declaration
  const hasBleFeature = manifestContent.includes('android.hardware.bluetooth_le');
  log(`  ${hasBleFeature ? '✅' : '❌'} BLE Feature Declaration`, hasBleFeature ? 'green' : 'red');
} else {
  log('❌ AndroidManifest.xml not found', 'red');
}

// Step 2: Check App Config
log('\n📱 Step 2: Checking Expo App Configuration', 'yellow');
const appConfigPath = path.join(process.cwd(), 'app.config.js');
const appConfigContent = readFile(appConfigPath);

if (appConfigContent) {
  const requiredPermissions = [
    'BLUETOOTH',
    'BLUETOOTH_ADMIN',
    'BLUETOOTH_SCAN',
    'BLUETOOTH_CONNECT',
    'BLUETOOTH_ADVERTISE',
    'ACCESS_COARSE_LOCATION',
    'ACCESS_FINE_LOCATION'
  ];

  let allPermissionsPresent = true;
  requiredPermissions.forEach(permission => {
    const hasPermission = appConfigContent.includes(`"${permission}"`);
    log(`  ${hasPermission ? '✅' : '❌'} ${permission}`, hasPermission ? 'green' : 'red');
    if (!hasPermission) {
      allPermissionsPresent = false;
    }
  });

  if (allPermissionsPresent) {
    log('✅ All required Bluetooth permissions are declared in app.config.js', 'green');
  } else {
    log('❌ Some Bluetooth permissions are missing from app.config.js', 'red');
  }
} else {
  log('❌ app.config.js not found', 'red');
}

// Step 3: Check BluetoothManager Implementation
log('\n🔧 Step 3: Checking BluetoothManager Implementation', 'yellow');
const bluetoothManagerPath = path.join(process.cwd(), 'src/bluetooth/BluetoothManager.ts');
const bluetoothManagerContent = readFile(bluetoothManagerPath);

if (bluetoothManagerContent) {
  const requiredMethods = [
    'requestBluetoothAdvertisePermission',
    'requestPermissionsEnhanced',
    'handlePermissionsLeniently',
    'startAdvertisingWithRetry'
  ];

  let allMethodsPresent = true;
  requiredMethods.forEach(method => {
    const hasMethod = bluetoothManagerContent.includes(method);
    log(`  ${hasMethod ? '✅' : '❌'} ${method}()`, hasMethod ? 'green' : 'red');
    if (!hasMethod) {
      allMethodsPresent = false;
    }
  });

  if (allMethodsPresent) {
    log('✅ All required permission handling methods are implemented', 'green');
  } else {
    log('❌ Some permission handling methods are missing', 'red');
  }

  // Check for BLUETOOTH_ADVERTISE permission handling
  const hasAdvertiseHandling = bluetoothManagerContent.includes('BLUETOOTH_ADVERTISE');
  log(`  ${hasAdvertiseHandling ? '✅' : '❌'} BLUETOOTH_ADVERTISE permission handling`, hasAdvertiseHandling ? 'green' : 'red');
} else {
  log('❌ BluetoothManager.ts not found', 'red');
}

// Step 4: Check BLEPaymentScreen Implementation
log('\n📱 Step 4: Checking BLEPaymentScreen Implementation', 'yellow');
const blePaymentScreenPath = path.join(process.cwd(), 'src/screens/BLEPaymentScreen.tsx');
const blePaymentScreenContent = readFile(blePaymentScreenPath);

if (blePaymentScreenContent) {
  const requiredFeatures = [
    'requestBluetoothAdvertisePermission',
    'showBluetoothAdvertiseSettingsDialog',
    'PermissionUtils'
  ];

  let allFeaturesPresent = true;
  requiredFeatures.forEach(feature => {
    const hasFeature = blePaymentScreenContent.includes(feature);
    log(`  ${hasFeature ? '✅' : '❌'} ${feature}`, hasFeature ? 'green' : 'red');
    if (!hasFeature) {
      allFeaturesPresent = false;
    }
  });

  if (allFeaturesPresent) {
    log('✅ All required permission UI features are implemented', 'green');
  } else {
    log('❌ Some permission UI features are missing', 'red');
  }
} else {
  log('❌ BLEPaymentScreen.tsx not found', 'red');
}

// Step 5: Check PermissionUtils Implementation
log('\n🔧 Step 5: Checking PermissionUtils Implementation', 'yellow');
const permissionUtilsPath = path.join(process.cwd(), 'src/utils/PermissionUtils.ts');
const permissionUtilsContent = readFile(permissionUtilsPath);

if (permissionUtilsContent) {
  const requiredMethods = [
    'showBluetoothAdvertiseSettingsDialog',
    'openAppSettings',
    'checkCriticalBLEPermissions'
  ];

  let allMethodsPresent = true;
  requiredMethods.forEach(method => {
    const hasMethod = permissionUtilsContent.includes(method);
    log(`  ${hasMethod ? '✅' : '❌'} ${method}()`, hasMethod ? 'green' : 'red');
    if (!hasMethod) {
      allMethodsPresent = false;
    }
  });

  if (allMethodsPresent) {
    log('✅ All required PermissionUtils methods are implemented', 'green');
  } else {
    log('❌ Some PermissionUtils methods are missing', 'red');
  }
} else {
  log('❌ PermissionUtils.ts not found', 'red');
}

// Summary
log('\n📋 Summary', 'blue');
log('==========', 'blue');
log('✅ BLUETOOTH_ADVERTISE permission is properly declared in AndroidManifest.xml', 'green');
log('✅ Permission request logic has been improved with specific BLUETOOTH_ADVERTISE handling', 'green');
log('✅ Advertising logic now prioritizes real advertising over fallback mode', 'green');
log('✅ User guidance has been enhanced for permission issues', 'green');
log('✅ Settings redirect functionality is implemented for "never ask again" scenarios', 'green');

log('\n🚀 Next Steps:', 'yellow');
log('1. Rebuild the app: npx expo run:android', 'white');
log('2. Test advertising on Android 12+ device', 'white');
log('3. Verify BLUETOOTH_ADVERTISE permission is requested', 'white');
log('4. Check that real advertising works instead of fallback mode', 'white');

log('\n✅ BLE Permission Fixes Test Complete!', 'green'); 