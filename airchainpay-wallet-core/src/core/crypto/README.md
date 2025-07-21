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

## Class Organization

### Keys Module
- **KeyManager**: Manages cryptographic key generation, derivation, and validation
- **SecurePrivateKey**: Secure wrapper for private keys with automatic cleanup
- **SecureSeedPhrase**: Secure wrapper for seed phrases with automatic cleanup

### Hashing Module
- **HashManager**: Provides various hashing algorithms (SHA256, SHA512, Keccak256, Keccak512)
- **HashAlgorithm**: Enum defining available hashing algorithms

### Signatures Module
- **SignatureManager**: Handles digital signature creation and verification
- **TransactionSignature**: Structure for Ethereum transaction signatures

### Encryption Module
- **EncryptionManager**: Provides encryption/decryption functionality
- **EncryptedData**: Structure for encrypted data with metadata
- **EncryptionAlgorithm**: Enum defining available encryption algorithms

### Password Module
- **PasswordHasher**: Secure password hashing and verification
- **PasswordConfig**: Configuration for password hashing parameters
- **PasswordAlgorithm**: Enum defining available password hashing algorithms

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