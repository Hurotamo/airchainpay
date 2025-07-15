# AirChainPay TODO Documentation

This document contains all TODO items and pending implementations found in the AirChainPay relay and wallet codebases.

## High Priority TODOs

### API Implementation
- **File**: `src/api/mod.rs`
- **Line 713**: Implement actual contract event fetching
- **Line 988**: Implement chain grouping for transaction statistics

### Protobuf Implementation
- **File**: `src/utils/protobuf_compressor.rs`
- **Line 12**: Protobuf message imports commented out for compilation. Implement or generate these types as needed.
- **Lines 331-602**: Multiple functions commented out because protobuf types are missing:
  - `decompress_transaction_payload_protobuf`
  - `decompress_ble_payment_data_protobuf`
  - `decompress_qr_payment_request_protobuf`
  - `compress_transaction_payload_protobuf`
  - `compress_ble_payment_data_protobuf`
  - `compress_qr_payment_request_protobuf`
  - `validate_protobuf_schema`
  - `serialize_protobuf_message`
  - `deserialize_protobuf_message`

## Medium Priority TODOs

### System Monitoring
- **File**: `src/monitoring/mod.rs`
- **Line 140**: Disk usage monitoring - would need more complex implementation
- **Line 143**: Network interface monitoring - would need network interface monitoring
- **Line 147**: Open file descriptors monitoring - would need OS-specific implementation

### Transaction Validation
- **File**: `src/validators/transaction_validator.rs`
- **Line 199**: Cryptographic signature verification - in a real implementation, you would verify the signature cryptographically
- **Line 227**: Transaction parsing - in a real implementation, you would parse the transaction properly
- **Line 238**: Nonce checking - in a real implementation, you would check the nonce against the sender's account
- **Line 254**: Transaction parsing - in a real implementation, you would parse the transaction properly
- **Line 265**: Rate limiting - in a real implementation, you would check rate limits for the device
- **Line 271**: Chain ID extraction - in a real implementation, you would parse the transaction to extract chain ID

### Storage Implementation
- **File**: `src/storage.rs`
- **Line 151**: Add missing methods for storage functionality
- **Line 206**: Add missing methods for API compatibility

### Backup Implementation
- **File**: `src/utils/backup.rs`
- **Line 180**: Memory usage monitoring - would need system monitoring
- **Line 555**: Implementation for encrypting backup files
- **Line 562**: Implementation for decrypting backup files

### Audit Implementation
- **File**: `src/utils/audit.rs`
- **Line 112**: Memory usage monitoring - would need system monitoring

## Low Priority TODOs

### BLE Implementation
- **File**: `src/ble/mod.rs`
- **Lines 4-30**: Multiple BLE functions need implementation:
  - `initiate_key_exchange`
  - `rotate_session_key`
  - `block_device`
  - `unblock_device`
  - `get_key_exchange_devices`

### Scripts Implementation
- **File**: `src/scripts/mod.rs`
- **Line 359**: Payment verification logic implementation
- **Line 373**: Network comparison logic implementation

### Payload Compression
- **File**: `src/utils/payload_compressor.rs`
- **Line 210**: LZ4 compression - for LZ4, we need to know the original size
- **Line 211**: Simplified implementation - this is a simplified implementation

### Security Implementation
- **File**: `src/middleware/security.rs`
- **Line 236**: Security monitoring system logging - in a real implementation, this would log to a security monitoring system
- **Line 611**: CSRF token validation - validate CSRF token (simplified implementation)

### IP Whitelist Implementation
- **File**: `src/middleware/ip_whitelist.rs`
- **Line 152**: CIDR range expansion - in a real implementation, you'd expand the CIDR range

### Transaction Processing
- **File**: `src/processors/transaction_processor.rs`
- **Line 484**: Transaction hash storage - BLETransaction doesn't have tx_hash field, so we'll store it separately
- **Line 709**: Chain ID extraction - in a real implementation, you would parse the transaction to extract chain ID

## API Endpoint Implementations

### Swagger API Endpoints
- **File**: `src/api/swagger.rs`
- **Lines 548-1264**: Multiple API endpoint implementations needed:
  - Database transaction endpoints
  - Backup management endpoints
  - Audit event endpoints
  - Security event endpoints
  - Configuration management endpoints

## Error Handler Implementation
- **File**: `src/utils/error_handler.rs`
- **Line 93**: Critical protection path identification
- **Lines 499, 546, 674**: Missing methods for API compatibility

## Logger Cleanup
- **File**: `src/logger.rs`
- **Lines 194, 199, 204, 234, 481, 487, 500**: Functions no longer needed as context is removed from EnhancedLogger

## Middleware Implementation
- **File**: `src/middleware/mod.rs`
- **Line 214**: Security monitoring system logging - in a real implementation, this would log to a security monitoring system

## Summary

### Total TODO Items: ~50+
- **High Priority**: 15 items
- **Medium Priority**: 20 items  
- **Low Priority**: 15+ items

### Categories:
1. **API Implementation** (2 items)
2. **Protobuf Implementation** (10 items)
3. **System Monitoring** (3 items)
4. **Transaction Validation** (6 items)
5. **Storage Implementation** (2 items)
6. **Backup Implementation** (3 items)
7. **BLE Implementation** (5 items)
8. **Security Implementation** (2 items)
9. **API Endpoints** (20+ items)
10. **Error Handling** (4 items)
11. **Logger Cleanup** (7 items)

### Next Steps:
1. Implement protobuf message types and imports
2. Complete API endpoint implementations
3. Add system monitoring capabilities
4. Implement proper transaction validation
5. Complete BLE functionality
6. Add security monitoring and logging
7. Clean up deprecated logger functions

---

*Last Updated: $(date)*
*Total TODO Items Found: 50+* 