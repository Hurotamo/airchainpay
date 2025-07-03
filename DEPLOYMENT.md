# AirChainPay Multi-Chain Deployment Guide

This guide covers deploying AirChainPay across multiple blockchain networks: Base Sepolia, Core Testnet, and Solana Devnet.

## Prerequisites

### General Requirements
- Node.js 18+ and npm
- Git

### EVM Chains (Base Sepolia, Core Testnet)
- Private key with testnet funds
- RPC URLs for target networks
- Block explorer API keys (optional, for verification)

### Solana
- Solana CLI tools installed
- Rust and Cargo installed
- SOL for deployment fees

## 1. Environment Setup

### Create Environment Files

**For EVM contracts (`airchainpay-contracts/.env`):**
```env
# Base Sepolia
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASESCAN_API_KEY=your_basescan_api_key

# Core Testnet
CORE_TESTNET_RPC_URL=https://rpc.test.btcs.network
CORE_SCAN_API_KEY=your_core_scan_api_key

# Deployment
PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
```

**For Relay Server (`airchainpay-relay/.env`):**
```env
# Server Configuration
PORT=4000
NODE_ENV=production

# Blockchain Configuration
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
CORE_TESTNET_RPC_URL=https://rpc.test.btcs.network
SOLANA_RPC_URL=https://api.devnet.solana.com

# Contract Addresses (update after deployment)
BASE_SEPOLIA_CONTRACT_ADDRESS=
CORE_TESTNET_CONTRACT_ADDRESS=
SOLANA_PROGRAM_ID=

# Security
JWT_SECRET=your_jwt_secret_key
API_KEY=your_api_key

# Database (optional)
DATABASE_URL=postgresql://user:password@localhost:5432/airchainpay
```

## 2. Deploy EVM Contracts

### Install Dependencies
```bash
cd airchainpay-contracts
npm install
```

### Deploy to Base Sepolia
```bash
# Deploy to Base Sepolia
npx hardhat run scripts/deploy-multichain.js --network base_sepolia

# Verify contract (optional)
npx hardhat verify --network base_sepolia DEPLOYED_CONTRACT_ADDRESS
```

### Deploy to Core Testnet
```bash
# Deploy to Core Testnet
npx hardhat run scripts/deploy-multichain.js --network core_testnet

# Verify contract (optional)
npx hardhat verify --network core_testnet DEPLOYED_CONTRACT_ADDRESS
```

### Deploy to All EVM Networks
```bash
# Deploy to all configured networks
npx hardhat run scripts/deploy-multichain.js
```

**Expected Output:**
```
🌐 AirChainPay Multi-Chain Deployment
=====================================

🚀 Deploying to Base Sepolia...
✅ AirChainPay deployed to: 0x1234...
🔗 Block Explorer: https://sepolia.basescan.org/address/0x1234...

🚀 Deploying to Core Testnet...
✅ AirChainPay deployed to: 0x5678...
🔗 Block Explorer: https://scan.test.btcs.network/address/0x5678...

📊 DEPLOYMENT SUMMARY
======================
✅ Successful deployments: 2
   • base_sepolia: 0x1234...
   • core_testnet: 0x5678...
```

## 3. Deploy Solana Program

### Install Solana Tools
```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.17.0/install)"

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Install Solana BPF toolchain
solana install
```

### Generate Keypair
```bash
# Generate new keypair (if you don't have one)
solana-keygen new --outfile ~/.config/solana/id.json

# Or import existing keypair
solana-keygen recover --outfile ~/.config/solana/id.json
```

### Fund Wallet (Devnet)
```bash
# Set to devnet
solana config set --url devnet

# Request airdrop
solana airdrop 2

# Check balance
solana balance
```

### Deploy Program
```bash
cd airchainpay-solana

# Deploy to devnet (default)
./deploy.sh

# Deploy to testnet
./deploy.sh --cluster testnet

# Deploy with custom keypair
./deploy.sh --cluster devnet --keypair /path/to/keypair.json
```

**Expected Output:**
```
🚀 AirChainPay Solana Program Deployment
==========================================

🔧 Setting Solana cluster to devnet...
🔑 Setting keypair to /Users/user/.config/solana/id.json...
💰 Wallet Address: 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM
💰 Balance: 2000000000 lamports
🔨 Building Solana program...
✅ Build completed successfully
🚀 Deploying program to devnet...

Program Id: 7N4HggYEJAtCLJdnHGCtFqfxcB5rhQCsQTze3ftYstVj

✅ Program deployed successfully!
📍 Program ID: 7N4HggYEJAtCLJdnHGCtFqfxcB5rhQCsQTze3ftYstVj
📄 Deployment info saved to: deployments/devnet.json
```

## 4. Update Configuration Files

### Update Contract Addresses

**In `airchainpay-wallet/src/constants/AppConfig.ts`:**
```typescript
export const SUPPORTED_CHAINS: Record<string, ChainConfig> = {
  base_sepolia: {
    // ... other config
    contractAddress: '0x1234...', // Update with deployed address
  },
  core_testnet: {
    // ... other config
    contractAddress: '0x5678...', // Update with deployed address
  },
  solana_devnet: {
    // ... other config
    contractAddress: '7N4HggYEJAtCLJdnHGCtFqfxcB5rhQCsQTze3ftYstVj', // Program ID
  },
};
```

**In `airchainpay-relay/.env`:**
```env
BASE_SEPOLIA_CONTRACT_ADDRESS=0x1234...
CORE_TESTNET_CONTRACT_ADDRESS=0x5678...
SOLANA_PROGRAM_ID=7N4HggYEJAtCLJdnHGCtFqfxcB5rhQCsQTze3ftYstVj
```

## 5. Deploy Relay Server

### Install Dependencies
```bash
cd airchainpay-relay
npm install
```

### Start Server
```bash
# Development
npm start

# Production with PM2
npm install -g pm2
pm2 start src/server.js --name "airchainpay-relay"
```

### Docker Deployment
```bash
# Build image
docker build -t airchainpay-relay .

# Run container
docker run -d \
  --name airchainpay-relay \
  -p 4000:4000 \
  --env-file .env \
  airchainpay-relay

# Or use docker-compose
docker-compose up -d
```

## 6. Build Mobile App

### Install Dependencies
```bash
cd airchainpay-wallet
npm install
```

### Install Solana Dependencies
```bash
# Install additional Solana packages
npm install @solana/web3.js @solana/spl-token buffer
```

### Configure for Development
```bash
# Start Expo development server
npx expo start

# Run on Android
npx expo run:android

# Run on iOS
npx expo run:ios
```

### Build for Production
```bash
# Install EAS CLI
npm install -g @expo/eas-cli

# Login to Expo
eas login

# Configure build
eas build:configure

# Build for Android
eas build --platform android

# Build for iOS
eas build --platform ios

# Build for both platforms
eas build --platform all
```

## 7. Testing Deployment

### Test EVM Contracts
```bash
cd airchainpay-contracts

# Run contract tests
npx hardhat test

# Test deployment
npx hardhat run scripts/check-deployment.js --network base_sepolia
npx hardhat run scripts/check-deployment.js --network core_testnet
```

### Test Solana Program
```bash
cd airchainpay-solana

# Run program tests
cargo test-sbf

# Test deployment
solana program show 7N4HggYEJAtCLJdnHGCtFqfxcB5rhQCsQTze3ftYstVj
```

### Test Relay Server
```bash
cd airchainpay-relay

# Run integration tests
npm test

# Test endpoints
curl http://localhost:4000/health
curl -X POST http://localhost:4000/auth/token -H "Content-Type: application/json" -d '{"apiKey":"your_api_key"}'
```

### Test Mobile App
```bash
cd airchainpay-wallet

# Run tests
npm test

# Test Bluetooth functionality
node scripts/test-bluetooth.js
```

## 8. Monitoring and Maintenance

### Check Deployment Status
All deployment information is saved in respective `deployments/` directories:

- `airchainpay-contracts/deployments/` - EVM contract addresses
- `airchainpay-solana/deployments/` - Solana program IDs
- `airchainpay-relay/logs/` - Server logs

### Monitor Transactions
- **Base Sepolia**: https://sepolia.basescan.org
- **Core Testnet**: https://scan.test.btcs.network
- **Solana Devnet**: https://explorer.solana.com/?cluster=devnet

### Update Contracts
When updating contracts, follow this sequence:
1. Deploy new contract versions
2. Update configuration files
3. Restart relay server
4. Update mobile app
5. Test all functionality

## 9. Production Considerations

### Security
- Use hardware wallets for mainnet deployments
- Implement multi-signature wallets for contract ownership
- Regular security audits
- Monitor for unusual activity

### Scalability
- Use load balancers for relay servers
- Implement caching for frequent queries
- Consider using dedicated RPC providers
- Monitor gas usage and optimize

### Backup and Recovery
- Backup all private keys securely
- Document all contract addresses
- Maintain deployment scripts
- Test recovery procedures

## 10. Troubleshooting

### Common Issues

**EVM Deployment Fails:**
```bash
# Check network configuration
npx hardhat run scripts/check-network.js --network base_sepolia

# Verify RPC URL
curl -X POST BASE_SEPOLIA_RPC_URL -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

**Solana Deployment Fails:**
```bash
# Check Solana configuration
solana config get

# Check balance
solana balance

# Check program
solana program show PROGRAM_ID
```

**Mobile App Issues:**
```bash
# Clear Metro cache
npx expo start --clear

# Reset project
npm run reset-project

# Check dependencies
npm audit
```

### Getting Help
- Check GitHub Issues
- Join Discord community
- Review documentation
- Contact support team

## Next Steps

After successful deployment:
1. Test all payment flows
2. Monitor transaction success rates
3. Gather user feedback
4. Plan mainnet deployment
5. Implement additional features

---

**⚠️ Important Notes:**
- Always test on testnets before mainnet
- Keep private keys secure
- Monitor gas prices and adjust accordingly
- Regularly update dependencies
- Follow security best practices 