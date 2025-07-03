#!/bin/bash

# AirChainPay Solana Program Deployment Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
CLUSTER="devnet"
PROGRAM_NAME="airchainpay-solana"
KEYPAIR_PATH="$HOME/.config/solana/id.json"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -c|--cluster)
      CLUSTER="$2"
      shift 2
      ;;
    -k|--keypair)
      KEYPAIR_PATH="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo "Options:"
      echo "  -c, --cluster CLUSTER    Target cluster (devnet, testnet, mainnet-beta)"
      echo "  -k, --keypair PATH       Path to keypair file"
      echo "  -h, --help              Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option $1"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}🚀 AirChainPay Solana Program Deployment${NC}"
echo -e "${BLUE}==========================================${NC}"

# Validate cluster
if [[ "$CLUSTER" != "devnet" && "$CLUSTER" != "testnet" && "$CLUSTER" != "mainnet-beta" ]]; then
    echo -e "${RED}❌ Invalid cluster: $CLUSTER${NC}"
    echo -e "${YELLOW}Valid clusters: devnet, testnet, mainnet-beta${NC}"
    exit 1
fi

# Check if keypair exists
if [[ ! -f "$KEYPAIR_PATH" ]]; then
    echo -e "${RED}❌ Keypair not found: $KEYPAIR_PATH${NC}"
    echo -e "${YELLOW}Generate a keypair with: solana-keygen new${NC}"
    exit 1
fi

# Set Solana cluster
echo -e "${YELLOW}🔧 Setting Solana cluster to $CLUSTER...${NC}"
solana config set --url "$CLUSTER"

# Set keypair
echo -e "${YELLOW}🔑 Setting keypair to $KEYPAIR_PATH...${NC}"
solana config set --keypair "$KEYPAIR_PATH"

# Show current config
echo -e "${BLUE}📋 Current Solana Configuration:${NC}"
solana config get

# Get wallet address and balance
WALLET_ADDRESS=$(solana address)
BALANCE=$(solana balance --lamports)

echo -e "${BLUE}💰 Wallet Address: $WALLET_ADDRESS${NC}"
echo -e "${BLUE}💰 Balance: $BALANCE lamports${NC}"

# Check if we have enough SOL for deployment (minimum 2 SOL for devnet/testnet)
MIN_BALANCE=2000000000  # 2 SOL in lamports
BALANCE_NUM=$(echo $BALANCE | sed 's/ lamports//')
if [[ $BALANCE_NUM -lt $MIN_BALANCE ]]; then
    echo -e "${YELLOW}⚠️  Low balance detected${NC}"
    if [[ "$CLUSTER" == "devnet" ]]; then
        echo -e "${YELLOW}🪂 Requesting airdrop...${NC}"
        solana airdrop 2
        echo -e "${GREEN}✅ Airdrop completed${NC}"
    else
        echo -e "${RED}❌ Insufficient balance for deployment${NC}"
        echo -e "${YELLOW}Please fund your wallet with at least 2 SOL${NC}"
        exit 1
    fi
fi

# Build the program
echo -e "${YELLOW}🔨 Building Solana program...${NC}"
cargo build-sbf

# Check if build was successful
if [[ $? -ne 0 ]]; then
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build completed successfully${NC}"

# Deploy the program
echo -e "${YELLOW}🚀 Deploying program to $CLUSTER...${NC}"

PROGRAM_SO="target/deploy/${PROGRAM_NAME}.so"
if [[ ! -f "$PROGRAM_SO" ]]; then
    echo -e "${RED}❌ Program binary not found: $PROGRAM_SO${NC}"
    exit 1
fi

# Deploy and capture the program ID
DEPLOY_OUTPUT=$(solana program deploy "$PROGRAM_SO" 2>&1)
DEPLOY_EXIT_CODE=$?

echo "$DEPLOY_OUTPUT"

if [[ $DEPLOY_EXIT_CODE -eq 0 ]]; then
    # Extract program ID from deployment output
    PROGRAM_ID=$(echo "$DEPLOY_OUTPUT" | grep -o 'Program Id: [A-Za-z0-9]*' | cut -d' ' -f3)
    
    if [[ -n "$PROGRAM_ID" ]]; then
        echo -e "${GREEN}✅ Program deployed successfully!${NC}"
        echo -e "${GREEN}📍 Program ID: $PROGRAM_ID${NC}"
        
        # Save deployment info
        DEPLOYMENT_FILE="deployments/${CLUSTER}.json"
        mkdir -p deployments
        
        cat > "$DEPLOYMENT_FILE" << EOF
{
  "programId": "$PROGRAM_ID",
  "cluster": "$CLUSTER",
  "deployer": "$WALLET_ADDRESS",
  "deployedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "programPath": "$PROGRAM_SO"
}
EOF
        
        echo -e "${BLUE}📄 Deployment info saved to: $DEPLOYMENT_FILE${NC}"
        
        # Show program info
        echo -e "${BLUE}📊 Program Information:${NC}"
        solana program show "$PROGRAM_ID"
        
        # Create a summary
        echo -e "${GREEN}🎉 Deployment Summary:${NC}"
        echo -e "${GREEN}   • Cluster: $CLUSTER${NC}"
        echo -e "${GREEN}   • Program ID: $PROGRAM_ID${NC}"
        echo -e "${GREEN}   • Deployer: $WALLET_ADDRESS${NC}"
        echo -e "${GREEN}   • Explorer: https://explorer.solana.com/address/$PROGRAM_ID?cluster=$CLUSTER${NC}"
        
    else
        echo -e "${RED}❌ Could not extract Program ID from deployment output${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi

echo -e "${GREEN}🎊 AirChainPay Solana program deployment completed!${NC}" 