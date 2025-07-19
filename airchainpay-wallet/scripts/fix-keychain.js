#!/usr/bin/env node

/**
 * Fix Keychain Configuration Script
 * 
 * This script rebuilds the project with proper keychain configurations
 * to enable hardware-backed storage on iOS and Android.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing Keychain Configuration...\n');

try {
  // Check if we're in the right directory
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    console.error('❌ Error: package.json not found. Please run this script from the project root.');
    process.exit(1);
  }

  console.log('📱 Platform-specific fixes applied:');
  console.log('✅ iOS: Added keychain-access-groups entitlement');
  console.log('✅ Android: Added biometric permissions');
  console.log('✅ App config: Added react-native-keychain plugin');
  console.log('✅ SecureStorage: Improved keychain detection logic\n');

  console.log('🔄 Rebuilding project with new configurations...\n');

  // Clean and rebuild
  console.log('🧹 Cleaning project...');
  execSync('npx expo prebuild --clean', { stdio: 'inherit' });

  console.log('\n📦 Installing dependencies...');
  execSync('npm install', { stdio: 'inherit' });

  console.log('\n🔨 Rebuilding native code...');
  execSync('npx expo prebuild', { stdio: 'inherit' });

  console.log('\n✅ Keychain configuration fixed!');
  console.log('\n📋 Next steps:');
  console.log('1. Run "npx expo run:ios" to test on iOS simulator/device');
  console.log('2. Run "npx expo run:android" to test on Android emulator/device');
  console.log('3. The keychain should now work properly with hardware-backed storage');
  console.log('\n🔒 Security improvements:');
  console.log('- Private keys will be stored in hardware-backed storage when available');
  console.log('- Falls back to SecureStore if keychain is not available');
  console.log('- Biometric authentication supported on compatible devices');

} catch (error) {
  console.error('\n❌ Error during rebuild:', error.message);
  console.log('\n💡 Try running these commands manually:');
  console.log('npx expo prebuild --clean');
  console.log('npm install');
  console.log('npx expo prebuild');
  process.exit(1);
} 