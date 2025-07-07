const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');

// Test configuration
const RELAY_URL = process.env.RELAY_URL || 'http://localhost:4000';
const API_KEY = process.env.API_KEY || 'c3dc80f325d9b8a95f94228b7f7e82de7b9b88598e5da87989251eeb19f5b22f';

let serverProcess = null;

// Start the relay server
async function startServer() {
  return new Promise((resolve, reject) => {
    console.log('Starting AirChainPay Relay server...');
    
    serverProcess = spawn('node', ['src/server.js'], {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'development' }
    });

    let serverReady = false;
    const timeout = setTimeout(() => {
      if (!serverReady) {
        serverProcess.kill();
        reject(new Error('Server startup timeout'));
      }
    }, 10000);

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('Server:', output.trim());
      
      // Check if server is ready
      if (output.includes('listening on port') || output.includes('AirChainPay Relay Node listening')) {
        serverReady = true;
        clearTimeout(timeout);
        setTimeout(resolve, 1000); // Give server a moment to fully start
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('Server Error:', data.toString());
    });

    serverProcess.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    serverProcess.on('exit', (code) => {
      if (!serverReady) {
        clearTimeout(timeout);
        reject(new Error(`Server exited with code ${code}`));
      }
    });
  });
}

// Stop the relay server
function stopServer() {
  if (serverProcess) {
    console.log('Stopping server...');
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

// Wait for server to be ready
async function waitForServer(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await axios.get(`${RELAY_URL}/health`, { timeout: 2000 });
      if (response.status === 200) {
        return true;
      }
    } catch (error) {
      // Server not ready yet, wait and try again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  return false;
}

async function testRelay() {
  console.log('Testing AirChainPay Relay...');
  
  try {
    // Start server
    await startServer();
    
    // Wait for server to be ready
    console.log('Waiting for server to be ready...');
    const serverReady = await waitForServer();
    if (!serverReady) {
      throw new Error('Server failed to start within timeout');
    }
    
    // Test 1: Health check
    console.log('\n1. Testing health check...');
    const healthResponse = await axios.get(`${RELAY_URL}/health`);
    console.log('✅ Health check passed:', healthResponse.data);
    
    // Test 2: Get auth token
    console.log('\n2. Testing authentication...');
    const authResponse = await axios.post(`${RELAY_URL}/auth/token`, {
      apiKey: API_KEY
    });
    console.log('✅ Authentication passed');
    
    const token = authResponse.data.token;
    
    // Test 3: Test contract owner endpoint
    console.log('\n3. Testing contract owner endpoint...');
    const ownerResponse = await axios.get(`${RELAY_URL}/contract/owner`);
    console.log('✅ Contract owner endpoint passed:', ownerResponse.data);
    
    // Test 4: Test payments endpoint
    console.log('\n4. Testing payments endpoint...');
    const paymentsResponse = await axios.get(`${RELAY_URL}/contract/payments`);
    console.log('✅ Payments endpoint passed:', paymentsResponse.data);
    
    console.log('\n🎉 All tests passed! Relay is ready for test production.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response ? error.response.data : error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
    }
    process.exit(1);
  } finally {
    // Always stop the server
    stopServer();
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, cleaning up...');
  stopServer();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, cleaning up...');
  stopServer();
  process.exit(0);
});

// Run tests
testRelay(); 