const { BLEManager } = require('../src/bluetooth/BLEManager');
const logger = require('../src/utils/logger');

async function testBLE() {
  console.log('Testing AirChainPay BLE functionality...');
  
  try {
    // Initialize BLE Manager
    const bleManager = new BLEManager();
    
    console.log('1. Initializing BLE Manager...');
    await bleManager.initialize();
    console.log('✅ BLE Manager initialized');
    
    console.log('2. Starting advertising...');
    await bleManager.startAdvertising();
    console.log('✅ Started advertising as AirChainPay Relay');
    
    console.log('3. Starting device scanning...');
    await bleManager.startScanning();
    console.log('✅ Started scanning for devices');
    
    // Set up event listeners
    bleManager.on('deviceDiscovered', (device) => {
      console.log('📱 Discovered device:', device);
    });
    
    bleManager.on('deviceConnected', (device) => {
      console.log('🔗 Device connected:', device);
    });
    
    bleManager.on('deviceDisconnected', (deviceId) => {
      console.log('❌ Device disconnected:', deviceId);
    });
    
    bleManager.on('transactionReceived', (deviceId, transactionData) => {
      console.log('💰 Transaction received from device:', deviceId);
      console.log('Transaction data:', transactionData);
    });
    
    // Keep the process running
    console.log('\n🎉 BLE test setup complete!');
    console.log('The relay is now advertising and scanning for devices.');
    console.log('Press Ctrl+C to stop...');
    
    // Keep alive
    process.on('SIGINT', () => {
      console.log('\nShutting down BLE...');
      bleManager.destroy();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ BLE test failed:', error);
    process.exit(1);
  }
}

// Run the test
testBLE(); 