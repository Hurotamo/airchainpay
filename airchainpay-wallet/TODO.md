## BLE payment – production-ready TODOs (airchainpay-wallet)

### Protocol and transport
- [x] Define BLE message envelope and types
  - Envelope: `{ type, version, sessionId, nonce, hmac, payload }`
  - Types: `payment_request`, `transaction_confirmation`, `advertiser_confirmation`, `error`
  - Version: `1.0.0` (constant)
  - Acceptance: All BLE sends/receives use the envelope; unknown `version` is rejected; `type` is validated.
  - Implemented:
    - `src/services/transports/BLEEnvelope.ts` with version `1.0.0`, validators, and helpers
    - `src/services/transports/BLETransport.ts` wraps outgoing payment request and parses confirmations via envelope
    - `src/services/BLEPaymentService.ts` uses envelope for send/listen of `payment_request`

- [x] Switch to compressed payloads for BLE
  - Outgoing: use `TransactionBuilder.serializeBLEPayment`
  - Incoming: use `TransactionBuilder.deserializeBLEPayment` with JSON fallback
  - Files: `src/services/transports/BLETransport.ts`, `src/services/BLEReceiverService.ts` (new), `src/utils/TransactionBuilder.ts`
  - Acceptance: Payloads >10KB serialize; compression ratio logged; receiver correctly deserializes.

### Sender flow (scan → connect → send → wait)
- [x] Replace `BLEPaymentScreen` mock send with transport
  - Call `BLETransport.send(request)` instead of `BLEPaymentService.sendPaymentData` and remove mock tx hash
  - Wire UI states: connecting, sending, waiting for confirmation, success/failure
  - File: `src/screens/BLEPaymentScreen.tsx` (`handleConnectDevice`, `handleSendPayment`)
  - Acceptance: UI shows real tx hash from transport; no mock paths remain.

- [x] Ensure `BLETransport` uses envelope + compression
  - Build `payment_request` envelope; send via `BluetoothManager.sendDataToDevice`
  - Wait for `transaction_confirmation` and `advertiser_confirmation` messages; enforce timeouts
  - File: `src/services/transports/BLETransport.ts`
  - Acceptance: Transport returns `confirmed` only after receiving confirmations; timeouts surface as errors.

### Receiver flow (advertise → accept → execute → confirm)
- [ ] Implement receiver service to process incoming payment requests
  - New: `src/services/BLEReceiverService.ts`
  - Responsibilities:
    - On advertising start, begin listening with `BluetoothManager.listenForData`
    - Reassemble/chunk (see MTU task), decode base64 → decompress or JSON fallback → envelope validation
    - Validate request fields; reject invalid
    - If online: sign and broadcast (native/token) using `MultiChainWalletManager`/`TransactionService` or `ContractService`
    - If offline: queue with `TxQueue`, return `status: queued`
    - Send back `transaction_confirmation` with `{ transactionHash, confirmed }`
    - Optionally start receiver advertising and then send `advertiser_confirmation { advertising: true }`
  - Acceptance: Advertiser device receives a valid request, executes path (online/offline), and replies over BLE.

- [ ] Integrate receiver service with advertising lifecycle
  - On `BLEPaymentService.startAdvertising(...)` success, attach listener; on `stopAdvertising`, detach
  - Files: `src/services/BLEPaymentService.ts`, `src/bluetooth/BluetoothManager.ts`
  - Acceptance: No orphan listeners; lifecycle cleanup verified.

### Security (mandatory)
- [x] Integrate `BLESecurity` key exchange and session
  - On connect: run `initiateKeyExchange` → process response → confirm; store `sessionId`
  - Encrypt outgoing `payload` and HMAC; decrypt incoming; include `sessionId`, `nonce`
  - Files: `src/services/transports/BLETransport.ts`, `src/services/BLEReceiverService.ts`, `src/utils/crypto/BLESecurity.ts`
  - Acceptance: Messages without valid HMAC/session are rejected; replay attempts (reused `nonce`) are rejected.

- [x] Replay/window protections and session cleanup
  - Maintain monotonic `nonce` per `sessionId`; expire sessions after inactivity (configurable)
  - Files: `src/utils/crypto/BLESecurity.ts` (reuse), call cleanup on disconnect/timeout
  - Acceptance: Sessions auto-expire; stale sessions cannot decrypt.

### BLE transport specifics
- [x] MTU-aware chunking and reassembly for characteristic writes
  - Add `sendLargeDataToDevice(deviceId, serviceUUID, characteristicUUID, base64Data)` and `listenForChunks(...)`
  - Chunk size target: <= 180 bytes payload per write (tune per platform)
  - File: `src/bluetooth/BluetoothManager.ts`
  - Acceptance: Large (>4KB) messages reliably transmit and reassemble; back-to-back messages do not interleave.

- [x] Robust timeouts/retries and error taxonomy
  - Timeouts: connect, write, read, confirmation; configurable constants
  - Retries: exponential backoff for connect/write; no infinite loops
  - Standardize error codes (e.g., `BLE_NOT_AVAILABLE`, `DEVICE_NOT_CONNECTED`, `LISTEN_TIMEOUT`, `DECRYPT_FAILED`)
  - Files: `src/bluetooth/BluetoothManager.ts`, `src/services/transports/BLETransport.ts`
  - Acceptance: All errors propagate with stable codes; UI maps to actionable messages.

### Platform coverage
- [x] iOS advertising strategy
  - Option B: disable advertising on iOS; support only scanning/central; show UI message
  - Files: `src/bluetooth/BluetoothManager.ts`, `src/screens/BLEPaymentScreen.tsx`
  - Acceptance: No misleading advertising UI on unsupported platforms; QA verified on both OSes.

- [x] Permissions hardening (Android)
  - Enforce `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `BLUETOOTH_ADVERTISE` with settings redirect when `never_ask_again`
  - File: `src/bluetooth/BluetoothManager.ts` (`requestAllPermissions`, `hasCriticalPermissions`)
  - Acceptance: Permission denials surfaced; UI prompts and settings redirect path working.

### On-chain execution
- [x] Online execution path
  - Native: sign/send via `MultiChainWalletManager`; Token: `ContractService.executeTokenMetaTransaction` or standard ERC20 transfer
  - Confirmations: poll provider or listen for receipt; include `blockExplorerUrl`
  - Files: `src/services/TransactionService.ts`, `src/services/ContractService.ts`, `src/services/BLEReceiverService.ts`
  - Acceptance: Returns real `transactionHash`; failures include reason.

- [x] Offline queue path
  - Validate with `offlineSecurityService.performOfflineSecurityCheck`
  - Queue in `TxQueue` with signed tx; update offline balance tracking
  - Files: `src/services/transports/BLETransport.ts` (already queues), `src/services/BLEReceiverService.ts`
  - Acceptance: Sender receives `queued`; item appears in queue; processes when online.

### UI/UX
- [x] Replace mock receipt and wire real statuses
  - Remove local `mockTransaction`; render states based on transport result
  - File: `src/screens/BLEPaymentScreen.tsx`
  - Acceptance: Hash is real; explorer link available; errors visible.

- [x] Advertising UI gating and status
  - Show supported tokens from `SUPPORTED_TOKENS`; disable on unsupported platforms; show countdown/auto-stop
  - File: `src/screens/BLEPaymentScreen.tsx`
  - Acceptance: Accurate status text; stop works reliably; auto-stop after timeout.

### Observability
- [x] Structured logs and metrics
  - Use `logger` with fields: `deviceId`, `sessionId`, `type`, `size`, `durationMs`
  - Leverage `BLEAdvertisingMonitor` for sessions; expose a simple report screen/log dump
  - Files: `src/bluetooth/BLEAdvertisingMonitor.ts`, call sites in transport/receiver
  - Acceptance: Monitor shows session counts, error rates; logs enable debugging failed sessions.

### Testing and QA
- [ ] Unit tests
  - `TransactionBuilder` compression/decompression round-trips
  - `BLESecurity` key exchange, encrypt/decrypt, HMAC/replay rejection
  - Files: `__tests__/TransactionBuilder.test.ts`, `__tests__/BLESecurity.test.ts`
  - Acceptance: Tests pass locally/CI.

- [ ] Integration tests (mocked BLE)
  - Abstract `BluetoothManager` behind an interface; provide a mock for Jest to simulate chunking and callbacks
  - Files: `src/bluetooth/BluetoothManager.ts` (interface extraction), `__mocks__/BluetoothManager.ts`
  - Acceptance: End-to-end send/receive path passes in CI.

- [ ] Device QA matrix
  - Android: 2 devices, Android 11–14; iOS: 1 device if supported
  - Scenarios: online/native, online/token, offline queue, permission denied, BT off, large payload (>8KB)
  - Acceptance: All pass with logs captured.

### Hardening and cleanup
- [ ] Feature flag
  - Gate BLE payment behind a remote or local flag; safe rollout
  - Files: `src/constants/AppConfig.ts`, usage in screen
  - Acceptance: Can disable feature without shipping a new build.

- [ ] Documentation
  - Update `README.md` with BLE capabilities, limitations, and privacy notes
  - Add developer runbook for testing with two devices
  - Acceptance: Docs up to date; new dev can follow and validate.

### Explicit file edits summary
- [ ] `src/screens/BLEPaymentScreen.tsx`: remove mock, call `BLETransport.send`, add real status handling
- [ ] `src/services/transports/BLETransport.ts`: envelope, compression, encryption, timeouts, retries, confirmations
- [ ] `src/services/BLEPaymentService.ts`: integrate receiver lifecycle hooks or delegate to receiver service
- [ ] `src/services/BLEReceiverService.ts` (new): implement receive/execute/confirm flow
- [ ] `src/bluetooth/BluetoothManager.ts`: add chunking APIs; robust error codes; lifecycle cleanup
- [ ] `src/utils/crypto/BLESecurity.ts`: wire into transport/receiver; session management
- [ ] Tests: add unit/integration as above; add mocks


