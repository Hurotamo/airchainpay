const { ethers } = require('ethers');
const config = require('../config/default');

async function testMultiChainSupport() {
  console.log('🧪 Testing Multi-Chain Support (Base Sepolia + Core Testnet 2)...\n');
  
  const networks = [
    {
      name: 'Base Sepolia',
      chainId: 84532,
      rpcUrl: 'https://sepolia.base.org',
      contractAddress: '0x7B79117445C57eea1CEAb4733020A55e1D503934',
      currency: 'ETH',
    },
    {
      name: 'Core Testnet 2',
      chainId: 1114,
      rpcUrl: 'https://rpc.test2.btcs.network',
      contractAddress: '0x7B79117445C57eea1CEAb4733020A55e1D503934',
      currency: 'TCORE2',
    },
  ];

  const results = [];

  for (const network of networks) {
    console.log(`🌐 Testing ${network.name} (Chain ID: ${network.chainId})...`);
    
    try {
      // Test 1: RPC Connection
      console.log('   1. Testing RPC Connection...');
      const provider = new ethers.JsonRpcProvider(network.rpcUrl);
      const networkInfo = await provider.getNetwork();
      
      if (networkInfo.chainId !== BigInt(network.chainId)) {
        throw new Error(`Chain ID mismatch: expected ${network.chainId}, got ${networkInfo.chainId}`);
      }
      console.log('   ✅ RPC Connection successful');

      // Test 2: Block Access
      console.log('   2. Testing Block Access...');
      const latestBlock = await provider.getBlock('latest');
      console.log(`   ✅ Latest block: ${latestBlock.number}`);

      // Test 3: Gas Price
      console.log('   3. Testing Gas Price...');
      const gasPrice = await provider.getFeeData();
      console.log(`   ✅ Gas price: ${ethers.formatUnits(gasPrice.gasPrice, 'gwei')} gwei`);

      // Test 4: Contract Check
      console.log('   4. Testing Contract Address...');
      const contractCode = await provider.getCode(network.contractAddress);
      const contractExists = contractCode !== '0x';
      console.log(`   ✅ Contract ${contractExists ? 'exists' : 'not found'} at ${network.contractAddress}`);

      // Test 5: Network Status
      console.log('   5. Testing Network Status...');
      const blockNumber = await provider.getBlockNumber();
      console.log(`   ✅ Network responsive, current block: ${blockNumber}`);

      results.push({
        name: network.name,
        chainId: network.chainId,
        status: '✅ Online',
        blockNumber: blockNumber,
        gasPrice: ethers.formatUnits(gasPrice.gasPrice, 'gwei'),
        contractExists: contractExists,
        rpcUrl: network.rpcUrl,
        currency: network.currency,
      });

      console.log(`   ✅ ${network.name} test completed successfully\n`);

    } catch (error) {
      console.log(`   ❌ ${network.name} test failed: ${error.message}\n`);
      
      results.push({
        name: network.name,
        chainId: network.chainId,
        status: '❌ Offline',
        error: error.message,
      });
    }
  }

  // Display summary
  console.log('📊 Multi-Chain Test Summary:');
  console.log('='.repeat(80));
  console.log('Network'.padEnd(20) + 'Status'.padEnd(10) + 'Chain ID'.padEnd(10) + 'Block'.padEnd(12) + 'Gas (gwei)'.padEnd(12) + 'Contract'.padEnd(10));
  console.log('='.repeat(80));
  
  results.forEach(result => {
    if (result.status === '✅ Online') {
      console.log(
        result.name.padEnd(20) +
        result.status.padEnd(10) +
        result.chainId.toString().padEnd(10) +
        result.blockNumber.toString().padEnd(12) +
        result.gasPrice.padEnd(12) +
        (result.contractExists ? '✅' : '❌').padEnd(10)
      );
    } else {
      console.log(
        result.name.padEnd(20) +
        result.status.padEnd(10) +
        result.chainId.toString().padEnd(10) +
        'N/A'.padEnd(12) +
        'N/A'.padEnd(12) +
        'N/A'.padEnd(10)
      );
    }
  });
  
  console.log('='.repeat(80));

  // Test relay API endpoints
  console.log('\n🔌 Testing Relay API Endpoints...');
  
  try {
    // Test health endpoint
    const healthResponse = await fetch('http://localhost:4000/health');
    const healthData = await healthResponse.json();
    console.log('✅ Health endpoint working');

    // Test networks status endpoint
    const networksResponse = await fetch('http://localhost:4000/networks/status');
    const networksData = await networksResponse.json();
    console.log('✅ Networks status endpoint working');
    console.log(`   Supported networks: ${networksData.data.totalNetworks}`);
    console.log(`   Online networks: ${networksData.data.onlineNetworks}`);

  } catch (error) {
    console.log(`❌ Relay API test failed: ${error.message}`);
    console.log('   Make sure the relay server is running on port 4000');
  }

  // Recommendations
  console.log('\n💡 Multi-Chain Support Status:');
  const onlineNetworks = results.filter(r => r.status === '✅ Online').length;
  
  if (onlineNetworks === 2) {
    console.log('✅ Both networks are online and ready for multi-chain transactions');
    console.log('✅ Relay can process transactions for both Base Sepolia and Core Testnet 2');
  } else if (onlineNetworks === 1) {
    console.log('⚠️  Only one network is online - multi-chain support limited');
    const onlineNetwork = results.find(r => r.status === '✅ Online');
    console.log(`   Available network: ${onlineNetwork.name}`);
  } else {
    console.log('❌ No networks are online - check your internet connection');
  }

  console.log('\n🎉 Multi-Chain Test Completed!');
}

// Run the test
testMultiChainSupport().catch(console.error); 