# AirChainPay

AirChainPay is an offline-first crypto payment system enabling secure peer-to-peer payments using Bluetooth (BLE) and EVM-compatible blockchains. It allows users to sign and queue transactions offline, then relay them to the blockchain when connectivity is restored.

[![AirChainPay CI/CD](https://github.com/Hurotamo/AirChainPay/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/Hurotamo/AirChainPay/actions/workflows/ci-cd.yml)

## Architecture

- **airchainpay-contracts/** — Solidity smart contracts for payments/transfers
- **airchainpay-wallet/** — React Native (Expo) mobile wallet app
- **airchainpay-relay/** — Node.js relay server for broadcasting transactions

```
[User Wallet] <---Bluetooth---> [Relay Node] <---Internet---> [Blockchain]
```

---

## Features
- Offline transaction signing and queueing
- Bluetooth (BLE) peer-to-peer transfer
- USSD transaction submission (for feature phones)
- Secure key storage (Expo SecureStore)
- EVM wallet and signing (ethers.js)
- Relay server for broadcasting signed transactions
- Minimal, auditable Solidity contract
- Comprehensive logging and error handling
- JWT authentication for API endpoints
- Rate limiting to prevent abuse

---

## Setup Instructions

### 1. Contracts
- Location: `airchainpay-contracts/`
- Install dependencies:
  ```bash
  cd airchainpay-contracts
  npm install
  ```
- Compile contracts:
  ```bash
  npx hardhat compile
  ```
- Run tests:
  ```bash
  npx hardhat test
  ```
- Deploy (example for Base Sepolia):
  1. Create `.env` with RPC URL, private key, and API key (see subproject README).
  2. Deploy:
     ```bash
     npx hardhat run scripts/deploy.js --network base_sepolia
     ```

### 2. Relay Server
- Location: `airchainpay-relay/`
- Install dependencies:
  ```bash
  cd airchainpay-relay
  npm install
  ```
- Configure environment:
  ```bash
  cp .env.sample .env
  # Edit .env with your settings
  ```
- Start the server:
  ```bash
  node src/server.js
  ```
- Using Docker:
  ```bash
  docker-compose up -d
  ```
- The server exposes HTTP endpoints for health, transaction relay, and contract event queries.

### 3. Wallet App
- Location: `airchainpay-wallet/`
- Install dependencies:
  ```bash
  cd airchainpay-wallet
  npm install
  ```
- Start the app (Expo):
  ```bash
  npx expo start
  ```
- On Android, Bluetooth and location permissions are requested at runtime.

---

## Usage Flow

1. **User creates and signs a transaction in the wallet app.**
2. **If offline, the transaction is queued locally (SQLite).**
3. **When Bluetooth is available, the signed transaction is sent to a relay node or another device.**
4. **The relay node receives the signed transaction and broadcasts it to the blockchain when online.**
5. **Transaction status and events can be queried via the relay server.**

---

## API Documentation

### Relay Server Endpoints

#### Authentication
- `POST /auth/token` - Generate an authentication token
  - Request: `{ "apiKey": "your_api_key" }`
  - Response: `{ "token": "jwt_token" }`

#### Transactions
- `POST /tx` - Submit a signed transaction for relay
  - Headers: `Authorization: Bearer your_jwt_token`
  - Request: `{ "signedTx": "0x..." }`
  - Response: `{ "status": "broadcasted", "txHash": "0x..." }`

#### USSD Integration
- `POST /ussd` - Receive transactions via USSD
  - Request: `{ "sessionId": "...", "serviceCode": "*123#", "phoneNumber": "+1234567890", "text": "*CODE*TXHASH*SIGNATURE" }`
  - Response: Text response for USSD session

#### Contract Events
- `GET /contract/payments` - Get recent payment events
  - Response: `{ "payments": [...] }`

#### System
- `GET /health` - Server health check
  - Response: `{ "status": "ok", "version": "1.0.0" }`

---

## Bluetooth & Offline Queueing
- The wallet app uses BLE (react-native-ble-plx) for device discovery and data transfer.
- Transactions are stored locally until they can be relayed.
- The relay server is designed for future BLE/USSD integration.

---

## Security Considerations

- **Private Key Management**: Private keys never leave the device and are stored in SecureStore.
- **API Security**: JWT authentication and rate limiting protect relay server endpoints.
- **Transaction Validation**: All transactions are validated before broadcasting.
- **Error Handling**: Comprehensive error handling prevents unexpected behavior.
- **Logging**: Structured logging with rotation helps with debugging and auditing.

---

## Development Notes
- Each subproject contains a more detailed README:
  - [Contracts](airchainpay-contracts/README.md)
  - [Relay Node](airchainpay-relay/README.md)
  - [Wallet App](airchainpay-wallet/README.md)
- Code is commented for clarity. See each file for inline documentation.

---

## Deployment

### Relay Server Deployment
The relay server can be deployed using Docker:

```bash
cd airchainpay-relay
docker build -t airchainpay-relay .
docker run -p 4000:4000 --env-file .env airchainpay-relay
```

For production deployment, consider using:
- AWS ECS or Fargate
- Google Cloud Run
- Azure Container Instances
- Kubernetes

### Mobile App Deployment
For mobile app deployment, use Expo EAS:

```bash
cd airchainpay-wallet
npx eas build --platform android
npx eas build --platform ios
```

---

## Troubleshooting
- Ensure you run each component from its own directory.
- For missing modules or build errors, run `npm install` in the relevant subproject.
- For BLE issues, check device permissions and compatibility.
- Check logs in `airchainpay-relay/logs/` and using the Logger in the mobile app.
- For USSD issues, verify the format: `*CODE*TXHASH*SIGNATURE#`

---

## License
MIT 