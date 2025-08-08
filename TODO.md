### Seedless Onboarding (Instant, safe onboarding)

Implement onboarding with no seed phrase on day 1. Store the wallet seed encrypted with a Data Encryption Key (DEK) that is wrapped by the device keystore and gated by biometrics/passcode. Provide two recovery paths: backup file (passcode-encrypted) and social recovery (M-of-N shards over a Recovery Key).

### Rust core (`airchainpay-wallet-core`)
- [x] Implement real wallet creation in `src/core/wallet/mod.rs` using `FileStorage` + `KeyManager`; initialize balance cache; remove placeholder error.
- [ ] Add crypto deps in `Cargo.toml`: `aes-gcm`, `argon2`, `rand_core`, `zeroize`, `getrandom`, `sha2`, and Shamir split/join crate (e.g., `sharks`).
- [ ] Implement DEK generation: 32-byte random, `OsRng`.
- [ ] Implement AES-256-GCM encrypt/decrypt helpers for seed using DEK.
- [ ] Implement Argon2id KDF derive for backup passcode (configurable m/t/p).
- [ ] Implement Recovery Key (RK) generation (32 bytes) and AES-GCM encrypt/decrypt of seed with RK.
- [ ] Implement Shamir split/join over RK (configurable M-of-N).
- [ ] Define encrypted seed JSON schema serializer/deserializer with versioning: `{ version, wallet_id, cipher, nonce, ciphertext }`.
- [ ] Add zeroization for sensitive buffers using `zeroize` everywhere appropriate.
- [ ] Expand error types in `shared/error.rs` for keywrap, kdf, and serialization failures.
- [ ] FFI in `src/ffi.rs` to expose:
  - [ ] `generate_seed_and_encrypt_with_dek()` → returns encrypted-seed JSON + raw DEK bytes.
  - [ ] `decrypt_seed_with_dek(encrypted_seed_json, dek_bytes)` → raw seed bytes (in-memory only).
  - [ ] `encrypt_seed_with_passcode(encrypted_seed_json, passcode)` → backup JSON.
  - [ ] `decrypt_seed_with_passcode(backup_json, passcode)` → encrypted-seed JSON (re-encrypt with new DEK handled in app layer).
  - [ ] `encrypt_seed_with_rk(encrypted_seed_json)` → `{ recovery_seed_enc, rk_bytes }`.
  - [ ] `split_rk(rk_bytes, m, n)` / `join_rk(shards)`.
  - [ ] Ensure all FFI-returned secrets are zeroized after use by caller guidance.

### iOS native (`ios/AirChainPayWallet`)
- [ ] Create native module `DeviceKeystore` (Swift) with methods:
  - [ ] `storeDEK(alias: "acp.dek.v1", dek: Data)` → Keychain item (`kSecClassGenericPassword`).
  - [ ] `loadDEK(alias)` → `Data` (triggers biometric/passcode each use).
  - [ ] `deleteDEK(alias)`.
- [ ] Use access control: `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` + `SecAccessControlCreateWithFlags(..., [.biometryCurrentSet, .devicePasscode, .privateKeyUsage])`.
- [ ] Ensure biometric prompt appears on every `loadDEK` (no cached auth bypass).
- [ ] Handle missing item and migration path (graceful error codes to JS).
- [ ] Expose RN bridge and add to `AirChainPayWallet-Bridging-Header.h` if required.

### Android native (`android/app`)
- [ ] Create native module `DeviceKeystore` (Kotlin) with methods:
  - [ ] `storeDEK(alias: "acp.dek.v1", dek: ByteArray)` → encrypt with Android Keystore AES-GCM key; persist wrapped blob to app private storage.
  - [ ] `loadDEK(alias)` → decrypt wrapped blob using keystore key; require `BiometricPrompt` per-use.
  - [ ] `deleteDEK(alias)`.
- [ ] Generate AES key in Android Keystore with `KeyGenParameterSpec`:
  - [ ] `setUserAuthenticationRequired(true)`, `setUserAuthenticationParameters(0, AUTH_BIOMETRIC_STRONG)`.
  - [ ] Prefer StrongBox; fallback gracefully if unavailable.
- [ ] Persist wrapped DEK blob under `filesDir/keystore/acp.dek.v1`.
- [ ] Robust error mapping to JS (key permanently invalidated, lockout, no biometrics, etc.).

### React Native app (`airchainpay-wallet`)
- [ ] Create `src/services/KeychainDEK.ts` wrapper for native `DeviceKeystore` with:
  - [ ] `saveDEK(dekBytes: Uint8Array)` / `loadDEK()` / `deleteDEK()`.
- [ ] Create `src/services/BackupService.ts`:
  - [ ] Export backup JSON using passcode (calls FFI `encrypt_seed_with_passcode`).
  - [ ] Import backup JSON with passcode → recover encrypted-seed JSON.
  - [ ] Use RNFS or DocumentPicker to save/load file to iCloud/Drive.
- [ ] Create `src/services/SocialRecoveryService.ts`:
  - [ ] Create RK, encrypt recovery seed blob, split into M-of-N shards (QR or file share).
  - [ ] Join shards, decrypt recovery seed blob.
- [ ] Onboarding flow screens and routing:
  - [ ] `OnboardingCreateWallet` → calls FFI to create seed + DEK encryption; stores encrypted-seed JSON at `wallet/seed.enc.json`; stores DEK via `KeychainDEK.saveDEK`.
  - [ ] `SetupBackup` (passcode) → export backup file; verify by dry-run decrypt (in-memory only).
  - [ ] `SetupSocialRecovery` (optional) → create shards, share/print.
  - [ ] `ImportFromBackup` / `ImportFromShards` flows.
- [ ] Gate all signing in `src/services/BlockchainTransactionService.ts`:
  - [ ] Before signing, call `KeychainDEK.loadDEK()` (triggers biometric) → decrypt seed via FFI → sign → zeroize.
  - [ ] On failure or lockout, surface clear UX and block send.
- [ ] Session spending caps: add simple in-memory session with timeout and per-session spend limit in `AppConfig`.
- [ ] Add constants for storage paths in `src/constants/AppConfig.ts` (e.g., `wallet/seed.enc.json`, `wallet/recovery_seed.enc.json`).

### Data formats (JSON)
- [ ] Encrypted seed (local): `{ version: 1, wallet_id, cipher: "AES-256-GCM", nonce: base64, ciphertext: base64 }`.
- [ ] Backup file: `{ version: 1, wallet_id, kdf: { algo: "argon2id", salt, m, t, p }, cipher: "AES-256-GCM", nonce, ciphertext, created_at }`.
- [ ] Social recovery:
  - [ ] `recovery_seed.enc.json`: same schema as encrypted seed but encrypted with RK.
  - [ ] Shards: `{ version: 1, wallet_id, shard_index, shard_total, shard_bytes }` (binary payload base64).

### Security controls
- [ ] iOS: `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` and `biometryCurrentSet|devicePasscode` required per-use.
- [ ] Android: `setUserAuthenticationRequired(true)` and `AUTH_BIOMETRIC_STRONG` per-use; StrongBox if available.
- [ ] Zeroize all secrets in memory (Rust and JS buffers where possible); never log secrets.
- [ ] Basic rooted/jailbroken device detection. Block sensitive ops or require explicit override with warnings.
- [ ] Rate-limit passcode attempts on import; after N failures, wipe in-app artifacts and require re-onboarding.
- [ ] Enforce "no seed phrase shown" policy in UI and code paths.

### Acceptance criteria (manual)
- [ ] Fresh install → create wallet without seed phrase; first send requires biometric; works offline for UI until sign.
- [ ] App relaunch → sign requires biometric each time; no cached bypass.
- [ ] Device copy of app data on another device cannot sign (DEK is device-bound).
- [ ] Backup-and-restore with passcode fully recovers wallet on a new device.
- [ ] Social recovery with M-of-N shards restores wallet without server help.
- [ ] Clear, human-readable errors for missing biometrics, lockout, and invalid backups.
- [ ] No plaintext secrets written to disk or logs.


