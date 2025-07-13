#!/bin/bash

# AirChainPay Relay Server Environment Configuration
# Copy this file to .env and update with your values

# Environment
export RUST_ENV=development  # development, staging, production

# Server Configuration
export PORT=4000
export LOG_LEVEL=info

# Core Testnet 2 Configuration (Primary)
export RPC_URL=https://rpc.test2.btcs.network
export CHAIN_ID=1114
export CONTRACT_ADDRESS=your_contract_address_here

# Core Testnet 2 Environment Variables
export CORE_TESTNET2_RPC_URL=https://rpc.test2.btcs.network
export CORE_TESTNET2_CONTRACT_ADDRESS=your_contract_address_here
export CORE_TESTNET2_BLOCK_EXPLORER=https://scan.test2.btcs.network
export CORE_TESTNET2_CURRENCY_SYMBOL=TCORE2

# Base Sepolia Configuration (Secondary)
export BASE_SEPOLIA_RPC_URL=https://base-sepolia.drpc.org
export BASE_SEPOLIA_CONTRACT_ADDRESS=your_contract_address_here
export BASE_SEPOLIA_BLOCK_EXPLORER=https://sepolia.basescan.org
export BASE_SEPOLIA_CURRENCY_SYMBOL=ETH

# Security
export API_KEY=your_api_key_here
export JWT_SECRET=your_jwt_secret_here

# CORS
export CORS_ORIGINS=*

# Rate Limiting
export RATE_LIMIT_MAX=1000

# Features
export DEBUG=true
export ENABLE_SWAGGER=true
export ENABLE_METRICS=true
export ENABLE_HEALTH_CHECKS=true
export ENABLE_CORS_DEBUG=true
export LOG_REQUESTS=true
export ENABLE_RATE_LIMITING=true
export ENABLE_JWT_VALIDATION=true
export ENABLE_API_KEY_VALIDATION=true

# Monitoring
export ENABLE_ALERTING=false

echo "Environment variables loaded for AirChainPay Relay Server"
echo "Primary Network: Core Testnet 2 (Chain ID: 1114)"
echo "Secondary Network: Base Sepolia (Chain ID: 84532)" 