# AirChainPay Wallet Core TODOs (Alignment & Production Readiness)

- [ ] Implement all stubbed and placeholder methods, including BLE receive_payment, real BLE communication, and any method returning not-implemented errors.
- [ ] Replace all insecure or placeholder cryptographic code (e.g., ripemd160_sha256) with secure, audited implementations. Remove all warnings and TODOs about insecure code.
- [ ] Implement real, secure, platform-specific storage (Keychain for iOS/macOS, Keystore for Android, etc.) and remove in-memory/file-based insecure storage from production paths.
- [ ] Implement biometric authentication (Touch ID, Face ID, Android Biometrics) and secure enclave/TEE support for key storage and signing, or clearly document fallback and risks.
- [ ] Ensure all APIs expected by airchainpay-wallet are present in airchainpay-wallet-core, with matching signatures and types. Implement all wallet management flows (create, import, backup, restore, delete).
- [ ] Implement transaction creation, signing (including sign_ethereum_transaction), and broadcasting for all supported chains (Core Testnet, Base Sepolia).
- [ ] Implement token management: add, remove, list tokens, and ensure compatibility with wallet app expectations.
- [ ] Add comprehensive unit and integration tests for all modules (crypto, storage, BLE, transactions). Add fuzzing and property-based tests for cryptographic and transaction logic.
- [ ] Remove all TODOs, warnings, and insecure/incomplete code comments from the codebase and documentation. Update docs to reflect only production-ready, secure features.
- [ ] Conduct a full security audit (internal or external) of airchainpay-wallet-core and fix all findings before production use.
