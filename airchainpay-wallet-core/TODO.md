AirChainPay Wallet Core — Production TODO (No fluff)

1) Implement real wallet creation (no placeholders)
 - DONE
   - `WalletManager::create_wallet` implemented with real `FileStorage` and `KeyManager`.
   - Deterministic `key_id` = `wallet_key_{wallet_id}` used across sign and tx paths.
   - `SecureWallet` inserted into `self.wallets`; balance cache initialized to "0" with correct currency.
   - Removed placeholder error return.

2) Real on-chain balance (Core Testnet 1114, Base Sepolia 84532)
 - DONE
   - Implemented `WalletManager::get_balance` to query RPC by network and update cache.
   - Implemented `wallet_core_get_balance` in `src/ffi.rs` using an internal runtime.
   - Uses env overrides `WALLET_CORE_RPC_CORE_TESTNET` and `WALLET_CORE_RPC_BASE_SEPOLIA` with sensible defaults.
- File: `src/ffi.rs`
  - Replace placeholder in `wallet_core_get_balance`:
    - Resolve network for the wallet (add lookup if needed)
    - Read RPC URL via env keys:
      - `WALLET_CORE_RPC_CORE_TESTNET`
      - `WALLET_CORE_RPC_BASE_SEPOLIA`
    - Query balance via JSON-RPC `eth_getBalance` (or `ethers` provider) and return as decimal string
- File: `src/core/wallet/mod.rs`
  - Add `WalletManager::get_balance` path that queries provider by network and updates the cache.

3) Proper transaction signing and broadcast (no mocks)
- File: `src/core/transactions/mod.rs`
  - `TransactionManager::new`: accept `network: Network` or a resolved RPC URL; store provider
  - `create_transaction`: keep validation; ensure chain_id from `network`
  - `sign_transaction`:
    - Use `SecurePrivateKey::with_key(storage, |key_bytes| ...)` to sign EIP-155/EIP-1559 tx using `core::crypto::signatures::SignatureManager`
    - Produce canonical `r || s || v` with correct `v` per chain id (EIP-155)
    - RLP-encode the signed transaction bytes (use `rlp` or `ethers-core` types) and compute hash `keccak(rlp)`
  - `send_transaction`:
    - Send raw RLP via `eth_sendRawTransaction` (0x-prefixed hex)
  - Remove the manual hash construction and mock concatenation.
- File: `src/core/crypto/signatures/signature_manager.rs`
  - Implement an API to sign Ethereum legacy and EIP-1559 transactions from raw private key bytes and chain id
  - Remove `// Placeholder: Ethereum v value ...`; compute v correctly per EIP-155

4) Remove mocks and test-only scaffolding from production code
- Delete or isolate under `#[cfg(test)]` any in-file mock types like `MockStorage` in:
  - `src/core/storage/mod.rs`
  - `src/core/crypto/keys/secure_private_key.rs`
  - `src/core/crypto/keys/key_manager.rs`
- Replace the mock RPC URL in tests with feature-gated integration tests (or remove tests entirely per project policy)
- Cargo.toml: remove dev-deps not used in production (`mockall`, `tokio-test`, `proptest`, `arbitrary`, `criterion`) if tests are removed.

5) Remove unwrap/expect outside tests
- Replace with proper error propagation. Targets:
  - `src/core/crypto/signatures/mod.rs`: lines with `unwrap()` when calling `sign_*_with_bytes`
  - `src/core/crypto/hashing/hash_manager.rs`: result unwraps in non-test helpers
  - `src/core/crypto/password/password_hasher.rs`: result unwraps; return `WalletError::crypto` / `WalletError::validation`
  - `src/domain/entities/wallet.rs`: unwraps when constructing test wallet — guard under `#[cfg(test)]` or convert to `Result` in non-test paths
  - `src/shared/utils.rs`: replace `expect(...)` usages in non-test code

6) Env/config hardening
- File: `src/lib.rs`
  - Confirm fixed keys (already adjusted):
    - `WALLET_CORE_DEFAULT_NETWORK` in {`core_testnet`, `base_sepolia`}
    - `WALLET_CORE_RPC_CORE_TESTNET`
    - `WALLET_CORE_RPC_BASE_SEPOLIA`
  - Add a small helper to resolve RPC URL by `Network`
  - If missing, return `WalletError::config("RPC URL not set for network")`

7) Feature flags cleanup
- Files: `src/lib.rs`, `src/wasm.rs`, `src/no_std.rs`
  - Keep feature gates but remove `pub use wasm::*` / `pub use no_std::*` until there is public API to export (prevents warnings)
  - Move `#![no_std]` handling into actual no_std build when implemented; drop the attribute from the stub

8) FFI surface consistency and safety
- File: `src/ffi.rs`
  - Ensure all error codes are documented and mapped to `WalletError` kinds
  - Add network parameter where needed (e.g., balance, send) to avoid hardcoded defaults
  - Zeroize/secure-free already present — keep as-is

9) Minimal integration path
- Provide one end-to-end path that works now (no mocks):
  - Create wallet → derive address → fetch on-chain balance → sign tx (RLP, correct v) → broadcast → poll receipt
  - Support exactly Core Testnet (1114) and Base Sepolia (84532)

10) Delete dead code and placeholders
- Search and remove `placeholder` comments and any unused modules
- Ensure no `#[allow(dead_code)]` is added; actually remove unused items

Deliverables checklist
- [x] `WalletManager::create_wallet` implemented and used by `WalletCore::create_wallet`
- [x] Real balance query wired (wallet manager + FFI)
- [ ] EIP-155/1559 signing with RLP and correct `v`
- [ ] Raw tx broadcast via `eth_sendRawTransaction`
- [ ] Mocks removed; dev-deps pruned in Cargo.toml
- [ ] All non-test `unwrap/expect` eliminated
- [ ] Feature warnings removed; no unused re-exports
- [ ] Env keys required documented and enforced at runtime

