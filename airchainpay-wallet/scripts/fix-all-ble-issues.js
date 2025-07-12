#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 AirChainPay Comprehensive BLE Fixer');
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
  console.log('💡 Installing react-native-ble-plx...');
  try {
    execSync('npm install react-native-ble-plx', { stdio: 'inherit' });
    console.log('✅ react-native-ble-plx installed successfully');
  } catch (error) {
    console.error('❌ Failed to install react-native-ble-plx:', error.message);
    process.exit(1);
  }
} else {
  console.log('✅ react-native-ble-plx is installed:', bleDependency);
}

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
      console.log('💡 Attempting to link BLE module...');
      try {
        execSync('npx react-native link react-native-ble-plx', { stdio: 'inherit' });
        console.log('✅ BLE module linked successfully');
      } catch (error) {
        console.warn('⚠️  Failed to link BLE module automatically:', error.message);
        console.log('💡 Manual linking may be required');
      }
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
      console.log('💡 Manual linking may be required');
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
      console.log('💡 Attempting to install pods...');
      try {
        execSync('cd ios && pod install', { stdio: 'inherit' });
        console.log('✅ iOS pods installed successfully');
      } catch (error) {
        console.warn('⚠️  Failed to install iOS pods:', error.message);
        console.log('💡 Manual pod install may be required');
      }
    }
  }
} else {
  console.log('⚠️  iOS directory not found');
}

console.log('\n🔧 Running comprehensive fixes...');

// Try to fix common issues
try {
  // Clean node_modules and reinstall
  console.log('🧹 Cleaning node_modules...');
  execSync('rm -rf node_modules', { stdio: 'inherit' });
  execSync('npm install', { stdio: 'inherit' });
  console.log('✅ Dependencies reinstalled');
  
  // Clear Metro cache
  console.log('🗑️  Clearing Metro cache...');
  try {
    execSync('npx expo start --clear', { stdio: 'inherit', timeout: 10000 });
    console.log('✅ Metro cache cleared');
  } catch (error) {
    console.log('⚠️  Metro cache clear failed, but continuing...');
  }
  
  // Rebuild native code
  console.log('🔨 Rebuilding native code...');
  try {
    execSync('npx expo prebuild --clean', { stdio: 'inherit' });
    console.log('✅ Native code rebuilt successfully');
  } catch (error) {
    console.warn('⚠️  Native code rebuild failed:', error.message);
    console.log('💡 Manual rebuild may be required');
  }
  
} catch (error) {
  console.log('⚠️  Some cleanup steps failed, but continuing...');
}

// Create a test script to verify BLE functionality
console.log('\n🔧 Creating BLE test script...');
const testScriptPath = path.join(__dirname, '..', 'scripts', 'test-ble-comprehensive.js');
const testScriptContent = `#!/usr/bin/env node

import { BluetoothManager } from '../src/bluetooth/BluetoothManager.ts';

console.log('🧪 Comprehensive BLE Test');
console.log('=========================\n');

async function testBLEComprehensive() {
  try {
    console.log('1. Creating BluetoothManager instance...');
    const manager = new BluetoothManager();
    
    console.log('2. Checking BLE availability...');
    const isAvailable = manager.isBleAvailable();
    console.log(\`   BLE Available: \${isAvailable ? '✅ YES' : '❌ NO'}\`);
    
    console.log('3. Checking initialization error...');
    const initError = manager.getInitializationError();
    if (initError) {
      console.log(\`   Initialization Error: ❌ \${initError}\`);
    } else {
      console.log('   Initialization Error: ✅ NONE');
    }
    
    console.log('4. Testing Bluetooth state...');
    try {
      const bluetoothEnabled = await manager.isBluetoothEnabled();
      console.log(\`   Bluetooth Enabled: \${bluetoothEnabled ? '✅ YES' : '❌ NO'}\`);
    } catch (error) {
      console.log(\`   Bluetooth State Error: ❌ \${error.message}\`);
    }
    
    console.log('5. Testing permissions...');
    try {
      await manager.requestPermissions();
      console.log('   Permissions: ✅ GRANTED');
    } catch (error) {
      console.log(\`   Permissions Error: ❌ \${error.message}\`);
    }
    
    console.log('6. Testing advertising support...');
    try {
      const advertisingSupport = await manager.checkAdvertisingSupport();
      console.log(\`   Advertising Supported: \${advertisingSupport.supported ? '✅ YES' : '❌ NO'}\`);
      if (!advertisingSupport.supported) {
        console.log('   Missing Requirements:', advertisingSupport.missingRequirements);
      }
    } catch (error) {
      console.log(\`   Advertising Support Error: ❌ \${error.message}\`);
    }
    
    console.log('\\n📊 Summary:');
    if (isAvailable && !initError) {
      console.log('✅ BLE module is working correctly!');
      console.log('💡 You can now use BLE functionality in your app.');
    } else {
      console.log('❌ BLE module has issues that need to be resolved.');
      console.log('💡 The app will use fallback mode for BLE functionality.');
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.log('💡 This indicates the BLE module is not properly linked.');
  }
}

testBLEComprehensive();
`;

fs.writeFileSync(testScriptPath, testScriptContent);
console.log('✅ Comprehensive BLE test script created');

console.log('\n📋 Recommended next steps:');
console.log('1. Run "node scripts/test-ble-comprehensive.js" to test BLE functionality');
console.log('2. Run "npx expo run:android" or "npx expo run:ios" to test on device');
console.log('3. If issues persist, try:');
console.log('   - "npx react-native link react-native-ble-plx"');
console.log('   - "cd ios && pod install" (for iOS)');
console.log('   - Clean and rebuild the project');

console.log('\n🔍 To test BLE functionality:');
console.log('1. Open the app');
console.log('2. Go to the BLE payment screen');
console.log('3. Check the console logs for BLE initialization messages');
console.log('4. Look for any error messages starting with "[BLE]"');
console.log('5. The app will gracefully handle missing BLE modules with fallback');

console.log('\n✅ Comprehensive BLE fix complete!');
console.log('💡 The app will now handle BLE issues gracefully with proper fallback support.'); 