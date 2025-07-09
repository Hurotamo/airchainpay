/**
 * Test Database API Endpoints
 * Tests all database-related API endpoints for transactions, devices, and metrics
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = process.env.RELAY_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'test-token';

// Test data
const testTransaction = {
  id: 'test-tx-' + Date.now(),
  hash: '0x' + 'a'.repeat(64),
  chainId: 84532,
  network: 'Base Sepolia',
  deviceId: 'test-device-1',
  source: 'test',
  status: 'confirmed',
  blockNumber: 12345,
  gasUsed: '21000',
  timestamp: new Date().toISOString(),
  metadata: {
    amount: '0.1',
    to: '0x' + 'b'.repeat(40),
    from: '0x' + 'c'.repeat(40),
  },
};

const testDevice = {
  name: 'Test Device',
  lastTransaction: testTransaction.id,
  lastTransactionTime: testTransaction.timestamp,
  status: 'active',
  capabilities: ['test', 'transactions'],
};

// Helper functions
const makeRequest = async (method, endpoint, data = null, headers = {}) => {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        ...headers,
      },
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return { 
      success: false, 
      error: error.response?.data || error.message, 
      status: error.response?.status || 500,
    };
  }
};

// Test functions
async function testDatabaseEndpoints() {
  console.log('🧪 Testing Database API Endpoints...\n');

  const tests = [
    {
      name: 'Get Database Statistics',
      fn: async () => {
        const result = await makeRequest('GET', '/api/database/stats');
        if (!result.success) throw new Error(`Failed to get stats: ${result.error}`);
        
        console.log('✅ Database stats retrieved successfully');
        console.log(`   • Transactions: ${result.data.data.transactions.total}`);
        console.log(`   • Devices: ${result.data.data.devices.total}`);
        console.log(`   • Metrics: ${result.data.data.metrics.total}`);
        return result.data;
      }
    },
    {
      name: 'Get All Transactions',
      fn: async () => {
        const result = await makeRequest('GET', '/api/database/transactions?limit=10');
        if (!result.success) throw new Error(`Failed to get transactions: ${result.error}`);
        
        console.log('✅ Transactions retrieved successfully');
        console.log(`   • Count: ${result.data.data.transactions.length}`);
        console.log(`   • Total: ${result.data.data.pagination.total}`);
        return result.data;
      }
    },
    {
      name: 'Get Transactions by Device',
      fn: async () => {
        const result = await makeRequest('GET', '/api/database/transactions/device/test-device-1?limit=5');
        if (!result.success) throw new Error(`Failed to get device transactions: ${result.error}`);
        
        console.log('✅ Device transactions retrieved successfully');
        console.log(`   • Device: ${result.data.data.deviceId}`);
        console.log(`   • Count: ${result.data.data.count}`);
        return result.data;
      }
    },
    {
      name: 'Get All Devices',
      fn: async () => {
        const result = await makeRequest('GET', '/api/database/devices');
        if (!result.success) throw new Error(`Failed to get devices: ${result.error}`);
        
        console.log('✅ Devices retrieved successfully');
        console.log(`   • Count: ${result.data.data.count}`);
        return result.data;
      }
    },
    {
      name: 'Get Device by ID',
      fn: async () => {
        const result = await makeRequest('GET', '/api/database/devices/test-device-1');
        if (!result.success) throw new Error(`Failed to get device: ${result.error}`);
        
        console.log('✅ Device retrieved successfully');
        console.log(`   • Device ID: ${result.data.data.deviceId || 'N/A'}`);
        return result.data;
      }
    },
    {
      name: 'Update Device Status',
      fn: async () => {
        const result = await makeRequest('PUT', '/api/database/devices/test-device-1/status', {
          status: 'inactive'
        });
        if (!result.success) throw new Error(`Failed to update device status: ${result.error}`);
        
        console.log('✅ Device status updated successfully');
        return result.data;
      }
    },
    {
      name: 'Get Metrics',
      fn: async () => {
        const result = await makeRequest('GET', '/api/database/metrics?timeRange=24h');
        if (!result.success) throw new Error(`Failed to get metrics: ${result.error}`);
        
        console.log('✅ Metrics retrieved successfully');
        console.log(`   • Time Range: ${result.data.data.timeRange}`);
        console.log(`   • Count: ${result.data.data.count}`);
        return result.data;
      }
    },
    {
      name: 'Create Database Backup',
      fn: async () => {
        const result = await makeRequest('POST', '/api/database/backup');
        if (!result.success) throw new Error(`Failed to create backup: ${result.error}`);
        
        console.log('✅ Database backup created successfully');
        console.log(`   • Backup Path: ${result.data.data.backupPath}`);
        return result.data;
      }
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      console.log(`\n📋 Testing: ${test.name}`);
      await test.fn();
      passed++;
    } catch (error) {
      console.error(`❌ ${test.name} failed:`, error.message);
      failed++;
    }
  }

  console.log(`\n📊 Test Results:`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  return { passed, failed };
}

// Test database operations directly
async function testDirectDatabaseOperations() {
  console.log('\n🔧 Testing Direct Database Operations...\n');

  try {
    // Import database module
    const database = require('../../src/utils/database');

    // Test transaction operations
    console.log('📝 Testing transaction operations...');
    const saveResult = database.saveTransaction(testTransaction);
    console.log(`   • Save transaction: ${saveResult ? '✅' : '❌'}`);

    const transactions = database.getTransactions(10);
    console.log(`   • Get transactions: ${transactions.length} found`);

    const txById = database.getTransactionById(testTransaction.id);
    console.log(`   • Get by ID: ${txById ? '✅' : '❌'}`);

    const deviceTxs = database.getTransactionsByDevice('test-device-1', 5);
    console.log(`   • Get by device: ${deviceTxs.length} found`);

    // Test device operations
    console.log('\n📱 Testing device operations...');
    const deviceSaveResult = database.saveDevice('test-device-1', testDevice);
    console.log(`   • Save device: ${deviceSaveResult ? '✅' : '❌'}`);

    const device = database.getDevice('test-device-1');
    console.log(`   • Get device: ${device ? '✅' : '❌'}`);

    const allDevices = database.getAllDevices();
    console.log(`   • Get all devices: ${Object.keys(allDevices).length} found`);

    const statusResult = database.updateDeviceStatus('test-device-1', 'active');
    console.log(`   • Update status: ${statusResult ? '✅' : '❌'}`);

    // Test metrics operations
    console.log('\n📊 Testing metrics operations...');
    const metricsData = {
      transactionsReceived: 100,
      transactionsProcessed: 95,
      uptime: 3600,
      memoryUsage: 51200000
    };

    const metricsSaveResult = database.saveMetrics(metricsData);
    console.log(`   • Save metrics: ${metricsSaveResult ? '✅' : '❌'}`);

    const metrics = database.getMetrics('24h');
    console.log(`   • Get metrics: ${metrics.length} entries found`);

    // Test backup operations
    console.log('\n💾 Testing backup operations...');
    const backupPath = database.createBackup();
    console.log(`   • Create backup: ${backupPath ? '✅' : '❌'}`);
    if (backupPath) {
      console.log(`   • Backup location: ${backupPath}`);
    }

    console.log('\n✅ All direct database operations completed successfully!');

  } catch (error) {
    console.error('❌ Direct database operations failed:', error.message);
    throw error;
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting Database API Tests...\n');
  console.log(`📍 Base URL: ${BASE_URL}`);
  console.log(`🔑 Auth Token: ${AUTH_TOKEN ? 'Present' : 'Missing'}\n`);

  try {
    // Test direct database operations first
    await testDirectDatabaseOperations();

    // Test API endpoints
    const results = await testDatabaseEndpoints();

    if (results.failed === 0) {
      console.log('\n🎉 All database tests passed successfully!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some database tests failed. Check the output above.');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n💥 Test runner failed:', error.message);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

module.exports = {
  testDatabaseEndpoints,
  testDirectDatabaseOperations,
  runTests
}; 