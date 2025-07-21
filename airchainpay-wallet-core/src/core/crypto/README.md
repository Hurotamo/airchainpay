# Crypto Module Organization

This directory contains the cryptographic functionality for the AirChainPay wallet core, organized into separate modules for each major class.

## Directory Structure

```
crypto/
├── mod.rs                    # Main module exports
├── keys/                     # Key management classes
│   ├── mod.rs
│   ├── key_manager.rs        # KeyManager class
│   ├── secure_private_key.rs # SecurePrivateKey class
│   └── secure_seed_phrase.rs # SecureSeedPhrase class
├── hashing/                  # Hashing functionality
│   ├── mod.rs
│   ├── hash_manager.rs       # HashManager class
│   └── hash_algorithm.rs     # HashAlgorithm enum
├── signatures/               # Digital signature classes
│   ├── mod.rs
│   ├── signature_manager.rs  # SignatureManager class
│   └── transaction_signature.rs # TransactionSignature class
├── encryption/               # Encryption functionality
│   ├── mod.rs
│   ├── encryption_manager.rs # EncryptionManager class
│   ├── encrypted_data.rs     # EncryptedData class
│   └── encryption_algorithm.rs # EncryptionAlgorithm enum
└── password/                 # Password hashing
    ├── mod.rs
    ├── password_hasher.rs    # PasswordHasher class
    ├── password_config.rs    # PasswordConfig class
    └── password_algorithm.rs # PasswordAlgorithm enum
```

## Cryptographic Flows

### Key Generation and Management
- **KeyManager**: Generates, imports, and manages cryptographic keys using secure random number generation. Keys are validated for correct size and format. Private keys are securely zeroized on drop.
- **SecurePrivateKey**: Wraps private keys, ensures memory safety and zeroization.
- **SecureSeedPhrase**: Handles BIP39 seed phrases, securely zeroized on drop.

### Hashing
- **HashManager**: Provides SHA-256, SHA-512, Keccak256, Keccak512. Used for address derivation, transaction/message hashing, and password hashing.
- **WARNING**: The `ripemd160_sha256` method is a placeholder and does NOT implement true RIPEMD160. Do NOT use for production Bitcoin address generation until replaced with a secure implementation.

### Digital Signatures
- **SignatureManager**: Handles ECDSA (secp256k1) signing and verification for messages and transactions. Used for Ethereum-compatible signatures.
- **TransactionSignature**: Structure for Ethereum transaction signatures.
- **WARNING**: Deprecated signature methods are commented out but present for reference. Do NOT use deprecated or commented code in production.

### Encryption
- **EncryptionManager**: Provides AES-256-GCM and ChaCha20-Poly1305 encryption/decryption for sensitive data. Keys and nonces are generated securely. All cryptographic material is zeroized on drop.

### Password Handling
- **PasswordHasher**: Secure password hashing and verification using Argon2 or PBKDF2. Salt is generated securely. PHC string format is used for PBKDF2.
- **WARNING**: Always use Argon2 for new deployments. PBKDF2 is supported for legacy compatibility only.

## Usage

All classes are exported through the main `crypto` module:

```rust
use crate::crypto::{
    KeyManager, SecurePrivateKey, HashManager, SignatureManager,
    EncryptionManager, PasswordHasher
};
```

## Security Features

- All sensitive data is automatically zeroed when dropped
- Secure random number generation for keys and nonces
- Memory-safe handling of cryptographic materials
- Proper error handling for cryptographic operations

## Security Warnings

- **PLACEHOLDER/INSECURE CODE**: Some methods (e.g., `ripemd160_sha256`) are placeholders and are NOT secure for production. These are clearly marked in code and documentation. Replace with secure, audited implementations before production use.
- **DEPRECATED METHODS**: Deprecated or commented-out cryptographic methods are present for reference only. Do NOT use them in production.
- **ALGORITHM CHOICE**: Always prefer Argon2 for password hashing. PBKDF2 is legacy only.
- **AUDIT**: All cryptographic code should be reviewed and audited before production deployment. 