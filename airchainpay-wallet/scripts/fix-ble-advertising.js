const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Fixing BLE Advertising Issues...\n');

// Check current setup
console.log('📋 Current Setup Check:');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const hasBlePlx = packageJson.dependencies['react-native-ble-plx'];
const hasBleAdvertiser = packageJson.dependencies['react-native-ble-advertiser'];

console.log(`✅ react-native-ble-plx: ${hasBlePlx || 'NOT INSTALLED'}`);
console.log(`✅ react-native-ble-advertiser: ${hasBleAdvertiser || 'NOT INSTALLED'}`);

// Check if modules exist
const blePlxExists = fs.existsSync('node_modules/react-native-ble-plx');
const bleAdvertiserExists = fs.existsSync('node_modules/react-native-ble-advertiser');

console.log(`📁 Module files: ${blePlxExists ? '✅' : '❌'} ble-plx, ${bleAdvertiserExists ? '✅' : '❌'} ble-advertiser`);

// Check Android manifest
const manifestPath = 'android/app/src/main/AndroidManifest.xml';
if (fs.existsSync(manifestPath)) {
  const manifestContent = fs.readFileSync(manifestPath, 'utf8');
  
  const requiredPermissions = [
    'android.permission.BLUETOOTH',
    'android.permission.BLUETOOTH_ADMIN', 
    'android.permission.BLUETOOTH_CONNECT',
    'android.permission.BLUETOOTH_SCAN',
    'android.permission.BLUETOOTH_ADVERTISE'
  ];
  
  let allPermissionsPresent = true;
  requiredPermissions.forEach(permission => {
    const hasPermission = manifestContent.includes(permission);
    if (!hasPermission) {
      console.log(`❌ Missing permission: ${permission}`);
      allPermissionsPresent = false;
    }
  });
  
  if (allPermissionsPresent) {
    console.log('✅ All required Bluetooth permissions present');
  }
  
  const hasBleFeature = manifestContent.includes('android.hardware.bluetooth_le');
  console.log(`🔧 BLE Feature Declaration: ${hasBleFeature ? '✅' : '❌'}`);
} else {
  console.log('❌ Android manifest not found');
}

console.log('\n🔧 Fix Steps:');
console.log('1. Clean and rebuild the project:');
console.log('   npx expo prebuild --clean');
console.log('   npx expo run:android');

console.log('\n2. If using Expo dev client, rebuild:');
console.log('   npx expo run:android --clear');

console.log('\n3. Check device requirements:');
console.log('   - Must be Android device (not emulator)');
console.log('   - Android 6.0+ (API level 23+)');
console.log('   - Bluetooth enabled');
console.log('   - Location services enabled');

console.log('\n4. Grant permissions manually if needed:');
console.log('   - Go to Settings > Apps > AirChainPay > Permissions');
console.log('   - Enable Bluetooth, Location, and Nearby devices');

console.log('\n5. Test on physical device:');
console.log('   - BLE advertising may not work on emulators');
console.log('   - Use a real Android device for testing');

console.log('\n💡 Common Issues:');
console.log('- Native modules not properly linked');
console.log('- App needs to be rebuilt after permission changes');
console.log('- Testing on emulator instead of physical device');
console.log('- Bluetooth not enabled on device');
console.log('- Location services disabled');

console.log('\n🚀 Quick Fix Commands:');
console.log('npm run clean && npx expo run:android --clear'); 