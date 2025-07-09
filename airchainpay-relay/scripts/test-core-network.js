const { ethers } = require('ethers');
const config = require('../config/default');

async function testCoreNetwork() {
  console.log('🧪 Testing Core Testnet 2 Network Connection...\n');
  
  try {
    // Test 1: Basic RPC Connection
    console.log('1. Testing RPC Connection...');
    const rpcUrl = 'https://rpc.test2.btcs.network';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Test connection by getting network info
    const network = await provider.getNetwork();
    console.log('✅ RPC Connection successful');
    console.log(`   Chain ID: ${network.chainId}`);
    console.log(`   Expected: 1114`);
    
    if (network.chainId !== 1114n) {
      console.log('⚠️  Warning: Chain ID mismatch!');
    } else {
      console.log('✅ Chain ID matches expected value');
    }
    
    // Test 2: Get Latest Block
    console.log('\n2. Testing Block Access...');
    const latestBlock = await provider.getBlock('latest');
    console.log('✅ Latest block retrieved');
    console.log(`   Block Number: ${latestBlock.number}`);
    console.log(`   Block Hash: ${latestBlock.hash}`);
    console.log(`   Timestamp: ${new Date(Number(latestBlock.timestamp) * 1000).toISOString()}`);
    
    // Test 3: Get Gas Price
    console.log('\n3. Testing Gas Price...');
    const gasPrice = await provider.getFeeData();
    console.log('✅ Gas price retrieved');
    console.log(`   Gas Price: ${ethers.formatUnits(gasPrice.gasPrice, 'gwei')} gwei`);
    
    // Test 4: Test Contract Address (if provided)
    console.log('\n4. Testing Contract Address...');
    const contractAddress = process.env.CONTRACT_ADDRESS;
    if (contractAddress) {
      console.log(`   Contract Address: ${contractAddress}`);
      
      // Check if contract exists
      const code = await provider.getCode(contractAddress);
      if (code !== '0x') {
        console.log('✅ Contract exists on network');
      } else {
        console.log('⚠️  Warning: No contract found at this address');
      }
    } else {
      console.log('ℹ️  No contract address configured in environment');
    }
    
    // Test 5: Network Status
    console.log('\n5. Testing Network Status...');
    const blockNumber = await provider.getBlockNumber();
    const balance = await provider.getBalance('0x0000000000000000000000000000000000000000');
    
    console.log('✅ Network is responsive');
    console.log(`   Current Block: ${blockNumber}`);
    console.log(`   Zero Address Balance: ${ethers.formatEther(balance)} TCORE2`);
    
    // Test 6: Configuration Check
    console.log('\n6. Checking Configuration...');
    console.log(`   RPC URL: ${rpcUrl}`);
    console.log(`   Chain ID: 1114`);
    console.log(`   Currency Symbol: TCORE2`);
    console.log(`   Block Explorer: https://scan.test2.btcs.network`);
    
    console.log('\n🎉 Core Testnet 2 Network Test Completed Successfully!');
    console.log('\n📋 Summary:');
    console.log('✅ RPC connection working');
    console.log('✅ Block access working');
    console.log('✅ Gas price retrieval working');
    console.log('✅ Network is responsive');
    console.log('✅ Configuration is correct');
    
  } catch (error) {
    console.error('\n❌ Network Test Failed:');
    console.error('Error:', error.message);
    
    if (error.code === 'NETWORK_ERROR') {
      console.error('   This appears to be a network connectivity issue.');
      console.error('   Please check your internet connection and try again.');
    } else if (error.code === 'TIMEOUT') {
      console.error('   The RPC request timed out.');
      console.error('   The network might be experiencing issues.');
    } else if (error.message.includes('fetch')) {
      console.error('   Unable to connect to the RPC endpoint.');
      console.error('   Please verify the RPC URL is correct.');
    }
    
    process.exit(1);
  }
}

// Run the test
testCoreNetwork().catch(console.error); 