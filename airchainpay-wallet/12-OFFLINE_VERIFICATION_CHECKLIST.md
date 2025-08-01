# AirChainPay Wallet - Offline Verification Checklist

## 🚀 Quick Verification Steps

### ✅ Step 1: Network Detection
- [ ] **Enable Airplane Mode** or disconnect WiFi/cellular
- [ ] **Open AirChainPay wallet**
- [ ] **Verify offline indicator** appears
- [ ] **Check network status** returns `false`

### ✅ Step 2: Transaction Queueing
- [ ] **Attempt a payment** (BLE, QR, or manual)
- [ ] **Verify transaction status** shows "queued"
- [ ] **Check queue storage** in AsyncStorage
- [ ] **Verify security metadata** is included

### ✅ Step 3: Security Validation
- [ ] **Test insufficient balance** → Should reject
- [ ] **Test duplicate transaction** → Should reject  
- [ ] **Test multiple transactions** → Should queue with unique nonces
- [ ] **Verify balance tracking** updates correctly

### ✅ Step 4: Online Synchronization
- [ ] **Reconnect to internet**
- [ ] **Verify automatic processing** of queued transactions
- [ ] **Check status updates** from "queued" to "confirmed"
- [ ] **Verify queue cleanup** after processing

## 🔧 Debug Commands

### Check Network Status
```typescript
const walletManager = MultiChainWalletManager.getInstance();
const isOnline = await walletManager.checkNetworkStatus(chainId);
console.log('Network status:', isOnline ? 'Online' : 'Offline');
```

### Check Queued Transactions
```typescript
const queuedTxs = await TxQueue.getQueuedTransactions();
console.log('Queued transactions:', queuedTxs);
```

### Check Offline Balance Tracking
```typescript
const securityService = OfflineSecurityService.getInstance();
const tracking = await securityService.getOfflineBalanceTracking(chainId);
console.log('Balance tracking:', tracking);
```

### Check Offline Nonce Tracking
```typescript
const nonceTracking = await securityService.getOfflineNonceTracking(chainId);
console.log('Nonce tracking:', nonceTracking);
```

## 📊 Expected Results

### Offline Mode
```
✅ Network Status: false (offline)
✅ Transaction Status: "queued"
✅ Security Validation: Passed
✅ Balance Check: Available balance validated
✅ Nonce Validation: Offline nonce incremented
```

### Online Sync
```
✅ Queued transactions: Automatically processed
✅ Status updates: "queued" → "confirmed"
✅ Balance updates: Reflects processed transactions
✅ Queue cleanup: Processed transactions removed
```

## 🚨 Key Log Messages

Monitor these log messages during testing:

```
[BLETransport] Offline detected, performing security checks before queueing
[OfflineSecurity] Balance validation passed
[OfflineSecurity] Duplicate check passed
[OfflineSecurity] Nonce validation passed
[BLETransport] Transaction queued for offline processing with security validation
[PaymentService] Processing queued transactions
```

## 🐛 Troubleshooting

### Issue: Transactions not queuing offline
**Solution**: Check network status detection
```typescript
const isOnline = await walletManager.checkNetworkStatus(chainId);
console.log('Network status:', isOnline);
```

### Issue: Security validation failing
**Solution**: Check offline balance tracking
```typescript
const tracking = await OfflineSecurityService.getInstance()
  .getOfflineBalanceTracking(chainId);
console.log('Balance tracking:', tracking);
```

### Issue: Queue not processing when online
**Solution**: Check network reconnection monitoring
```typescript
// In app/_layout.tsx
NetInfo.addEventListener(async (state) => {
  if (state.isConnected && state.isInternetReachable) {
    await paymentService.processQueuedTransactions();
  }
});
```

## 🎯 Success Criteria

- [ ] **Offline detection** works reliably
- [ ] **Transaction queueing** functions properly
- [ ] **Security validation** prevents double-spending
- [ ] **Online synchronization** processes queued transactions
- [ ] **Balance tracking** updates correctly
- [ ] **Nonce management** prevents conflicts
- [ ] **Duplicate detection** works as expected

## 📱 Test Scenarios

### Scenario 1: Basic Offline Payment
1. Go offline
2. Send payment
3. Verify queuing
4. Go online
5. Verify processing

### Scenario 2: Multiple Offline Transactions
1. Go offline
2. Send transaction 1 → Queue
3. Send transaction 2 → Queue
4. Send transaction 3 → Queue
5. Check available balance decreases
6. Try to exceed balance → Reject
7. Go online → All process

### Scenario 3: Security Edge Cases
1. Go offline
2. Try duplicate transaction → Reject
3. Try insufficient balance → Reject
4. Try invalid nonce → Reject
5. Verify all security measures work

## 🎉 Verification Complete

Once all checklist items are completed successfully, the AirChainPay wallet offline functionality is verified and working correctly!

**Key Benefits Verified:**
- ✅ Reliable offline operation
- ✅ Secure transaction queueing
- ✅ Double-spending prevention
- ✅ Automatic online synchronization
- ✅ Comprehensive security validation 