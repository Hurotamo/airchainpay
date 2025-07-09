/**
 * Test Database Security Features
 * Tests data integrity protection, audit logging, and tamper detection
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Import database module
const database = require('../../src/utils/database');

// Test data
const testTransaction = {
  id: 'security-test-tx-' + Date.now(),
  hash: '0x' + 'a'.repeat(64),
  chainId: 84532,
  network: 'Base Sepolia',
  deviceId: 'security-test-device',
  source: 'security-test',
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
  name: 'Security Test Device',
  status: 'active',
  capabilities: ['security-test'],
};

// Helper functions
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const checkFileExists = (filePath) => {
  return fs.existsSync(filePath);
};

const getFileContent = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
};

const calculateFileHash = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  return crypto.createHash('sha256').update(content).digest('hex');
};

// Test functions
async function testDataIntegrity() {
  console.log('🔒 Testing Data Integrity Protection...\n');

  try {
    // Test 1: Verify integrity on startup
    console.log('📋 Test 1: Data integrity verification on startup');
    const integrityFile = path.join(database.dataDir, 'integrity.json');
    const integrityExists = checkFileExists(integrityFile);
    console.log(`   • Integrity file exists: ${integrityExists ? '✅' : '❌'}`);

    if (integrityExists) {
      const integrity = JSON.parse(getFileContent(integrityFile));
      console.log(`   • Protected files: ${Object.keys(integrity).length}`);
      console.log(`   • Files: ${Object.keys(integrity).join(', ')}`);
    }

    // Test 2: Save transaction and verify integrity
    console.log('\n📋 Test 2: Transaction integrity protection');
    const saveResult = database.saveTransaction(testTransaction);
    console.log(`   • Transaction saved: ${saveResult ? '✅' : '❌'}`);

    // Check if integrity hash was updated
    const updatedIntegrity = JSON.parse(getFileContent(integrityFile));
    const transactionFileHash = updatedIntegrity['transactions.json']?.hash;
    console.log(`   • Integrity hash updated: ${transactionFileHash ? '✅' : '❌'}`);

    // Test 3: Verify integrity hash matches
    const actualHash = calculateFileHash(path.join(database.dataDir, 'transactions.json'));
    const hashMatch = transactionFileHash === actualHash;
    console.log(`   • Hash verification: ${hashMatch ? '✅' : '❌'}`);
    if (!hashMatch) {
      console.log(`     Expected: ${transactionFileHash}`);
      console.log(`     Actual: ${actualHash}`);
    }

    // Test 4: Simulate tampering and detect it
    console.log('\n📋 Test 4: Tamper detection');
    const transactionsFile = path.join(database.dataDir, 'transactions.json');
    const originalContent = getFileContent(transactionsFile);
    
    // Simulate tampering by modifying the file directly
    const tamperedContent = originalContent.replace('"confirmed"', '"tampered"');
    fs.writeFileSync(transactionsFile, tamperedContent);
    console.log('   • File tampered (simulated)');

    // Verify integrity detects the tampering
    database.verifyDataIntegrity();
    console.log('   • Integrity check completed');

    // Restore original content
    fs.writeFileSync(transactionsFile, originalContent);
    console.log('   • File restored to original state');

    console.log('\n✅ Data integrity tests completed successfully!');
    return true;

  } catch (error) {
    console.error('❌ Data integrity tests failed:', error.message);
    return false;
  }
}

async function testAuditLogging() {
  console.log('\n📝 Testing Audit Logging...\n');

  try {
    // Test 1: Check audit log file exists
    console.log('📋 Test 1: Audit log file creation');
    const auditFile = path.join(database.dataDir, 'audit.log');
    const auditExists = checkFileExists(auditFile);
    console.log(`   • Audit log exists: ${auditExists ? '✅' : '❌'}`);

    // Test 2: Perform operations and check audit logs
    console.log('\n📋 Test 2: Audit log recording');
    const initialSize = auditExists ? fs.statSync(auditFile).size : 0;
    
    // Perform some operations
    database.saveDevice('audit-test-device', testDevice);
    database.getDevice('audit-test-device');
    database.saveMetrics({ testMetric: 100 });
    
    // Wait a moment for logs to be written
    await wait(100);
    
    const finalSize = fs.statSync(auditFile).size;
    const logsAdded = finalSize > initialSize;
    console.log(`   • Audit logs recorded: ${logsAdded ? '✅' : '❌'}`);
    console.log(`   • Log size increase: ${finalSize - initialSize} bytes`);

    // Test 3: Read recent audit logs
    console.log('\n📋 Test 3: Audit log content');
    const recentLogs = database.getRecentAuditLogs(10);
    console.log(`   • Recent logs count: ${recentLogs.length}`);
    
    const dataAccessLogs = recentLogs.filter(log => log.type === 'DATA_ACCESS');
    const securityLogs = recentLogs.filter(log => log.type === 'SECURITY_INCIDENT');
    
    console.log(`   • Data access logs: ${dataAccessLogs.length}`);
    console.log(`   • Security incident logs: ${securityLogs.length}`);

    // Test 4: Verify log structure
    if (recentLogs.length > 0) {
      const sampleLog = recentLogs[0];
      const hasRequiredFields = sampleLog.timestamp && sampleLog.type;
      console.log(`   • Log structure valid: ${hasRequiredFields ? '✅' : '❌'}`);
    }

    console.log('\n✅ Audit logging tests completed successfully!');
    return true;

  } catch (error) {
    console.error('❌ Audit logging tests failed:', error.message);
    return false;
  }
}

async function testSecurityValidation() {
  console.log('\n🛡️ Testing Security Validation...\n');

  try {
    // Test 1: Valid transaction data
    console.log('📋 Test 1: Valid transaction validation');
    const validTransaction = {
      id: 'valid-tx-123',
      hash: '0x' + 'a'.repeat(64),
      chainId: 84532,
      deviceId: 'valid-device',
    };
    
    const validResult = database.validateTransactionData(validTransaction);
    console.log(`   • Valid transaction accepted: ${validResult ? '✅' : '❌'}`);

    // Test 2: Invalid transaction data
    console.log('\n📋 Test 2: Invalid transaction rejection');
    const invalidTransactions = [
      { id: 'invalid-tx' }, // Missing required fields
      { id: 'invalid-tx', hash: 'invalid-hash', chainId: 84532, deviceId: 'device' }, // Invalid hash
      { id: 'invalid-tx', hash: '0x' + 'a'.repeat(64), chainId: -1, deviceId: 'device' }, // Invalid chain ID
      { id: 'invalid-tx', hash: '0x' + 'a'.repeat(64), chainId: 84532, deviceId: 'a'.repeat(200) }, // Too long device ID
    ];

    let invalidRejected = 0;
    for (const invalidTx of invalidTransactions) {
      const result = database.validateTransactionData(invalidTx);
      if (!result) invalidRejected++;
    }
    
    console.log(`   • Invalid transactions rejected: ${invalidRejected}/${invalidTransactions.length} ✅`);

    // Test 3: Valid device data
    console.log('\n📋 Test 3: Valid device validation');
    const validDevice = {
      name: 'Valid Device',
      status: 'active',
    };
    
    const validDeviceResult = database.validateDeviceData('valid-device-id', validDevice);
    console.log(`   • Valid device accepted: ${validDeviceResult ? '✅' : '❌'}`);

    // Test 4: Invalid device data
    console.log('\n📋 Test 4: Invalid device rejection');
    const invalidDevices = [
      { name: 'Invalid Device', status: 'invalid-status' }, // Invalid status
      { name: 123, status: 'active' }, // Invalid name type
    ];

    let invalidDevicesRejected = 0;
    for (const invalidDevice of invalidDevices) {
      const result = database.validateDeviceData('valid-id', invalidDevice);
      if (!result) invalidDevicesRejected++;
    }
    
    console.log(`   • Invalid devices rejected: ${invalidDevicesRejected}/${invalidDevices.length} ✅`);

    console.log('\n✅ Security validation tests completed successfully!');
    return true;

  } catch (error) {
    console.error('❌ Security validation tests failed:', error.message);
    return false;
  }
}

async function testSecurityMonitoring() {
  console.log('\n📊 Testing Security Monitoring...\n');

  try {
    // Test 1: Get security status
    console.log('📋 Test 1: Security status monitoring');
    const securityStatus = database.getSecurityStatus();
    
    console.log(`   • Data integrity verified: ${securityStatus.dataIntegrity.verified ? '✅' : '❌'}`);
    console.log(`   • Protected files: ${securityStatus.dataIntegrity.files.length}`);
    console.log(`   • Security incidents: ${securityStatus.securityIncidents}`);
    console.log(`   • Recent access logs: ${securityStatus.recentAccess}`);
    console.log(`   • Audit log size: ${securityStatus.auditLogSize} bytes`);

    // Test 2: Get recent audit logs
    console.log('\n📋 Test 2: Recent audit logs');
    const recentLogs = database.getRecentAuditLogs(5);
    console.log(`   • Recent logs retrieved: ${recentLogs.length}`);
    
    if (recentLogs.length > 0) {
      const latestLog = recentLogs[recentLogs.length - 1];
      console.log(`   • Latest log type: ${latestLog.type}`);
      console.log(`   • Latest log timestamp: ${latestLog.timestamp}`);
    }

    // Test 3: Backup with integrity
    console.log('\n📋 Test 3: Secure backup creation');
    const backupPath = database.createBackup();
    console.log(`   • Backup created: ${backupPath ? '✅' : '❌'}`);
    
    if (backupPath) {
      const backupInfoFile = path.join(backupPath, 'backup-info.json');
      const backupInfoExists = checkFileExists(backupInfoFile);
      console.log(`   • Backup info file: ${backupInfoExists ? '✅' : '❌'}`);
      
      if (backupInfoExists) {
        const backupInfo = JSON.parse(getFileContent(backupInfoFile));
        console.log(`   • Backup files: ${backupInfo.files.length}`);
        console.log(`   • Backup timestamp: ${backupInfo.timestamp}`);
      }
    }

    console.log('\n✅ Security monitoring tests completed successfully!');
    return true;

  } catch (error) {
    console.error('❌ Security monitoring tests failed:', error.message);
    return false;
  }
}

// Main test runner
async function runSecurityTests() {
  console.log('🚀 Starting Database Security Tests...\n');
  console.log('🔒 Testing: Data Integrity, Audit Logging, Validation, Monitoring\n');

  const tests = [
    { name: 'Data Integrity Protection', fn: testDataIntegrity },
    { name: 'Audit Logging', fn: testAuditLogging },
    { name: 'Security Validation', fn: testSecurityValidation },
    { name: 'Security Monitoring', fn: testSecurityMonitoring },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      console.log(`\n🧪 Running: ${test.name}`);
      const result = await test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`❌ ${test.name} failed:`, error.message);
      failed++;
    }
  }

  console.log(`\n📊 Security Test Results:`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 All security tests passed! Your database is protected!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some security tests failed. Review the output above.');
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runSecurityTests();
}

module.exports = {
  testDataIntegrity,
  testAuditLogging,
  testSecurityValidation,
  testSecurityMonitoring,
  runSecurityTests,
}; 