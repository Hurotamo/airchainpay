#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing BLE Advertiser Module Issues...\n');

// Colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(command, description) {
  try {
    log(`📋 ${description}...`, 'blue');
    const result = execSync(command, { 
      stdio: 'pipe', 
      encoding: 'utf8',
      cwd: process.cwd()
    });
    log(`✅ ${description} completed`, 'green');
    return result;
  } catch (error) {
    log(`❌ ${description} failed: ${error.message}`, 'red');
    return null;
  }
}

function checkFileExists(filePath) {
  return fs.existsSync(filePath);
}

// Step 1: Check if we're in the right directory
const packageJsonPath = path.join(process.cwd(), 'package.json');
if (!checkFileExists(packageJsonPath)) {
  log('❌ package.json not found. Please run this script from the airchainpay-wallet directory.', 'red');
  process.exit(1);
}

// Step 2: Check if tp-rn-ble-advertiser is installed
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const hasBleAdvertiser = packageJson.dependencies && packageJson.dependencies['tp-rn-ble-advertiser'];

if (!hasBleAdvertiser) {
  log('❌ tp-rn-ble-advertiser not found in package.json', 'red');
  log('📦 Installing tp-rn-ble-advertiser...', 'yellow');
  runCommand('npm install tp-rn-ble-advertiser@^5.2.0', 'Installing tp-rn-ble-advertiser');
} else {
  log('✅ tp-rn-ble-advertiser is installed', 'green');
}

// Step 3: Clean and reinstall node_modules
log('🧹 Cleaning node_modules...', 'blue');
runCommand('rm -rf node_modules', 'Removing node_modules');
runCommand('npm install', 'Reinstalling dependencies');

// Step 4: Clean Android build
log('🧹 Cleaning Android build...', 'blue');
runCommand('cd android && ./gradlew clean', 'Cleaning Android build');
runCommand('cd ..', 'Returning to root directory');

// Step 5: Clean Expo cache
log('🧹 Cleaning Expo cache...', 'blue');
runCommand('npx expo install --fix', 'Fixing Expo dependencies');
runCommand('npx expo prebuild --clean', 'Cleaning and rebuilding Expo prebuild');

// Step 6: Check Android manifest for permissions
const androidManifestPath = path.join(process.cwd(), 'android/app/src/main/AndroidManifest.xml');
if (checkFileExists(androidManifestPath)) {
  const manifestContent = fs.readFileSync(androidManifestPath, 'utf8');
  const hasBluetoothAdvertise = manifestContent.includes('android.permission.BLUETOOTH_ADVERTISE');
  
  if (hasBluetoothAdvertise) {
    log('✅ BLUETOOTH_ADVERTISE permission found in AndroidManifest.xml', 'green');
  } else {
    log('❌ BLUETOOTH_ADVERTISE permission missing from AndroidManifest.xml', 'red');
    log('📝 Adding BLUETOOTH_ADVERTISE permission...', 'yellow');
    
    // Add the permission if missing
    const updatedContent = manifestContent.replace(
      '<uses-permission android:name="android.permission.BLUETOOTH_SCAN"/>',
      '<uses-permission android:name="android.permission.BLUETOOTH_SCAN"/>\n  <uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE"/>'
    );
    
    fs.writeFileSync(androidManifestPath, updatedContent);
    log('✅ Added BLUETOOTH_ADVERTISE permission to AndroidManifest.xml', 'green');
  }
} else {
  log('❌ AndroidManifest.xml not found', 'red');
}

// Step 7: Check for RestartReceiver in AndroidManifest.xml
if (checkFileExists(androidManifestPath)) {
  const manifestContent = fs.readFileSync(androidManifestPath, 'utf8');
  const hasRestartReceiver = manifestContent.includes('com.tulparyazilim.ble.RestartReceiver');
  
  if (hasRestartReceiver) {
    log('✅ RestartReceiver found in AndroidManifest.xml', 'green');
  } else {
    log('❌ RestartReceiver missing from AndroidManifest.xml', 'red');
    log('📝 Adding RestartReceiver...', 'yellow');
    
    // Add the RestartReceiver if missing
    const receiverBlock = `
    <!-- RestartReceiver for tp-rn-ble-advertiser -->
    <receiver
        android:name="com.tulparyazilim.ble.RestartReceiver"
        android:enabled="true"
        android:exported="true"
        android:permission="android.permission.RECEIVE_BOOT_COMPLETED">
        <intent-filter>
            <action android:name="android.intent.action.BOOT_COMPLETED" />
            <action android:name="android.intent.action.QUICKBOOT_POWERON" />
        </intent-filter>
    </receiver>`;
    
    const updatedContent = manifestContent.replace(
      '<activity android:name=".MainActivity"',
      `${receiverBlock}\n    \n    <activity android:name=".MainActivity"`
    );
    
    fs.writeFileSync(androidManifestPath, updatedContent);
    log('✅ Added RestartReceiver to AndroidManifest.xml', 'green');
  }
}

// Step 8: Rebuild Android
log('🔨 Rebuilding Android...', 'blue');
runCommand('npx expo run:android', 'Building Android app');

// Step 9: Test the BLE advertiser module
log('🧪 Testing BLE advertiser module...', 'blue');

const testScript = `
const { NativeModules } = require('react-native');

console.log('Available NativeModules:', Object.keys(NativeModules));

// Test tp-rn-ble-advertiser
try {
  const ReactNativeBleAdvertiser = require('tp-rn-ble-advertiser');
  console.log('tp-rn-ble-advertiser module:', ReactNativeBleAdvertiser);
  console.log('Module keys:', Object.keys(ReactNativeBleAdvertiser));
  
  if (ReactNativeBleAdvertiser && typeof ReactNativeBleAdvertiser === 'object') {
    const hasStartBroadcast = 'startBroadcast' in ReactNativeBleAdvertiser;
    const hasStopBroadcast = 'stopBroadcast' in ReactNativeBleAdvertiser;
    
    console.log('hasStartBroadcast:', hasStartBroadcast);
    console.log('hasStopBroadcast:', hasStopBroadcast);
    
    if (hasStartBroadcast && hasStopBroadcast) {
      console.log('✅ BLE advertiser module is properly initialized');
    } else {
      console.log('❌ BLE advertiser module missing required methods');
    }
  } else {
    console.log('❌ BLE advertiser module not available');
  }
} catch (error) {
  console.log('❌ Error loading BLE advertiser module:', error.message);
}
`;

const testFilePath = path.join(process.cwd(), 'test-ble-advertiser.js');
fs.writeFileSync(testFilePath, testScript);

log('📋 Running BLE advertiser test...', 'blue');
try {
  const testResult = execSync('node test-ble-advertiser.js', { 
    stdio: 'pipe', 
    encoding: 'utf8',
    cwd: process.cwd()
  });
  console.log(testResult);
} catch (error) {
  log(`❌ Test failed: ${error.message}`, 'red');
}

// Clean up test file
fs.unlinkSync(testFilePath);

log('\n🎉 BLE Advertiser fix completed!', 'green');
log('\n📋 Next steps:', 'blue');
log('1. Run: npx expo run:android', 'yellow');
log('2. Test BLE advertising in the app', 'yellow');
log('3. Check logs for any remaining issues', 'yellow');
log('\n💡 If issues persist, try:', 'blue');
log('- Restart the Metro bundler: npx expo start --clear', 'yellow');
log('- Clear app data and reinstall', 'yellow');
log('- Check device Bluetooth settings', 'yellow'); 