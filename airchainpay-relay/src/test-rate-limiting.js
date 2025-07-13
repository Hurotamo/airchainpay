const axios = require('axios');

// Test rate limiting functionality
async function testRateLimiting() {
    const baseURL = 'http://localhost:4000';
    
    console.log('Testing rate limiting functionality...\n');
    
    // Test 1: Health endpoint rate limiting
    console.log('Test 1: Health endpoint rate limiting');
    try {
        for (let i = 0; i < 5; i++) {
            const response = await axios.get(`${baseURL}/health`);
            console.log(`Health check ${i + 1}: ${response.status}`);
        }
    } catch (error) {
        if (error.response && error.response.status === 429) {
            console.log('✅ Rate limiting working for health endpoint');
        } else {
            console.log('❌ Unexpected error:', error.message);
        }
    }
    
    // Test 2: Transaction endpoint rate limiting
    console.log('\nTest 2: Transaction endpoint rate limiting');
    try {
        for (let i = 0; i < 10; i++) {
            const response = await axios.post(`${baseURL}/transaction/submit`, {
                signedTransaction: '0x1234567890abcdef',
                chainId: 84532
            });
            console.log(`Transaction ${i + 1}: ${response.status}`);
        }
    } catch (error) {
        if (error.response && error.response.status === 429) {
            console.log('✅ Rate limiting working for transaction endpoint');
        } else {
            console.log('❌ Unexpected error:', error.message);
        }
    }
    
    // Test 3: Auth endpoint rate limiting
    console.log('\nTest 3: Auth endpoint rate limiting');
    try {
        for (let i = 0; i < 10; i++) {
            const response = await axios.post(`${baseURL}/auth/token`, {
                apiKey: 'test_api_key'
            });
            console.log(`Auth request ${i + 1}: ${response.status}`);
        }
    } catch (error) {
        if (error.response && error.response.status === 429) {
            console.log('✅ Rate limiting working for auth endpoint');
        } else {
            console.log('❌ Unexpected error:', error.message);
        }
    }
    
    // Test 4: BLE endpoint rate limiting
    console.log('\nTest 4: BLE endpoint rate limiting');
    try {
        for (let i = 0; i < 15; i++) {
            const response = await axios.get(`${baseURL}/ble/status`);
            console.log(`BLE request ${i + 1}: ${response.status}`);
        }
    } catch (error) {
        if (error.response && error.response.status === 429) {
            console.log('✅ Rate limiting working for BLE endpoint');
        } else {
            console.log('❌ Unexpected error:', error.message);
        }
    }
    
    // Test 5: Metrics endpoint rate limiting
    console.log('\nTest 5: Metrics endpoint rate limiting');
    try {
        for (let i = 0; i < 10; i++) {
            const response = await axios.get(`${baseURL}/metrics`);
            console.log(`Metrics request ${i + 1}: ${response.status}`);
        }
    } catch (error) {
        if (error.response && error.response.status === 429) {
            console.log('✅ Rate limiting working for metrics endpoint');
        } else {
            console.log('❌ Unexpected error:', error.message);
        }
    }
    
    console.log('\nRate limiting tests completed!');
}

// Run the test
testRateLimiting().catch(console.error); 