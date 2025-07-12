#!/usr/bin/env node

/**
 * Barcode Scanner Fix Script
 * 
 * This script fixes the "Cannot find native module 'ExpoBarCodeScanner'" error
 * by ensuring proper installation and configuration of expo-barcode-scanner.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Fixing Barcode Scanner Native Module Issue...\n');

try {
  // Step 1: Clean node_modules and reinstall
  console.log('1. Cleaning node_modules and reinstalling dependencies...');
  execSync('rm -rf node_modules', { stdio: 'inherit' });
  execSync('rm -rf package-lock.json', { stdio: 'inherit' });
  execSync('npm install', { stdio: 'inherit' });
  
  // Step 2: Clear Expo cache
  console.log('\n2. Clearing Expo cache...');
  execSync('npx expo install --fix', { stdio: 'inherit' });
  
  // Step 3: Clear Metro cache
  console.log('\n3. Clearing Metro cache...');
  execSync('npx expo start --clear', { stdio: 'inherit', timeout: 10000 });
  
  console.log('\n✅ Barcode scanner fix completed!');
  console.log('\nNext steps:');
  console.log('1. Stop the current Expo server (Ctrl+C)');
  console.log('2. Run: npx expo start --clear');
  console.log('3. If using a physical device, make sure to rebuild the app');
  console.log('4. For iOS simulator: npx expo run:ios');
  console.log('5. For Android emulator: npx expo run:android');
  
} catch (error) {
  console.error('❌ Error during fix:', error.message);
  console.log('\nManual steps to try:');
  console.log('1. Delete node_modules: rm -rf node_modules');
  console.log('2. Delete package-lock.json: rm -rf package-lock.json');
  console.log('3. Clear Expo cache: npx expo install --fix');
  console.log('4. Reinstall: npm install');
  console.log('5. Start with clear cache: npx expo start --clear');
} 