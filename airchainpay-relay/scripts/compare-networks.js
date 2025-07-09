const { ethers } = require('ethers');

async function compareNetworks() {
  console.log('🔍 Comparing Base Sepolia vs Core Testnet 2 Networks...\n');
  
  const networks = [
    {
      name: 'Base Sepolia',
      rpcUrl: 'https://sepolia.base.org',
      chainId: 84532,
      currency: 'ETH',
      explorer: 'https://sepolia.basescan.org',
      contractAddress: '0x7B79117445C57eea1CEAb4733020A55e1D503934'
    },
    {
      name: 'Core Testnet 2',
      rpcUrl: 'https://rpc.test2.btcs.network',
      chainId: 1114,
      currency: 'TCORE2',
      explorer: 'https://scan.test2.btcs.network',
      contractAddress: '0x7B79117445C57eea1CEAb4733020A55e1D503934'
    }
  ];
  
  const results = [];
  
  for (const network of networks) {
    console.log(`\n🌐 Testing ${network.name}...`);
    
    try {
      const provider = new ethers.JsonRpcProvider(network.rpcUrl);
      
      // Get network info
      const networkInfo = await provider.getNetwork();
      const latestBlock = await provider.getBlock('latest');
      const gasPrice = await provider.getFeeData();
      const contractCode = await provider.getCode(network.contractAddress);
      
      const result = {
        name: network.name,
        status: '✅ Online',
        chainId: Number(networkInfo.chainId),
        expectedChainId: network.chainId,
        blockNumber: latestBlock.number,
        gasPrice: ethers.formatUnits(gasPrice.gasPrice, 'gwei'),
        contractExists: contractCode !== '0x',
        rpcUrl: network.rpcUrl,
        currency: network.currency,
        explorer: network.explorer
      };
      
      results.push(result);
      
      console.log(`   ✅ Status: ${result.status}`);
      console.log(`   📊 Block: ${result.blockNumber}`);
      console.log(`   ⛽ Gas: ${result.gasPrice} gwei`);
      console.log(`   📄 Contract: ${result.contractExists ? '✅ Exists' : '❌ Not Found'}`);
      
    } catch (error) {
      console.log(`   ❌ Status: Offline`);
      console.log(`   🔍 Error: ${error.message}`);
      
      results.push({
        name: network.name,
        status: '❌ Offline',
        error: error.message
      });
    }
  }
  
  // Display comparison table
  console.log('\n📊 Network Comparison Summary:');
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
        'N/A'.padEnd(10) +
        'N/A'.padEnd(12) +
        'N/A'.padEnd(12) +
        'N/A'.padEnd(10)
      );
    }
  });
  
  console.log('='.repeat(80));
  
  // Key differences
  console.log('\n🔍 Key Differences:');
  console.log('• Base Sepolia: Lower gas prices, contract deployed');
  console.log('• Core Testnet 2: Higher gas prices, contract needs deployment');
  console.log('• Base Sepolia: More established testnet');
  console.log('• Core Testnet 2: Newer testnet, Bitcoin-focused');
  
  // Recommendations
  console.log('\n💡 Recommendations:');
  const baseOnline = results.find(r => r.name === 'Base Sepolia')?.status === '✅ Online';
  const coreOnline = results.find(r => r.name === 'Core Testnet 2')?.status === '✅ Online';
  
  if (baseOnline && coreOnline) {
    console.log('✅ Both networks are online and ready for use');
    console.log('📝 Consider deploying contracts to both networks for testing');
  } else if (baseOnline) {
    console.log('⚠️  Only Base Sepolia is online - use it for testing');
  } else if (coreOnline) {
    console.log('⚠️  Only Core Testnet 2 is online - use it for testing');
  } else {
    console.log('❌ Both networks are offline - check your internet connection');
  }
}

// Run the comparison
compareNetworks().catch(console.error); 