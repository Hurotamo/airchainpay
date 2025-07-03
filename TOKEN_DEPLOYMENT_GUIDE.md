# 🚀 AirChainPay Multi-Token Deployment Guide

## Overview

AirChainPay now supports comprehensive multi-chain token payments including:
- **Native Tokens**: ETH (Base Sepolia), tCORE (Core Testnet), SOL (Solana Devnet)
- **Stablecoins**: USDC, USDT across all supported chains
- **Cross-chain Bluetooth relay** for offline transactions
- **Multi-token wallet interface** with unified balance display

## 🏗️ Architecture Components

### 1. Smart Contracts (EVM)
- **AirChainPayToken.sol**: Enhanced contract supporting both native and ERC-20 tokens
- **MockERC20.sol**: Test tokens for development (USDC/USDT)
- **Multi-chain deployment**: Base Sepolia, Core Testnet

### 2. Solana Program
- **Native Rust program** (no Anchor) with SPL token support
- **USDC integration** on Solana Devnet
- **Associated token account management**

### 3. Mobile App Enhancements
- **TokenWalletManager**: Multi-chain token operations
- **MultiTokenBalanceView**: Unified portfolio display
- **Cross-chain transaction support**

## 📋 Prerequisites

### Development Environment
```bash
# Node.js & npm
node --version  # >= 18.0.0
npm --version   # >= 9.0.0

# Solana CLI
solana --version  # >= 1.18.0

# React Native & Expo
expo --version    # >= 50.0.0
```

### Required Accounts & Tokens
- **Base Sepolia**: ETH for gas, testnet USDC/USDT
- **Core Blockchain TestNet**: tCORE2 for gas
- **Solana Devnet**: SOL for gas, devnet USDC

## 🚀 Deployment Steps

### Step 1: Deploy EVM Contracts

#### 1.1 Install Dependencies
```bash
cd airchainpay-contracts
npm install @openzeppelin/contracts
```

#### 1.2 Configure Networks
The `hardhat.config.js` is already configured for:
- Base Sepolia (chainId: 84532)
- Core Blockchain TestNet (chainId: 1114)

#### 1.3 Deploy to Base Sepolia
```bash
# Deploy enhanced token contract
npx hardhat run scripts/deploy-token-contracts.js --network base_sepolia

# Expected output:
# 🚀 Deploying AirChainPayToken to Base Sepolia...
# ✅ AirChainPayToken deployed to: 0x...
# 🔧 Configuring supported tokens...
# ✅ USDC configured successfully
# ✅ USDT configured successfully
```

#### 1.4 Deploy to Core Blockchain TestNet
```bash
# Deploy to Core Blockchain TestNet
npx hardhat run scripts/deploy-token-contracts.js --network core_testnet

# Note: USDC/USDT may not be available on Core Testnet yet
# The script will deploy mock tokens for testing
```

### Step 2: Deploy Solana Program

#### 2.1 Build Program
```bash
cd airchainpay-solana
cargo build-sbf
```

#### 2.2 Deploy to Devnet
```bash
# Deploy using the provided script
chmod +x deploy.sh
./deploy.sh

# Expected output:
# 🚀 Deploying AirChainPay Solana Program...
# ✅ Program deployed: [PROGRAM_ID]
# 🎯 Program supports: SOL, USDC
```

### Step 3: Configure Mobile App

#### 3.1 Install Dependencies
```bash
cd airchainpay-wallet
npm install @solana/spl-token @solana/spl-memo buffer
```

#### 3.2 Update Contract Addresses
Edit `src/constants/AppConfig.ts`:
```typescript
export const SUPPORTED_CHAINS: Record<string, ChainConfig> = {
  base_sepolia: {
    // ... existing config
    contractAddress: '0x[DEPLOYED_TOKEN_CONTRACT_ADDRESS]',
  },
  core_testnet: {
    // ... existing config  
    contractAddress: '0x[DEPLOYED_TOKEN_CONTRACT_ADDRESS]',
  },
  solana_devnet: {
    // ... existing config
    contractAddress: '[DEPLOYED_PROGRAM_ID]',
  },
};
```

#### 3.3 Build Mobile App
```bash
# For development
npm run start

# For production build
npm run build:android  # or build:ios
```

## 🪙 Token Configurations

### Base Sepolia Tokens
```typescript
const BASE_SEPOLIA_TOKENS = [
  {
    symbol: 'ETH',
    address: '0x0000000000000000000000000000000000000000', // Native
    decimals: 18,
    isStablecoin: false
  },
  {
    symbol: 'USDC',
    address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia USDC
    decimals: 6,
    isStablecoin: true
  },
  {
    symbol: 'USDT',
    address: '0xf55BEC9cafDbE8730f096Aa55dad6D22d44099Df', // Base Sepolia USDT
    decimals: 6,
    isStablecoin: true
  }
];
```

### Solana Devnet Tokens
```typescript
const SOLANA_DEVNET_TOKENS = [
  {
    symbol: 'SOL',
    address: '0x0000000000000000000000000000000000000000', // Native
    decimals: 9,
    isStablecoin: false
  },
  {
    symbol: 'USDC',
    address: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // USDC Mint
    decimals: 6,
    isStablecoin: true
  }
];
```

## 🔧 Testing & Verification

### Test EVM Contracts
```bash
cd airchainpay-contracts

# Run comprehensive tests
npx hardhat test

# Test specific token functionality
npx hardhat test test/TokenPayments.js
```

### Test Solana Program
```bash
cd airchainpay-solana

# Run program tests
cargo test-sbf
```

### Test Mobile App
```bash
cd airchainpay-wallet

# Run component tests
npm test

# Test token wallet functionality
npm run test:tokens
```

## 📱 Mobile App Features

### Multi-Token Balance View
- **Portfolio Overview**: Total USD value across all chains
- **Chain Separation**: Organized by blockchain
- **Token Categories**: Native tokens vs. Stablecoins
- **Real-time Balances**: Auto-refresh functionality

### Token Transaction Flow
1. **Select Token**: Choose from available tokens
2. **Cross-chain Support**: Automatic chain detection
3. **Offline Signing**: Bluetooth relay for offline environments
4. **Transaction Queue**: Store transactions until connectivity

### Bluetooth Token Relay
```typescript
// Example: Send USDC via Bluetooth
const tokenTransaction = {
  chainId: 'base-sepolia',
  token: 'USDC',
  to: 'recipient_address',
  amount: '10.00',
  paymentReference: 'Coffee payment'
};

await bluetoothManager.relayTokenTransaction(tokenTransaction);
```

## 🌐 Cross-Chain Features

### Unified Token Interface
```typescript
// Send tokens on any supported chain
const result = await tokenWalletManager.sendTokenTransaction(
  'base-sepolia',  // Chain ID
  privateKey,      // Wallet private key
  toAddress,       // Recipient
  '10.50',         // Amount
  tokenInfo,       // Token configuration
  'Payment ref'    // Reference
);
```

### Multi-Chain Balance Aggregation
```typescript
// Get balances across all chains
const allBalances = await Promise.all([
  tokenWalletManager.getTokenBalances('base-sepolia', walletAddress),
  tokenWalletManager.getTokenBalances('core-testnet', walletAddress),
  tokenWalletManager.getTokenBalances('solana-devnet', walletAddress)
]);
```

## 🔒 Security Features

### Enhanced Contract Security
- **ReentrancyGuard**: Protection against reentrancy attacks
- **SafeERC20**: Safe token transfers
- **Access Control**: Owner-only administrative functions
- **Amount Validation**: Min/max limits per token

### Mobile Security
- **Secure Storage**: Private keys in device secure enclave
- **Transaction Validation**: Client-side verification
- **Offline Signing**: Private keys never leave device

## 📊 Monitoring & Analytics

### Contract Events
```solidity
event PaymentProcessed(
    bytes32 indexed paymentId,
    address indexed from,
    address indexed to,
    uint256 amount,
    address token,
    TokenType tokenType,
    string paymentReference
);
```

### Mobile Analytics
- **Transaction History**: Per-token transaction tracking
- **Balance Monitoring**: Real-time balance updates
- **Cross-chain Statistics**: Multi-chain usage metrics

## 🚨 Troubleshooting

### Common Issues

#### Contract Deployment Fails
```bash
# Check network configuration
npx hardhat verify --network base_sepolia [CONTRACT_ADDRESS]

# Verify gas settings
npx hardhat run scripts/check-deployment.js --network base_sepolia
```

#### Solana Program Issues
```bash
# Check program deployment
solana program show [PROGRAM_ID] --url devnet

# Verify SPL token support
spl-token accounts --url devnet
```

#### Mobile App Token Issues
```bash
# Clear token cache
npx expo start --clear

# Reset wallet state
rm -rf node_modules/.cache
```

### Getting Help
- **Documentation**: Check inline code comments
- **Logs**: Enable debug logging in mobile app
- **Community**: Submit issues to GitHub repository

## 🎯 Production Deployment

### Mainnet Considerations
1. **Token Addresses**: Update to mainnet token contracts
2. **Gas Optimization**: Implement gas price strategies
3. **Rate Limiting**: Add transaction rate limits
4. **Monitoring**: Set up contract monitoring
5. **Backup Systems**: Implement recovery mechanisms

### Security Audit
- **Smart Contract Audit**: Professional security review
- **Mobile App Security**: Penetration testing
- **Infrastructure Security**: Server hardening

## 📈 Future Enhancements

### Planned Features
- **Token Swapping**: DEX integration for token exchanges
- **Cross-chain Bridges**: Direct cross-chain transfers
- **DeFi Integration**: Yield farming, lending protocols
- **NFT Support**: Non-fungible token payments
- **Governance Tokens**: DAO participation features

### Advanced Features
- **Layer 2 Support**: Polygon, Arbitrum, Optimism
- **Additional Stablecoins**: DAI, FRAX, LUSD
- **Institutional Features**: Multi-signature wallets
- **Compliance Tools**: KYC/AML integration

---

## 🎉 Congratulations!

You now have a fully functional multi-chain, multi-token payment system supporting:
- ✅ Native tokens (ETH, tCORE, SOL)
- ✅ Stablecoins (USDC, USDT)
- ✅ Cross-chain Bluetooth relay
- ✅ Offline transaction signing
- ✅ Multi-token portfolio display
- ✅ Unified payment interface

The system is ready for testing and can be extended to support additional chains and tokens as needed! 