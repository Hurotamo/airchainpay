console.log('🧪 Testing Native BLE Modules...\n');

// Test if we can import the modules
try {
  console.log('📦 Testing react-native-ble-plx...');
  const { BleManager } = require('react-native-ble-plx');
  console.log('✅ react-native-ble-plx imported successfully');
  
  // Try to create an instance
  const manager = new BleManager();
  console.log('✅ BleManager instance created successfully');
  
} catch (error) {
  console.log('❌ react-native-ble-plx test failed:', error.message);
}

try {
  console.log('\n📦 Testing react-native-ble-advertiser...');
  const BleAdvertiser = require('react-native-ble-advertiser');
  console.log('✅ react-native-ble-advertiser imported successfully');
  
  // Check if it has the required methods
  if (BleAdvertiser && typeof BleAdvertiser === 'object') {
    const hasStartAdvertising = 'startAdvertising' in BleAdvertiser;
    const hasStopAdvertising = 'stopAdvertising' in BleAdvertiser;
    
    console.log('✅ BleAdvertiser module structure:', {
      hasStartAdvertising,
      hasStopAdvertising,
      keys: Object.keys(BleAdvertiser)
    });
  } else {
    console.log('❌ BleAdvertiser is not properly structured');
  }
  
} catch (error) {
  console.log('❌ react-native-ble-advertiser test failed:', error.message);
}

console.log('\n💡 If both tests pass, the native modules are properly installed.');
console.log('   If they fail, try rebuilding the app with: npx expo run:android'); 