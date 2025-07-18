# AirChainPay Wallet - Security Measures for Offline Mode

## Overview

This document outlines the comprehensive security measures implemented in AirChainPay Wallet to prevent double-spending attacks when users are offline.

## 🚨 Double-Spending Prevention

### Problem Statement
When a user is offline and has limited funds (e.g., $5), they could potentially:
1. Send $5 to Alice → Transaction signed and queued
2. Send $5 to Bob → Transaction signed and queued  
3. Send $5 to Charlie → Transaction signed and queued

When the user comes back online, all three transactions would be broadcast, but only the first one would succeed. The others would fail with "insufficient funds" errors.

### ✅ Security Solutions Implemented

## 1. Balance Validation

### Pre-flight Balance Check
Before allowing any offline transaction to be signed and queued, the app performs a comprehensive balance validation:

```typescript
async validateOfflineBalance(chainId: string, amount: string, tokenInfo: TokenInfo): Promise<void> {
  // Get current balance from blockchain
  const balance = await TokenWalletManager.getTokenBalance(walletInfo.address, tokenInfo);
  
  // Get pending transactions total
  const pendingAmount = await this.getPendingTransactionsTotal(chainId, tokenInfo);
  
  // Calculate available balance (current balance - pending transactions)
  const availableBalance = BigInt(balance.balance) - BigInt(pendingAmount);
  
  if (availableBalance < BigInt(requiredAmount)) {
    throw new Error(`Insufficient available balance. Required: ${requiredAmount}, Available: ${availableBalance}`);
  }
}
```

### Available Balance Calculation
- **Current Balance**: Real-time balance from blockchain (when online)
- **Pending Transactions**: Sum of all queued offline transactions
- **Available Balance**: Current Balance - Pending Transactions

**Example**:
- User has $5 in wallet
- No pending transactions → Available: $5
- User sends $3 offline → Available: $2
- User tries to send $4 offline → **REJECTED** (insufficient available balance)

## 2. Nonce Management

### Offline Nonce Tracking
The app maintains separate nonce tracking for offline transactions:

```typescript
async validateOfflineNonce(chainId: string): Promise<void> {
  const currentNonce = await this.getCurrentNonce(chainId);
  const offlineNonce = await this.getOfflineNonce(chainId);
  
  // Ensure offline nonce is not ahead of current nonce
  if (offlineNonce >= currentNonce) {
    throw new Error('Invalid nonce for offline transaction. Please sync with network first.');
  }
  
  // Update offline nonce
  await this.updateOfflineNonce(chainId, offlineNonce + 1);
}
```

### Nonce Synchronization
- **Current Nonce**: Retrieved from blockchain when online
- **Offline Nonce**: Stored locally and incremented for each offline transaction
- **Validation**: Offline nonce must be less than current nonce

## 3. Transaction Deduplication

### Exact Duplicate Detection
Prevents identical transactions from being queued:

```typescript
async checkForDuplicateTransaction(to: string, amount: string, chainId: string): Promise<void> {
  const pendingTxs = await TxQueue.getPendingTransactions();
  
  // Check for exact duplicates (same recipient, amount, and chain)
  const duplicate = pendingTxs.find(tx => 
    tx.to === to && 
    tx.amount === amount && 
    tx.chainId === chainId &&
    tx.status === 'pending'
  );

  if (duplicate) {
    throw new Error('Duplicate transaction detected. This transaction is already queued.');
  }
}
```

### Similar Transaction Detection
Warns about similar transactions within a time window (5 minutes):

```typescript
// Check for similar transactions within a time window (5 minutes)
const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
const recentSimilar = pendingTxs.find(tx => 
  tx.to === to && 
  tx.chainId === chainId &&
  tx.timestamp > fiveMinutesAgo &&
  tx.status === 'pending'
);
```

## 4. Offline Balance Tracking

### Real-time Balance Updates
The app tracks pending transactions locally:

```typescript
async updateOfflineBalanceTracking(chainId: string, amount: string, tokenInfo: TokenInfo): Promise<void> {
  const tracking = {
    pendingAmount: '0',
    lastUpdated: Date.now(),
    chainId,
    tokenSymbol: tokenInfo.symbol
  };
  
  // Add current transaction amount to pending
  const currentPending = BigInt(tracking.pendingAmount);
  const newAmount = tokenInfo.isNative 
    ? ethers.parseEther(amount)
    : ethers.parseUnits(amount, tokenInfo.decimals || 18);
  
  tracking.pendingAmount = (currentPending + BigInt(newAmount)).toString();
}
```

### Balance Clearing
When transactions are processed online, the tracking is updated:

```typescript
async clearOfflineBalanceTracking(chainId: string, amount: string, tokenInfo: TokenInfo): Promise<void> {
  // Subtract processed transaction amount from pending
  const currentPending = BigInt(tracking.pendingAmount);
  const processedAmount = tokenInfo.isNative 
    ? ethers.parseEther(amount)
    : ethers.parseUnits(amount, tokenInfo.decimals || 18);
  
  const newPending = currentPending - BigInt(processedAmount);
  tracking.pendingAmount = newPending > 0 ? newPending.toString() : '0';
}
```

## 5. Comprehensive Security Check

### Single Security Validation
All security checks are performed in one comprehensive method:

```typescript
async performOfflineSecurityCheck(
  to: string,
  amount: string,
  chainId: string,
  tokenInfo: TokenInfo
): Promise<void> {
  // Step 1: Validate balance
  await this.validateOfflineBalance(chainId, amount, tokenInfo);

  // Step 2: Check for duplicates
  await this.checkForDuplicateTransaction(to, amount, chainId);

  // Step 3: Validate nonce
  await this.validateOfflineNonce(chainId);

  // Step 4: Update tracking
  await this.updateOfflineBalanceTracking(chainId, amount, tokenInfo);
}
```

## 6. Enhanced Transaction Metadata

### Security Validation Tracking
Each queued transaction includes security validation metadata:

```typescript
await TxQueue.addTransaction({
  id: transactionId,
  to: request.to,
  amount: request.amount,
  status: 'pending',
  chainId: request.chainId,
  timestamp: Date.now(),
  signedTx: signedTx,
  transport: request.transport,
  metadata: {
    token: request.token,
    paymentReference: request.paymentReference,
    merchant: request.metadata?.merchant,
    location: request.metadata?.location,
    security: {
      balanceValidated: true,
      duplicateChecked: true,
      nonceValidated: true,
      offlineTimestamp: Date.now()
    }
  }
});
```

## 7. Error Handling and User Feedback

### Clear Error Messages
Users receive specific error messages for different security violations:

- **Insufficient Balance**: "Insufficient available balance. Required: $X, Available: $Y"
- **Duplicate Transaction**: "Duplicate transaction detected. This transaction is already queued."
- **Invalid Nonce**: "Invalid nonce for offline transaction. Please sync with network first."

### Logging and Monitoring
Comprehensive logging for security events:

```typescript
logger.info('[OfflineSecurity] Balance validation', {
  currentBalance: balance.balance,
  pendingAmount: pendingAmount.toString(),
  availableBalance: availableBalance.toString(),
  requiredAmount: requiredAmount.toString(),
  walletAddress: walletInfo.address,
  chainId
});
```

## 8. Transport-Specific Security

### QR Transport Security
- Balance validation before QR generation
- Nonce management for offline QR transactions
- Duplicate detection for QR payments

### BLE Transport Security
- Enhanced security checks for BLE payments
- Session validation and key exchange
- Encrypted payment data transmission

## 9. Network Status Detection

### Intelligent Online/Offline Detection
The app detects network status before processing transactions:

```typescript
async checkNetworkStatus(chainId: string): Promise<boolean> {
  try {
    const provider = this.providers[chainId];
    const blockNumber = await provider.getBlockNumber();
    return blockNumber > 0;
  } catch (error) {
    return false; // Assume offline if network check fails
  }
}
```

## 10. Automatic Sync and Recovery

### Queued Transaction Processing
When the user comes back online, queued transactions are automatically processed:

```typescript
async processQueuedTransactions(): Promise<void> {
  const pendingTxs = await this.getPendingTransactions();
  
  for (const tx of pendingTxs) {
    const isOnline = await this.checkNetworkStatus(tx.chainId);
    if (isOnline) {
      // Process the queued transaction
      const txResponse = await provider.broadcastTransaction(tx.signedTx);
      
      // Clear offline balance tracking
      await OfflineSecurityService.clearOfflineBalanceTracking(
        tx.chainId!, 
        tx.amount, 
        tokenInfo
      );
    }
  }
}
```

## Security Benefits

### ✅ Prevents Double-Spending
- Users cannot queue transactions exceeding their available balance
- Nonce management prevents transaction replay attacks
- Duplicate detection prevents identical transactions

### ✅ Maintains Data Integrity
- Real-time balance tracking during offline mode
- Automatic balance updates when transactions are processed
- Comprehensive logging for audit trails

### ✅ User Experience
- Clear error messages for security violations
- Automatic transaction processing when online
- Seamless offline-to-online transition

### ✅ Scalability
- Works across multiple blockchain networks
- Supports both native tokens and ERC-20 tokens
- Extensible for additional security measures

## Testing Scenarios

### Scenario 1: Insufficient Balance
1. User has $5 in wallet
2. User sends $3 offline → ✅ Allowed
3. User tries to send $4 offline → ❌ Rejected (insufficient available balance)

### Scenario 2: Duplicate Transaction
1. User sends $2 to Alice offline → ✅ Allowed
2. User tries to send $2 to Alice offline again → ❌ Rejected (duplicate detected)

### Scenario 3: Nonce Validation
1. User's current nonce: 5
2. User's offline nonce: 3
3. User sends transaction offline → ✅ Allowed (nonce 4)
4. User tries to send another transaction → ✅ Allowed (nonce 5)
5. User tries to send third transaction → ❌ Rejected (nonce would be 6, ahead of current)

### Scenario 4: Online Sync
1. User has 3 pending offline transactions
2. User comes back online
3. All transactions are processed automatically
4. Offline balance tracking is cleared
5. User can send new transactions normally

## Conclusion

The AirChainPay Wallet implements a comprehensive security framework that effectively prevents double-spending attacks in offline mode while maintaining a seamless user experience. The multi-layered approach ensures that users cannot exceed their available balance, create duplicate transactions, or manipulate transaction ordering through nonce management. 