#!/bin/bash

# AirChainPay - Base Sepolia Deployment Script
# Deploys both AirChainPay and AirChainPayToken contracts with proper configuration

set -e

echo "🚀 AirChainPay - Base Sepolia Deployment"
echo "========================================"

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found. Please create one with your private key and RPC URLs."
    exit 1
fi

# Load environment variables
source .env

# Check if PRIVATE_KEY is set
if [ -z "$PRIVATE_KEY" ]; then
    echo "❌ Error: PRIVATE_KEY not set in .env file"
    exit 1
fi

echo "📋 Deployment Steps:"
echo "1. Deploy AirChainPay contract"
echo "2. Deploy AirChainPayToken contract"
echo "3. Configure supported tokens (USDC, USDT)"
echo "4. Verify contracts on block explorer"
echo "5. Run deployment checks"
echo ""

# Step 1: Deploy AirChainPay contract
echo "📦 Step 1: Deploying AirChainPay contract..."
npx hardhat run scripts/deploy-airchainpay-base-sepolia.js --network base_sepolia

# Step 2: Deploy AirChainPayToken contract
echo "📦 Step 2: Deploying AirChainPayToken contract..."
npx hardhat run scripts/deploy-token-contract-base-sepolia.js --network base_sepolia

# Step 3: Configure tokens
echo "⚙️  Step 3: Configuring supported tokens..."
npx hardhat run scripts/configure-tokens-base-sepolia.js --network base_sepolia

# Step 4: Verify contracts
echo "🔍 Step 4: Verifying contracts on block explorer..."
npx hardhat run scripts/verify-base-sepolia.js --network base_sepolia

# Step 5: Check deployment
echo "✅ Step 5: Running deployment checks..."
npx hardhat run scripts/check-base-sepolia.js --network base_sepolia

echo ""
echo "🎉 Base Sepolia deployment completed successfully!"
echo "📄 Check deployments/base_sepolia.json for contract addresses"
echo "🔗 View contracts at: https://sepolia.basescan.org" 