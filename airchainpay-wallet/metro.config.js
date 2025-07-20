// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Fix for hostname resolution issues in Android emulator
// Use correct configuration format
module.exports = {
  ...config,
  // Set resolver to handle specific file extensions
  resolver: {
    ...config.resolver,
    sourceExts: ['jsx', 'js', 'ts', 'tsx', 'json', 'mjs'],
    // Add platform-specific extensions
    platforms: ['native', 'android', 'ios', 'web'],
    extraNodeModules: {
      // Provide fallbacks for problematic packages
      '@adraffy/ens-normalize': path.resolve(__dirname, 'node_modules/@adraffy/ens-normalize'),
      '@noble/hashes': path.resolve(__dirname, 'node_modules/@noble/hashes'),
      'use-latest-callback': path.resolve(__dirname, 'node_modules/use-latest-callback'),
      'superstruct': path.resolve(__dirname, 'src/shims/superstruct.js'),
      'buffer': path.resolve(__dirname, 'node_modules/buffer'),
      'stream': path.resolve(__dirname, 'node_modules/stream-browserify'),
      'assert': path.resolve(__dirname, 'node_modules/assert'),
      'url': path.resolve(__dirname, 'node_modules/url'),
      'events': path.resolve(__dirname, 'node_modules/events'),
      'ws': path.resolve(__dirname, 'src/shims/websocket.js'),
      'rpc-websockets': path.resolve(__dirname, 'src/shims/rpc-websockets.js'),
      'crypto': path.resolve(__dirname, 'src/shims/crypto.js'),
      // Add BLE module fallbacks - point to actual module
      'react-native-ble-advertiser': path.resolve(__dirname, 'node_modules/tp-rn-ble-advertiser'),
      'ble-advertiser': path.resolve(__dirname, 'node_modules/tp-rn-ble-advertiser'),
      '@react-native-ble/ble-advertiser': path.resolve(__dirname, 'node_modules/tp-rn-ble-advertiser'),
      // Add fallbacks for unknown modules that might be required
      '1827': path.resolve(__dirname, 'node_modules/tp-rn-ble-advertiser'),
      '1828': path.resolve(__dirname, 'node_modules/tp-rn-ble-advertiser'),
      '1829': path.resolve(__dirname, 'node_modules/tp-rn-ble-advertiser')
    },
    // Force Metro to resolve these modules
    resolverMainFields: ['react-native', 'browser', 'main'],
    // Add aliases for problematic modules
    alias: {
      '@adraffy/ens-normalize': path.resolve(__dirname, 'node_modules/@adraffy/ens-normalize'),
      '@noble/hashes/crypto': path.resolve(__dirname, 'node_modules/@noble/hashes/crypto'),
      'superstruct': path.resolve(__dirname, 'src/shims/superstruct.js'),
      'ws': path.resolve(__dirname, 'src/shims/websocket.js'),
      'rpc-websockets': path.resolve(__dirname, 'src/shims/rpc-websockets.js'),
      'crypto': path.resolve(__dirname, 'src/shims/crypto.js'),
      // Add BLE module aliases
      'react-native-ble-advertiser': path.resolve(__dirname, 'node_modules/tp-rn-ble-advertiser'),
      'ble-advertiser': path.resolve(__dirname, 'node_modules/tp-rn-ble-advertiser'),
      '@react-native-ble/ble-advertiser': path.resolve(__dirname, 'node_modules/tp-rn-ble-advertiser')
    },
    // Custom resolver function to handle module resolution
    resolveRequest: (context, moduleName, platform) => {
      // Handle BLE advertiser modules
      if (moduleName === 'react-native-ble-advertiser' || 
          moduleName === 'ble-advertiser' || 
          moduleName === '@react-native-ble/ble-advertiser') {
        return {
          filePath: path.resolve(__dirname, 'node_modules/tp-rn-ble-advertiser'),
          type: 'sourceFile'
        };
      }
      
      // Handle unknown module numbers (1827, 1828, 1829)
      if (moduleName === '1827' || moduleName === '1828' || moduleName === '1829') {
        return {
          filePath: path.resolve(__dirname, 'node_modules/tp-rn-ble-advertiser'),
          type: 'sourceFile'
        };
      }
      
      // Force rpc-websockets to resolve to our shim
      if (moduleName === 'rpc-websockets') {
        return {
          filePath: path.resolve(__dirname, 'src/shims/rpc-websockets.js'),
          type: 'sourceFile'
        };
      }
      
      // Force crypto to resolve to our shim
      if (moduleName === 'crypto') {
        return {
          filePath: path.resolve(__dirname, 'src/shims/crypto.js'),
          type: 'sourceFile'
        };
      }
      
      // Use default resolver for other modules
      return context.resolveRequest(context, moduleName, platform);
    }
  },
  // Set server configuration
  server: {
    port: 8081,
    // Force IP address that works with Android emulators
    enhanceMiddleware: (middleware) => {
      return (req, res, next) => {
        // Force connections to use 10.0.2.2 for Android emulators
        if (req.headers && req.headers.host) {
          req.headers.host = '127.0.0.1:8081';
        }
        return middleware(req, res, next);
      };
    }
  }
}; 