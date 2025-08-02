![AirChainPay Logo](https://rose-imaginative-lion-87.mypinata.cloud/ipfs/bafybeiby6qp7p7kkey3lrrp5jhbgqg7rw6agpfcnitjepyinke2xhejboa)

# AirChainPay

AirChainPay is a next-generation multi-chain payment platform for seamless, secure, and instant crypto transactions—online and offline. Leveraging blockchain and Bluetooth, it enables payments across multiple networks, even with limited or no internet. Built for interoperability, privacy, and ease of use for merchants and consumers.

---

## Project Structure

- **airchainpay-contracts/** — Core smart contracts (Solidity) for Base Sepolia and Core Testnet
- **airchainpay-relay-rust/** — High-performance Rust relay server for Bluetooth and blockchain transaction processing
- **airchainpay-wallet-core/** — Secure Rust wallet core handling all cryptographic operations, sensitive data management, and hardware-backed secure storage
- **airchainpay-wallet/** — React Native mobile wallet app (Expo)

---

## Features

### Smart Contracts
- Minimal payment and transfer contracts (Solidity v0.8.x)
- EVM-compatible, designed for offline-signed transactions
- Multi-token support (native and ERC-20)
- Payment verification, fee collection, batch processing

### Relay Server (Rust)
- Multi-chain support (Core Testnet, Base Sepolia,Lisk Sepolia, Morhp Holesky)
- Secure transaction validation and blockchain broadcasting
- Structured logging, metrics, health checks
- Rate limiting, JWT authentication, CORS
- Background task scheduler, data compression, efficient storage
- API endpoints for health, transaction submission, device info, metrics

### Wallet Core (Rust)
- All wallet cryptographic operations (key management, signing, encryption) in Rust for maximum security
- Hardware-backed storage: iOS Keychain, Android Keystore
- Zero memory exposure for private keys and sensitive data
- Multi-chain support: Core Testnet, Base Sepolia, and more
- Secure BLE communication and pairing
- FFI bridge: safe, high-performance APIs to the mobile wallet

### Mobile Wallet (React Native)
- Multi-chain support: Base Sepolia, Core Testnet
- Token support: USDC, USDT (native and mock)
- Bluetooth (BLE) peer-to-peer transfer (offline payments)
- QR code scanning for payment addresses
- Secure key storage with encrypted wallet data (powered by Wallet Core)
- Transaction history and status tracking
- Hybrid secure key storage (Keychain + SecureStore fallback)
- Offline transaction queue
- EVM wallet and signing

---

## Architecture Overview

```
contracts/         # Solidity smart contracts
relay-rust/        # Rust relay server (API, blockchain, BLE)
wallet-core/       # Rust wallet core (crypto, storage, FFI)
wallet/            # React Native mobile wallet (Expo)
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- Yarn or npm
- Rust 1.70+
- React Native development environment
- Android Studio / Xcode

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Hurotamo/airchainpay.git
   cd airchainpay
   ```

2. Install dependencies for each project:
   ```bash
   # Contracts
   cd airchainpay-contracts
   npm install

   # Relay Server (Rust)
   cd ../airchainpay-relay-rust/airchainpay-relay
   cargo build

   # Wallet Core (Rust)
   cd ../../airchainpay-wallet-core
   cargo build --release

   # Mobile Wallet
   cd ../airchainpay-wallet
   npm install
   ```

3. Follow the setup instructions in each subproject's README for detailed configuration.

---

## Usage

### Smart Contracts
```bash
cd airchainpay-contracts
npx hardhat compile
npx hardhat test
# Deployment example:
npx hardhat run scripts/deploy.js --network base_sepolia
```

### Relay Server (Rust)
```bash
cd airchainpay-relay-rust/airchainpay-relay
cp env.example.sh .env  # Edit .env as needed
cargo run                # Development
RUST_ENV=production cargo run --release  # Production
```

### Wallet Core (Rust)
```bash
cd airchainpay-wallet-core
cargo build --release
cargo test
```

### Mobile Wallet
```bash
cd airchainpay-wallet
npm run start
# For Android/iOS/web, use Expo CLI options
```

---

## Configuration & Environment

- Each subproject may require its own `.env` file (see examples in each directory)
- Set up blockchain RPC URLs, API keys, and relay server URLs as needed
- Never commit secrets or API keys to git

---

## Security
- All cryptographic operations and sensitive data management are handled in Rust (Wallet Core)
- Hardware-backed secure storage (Keychain/Keystore)
- Secure BLE communication and device pairing
- Input validation, JWT authentication, rate limiting, CORS, and API key support in the relay server
- Smart contracts designed for offline-signed transactions and multi-token support

---

## Monitoring & Performance
- Structured logging and Prometheus metrics (Relay Server)
- Health checks and system metrics
- High throughput: ~1000 TPS, <50MB RAM, <2s startup (Relay Server)
- Predictable, low-latency cryptographic operations (Wallet Core)

---

## Contributing
1. Fork & branch
2. Make changes & add tests
3. Submit a pull request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 
