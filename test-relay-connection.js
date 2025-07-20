// Test relay connection with environment-based configuration
const getRelayConfig = () => {
  const env = process.env.NODE_ENV || 'development';
  
  const config = {
    development: {
      relayEndpoints: [
        'http://localhost:4000',
        'http://127.0.0.1:4000',
        'http://10.0.2.2:4000' // Android emulator localhost
      ],
      healthEndpoint: '/health',
      transactionEndpoint: '/api/send_tx'
    },
    production: {
      relayEndpoints: [
        process.env.RELAY_URL || 'https://relay.airchainpay.com',
        process.env.RELAY_BACKUP_URL || 'https://relay-backup.airchainpay.com'
      ],
      healthEndpoint: '/health',
      transactionEndpoint: '/api/send_tx'
    },
    staging: {
      relayEndpoints: [
        process.env.STAGING_RELAY_URL || 'https://staging-relay.airchainpay.com'
      ],
      healthEndpoint: '/health',
      transactionEndpoint: '/api/send_tx'
    }
  };
  
  return config[env] || config.development;
};

async function testRelayHealth() {
  const config = getRelayConfig();
  
  for (const endpoint of config.relayEndpoints) {
    try {
      const healthUrl = `${endpoint}${config.healthEndpoint}`;
      console.log(`Testing relay health at ${healthUrl}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      
      const response = await fetch(healthUrl, { 
        signal: controller.signal,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AirChainPay-Wallet/1.0'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Relay health check passed for ${healthUrl}:`, data);
        return true;
      } else {
        console.log(`❌ Relay health check failed with status ${response.status} for ${healthUrl}`);
      }
    } catch (error) {
      console.log(`❌ Health check failed for ${endpoint}:`, error.message);
    }
  }
  
  console.log('❌ All relay health checks failed');
  return false;
}

async function testRelayTransaction() {
  try {
    console.log('\nTesting relay transaction submission...');
    
    const config = getRelayConfig();
    const transactionUrl = `${config.relayEndpoints[0]}${config.transactionEndpoint}`;
    
    const testData = {
      signed_tx: "0x02f863808080808094b490ea033524c85c2740e6ddf6a30c75bbff1a8f830f424080c001a08979fb9a6c3615478099bf618240931bd0893c21f71982cd095fea3a7086ed26a009e54de244a83a416a4f78633f873843abc1f8857ebbab4e20cad7f96b1fe247",
      rpc_url: "https://base-sepolia.drpc.org",
      chain_id: 84532
    };

    const response = await fetch(transactionUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(testData)
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Relay transaction test passed:', result);
      return true;
    } else {
      const errorText = await response.text();
      console.log('❌ Relay transaction test failed:', response.status, errorText);
      return false;
    }
  } catch (error) {
    console.log('❌ Relay transaction test error:', error.message);
    return false;
  }
}

async function main() {
  console.log('Testing AirChainPay Relay Connection...\n');
  
  const healthOk = await testRelayHealth();
  
  if (healthOk) {
    await testRelayTransaction();
  }
  
  console.log('\nTest completed.');
}

main().catch(console.error); 