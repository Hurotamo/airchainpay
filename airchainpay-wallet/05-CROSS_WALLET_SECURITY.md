# AirChainPay Wallet - Cross-Wallet Security Measures

## Overview

This document addresses the security vulnerabilities that arise when users have the same wallet address in both AirChainPay and other EVM-compatible wallets, and provides comprehensive solutions to prevent cross-wallet double-spending attacks.

## 🚨 Cross-Wallet Double-Spending Vulnerability

### Problem Statement
When a user imports the same private key or seed phrase into multiple wallets (AirChainPay + MetaMask, Trust Wallet, etc.), they control the same address across different applications. This creates a potential for:

1. **Race Conditions**: Multiple wallets attempting transactions simultaneously
2. **Nonce Conflicts**: Different wallets using the same nonce
3. **Insufficient Funds**: One wallet's transaction depleting funds before another's transaction processes
4. **Double-Spending**: Intentional or accidental spending of the same funds multiple times

### Current AirChainPay Limitations
- ✅ Prevents internal double-spending within AirChainPay
- ❌ Cannot detect transactions from external wallets
- ❌ No cross-wallet communication or synchronization
- ❌ No real-time balance monitoring from other wallets

## 🔧 Proposed Security Solutions

### 1. Real-Time Blockchain Monitoring

#### Enhanced Balance Validation
```typescript
async validateCrossWalletBalance(chainId: string, amount: string, tokenInfo: TokenInfo): Promise<void> {
  // Get real-time balance from blockchain
  const realTimeBalance = await this.getRealTimeBalance(chainId, tokenInfo);
  
  // Get pending transactions from AirChainPay
  const airchainpayPending = await this.getPendingTransactionsTotal(chainId, tokenInfo);
  
  // Get recent transactions from blockchain (last 10 blocks)
  const recentTxs = await this.getRecentTransactions(chainId, 10);
  const externalPending = this.calculateExternalPending(recentTxs);
  
  // Calculate truly available balance
  const availableBalance = BigInt(realTimeBalance) - BigInt(airchainpayPending) - BigInt(externalPending);
  
  if (availableBalance < BigInt(requiredAmount)) {
    throw new Error(`Insufficient available balance. External wallet activity detected.`);
  }
}
```

#### Recent Transaction Analysis
```typescript
async getRecentTransactions(chainId: string, blockCount: number): Promise<Transaction[]> {
  const provider = this.providers[chainId];
  const currentBlock = await provider.getBlockNumber();
  const transactions: Transaction[] = [];
  
  for (let i = 0; i < blockCount; i++) {
    const block = await provider.getBlock(currentBlock - i);
    if (block) {
      const blockTxs = await Promise.all(
        block.transactions.map(async (txHash) => {
          const tx = await provider.getTransaction(txHash);
          return tx;
        })
      );
      transactions.push(...blockTxs);
    }
  }
  
  return transactions.filter(tx => tx && tx.from === this.walletAddress);
}
```

### 2. Enhanced Nonce Management

#### Cross-Wallet Nonce Synchronization
```typescript
async validateCrossWalletNonce(chainId: string): Promise<void> {
  // Get current nonce from blockchain
  const blockchainNonce = await this.getBlockchainNonce(chainId);
  
  // Get AirChainPay's offline nonce
  const airchainpayNonce = await this.getOfflineNonce(chainId);
  
  // Get recent transactions to detect external wallet activity
  const recentTxs = await this.getRecentTransactions(chainId, 5);
  const externalNonce = this.getHighestNonceFromTransactions(recentTxs);
  
  // Use the highest nonce from all sources
  const effectiveNonce = Math.max(blockchainNonce, externalNonce, airchainpayNonce);
  
  if (airchainpayNonce < effectiveNonce) {
    // Update AirChainPay's nonce to match external activity
    await this.updateOfflineNonce(chainId, effectiveNonce + 1);
  }
}
```

### 3. Cross-Wallet Activity Detection

#### External Wallet Activity Monitoring
```typescript
async detectExternalWalletActivity(chainId: string): Promise<{
  hasActivity: boolean;
  lastTransaction: number;
  pendingAmount: string;
}> {
  const recentTxs = await this.getRecentTransactions(chainId, 20);
  const walletAddress = await this.getWalletAddress(chainId);
  
  // Filter transactions from this wallet
  const walletTxs = recentTxs.filter(tx => 
    tx.from.toLowerCase() === walletAddress.toLowerCase()
  );
  
  // Check for transactions not initiated by AirChainPay
  const externalTxs = walletTxs.filter(tx => 
    !this.isAirChainPayTransaction(tx)
  );
  
  return {
    hasActivity: externalTxs.length > 0,
    lastTransaction: externalTxs.length > 0 ? externalTxs[0].timestamp : 0,
    pendingAmount: this.calculatePendingAmount(externalTxs)
  };
}
```

### 4. Enhanced Security Warnings

#### User Notification System
```typescript
async checkCrossWalletSecurity(chainId: string): Promise<SecurityWarning[]> {
  const warnings: SecurityWarning[] = [];
  
  // Check for external wallet activity
  const externalActivity = await this.detectExternalWalletActivity(chainId);
  
  if (externalActivity.hasActivity) {
    warnings.push({
      type: 'EXTERNAL_WALLET_ACTIVITY',
      severity: 'HIGH',
      message: 'External wallet activity detected. Your balance may have changed.',
      timestamp: Date.now(),
      details: {
        lastTransaction: externalActivity.lastTransaction,
        pendingAmount: externalActivity.pendingAmount
      }
    });
  }
  
  // Check for nonce conflicts
  const nonceConflict = await this.detectNonceConflict(chainId);
  if (nonceConflict) {
    warnings.push({
      type: 'NONCE_CONFLICT',
      severity: 'CRITICAL',
      message: 'Nonce conflict detected. Please sync your wallet.',
      timestamp: Date.now()
    });
  }
  
  return warnings;
}
```

### 5. Automatic Recovery Mechanisms

#### Transaction Conflict Resolution
```typescript
async resolveTransactionConflicts(chainId: string): Promise<void> {
  // Get all pending transactions
  const pendingTxs = await TxQueue.getPendingTransactions();
  const chainTxs = pendingTxs.filter(tx => tx.chainId === chainId);
  
  for (const tx of chainTxs) {
    try {
      // Check if transaction is still valid
      const isValid = await this.validateTransactionStillValid(tx);
      
      if (!isValid) {
        // Remove invalid transaction from queue
        await TxQueue.removeTransaction(tx.id);
        
        // Update balance tracking
        await this.clearOfflineBalanceTracking(
          tx.chainId!,
          tx.amount,
          tx.metadata?.token
        );
        
        logger.warn('[CrossWallet] Removed invalid transaction from queue:', tx.id);
      }
    } catch (error) {
      logger.error('[CrossWallet] Failed to validate transaction:', error);
    }
  }
}
```

### 6. User Education and Prevention

#### Cross-Wallet Usage Guidelines
```typescript
async showCrossWalletWarning(): Promise<void> {
  const warning = {
    title: 'Cross-Wallet Usage Warning',
    message: 'You have the same wallet address in multiple applications. This can cause transaction conflicts.',
    recommendations: [
      'Use only one wallet application at a time',
      'Check your balance before making transactions',
      'Wait for transactions to confirm before making new ones',
      'Consider using different wallets for different purposes'
    ],
    actions: [
      {
        text: 'I Understand',
        action: 'dismiss'
      },
      {
        text: 'Show Me My Options',
        action: 'showOptions'
      }
    ]
  };
  
  await this.displaySecurityWarning(warning);
}
```

## Implementation Priority

### Phase 1: Basic Detection (High Priority)
1. Real-time blockchain balance monitoring
2. Recent transaction analysis
3. Basic external wallet activity detection
4. User warnings for cross-wallet usage

### Phase 2: Enhanced Protection (Medium Priority)
1. Cross-wallet nonce synchronization
2. Automatic transaction conflict resolution
3. Enhanced balance validation
4. Transaction validity checking

### Phase 3: Advanced Features (Low Priority)
1. Multi-wallet synchronization
2. Cross-wallet transaction history
3. Advanced conflict resolution
4. User preference management

## Security Benefits

### ✅ Prevents Cross-Wallet Conflicts
- Detects external wallet activity in real-time
- Synchronizes nonces across wallet applications
- Validates transactions before processing

### ✅ Improves User Experience
- Clear warnings about cross-wallet usage
- Automatic conflict resolution
- Real-time balance updates

### ✅ Maintains Security
- Prevents double-spending across wallets
- Validates transaction integrity
- Comprehensive logging and monitoring

## Testing Scenarios

### Scenario 1: External Wallet Transaction
1. User has $10 in wallet
2. External wallet sends $5 transaction
3. AirChainPay detects external activity
4. AirChainPay updates available balance to $5
5. User tries to send $8 in AirChainPay → **REJECTED**

### Scenario 2: Nonce Synchronization
1. External wallet uses nonce 5
2. AirChainPay offline nonce is 4
3. AirChainPay detects external activity
4. AirChainPay updates nonce to 6
5. Next AirChainPay transaction uses nonce 6 → **SUCCESS**

### Scenario 3: Conflict Resolution
1. AirChainPay has pending transaction with nonce 5
2. External wallet sends transaction with nonce 5
3. AirChainPay detects conflict
4. AirChainPay removes invalid transaction from queue
5. User is notified of the conflict

## Conclusion

The cross-wallet security measures provide comprehensive protection against double-spending attacks when users have the same wallet address in multiple applications. The multi-layered approach ensures real-time detection, automatic conflict resolution, and clear user communication about potential risks. 