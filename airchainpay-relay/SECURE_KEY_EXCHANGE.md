# AirChainPay Secure Key Exchange

## Overview

AirChainPay implements secure key exchange using Elliptic Curve Diffie-Hellman (ECDH) key exchange protocol to establish encrypted communication channels between offline wallets and relay servers. This ensures that all BLE communications are encrypted with session keys that provide forward secrecy.

## Security Features

### 1. Elliptic Curve Diffie-Hellman Key Exchange
- **Curve**: Prime256v1 (NIST P-256) for optimal security and performance
- **Key Size**: 256-bit EC keys providing equivalent security to 3072-bit RSA
- **Perfect Forward Secrecy**: Each session uses unique ephemeral keys
- **Modern Cryptography**: Uses industry-standard elliptic curve cryptography

### 2. Session Key Derivation
- **Algorithm**: PBKDF2 with SHA-256
- **Iterations**: 100,000 iterations for key stretching
- **Salt**: Device ID + nonce for uniqueness
- **Key Length**: 256-bit (32 bytes) session keys

### 3. Authentication Integration
- **RSA Challenge-Response**: Device authentication using RSA signatures
- **Key Exchange First**: Authentication requires completed key exchange
- **Session Key Storage**: Authenticated devices store session keys

### 4. Forward Secrecy
- **Key Rotation**: Automatic session key rotation capability
- **Ephemeral Keys**: Each key exchange uses new EC key pairs
- **Secure Cleanup**: Keys are properly zeroed and deleted

### 5. DoS Protection
- **Rate Limiting**: Maximum 3 key exchange attempts per device
- **Temporary Blocking**: 5-minute blocks for failed attempts
- **Connection Caps**: Global connection limits

## Protocol Flow

### 1. Key Exchange Initiation
```
Relay → Device: { type: 'key_exchange_init', dhPublicKey, nonce, relayPublicKey }
```

### 2. Device Response
```
Device → Relay: { type: 'key_exchange_response', dhPublicKey, signature }
```

### 3. Session Key Derivation
Both parties compute shared secret using ECDH and derive session key using PBKDF2.

### 4. Authentication (After Key Exchange)
```
Relay → Device: { type: 'auth_challenge', challenge, relayPublicKey }
Device → Relay: { type: 'auth_response', signature }
```

### 5. Key Rotation (Optional)
```
Relay → Device: { type: 'key_rotation_init', dhPublicKey, nonce }
Device → Relay: { type: 'key_rotation_response', dhPublicKey, signature }
```

## API Endpoints

### Key Exchange Status
```http
GET /ble/key-exchange/device/:deviceId
```

### Key Exchange Management
```http
POST /ble/key-exchange/initiate/:deviceId
POST /ble/key-exchange/rotate/:deviceId
POST /ble/key-exchange/block/:deviceId
POST /ble/key-exchange/unblock/:deviceId
```

### Device List
```http
GET /ble/key-exchange/devices
```

## Configuration

### Constants
- `DH_KEY_SIZE`: 2048 bits (for compatibility, though EC is preferred)
- `SESSION_KEY_LENGTH`: 32 bytes
- `KEY_EXCHANGE_TIMEOUT`: 60 seconds
- `MAX_KEY_EXCHANGE_ATTEMPTS`: 3 attempts

### Security Settings
- PBKDF2 iterations: 100,000
- Hash algorithm: SHA-256
- Encryption: AES-256-GCM
- IV length: 12 bytes
- EC Curve: Prime256v1

## Security Benefits

1. **Confidentiality**: All communications encrypted with strong session keys
2. **Integrity**: HMAC authentication prevents tampering
3. **Forward Secrecy**: Compromised keys don't affect past communications
4. **Authentication**: RSA-based device verification
5. **DoS Resistance**: Rate limiting and temporary blocking
6. **Key Rotation**: Optional session key updates for enhanced security
7. **Modern Cryptography**: Uses industry-standard EC cryptography

## Implementation Details

### BLEManager Class
- `initiateKeyExchange(deviceId)`: Start key exchange process
- `handleKeyExchangeResponse(deviceId, response)`: Process device response
- `rotateSessionKey(deviceId)`: Rotate session key for forward secrecy
- `isKeyExchangeCompleted(deviceId)`: Check completion status
- `isKeyExchangeBlocked(deviceId)`: Check blocking status

### Error Handling
- Timeout detection for expired key exchanges
- Invalid signature rejection
- Malformed data handling
- Graceful failure recovery

### State Management
- Key exchange state tracking
- Session key storage
- Attempt counting
- Blocking management

## Testing

Run the comprehensive test suite:
```bash
node scripts/test-key-exchange.js
```

### Test Results ✅
All tests pass successfully:

- **Test 1: Basic EC Key Exchange** ✅
  - EC key pairs generated successfully
  - Shared secrets computed and verified
  - Session keys derived and matched
  - Perfect forward secrecy confirmed

- **Test 2: Key Rotation** ✅
  - New EC key pairs generated for rotation
  - New shared secrets computed and verified
  - New session keys derived and matched
  - Forward secrecy maintained

- **Test 3: Encryption/Decryption** ✅
  - AES-256-GCM encryption/decryption working
  - Data integrity preserved
  - Authentication tags verified

- **Test 4: Digital Signatures** ✅
  - RSA signature creation successful
  - Signature verification working
  - Authentication flow validated

## Monitoring

### Status Endpoint
```http
GET /ble/status
```

Returns key exchange statistics:
```json
{
  "keyExchange": {
    "completedKeyExchange": 5,
    "pendingKeyExchange": 2,
    "blockedKeyExchange": 1
  }
}
```

### Device Status
```http
GET /ble/key-exchange/device/:deviceId
```

Returns device-specific key exchange status and blocking information.

## Best Practices

1. **Regular Key Rotation**: Implement periodic session key rotation
2. **Monitoring**: Monitor key exchange success rates and blocking events
3. **Logging**: Log all key exchange events for security auditing
4. **Cleanup**: Properly clean up keys when devices disconnect
5. **Validation**: Validate all cryptographic parameters and signatures
6. **Modern Cryptography**: Use EC keys for better performance and security

## Security Considerations

- **Key Storage**: Session keys are stored in memory only
- **Key Zeroing**: Keys are properly zeroed when no longer needed
- **Random Generation**: Uses cryptographically secure random number generation
- **Signature Verification**: All signatures are verified before accepting responses
- **Timeout Handling**: Expired key exchanges are properly cleaned up
- **EC Security**: Prime256v1 provides strong security with efficient computation

## Migration from DH to EC

The system has been updated to use Elliptic Curve cryptography instead of traditional Diffie-Hellman:

- **Better Performance**: EC operations are faster than DH
- **Smaller Keys**: 256-bit EC keys provide equivalent security to 3072-bit RSA
- **Industry Standard**: Prime256v1 is widely adopted and well-vetted
- **No Parameter Issues**: EC curves handle parameters automatically

This implementation provides enterprise-grade security for AirChainPay's offline transaction transmission system with modern cryptographic standards. 