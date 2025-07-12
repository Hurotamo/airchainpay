#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 AirChainPay Wallet - APK Readiness Test');
console.log('===========================================\n');

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: []
};

function addTestResult(name, passed, message = '', warning = false) {
  const result = { name, passed, message, warning };
  testResults.tests.push(result);
  
  if (warning) {
    testResults.warnings++;
    console.log(`⚠️  ${name}: ${message}`);
  } else if (passed) {
    testResults.passed++;
    console.log(`✅ ${name}: ${message}`);
  } else {
    testResults.failed++;
    console.log(`❌ ${name}: ${message}`);
  }
}

// Test 1: Check if package.json exists and has required fields
function testPackageJson() {
  console.log('1. Checking package.json...');
  
  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    
    // Check required fields
    const requiredFields = ['name', 'version', 'main', 'scripts'];
    const missingFields = requiredFields.filter(field => !packageJson[field]);
    
    if (missingFields.length > 0) {
      addTestResult('Package.json required fields', false, `Missing fields: ${missingFields.join(', ')}`);
    } else {
      addTestResult('Package.json required fields', true, 'All required fields present');
    }
    
    // Check dependencies
    const requiredDeps = [
      'expo',
      'react',
      'react-native',
      'expo-router',
      'expo-dev-client'
    ];
    
    const missingDeps = requiredDeps.filter(dep => !packageJson.dependencies?.[dep]);
    
    if (missingDeps.length > 0) {
      addTestResult('Required dependencies', false, `Missing dependencies: ${missingDeps.join(', ')}`);
    } else {
      addTestResult('Required dependencies', true, 'All required dependencies present');
    }
    
  } catch (error) {
    addTestResult('Package.json exists', false, 'package.json not found or invalid');
  }
}

// Test 2: Check app.config.js configuration
function testAppConfig() {
  console.log('\n2. Checking app.config.js...');
  
  try {
    const appConfig = require('../app.config.js');
    
    // Check Android configuration
    if (!appConfig.expo.android) {
      addTestResult('Android configuration', false, 'Android configuration missing');
    } else {
      const android = appConfig.expo.android;
      
      if (!android.package) {
        addTestResult('Android package name', false, 'Android package name missing');
      } else {
        addTestResult('Android package name', true, `Package: ${android.package}`);
      }
      
      if (!android.versionCode) {
        addTestResult('Android version code', false, 'Android version code missing');
      } else {
        addTestResult('Android version code', true, `Version: ${android.versionCode}`);
      }
      
      if (!android.permissions || android.permissions.length === 0) {
        addTestResult('Android permissions', false, 'Android permissions missing');
      } else {
        addTestResult('Android permissions', true, `${android.permissions.length} permissions configured`);
      }
    }
    
    // Check app metadata
    if (!appConfig.expo.name) {
      addTestResult('App name', false, 'App name missing');
    } else {
      addTestResult('App name', true, `Name: ${appConfig.expo.name}`);
    }
    
    if (!appConfig.expo.version) {
      addTestResult('App version', false, 'App version missing');
    } else {
      addTestResult('App version', true, `Version: ${appConfig.expo.version}`);
    }
    
    if (!appConfig.expo.icon) {
      addTestResult('App icon', false, 'App icon missing');
    } else {
      addTestResult('App icon', true, 'Icon configured');
    }
    
  } catch (error) {
    addTestResult('App configuration', false, `Error loading app.config.js: ${error.message}`);
  }
}

// Test 3: Check EAS configuration
function testEasConfig() {
  console.log('\n3. Checking EAS configuration...');
  
  try {
    const easConfig = JSON.parse(fs.readFileSync('eas.json', 'utf8'));
    
    if (!easConfig.build) {
      addTestResult('EAS build configuration', false, 'Build configuration missing');
    } else {
      addTestResult('EAS build configuration', true, 'Build profiles configured');
      
      // Check for production build profile
      if (!easConfig.build.production) {
        addTestResult('Production build profile', false, 'Production build profile missing');
      } else {
        addTestResult('Production build profile', true, 'Production profile configured');
      }
    }
    
  } catch (error) {
    addTestResult('EAS configuration', false, 'eas.json not found or invalid');
  }
}

// Test 4: Check required assets
function testAssets() {
  console.log('\n4. Checking required assets...');
  
  const requiredAssets = [
    'assets/images/icon.png',
    'assets/images/adaptive-icon.png',
    'assets/images/splash-icon.png'
  ];
  
  requiredAssets.forEach(asset => {
    if (fs.existsSync(asset)) {
      addTestResult(`Asset: ${asset}`, true, 'Asset found');
    } else {
      addTestResult(`Asset: ${asset}`, false, 'Asset missing');
    }
  });
}

// Test 5: Check TypeScript configuration
function testTypeScriptConfig() {
  console.log('\n5. Checking TypeScript configuration...');
  
  if (fs.existsSync('tsconfig.json')) {
    addTestResult('TypeScript config', true, 'tsconfig.json found');
  } else {
    addTestResult('TypeScript config', false, 'tsconfig.json missing');
  }
}

// Test 6: Check for critical source files
function testSourceFiles() {
  console.log('\n6. Checking critical source files...');
  
  const criticalFiles = [
    'app/_layout.tsx',
    'app/(tabs)/index.tsx',
    'src/wallet/MultiChainWalletManager.ts',
    'src/bluetooth/BluetoothManager.ts'
  ];
  
  criticalFiles.forEach(file => {
    if (fs.existsSync(file)) {
      addTestResult(`Source file: ${file}`, true, 'File found');
    } else {
      addTestResult(`Source file: ${file}`, false, 'File missing');
    }
  });
}

// Test 7: Check for linting issues
function testLinting() {
  console.log('\n7. Checking for linting issues...');
  
  try {
    const { execSync } = require('child_process');
    execSync('npm run lint', { stdio: 'pipe' });
    addTestResult('Linting', true, 'No linting issues found');
  } catch (error) {
    addTestResult('Linting', false, 'Linting issues found - run "npm run lint" for details');
  }
}

// Test 8: Check dependencies installation
function testDependencies() {
  console.log('\n8. Checking dependencies...');
  
  if (fs.existsSync('node_modules')) {
    addTestResult('Node modules', true, 'Dependencies installed');
  } else {
    addTestResult('Node modules', false, 'Dependencies not installed - run "npm install"');
  }
}

// Test 9: Check for environment variables
function testEnvironmentVariables() {
  console.log('\n9. Checking environment configuration...');
  
  const appConfig = require('../app.config.js');
  const extra = appConfig.expo.extra || {};
  
  const envVars = [
    'BASE_SEPOLIA_RPC_URL',
    'CORE_TESTNET_RPC_URL',
    'RELAY_SERVER_URL'
  ];
  
  envVars.forEach(varName => {
    if (extra[varName] && extra[varName] !== `your_${varName.toLowerCase()}`) {
      addTestResult(`Environment: ${varName}`, true, 'Configured');
    } else {
      addTestResult(`Environment: ${varName}`, true, 'Using default value', true);
    }
  });
}

// Test 10: Check for build readiness
function testBuildReadiness() {
  console.log('\n10. Checking build readiness...');
  
  try {
    const { execSync } = require('child_process');
    execSync('npx expo prebuild --platform android --clean', { stdio: 'pipe' });
    addTestResult('Prebuild', true, 'Android prebuild successful');
  } catch (error) {
    addTestResult('Prebuild', false, 'Android prebuild failed - check configuration');
  }
}

// Run all tests
async function runAllTests() {
  testPackageJson();
  testAppConfig();
  testEasConfig();
  testAssets();
  testTypeScriptConfig();
  testSourceFiles();
  testLinting();
  testDependencies();
  testEnvironmentVariables();
  testBuildReadiness();
  
  // Summary
  console.log('\n📊 Test Summary');
  console.log('===============');
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`⚠️  Warnings: ${testResults.warnings}`);
  
  if (testResults.failed === 0) {
    console.log('\n🎉 All critical tests passed! Your app is ready for APK generation.');
    console.log('\n📱 To build APK:');
    console.log('   npm run prebuild');
    console.log('   eas build --platform android --profile production');
  } else {
    console.log('\n⚠️  Some tests failed. Please fix the issues before generating APK.');
  }
  
  if (testResults.warnings > 0) {
    console.log('\n💡 Recommendations:');
    testResults.tests
      .filter(test => test.warning)
      .forEach(test => console.log(`   - ${test.name}: ${test.message}`));
  }
}

// Run the tests
runAllTests().catch(console.error); 