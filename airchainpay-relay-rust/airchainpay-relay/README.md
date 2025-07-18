


# AirChainPay Relay Server (Rust)

A high-performance, memory-safe relay server for the AirChainPay ecosystem. Handles HTTP/API transaction processing and blockchain broadcasting.

---

## 🚀 Getting Started

1. **Install Rust** ([rustup](https://rustup.rs/)):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   # Restart your terminal after install
   rustc --version  # Should be 1.70 or higher
   ```
2. **Clone the repository**:
   ```bash
   git clone https://github.com/Hurotamo/airchainpay.git
   cd airchainpay-relay-rust/airchainpay-relay
   ```
3. **Build the project**:
   ```bash
   cargo build
   ```
4. **Set up environment variables**:
   ```bash
   cp env.example.sh .env
   # Edit .env with your configuration
   ```
5. **Run the relay**:
   - Development: `cargo run`
   - Production: `RUST_ENV=production cargo run --release`

---

## 🏗️ Architecture

```
src/
├── main.rs            # Application entry point
├── lib.rs             # Library entry point (shared logic)
├── api/               # HTTP API endpoints and handlers
│   ├── mod.rs
│   └── handlers/
├── app/               # Application logic (scheduler, services)
├── infrastructure/    # Blockchain, storage, config, logging, monitoring
├── domain/            # Domain logic (auth, error, security, models)
├── middleware/        # Middleware (error handling, security, rate limiting, metrics)
├── processors/        # Transaction and other processors
├── scripts/           # Internal scripts
├── utils/             # Utilities (audit, backup, cache, compression, etc.)
├── validators/        # Input and transaction validators
├── bin/               # Binary entry points (e.g., for key generation)
├── proto/             # Protobuf definitions
├── abi/               # Smart contract ABIs
└── ...
```

---

## ⚙️ Configuration

Create a `.env` file (see `env.example.sh`) with variables like:
```env
RUST_ENV=development
PORT=4000
LOG_LEVEL=info
RPC_URL=...
CHAIN_ID=...
CONTRACT_ADDRESS=...
API_KEY=...
JWT_SECRET=...
CORS_ORIGINS=*
RATE_LIMIT_MAX=1000
DEBUG=true
ENABLE_SWAGGER=true
ENABLE_METRICS=true
ENABLE_HEALTH_CHECKS=true
```

---

## ▶️ Usage

- **Development:**
  ```bash
  cargo run
  ```
- **Production:**
  ```bash
  RUST_ENV=production cargo run --release
  ```
- **Docker:**
  ```bash
  docker build -t airchainpay-relay-rust .
  docker run -p 4000:4000 airchainpay-relay-rust
  ```

---

## ✨ Features
- Multi-chain support (Core Testnet 2, Base Sepolia)
- Secure transaction validation and broadcasting
- Structured logging, metrics, and health checks
- Rate limiting, JWT authentication, CORS
- Background task scheduler
- Data compression and efficient storage

---

## 📚 API Endpoints
- `GET /health` — Health check
- `POST /send_tx` — Submit transaction
- `GET /transactions` — List transactions
- `GET /metrics` — Prometheus metrics
- `GET /devices` — Device info

---

## 🔄 Transaction Processing
1. **Receive**: Transaction via HTTP
2. **Validate**: Format, signature, chain, gas
3. **Process**: Queue for blockchain
4. **Broadcast**: Send to network
5. **Confirm**: Monitor status

Supported: ETH transfers, ERC-20, contract calls

---

## 🛡️ Security
- Input validation (format, signature, chain, gas)
- JWT authentication, device tokens
- Per-device/IP rate limiting
- CORS, API key, environment-based config

---

## 📈 Monitoring & Metrics
- Transaction counts, failures, system metrics
- Blockchain and storage health checks
- Logs to stdout (structured)

---

## 🛠️ Development
- **Test:** `cargo test`
- **Format:** `cargo fmt`
- **Lint:** `cargo clippy`
- **Build:** `cargo build --release`

---

## 🚀 Performance
- Async/non-blocking I/O
- Connection pooling
- Compressed payloads
- ~1000 TPS, <50MB RAM, <2s startup

---

## 🧰 Troubleshooting
- **Connection failed:** Check RPC URL, network, rate limits
- **Tx failures:** Check gas, balance, chain ID
- **Logs:**
  ```
  [2024-01-01T12:00:00Z INFO] Transaction processed: 0x1234... on chain 1114
  ```

---

## 🤝 Contributing
1. Fork & branch
2. Make changes & add tests
3. Submit a pull request

---

## 📄 License
MIT — see LICENSE

---

## 💬 Support
- Open an issue on GitHub
- Check documentation 