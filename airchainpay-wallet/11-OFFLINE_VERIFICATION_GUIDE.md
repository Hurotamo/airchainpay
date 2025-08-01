# AirChainPay Wallet - Offline Functionality Verification Guide

## Overview

This guide provides comprehensive methods to verify that the AirChainPay wallet is working correctly in offline mode. The wallet implements robust offline capabilities with security measures to prevent double-spending attacks.

## 🔍 How Offline Detection Works

### Network Status Detection
The wallet detects offline status through blockchain connectivity checks:

```typescript
// From MultiChainWalletManager.ts
async checkNetworkStatus(chainId: string): Promise<boolean> {
  try {
    const provider = this.providers[chainId];
    const blockNumber = await provider.getBlockNumber();
    return blockNumber > 0; // Returns true if online, false if offline
  } catch (error) {
    return false; // Assumes offline if connection fails
  }
}
```

### Offline Transaction Flow
When offline, transactions follow this secure flow:
1. **Network Check** → Detects no internet connection
2. **Security Validation** → Performs comprehensive security checks
3. **Transaction Signing** → Signs transaction locally
4. **Queue Storage** → Stores in local AsyncStorage
5. **Balance Tracking** → Updates offline balance tracking

## ✅ Verification Methods

### Method 1: Network Disconnection Test

#### Prerequisites
- AirChainPay wallet installed and configured
- Test wallet with some balance
- Another device for BLE testing (optional)

#### Steps
1. **Enable Airplane Mode** or disconnect from WiFi/cellular
2. **Open AirChainPay wallet**
3. **Attempt a payment** (BLE, QR, or manual)
4. **Verify offline behavior**:
   - Should show "Offline Mode" indicator
   - Transaction should be queued with status "queued"
   - No network errors should occur

#### Expected Results
```
✅ Transaction Status: "queued"
✅ Message: "Transaction queued for processing when online"
✅ Security Validation: Passed
✅ Balance Check: Available balance validated
✅ Nonce Validation: Offline nonce incremented
```

### Method 2: Security Validation Testing

#### Test Case 1: Insufficient Balance
1. **Go offline**
2. **Attempt to send more than available balance**
3. **Verify rejection**:
   ```
   ❌ Error: "Insufficient available balance"
   ❌ Transaction: Not queued
   ✅ Security: Prevents double-spending
   ```

#### Test Case 2: Duplicate Transaction
1. **Go offline**
2. **Send transaction to same recipient with same amount**
3. **Attempt duplicate transaction**
4. **Verify rejection**:
   ```
   ❌ Error: "Duplicate transaction detected"
   ❌ Transaction: Not queued
   ✅ Security: Prevents duplicate payments
   ```

#### Test Case 3: Nonce Validation
1. **Go offline**
2. **Send multiple transactions**
3. **Verify nonce tracking**:
   ```
   ✅ Offline nonce: Incremented for each transaction
   ✅ Nonce validation: Passed for each transaction
   ✅ No nonce conflicts: Each transaction has unique nonce
   ```

### Method 3: Transaction Queue Verification

#### Check Queued Transactions
```typescript
// In browser console or debug mode
const queuedTxs = await TxQueue.getQueuedTransactions();
console.log('Queued transactions:', queuedTxs);
```

#### Expected Queue Structure
```json
{
  "id": "1703123456789",
  "to": "0x1234...",
  "amount": "0.1",
  "status": "queued",
  "chainId": "11155420",
  "timestamp": 1703123456789,
  "signedTx": "0x...",
  "transport": "ble",
  "metadata": {
    "merchant": "BLE Device",
    "location": "Offline BLE Transaction",
    "security": {
      "balanceValidated": true,
      "duplicateChecked": true,
      "nonceValidated": true
    }
  }
}
```

### Method 4: Balance Tracking Verification

#### Check Offline Balance Tracking
```typescript
// Verify offline balance tracking
const tracking = await OfflineSecurityService.getInstance()
  .getOfflineBalanceTracking(chainId);
console.log('Offline balance tracking:', tracking);
```

#### Expected Tracking Structure
```json
{
  "pendingAmount": "0.5",
  "lastUpdated": 1703123456789,
  "chainId": "11155420",
  "tokenSymbol": "ETH"
}
```

### Method 5: Online Sync Testing

#### Test Transaction Processing
1. **Queue transactions while offline**
2. **Reconnect to internet**
3. **Verify automatic processing**:
   ```
   ✅ Queued transactions: Automatically processed
   ✅ Status updates: "pending" → "confirmed"
   ✅ Balance updates: Reflects processed transactions
   ✅ Queue cleanup: Processed transactions removed
   ```

## 🔧 Debug Tools

### 1. Network Status Check
```typescript
// Check if wallet detects offline status
const walletManager = MultiChainWalletManager.getInstance();
const isOnline = await walletManager.checkNetworkStatus(chainId);
console.log('Network status:', isOnline ? 'Online' : 'Offline');
```

### 2. Security Service Status
```typescript
// Check offline security service status
const securityService = OfflineSecurityService.getInstance();
const tracking = await securityService.getOfflineBalanceTracking(chainId);
const nonceTracking = await securityService.getOfflineNonceTracking(chainId);
console.log('Security tracking:', { tracking, nonceTracking });
```

### 3. Transaction Queue Status
```typescript
// Check all transaction queues
const pending = await TxQueue.getPendingTransactions();
const queued = await TxQueue.getQueuedTransactions();
console.log('Transaction queues:', { pending, queued });
```

## 🚨 Security Verification

### Double-Spending Prevention
The wallet implements multiple layers of protection:

1. **Available Balance Calculation**:
   ```typescript
   Available Balance = Current Balance - Pending Transactions
   ```

2. **Real-time Balance Validation**:
   - Checks current blockchain balance
   - Subtracts all pending offline transactions
   - Rejects if insufficient available balance

3. **Nonce Management**:
   - Tracks offline nonce separately
   - Ensures sequential transaction ordering
   - Prevents nonce conflicts

4. **Duplicate Detection**:
   - Exact duplicate prevention
   - Similar transaction warnings
   - Time-based duplicate checking

## 📱 Testing Scenarios

### Scenario 1: Complete Offline Payment
1. **Disconnect from internet**
2. **Scan BLE device or QR code**
3. **Enter payment amount**
4. **Confirm payment**
5. **Verify offline queueing**
6. **Reconnect to internet**
7. **Verify automatic processing**

### Scenario 2: Multiple Offline Transactions
1. **Go offline**
2. **Send transaction 1** → Should queue
3. **Send transaction 2** → Should queue
4. **Send transaction 3** → Should queue
5. **Check available balance** → Should decrease
6. **Attempt transaction exceeding balance** → Should reject
7. **Go online** → All should process

### Scenario 3: Security Edge Cases
1. **Go offline**
2. **Send transaction to same recipient twice** → Second should reject
3. **Send transaction with insufficient balance** → Should reject
4. **Send transaction with invalid nonce** → Should reject
5. **Verify all security measures work**

## ✅ Success Criteria

### Offline Mode Detection
- [ ] Network status correctly detected as offline
- [ ] No network errors during offline operations
- [ ] Offline indicator displayed to user

### Transaction Queueing
- [ ] Transactions properly queued when offline
- [ ] Queue persists across app restarts
- [ ] Queue metadata includes security validation info

### Security Validation
- [ ] Balance validation prevents overspending
- [ ] Duplicate transaction detection works
- [ ] Nonce validation prevents conflicts
- [ ] Cross-wallet security checks pass

### Online Sync
- [ ] Queued transactions process when online
- [ ] Transaction status updates correctly
- [ ] Queue cleanup after successful processing
- [ ] Balance updates reflect processed transactions

## 🐛 Troubleshooting

### Common Issues

#### Issue: Transactions not queuing offline
**Solution**: Check network status detection
```typescript
const isOnline = await walletManager.checkNetworkStatus(chainId);
console.log('Network status:', isOnline);
```

#### Issue: Security validation failing
**Solution**: Check offline balance tracking
```typescript
const tracking = await OfflineSecurityService.getInstance()
  .getOfflineBalanceTracking(chainId);
console.log('Balance tracking:', tracking);
```

#### Issue: Queue not processing when online
**Solution**: Check network reconnection
```typescript
// In app/_layout.tsx - network monitoring
NetInfo.addEventListener(async (state) => {
  if (state.isConnected && state.isInternetReachable) {
    await paymentService.processQueuedTransactions();
  }
});
```

## 📊 Monitoring and Logs

### Key Log Messages to Monitor
```
[BLETransport] Offline detected, performing security checks before queueing
[OfflineSecurity] Balance validation passed
[OfflineSecurity] Duplicate check passed
[OfflineSecurity] Nonce validation passed
[BLETransport] Transaction queued for offline processing with security validation
[PaymentService] Processing queued transactions
```

### Debug Commands
```typescript
// Enable detailed logging
logger.setLevel('debug');

// Check all offline tracking
const securityService = OfflineSecurityService.getInstance();
const allTracking = await Promise.all(
  Object.keys(SUPPORTED_CHAINS).map(async (chainId) => ({
    chainId,
    balanceTracking: await securityService.getOfflineBalanceTracking(chainId),
    nonceTracking: await securityService.getOfflineNonceTracking(chainId)
  }))
);
console.log('All offline tracking:', allTracking);
```

## 🎯 Conclusion

The AirChainPay wallet implements comprehensive offline functionality with robust security measures. The verification process ensures:

1. **Reliable offline detection**
2. **Secure transaction queueing**
3. **Double-spending prevention**
4. **Automatic online synchronization**
5. **Comprehensive security validation**

By following this verification guide, you can confidently verify that the wallet works correctly in offline mode while maintaining security and preventing financial risks. 