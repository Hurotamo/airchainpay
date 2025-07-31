// OfflineTransactionExpiryService for handling offline transaction expiry and cleanup
import { logger } from '../utils/Logger';
import { TxQueue } from './TxQueue';
import { OfflineSecurityService } from './OfflineSecurityService';
import { CrossWalletSecurityService } from './CrossWalletSecurityService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TransactionError } from '../utils/ErrorClasses';

export interface TransactionExpiryConfig {
  maxOfflineDuration: number; // milliseconds (default: 24 hours)
  warningThreshold: number; // milliseconds (default: 12 hours)
  cleanupInterval: number; // milliseconds (default: 1 hour)
  maxRetryAttempts: number; // default: 3
  retryDelay: number; // milliseconds (default: 30 minutes)
}

export interface ExpiredTransaction {
  id: string;
  to: string;
  amount: string;
  chainId: string;
  timestamp: number;
  expiryTime: number;
  retryCount: number;
  status: 'expired' | 'failed' | 'cancelled';
  reason: string;
}

export interface ExpiryWarning {
  type: 'TRANSACTION_EXPIRY_WARNING' | 'TRANSACTION_EXPIRED' | 'FUNDS_LOCKED';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  timestamp: number;
  details: {
    transactionId: string;
    timeUntilExpiry: number;
    amount: string;
    recipient: string;
    chainId: string;
  };
}

export class OfflineTransactionExpiryService {
  private static instance: OfflineTransactionExpiryService;
  private offlineSecurityService: OfflineSecurityService;
  private crossWalletService: CrossWalletSecurityService;
  private config: TransactionExpiryConfig;
  private cleanupIntervals: Map<string, NodeJS.Timeout> = new Map();
  private warningCallbacks: ((warning: ExpiryWarning) => void)[] = [];

  private constructor() {
    this.offlineSecurityService = OfflineSecurityService.getInstance();
    this.crossWalletService = CrossWalletSecurityService.getInstance();
    this.config = {
      maxOfflineDuration: 24 * 60 * 60 * 1000, // 24 hours
      warningThreshold: 12 * 60 * 60 * 1000, // 12 hours
      cleanupInterval: 60 * 60 * 1000, // 1 hour
      maxRetryAttempts: 3,
      retryDelay: 30 * 60 * 1000 // 30 minutes
    };
  }

  public static getInstance(): OfflineTransactionExpiryService {
    if (!OfflineTransactionExpiryService.instance) {
      OfflineTransactionExpiryService.instance = new OfflineTransactionExpiryService();
    }
    return OfflineTransactionExpiryService.instance;
  }

  /**
   * Start monitoring for offline transaction expiry
   */
  startExpiryMonitoring(): void {
    logger.info('[OfflineExpiry] Starting offline transaction expiry monitoring');
    
    // Clear existing intervals
    this.stopExpiryMonitoring();
    
    // Start cleanup interval
    const cleanupInterval = setInterval(async () => {
      await this.performExpiryCleanup();
    }, this.config.cleanupInterval);
    
    this.cleanupIntervals.set('cleanup', cleanupInterval);
    
    // Start warning interval (check every 15 minutes)
    const warningInterval = setInterval(async () => {
      await this.checkExpiryWarnings();
    }, 15 * 60 * 1000);
    
    this.cleanupIntervals.set('warnings', warningInterval);
    
    logger.info('[OfflineExpiry] Expiry monitoring started');
  }

  /**
   * Stop monitoring for offline transaction expiry
   */
  stopExpiryMonitoring(): void {
    for (const [key, interval] of this.cleanupIntervals.entries()) {
      clearInterval(interval);
      logger.info(`[OfflineExpiry] Stopped ${key} monitoring`);
    }
    this.cleanupIntervals.clear();
  }

  /**
   * Add callback for expiry warnings
   */
  onExpiryWarning(callback: (warning: ExpiryWarning) => void): void {
    this.warningCallbacks.push(callback);
  }

  /**
   * Remove callback for expiry warnings
   */
  removeExpiryWarningCallback(callback: (warning: ExpiryWarning) => void): void {
    const index = this.warningCallbacks.indexOf(callback);
    if (index > -1) {
      this.warningCallbacks.splice(index, 1);
    }
  }

  /**
   * Check for transactions approaching expiry and send warnings
   */
  async checkExpiryWarnings(): Promise<void> {
    try {
      const pendingTxs = await TxQueue.getPendingTransactions();
      const now = Date.now();
      
      for (const tx of pendingTxs) {
        if (tx.status !== 'pending') continue;
        
        const timeSinceCreation = now - tx.timestamp;
        const timeUntilExpiry = this.config.maxOfflineDuration - timeSinceCreation;
        
        // Check if transaction is approaching expiry
        if (timeUntilExpiry <= this.config.warningThreshold && timeUntilExpiry > 0) {
          const warning: ExpiryWarning = {
            type: 'TRANSACTION_EXPIRY_WARNING',
            severity: timeUntilExpiry <= 2 * 60 * 60 * 1000 ? 'CRITICAL' : 'HIGH', // Critical if < 2 hours
            message: `Offline transaction will expire in ${this.formatTimeRemaining(timeUntilExpiry)}. Please go online to process it.`,
            timestamp: now,
            details: {
              transactionId: tx.id,
              timeUntilExpiry,
              amount: tx.amount,
              recipient: tx.to,
              chainId: tx.chainId || 'unknown'
            }
          };
          
          this.notifyWarningCallbacks(warning);
          logger.warn('[OfflineExpiry] Transaction expiry warning:', warning);
        }
        
        // Check if transaction has expired
        if (timeUntilExpiry <= 0) {
          const expiredWarning: ExpiryWarning = {
            type: 'TRANSACTION_EXPIRED',
            severity: 'CRITICAL',
            message: `Offline transaction has expired and will be cancelled. Your funds are still safe in your wallet.`,
            timestamp: now,
            details: {
              transactionId: tx.id,
              timeUntilExpiry: 0,
              amount: tx.amount,
              recipient: tx.to,
              chainId: tx.chainId || 'unknown'
            }
          };
          
          this.notifyWarningCallbacks(expiredWarning);
          logger.error('[OfflineExpiry] Transaction expired:', expiredWarning);
        }
      }
    } catch (error) {
      logger.error('[OfflineExpiry] Failed to check expiry warnings:', error);
    }
  }

  /**
   * Perform cleanup of expired transactions
   */
  async performExpiryCleanup(): Promise<void> {
    try {
      const pendingTxs = await TxQueue.getPendingTransactions();
      const now = Date.now();
      const expiredTxs: ExpiredTransaction[] = [];
      
      for (const tx of pendingTxs) {
        if (tx.status !== 'pending') continue;
        
        const timeSinceCreation = now - tx.timestamp;
        
        // Check if transaction has expired
        if (timeSinceCreation >= this.config.maxOfflineDuration) {
          const expiredTx: ExpiredTransaction = {
            id: tx.id,
            to: tx.to,
            amount: tx.amount,
            chainId: tx.chainId || 'unknown',
            timestamp: tx.timestamp,
            expiryTime: now,
            retryCount: 0,
            status: 'expired',
            reason: 'Transaction exceeded maximum offline duration'
          };
          
          expiredTxs.push(expiredTx);
          
          // Remove from queue and clear balance tracking
          await this.handleExpiredTransaction(tx, expiredTx);
        }
      }
      
      if (expiredTxs.length > 0) {
        logger.info('[OfflineExpiry] Cleaned up expired transactions:', {
          count: expiredTxs.length,
          transactions: expiredTxs.map(tx => tx.id)
        });
        
        // Store expired transaction history
        await this.storeExpiredTransactionHistory(expiredTxs);
      }
    } catch (error) {
      logger.error('[OfflineExpiry] Failed to perform expiry cleanup:', error);
    }
  }

  /**
   * Handle an expired transaction
   */
  private async handleExpiredTransaction(tx: any, expiredTx: ExpiredTransaction): Promise<void> {
    try {
      // Remove from transaction queue
      await TxQueue.removeTransaction(tx.id);
      
      // Clear offline balance tracking
      await this.clearOfflineBalanceTracking(tx);
      
      // Update transaction status to expired
      await TxQueue.updateTransaction(tx.id, {
        status: 'expired',
        error: 'Transaction expired - funds returned to available balance',
        metadata: {
          ...tx.metadata,
          expiredAt: Date.now(),
          reason: expiredTx.reason
        }
      });
      
      logger.info('[OfflineExpiry] Handled expired transaction:', {
        id: tx.id,
        amount: tx.amount,
        chainId: tx.chainId
      });
      
    } catch (error) {
      logger.error('[OfflineExpiry] Failed to handle expired transaction:', error);
    }
  }

  /**
   * Clear offline balance tracking for expired transaction
   */
  private async clearOfflineBalanceTracking(tx: any): Promise<void> {
    try {
      const { amount, chainId } = tx;
      const key = `offline_balance_${chainId}`;
      
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        const tracking = JSON.parse(stored);
        const currentPending = BigInt(tracking.pendingAmount || '0');
        const transactionAmount = BigInt(amount || '0');
        
        // Subtract the expired transaction amount from pending
        const newPending = currentPending > transactionAmount 
          ? currentPending - transactionAmount 
          : BigInt(0);
        
        tracking.pendingAmount = newPending.toString();
        tracking.lastUpdated = Date.now();
        
        await AsyncStorage.setItem(key, JSON.stringify(tracking));
        
        logger.info('[OfflineExpiry] Cleared offline balance tracking for expired transaction:', {
          chainId,
          oldPending: currentPending.toString(),
          newPending: newPending.toString(),
          transactionAmount: transactionAmount.toString()
        });
      }
    } catch (error) {
      logger.error('[OfflineExpiry] Failed to clear offline balance tracking:', error);
    }
  }

  /**
   * Store expired transaction history
   */
  private async storeExpiredTransactionHistory(expiredTxs: ExpiredTransaction[]): Promise<void> {
    try {
      const key = 'expired_transactions_history';
      const stored = await AsyncStorage.getItem(key);
      const history = stored ? JSON.parse(stored) : [];
      
      // Add new expired transactions
      history.push(...expiredTxs);
      
      // Keep only last 100 expired transactions
      if (history.length > 100) {
        history.splice(0, history.length - 100);
      }
      
      await AsyncStorage.setItem(key, JSON.stringify(history));
      
      logger.info('[OfflineExpiry] Stored expired transaction history:', {
        count: expiredTxs.length,
        totalHistory: history.length
      });
    } catch (error) {
      logger.error('[OfflineExpiry] Failed to store expired transaction history:', error);
    }
  }

  /**
   * Get expired transaction history
   */
  async getExpiredTransactionHistory(): Promise<ExpiredTransaction[]> {
    try {
      const key = 'expired_transactions_history';
      const stored = await AsyncStorage.getItem(key);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      logger.error('[OfflineExpiry] Failed to get expired transaction history:', error);
      return [];
    }
  }

  /**
   * Manually cancel a pending transaction
   */
  async cancelPendingTransaction(transactionId: string): Promise<void> {
    try {
      const pendingTxs = await TxQueue.getPendingTransactions();
      const tx = pendingTxs.find(t => t.id === transactionId);
      
      if (!tx) {
        throw new TransactionError('Transaction not found in pending queue');
      }
      
      if (tx.status !== 'pending') {
        throw new TransactionError('Transaction is not in pending status');
      }
      
      // Create expired transaction record
      const expiredTx: ExpiredTransaction = {
        id: tx.id,
        to: tx.to,
        amount: tx.amount,
        chainId: tx.chainId || 'unknown',
        timestamp: tx.timestamp,
        expiryTime: Date.now(),
        retryCount: 0,
        status: 'cancelled',
        reason: 'Manually cancelled by user'
      };
      
      // Handle as expired transaction
      await this.handleExpiredTransaction(tx, expiredTx);
      
      logger.info('[OfflineExpiry] Manually cancelled transaction:', {
        id: transactionId,
        amount: tx.amount
      });
      
    } catch (error) {
      logger.error('[OfflineExpiry] Failed to cancel pending transaction:', error);
      throw error;
    }
  }

  /**
   * Get transaction expiry status
   */
  async getTransactionExpiryStatus(transactionId: string): Promise<{
    isExpired: boolean;
    timeUntilExpiry: number;
    timeSinceCreation: number;
    willExpireAt: number;
  } | null> {
    try {
      const pendingTxs = await TxQueue.getPendingTransactions();
      const tx = pendingTxs.find(t => t.id === transactionId);
      
      if (!tx || tx.status !== 'pending') {
        return null;
      }
      
      const now = Date.now();
      const timeSinceCreation = now - tx.timestamp;
      const timeUntilExpiry = this.config.maxOfflineDuration - timeSinceCreation;
      const willExpireAt = tx.timestamp + this.config.maxOfflineDuration;
      
      return {
        isExpired: timeUntilExpiry <= 0,
        timeUntilExpiry: Math.max(0, timeUntilExpiry),
        timeSinceCreation,
        willExpireAt
      };
    } catch (error) {
      logger.error('[OfflineExpiry] Failed to get transaction expiry status:', error);
      return null;
    }
  }

  /**
   * Update expiry configuration
   */
  updateConfig(newConfig: Partial<TransactionExpiryConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('[OfflineExpiry] Updated expiry configuration:', this.config);
  }

  /**
   * Get current expiry configuration
   */
  getConfig(): TransactionExpiryConfig {
    return { ...this.config };
  }

  /**
   * Notify warning callbacks
   */
  private notifyWarningCallbacks(warning: ExpiryWarning): void {
    for (const callback of this.warningCallbacks) {
      try {
        callback(warning);
      } catch (error) {
        logger.error('[OfflineExpiry] Error in warning callback:', error);
      }
    }
  }

  /**
   * Format time remaining in human-readable format
   */
  private formatTimeRemaining(milliseconds: number): string {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return 'less than 1 minute';
    }
  }
}

export default OfflineTransactionExpiryService.getInstance(); 