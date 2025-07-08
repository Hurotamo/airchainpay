# AirChainPay Relay - Production Environment Configuration
# Copy this file to .env.prod and update the values for your production environment
# IMPORTANT: Generate secure secrets for production use

# ===========================================
# SERVER CONFIGURATION
# ===========================================
NODE_ENV=production
PORT=4000
LOG_LEVEL=warn

# ===========================================
# SECURITY - PRODUCTION SECRETS (GENERATE SECURELY)
# ===========================================
# Production API Key - GENERATE WITH: node -e "console.log('API_KEY:', require('crypto').randomBytes(32).toString('hex'))"
API_KEY=611d4388b3f0df7e419877a661d1286b136698d9f9399bda6aa10904917c846djdjew82 = sample 

# Production JWT Secret - GENERATE WITH: node -e "console.log('JWT_SECRET:', require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=sample-d3dcdsdw0c63f32701a6520154fa7d9432d6c66576fb0ce82f1124f441cc911c7c228252257a5638614e1c6f1a5170a4facd31af3e918b8cfa7177237b381956e875

# ===========================================
# CORS CONFIGURATION - PRODUCTION
# ===========================================
# Production origins only
CORS_ORIGINS=https://app.airchainpay.com,https://wallet.airchainpay.com

# ===========================================
# RATE LIMITING - PRODUCTION
# ===========================================
RATE_LIMIT_MAX=100

# ===========================================
# BLOCKCHAIN CONFIGURATION - PRODUCTION
# ===========================================
# Base Mainnet - Production
BASE_MAINNET_CONTRACT_ADDRESS=PRODUCTION_CONTRACT_ADDRESS_PLACEHOLDER
BASE_MAINNET_RPC_URL=https://mainnet.base.org
BASE_MAINNET_CHAIN_ID=8453
BASE_MAINNET_CONTRACT_ADDRESS=PRODUCTION_CONTRACT_ADDRESS_PLACEHOLDER

# Core Mainnet - Production
CORE_MAINNET_CONTRACT_ADDRESS=PRODUCTION_CORE_CONTRACT_ADDRESS_PLACEHOLDER
CORE_MAINNET_RPC_URL=https://rpc.coredao.org
CORE_MAINNET_CHAIN_ID=1116

# ===========================================
# PRODUCTION-SPECIFIC SETTINGS
# ===========================================
# Disable debugging in production
DEBUG=false
ENABLE_SWAGGER=false
ENABLE_CORS_DEBUG=false

# ===========================================
# MONITORING - PRODUCTION
# ===========================================
# Full monitoring for production
ENABLE_METRICS=true
ENABLE_HEALTH_CHECKS=true
LOG_REQUESTS=true
ENABLE_ALERTING=true

# ===========================================
# SECURITY - PRODUCTION
# ===========================================
# Enable all security features
ENABLE_RATE_LIMITING=true
ENABLE_CORS=true
ENABLE_JWT_VALIDATION=true
ENABLE_API_KEY_VALIDATION=true

# ===========================================
# SECURITY NOTES - PRODUCTION
# ===========================================
# 1. ALWAYS generate new secure secrets for production
# 2. Use mainnet contracts and RPC URLs
# 3. Strict rate limiting for production
# 4. Enable all security features
# 5. Monitor and log all activities
# 6. Use HTTPS only in production
# 7. Regular secret rotation required 