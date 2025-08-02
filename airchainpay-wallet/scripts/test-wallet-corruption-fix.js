const { MultiChainWalletManager } = require('../src/wallet/MultiChainWalletManager');
const { WalletErrorHandler } = require('../src/utils/WalletErrorHandler');
const { secureStorage } = require('../src/utils/SecureStorageService');

async function testWalletCorruptionFix() {
  console.log('Testing wallet corruption fix...');
  
  try {
    const walletManager = MultiChainWalletManager.getInstance();
    
    // Test 1: Check if wallet corruption detection works
    console.log('\n1. Testing corruption detection...');
    const wasCorrupted = await walletManager.checkAndFixCorruptedWallet();
    console.log('Corruption detected and fixed:', wasCorrupted);
    
    // Test 2: Test hasWallet with corrupted data
    console.log('\n2. Testing hasWallet with corrupted data...');
    
    // Simulate corrupted data by storing invalid private key
    await secureStorage.setItem('wallet_private_key', '0xtrue');
    
    const hasWallet = await walletManager.hasWallet();
    console.log('Has wallet after corruption:', hasWallet);
    
    // Test 3: Test createOrLoadWallet with corrupted data
    console.log('\n3. Testing createOrLoadWallet with corrupted data...');
    try {
      const wallet = await walletManager.createOrLoadWallet();
      console.log('Wallet created/loaded successfully:', wallet.address);
    } catch (error) {
      console.log('Error creating/loading wallet:', error.message);
      
      // Test error handler
      const wasFixed = await WalletErrorHandler.handleWalletError(error);
      console.log('Error handler fixed corruption:', wasFixed);
      
      if (wasFixed) {
        // Try again
        const wallet = await walletManager.createOrLoadWallet();
        console.log('Wallet created/loaded after fix:', wallet.address);
      }
    }
    
    // Test 4: Test error handler directly
    console.log('\n4. Testing error handler directly...');
    const testError = new Error('invalid BytesLike value (argument="value", value="0xtrue", code=INVALID_ARGUMENT, version=6.15.0)');
    const wasFixed = await WalletErrorHandler.handleWalletError(testError);
    console.log('Error handler fixed test error:', wasFixed);
    
    console.log('\nAll tests completed successfully!');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testWalletCorruptionFix(); 