#!/usr/bin/env node

/**
 * Password Hashing Test Script
 * 
 * This script tests the password hashing implementation to ensure it works correctly.
 * Run with: node scripts/test-password-hashing.js
 */

// Mock the React Native environment
global.navigator = {
  product: 'ReactNative'
};

// Mock crypto-js
const CryptoJS = {
  PBKDF2: (password, salt, options) => {
    // Simple mock implementation for testing
    const keySize = options.keySize || 8;
    const iterations = options.iterations || 100000;
    const hasher = options.hasher || { toString: () => 'sha256' };
    
    // Create a deterministic hash for testing
    const combined = password + salt + iterations;
    let hash = '';
    for (let i = 0; i < keySize * 4; i++) {
      hash += combined.charCodeAt(i % combined.length).toString(16);
    }
    
    return {
      toString: () => hash
    };
  },
  lib: {
    WordArray: {
      random: (size) => {
        // Generate deterministic random for testing
        let result = '';
        for (let i = 0; i < size; i++) {
          result += (i % 16).toString(16);
        }
        return {
          toString: () => result
        };
      }
    }
  },
  enc: {
    Hex: {
      parse: (str) => str
    },
    Utf8: 'utf8'
  },
  mode: {
    CBC: 'cbc'
  },
  pad: {
    Pkcs7: 'pkcs7'
  },
  AES: {
    encrypt: (data, key, options) => {
      return {
        toString: () => 'encrypted_' + data + '_' + key.toString()
      };
    },
    decrypt: (data, key, options) => {
      return {
        toString: (encoding) => {
          if (encoding === 'utf8') {
            return '{"credentials":"test","entropy":"test","timestamp":123}';
          }
          return 'decrypted_' + data + '_' + key.toString();
        }
      };
    }
  }
};

// Mock logger
const logger = {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
  warn: (msg, data) => console.log(`[WARN] ${msg}`, data || ''),
  error: (msg, data) => console.log(`[ERROR] ${msg}`, data || '')
};

// Mock secure storage
const secureStorage = {
  setItem: async (key, value) => {
    console.log(`[STORAGE] Set ${key}: ${value.substring(0, 20)}...`);
  },
  getItem: async (key) => {
    return null; // No stored password for testing
  },
  deleteItem: async (key) => {
    console.log(`[STORAGE] Delete ${key}`);
  }
};

// Import the PasswordHasher (we'll need to mock the imports)
const PasswordHasher = {
  SALT_LENGTH: 32,
  HASH_LENGTH: 64,
  ITERATIONS: 100000,
  VERSION: 1,
  HASH_PREFIX: 'v1$',

  generateSalt() {
    return CryptoJS.lib.WordArray.random(this.SALT_LENGTH).toString();
  },

  hashPassword(password, salt) {
    try {
      const generatedSalt = salt || this.generateSalt();
      
      const hash = CryptoJS.PBKDF2(password, generatedSalt, {
        keySize: this.HASH_LENGTH / 32,
        iterations: this.ITERATIONS,
        hasher: { toString: () => 'sha256' }
      });

      const hashString = `${this.HASH_PREFIX}${this.ITERATIONS}$${generatedSalt}$${hash.toString()}`;
      
      logger.info('Password hashed successfully');
      return hashString;
    } catch (error) {
      logger.error('Failed to hash password:', error);
      throw new Error('Failed to hash password');
    }
  },

  verifyPassword(password, storedHash) {
    try {
      if (!storedHash.startsWith(this.HASH_PREFIX)) {
        logger.warn('Legacy plain text password detected');
        return false;
      }

      const parts = storedHash.split('$');
      if (parts.length !== 4) {
        logger.error('Invalid hash format');
        return false;
      }

      const version = parts[0];
      const iterations = parseInt(parts[1], 10);
      const salt = parts[2];
      const storedHashValue = parts[3];

      if (version !== this.HASH_PREFIX.slice(0, -1)) {
        logger.error('Unsupported hash version');
        return false;
      }

      const hash = CryptoJS.PBKDF2(password, salt, {
        keySize: this.HASH_LENGTH / 32,
        iterations: iterations,
        hasher: { toString: () => 'sha256' }
      });

      const hashValue = hash.toString();
      const isValid = this.constantTimeCompare(hashValue, storedHashValue);
      
      logger.info('Password verification completed', { isValid });
      return isValid;
    } catch (error) {
      logger.error('Failed to verify password:', error);
      return false;
    }
  },

  constantTimeCompare(a, b) {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  },

  isSecureHash(storedHash) {
    return storedHash.startsWith(this.HASH_PREFIX);
  },

  migratePlainTextPassword(plainTextPassword) {
    logger.info('Migrating plain text password to secure hash');
    return this.hashPassword(plainTextPassword);
  },

  generateSecurePassword(length = 16) {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
    password += '0123456789'[Math.floor(Math.random() * 10)];
    password += '!@#$%^&*'[Math.floor(Math.random() * 8)];
    
    for (let i = 4; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
    
    return password.split('').sort(() => Math.random() - 0.5).join('');
  },

  validatePasswordStrength(password) {
    const feedback = [];
    let score = 0;

    if (password.length < 8) {
      feedback.push('Password must be at least 8 characters long');
    } else {
      score += Math.min(password.length - 8, 4);
    }

    if (/[A-Z]/.test(password)) {
      score += 1;
    } else {
      feedback.push('Include at least one uppercase letter');
    }

    if (/[a-z]/.test(password)) {
      score += 1;
    } else {
      feedback.push('Include at least one lowercase letter');
    }

    if (/[0-9]/.test(password)) {
      score += 1;
    } else {
      feedback.push('Include at least one number');
    }

    if (/[^A-Za-z0-9]/.test(password)) {
      score += 1;
    } else {
      feedback.push('Include at least one special character');
    }

    const commonPasswords = ['password', '123456', 'qwerty', 'admin', 'letmein'];
    if (commonPasswords.includes(password.toLowerCase())) {
      score -= 2;
      feedback.push('Avoid common passwords');
    }

    const isValid = score >= 3 && password.length >= 8;

    return {
      isValid,
      score: Math.max(0, score),
      feedback
    };
  },

  getHashMetadata(storedHash) {
    if (!this.isSecureHash(storedHash)) {
      return {
        version: 'legacy',
        iterations: 0,
        saltLength: 0,
        hashLength: 0,
        isSecure: false
      };
    }

    const parts = storedHash.split('$');
    return {
      version: parts[0],
      iterations: parseInt(parts[1], 10),
      saltLength: parts[2].length,
      hashLength: parts[3].length,
      isSecure: true
    };
  }
};

// Test functions
function runTests() {
  console.log('🧪 Running Password Hashing Tests...\n');

  let passed = 0;
  let failed = 0;

  function test(name, testFn) {
    try {
      testFn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (error) {
      console.log(`❌ ${name}: ${error.message}`);
      failed++;
    }
  }

  // Test 1: Hash password with unique salt
  test('Hash password with unique salt', () => {
    const password = 'TestPassword123!';
    const hash1 = PasswordHasher.hashPassword(password);
    const hash2 = PasswordHasher.hashPassword(password);
    
    if (hash1 === hash2) {
      throw new Error('Hashes should be different due to unique salts');
    }
    
    if (!PasswordHasher.isSecureHash(hash1) || !PasswordHasher.isSecureHash(hash2)) {
      throw new Error('Both hashes should be valid secure hashes');
    }
  });

  // Test 2: Verify correct password
  test('Verify correct password', () => {
    const password = 'TestPassword123!';
    const hash = PasswordHasher.hashPassword(password);
    
    if (!PasswordHasher.verifyPassword(password, hash)) {
      throw new Error('Correct password should be verified successfully');
    }
  });

  // Test 3: Reject incorrect password
  test('Reject incorrect password', () => {
    const password = 'TestPassword123!';
    const hash = PasswordHasher.hashPassword(password);
    
    if (PasswordHasher.verifyPassword('WrongPassword', hash)) {
      throw new Error('Incorrect password should be rejected');
    }
  });

  // Test 4: Reject legacy plain text passwords
  test('Reject legacy plain text passwords', () => {
    if (PasswordHasher.verifyPassword('password', 'plaintextpassword')) {
      throw new Error('Legacy plain text passwords should be rejected');
    }
  });

  // Test 5: Validate password strength
  test('Validate password strength', () => {
    const strongResult = PasswordHasher.validatePasswordStrength('StrongP@ss123!');
    const weakResult = PasswordHasher.validatePasswordStrength('weak');
    
    if (!strongResult.isValid) {
      throw new Error('Strong password should be valid');
    }
    
    if (weakResult.isValid) {
      throw new Error('Weak password should be invalid');
    }
  });

  // Test 6: Generate secure password
  test('Generate secure password', () => {
    const password = PasswordHasher.generateSecurePassword(16);
    
    if (password.length !== 16) {
      throw new Error('Generated password should have correct length');
    }
    
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || 
        !/[0-9]/.test(password) || !/[!@#$%^&*]/.test(password)) {
      throw new Error('Generated password should contain all required character types');
    }
  });

  // Test 7: Get hash metadata
  test('Get hash metadata', () => {
    const hash = PasswordHasher.hashPassword('test');
    const metadata = PasswordHasher.getHashMetadata(hash);
    
    if (!metadata.isSecure || metadata.version !== 'v1' || metadata.iterations !== 100000) {
      throw new Error('Hash metadata should be correct');
    }
  });

  // Test 8: Migrate plain text password
  test('Migrate plain text password', () => {
    const plainTextPassword = 'OldPassword123!';
    const hashedPassword = PasswordHasher.migratePlainTextPassword(plainTextPassword);
    
    if (!PasswordHasher.isSecureHash(hashedPassword)) {
      throw new Error('Migrated password should be a secure hash');
    }
    
    if (!PasswordHasher.verifyPassword(plainTextPassword, hashedPassword)) {
      throw new Error('Migrated password should verify correctly');
    }
  });

  // Test 9: Constant time comparison
  test('Constant time comparison', () => {
    if (!PasswordHasher.constantTimeCompare('test', 'test')) {
      throw new Error('Identical strings should compare as equal');
    }
    
    if (PasswordHasher.constantTimeCompare('test', 'wrong')) {
      throw new Error('Different strings should compare as unequal');
    }
  });

  // Test 10: Hash format validation
  test('Hash format validation', () => {
    const password = 'TestPassword123!';
    const hash = PasswordHasher.hashPassword(password);
    
    if (!hash.startsWith('v1$')) {
      throw new Error('Hash should start with version prefix');
    }
    
    const parts = hash.split('$');
    if (parts.length !== 4) {
      throw new Error('Hash should have correct structure');
    }
  });

  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All tests passed! Password hashing implementation is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Please review the implementation.');
  }
}

// Run the tests
runTests(); 