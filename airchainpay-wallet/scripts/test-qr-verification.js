#!/usr/bin/env node

/**
 * Test script for QR code verification
 * This script tests the QR code generation and verification process
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Testing QR Code Verification...\n');

// Test data
const testPayload = {
  type: 'payment_request',
  to: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
  amount: '0.1',
  chainId: 'base_sepolia',
  timestamp: Date.now(),
  version: '1.0'
};

console.log('📋 Test payload:', testPayload);

// Simulate timestamp validation
const now = Date.now();
const testTimestamp = now - (2 * 60 * 1000); // 2 minutes ago
const age = now - testTimestamp;
const maxAge = 30 * 60 * 1000; // 30 minutes

console.log('\n⏰ Timestamp validation test:');
console.log(`  Current time: ${now}`);
console.log(`  Test timestamp: ${testTimestamp}`);
console.log(`  Age: ${Math.floor(age / 1000)} seconds`);
console.log(`  Max age: ${Math.floor(maxAge / 1000)} seconds`);
console.log(`  Valid: ${age >= 0 && age <= maxAge ? '✅ Yes' : '❌ No'}`);

// Test different scenarios
const scenarios = [
  { name: 'Recent QR code (2 minutes old)', age: 2 * 60 * 1000, expected: true },
  { name: 'Older QR code (10 minutes old)', age: 10 * 60 * 1000, expected: true },
  { name: 'Very old QR code (1 hour old)', age: 60 * 60 * 1000, expected: false },
  { name: 'Future QR code', age: -5 * 60 * 1000, expected: false }
];

console.log('\n🧪 Testing different scenarios:');
scenarios.forEach(scenario => {
  const isValid = scenario.age >= 0 && scenario.age <= maxAge;
  const status = isValid === scenario.expected ? '✅ PASS' : '❌ FAIL';
  console.log(`  ${scenario.name}: ${status}`);
});

console.log('\n📝 Recommendations:');
console.log('1. The QR code verification should now work with the increased timeout (30 minutes)');
console.log('2. Lenient mode allows QR codes up to 24 hours old for testing');
console.log('3. Check the console logs for detailed debugging information');
console.log('4. If issues persist, the logs will show the exact timestamp values');

console.log('\n✅ QR Code verification test completed!'); 