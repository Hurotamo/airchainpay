# TODO: Update Wallet App to Use Exact Contract Functions

## Overview
Transform the wallet app from basic token transfers to full contract integration with meta-transactions, offline signing, and advanced payment features.

## Phase 1: Core Contract Integration

### 1.1 Update Transaction Services
- [x] **Replace `sendTokenTransaction()` in `MultiChainWalletManager.ts`**
  - Remove direct `transfer()` calls on ERC-20 tokens
  - Remove direct `sendTransaction()` for native tokens
  - Add calls to `executeTokenMetaTransaction()` for ERC-20
  - Add calls to `executeNativeMetaTransaction()` for native tokens

### 1.2 Add Meta-Transaction Support
- [x] **Create `MetaTransactionService.ts`**
  - Add `signMetaTransaction()` method for offline signing
  - Add `executeMetaTransaction()` method for contract calls
  - Add EIP-712 domain separator handling
  - Add nonce management per user/chain

### 1.3 Update Contract Service
- [x] **Enhance `ContractService.ts`**
  - Add `executeNativeMetaTransaction()` method
  - Add `executeTokenMetaTransaction()` method
  - Add `executeBatchNativeMetaTransaction()` method
  - Add `executeBatchTokenMetaTransaction()` method
  - Add `getNonce()` method for replay protection

## Phase 2: Payment Flow Updates

### 2.1 Update BLE Payment Service
- [ ] **Modify `BLEPaymentService.ts`**
  - Replace direct blockchain calls with contract meta-transactions
  - Add offline transaction signing for BLE payments
  - Add payment reference generation
  - Add transaction status tracking

### 2.2 Update Payment Screen
- [ ] **Modify `BLEPaymentScreen.tsx`**
  - Add meta-transaction signing flow
  - Add payment reference input/display
  - Add transaction status updates
  - Add fee calculation display

## Phase 3: Advanced Features

### 3.1 Batch Payment Support
- [ ] **Add batch payment functionality**
  - Create `BatchPaymentService.ts`
  - Add UI for multiple recipient payments
  - Add batch transaction signing
  - Add batch payment status tracking

### 3.2 Token Management
- [ ] **Integrate contract token management**
  - Use `getSupportedTokens()` from contract
  - Use `getTokenConfig()` for token validation
  - Add dynamic token support based on contract
  - Add token fee rate display

### 3.3 Payment History
- [ ] **Add contract-based payment tracking**
  - Use `getPayment()` for transaction details
  - Use `getUserPaymentCount()` for user stats
  - Use `getTotalPayments()` for global stats
  - Add payment ID tracking

## Phase 4: Security & Validation

### 4.1 Signature Validation
- [ ] **Add signature verification**
  - Verify meta-transaction signatures
  - Add deadline validation
  - Add nonce validation
  - Add replay attack protection

### 4.2 Error Handling
- [ ] **Add contract-specific error handling**
  - Handle `TokenNotSupported` errors
  - Handle `InvalidAmount` errors
  - Handle `TransactionExpired` errors
  - Handle `InsufficientBalance` errors

## Phase 5: UI/UX Updates

### 5.1 Transaction Flow
- [ ] **Update transaction confirmation screens**
  - Add meta-transaction signing step
  - Add payment reference display
  - Add fee breakdown display
  - Add transaction status indicators

### 5.2 Settings & Configuration
- [ ] **Add contract configuration**
  - Add supported tokens display
  - Add fee rates display
  - Add contract status indicators
  - Add network configuration

## Phase 6: Testing & Validation

### 6.1 Contract Integration Testing
- [ ] **Test meta-transaction flows**
  - Test native token meta-transactions
  - Test ERC-20 token meta-transactions
  - Test batch payment transactions
  - Test error scenarios

### 6.2 BLE Integration Testing
- [ ] **Test BLE + Contract integration**
  - Test offline signing + BLE transmission
  - Test contract execution from BLE data
  - Test payment reference handling
  - Test transaction status updates

## Phase 7: Migration & Cleanup

### 7.1 Remove Legacy Code
- [ ] **Remove direct blockchain calls**
  - Remove direct `transfer()` calls
  - Remove direct `sendTransaction()` calls
  - Remove inline ABI definitions
  - Clean up unused imports

### 7.2 Update Documentation
- [ ] **Update code documentation**
  - Document meta-transaction flows
  - Document contract integration
  - Document payment reference system
  - Update API documentation

## Priority Order
1. **High Priority**: Phase 1 (Core Contract Integration)
2. **Medium Priority**: Phase 2 (Payment Flow Updates)
3. **Medium Priority**: Phase 3 (Advanced Features)
4. **Low Priority**: Phase 4-7 (Security, UI, Testing, Cleanup)

## Estimated Effort
- **Phase 1**: 2-3 days
- **Phase 2**: 1-2 days  
- **Phase 3**: 2-3 days
- **Phase 4-7**: 2-3 days
- **Total**: 7-11 days

## Current Status
- [x] Updated ABIs to exact contract ABIs
- [x] Created ContractService with contract methods
- [x] Updated imports to use exact ABIs
- [x] **COMPLETED**: Implement meta-transaction flows
- [x] **COMPLETED**: Replace direct transfers with contract calls
- [x] **COMPLETED**: Add offline signing capabilities
- [x] **COMPLETED**: Integrate payment references
- [x] **COMPLETED**: Create MetaTransactionService with full support
- [x] **COMPLETED**: Enhance ContractService with meta-transaction methods
- [ ] **TODO**: Add fee management
- [ ] **TODO**: Add batch payment support

## Contract Functions to Implement
### AirChainPayToken.sol Functions:
- `executeNativeMetaTransaction()` - Offline-signed native payments
- `executeTokenMetaTransaction()` - Offline-signed ERC-20 payments  
- `executeBatchNativeMetaTransaction()` - Batch native payments
- `executeBatchTokenMetaTransaction()` - Batch ERC-20 payments
- `getSupportedTokens()` - Get supported token list
- `getTokenConfig()` - Get token configuration
- `getNonce()` - Get user nonce for replay protection

### AirChainPay.sol Functions:
- `executeMetaTransaction()` - Basic offline-signed payments
- `executeBatchMetaTransaction()` - Batch offline payments
- `pay()` - Direct payments with references

## Notes
- Current wallet only does basic ERC-20 `transfer()` and native `sendTransaction()`
- Need to replace with contract meta-transaction functions
- This will enable offline signing, payment tracking, and fee management
- BLE payments should use contract functions instead of direct blockchain calls
