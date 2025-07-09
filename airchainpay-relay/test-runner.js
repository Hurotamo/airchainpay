#!/usr/bin/env node

/**
 * Test Runner for AirChainPay Relay New Features
 * Runs all tests for metrics, database, security, and scheduler functionality
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 AirChainPay Relay - New Features Test Runner\n');

// Test configuration
const tests = [
  {
    name: 'New Features Test Script',
    command: 'node test/scripts/test-new-features.js',
    description: 'Tests metrics, database, security, and scheduler functionality'
  },
  {
    name: 'Unit Tests',
    command: 'npm run test:unit',
    description: 'Runs all unit tests for new modules'
  },
  {
    name: 'Integration Tests',
    command: 'npm run test:integration',
    description: 'Runs integration tests for new endpoints'
  }
];

// Function to run a single test
function runTest(test) {
  console.log(`\n📋 Running: ${test.name}`);
  console.log(`📝 Description: ${test.description}`);
  console.log('─'.repeat(50));
  
  try {
    const output = execSync(test.command, { 
      cwd: __dirname,
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    console.log('✅ PASSED');
    console.log(output);
    return { success: true, output };
  } catch (error) {
    console.log('❌ FAILED');
    console.log(error.stdout || '');
    console.log(error.stderr || '');
    return { success: false, error: error.message };
  }
}

// Main test runner
async function runAllTests() {
  console.log('🔍 Checking test environment...');
  
  // Check if we're in the right directory
  const packageJsonPath = path.join(__dirname, 'package.json');
  try {
    require(packageJsonPath);
    console.log('✅ Found package.json');
  } catch (error) {
    console.error('❌ Not in AirChainPay relay directory');
    process.exit(1);
  }
  
  console.log('✅ Test environment ready\n');
  
  let passedTests = 0;
  let totalTests = tests.length;
  const results = [];
  
  for (const test of tests) {
    const result = runTest(test);
    results.push({ ...test, ...result });
    
    if (result.success) {
      passedTests++;
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  
  results.forEach((result, index) => {
    const status = result.success ? '✅ PASSED' : '❌ FAILED';
    console.log(`${index + 1}. ${result.name}: ${status}`);
  });
  
  console.log('\n' + '─'.repeat(60));
  console.log(`✅ Passed: ${passedTests}/${totalTests}`);
  console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests}`);
  
  if (passedTests === totalTests) {
    console.log('\n🎉 All tests passed! New features are working correctly.');
    console.log('\n📋 Summary of new features added:');
    console.log('   • Metrics collection with Prometheus format');
    console.log('   • Database operations for transactions and devices');
    console.log('   • Enhanced security middleware');
    console.log('   • Scheduled tasks for maintenance');
    console.log('   • Health check endpoint with detailed metrics');
    console.log('   • API documentation with Swagger');
    console.log('   • Rate limiting and input validation');
    console.log('   • Error handling and logging');
    
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please check the implementation.');
    console.log('\n🔧 To fix issues:');
    console.log('   1. Install missing dependencies: npm install');
    console.log('   2. Check environment configuration');
    console.log('   3. Verify module imports and exports');
    console.log('   4. Run individual tests for debugging');
    
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = { runAllTests, runTest }; 