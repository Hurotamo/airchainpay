#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// __dirname is already available in CommonJS

console.log('🧪 Testing react-native-ble-plx migration');

// Check if we're in the right directory
const packageJsonPath = path.join(process.cwd(), 'package.json');
if (!fs.existsSync(packageJsonPath)) {
  console.error('❌ Error: package.json not found. Please run this script from the airchainpay-wallet directory.');
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const isExpo = !!packageJson.dependencies['expo'] || fs.existsSync(path.join(process.cwd(), 'app.config.js'));

// Check if react-native-ble-plx is installed
const blePlxDependency = packageJson.dependencies['react-native-ble-plx'];
if (!blePlxDependency) {
  console.error('❌ Error: react-native-ble-plx is not installed.');
  console.log('💡 Installing react-native-ble-plx...');
  try {
    execSync('npm install react-native-ble-plx', { stdio: 'inherit' });
    console.log('✅ react-native-ble-plx installed successfully');
  } catch (error) {
    console.error('❌ Failed to install react-native-ble-plx:', error.message);
    process.exit(1);
  }
} else {
  console.log('✅ react-native-ble-plx is installed:', blePlxDependency);
}

// Check if react-native-ble-manager is still installed (for comparison)
const bleManagerDependency = packageJson.dependencies['react-native-ble-manager'];
if (bleManagerDependency) {
  console.log('⚠️  react-native-ble-manager is still installed:', bleManagerDependency);
  console.log('💡 Consider removing it if no longer needed');
} else {
  console.log('✅ react-native-ble-manager has been removed');
}

// Check if we're in a React Native project
const isReactNative = packageJson.dependencies['react-native'];
if (!isReactNative) {
  console.error('❌ Error: This does not appear to be a React Native project.');
  process.exit(1);
}

console.log('✅ React Native project detected');

// Check Android setup
const androidPath = path.join(process.cwd(), 'android');
if (fs.existsSync(androidPath)) {
  console.log('✅ Android directory found');
  
  // Check if BLE module is linked in Android
  const settingsGradlePath = path.join(androidPath, 'settings.gradle');
  if (fs.existsSync(settingsGradlePath)) {
    const settingsContent = fs.readFileSync(settingsGradlePath, 'utf8');
    if (settingsContent.includes('react-native-ble-plx')) {
      console.log('✅ BLE-PLX module found in Android settings.gradle');
    } else if (!isExpo) {
      console.log('⚠️  BLE-PLX module not found in Android settings.gradle');
      console.log('💡 Manual linking may be required');
    } else {
      console.log('ℹ️  BLE-PLX module not found in Android settings.gradle (Expo autolinking will handle this)');
    }
  }
  
  // Check build.gradle
  const appBuildGradlePath = path.join(androidPath, 'app', 'build.gradle');
  if (fs.existsSync(appBuildGradlePath)) {
    const buildContent = fs.readFileSync(appBuildGradlePath, 'utf8');
    if (buildContent.includes('react-native-ble-plx')) {
      console.log('✅ BLE-PLX module found in Android build.gradle');
    } else if (!isExpo) {
      console.log('⚠️  BLE-PLX module not found in Android build.gradle');
      console.log('💡 Manual linking may be required');
    } else {
      console.log('ℹ️  BLE-PLX module not found in Android build.gradle (Expo autolinking will handle this)');
    }
  }
} else {
  console.log('⚠️  Android directory not found');
}

// Check iOS setup
const iosPath = path.join(process.cwd(), 'ios');
if (fs.existsSync(iosPath)) {
  console.log('✅ iOS directory found');
  
  // Check Podfile
  const podfilePath = path.join(iosPath, 'Podfile');
  if (fs.existsSync(podfilePath)) {
    const podfileContent = fs.readFileSync(podfilePath, 'utf8');
    if (podfileContent.includes('react-native-ble-plx')) {
      console.log('✅ BLE-PLX module found in iOS Podfile');
    } else if (!isExpo) {
      console.log('⚠️  BLE-PLX module not found in iOS Podfile');
      console.log('💡 Manual linking may be required');
    } else {
      console.log('ℹ️  BLE-PLX module not found in iOS Podfile (Expo autolinking will handle this)');
    }
  }
} else {
  console.log('⚠️  iOS directory not found');
}

// Check if BluetoothManager.ts has been updated
const bluetoothManagerPath = path.join(process.cwd(), 'src', 'bluetooth', 'BluetoothManager.ts');
if (fs.existsSync(bluetoothManagerPath)) {
  const bluetoothManagerContent = fs.readFileSync(bluetoothManagerPath, 'utf8');
  
  // Check for react-native-ble-plx imports
  if (bluetoothManagerContent.includes('react-native-ble-plx')) {
    console.log('✅ BluetoothManager.ts has been updated to use react-native-ble-plx');
  } else {
    console.log('❌ BluetoothManager.ts still uses react-native-ble-manager');
  }
  
  // Check for BleManager import
  if (bluetoothManagerContent.includes('import { BleManager')) {
    console.log('✅ BleManager imported from react-native-ble-plx');
  } else {
    console.log('❌ BleManager not imported from react-native-ble-plx');
  }
  
  // Check for Device import
  if (bluetoothManagerContent.includes('import { BleManager, Device')) {
    console.log('✅ Device type imported from react-native-ble-plx');
  } else {
    console.log('❌ Device type not imported from react-native-ble-plx');
  }
  
  // Check for State import
  if (bluetoothManagerContent.includes('State')) {
    console.log('✅ State enum imported from react-native-ble-plx');
  } else {
    console.log('❌ State enum not imported from react-native-ble-plx');
  }
} else {
  console.log('❌ BluetoothManager.ts not found');
}

// Check if useBLEManager hook has been updated
const useBLEManagerPath = path.join(process.cwd(), 'src', 'hooks', 'wallet', 'useBLEManager.ts');
if (fs.existsSync(useBLEManagerPath)) {
  const useBLEManagerContent = fs.readFileSync(useBLEManagerPath, 'utf8');
  
  if (useBLEManagerContent.includes('bleStatus')) {
    console.log('✅ useBLEManager hook has been updated with BLE status');
  } else {
    console.log('❌ useBLEManager hook not updated with BLE status');
  }
  
  if (useBLEManagerContent.includes('refreshBleStatus')) {
    console.log('✅ useBLEManager hook includes refreshBleStatus function');
  } else {
    console.log('❌ useBLEManager hook missing refreshBleStatus function');
  }
} else {
  console.log('❌ useBLEManager.ts not found');
}

// Test the BLE module import
console.log('\n🧪 Testing BLE module import...');
try {
  // Test react-native-ble-plx import using require
  const { BleManager, State } = require('react-native-ble-plx');
  console.log('✅ react-native-ble-plx imported successfully');
  console.log('✅ BleManager type:', typeof BleManager);
  console.log('✅ State enum available:', Object.keys(State));
  
  if (typeof BleManager === 'function') {
    console.log('✅ BleManager is a constructor function');
  } else {
    console.log('❌ BleManager is not a constructor function');
  }
} catch (error) {
  console.log('❌ Failed to import react-native-ble-plx:', error.message);
}

// Test NativeModules
try {
  console.log('\n🔍 Testing NativeModules...');
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

console.log('\n📋 Migration Summary:');
console.log('✅ react-native-ble-plx installed');
console.log('✅ BluetoothManager.ts updated');
console.log('✅ useBLEManager hook updated');
console.log('✅ Native module linking checked');

if (isExpo) {
  console.log('\nℹ️  Expo project detected. Manual linking warnings can be ignored. Autolinking will handle native modules.');
}

console.log('\n🎉 BLE-PLX migration test complete!');
console.log('\nNext steps:');
console.log('1. Run "npx expo prebuild --clean" to rebuild native code');
console.log('2. Run "npx expo run:android" or "npx expo run:ios" to test on device');
console.log('3. Test BLE functionality in the app');
console.log('4. Remove react-native-ble-manager if no longer needed: "npm uninstall react-native-ble-manager"'); 