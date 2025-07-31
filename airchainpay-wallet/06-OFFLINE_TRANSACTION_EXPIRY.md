# AirChainPay Wallet - Offline Transaction Expiry Solution

## Overview

This document outlines the comprehensive solution implemented in AirChainPay Wallet to prevent permanent fund locking when users perform offline transactions and never go online again.

## 🚨 The Problem: Permanent Fund Locking

### Problem Statement
When a user performs offline transactions and never goes online again, their funds could be **permanently locked** in the offline queue:

1. **User creates offline transaction** → Funds deducted from available balance
2. **User never goes online** → Transaction never gets processed
3. **Funds remain locked** → User cannot access their funds for other transactions
4. **Permanent lock** → Funds are effectively lost until user goes online

### Example Scenario
- User has $10 in wallet
- User sends $5 offline → Available balance: $5 (pending transaction)
- User never goes online again
- User tries to send $8 → **REJECTED** (only $5 available)
- User's $5 remains locked indefinitely

## ✅ Solution: Offline Transaction Expiry

### 1. Automatic Expiry System

#### Configurable Expiry Period
```typescript
interface TransactionExpiryConfig {
  maxOfflineDuration: number; // 24 hours (default)
  warningThreshold: number; // 12 hours (default)
  cleanupInterval: number; // 1 hour (default)
  maxRetryAttempts: number; // 3 (default)
  retryDelay: number; // 30 minutes (default)
}
```

#### Expiry Timeline
- **0-12 hours**: Transaction pending, no warnings
- **12-24 hours**: Warning notifications to user
- **24+ hours**: Automatic cancellation and fund release

### 2. Real-Time Monitoring

#### Continuous Monitoring
```typescript
startExpiryMonitoring(): void {
  // Check for warnings every 15 minutes
  const warningInterval = setInterval(async () => {
    await this.checkExpiryWarnings();
  }, 15 * 60 * 1000);
  
  // Perform cleanup every hour
  const cleanupInterval = setInterval(async () => {
    await this.performExpiryCleanup();
  }, this.config.cleanupInterval);
}
```

#### Warning System
- **12 hours before expiry**: HIGH severity warning
- **2 hours before expiry**: CRITICAL severity warning
- **At expiry**: Automatic cancellation

### 3. Automatic Cleanup

#### Expired Transaction Handling
```typescript
async performExpiryCleanup(): Promise<void> {
  for (const tx of pendingTxs) {
    const timeSinceCreation = now - tx.timestamp;
    
    if (timeSinceCreation >= this.config.maxOfflineDuration) {
      // Remove from queue
      await TxQueue.removeTransaction(tx.id);
      
      // Clear balance tracking
      await this.clearOfflineBalanceTracking(tx);
      
      // Update status to expired
      await TxQueue.updateTransaction(tx.id, {
        status: 'expired',
        error: 'Transaction expired - funds returned to available balance'
      });
    }
  }
}
```

### 4. Balance Recovery

#### Automatic Fund Release
When a transaction expires:
1. **Remove from queue** → Transaction no longer pending
2. **Clear balance tracking** → Funds returned to available balance
3. **Update status** → Mark as expired
4. **Store history** → Keep record for user reference

#### Balance Tracking Cleanup
```typescript
private async clearOfflineBalanceTracking(tx: any): Promise<void> {
  const currentPending = BigInt(tracking.pendingAmount);
  const transactionAmount = BigInt(amount);
  
  // Subtract expired transaction amount from pending
  const newPending = currentPending > transactionAmount 
    ? currentPending - transactionAmount 
    : BigInt(0);
  
  tracking.pendingAmount = newPending.toString();
}
```

## 🔧 Implementation Components

### 1. OfflineTransactionExpiryService

#### Core Features
- **Real-time monitoring** of pending transactions
- **Automatic cleanup** of expired transactions
- **Warning system** for approaching expiry
- **Balance recovery** for expired transactions
- **Manual cancellation** support

#### Key Methods
```typescript
// Start monitoring
startExpiryMonitoring(): void

// Check for warnings
checkExpiryWarnings(): Promise<void>

// Perform cleanup
performExpiryCleanup(): Promise<void>

// Manual cancellation
cancelPendingTransaction(transactionId: string): Promise<void>

// Get expiry status
getTransactionExpiryStatus(transactionId: string): Promise<ExpiryStatus>
```

### 2. OfflineTransactionExpiryWarning Component

#### UI Features
- **Real-time warnings** for approaching expiry
- **Transaction details** display
- **Manual cancellation** buttons
- **Pending transaction summary**
- **Educational information** about expiry

#### Warning Types
- **TRANSACTION_EXPIRY_WARNING**: Approaching expiry
- **TRANSACTION_EXPIRED**: Transaction has expired
- **FUNDS_LOCKED**: Critical warning about locked funds

### 3. Integration with Existing Systems

#### Enhanced OfflineSecurityService
```typescript
async performOfflineSecurityCheck(
  to: string,
  amount: string,
  chainId: string,
  tokenInfo: TokenInfo
): Promise<void> {
  // Step 1: Perform cross-wallet security check
  await crossWalletService.performCrossWalletSecurityCheck(to, amount, chainId, tokenInfo);
  
  // Step 2: Validate internal balance
  await this.validateOfflineBalance(chainId, amount, tokenInfo);
  
  // Step 3: Check for duplicates
  await this.checkForDuplicateTransaction(to, amount, chainId);
  
  // Step 4: Validate nonce
  await this.validateOfflineNonce(chainId);
  
  // Step 5: Update tracking
  await this.updateOfflineBalanceTracking(chainId, amount, tokenInfo);
}
```

## 📱 User Experience

### 1. Warning Notifications

#### Progressive Warnings
- **12 hours before**: "Transaction will expire in 12h. Please go online to process it."
- **2 hours before**: "CRITICAL: Transaction expires in 2h. Go online now!"
- **At expiry**: "Transaction expired and cancelled. Funds returned to wallet."

#### Visual Indicators
- **Color-coded warnings**: Red for critical, orange for high, yellow for medium
- **Time remaining**: Clear countdown display
- **Action buttons**: View details, cancel transaction

### 2. Transaction Management

#### User Actions
- **View transaction details**: See recipient, amount, creation time
- **Cancel transaction**: Manually cancel before expiry
- **Learn about expiry**: Educational information
- **Monitor status**: Real-time expiry countdown

#### Automatic Actions
- **Fund recovery**: Automatic balance restoration
- **Queue cleanup**: Remove expired transactions
- **Status updates**: Mark as expired/cancelled

## 🛡️ Security Benefits

### ✅ Prevents Permanent Fund Locking
- **Automatic expiry**: No transaction stays pending forever
- **Fund recovery**: Expired transactions return funds to available balance
- **Clear timeline**: Users know exactly when transactions expire

### ✅ Maintains User Control
- **Manual cancellation**: Users can cancel transactions anytime
- **Warning system**: Users are notified before expiry
- **Educational**: Users understand the expiry system

### ✅ Preserves Transaction Integrity
- **Nonce management**: Expired transactions don't affect nonce
- **Balance accuracy**: Accurate tracking of available funds
- **History tracking**: Complete record of expired transactions

## 📊 Configuration Options

### Default Settings
```typescript
const defaultConfig = {
  maxOfflineDuration: 24 * 60 * 60 * 1000, // 24 hours
  warningThreshold: 12 * 60 * 60 * 1000, // 12 hours
  cleanupInterval: 60 * 60 * 1000, // 1 hour
  maxRetryAttempts: 3,
  retryDelay: 30 * 60 * 1000 // 30 minutes
};
```

### Customizable Parameters
- **Expiry duration**: How long before transactions expire
- **Warning threshold**: When to start showing warnings
- **Cleanup frequency**: How often to check for expired transactions
- **Retry attempts**: Number of retry attempts before giving up

## 🧪 Testing Scenarios

### Scenario 1: Normal Expiry
1. User creates offline transaction at 2:00 PM
2. 12:00 PM next day → Warning appears
3. 2:00 PM next day → Transaction expires automatically
4. Funds returned to available balance

### Scenario 2: Manual Cancellation
1. User creates offline transaction
2. User sees warning and decides to cancel
3. User clicks "Cancel Transaction"
4. Transaction removed from queue, funds returned

### Scenario 3: Multiple Transactions
1. User has 3 pending offline transactions
2. Each transaction has different creation times
3. Each transaction expires independently
4. Funds returned as each transaction expires

### Scenario 4: User Goes Online
1. User has pending offline transactions
2. User goes online before expiry
3. Transactions are processed normally
4. No expiry occurs

## 🔄 Integration with Existing Systems

### 1. Cross-Wallet Security
- **Enhanced balance validation**: Considers expiry status
- **Nonce synchronization**: Expired transactions don't affect nonce
- **External activity detection**: Works with cross-wallet monitoring

### 2. Offline Security
- **Balance tracking**: Accurate available balance calculation
- **Duplicate detection**: Prevents duplicate expired transactions
- **Security validation**: Comprehensive checks before queueing

### 3. Transaction Queue
- **Automatic cleanup**: Removes expired transactions
- **Status updates**: Marks transactions as expired
- **History preservation**: Keeps record of expired transactions

## 📈 Monitoring and Analytics

### 1. Expiry Metrics
- **Expiry rate**: Percentage of transactions that expire
- **Average time to expiry**: How long transactions stay pending
- **Cancellation rate**: How often users manually cancel

### 2. User Behavior
- **Warning response**: How users react to expiry warnings
- **Online patterns**: When users typically go online
- **Transaction patterns**: Types of transactions that expire

### 3. System Performance
- **Cleanup efficiency**: How quickly expired transactions are processed
- **Memory usage**: Impact of monitoring on device performance
- **Storage usage**: Size of expired transaction history

## 🚀 Future Enhancements

### 1. Advanced Features
- **Smart expiry**: Adjust expiry time based on network conditions
- **Batch processing**: Process multiple expired transactions efficiently
- **Predictive warnings**: Warn users based on their online patterns

### 2. User Experience
- **Push notifications**: Alert users about approaching expiry
- **Offline mode indicators**: Show when device is offline
- **Transaction scheduling**: Allow users to schedule online time

### 3. Analytics
- **Expiry analytics**: Detailed reporting on expiry patterns
- **User insights**: Understanding of user behavior
- **Performance optimization**: Continuous improvement of expiry system

## Conclusion

The offline transaction expiry solution provides comprehensive protection against permanent fund locking while maintaining user control and transaction integrity. The system ensures that no funds can be permanently locked in offline transactions, while providing clear warnings and educational information to help users understand and manage their offline transactions effectively.

**Key Benefits:**
- ✅ **Prevents permanent fund locking**
- ✅ **Automatic fund recovery**
- ✅ **Clear user warnings**
- ✅ **Manual cancellation support**
- ✅ **Educational user experience**
- ✅ **Comprehensive monitoring**
- ✅ **Configurable parameters**
- ✅ **Integration with existing security systems** 