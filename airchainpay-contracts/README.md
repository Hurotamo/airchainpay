# AirChainPay Contracts

This repository contains the core smart contracts for the AirChainPay offline crypto payment system.

## Features
- Minimal payment and transfer contract
- EVM-compatible (Solidity v0.8.x)
- Designed for offline-signed transactions
- Multi-chain support (Base Sepolia, Core Testnet, Lisk Sepolia Testnet, Ethereum Holesky)

## Structure
- `contracts/` — Solidity source files
- `test/` — Contract tests (JavaScript/TypeScript)
- `scripts/` — Deployment and utility scripts

## Getting Started
1. Install dependencies:
   ```bash
   npm install
   ```
2. Compile contracts:
   ```bash
   npx hardhat compile
   ```
3. Run tests:
   ```bash
   npx hardhat test
   ```

## Environment Configuration
Create a `.env` file in this directory with the following structure:

```env
# Private Key (required for all networks)
PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE

# Base Sepolia Testnet
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASESCAN_API_KEY=YOUR_BASESCAN_API_KEY

# Core Testnet
CORE_TESTNET_RPC_URL=https://rpc.test2.btcs.network
CORE_SCAN_API_KEY=YOUR_CORE_SCAN_API_KEY

# Lisk Sepolia Testnet
LISK_SEPOLIA_RPC_URL=https://rpc.sepolia-api.lisk.com
LISK_SCAN_API_KEY=YOUR_LISK_SCAN_API_KEY

# Ethereum Holesky Testnet
HOLESKY_RPC_URL=https://ethereum-holesky-rpc.publicnode.com/
HOLESKY_SCAN_API_KEY=YOUR_HOLESKY_SCAN_API_KEY

# Core Mainnet (for future use)
CORE_MAINNET_RPC_URL=https://rpc.coredao.org

# Fallback API keys
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_API_KEY
```

## Deployment

### Deploy to All Networks
```bash
npx hardhat run scripts/deploy-multichain.js
```

### Deploy to Specific Network
```bash
# Base Sepolia
npx hardhat run scripts/deploy-multichain.js base_sepolia

# Core Testnet
npx hardhat run scripts/deploy-multichain.js core_testnet

# Lisk Sepolia Testnet
npx hardhat run scripts/deploy-multichain.js lisk_sepolia

# Ethereum Holesky Testnet
npx hardhat run scripts/deploy-multichain.js holesky
```

### Deploy to Individual Networks
```bash
# Base Sepolia
npx hardhat run scripts/deploy-base-sepolia.js --network base_sepolia

# Core Testnet
npx hardhat run scripts/deploy-core-testnet.js --network core_testnet

# Lisk Sepolia Testnet
npx hardhat run scripts/deploy-lisk-sepolia.js --network lisk_sepolia

# Ethereum Holesky Testnet
npx hardhat run scripts/deploy-holesky.js --network holesky
```

### Verify Contracts
```bash
# Verify on Base Sepolia
npx hardhat run scripts/verify-base-sepolia.js --network base_sepolia

# Verify on Core Testnet
npx hardhat run scripts/verify-core-testnet.js --network core_testnet

# Verify on Lisk Sepolia
npx hardhat run scripts/verify-lisk-sepolia.js --network lisk_sepolia

# Verify on Ethereum Holesky
npx hardhat run scripts/verify-holesky.js --network holesky

# Verify all deployments
npx hardhat run scripts/verify-deployments.js
```

### Check Deployment Status
```bash
# Check Base Sepolia
npx hardhat run scripts/check-base-sepolia.js --network base_sepolia

# Check Core Testnet
npx hardhat run scripts/check-core-testnet.js --network core_testnet

# Check Lisk Sepolia
npx hardhat run scripts/check-lisk-sepolia.js --network lisk_sepolia

# Check Ethereum Holesky
npx hardhat run scripts/check-holesky.js --network holesky
```

## Deployed Contract Addresses

| Network | Contract Address |
|---------|------------------|
| Core Testnet | `0xcE2D2A50DaA794c12d079F2E2E2aF656ebB981fF` |
| Base Sepolia | `0x8d7eaB03a72974F5D9F5c99B4e4e1B393DBcfCAB` |
| Ethereum Holesky | `0x26C59cd738Df90604Ebb13Ed8DB76657cfD51f40` |
| Lisk Sepolia | `0xaBEEEc6e6c1f6bfDE1d05db74B28847Ba5b44EAF` |

## Network Information

| Network | Chain ID | RPC URL | Block Explorer | Native Currency |
|---------|----------|---------|----------------|-----------------|
| Base Sepolia | 84532 | https://sepolia.base.org | https://sepolia.basescan.org | ETH |
| Core Testnet | 1114 | https://rpc.test2.btcs.network | https://scan.test2.btcs.network | tCORE2 |
| Lisk Sepolia | 4202 | https://rpc.sepolia-api.lisk.com | https://sepolia.lisk.com | ETH |
| Ethereum Holesky | 17000 | https://ethereum-holesky-rpc.publicnode.com/ | https://holesky.etherscan.io | ETH |

---

For more, see the main [AirChainPay Monorepo](../README.md). 