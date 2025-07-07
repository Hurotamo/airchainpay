#!/bin/bash

: <<'DOC'
# AirChainPay Developer Setup & Usage Guide

Welcome to AirChainPay! This guide will help you get started with the three main components of the repo:
- **Contracts** (airchainpay-contracts): Smart contracts for payments
- **Relay** (airchainpay-relay): Node.js relay server for Bluetooth and HTTP transaction relaying
- **Wallet** (airchainpay-wallet): React Native mobile wallet app

---

## 1. Contracts (airchainpay-contracts)
- **Location:** `airchainpay-contracts/`
- **Purpose:** Solidity smart contracts for multi-chain payments
- **Usage:**
  1. Install dependencies:
     ```bash
     cd airchainpay-contracts
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
  4. Deploy to testnet:
     - Configure `.env` with your RPC URL and private key
     - Deploy:
       ```bash
       npx hardhat run scripts/deploy.js --network base_sepolia
       ```

---

## 2. Relay (airchainpay-relay)
- **Location:** `airchainpay-relay/`
- **Purpose:** Receives signed transactions from wallet (via HTTP/Bluetooth), relays to blockchain
- **Usage:**
  1. Install dependencies:
     ```bash
     cd airchainpay-relay
     npm install
     ```
  2. Configure environment:
     - Copy `env.example.sh` to `.env` and fill in secrets, or use provided scripts for environment setup
     - For advanced setup, see `ENVIRONMENT_SETUP.md` and `PRODUCTION_SETUP.md`
  3. Start the relay server:
     ```bash
     npm start
     # or for development
     npm run dev
     ```
  4. Docker support:
     ```bash
     docker-compose up -d
     ```
  5. Health check:
     ```bash
     curl http://localhost:4000/health
     ```

---

## 3. Wallet (airchainpay-wallet)
- **Location:** `airchainpay-wallet/`
- **Purpose:** React Native app for users to send/receive payments, manage wallets, and interact with relay
- **Usage:**
  1. Install dependencies:
     ```bash
     cd airchainpay-wallet
     npm install
     ```
  2. Start the app:
     ```bash
     npx expo start
     ```
  3. Configure API keys and relay URL:
     - Create a `.env` file in `airchainpay-wallet/` (see README for variables)
  4. Run on device/emulator:
     - Android: `npm run android`
     - iOS: `npm run ios`
     - Web: `npm run web`

---

## Interactions & Flow
- **Wallet** signs and sends transactions to **Relay** (via HTTP/BLE)
- **Relay** verifies and broadcasts to blockchain (using **Contracts**)
- **Contracts** process payments and emit events
- **Wallet** fetches status/history from **Relay** or directly from blockchain

---

## More Info
- See each component's README for advanced usage, environment variables, and troubleshooting.
- For production, follow security and deployment best practices in the relay's `PRODUCTION_SETUP.md`.

Happy building!
DOC

# (You can add setup automation commands below if needed)
