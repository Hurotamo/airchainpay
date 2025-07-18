
 █████╗ ██╗██████╗  ██████╗██╗  ██╗ █████╗ ██╗███╗   ██╗██████╗  █████╗ ██╗   ██╗
██╔══██╗██║██╔══██╗██╔════╝██║  ██║██╔══██╗██║████╗  ██║██╔══██╗██╔══██╗╚██╗ ██╔╝
███████║██║██████╔╝██║     ███████║███████║██║██╔██╗ ██║██████╔╝███████║ ╚████╔╝ 
██╔══██║██║██╔══██╗██║     ██╔══██║██╔══██║██║██║╚██╗██║██╔═══╝ ██╔══██║  ╚██╔╝  
██║  ██║██║██║  ██║╚██████╗██║  ██║██║  ██║██║██║ ╚████║██║     ██║  ██║   ██║   
╚═╝  ╚═╝╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚═╝     ╚═╝  ╚═╝   ╚═╝   
                                                                                 




















                                                                            
![AirChainPay Logo](https://rose-imaginative-lion-87.mypinata.cloud/ipfs/bafybeiaer2oyqh5qpkmtuewgqcbaxjjvrleblkisor37nkib3nhesgency)

# AirChainPay

AirChainPay is a next-generation multi-chain payment platform designed for seamless, secure, and instant transactions both online and offline. Leveraging blockchain technology and Bluetooth connectivity, AirChainPay empowers users to make payments across multiple networks—even in environments with limited or no internet access. The platform is built for interoperability, privacy, and ease of use for merchants and consumers alike.

## Project Structure

- **airchainpay-contracts/** — Smart contracts for Base Sepolia and Core Testnet
- **airchainpay-relay-rust/** — High-performance Rust relay server for Bluetooth and blockchain transaction processing
- **airchainpay-wallet/** — React Native mobile wallet app

## Network Support

- Base Sepolia
- Core Testnet

## Features

### Mobile Wallet
- **Multi-Chain Support**: Base Sepolia and Core Testnet
- **Token Support**: USDC, USDT (native and mock)
- **Bluetooth Payments**: Offline transaction support
- **QR Code Scanning**: For payment addresses
- **Secure key storage** with encrypted wallet data
- **Transaction history** and status tracking

### Smart Contracts
- **Multi-token support**: Native tokens and ERC-20
- **Payment verification**
- **Fee collection**
- **Batch processing**

### Relay Server (Rust)
- **High-Performance Rust Implementation**: Memory-safe, multi-threaded, and optimized for reliability
- **Bluetooth (BLE) Connectivity**: Secure device discovery, authentication, and transaction relay
- **Multi-Worker Transaction Processor**: Parallel transaction handling for high throughput
- **Advanced Middleware**: Modular security, rate limiting, input validation, and centralized error handling
- **Comprehensive Monitoring**: Built-in metrics, health checks, and logging
- **Multi-device and multi-network support**

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

# Mobile Wallet
cd ../../airchainpay-wallet
npm install
```

3. Follow the setup instructions in each project's README for detailed configuration.

## Development

### Smart Contracts
```bash
cd airchainpay-contracts
npx hardhat compile
npx hardhat test
```

### Relay Server (Rust)
```bash
cd airchainpay-relay-rust/airchainpay-relay
cargo run
```

### Mobile Wallet
```bash
cd airchainpay-wallet
npm run start
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 
