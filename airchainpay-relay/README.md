# AirChainPay Relay Node

This is the relay node for AirChainPay, responsible for receiving signed transactions (via HTTP and, in the future, Bluetooth), broadcasting them to the blockchain, and optionally logging to a database.

## Features
- Node.js + Express server
- Receives signed transactions from wallet apps
- Broadcasts transactions to EVM-compatible blockchains (via ethers.js)
- (Planned) BLE and USSD support
- (Optional) PostgreSQL logging

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```

---

For more, see the main AirChainPay monorepo. 