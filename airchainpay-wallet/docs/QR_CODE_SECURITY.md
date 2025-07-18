# QR Code Digital Signature Security

## Overview

The AirChainPay Wallet implements comprehensive digital signature security for QR code payloads to prevent tampering and unauthorized transactions. This system uses ECDSA (Elliptic Curve Digital Signature Algorithm) to ensure the integrity and authenticity of QR code payment requests.

## Security Features

### 1. Digital Signatures
- **ECDSA Signatures**: All QR code payloads are signed using ECDSA with secp256k1 curve
- **Message Integrity**: Ensures QR code content cannot be modified without detection
- **Authenticity Verification**: Confirms the QR code was created by the claimed sender

### 2. Timestamp Validation
- **Replay Attack Prevention**: QR codes expire after 5 minutes to prevent replay attacks
- **Future Timestamp Detection**: Rejects QR codes with future timestamps
- **Age Validation**: Automatically validates payload age during verification

### 3. Payload Structure
- **Standardized Format**: Consistent payload structure for signing and verification
- **Deterministic Serialization**: Sorted JSON keys ensure consistent message hashing
- **Version Control**: Signature versioning for future upgrades

## Implementation Details

### QRCodeSigner Class

The `QRCodeSigner` class provides the core functionality for QR code security:

```typescript
// Sign a QR payload
const signedPayload = await QRCodeSigner.signQRPayload(payload, chainId);

// Verify a signed payload
const result = await QRCodeSigner.verifyQRPayload(signedPayload);
```

### Signature Process

1. **Payload Standardization**: Create a clean, deterministic payload
2. **Message Creation**: Format message with prefix and sorted JSON
3. **ECDSA Signing**: Sign message with wallet private key
4. **Metadata Addition**: Add signature metadata and timestamps

### Verification Process

1. **Signature Presence**: Check if payload has signature structure
2. **Timestamp Validation**: Verify payload age and prevent replay attacks
3. **Format Validation**: Validate signature format and required fields
4. **Message Recreation**: Recreate original message for verification
5. **ECDSA Verification**: Verify signature using recovered public key
6. **Hash Verification**: Confirm message hash matches signature

## QR Code Payload Structure

### Unsigned Payload
```json
{
  "type": "payment_request",
  "to": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
  "amount": "0.1",
  "chainId": "base_sepolia",
  "timestamp": 1703123456789,
  "version": "1.0"
}
```

### Signed Payload
```json
{
  "type": "payment_request",
  "to": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
  "amount": "0.1",
  "chainId": "base_sepolia",
  "timestamp": 1703123456789,
  "version": "1.0",
  "signature": {
    "version": "v1",
    "signer": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    "signature": "0x...",
    "timestamp": 1703123456789,
    "chainId": "base_sepolia",
    "messageHash": "0x..."
  },
  "metadata": {
    "signedAt": 1703123456789,
    "version": "v1",
    "integrity": "verified"
  }
}
```

## Security Properties

### 1. Tamper Resistance
- **Content Integrity**: Any modification to payload content invalidates signature
- **Field Protection**: All critical fields are included in signature calculation
- **Hash Verification**: Message hash ensures payload hasn't been altered

### 2. Replay Attack Prevention
- **Timestamp Validation**: QR codes expire after 5 minutes
- **Age Checking**: Automatic validation of payload age
- **Future Detection**: Rejection of QR codes with future timestamps

### 3. Authentication
- **Signer Verification**: Confirms QR code was created by claimed address
- **ECDSA Security**: Uses proven cryptographic algorithm
- **Public Key Recovery**: Verifies signature without storing private keys

### 4. Format Validation
- **Structure Checking**: Validates signature format and required fields
- **Version Control**: Supports signature versioning for upgrades
- **Address Validation**: Ensures signer address is valid

## Usage Examples

### Generating Signed QR Codes

```typescript
// In receive-payment.tsx
const paymentRequest = {
  type: 'payment_request',
  to: walletInfo.address,
  chainId: selectedChain,
  timestamp: Date.now(),
  version: '1.0'
};

// Sign the payment request
const signedPaymentRequest = await QRCodeSigner.signQRPayload(paymentRequest, selectedChain);

// Generate QR code with signed payload
const qrData = JSON.stringify(signedPaymentRequest);
```

### Verifying QR Code Signatures

```typescript
// In qr-pay.tsx and send-payment.tsx
const handleScan = async (data: string) => {
  try {
    const parsed = JSON.parse(data);
    
    // Check if signed payload
    if (QRCodeSigner.isSignedPayload(parsed)) {
      const verificationResult = await QRCodeSigner.verifyQRPayload(parsed);
      
      if (!verificationResult.isValid) {
        throw new Error(`QR code signature verification failed: ${verificationResult.error}`);
      }
      
      // Show success message
      Alert.alert('Secure QR Code', 'QR code verified successfully!');
    } else {
      // Show warning for unsigned QR codes
      Alert.alert('Unverified QR Code', 'This QR code is not digitally signed. Proceed with caution.');
    }
    
    // Process the QR code data...
  } catch (error) {
    // Handle errors...
  }
};
```

## Error Handling

### Common Error Types

1. **No Signature**: Payload doesn't contain signature structure
2. **Invalid Format**: Signature format is malformed or incomplete
3. **Expired Payload**: QR code is older than 5 minutes
4. **Future Timestamp**: QR code has future timestamp
5. **Invalid Signature**: ECDSA signature verification failed
6. **Hash Mismatch**: Message hash doesn't match signature

### Error Response Format

```typescript
interface VerificationResult {
  isValid: boolean;
  error?: string;
  signer?: string;
  chainId?: string;
  timestamp?: number;
  details: {
    hasSignature: boolean;
    hasValidTimestamp: boolean;
    hasValidFormat: boolean;
    signatureValid?: boolean;
    hashValid?: boolean;
    timestampError?: string;
    formatError?: string;
  };
}
```

## Testing

### Test Script

Run the comprehensive test suite:

```bash
node scripts/test-qr-signatures.js
```

### Test Coverage

1. **Basic Signing/Verification**: Tests normal signing and verification flow
2. **Tamper Detection**: Tests rejection of modified payloads
3. **Timestamp Validation**: Tests replay attack prevention
4. **Format Validation**: Tests invalid signature format handling
5. **Unsigned Detection**: Tests detection of unsigned payloads
6. **Complex Payloads**: Tests signing with token information

## Security Considerations

### 1. Private Key Security
- Private keys are stored securely using hardware-backed storage
- Signing operations use secure cryptographic libraries
- No private key exposure in QR code payloads

### 2. Network Security
- QR codes are transmitted offline (no network exposure)
- Signatures prevent man-in-the-middle attacks
- Timestamp validation prevents replay attacks

### 3. Implementation Security
- Uses proven ECDSA algorithm with secp256k1 curve
- Deterministic message creation prevents signature malleability
- Comprehensive error handling prevents information leakage

### 4. User Experience
- Clear feedback for signed vs unsigned QR codes
- Detailed error messages for debugging
- Graceful fallback for legacy unsigned QR codes

## Migration Strategy

### Backward Compatibility
- Supports both signed and unsigned QR codes
- Warns users about unsigned QR codes
- Maintains functionality for legacy QR codes

### Upgrade Path
1. **Phase 1**: Implement signature generation for new QR codes
2. **Phase 2**: Add signature verification with warnings
3. **Phase 3**: Enforce signature requirements (future)

## Performance Considerations

### QR Code Size
- Signed payloads are larger than unsigned ones
- Compression techniques minimize size impact
- QR code density remains acceptable for scanning

### Verification Speed
- ECDSA verification is fast (< 1ms)
- Timestamp validation is negligible
- No network calls required for verification

## Compliance

### Standards Compliance
- **ECDSA**: RFC 6979 compliant implementation
- **JSON**: RFC 7159 compliant serialization
- **Base64**: RFC 4648 compliant encoding

### Best Practices
- **Cryptographic Agility**: Versioned signature system
- **Error Handling**: Comprehensive error reporting
- **Logging**: Secure logging without sensitive data exposure

## Future Enhancements

### Planned Improvements
1. **Multi-Signature Support**: Multiple signer verification
2. **Advanced Compression**: Better payload compression
3. **Batch Verification**: Efficient batch signature verification
4. **Hardware Integration**: Hardware security module support

### Version Management
- **Signature Versioning**: Support for multiple signature versions
- **Upgrade Path**: Smooth migration between versions
- **Deprecation**: Clear deprecation timelines

## Troubleshooting

### Common Issues

1. **QR Code Too Large**
   - Solution: Use payload compression
   - Alternative: Split into multiple QR codes

2. **Verification Failures**
   - Check: Timestamp validity
   - Check: Signature format
   - Check: Network connectivity for wallet operations

3. **Performance Issues**
   - Monitor: QR code generation time
   - Monitor: Verification time
   - Optimize: Payload size and complexity

### Debug Information

Enable debug logging to troubleshoot issues:

```typescript
// Enable detailed logging
logger.setLevel('debug');

// Check signature metadata
const metadata = QRCodeSigner.getSignatureMetadata(signedPayload);
console.log('Signature metadata:', metadata);
```

## Conclusion

The QR code digital signature system provides comprehensive security for AirChainPay Wallet QR code transactions. By implementing ECDSA signatures, timestamp validation, and replay protection, the system prevents tampering and unauthorized transactions while maintaining excellent user experience.

The implementation is production-ready, thoroughly tested, and follows security best practices. Users can confidently scan QR codes knowing that the system will detect and prevent malicious modifications. 