// Polyfills for React Native to support ethers
// Import secure random values first - this is critical for crypto operations
import 'react-native-get-random-values';

// Set up Buffer globally
import { Buffer } from 'buffer';

// Import other shims
import './shims/ens-normalize';
import './shims/websocket';

// Import and set up crypto shim
import cryptoShim from './shims/crypto';
if (typeof global !== 'undefined') {
  global.Buffer = Buffer;
}

// Set up crypto globally - this must be done before any ethers imports
if (typeof global !== 'undefined') {
  global.crypto = cryptoShim;
}

if (typeof window !== 'undefined') {
  window.crypto = cryptoShim;
}

// Also ensure the crypto module is available for Node.js style imports
if (typeof global !== 'undefined') {
  // Ensure crypto is available as a module
  global.crypto = global.crypto || cryptoShim;
}

console.log('[Polyfills] Crypto polyfill initialized');