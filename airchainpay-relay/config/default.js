// AirChainPay Relay Server Configuration
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Environment-specific configuration
const environments = {
  development: {
    rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
    chainId: parseInt(process.env.CHAIN_ID || '84532'),
    contractAddress: process.env.CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000',
    apiKey: process.env.API_KEY || 'dev_api_key',
    jwtSecret: process.env.JWT_SECRET || 'dev_jwt_secret',
    logLevel: 'debug',
    port: parseInt(process.env.PORT || '4000'),
    corsOrigins: '*',
    rateLimits: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100 // 100 requests per IP per windowMs
    },
    ussdEnabled: true
  },
  
  test: {
    rpcUrl: process.env.RPC_URL || 'http://localhost:8545',
    chainId: parseInt(process.env.CHAIN_ID || '31337'),
    contractAddress: process.env.CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000',
    apiKey: process.env.API_KEY || 'test_api_key',
    jwtSecret: process.env.JWT_SECRET || 'test_jwt_secret',
    logLevel: 'debug',
    port: parseInt(process.env.PORT || '4001'),
    corsOrigins: '*',
    rateLimits: {
      windowMs: 15 * 60 * 1000,
      max: 1000
    },
    ussdEnabled: true
  },
  
  production: {
    rpcUrl: process.env.RPC_URL,
    chainId: parseInt(process.env.CHAIN_ID),
    contractAddress: process.env.CONTRACT_ADDRESS,
    apiKey: process.env.API_KEY,
    jwtSecret: process.env.JWT_SECRET,
    logLevel: process.env.LOG_LEVEL || 'info',
    port: parseInt(process.env.PORT || '4000'),
    corsOrigins: process.env.CORS_ORIGINS || 'https://app.airchainpay.com',
    rateLimits: {
      windowMs: 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_MAX || '100')
    },
    ussdEnabled: process.env.USSD_ENABLED === 'true'
  }
};

// Determine current environment
const env = process.env.NODE_ENV || 'development';
const config = environments[env] || environments.development;

// Validate required configuration
function validateConfig() {
  const requiredInProd = ['rpcUrl', 'chainId', 'contractAddress', 'apiKey', 'jwtSecret'];
  
  if (env === 'production') {
    for (const key of requiredInProd) {
      if (!config[key]) {
        console.error(`Error: ${key} is required in production environment`);
        process.exit(1);
      }
    }
  }
}

// Only validate in production to allow development with defaults
if (env === 'production') {
  validateConfig();
}

// Log configuration (excluding secrets)
if (env !== 'test') {
  console.log(`Loaded configuration for ${env} environment`);
  const safeConfig = { ...config };
  delete safeConfig.apiKey;
  delete safeConfig.jwtSecret;
  console.log('Config:', safeConfig);
}

module.exports = config; 