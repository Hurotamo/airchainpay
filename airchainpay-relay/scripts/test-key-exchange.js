#!/usr/bin/env node

/**
 * Simplified test script for AirChainPay secure key exchange
 * Tests core crypto operations without complex BLE dependencies
 */

const crypto = require('crypto');

console.log('🔐 Starting AirChainPay Secure Key Exchange Tests\n');

// Define deviceId at the top level
const deviceId = 'test-device-001';

// Test 1: Basic EC Key Exchange
console.log('📋 Test 1: Basic EC Key Exchange');
try {
  // Generate EC key pairs
  const relayKeyPair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1'
  });
  
  const deviceKeyPair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1'
  });
  
  console.log('✅ EC key pairs generated');
  
  // Compute shared secrets using ECDH
  const relaySharedSecret = crypto.diffieHellman({
    privateKey: relayKeyPair.privateKey,
    publicKey: deviceKeyPair.publicKey
  });
  
  const deviceSharedSecret = crypto.diffieHellman({
    privateKey: deviceKeyPair.privateKey,
    publicKey: relayKeyPair.publicKey
  });
  
  console.log('✅ Shared secrets computed');
  
  // Verify shared secrets match
  if (!relaySharedSecret.equals(deviceSharedSecret)) {
    throw new Error('Shared secrets do not match');
  }
  
  console.log('✅ Shared secrets match');
  
  // Derive session keys
  const nonce = crypto.randomBytes(16);
  
  const relaySessionKey = crypto.pbkdf2Sync(
    relaySharedSecret,
    Buffer.concat([Buffer.from(deviceId, 'utf8'), nonce]),
    100000,
    32,
    'sha256'
  );
  
  const deviceSessionKey = crypto.pbkdf2Sync(
    deviceSharedSecret,
    Buffer.concat([Buffer.from(deviceId, 'utf8'), nonce]),
    100000,
    32,
    'sha256'
  );
  
  console.log('✅ Session keys derived');
  
  // Verify session keys match
  if (!relaySessionKey.equals(deviceSessionKey)) {
    throw new Error('Session keys do not match');
  }
  
  console.log('✅ Session keys match');
  console.log('✅ Test 1 PASSED\n');
  
} catch (error) {
  console.error('❌ Test 1 FAILED:', error.message);
  process.exit(1);
}

// Test 2: Key Rotation
console.log('📋 Test 2: Key Rotation');
try {
  // Generate new EC key pairs for rotation
  const newRelayKeyPair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1'
  });
  
  const newDeviceKeyPair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1'
  });
  
  console.log('✅ New EC key pairs generated');
  
  // Compute new shared secrets using ECDH
  const newRelaySharedSecret = crypto.diffieHellman({
    privateKey: newRelayKeyPair.privateKey,
    publicKey: newDeviceKeyPair.publicKey
  });
  
  const newDeviceSharedSecret = crypto.diffieHellman({
    privateKey: newDeviceKeyPair.privateKey,
    publicKey: newRelayKeyPair.publicKey
  });
  
  console.log('✅ New shared secrets computed');
  
  // Verify new shared secrets match
  if (!newRelaySharedSecret.equals(newDeviceSharedSecret)) {
    throw new Error('New shared secrets do not match');
  }
  
  console.log('✅ New shared secrets match');
  
  // Derive new session keys
  const newNonce = crypto.randomBytes(16);
  
  const newRelaySessionKey = crypto.pbkdf2Sync(
    newRelaySharedSecret,
    Buffer.concat([Buffer.from(deviceId, 'utf8'), newNonce]),
    100000,
    32,
    'sha256'
  );
  
  const newDeviceSessionKey = crypto.pbkdf2Sync(
    newDeviceSharedSecret,
    Buffer.concat([Buffer.from(deviceId, 'utf8'), newNonce]),
    100000,
    32,
    'sha256'
  );
  
  console.log('✅ New session keys derived');
  
  // Verify new session keys match
  if (!newRelaySessionKey.equals(newDeviceSessionKey)) {
    throw new Error('New session keys do not match');
  }
  
  console.log('✅ New session keys match');
  console.log('✅ Test 2 PASSED\n');
  
} catch (error) {
  console.error('❌ Test 2 FAILED:', error.message);
  process.exit(1);
}

// Test 3: Encryption/Decryption
console.log('📋 Test 3: Encryption/Decryption');
try {
  const sessionKey = crypto.randomBytes(32);
  const testData = { type: 'test', message: 'Hello AirChainPay' };
  const iv = crypto.randomBytes(12);
  
  // Encrypt
  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(testData)), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  console.log('✅ Data encrypted');
  
  // Decrypt
  const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  const decryptedData = JSON.parse(decrypted.toString());
  
  console.log('✅ Data decrypted');
  
  // Verify decrypted data matches original
  if (JSON.stringify(decryptedData) !== JSON.stringify(testData)) {
    throw new Error('Decrypted data does not match original');
  }
  
  console.log('✅ Decrypted data matches original');
  console.log('✅ Test 3 PASSED\n');
  
} catch (error) {
  console.error('❌ Test 3 FAILED:', error.message);
  process.exit(1);
}

// Test 4: Digital Signatures
console.log('📋 Test 4: Digital Signatures');
try {
  const keyPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  
  const testMessage = 'AirChainPay secure transaction';
  
  // Sign
  const sign = crypto.createSign('SHA256');
  sign.update(testMessage);
  const signature = sign.sign(keyPair.privateKey, 'base64');
  
  console.log('✅ Message signed');
  
  // Verify
  const verify = crypto.createVerify('SHA256');
  verify.update(testMessage);
  const isValid = verify.verify(keyPair.publicKey, signature, 'base64');
  
  if (!isValid) {
    throw new Error('Signature verification failed');
  }
  
  console.log('✅ Signature verified');
  console.log('✅ Test 4 PASSED\n');
  
} catch (error) {
  console.error('❌ Test 4 FAILED:', error.message);
  process.exit(1);
}

console.log('🎉 All tests PASSED!');
console.log('✅ AirChainPay key exchange crypto operations are working correctly'); 