
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Testing Android Bluetooth Setup...\n');

// Check if we're in the right directory
const currentDir = process.cwd();
console.log(`📁 Current directory: ${currentDir}`);

// Check Android manifest
const manifestPath = path.join(currentDir, 'android/app/src/main/AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
  console.log('✅ AndroidManifest.xml found');
  
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  
  // Check for required permissions
  const requiredPermissions = [
    'android.permission.BLUETOOTH',
    'android.permission.BLUETOOTH_ADMIN',
    'android.permission.BLUETOOTH_CONNECT',
    'android.permission.BLUETOOTH_SCAN',
    'android.permission.BLUETOOTH_ADVERTISE',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION'
  ];
  
  console.log('\n📋 Checking permissions in AndroidManifest.xml:');
  requiredPermissions.forEach(permission => {
    if (manifest.includes(permission)) {
      console.log(`  ✅ ${permission}`);
    } else {
      console.log(`  ❌ ${permission} - MISSING`);
    }
  });
  
  // Check for Bluetooth features
  const bluetoothFeatures = [
    'android.hardware.bluetooth',
    'android.hardware.bluetooth_le'
  ];
  
  console.log('\n🔧 Checking Bluetooth features:');
  bluetoothFeatures.forEach(feature => {
    if (manifest.includes(feature)) {
      console.log(`  ✅ ${feature}`);
    } else {
      console.log(`  ❌ ${feature} - MISSING`);
    }
  });
  
} else {
  console.log('❌ AndroidManifest.xml not found');
}

// Check package.json for BLE dependencies
const packagePath = path.join(currentDir, 'package.json');
if (fs.existsSync(packagePath)) {
  console.log('\n📦 Checking BLE dependencies in package.json:');
  
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  
  const bleDependencies = [
    'react-native-ble-plx',
    '@react-native-community/bluetooth-escpos-printer',
    'react-native-bluetooth-escpos-printer'
  ];
  
  bleDependencies.forEach(dep => {
    if (dependencies[dep]) {
      console.log(`  ✅ ${dep}: ${dependencies[dep]}`);
    } else {
      console.log(`  ❌ ${dep} - NOT INSTALLED`);
    }
  });
}

// Check if Android project is properly set up
const androidDir = path.join(currentDir, 'android');
if (fs.existsSync(androidDir)) {
  console.log('\n🤖 Android project structure:');
  
  const androidFiles = [
    'app/build.gradle',
    'app/src/main/java',
    'gradle.properties',
    'settings.gradle'
  ];
  
  androidFiles.forEach(file => {
    const filePath = path.join(androidDir, file);
    if (fs.existsSync(filePath)) {
      console.log(`  ✅ ${file}`);
    } else {
      console.log(`  ❌ ${file} - MISSING`);
    }
  });
  
  // Check build.gradle for BLE dependencies
  const buildGradlePath = path.join(androidDir, 'app/build.gradle');
  if (fs.existsSync(buildGradlePath)) {
    console.log('\n🔧 Checking build.gradle for BLE configuration:');
    
    const buildGradle = fs.readFileSync(buildGradlePath, 'utf8');
    
    // Check for BLE-related configurations
    const bleConfigs = [
      'react-native-ble-plx',
      'android.hardware.bluetooth',
      'android.hardware.bluetooth_le'
    ];
    
    bleConfigs.forEach(config => {
      if (buildGradle.includes(config)) {
        console.log(`  ✅ Found: ${config}`);
      } else {
        console.log(`  ❌ Missing: ${config}`);
      }
    });
  }
}

// Check for any BLE-related native modules
console.log('\n🔍 Checking for BLE native modules:');
try {
  const nodeModulesPath = path.join(currentDir, 'node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    const bleModules = fs.readdirSync(nodeModulesPath).filter(dir => 
      dir.toLowerCase().includes('ble') || 
      dir.toLowerCase().includes('bluetooth')
    );
    
    if (bleModules.length > 0) {
      bleModules.forEach(module => {
        console.log(`  📦 Found BLE module: ${module}`);
      });
    } else {
      console.log('  ❌ No BLE modules found in node_modules');
    }
  }
} catch (error) {
  console.log('  ⚠️  Error checking node_modules:', error.message);
}

console.log('\n📋 Recommendations:');
console.log('1. Make sure Bluetooth is enabled on your device');
console.log('2. Grant all Bluetooth permissions when prompted');
console.log('3. For Android 12+, ensure BLUETOOTH_ADVERTISE permission is granted');
console.log('4. Check that react-native-ble-plx is properly linked');
console.log('5. Try rebuilding the app after permission changes');

console.log('\n🚀 To test the app:');
console.log('1. npx react-native run-android');
console.log('2. Check the logs for BLE-related errors');
console.log('3. Try the BLE payment feature in the app');

console.log('\n✅ Android Bluetooth setup check complete!'); 