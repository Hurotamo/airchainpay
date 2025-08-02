#!/usr/bin/env node

/**
 * Test script for BLE permissions
 * This script tests the Bluetooth permission handling in the AirChainPay wallet
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Testing BLE Permission Handling...\n');

// Check if the app is running
try {
  console.log('📱 Checking if app is running...');
  const result = execSync('adb shell "ps | grep airchainpay"', { encoding: 'utf8' });
  console.log('✅ App is running');
} catch (error) {
  console.log('❌ App is not running or device not connected');
  console.log('Please start the app first');
  process.exit(1);
}

// Check Bluetooth permissions
console.log('\n🔐 Checking Bluetooth permissions...');
try {
  const permissions = execSync('adb shell "pm list permissions -g | grep bluetooth"', { encoding: 'utf8' });
  console.log('📋 Available Bluetooth permissions:');
  console.log(permissions);
} catch (error) {
  console.log('❌ Could not check permissions');
}

// Check app permissions
console.log('\n📱 Checking app-specific permissions...');
try {
  const appPermissions = execSync('adb shell "dumpsys package com.airchainpay.wallet | grep permission"', { encoding: 'utf8' });
  console.log('📋 App permissions:');
  console.log(appPermissions);
} catch (error) {
  console.log('❌ Could not check app permissions');
}

// Test BLE functionality
console.log('\n🔵 Testing BLE functionality...');
try {
  const bleStatus = execSync('adb shell "dumpsys bluetooth | grep -i state"', { encoding: 'utf8' });
  console.log('📊 Bluetooth status:');
  console.log(bleStatus);
} catch (error) {
  console.log('❌ Could not check Bluetooth status');
}

console.log('\n✅ Permission test completed');
console.log('\n📝 To test the fix:');
console.log('1. Open the AirChainPay wallet app');
console.log('2. Navigate to the BLE Payment screen');
console.log('3. Try to start advertising');
console.log('4. If permissions are missing, use the "Check Permissions" button');
console.log('5. If needed, use the "Open Settings" button to grant permissions'); 