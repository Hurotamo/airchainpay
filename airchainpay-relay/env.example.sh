# AirChainPay Relay Environment Configuration

# Server Configuration
NODE_ENV=production
PORT=4000
LOG_LEVEL=info

# API Security
API_KEY=your_secure_api_key_here
JWT_SECRET=your_secure_jwt_secret_here

# CORS Configuration
CORS_ORIGINS=https://app.airchainpay.com,https://wallet.airchainpay.com

# Rate Limiting
RATE_LIMIT_MAX=100

# Blockchain Configuration
# Base Sepolia (Testnet)
BASE_SEPOLIA_CONTRACT_ADDRESS=0x7B79117445C57eea1CEAb4733020A55e1D503934
RPC_URL=https://sepolia.base.org
CHAIN_ID=84532
CONTRACT_ADDRESS=0x7B79117445C57eea1CEAb4733020A55e1D503934

# Core Testnet
CORE_TESTNET_CONTRACT_ADDRESS=0x8d7eaB03a72974F5D9F5c99B4e4e1B393DBcfCAB

# Production RPC URLs (replace with your preferred providers)
# BASE_MAINNET_RPC_URL=https://mainnet.base.org
# CORE_MAINNET_RPC_URL=https://rpc.coredao.org 