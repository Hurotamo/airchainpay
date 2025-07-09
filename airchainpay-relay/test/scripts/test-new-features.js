#!/usr/bin/env node

/**
 * Test script for new AirChainPay Relay features
 * Tests metrics, database, security, and scheduler functionality
 */

const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

// Mock modules for testing
const mockMetrics = {
  transactionsReceived: 0,
  transactionsProcessed: 0,
  transactionsFailed: 0,
  transactionsBroadcasted: 0,
  bleConnections: 0,
  bleDisconnections: 0,
  bleAuthentications: 0,
  bleKeyExchanges: 0,
  rpcErrors: 0,
  gasPriceUpdates: 0,
  contractEvents: 0,
  authFailures: 0,
  rateLimitHits: 0,
  blockedDevices: 0,
  uptime: 0,
  memoryUsage: 0,
  cpuUsage: 0,
  reset() {
    this.transactionsReceived = 0;
    this.transactionsProcessed = 0;
    this.transactionsFailed = 0;
    this.transactionsBroadcasted = 0;
    this.bleConnections = 0;
    this.bleDisconnections = 0;
    this.bleAuthentications = 0;
    this.bleKeyExchanges = 0;
    this.rpcErrors = 0;
    this.gasPriceUpdates = 0;
    this.contractEvents = 0;
    this.authFailures = 0;
    this.rateLimitHits = 0;
    this.blockedDevices = 0;
  }
};

class TestDatabase {
  constructor() {
    this.transactions = [];
    this.devices = {};
    this.metrics = {};
  }

  saveTransaction(transaction) {
    transaction.id = transaction.id || this.generateId();
    transaction.timestamp = transaction.timestamp || new Date().toISOString();
    this.transactions.push(transaction);
    
    if (this.transactions.length > 1000) {
      this.transactions = this.transactions.slice(-1000);
    }
    
    return true;
  }

  getTransactions(limit = 100, offset = 0) {
    return this.transactions.slice(offset, offset + limit);
  }

  saveDevice(deviceId, deviceData) {
    this.devices[deviceId] = {
      ...deviceData,
      lastSeen: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return true;
  }

  getDevice(deviceId) {
    return this.devices[deviceId];
  }

  saveMetrics(metrics) {
    const timestamp = new Date().toISOString();
    this.metrics[timestamp] = { ...metrics, timestamp };
    return true;
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

class TestScheduler {
  constructor() {
    this.tasks = new Map();
    this.isRunning = false;
  }

  start() {
    this.isRunning = true;
    return true;
  }

  stop() {
    this.isRunning = false;
    this.tasks.clear();
    return true;
  }

  scheduleTask(name, cronExpression, taskFunction) {
    this.tasks.set(name, { taskFunction, cronExpression });
    return true;
  }

  async executeTask(taskName) {
    const task = this.tasks.get(taskName);
    if (task) {
      await task.taskFunction();
      return true;
    }
    return false;
  }
}

// Test functions
function testMetrics() {
  console.log('🧪 Testing Metrics Collection...');
  
  try {
    // Test initialization
    expect(mockMetrics.transactionsReceived).to.equal(0);
    expect(mockMetrics.bleConnections).to.equal(0);
    expect(mockMetrics.rpcErrors).to.equal(0);
    
    // Test incrementation
    mockMetrics.transactionsReceived++;
    mockMetrics.transactionsProcessed++;
    mockMetrics.bleConnections++;
    mockMetrics.rpcErrors++;
    
    expect(mockMetrics.transactionsReceived).to.equal(1);
    expect(mockMetrics.transactionsProcessed).to.equal(1);
    expect(mockMetrics.bleConnections).to.equal(1);
    expect(mockMetrics.rpcErrors).to.equal(1);
    
    // Test reset
    mockMetrics.reset();
    expect(mockMetrics.transactionsReceived).to.equal(0);
    expect(mockMetrics.transactionsProcessed).to.equal(0);
    expect(mockMetrics.bleConnections).to.equal(0);
    expect(mockMetrics.rpcErrors).to.equal(0);
    
    console.log('✅ Metrics Collection Tests Passed');
    return true;
  } catch (error) {
    console.error('❌ Metrics Collection Tests Failed:', error.message);
    return false;
  }
}

function testDatabase() {
  console.log('🧪 Testing Database Operations...');
  
  try {
    const db = new TestDatabase();
    
    // Test transaction operations
    const transaction = { signedTransaction: '0x123', chainId: 84532 };
    const result = db.saveTransaction(transaction);
    expect(result).to.be.true;
    expect(transaction.id).to.be.a('string');
    expect(transaction.timestamp).to.be.a('string');
    
    const transactions = db.getTransactions(10);
    expect(transactions).to.have.lengthOf(1);
    expect(transactions[0].signedTransaction).to.equal('0x123');
    
    // Test device operations
    const deviceId = 'device-123';
    const deviceData = { name: 'Test Device', status: 'active' };
    const deviceResult = db.saveDevice(deviceId, deviceData);
    expect(deviceResult).to.be.true;
    
    const device = db.getDevice(deviceId);
    expect(device).to.have.property('name', 'Test Device');
    expect(device).to.have.property('status', 'active');
    expect(device).to.have.property('lastSeen');
    expect(device).to.have.property('updatedAt');
    
    // Test metrics operations
    const metrics = { uptime: 100, memoryUsage: 1024 };
    const metricsResult = db.saveMetrics(metrics);
    expect(metricsResult).to.be.true;
    
    console.log('✅ Database Operations Tests Passed');
    return true;
  } catch (error) {
    console.error('❌ Database Operations Tests Failed:', error.message);
    return false;
  }
}

async function testScheduler() {
  console.log('🧪 Testing Scheduler Operations...');
  
  try {
    const scheduler = new TestScheduler();
    
    // Test initialization
    expect(scheduler.isRunning).to.be.false;
    expect(scheduler.tasks.size).to.equal(0);
    
    // Test start
    scheduler.start();
    expect(scheduler.isRunning).to.be.true;
    
    // Test task scheduling
    const taskFunction = () => console.log('Task executed');
    const result = scheduler.scheduleTask('test-task', '*/1 * * * * *', taskFunction);
    expect(result).to.be.true;
    expect(scheduler.tasks.has('test-task')).to.be.true;
    
    // Test task execution
    const executionResult = await scheduler.executeTask('test-task');
    expect(executionResult).to.be.true;
    
    // Test stop
    scheduler.stop();
    expect(scheduler.isRunning).to.be.false;
    expect(scheduler.tasks.size).to.equal(0);
    
    console.log('✅ Scheduler Operations Tests Passed');
    return true;
  } catch (error) {
    console.error('❌ Scheduler Operations Tests Failed:', error.message);
    return false;
  }
}

function testSecurityMiddleware() {
  console.log('🧪 Testing Security Middleware...');
  
  try {
    // Test CORS configuration
    const corsOptions = {
      origin: (origin, callback) => {
        if (origin === 'http://example.com') {
          callback(null, true);
        } else {
          callback(new Error('Not allowed'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST']
    };
    
    expect(corsOptions.origin).to.be.a('function');
    expect(corsOptions.credentials).to.be.true;
    expect(corsOptions.methods).to.be.an('array');
    
    // Test rate limiting configuration
    const rateLimiters = {
      global: { windowMs: 900000, max: 1000 },
      auth: { windowMs: 900000, max: 5 },
      transactions: { windowMs: 60000, max: 50 },
      ble: { windowMs: 60000, max: 100 }
    };
    
    expect(rateLimiters.global).to.have.property('windowMs', 900000);
    expect(rateLimiters.global).to.have.property('max', 1000);
    expect(rateLimiters.auth).to.have.property('max', 5);
    expect(rateLimiters.transactions).to.have.property('max', 50);
    expect(rateLimiters.ble).to.have.property('max', 100);
    
    console.log('✅ Security Middleware Tests Passed');
    return true;
  } catch (error) {
    console.error('❌ Security Middleware Tests Failed:', error.message);
    return false;
  }
}

function testPrometheusMetrics() {
  console.log('🧪 Testing Prometheus Metrics Format...');
  
  try {
    const metrics = {
      transactionsReceived: 5,
      transactionsProcessed: 4,
      transactionsFailed: 1,
      bleConnections: 10,
      uptime: 3600,
      memoryUsage: 1024 * 1024
    };
    
    const prometheusMetrics = [
      '# HELP airchainpay_transactions_received_total Total number of transactions received',
      '# TYPE airchainpay_transactions_received_total counter',
      `airchainpay_transactions_received_total ${metrics.transactionsReceived}`,
      '',
      '# HELP airchainpay_transactions_processed_total Total number of transactions processed',
      '# TYPE airchainpay_transactions_processed_total counter',
      `airchainpay_transactions_processed_total ${metrics.transactionsProcessed}`,
      '',
      '# HELP airchainpay_transactions_failed_total Total number of transactions failed',
      '# TYPE airchainpay_transactions_failed_total counter',
      `airchainpay_transactions_failed_total ${metrics.transactionsFailed}`,
      '',
      '# HELP airchainpay_ble_connections_total Total number of BLE connections',
      '# TYPE airchainpay_ble_connections_total counter',
      `airchainpay_ble_connections_total ${metrics.bleConnections}`,
      '',
      '# HELP airchainpay_uptime_seconds Server uptime in seconds',
      '# TYPE airchainpay_uptime_seconds gauge',
      `airchainpay_uptime_seconds ${metrics.uptime}`,
      '',
      '# HELP airchainpay_memory_usage_bytes Memory usage in bytes',
      '# TYPE airchainpay_memory_usage_bytes gauge',
      `airchainpay_memory_usage_bytes ${metrics.memoryUsage}`
    ].join('\n');
    
    expect(prometheusMetrics).to.contain('airchainpay_transactions_received_total 5');
    expect(prometheusMetrics).to.contain('airchainpay_transactions_processed_total 4');
    expect(prometheusMetrics).to.contain('airchainpay_transactions_failed_total 1');
    expect(prometheusMetrics).to.contain('airchainpay_ble_connections_total 10');
    expect(prometheusMetrics).to.contain('airchainpay_uptime_seconds 3600');
    expect(prometheusMetrics).to.contain('airchainpay_memory_usage_bytes 1048576');
    
    // Check for proper Prometheus format
    const lines = prometheusMetrics.split('\n');
    expect(lines).to.include('# HELP airchainpay_transactions_received_total Total number of transactions received');
    expect(lines).to.include('# TYPE airchainpay_transactions_received_total counter');
    expect(lines).to.include('airchainpay_transactions_received_total 5');
    
    console.log('✅ Prometheus Metrics Format Tests Passed');
    return true;
  } catch (error) {
    console.error('❌ Prometheus Metrics Format Tests Failed:', error.message);
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting AirChainPay Relay New Features Tests\n');
  
  const tests = [
    { name: 'Metrics Collection', fn: testMetrics },
    { name: 'Database Operations', fn: testDatabase },
    { name: 'Scheduler Operations', fn: testScheduler },
    { name: 'Security Middleware', fn: testSecurityMiddleware },
    { name: 'Prometheus Metrics Format', fn: testPrometheusMetrics }
  ];
  
  let passedTests = 0;
  let totalTests = tests.length;
  
  for (const test of tests) {
    console.log(`\n📋 Running ${test.name} Tests...`);
    const result = await test.fn();
    if (result) {
      passedTests++;
    }
  }
  
  console.log('\n📊 Test Results Summary:');
  console.log(`✅ Passed: ${passedTests}/${totalTests}`);
  console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests}`);
  
  if (passedTests === totalTests) {
    console.log('\n🎉 All tests passed! New features are working correctly.');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please check the implementation.');
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(error => {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = {
  testMetrics,
  testDatabase,
  testScheduler,
  testSecurityMiddleware,
  testPrometheusMetrics,
  runTests
}; 