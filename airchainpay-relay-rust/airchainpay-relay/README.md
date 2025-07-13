# AirChainPay Relay Server (Rust)

A high-performance, memory-safe implementation of the AirChainPay relay server written in Rust. This server handles BLE device communication, transaction processing, and blockchain broadcasting for the AirChainPay ecosystem.

## Features

### Core Components
- **Configuration Management**: Environment-specific configuration with validation
- **BLE Device Management**: Comprehensive Bluetooth Low Energy device handling
- **Transaction Processing**: Secure transaction validation and blockchain broadcasting
- **Blockchain Integration**: Multi-chain support with provider management
- **Security Middleware**: Input validation, rate limiting, and authentication
- **Logging System**: Structured logging with different levels
- **Payload Compression**: Data compression for BLE transfers
- **Scheduler System**: Background task management
- **Storage Management**: Transaction and device data persistence

### Supported Networks
- **Core Testnet 2** (Chain ID: 1114) - Primary network
- **Base Sepolia Testnet** (Chain ID: 84532) - Secondary network

## Architecture

```
src/
├── main.rs                 # Application entry point
├── config.rs              # Configuration management
├── logger.rs              # Structured logging
├── api/
│   └── mod.rs            # REST API endpoints
├── ble/
│   ├── mod.rs            # BLE module exports
│   └── manager.rs        # BLE device management
├── blockchain.rs         # Blockchain integration
├── storage.rs            # Data persistence
├── auth.rs              # Authentication system
├── security.rs          # Security middleware
├── processors/
│   └── transaction_processor.rs  # Transaction processing
├── validators/
│   └── transaction_validator.rs  # Transaction validation
├── utils/
│   └── payload_compressor.rs    # Data compression
├── scheduler.rs          # Background task scheduling
└── abi/
    └── AirChainPay.json # Smart contract ABI
```

## Prerequisites

- Rust 1.70+ (stable)
- Bluetooth adapter with BLE support
- Network access for blockchain RPC endpoints

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd airchainpay-relay-rust/airchainpa-relay
   ```

2. **Install dependencies**:
   ```bash
   cargo build
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

## Configuration

Create a `.env` file with the following variables:

```env
# Environment
RUST_ENV=development  # development, staging, production

# Server Configuration
PORT=4000
LOG_LEVEL=info

# Core Testnet 2 Configuration (Primary)
RPC_URL=https://rpc.test2.btcs.network
CHAIN_ID=1114
CONTRACT_ADDRESS=your_contract_address_here

# Core Testnet 2 Environment Variables
CORE_TESTNET2_RPC_URL=https://rpc.test2.btcs.network
CORE_TESTNET2_CONTRACT_ADDRESS=your_contract_address_here
CORE_TESTNET2_BLOCK_EXPLORER=https://scan.test2.btcs.network
CORE_TESTNET2_CURRENCY_SYMBOL=TCORE2

# Base Sepolia Configuration (Secondary)
BASE_SEPOLIA_RPC_URL=https://base-sepolia.drpc.org
BASE_SEPOLIA_CONTRACT_ADDRESS=your_contract_address_here
BASE_SEPOLIA_BLOCK_EXPLORER=https://sepolia.basescan.org
BASE_SEPOLIA_CURRENCY_SYMBOL=ETH

# Security
API_KEY=your_api_key_here
JWT_SECRET=your_jwt_secret_here

# CORS
CORS_ORIGINS=*

# Rate Limiting
RATE_LIMIT_MAX=1000

# Features
DEBUG=true
ENABLE_SWAGGER=true
ENABLE_METRICS=true
ENABLE_HEALTH_CHECKS=true
```

## Usage

### Development Mode
```bash
cargo run
```

### Production Mode
```bash
RUST_ENV=production cargo run --release
```

### Docker
```bash
docker build -t airchainpay-relay-rust .
docker run -p 4000:4000 airchainpay-relay-rust
```

## API Endpoints

### Health Check
```http
GET /health
```

### BLE Operations
```http
GET /ble_scan
POST /auth
```

### Transaction Operations
```http
POST /send_tx
GET /transactions
```

### System Information
```http
GET /metrics
GET /devices
```

## BLE Device Management

The relay server automatically:
- Scans for AirChainPay BLE devices
- Manages device connections and authentication
- Processes transactions received via BLE
- Maintains device status and metrics

### Device Authentication Flow
1. Device connects via BLE
2. Server generates authentication challenge
3. Device signs challenge with private key
4. Server verifies signature and issues JWT token
5. Device can now send transactions

## Transaction Processing

### Transaction Flow
1. **Receive**: Transaction received via BLE or HTTP
2. **Validate**: Format, signature, and chain-specific validation
3. **Process**: Queue for blockchain broadcasting
4. **Broadcast**: Send to appropriate blockchain network
5. **Confirm**: Monitor transaction status and confirmations

### Supported Transaction Types
- Standard ETH transfers
- ERC-20 token transfers
- Contract interactions (AirChainPay contract)

## Security Features

### Input Validation
- Transaction format validation
- Signature verification
- Chain ID validation
- Gas limit validation

### Rate Limiting
- Per-device rate limiting
- Per-IP rate limiting
- Configurable limits and windows

### Authentication
- JWT-based authentication
- Device-specific tokens
- Challenge-response authentication

## Monitoring and Metrics

### Built-in Metrics
- Transaction counts (received, processed, failed)
- BLE device statistics
- Blockchain connection health
- System performance metrics

### Health Checks
- BLE adapter status
- Blockchain RPC connectivity
- Storage system health
- Background task status

## Background Tasks

The scheduler runs the following tasks:

- **Device Cleanup** (5 min): Remove old disconnected devices
- **Transaction Retry** (1 min): Retry failed transactions
- **Blockchain Health Check** (2 min): Verify RPC connections
- **Metrics Collection** (30 sec): Collect system metrics
- **Storage Cleanup** (10 min): Clean old data

## Development

### Running Tests
```bash
cargo test
```

### Code Formatting
```bash
cargo fmt
```

### Linting
```bash
cargo clippy
```

### Building for Production
```bash
cargo build --release
```

## Performance

### Optimizations
- Async/await for non-blocking I/O
- Connection pooling for blockchain RPC
- Efficient BLE scanning with filters
- Compressed payload transmission
- Memory-efficient data structures

### Benchmarks
- Transaction processing: ~1000 TPS
- BLE device handling: 100+ concurrent devices
- Memory usage: <50MB typical
- Startup time: <2 seconds

## Troubleshooting

### Common Issues

1. **BLE Adapter Not Found**
   - Ensure Bluetooth is enabled
   - Check system permissions
   - Verify adapter supports BLE

2. **Blockchain Connection Failed**
   - Check RPC URL configuration
   - Verify network connectivity
   - Check rate limits on RPC provider

3. **Transaction Failures**
   - Verify gas limits
   - Check account balance
   - Validate chain ID

### Logs
Logs are written to stdout with structured format:
```
[2024-01-01T12:00:00Z INFO] Transaction processed: 0x1234... on chain 1114
[2024-01-01T12:00:01Z DEBUG] BLE device connected: device_001
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Create an issue on GitHub
- Check the documentation
- Review the Node.js implementation for reference 