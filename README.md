![AirChainPay Logo](https://rose-imaginative-lion-87.mypinata.cloud/ipfs/bafybeiaer2oyqh5qpkmtuewgqcbaxjjvrleblkisor37nkib3nhesgency)

# AirChainPay

AirChainPay is a next-generation multi-chain payment platform designed to enable seamless, secure, and instant transactions both online and offline. By leveraging blockchain technology and Bluetooth connectivity, AirChainPay empowers users to make payments across multiple networks, even in environments with limited or no internet access. The platform is built to support interoperability, privacy, and ease of use for merchants and consumers alike.

## Project Structure

- **airchainpay-contracts/** — Smart contracts for Base Sepolia and Core Testnet
- **airchainpay-relay/** — Bluetooth payment relay server
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

### Relay Server
- **Bluetooth connectivity**
- **Transaction queueing**
- **Payment status tracking**
- **Multi-device support**

## Getting Started

### Prerequisites
- Node.js 18+
- Yarn or npm
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

# Relay Server
cd ../airchainpay-relay
npm install

# Mobile Wallet
cd ../airchainpay-wallet
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

### Relay Server
```bash
cd airchainpay-relay
npm run dev
```

### Mobile Wallet
```bash
cd airchainpay-wallet
npm run start
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 
