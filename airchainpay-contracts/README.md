# AirChainPay Contracts

This repository contains the core smart contracts for the AirChainPay offline crypto payment system.

## Features
- Minimal payment and transfer contract
- EVM-compatible (Solidity v0.8.x)
- Designed for offline-signed transactions

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

## Deployment to Base Sepolia
1. Create a `.env` file in this directory:
   ```env
   BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
   PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
   ETHERSCAN_API_KEY=YOUR_ETHERSCAN_OR_BLOCKSCOUT_API_KEY
   ```
2. Deploy to Base Sepolia:
   ```bash
   npx hardhat run scripts/deploy.js --network base_sepolia
   ```

---

For more, see the main [AirChainPay Monorepo](../README.md). 