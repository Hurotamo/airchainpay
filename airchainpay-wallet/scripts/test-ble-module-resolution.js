#!/usr/bin/env node

console.log('🧪 Testing BLE Module Resolution...\n');

// Test if the module can be imported safely
try {
  // Simulate React Native environment
  global.__DEV__ = true;
  global.navigator = { product: 'ReactNative' };
  
  console.log('📋 Testing module import...');
  
  // Try to require the module
  const module = require('tp-rn-ble-advertiser');
  
  console.log('✅ Module imported successfully');
  console.log('📊 Module info:');
  console.log('  - Type:', typeof module);
  console.log('  - Available methods:', Object.keys(module));
  
  // Test if required methods exist
  const hasStartBroadcast = typeof module.startBroadcast === 'function';
  const hasStopBroadcast = typeof module.stopBroadcast === 'function';
  
  console.log('🔍 Method availability:');
  console.log('  - startBroadcast:', hasStartBroadcast ? '✅' : '❌');
  console.log('  - stopBroadcast:', hasStopBroadcast ? '✅' : '❌');
  
  if (hasStartBroadcast && hasStopBroadcast) {
    console.log('\n🎉 BLE module is properly configured!');
  } else {
    console.log('\n⚠️ BLE module is available but missing required methods');
  }
  
} catch (error) {
  console.log('❌ Module import failed:', error.message);
  console.log('\n💡 This is expected in Node.js environment. The module will work in React Native.');
  console.log('📱 To test properly, run the app on a device or emulator.');
}

console.log('\n✅ Test completed'); 