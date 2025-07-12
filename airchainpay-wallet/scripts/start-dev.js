#!/usr/bin/env node

const { execSync } = require('child_process');

console.log('🚀 Starting development server...');

// Start the development server without development client
try {
  execSync('EXPO_NO_DEVELOPMENT_CLIENT=1 npx expo start --tunnel --clear', { 
    stdio: 'inherit',
    env: {
      ...process.env,
      EXPO_NO_DEVELOPMENT_CLIENT: '1',
      EXPO_DEVTOOLS_LISTEN_ADDRESS: '0.0.0.0'
    }
  });
} catch (error) {
  console.error('Failed to start development server:', error);
  process.exit(1);
} 