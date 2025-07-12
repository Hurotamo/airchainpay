import { Buffer } from 'buffer';
import secureRandom from './secure-random';
import * as CryptoJS from 'crypto-js';

// Crypto shim for ethers.js in React Native
// This provides comprehensive implementations of crypto functions needed by ethers

const cryptoShim = {
  getRandomValues: function(buffer) {
    try {
      return secureRandom.getRandomValues(buffer);
    } catch (error) {
      console.error('[Crypto] Error in getRandomValues:', error);
      throw error;
    }
  },
  
  randomBytes: function(size) {
    try {
      const buffer = new Uint8Array(size);
      this.getRandomValues(buffer);
      // Return Buffer if available, else Uint8Array
      if (typeof Buffer !== 'undefined') {
        return Buffer.from(buffer);
      }
      return buffer;
    } catch (error) {
      console.error('[Crypto] Error in randomBytes:', error);
      throw error;
    }
  },
  
  // Proper hash implementation using crypto-js
  createHash: function(algorithm) {
    let hash;
    
    // Map common algorithms to crypto-js equivalents
    switch (algorithm.toLowerCase()) {
      case 'sha256':
        hash = CryptoJS.SHA256;
        break;
      case 'sha1':
        hash = CryptoJS.SHA1;
        break;
      case 'md5':
        hash = CryptoJS.MD5;
        break;
      default:
        // Default to SHA256 for unknown algorithms
        hash = CryptoJS.SHA256;
    }
    
    let data = '';
    
    return {
      update: function(input) {
        if (typeof input === 'string') {
          data += input;
        } else if (Buffer.isBuffer(input)) {
          data += input.toString('utf8');
        } else if (input instanceof Uint8Array) {
          data += Buffer.from(input).toString('utf8');
        } else {
          data += String(input);
        }
        return this;
      },
      digest: function(encoding) {
        const result = hash(data);
        const hashHex = result.toString();
        
        if (encoding === 'hex') {
          return hashHex;
        } else if (encoding === 'base64') {
          return Buffer.from(hashHex, 'hex').toString('base64');
        } else {
          // Return as Buffer by default
          return Buffer.from(hashHex, 'hex');
        }
      }
    };
  },
  
  // Proper HMAC implementation using crypto-js
  createHmac: function(algorithm, key) {
    let hmac;
    
    // Map common algorithms to crypto-js equivalents
    switch (algorithm.toLowerCase()) {
      case 'sha256':
        hmac = CryptoJS.HmacSHA256;
        break;
      case 'sha1':
        hmac = CryptoJS.HmacSHA1;
        break;
      case 'md5':
        hmac = CryptoJS.HmacMD5;
        break;
      default:
        // Default to SHA256 for unknown algorithms
        hmac = CryptoJS.HmacSHA256;
    }
    
    let data = '';
    
    return {
      update: function(input) {
        if (typeof input === 'string') {
          data += input;
        } else if (Buffer.isBuffer(input)) {
          data += input.toString('utf8');
        } else if (input instanceof Uint8Array) {
          data += Buffer.from(input).toString('utf8');
        } else {
          data += String(input);
        }
        return this;
      },
      digest: function(encoding) {
        const result = hmac(data, key);
        const hmacHex = result.toString();
        
        if (encoding === 'hex') {
          return hmacHex;
        } else if (encoding === 'base64') {
          return Buffer.from(hmacHex, 'hex').toString('base64');
        } else {
          // Return as Buffer by default
          return Buffer.from(hmacHex, 'hex');
        }
      }
    };
  }
};

console.log('[Crypto] Crypto shim initialized with proper hash/HMAC implementations');

export default cryptoShim;
