// OfflineSecurityService for preventing double-spending in offline mode
import { logger } from '../utils/Logger';
import { TxQueue } from './TxQueue';
import { MultiChainWalletManager } from '../wallet/MultiChainWalletManager';
import { TokenInfo } from '../wallet/TokenWalletManager';
import { ethers } from 'ethers';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WalletError, TransactionError } from '../utils/ErrorClasses';

export interface OfflineBalanceTracking {
  pendingAmount: string;
  lastUpdated: number;
  chainId: string;
  tokenSymbol: string;
}

export interface OfflineNonceTracking {
  currentNonce: number;
  offlineNonce: number;
  lastUpdated: number;
  chainId: string;
}

export class OfflineSecurityService {
  private static instance: OfflineSecurityService;
  private walletManager: MultiChainWalletManager;

  private constructor() {
    this.walletManager = MultiChainWalletManager.getInstance();
  }

  public static getInstance(): OfflineSecurityService {
    if (!OfflineSecurityService.instance) {
      OfflineSecurityService.instance = new OfflineSecurityService();
    }
    return OfflineSecurityService.instance;
  }

  /**
   * Enhanced balance validation with force sync before offline transactions
   */
  async validateOfflineBalance(
    chainId: string, 
    amount: string, 
    tokenInfo: TokenInfo
  ): Promise<void> {
    try {
      // Force sync balance before allowing offline transaction
      const syncResult = await this.walletManager.forceBalanceSync(chainId);
      
      if (!syncResult.success) {
        throw new TransactionError(`Cannot proceed with offline transaction: ${syncResult.error}. Please check your internet connection and try again.`);
      }

      const walletInfo = await this.walletManager.getWalletInfo(chainId);
      if (!walletInfo) {
        throw new WalletError('No wallet found for chain');
      }

      // Use synced balance for validation
      const syncedBalance = await this.walletManager.getStoredSyncedBalance(chainId);
      let currentBalance: string;
      
      if (syncedBalance && (Date.now() - syncedBalance.timestamp) < 300000) { // 5 minutes
        // Use synced balance if it's recent
        currentBalance = syncedBalance.balance;
        logger.info('[OfflineSecurity] Using recent synced balance', {
          balance: currentBalance,
          timestamp: syncedBalance.timestamp,
          ageMinutes: (Date.now() - syncedBalance.timestamp) / 60000
        });
      } else {
        // Get current balance from wallet info
        const TokenWalletManager = (await import('../wallet/TokenWalletManager')).default;
        const balance = await TokenWalletManager.getTokenBalance(walletInfo.address, tokenInfo);
        currentBalance = balance.balance;
      }

      const requiredAmount = tokenInfo.isNative 
        ? ethers.parseEther(amount)
        : ethers.parseUnits(amount, tokenInfo.decimals || 18);

      // Get pending transactions total
      const pendingAmount = await this.getPendingTransactionsTotal(chainId, tokenInfo);
      
      // Calculate available balance (current balance - pending transactions)
      const availableBalance = BigInt(currentBalance) - BigInt(pendingAmount);
      
      logger.info('[OfflineSecurity] Enhanced balance validation', {
        currentBalance,
        pendingAmount: pendingAmount.toString(),
        availableBalance: availableBalance.toString(),
        requiredAmount: requiredAmount.toString(),
        walletAddress: walletInfo.address,
        chainId,
        syncedBalanceUsed: !!syncedBalance
      });

      if (availableBalance < BigInt(requiredAmount)) {
        throw new TransactionError(`Insufficient available balance. Required: ${ethers.formatEther(requiredAmount)}, Available: ${ethers.formatEther(availableBalance)}`);
      }

      logger.info('[OfflineSecurity] Enhanced balance validation passed');
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[OfflineSecurity] Enhanced balance validation failed:', error);
      } else {
        logger.error('[OfflineSecurity] Enhanced balance validation failed with unknown error:', error);
      }
      throw error;
    }
  }

  /**
   * Check for duplicate transactions
   */
  async checkForDuplicateTransaction(
    to: string, 
    amount: string, 
    chainId: string
  ): Promise<void> {
    try {
      const pendingTxs = await TxQueue.getPendingTransactions();
      
      // Check for exact duplicates (same recipient, amount, and chain)
      const duplicate = pendingTxs.find(tx => 
        tx.to === to && 
        tx.amount === amount && 
        tx.chainId === chainId &&
        tx.status === 'pending'
      );

      if (duplicate) {
        throw new TransactionError('Duplicate transaction detected. This transaction is already queued.');
      }

      // Check for similar transactions within a time window (5 minutes)
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      const recentSimilar = pendingTxs.find(tx => 
        tx.to === to && 
        tx.chainId === chainId &&
        tx.timestamp > fiveMinutesAgo &&
        tx.status === 'pending'
      );

      if (recentSimilar) {
        logger.warn('[OfflineSecurity] Similar transaction found within 5 minutes', {
          existing: recentSimilar,
          new: { to, amount, chainId }
        });
        // Don't throw error for similar transactions, just log warning
      }

      logger.info('[OfflineSecurity] Duplicate check passed');
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[OfflineSecurity] Duplicate check failed:', error);
      } else {
        logger.error('[OfflineSecurity] Duplicate check failed with unknown error:', error);
      }
      throw error;
    }
  }

  /**
   * Enhanced nonce validation with conflict detection and resolution
   */
  async validateOfflineNonce(chainId: string): Promise<void> {
    try {
      // Get current nonce from blockchain (if online) or from local storage
      const currentNonce = await this.getCurrentNonce(chainId);
      const offlineNonce = await this.getOfflineNonce(chainId);
      
      logger.info('[OfflineSecurity] Enhanced nonce validation', {
        currentNonce,
        offlineNonce,
        chainId
      });

      // Check for nonce conflicts
      const nonceConflict = await this.detectNonceConflict(chainId, currentNonce, offlineNonce);
      
      if (nonceConflict.hasConflict) {
        logger.warn('[OfflineSecurity] Nonce conflict detected', {
          chainId,
          currentNonce,
          offlineNonce,
          conflictType: nonceConflict.conflictType,
          suggestedAction: nonceConflict.suggestedAction
        });

        // Handle different types of conflicts
        switch (nonceConflict.conflictType) {
          case 'offline_ahead':
            // Offline nonce is ahead of current - this is dangerous
            throw new TransactionError('Offline nonce is ahead of blockchain nonce. Please sync with network first.');
            
          case 'blockchain_ahead':
            // Blockchain nonce is ahead - need to update offline nonce
            await this.updateOfflineNonce(chainId, currentNonce);
            logger.info('[OfflineSecurity] Updated offline nonce to match blockchain', { chainId, newNonce: currentNonce });
            break;
            
          case 'large_gap':
            // Large gap between nonces - suspicious
            throw new TransactionError('Large gap detected between offline and blockchain nonces. Please sync with network.');
            
          default:
            throw new TransactionError('Nonce conflict detected. Please sync with network first.');
        }
      }

      // Ensure offline nonce is not ahead of current nonce
      if (offlineNonce >= currentNonce) {
        throw new TransactionError('Invalid nonce for offline transaction. Please sync with network first.');
      }

      // Update offline nonce
      await this.updateOfflineNonce(chainId, offlineNonce + 1);
      
      logger.info('[OfflineSecurity] Enhanced nonce validation passed');
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[OfflineSecurity] Enhanced nonce validation failed:', error);
      } else {
        logger.error('[OfflineSecurity] Enhanced nonce validation failed with unknown error:', error);
      }
      throw error;
    }
  }

  /**
   * Detect nonce conflicts and suggest resolution
   */
  private async detectNonceConflict(
    chainId: string, 
    currentNonce: number, 
    offlineNonce: number
  ): Promise<{
    hasConflict: boolean;
    conflictType?: 'offline_ahead' | 'blockchain_ahead' | 'large_gap';
    suggestedAction?: string;
  }> {
    try {
      const gap = Math.abs(currentNonce - offlineNonce);
      const LARGE_GAP_THRESHOLD = 10; // Consider gaps > 10 as suspicious
      const MAX_NONCE_GAP = 100; // Maximum reasonable gap

      // Validate nonce values
      if (currentNonce < 0 || offlineNonce < 0) {
        logger.warn('[OfflineSecurity] Invalid nonce values detected', {
          currentNonce,
          offlineNonce,
          chainId
        });
        return {
          hasConflict: true,
          conflictType: 'large_gap',
          suggestedAction: 'Invalid nonce values detected. Please sync with network.'
        };
      }

      // Check for unreasonably large gaps
      if (gap > MAX_NONCE_GAP) {
        logger.warn('[OfflineSecurity] Unreasonably large nonce gap detected', {
          currentNonce,
          offlineNonce,
          gap,
          chainId
        });
        return {
          hasConflict: true,
          conflictType: 'large_gap',
          suggestedAction: 'Unreasonably large nonce gap detected. Please sync with network.'
        };
      }

      if (offlineNonce > currentNonce) {
        return {
          hasConflict: true,
          conflictType: 'offline_ahead',
          suggestedAction: 'Sync with network to update offline nonce'
        };
      }

      if (currentNonce > offlineNonce + 1) {
        return {
          hasConflict: true,
          conflictType: 'blockchain_ahead',
          suggestedAction: 'Update offline nonce to match blockchain'
        };
      }

      if (gap > LARGE_GAP_THRESHOLD) {
        return {
          hasConflict: true,
          conflictType: 'large_gap',
          suggestedAction: 'Manual verification required - large nonce gap detected'
        };
      }

      return { hasConflict: false };
    } catch (error: unknown) {
      logger.error('[OfflineSecurity] Error detecting nonce conflict:', error);
      return {
        hasConflict: true,
        conflictType: 'large_gap',
        suggestedAction: 'Error detecting nonce conflict. Please sync with network.'
      };
    }
  }

  /**
   * Get current nonce from blockchain or local storage
   */
  async getCurrentNonce(chainId: string): Promise<number> {
    try {
      // Try to get nonce from blockchain first
      const isOnline = await this.walletManager.checkNetworkStatus(chainId);
      if (isOnline) {
        const walletInfo = await this.walletManager.getWalletInfo(chainId);
        const provider = this.walletManager['providers'][chainId];
        const nonce = await provider.getTransactionCount(walletInfo.address);
        
        // Store the current nonce for offline use
        await this.storeCurrentNonce(chainId, nonce);
        
        return nonce;
      } else {
        // Use stored nonce if offline
        const storedNonce = await this.getStoredNonce(chainId);
        return storedNonce;
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[OfflineSecurity] Failed to get current nonce:', error);
      } else {
        logger.error('[OfflineSecurity] Failed to get current nonce with unknown error:', error);
      }
      // Fallback to stored nonce
      return await this.getStoredNonce(chainId);
    }
  }

  /**
   * Get offline nonce from local storage
   */
  async getOfflineNonce(chainId: string): Promise<number> {
    try {
      const key = `offline_nonce_${chainId}`;
      const stored = await AsyncStorage.getItem(key);
      return stored ? parseInt(stored, 10) : 0;
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[OfflineSecurity] Failed to get offline nonce:', error);
      } else {
        logger.error('[OfflineSecurity] Failed to get offline nonce with unknown error:', error);
      }
      return 0;
    }
  }

  /**
   * Update offline nonce in local storage
   */
  async updateOfflineNonce(chainId: string, nonce: number): Promise<void> {
    try {
      const key = `offline_nonce_${chainId}`;
      await AsyncStorage.setItem(key, nonce.toString());
      logger.info('[OfflineSecurity] Updated offline nonce', { chainId, nonce });
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[OfflineSecurity] Failed to update offline nonce:', error);
      } else {
        logger.error('[OfflineSecurity] Failed to update offline nonce with unknown error:', error);
      }
      throw error;
    }
  }

  /**
   * Store current nonce from blockchain
   */
  async storeCurrentNonce(chainId: string, nonce: number): Promise<void> {
    try {
      const key = `stored_nonce_${chainId}`;
      await AsyncStorage.setItem(key, nonce.toString());
      logger.info('[OfflineSecurity] Stored current nonce', { chainId, nonce });
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[OfflineSecurity] Failed to store current nonce:', error);
      } else {
        logger.error('[OfflineSecurity] Failed to store current nonce with unknown error:', error);
      }
    }
  }

  /**
   * Get stored nonce from local storage
   */
  async getStoredNonce(chainId: string): Promise<number> {
    try {
      const key = `stored_nonce_${chainId}`;
      const stored = await AsyncStorage.getItem(key);
      return stored ? parseInt(stored, 10) : 0;
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[OfflineSecurity] Failed to get stored nonce:', error);
      } else {
        logger.error('[OfflineSecurity] Failed to get stored nonce with unknown error:', error);
      }
      return 0;
    }
  }

  /**
   * Get total amount of pending transactions for a specific chain and token
   */
  async getPendingTransactionsTotal(chainId: string, tokenInfo: TokenInfo): Promise<bigint> {
    try {
      const pendingTxs = await TxQueue.getPendingTransactions();
      let total = BigInt(0);

      for (const tx of pendingTxs) {
        if (tx.chainId === chainId && tx.status === 'pending') {
          const txAmount = tokenInfo.isNative 
            ? ethers.parseEther(tx.amount)
            : ethers.parseUnits(tx.amount, tokenInfo.decimals || 18);
          total += BigInt(txAmount);
        }
      }

      logger.info('[OfflineSecurity] Pending transactions total', {
        chainId,
        total: total.toString(),
        pendingCount: pendingTxs.filter(tx => tx.chainId === chainId && tx.status === 'pending').length
      });

      return total;
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[OfflineSecurity] Failed to get pending transactions total:', error);
      } else {
        logger.error('[OfflineSecurity] Failed to get pending transactions total with unknown error:', error);
      }
      return BigInt(0);
    }
  }

  /**
   * Update offline balance tracking
   */
  async updateOfflineBalanceTracking(
    chainId: string, 
    amount: string, 
    tokenInfo: TokenInfo
  ): Promise<void> {
    try {
      const key = `offline_balance_${chainId}`;
      
      // Get current offline balance tracking
      const stored = await AsyncStorage.getItem(key);
      const tracking: OfflineBalanceTracking = stored ? JSON.parse(stored) : { 
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
      tracking.lastUpdated = Date.now();
      
      await AsyncStorage.setItem(key, JSON.stringify(tracking));
      
      logger.info('[OfflineSecurity] Updated offline balance tracking', {
        chainId,
        newPendingAmount: tracking.pendingAmount,
        transactionAmount: amount,
        tokenSymbol: tokenInfo.symbol
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[OfflineSecurity] Failed to update offline balance tracking:', error);
      } else {
        logger.error('[OfflineSecurity] Failed to update offline balance tracking with unknown error:', error);
      }
      // Don't throw error as this is not critical
    }
  }

  /**
   * Clear offline balance tracking when transactions are processed
   */
  async clearOfflineBalanceTracking(chainId: string, amount: string, tokenInfo: TokenInfo): Promise<void> {
    try {
      const key = `offline_balance_${chainId}`;
      
      // Get current offline balance tracking
      const stored = await AsyncStorage.getItem(key);
      if (!stored) return;
      
      const tracking: OfflineBalanceTracking = JSON.parse(stored);
      
      // Subtract processed transaction amount from pending
      const currentPending = BigInt(tracking.pendingAmount);
      const processedAmount = tokenInfo.isNative 
        ? ethers.parseEther(amount)
        : ethers.parseUnits(amount, tokenInfo.decimals || 18);
      
      const newPending = currentPending - BigInt(processedAmount);
      tracking.pendingAmount = newPending > 0 ? newPending.toString() : '0';
      tracking.lastUpdated = Date.now();
      
      await AsyncStorage.setItem(key, JSON.stringify(tracking));
      
      logger.info('[OfflineSecurity] Cleared offline balance tracking', {
        chainId,
        newPendingAmount: tracking.pendingAmount,
        processedAmount: amount,
        tokenSymbol: tokenInfo.symbol
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[OfflineSecurity] Failed to clear offline balance tracking:', error);
      } else {
        logger.error('[OfflineSecurity] Failed to clear offline balance tracking with unknown error:', error);
      }
    }
  }

  /**
   * Get offline balance tracking for a specific chain
   */
  async getOfflineBalanceTracking(chainId: string): Promise<OfflineBalanceTracking | null> {
    try {
      const key = `offline_balance_${chainId}`;
      const stored = await AsyncStorage.getItem(key);
      return stored ? JSON.parse(stored) : null;
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[OfflineSecurity] Failed to get offline balance tracking:', error);
      } else {
        logger.error('[OfflineSecurity] Failed to get offline balance tracking with unknown error:', error);
      }
      return null;
    }
  }

  /**
   * Get offline nonce tracking for a specific chain
   */
  async getOfflineNonceTracking(chainId: string): Promise<OfflineNonceTracking | null> {
    try {
      const currentNonce = await this.getCurrentNonce(chainId);
      const offlineNonce = await this.getOfflineNonce(chainId);
      
      return {
        currentNonce,
        offlineNonce,
        lastUpdated: Date.now(),
        chainId
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[OfflineSecurity] Failed to get offline nonce tracking:', error);
      } else {
        logger.error('[OfflineSecurity] Failed to get offline nonce tracking with unknown error:', error);
      }
      return null;
    }
  }

  /**
   * Reset offline tracking for a specific chain (useful after successful sync)
   */
  async resetOfflineTracking(chainId: string): Promise<void> {
    try {
      const balanceKey = `offline_balance_${chainId}`;
      const offlineNonceKey = `offline_nonce_${chainId}`;
      
      await AsyncStorage.removeItem(balanceKey);
      await AsyncStorage.removeItem(offlineNonceKey);
      
      logger.info('[OfflineSecurity] Reset offline tracking', { chainId });
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[OfflineSecurity] Failed to reset offline tracking:', error);
      } else {
        logger.error('[OfflineSecurity] Failed to reset offline tracking with unknown error:', error);
      }
    }
  }

  /**
   * Comprehensive security check for offline transactions with cross-wallet protection
   */
  async performOfflineSecurityCheck(
    to: string,
    amount: string,
    chainId: string,
    tokenInfo: TokenInfo
  ): Promise<void> {
    try {
      logger.info('[OfflineSecurity] Performing comprehensive security check with cross-wallet protection', {
        to,
        amount,
        chainId,
        tokenSymbol: tokenInfo.symbol
      });

      // Step 1: Perform cross-wallet security check (NEW) - using dynamic import to avoid require cycle
      try {
        const { CrossWalletSecurityService } = await import('./CrossWalletSecurityService');
        const crossWalletService = CrossWalletSecurityService.getInstance();
        await crossWalletService.performCrossWalletSecurityCheck(to, amount, chainId, tokenInfo);
      } catch (error) {
        logger.warn('[OfflineSecurity] Cross-wallet security check failed, continuing with internal checks:', error);
        // Continue with internal checks even if cross-wallet check fails
      }

      // Step 2: Validate internal balance (existing)
      await this.validateOfflineBalance(chainId, amount, tokenInfo);

      // Step 3: Check for duplicates (existing)
      await this.checkForDuplicateTransaction(to, amount, chainId);

      // Step 4: Validate nonce (existing)
      await this.validateOfflineNonce(chainId);

      // Step 5: Update tracking (existing)
      await this.updateOfflineBalanceTracking(chainId, amount, tokenInfo);

      logger.info('[OfflineSecurity] Comprehensive security check with cross-wallet protection passed');
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[OfflineSecurity] Comprehensive security check failed:', error);
      } else {
        logger.error('[OfflineSecurity] Comprehensive security check failed with unknown error:', error);
      }
      throw error;
    }
  }
}

export default OfflineSecurityService.getInstance(); 