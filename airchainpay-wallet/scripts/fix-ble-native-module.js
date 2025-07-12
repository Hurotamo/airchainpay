#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 AirChainPay BLE Native Module Fixer');
console.log('=======================================\n');

// Check if we're in the right directory
const packageJsonPath = path.join(__dirname, '..', 'package.json');
if (!fs.existsSync(packageJsonPath)) {
  console.error('❌ Error: package.json not found. Please run this script from the airchainpay-wallet directory.');
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Check if react-native-ble-plx is installed
const bleDependency = packageJson.dependencies['react-native-ble-plx'];
if (!bleDependency) {
  console.error('❌ Error: react-native-ble-plx is not installed.');
  console.log('💡 Solution: Run "npm install react-native-ble-plx"');
  process.exit(1);
}

console.log('✅ react-native-ble-plx is installed:', bleDependency);

// Check if we're in a React Native project
const isReactNative = packageJson.dependencies['react-native'];
if (!isReactNative) {
  console.error('❌ Error: This does not appear to be a React Native project.');
  process.exit(1);
}

console.log('✅ React Native project detected');

// Check for native modules
const androidPath = path.join(__dirname, '..', 'android');
const iosPath = path.join(__dirname, '..', 'ios');

console.log('\n🔍 Checking native module setup...');

// Check Android setup
if (fs.existsSync(androidPath)) {
  console.log('✅ Android directory found');
  
  // Check if BLE module is linked in Android
  const settingsGradlePath = path.join(androidPath, 'settings.gradle');
  if (fs.existsSync(settingsGradlePath)) {
    const settingsContent = fs.readFileSync(settingsGradlePath, 'utf8');
    if (settingsContent.includes('react-native-ble-plx')) {
      console.log('✅ BLE module found in Android settings.gradle');
    } else {
      console.log('⚠️  BLE module not found in Android settings.gradle');
      console.log('💡 Solution: Run "npx react-native link react-native-ble-plx"');
    }
  }
  
  // Check build.gradle
  const appBuildGradlePath = path.join(androidPath, 'app', 'build.gradle');
  if (fs.existsSync(appBuildGradlePath)) {
    const buildContent = fs.readFileSync(appBuildGradlePath, 'utf8');
    if (buildContent.includes('react-native-ble-plx')) {
      console.log('✅ BLE module found in Android build.gradle');
    } else {
      console.log('⚠️  BLE module not found in Android build.gradle');
      console.log('💡 Solution: Run "npx react-native link react-native-ble-plx"');
    }
  }
} else {
  console.log('⚠️  Android directory not found');
}

// Check iOS setup
if (fs.existsSync(iosPath)) {
  console.log('✅ iOS directory found');
  
  // Check Podfile
  const podfilePath = path.join(iosPath, 'Podfile');
  if (fs.existsSync(podfilePath)) {
    const podfileContent = fs.readFileSync(podfilePath, 'utf8');
    if (podfileContent.includes('react-native-ble-plx')) {
      console.log('✅ BLE module found in iOS Podfile');
    } else {
      console.log('⚠️  BLE module not found in iOS Podfile');
      console.log('💡 Solution: Run "cd ios && pod install"');
    }
  }
} else {
  console.log('⚠️  iOS directory not found');
}

console.log('\n🔧 Running fixes...');

// Try to fix common issues
try {
  // Clean node_modules and reinstall
  console.log('🧹 Cleaning node_modules...');
  execSync('rm -rf node_modules', { stdio: 'inherit' });
  execSync('npm install', { stdio: 'inherit' });
  console.log('✅ Dependencies reinstalled');
  
  // Clear Metro cache
  console.log('🗑️  Clearing Metro cache...');
  execSync('npx expo start --clear', { stdio: 'inherit', timeout: 10000 });
  console.log('✅ Metro cache cleared');
  
} catch (error) {
  console.log('⚠️  Some cleanup steps failed, but continuing...');
}

console.log('\n📋 Recommended next steps:');
console.log('1. Run "npx expo prebuild --clean" to rebuild native code');
console.log('2. Run "npx expo run:android" or "npx expo run:ios" to test');
console.log('3. If issues persist, try:');
console.log('   - "npx react-native link react-native-ble-plx"');
console.log('   - "cd ios && pod install" (for iOS)');
console.log('   - Clean and rebuild the project');

console.log('\n🔍 To test BLE functionality:');
console.log('1. Open the app');
console.log('2. Go to the BLE payment screen');
console.log('3. Check the console logs for BLE initialization messages');
console.log('4. Look for any error messages starting with "[BLE]"');

console.log('\n✅ BLE issue diagnosis complete!'); 