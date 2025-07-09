// AirChainPay Relay Server Configuration
const path = require('path');
const fs = require('fs');

// Load environment-specific .env file
const env = process.env.NODE_ENV || 'development';
const envFile = path.join(__dirname, '..', `.env.${env}`);
const defaultEnvFile = path.join(__dirname, '..', '.env');

// Try to load environment-specific file, fallback to default
let envPath = defaultEnvFile;
if (fs.existsSync(envFile)) {
  envPath = envFile;
  console.log(`Loading environment configuration from: ${envFile}`);
} else if (fs.existsSync(defaultEnvFile)) {
  console.log(`Loading environment configuration from: ${defaultEnvFile}`);
} else {
  console.warn('No .env file found, using default configuration');
}

require('dotenv').config({ path: envPath });

// Supported blockchain networks - only Base Sepolia and Core Testnet
const SUPPORTED_CHAINS = {
  84532: { // Base Sepolia
    name: 'Base Sepolia',
    rpcUrl: 'https://sepolia.base.org',
    contractAddress: process.env.BASE_SEPOLIA_CONTRACT_ADDRESS || '0x7B79117445C57eea1CEAb4733020A55e1D503934',
    explorer: 'https://sepolia.basescan.org'
  },
  11155420: { // Core Testnet (old)
    name: 'Core Testnet',
    rpcUrl: 'https://rpc.test.btcs.network',
    contractAddress: process.env.CORE_TESTNET_CONTRACT_ADDRESS || '0x8d7eaB03a72974F5D9F5c99B4e4e1B393DBcfCAB',
    explorer: 'https://scan.test2.btcs.network'
  },
  1114: { // Core Testnet 2
    name: 'Core Testnet 2',
    rpcUrl: process.env.RPC_URL || 'https://rpc.test2.btcs.network',
    contractAddress: process.env.CONTRACT_ADDRESS,
    explorer: process.env.BLOCK_EXPLORER || 'https://scan.test2.btcs.network',
    currencySymbol: process.env.CURRENCY_SYMBOL || 'TCORE2'
  },
  // Production chains (when ready)
  8453: { // Base Mainnet
    name: 'Base Mainnet',
    rpcUrl: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
    contractAddress: process.env.BASE_MAINNET_CONTRACT_ADDRESS,
    explorer: 'https://basescan.org'
  },
  1116: { // Core Mainnet
    name: 'Core Mainnet',
    rpcUrl: process.env.CORE_MAINNET_RPC_URL || 'https://rpc.coredao.org',
    contractAddress: process.env.CORE_MAINNET_CONTRACT_ADDRESS,
    explorer: 'https://scan.coredao.org'
  }
};

// Environment-specific configuration
const environments = {
  development: {
    rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
    chainId: parseInt(process.env.CHAIN_ID || '84532'),
    contractAddress: process.env.CONTRACT_ADDRESS || '0x7B79117445C57eea1CEAb4733020A55e1D503934',
    apiKey: process.env.API_KEY || 'dev_api_key',
    jwtSecret: process.env.JWT_SECRET || 'dev_jwt_secret',
    logLevel: 'debug',
    port: parseInt(process.env.PORT || '4000'),
    corsOrigins: process.env.CORS_ORIGINS || '*',
    rateLimits: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX || '1000')
    },
    debug: process.env.DEBUG === 'true',
    enableSwagger: process.env.ENABLE_SWAGGER === 'true',
    enableCorsDebug: process.env.ENABLE_CORS_DEBUG === 'true'
  },
  
  staging: {
    rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
    chainId: parseInt(process.env.CHAIN_ID || '84532'),
    contractAddress: process.env.CONTRACT_ADDRESS || '0x7B79117445C57eea1CEAb4733020A55e1D503934',
    apiKey: process.env.API_KEY,
    jwtSecret: process.env.JWT_SECRET,
    logLevel: 'info',
    port: parseInt(process.env.PORT || '4000'),
    corsOrigins: process.env.CORS_ORIGINS || 'https://staging.airchainpay.com,https://staging-wallet.airchainpay.com',
    rateLimits: {
      windowMs: 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_MAX || '500')
    },
    debug: process.env.DEBUG === 'true',
    enableSwagger: process.env.ENABLE_SWAGGER === 'true',
    enableCorsDebug: process.env.ENABLE_CORS_DEBUG === 'false',
    enableMetrics: process.env.ENABLE_METRICS === 'true',
    enableHealthChecks: process.env.ENABLE_HEALTH_CHECKS === 'true',
    logRequests: process.env.LOG_REQUESTS === 'true'
  },
  
  production: {
    rpcUrl: process.env.RPC_URL,
    chainId: parseInt(process.env.CHAIN_ID),
    contractAddress: process.env.CONTRACT_ADDRESS,
    apiKey: process.env.API_KEY,
    jwtSecret: process.env.JWT_SECRET,
    logLevel: process.env.LOG_LEVEL || 'warn',
    port: parseInt(process.env.PORT || '4000'),
    corsOrigins: process.env.CORS_ORIGINS || 'https://app.airchainpay.com,https://wallet.airchainpay.com',
    rateLimits: {
      windowMs: 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_MAX || '100')
    },
    debug: process.env.DEBUG === 'true',
    enableSwagger: process.env.ENABLE_SWAGGER === 'true',
    enableCorsDebug: process.env.ENABLE_CORS_DEBUG === 'false',
    enableMetrics: process.env.ENABLE_METRICS === 'true',
    enableHealthChecks: process.env.ENABLE_HEALTH_CHECKS === 'true',
    logRequests: process.env.LOG_REQUESTS === 'true',
    enableAlerting: process.env.ENABLE_ALERTING === 'true',
    enableRateLimiting: process.env.ENABLE_RATE_LIMITING !== 'false',
    enableCors: process.env.ENABLE_CORS !== 'false',
    enableJwtValidation: process.env.ENABLE_JWT_VALIDATION !== 'false',
    enableApiKeyValidation: process.env.ENABLE_API_KEY_VALIDATION !== 'false'
  }
};

// Determine current environment
const config = environments[env] || environments.development;

// Validate required configuration
function validateConfig() {
  const requiredInProd = ['rpcUrl', 'chainId', 'contractAddress', 'apiKey', 'jwtSecret'];
  const requiredInStaging = ['apiKey', 'jwtSecret'];
  
  if (env === 'production') {
    for (const key of requiredInProd) {
      if (!config[key]) {
        console.error(`Error: ${key} is required in production environment`);
        process.exit(1);
      }
    }
  } else if (env === 'staging') {
    for (const key of requiredInStaging) {
      if (!config[key]) {
        console.error(`Error: ${key} is required in staging environment`);
        process.exit(1);
      }
    }
  }
}

// Validate configuration based on environment
validateConfig();

// Log configuration (excluding secrets)
if (env !== 'test') {
  console.log(`Loaded configuration for ${env} environment`);
  const safeConfig = { ...config };
  delete safeConfig.apiKey;
  delete safeConfig.jwtSecret;
  console.log('Config:', safeConfig);
}

module.exports = { ...config, SUPPORTED_CHAINS }; 