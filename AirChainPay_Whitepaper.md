# AirChainPay Whitepaper

## Executive Summary
AirChainPay is an innovative offline crypto payment system enabling secure, peer-to-peer transactions using Bluetooth Low Energy (BLE) and blockchain technology. The platform consists of EVM-compatible smart contracts, a high-performance relay server, and a cross-platform mobile wallet. AirChainPay empowers users to transact crypto assets even in environments with limited or no internet connectivity, bridging the gap between digital assets and real-world usability.

## Problem Statement & Motivation
Despite the growth of blockchain and digital assets, real-world adoption is hindered by the need for constant internet connectivity and complex user experiences. AirChainPay addresses these challenges by:
- Enabling offline crypto payments via BLE
- Providing secure, user-friendly mobile wallets
- Supporting multi-chain and multi-transport operations
- Ensuring robust security and privacy

## System Overview & Architecture
AirChainPay is composed of three main components:
1. **Smart Contracts**: Minimal, EVM-compatible contracts for payment and transfer, designed for offline-signed transactions.
2. **Relay Server (Rust)**: A memory-safe, high-performance server that manages BLE device communication, transaction validation, and blockchain broadcasting.
3. **Mobile Wallet (React Native)**: A cross-platform wallet supporting BLE, QR, and on-chain payments, with secure key storage and offline transaction queuing.

### High-Level Architecture
- **User** interacts with the **Mobile Wallet**
- Wallet communicates with other devices via BLE or QR, or directly with the blockchain
- **Relay Server** acts as a bridge, validating and broadcasting transactions to supported blockchains
- **Smart Contracts** enforce payment logic and asset transfers on-chain

## Component Deep Dives

### 1. Smart Contracts
- Written in Solidity (v0.8.x), EVM-compatible
- Minimal payment and transfer logic
- Designed for offline-signed transactions
- Deployed on networks like Base Sepolia and Core Testnet 2

### 2. Relay Server (Rust)
- BLE device management and authentication
- Transaction validation and blockchain broadcasting
- Multi-chain support (e.g., Core Testnet 2, Base Sepolia)
- Security middleware: input validation, rate limiting, JWT authentication
- Structured logging, metrics, and background task scheduling
- Data persistence for transactions and device states

### 3. Mobile Wallet (React Native)
- BLE peer-to-peer transfer (react-native-ble-plx)
- Secure key storage (expo-secure-store)
- Offline transaction queue (expo-sqlite)
- EVM wallet and signing (ethers.js)
- Multi-transport: BLE, QR, on-chain
- Modular architecture: presentation, business logic, data, infrastructure layers
- Cryptographic security for wallet and BLE communication

## Security & Innovation
- **Cryptographic Security**: End-to-end encryption for wallet data and BLE payloads
- **Authentication**: Challenge-response and JWT-based device authentication
- **Input Validation**: Strict transaction and device validation
- **Rate Limiting**: Per-device and per-IP controls
- **Secure Storage**: Encrypted local storage for keys and sensitive data
- **Offline Capability**: Transactions can be queued and signed offline, then broadcast when connectivity is restored

## Use Cases
- **Retail Payments**: Offline crypto payments at physical stores
- **Remittances**: Peer-to-peer transfers in low-connectivity regions
- **Event Ticketing**: Secure, offline ticket validation and transfer
- **Aid Distribution**: Crypto disbursement in disaster zones or remote areas

## Roadmap & Future Work
- Expand multi-chain support (additional EVM and non-EVM chains)
- Integrate NFC and additional offline transports
- Enhance privacy features (e.g., zero-knowledge proofs)
- Open API for third-party integrations
- Community governance and tokenomics

## Conclusion
AirChainPay bridges the gap between blockchain technology and real-world usability by enabling secure, offline crypto payments. Its modular, secure, and extensible architecture positions it as a leading solution for next-generation digital asset payments. 