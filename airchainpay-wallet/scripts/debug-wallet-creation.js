const { MultiChainWalletManager } = require('../src/wallet/MultiChainWalletManager');

async function debugWalletCreation() {
  console.log('=== Wallet Creation Debug Script ===');
  
  try {
    const walletManager = MultiChainWalletManager.getInstance();
    
    // Check initial state
    console.log('\n1. Checking initial wallet state...');
    const hasWallet = await walletManager.hasWallet();
    const hasPassword = await walletManager.hasPassword();
    const isBackupConfirmed = await walletManager.isBackupConfirmed();
    
    console.log('Has wallet:', hasWallet);
    console.log('Has password:', hasPassword);
    console.log('Backup confirmed:', isBackupConfirmed);
    
    if (hasWallet) {
      console.log('\n2. Wallet exists, checking setup completion...');
      const setupComplete = hasPassword && isBackupConfirmed;
      console.log('Setup complete:', setupComplete);
      
      if (!setupComplete) {
        console.log('Setup incomplete - this would cause the loop!');
        console.log('Missing password:', !hasPassword);
        console.log('Missing backup confirmation:', !isBackupConfirmed);
      }
    } else {
      console.log('\n2. No wallet exists - this is expected for new setup');
    }
    
    // Test wallet creation flow
    console.log('\n3. Testing wallet creation flow...');
    
    // Generate seed phrase
    console.log('Generating seed phrase...');
    const seedPhrase = await walletManager.generateSeedPhrase();
    console.log('Seed phrase generated:', !!seedPhrase);
    
    // Check temporary storage
    console.log('Checking temporary seed phrase...');
    const hasTempSeed = await walletManager.hasTemporarySeedPhrase();
    console.log('Has temporary seed phrase:', hasTempSeed);
    
    // Set password
    console.log('Setting password...');
    await walletManager.setWalletPassword('TestPassword123');
    console.log('Password set');
    
    // Confirm backup
    console.log('Confirming backup...');
    await walletManager.confirmBackup();
    console.log('Backup confirmed');
    
    // Check final state
    console.log('\n4. Checking final state...');
    const finalHasWallet = await walletManager.hasWallet();
    const finalHasPassword = await walletManager.hasPassword();
    const finalIsBackupConfirmed = await walletManager.isBackupConfirmed();
    
    console.log('Final has wallet:', finalHasWallet);
    console.log('Final has password:', finalHasPassword);
    console.log('Final backup confirmed:', finalIsBackupConfirmed);
    
    const finalSetupComplete = finalHasWallet && finalHasPassword && finalIsBackupConfirmed;
    console.log('Final setup complete:', finalSetupComplete);
    
    if (finalSetupComplete) {
      console.log('✅ Wallet creation flow works correctly!');
    } else {
      console.log('❌ Wallet creation flow has issues!');
    }
    
  } catch (error) {
    console.error('Error in debug script:', error);
  }
}

// Run the debug script
debugWalletCreation(); 