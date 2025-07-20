#!/usr/bin/env node

/**
 * BLE Advertising Permissions Fix Script
 * 
 * This script helps diagnose and fix BLE advertising permission issues
 * that are common on Android 12+ devices.
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 BLE Advertising Permissions Fix');
console.log('==================================\n');

function checkAndroidManifest() {
  const manifestPath = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  
  if (!fs.existsSync(manifestPath)) {
    console.log('❌ Android manifest not found');
    return false;
  }
  
  const manifestContent = fs.readFileSync(manifestPath, 'utf8');
  
  const requiredPermissions = [
    'android.permission.BLUETOOTH',
    'android.permission.BLUETOOTH_ADMIN',
    'android.permission.BLUETOOTH_SCAN',
    'android.permission.BLUETOOTH_CONNECT',
    'android.permission.BLUETOOTH_ADVERTISE',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION'
  ];
  
  console.log('📋 Checking Android Manifest Permissions:');
  
  let allPermissionsPresent = true;
  requiredPermissions.forEach(permission => {
    const hasPermission = manifestContent.includes(permission);
    console.log(`  ${hasPermission ? '✅' : '❌'} ${permission}`);
    if (!hasPermission) {
      allPermissionsPresent = false;
    }
  });
  
  // Check for BLE feature declaration
  const hasBleFeature = manifestContent.includes('android.hardware.bluetooth_le');
  console.log(`  ${hasBleFeature ? '✅' : '❌'} BLE Feature Declaration`);
  
  return allPermissionsPresent && hasBleFeature;
}

function checkAppConfig() {
  const appConfigPath = path.join(__dirname, '..', 'app.config.js');
  
  if (!fs.existsSync(appConfigPath)) {
    console.log('❌ app.config.js not found');
    return false;
  }
  
  const appConfigContent = fs.readFileSync(appConfigPath, 'utf8');
  
  console.log('\n📱 Checking Expo App Configuration:');
  
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
    console.log(`  ${hasPermission ? '✅' : '❌'} ${permission}`);
    if (!hasPermission) {
      allPermissionsPresent = false;
    }
  });
  
  return allPermissionsPresent;
}

function checkPackageJson() {
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  
  if (!fs.existsSync(packageJsonPath)) {
    console.log('❌ package.json not found');
    return false;
  }
  
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  console.log('\n📦 Checking Package Dependencies:');
  
  const requiredDeps = [
    'tp-rn-ble-advertiser',
    'react-native-ble-plx'
  ];
  
  let allDepsPresent = true;
  requiredDeps.forEach(dep => {
    const hasDep = packageJson.dependencies && packageJson.dependencies[dep];
    console.log(`  ${hasDep ? '✅' : '❌'} ${dep}`);
    if (!hasDep) {
      allDepsPresent = false;
    }
  });
  
  return allDepsPresent;
}

function generateFixInstructions() {
  console.log('\n🔧 Fix Instructions:');
  console.log('===================');
  console.log('');
  console.log('1. **Rebuild the app with native modules:**');
  console.log('   npx expo run:android');
  console.log('');
  console.log('2. **Clear app data and cache:**');
  console.log('   - Go to Settings > Apps > AirChainPay Wallet');
  console.log('   - Clear data and cache');
  console.log('');
  console.log('3. **Grant permissions manually:**');
  console.log('   - Go to Settings > Apps > AirChainPay Wallet > Permissions');
  console.log('   - Enable all Bluetooth permissions');
  console.log('   - Enable Location permission (required for BLE)');
  console.log('');
  console.log('4. **Enable Developer Options (if needed):**');
  console.log('   - Go to Settings > About Phone');
  console.log('   - Tap Build Number 7 times');
  console.log('   - Go to Developer Options > Bluetooth');
  console.log('   - Enable "Bluetooth HCI snoop log"');
  console.log('');
  console.log('5. **Test with a simple BLE app first:**');
  console.log('   - Install a BLE scanner app from Play Store');
  console.log('   - Verify your device can advertise');
  console.log('');
  console.log('6. **Check device compatibility:**');
  console.log('   - Some devices have limited BLE advertising support');
  console.log('   - Try on a different Android device if available');
  console.log('');
}

function main() {
  console.log('🔍 Diagnosing BLE Advertising Issues...\n');
  
  const manifestOk = checkAndroidManifest();
  const configOk = checkAppConfig();
  const depsOk = checkPackageJson();
  
  console.log('\n📊 Summary:');
  console.log(`  Android Manifest: ${manifestOk ? '✅' : '❌'}`);
  console.log(`  App Config: ${configOk ? '✅' : '❌'}`);
  console.log(`  Dependencies: ${depsOk ? '✅' : '❌'}`);
  
  if (manifestOk && configOk && depsOk) {
    console.log('\n✅ All configurations look correct!');
    console.log('💡 The issue might be:');
    console.log('   - Device-specific permission handling');
    console.log('   - Android version compatibility');
    console.log('   - Native module linking issues');
    console.log('   - Bluetooth hardware limitations');
  } else {
    console.log('\n❌ Some configurations need fixing');
  }
  
  generateFixInstructions();
  
  console.log('\n🔍 Additional Debugging:');
  console.log('========================');
  console.log('');
  console.log('1. **Check device logs:**');
  console.log('   adb logcat | grep -i bluetooth');
  console.log('');
  console.log('2. **Test native module:**');
  console.log('   Add this to your app to test:');
  console.log('   ```javascript');
  console.log('   import ReactNativeBleAdvertiser from "tp-rn-ble-advertiser";');
  console.log('   console.log("Module available:", !!ReactNativeBleAdvertiser);');
  console.log('   console.log("Methods:", Object.keys(ReactNativeBleAdvertiser));');
  console.log('   ```');
  console.log('');
  console.log('3. **Check Android API level:**');
  console.log('   The BLUETOOTH_ADVERTISE permission is only required on Android 12+ (API 31+)');
  console.log('');
}

if (require.main === module) {
  main();
}

module.exports = {
  checkAndroidManifest,
  checkAppConfig,
  checkPackageJson,
  generateFixInstructions
}; 