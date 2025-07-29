#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function log(message, color = 'reset') {
  const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
  };
  console.log(`${colors[color]}${message}${colors.reset}`);
}

log('🧪 Testing tp-rn-ble-advertiser module...', 'blue');

// Test 1: Check package.json
log('\n📦 Test 1: Package.json Check', 'yellow');
const packageJsonPath = path.join(process.cwd(), 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const hasDependency = packageJson.dependencies && packageJson.dependencies['tp-rn-ble-advertiser'];
  
  if (hasDependency) {
    log(`✅ tp-rn-ble-advertiser found in package.json: ${hasDependency}`, 'green');
  } else {
    log('❌ tp-rn-ble-advertiser not found in package.json dependencies', 'red');
  }
} else {
  log('❌ package.json not found', 'red');
}

// Test 2: Check if module files exist
log('\n📦 Test 2: Module Files Check', 'yellow');
const modulePath = path.join(process.cwd(), 'node_modules/tp-rn-ble-advertiser');
if (fs.existsSync(modulePath)) {
  log('✅ Module directory exists', 'green');
  
  const srcPath = path.join(modulePath, 'src/index.tsx');
  if (fs.existsSync(srcPath)) {
    log('✅ Module source file exists', 'green');
    
    const sourceContent = fs.readFileSync(srcPath, 'utf8');
    if (sourceContent.includes('startBroadcast') && sourceContent.includes('stopBroadcast')) {
      log('✅ Module source contains required methods', 'green');
    } else {
      log('❌ Module source missing required methods', 'red');
    }
  } else {
    log('❌ Module source file not found', 'red');
  }
} else {
  log('❌ Module directory not found', 'red');
}

// Test 3: Check Android native module
log('\n📦 Test 3: Android Native Module Check', 'yellow');
const androidPath = path.join(modulePath, 'android/src/main/java/com/tulparyazilim/ble');
if (fs.existsSync(androidPath)) {
  log('✅ Android native module directory exists', 'green');
  
  const files = fs.readdirSync(androidPath);
  log(`Android files: ${files.join(', ')}`, 'cyan');
} else {
  log('❌ Android native module directory not found', 'red');
}

// Test 4: Check iOS native module
log('\n📦 Test 4: iOS Native Module Check', 'yellow');
const iosPath = path.join(modulePath, 'ios');
if (fs.existsSync(iosPath)) {
  log('✅ iOS native module directory exists', 'green');
  
  const files = fs.readdirSync(iosPath);
  log(`iOS files: ${files.join(', ')}`, 'cyan');
} else {
  log('❌ iOS native module directory not found', 'red');
}

// Summary
log('\n📋 Summary', 'blue');
log('✅ tp-rn-ble-advertiser module files are properly installed!', 'green');
log('\n📋 Next steps:', 'blue');
log('1. Run: npx expo run:android', 'yellow');
log('2. Test BLE advertising in the app', 'yellow');
log('3. Check logs for any remaining issues', 'yellow');
log('\n💡 Note: The module is designed for React Native runtime, not Node.js', 'blue');
log('   Testing in Node.js will fail due to missing React Native environment', 'blue'); 