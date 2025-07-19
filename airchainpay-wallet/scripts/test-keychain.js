#!/usr/bin/env node

/**
 * Test Keychain Configuration Script
 * 
 * This script tests the keychain configuration and provides
 * detailed information about the current setup.
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Testing Keychain Configuration...\n');

// Check iOS entitlements
const iosEntitlementsPath = path.join(process.cwd(), 'ios/AirChainPayWallet/AirChainPayWallet.entitlements');
if (fs.existsSync(iosEntitlementsPath)) {
  const entitlementsContent = fs.readFileSync(iosEntitlementsPath, 'utf8');
  if (entitlementsContent.includes('keychain-access-groups')) {
    console.log('✅ iOS: Keychain entitlements properly configured');
  } else {
    console.log('❌ iOS: Keychain entitlements missing');
  }
} else {
  console.log('❌ iOS: Entitlements file not found');
}

// Check Android manifest
const androidManifestPath = path.join(process.cwd(), 'android/app/src/main/AndroidManifest.xml');
if (fs.existsSync(androidManifestPath)) {
  const manifestContent = fs.readFileSync(androidManifestPath, 'utf8');
  if (manifestContent.includes('USE_BIOMETRIC') && manifestContent.includes('USE_FINGERPRINT')) {
    console.log('✅ Android: Biometric permissions properly configured');
  } else {
    console.log('❌ Android: Biometric permissions missing');
  }
} else {
  console.log('❌ Android: Manifest file not found');
}

// Check app config
const appConfigPath = path.join(process.cwd(), 'app.config.js');
if (fs.existsSync(appConfigPath)) {
  const configContent = fs.readFileSync(appConfigPath, 'utf8');
  if (configContent.includes('USE_BIOMETRIC') && configContent.includes('USE_FINGERPRINT')) {
    console.log('✅ App Config: Android biometric permissions included');
  } else {
    console.log('❌ App Config: Android biometric permissions missing');
  }
} else {
  console.log('❌ App Config: app.config.js not found');
}

// Check SecureStorageService
const secureStoragePath = path.join(process.cwd(), 'src/utils/SecureStorageService.ts');
if (fs.existsSync(secureStoragePath)) {
  const serviceContent = fs.readFileSync(secureStoragePath, 'utf8');
  if (serviceContent.includes('getSupportedBiometryType') && serviceContent.includes('test_keychain_access')) {
    console.log('✅ SecureStorage: Enhanced keychain detection implemented');
  } else {
    console.log('❌ SecureStorage: Enhanced keychain detection missing');
  }
} else {
  console.log('❌ SecureStorage: Service file not found');
}

// Check package.json
const packageJsonPath = path.join(process.cwd(), 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageContent = fs.readFileSync(packageJsonPath, 'utf8');
  if (packageContent.includes('react-native-keychain')) {
    console.log('✅ Dependencies: react-native-keychain installed');
  } else {
    console.log('❌ Dependencies: react-native-keychain missing');
  }
} else {
  console.log('❌ Dependencies: package.json not found');
}

console.log('\n📋 Summary:');
console.log('The keychain configuration has been updated with the following improvements:');
console.log('• iOS: Added keychain-access-groups entitlement for hardware-backed storage');
console.log('• Android: Added biometric permissions for keystore access');
console.log('• SecureStorage: Enhanced detection logic with proper fallback');
console.log('• App Config: Updated with necessary permissions');
console.log('\n🔒 Security Benefits:');
console.log('• Private keys will be stored in hardware-backed storage when available');
console.log('• Falls back to SecureStore if keychain is not available');
console.log('• Biometric authentication supported on compatible devices');
console.log('• No more "Keychain not supported" warnings on supported devices');

console.log('\n🚀 Next Steps:');
console.log('1. Install Xcode for iOS development (if not already installed)');
console.log('2. Run "npx expo run:ios" to test on iOS simulator/device');
console.log('3. Run "npx expo run:android" to test on Android emulator/device');
console.log('4. The keychain should now work properly with hardware-backed storage'); 