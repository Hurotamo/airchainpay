// CrossWalletSecurityService for detecting and preventing cross-wallet double-spending
import { logger } from '../utils/Logger';
import { BlockchainTransactionService } from './BlockchainTransactionService';
import { MultiChainWalletManager } from '../wallet/MultiChainWalletManager';
import { TokenInfo } from '../wallet/TokenWalletManager';
import { ethers } from 'ethers';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TransactionError, WalletError } from '../utils/ErrorClasses';

export interface CrossWalletActivity {
  hasActivity: boolean;
  lastTransaction: number;
  pendingAmount: string;
  externalTransactions: ExternalTransaction[];
}

export interface ExternalTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  nonce: number;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
  chainId: string;
}

export interface SecurityWarning {
  type: 'EXTERNAL_WALLET_ACTIVITY' | 'NONCE_CONFLICT' | 'INSUFFICIENT_BALANCE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  timestamp: number;
  details?: any;
}

export class CrossWalletSecurityService {
  private static instance: CrossWalletSecurityService;
  private blockchainService: BlockchainTransactionService;
  private walletManager: MultiChainWalletManager;
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  private lastActivityCheck: Map<string, number> = new Map();

  private constructor() {
    this.blockchainService = BlockchainTransactionService.getInstance();
    this.walletManager = MultiChainWalletManager.getInstance();
  }

  public static getInstance(): CrossWalletSecurityService {
    if (!CrossWalletSecurityService.instance) {
      CrossWalletSecurityService.instance = new CrossWalletSecurityService();
    }
    return CrossWalletSecurityService.instance;
  }

  /**
   * Enhanced balance validation that considers external wallet activity
   */
  async validateCrossWalletBalance(
    chainId: string, 
    amount: string, 
    tokenInfo: TokenInfo
  ): Promise<void> {
    try {
      logger.info('[CrossWallet] Starting cross-wallet balance validation', {
        chainId,
        amount,
        tokenSymbol: tokenInfo.symbol
      });

      // Get real-time balance from blockchain
      const realTimeBalance = await this.getRealTimeBalance(chainId, tokenInfo);
      
      // Get pending transactions from AirChainPay using dynamic import
      let airchainpayPending = BigInt(0);
      try {
        const { OfflineSecurityService } = await import('./OfflineSecurityService');
        const offlineSecurityService = OfflineSecurityService.getInstance();
        airchainpayPending = await offlineSecurityService.getPendingTransactionsTotal(chainId, tokenInfo);
      } catch (error) {
        logger.warn('[CrossWallet] Failed to get pending transactions, using 0:', error);
      }
      
      // Get recent external transactions
      const externalActivity = await this.detectExternalWalletActivity(chainId);
      const externalPending = this.calculateExternalPending(externalActivity.externalTransactions);
      
      // Validate amount before parsing
      if (!amount || typeof amount !== 'string') {
        throw new Error(`Invalid amount: ${amount}. Must be a non-empty string.`);
      }
      
      const amountString = amount.trim();
      if (amountString === '') {
        throw new Error('Amount cannot be empty');
      }
      
      // Check if the original amount was actually NaN
      if (typeof amount === 'number' && isNaN(amount)) {
        throw new Error('Amount is NaN (number)');
      }
      
      // Additional validation to catch NaN early
      if (amountString === 'NaN' || amountString === 'undefined' || amountString === 'null') {
        throw new Error(`Invalid amount string: ${amountString}`);
      }
      
      // Validate amount is a valid number
      const amountNum = parseFloat(amountString);
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error(`Invalid amount: ${amountString}. Must be a positive number.`);
      }
      
      logger.info('[CrossWallet] Amount validation passed', {
        originalAmount: amountString,
        parsedAmount: amountNum,
        tokenDecimals: tokenInfo.decimals || 18,
        isNative: tokenInfo.isNative
      });

      // Calculate truly available balance
      const availableBalance = BigInt(realTimeBalance) - airchainpayPending - BigInt(externalPending);
      const requiredAmount = tokenInfo.isNative 
        ? ethers.parseEther(amountString)
        : ethers.parseUnits(amountString, tokenInfo.decimals || 18);

      logger.info('[CrossWallet] Balance calculation', {
        realTimeBalance,
        airchainpayPending: airchainpayPending.toString(),
        externalPending: externalPending.toString(),
        availableBalance: availableBalance.toString(),
        requiredAmount: requiredAmount.toString(),
        hasExternalActivity: externalActivity.hasActivity
      });

      if (availableBalance < requiredAmount) {
        const errorMessage = externalActivity.hasActivity 
          ? `Insufficient available balance. External wallet activity detected. Required: ${ethers.formatEther(requiredAmount)}, Available: ${ethers.formatEther(availableBalance)}`
          : `Insufficient available balance. Required: ${ethers.formatEther(requiredAmount)}, Available: ${ethers.formatEther(availableBalance)}`;
        
        throw new TransactionError(errorMessage);
      }

      logger.info('[CrossWallet] Balance validation passed');
    } catch (error) {
      logger.error('[CrossWallet] Balance validation failed:', error);
      throw error;
    }
  }

  /**
   * Enhanced nonce validation that considers external wallet activity
   */
  async validateCrossWalletNonce(chainId: string): Promise<void> {
    try {
      logger.info('[CrossWallet] Starting cross-wallet nonce validation', { chainId });

      // Get current nonce from blockchain
      const blockchainNonce = await this.getBlockchainNonce(chainId);
      
      // Get AirChainPay's offline nonce
      const airchainpayNonce = await this.getOfflineNonce(chainId);
      
      // Get recent transactions to detect external wallet activity
      const externalActivity = await this.detectExternalWalletActivity(chainId);
      const externalNonce = this.getHighestNonceFromTransactions(externalActivity.externalTransactions);
      
      // Use the highest nonce from all sources
      const effectiveNonce = Math.max(blockchainNonce, externalNonce, airchainpayNonce);
      
      logger.info('[CrossWallet] Nonce analysis', {
        blockchainNonce,
        airchainpayNonce,
        externalNonce,
        effectiveNonce
      });

      if (airchainpayNonce < effectiveNonce) {
        // Update AirChainPay's nonce to match external activity
        await this.updateOfflineNonce(chainId, effectiveNonce + 1);
        logger.info('[CrossWallet] Updated nonce to match external activity', {
          oldNonce: airchainpayNonce,
          newNonce: effectiveNonce + 1
        });
      }

      logger.info('[CrossWallet] Nonce validation passed');
    } catch (error) {
      logger.error('[CrossWallet] Nonce validation failed:', error);
      throw error;
    }
  }

  /**
   * Detect external wallet activity by analyzing recent blockchain transactions
   */
  async detectExternalWalletActivity(chainId: string): Promise<CrossWalletActivity> {
    try {
      const walletInfo = await this.walletManager.getWalletInfo(chainId);
      if (!walletInfo) {
        throw new WalletError('No wallet found for chain');
      }

      // Get recent transactions from blockchain (last 20 blocks)
      const recentTxs = await this.getRecentTransactions(chainId, 20);
      const walletAddress = walletInfo.address.toLowerCase();
      
      // Filter transactions from this wallet
      const walletTxs = recentTxs.filter(tx => 
        tx.from.toLowerCase() === walletAddress
      );
      
      // Check for transactions not initiated by AirChainPay
      const externalTxs = walletTxs.filter(tx => 
        !this.isAirChainPayTransaction(tx)
      );

      const hasActivity = externalTxs.length > 0;
      const lastTransaction = hasActivity ? externalTxs[0].timestamp : 0;
      const pendingAmount = this.calculatePendingAmount(externalTxs);

      logger.info('[CrossWallet] External activity detection', {
        totalTransactions: recentTxs.length,
        walletTransactions: walletTxs.length,
        externalTransactions: externalTxs.length,
        hasActivity,
        lastTransaction,
        pendingAmount
      });

      return {
        hasActivity,
        lastTransaction,
        pendingAmount,
        externalTransactions: externalTxs
      };
    } catch (error) {
      logger.error('[CrossWallet] Failed to detect external activity:', error);
      return {
        hasActivity: false,
        lastTransaction: 0,
        pendingAmount: '0',
        externalTransactions: []
      };
    }
  }

  /**
   * Check for cross-wallet security issues and return warnings
   */
  async checkCrossWalletSecurity(chainId: string): Promise<SecurityWarning[]> {
    const warnings: SecurityWarning[] = [];
    
    try {
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
            pendingAmount: externalActivity.pendingAmount,
            transactionCount: externalActivity.externalTransactions.length
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
          timestamp: Date.now(),
          details: {
            expectedNonce: nonceConflict.expectedNonce,
            actualNonce: nonceConflict.actualNonce
          }
        });
      }
      
      // Check for potential insufficient balance
      const balanceWarning = await this.checkBalanceWarning(chainId);
      if (balanceWarning) {
        warnings.push({
          type: 'INSUFFICIENT_BALANCE',
          severity: 'MEDIUM',
          message: 'Low balance detected. Consider checking external wallet activity.',
          timestamp: Date.now(),
          details: {
            currentBalance: balanceWarning.currentBalance,
            estimatedPending: balanceWarning.estimatedPending
          }
        });
      }
      
    } catch (error) {
      logger.error('[CrossWallet] Failed to check security:', error);
    }
    
    return warnings;
  }

  /**
   * Start real-time monitoring for cross-wallet activity
   */
  startCrossWalletMonitoring(chainId: string, callback: (warnings: SecurityWarning[]) => void): void {
    const key = `${chainId}_cross_wallet_monitor`;
    
    // Clear existing interval if any
    if (this.monitoringIntervals.has(key)) {
      clearInterval(this.monitoringIntervals.get(key)!);
    }
    
    // Start monitoring every 30 seconds
    const interval = setInterval(async () => {
      try {
        const warnings = await this.checkCrossWalletSecurity(chainId);
        if (warnings.length > 0) {
          callback(warnings);
        }
      } catch (error) {
        logger.error('[CrossWallet] Monitoring error:', error);
      }
    }, 30000);
    
    this.monitoringIntervals.set(key, interval);
    logger.info('[CrossWallet] Started monitoring for chain:', chainId);
  }

  /**
   * Stop real-time monitoring
   */
  stopCrossWalletMonitoring(chainId: string): void {
    const key = `${chainId}_cross_wallet_monitor`;
    const interval = this.monitoringIntervals.get(key);
    
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(key);
      logger.info('[CrossWallet] Stopped monitoring for chain:', chainId);
    }
  }

  /**
   * Comprehensive cross-wallet security check
   */
  async performCrossWalletSecurityCheck(
    to: string,
    amount: string,
    chainId: string,
    tokenInfo: TokenInfo
  ): Promise<void> {
    try {
      logger.info('[CrossWallet] Performing comprehensive cross-wallet security check', {
        to,
        amount,
        chainId,
        tokenSymbol: tokenInfo.symbol
      });

      // Step 1: Validate cross-wallet balance
      await this.validateCrossWalletBalance(chainId, amount, tokenInfo);

      // Step 2: Validate cross-wallet nonce
      await this.validateCrossWalletNonce(chainId);

      // Step 3: Check for security warnings
      const warnings = await this.checkCrossWalletSecurity(chainId);
      if (warnings.length > 0) {
        logger.warn('[CrossWallet] Security warnings detected:', warnings);
        // Don't throw error for warnings, just log them
      }

      logger.info('[CrossWallet] Comprehensive security check passed');
    } catch (error) {
      logger.error('[CrossWallet] Comprehensive security check failed:', error);
      throw error;
    }
  }

  // Private helper methods

  private async getRealTimeBalance(chainId: string, tokenInfo: TokenInfo): Promise<string> {
    const walletInfo = await this.walletManager.getWalletInfo(chainId);
    if (!walletInfo) {
      throw new WalletError('No wallet found for chain');
    }

    const TokenWalletManager = (await import('../wallet/TokenWalletManager')).default;
    const balance = await TokenWalletManager.getTokenBalance(walletInfo.address, tokenInfo);
    return balance.balance;
  }

  private async getRecentTransactions(chainId: string, blockCount: number): Promise<ExternalTransaction[]> {
    try {
      const transactions = await this.blockchainService.getTransactionHistory(chainId, { limit: 100 });
      
      return transactions.map(tx => ({
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        nonce: tx.nonce || 0,
        timestamp: tx.timestamp,
        status: tx.status as 'pending' | 'confirmed' | 'failed',
        chainId: tx.chainId
      }));
    } catch (error) {
      logger.error('[CrossWallet] Failed to get recent transactions:', error);
      return [];
    }
  }

  private calculateExternalPending(transactions: ExternalTransaction[]): string {
    const pendingTxs = transactions.filter(tx => 
      tx.status === 'pending' || 
      (Date.now() - tx.timestamp) < 60000 // Consider recent transactions as pending
    );
    
    const totalPending = pendingTxs.reduce((sum, tx) => {
      return sum + BigInt(ethers.parseEther(tx.value));
    }, BigInt(0));
    
    return totalPending.toString();
  }

  private calculatePendingAmount(transactions: ExternalTransaction[]): string {
    return this.calculateExternalPending(transactions);
  }

  private isAirChainPayTransaction(transaction: ExternalTransaction): boolean {
    // Check if transaction has AirChainPay-specific metadata or characteristics
    // This is a simplified check - in production, you'd have more sophisticated detection
    return false; // For now, assume all external transactions are from other wallets
  }

  private getHighestNonceFromTransactions(transactions: ExternalTransaction[]): number {
    if (transactions.length === 0) return 0;
    return Math.max(...transactions.map(tx => tx.nonce));
  }

  private async getBlockchainNonce(chainId: string): Promise<number> {
    try {
      const walletInfo = await this.walletManager.getWalletInfo(chainId);
      if (!walletInfo) {
        throw new WalletError('No wallet found for chain');
      }

      // Use the public getProvider method
      const provider = this.walletManager.getProvider(chainId);
      const nonce = await provider.getTransactionCount(walletInfo.address, 'latest');
      return nonce;
    } catch (error) {
      logger.error('[CrossWallet] Failed to get blockchain nonce:', error);
      return 0;
    }
  }

  private async getOfflineNonce(chainId: string): Promise<number> {
    try {
      const key = `offline_nonce_${chainId}`;
      const nonce = await AsyncStorage.getItem(key);
      return nonce ? parseInt(nonce, 10) : 0;
    } catch (error) {
      logger.error('[CrossWallet] Failed to get offline nonce:', error);
      return 0;
    }
  }

  private async updateOfflineNonce(chainId: string, nonce: number): Promise<void> {
    try {
      const key = `offline_nonce_${chainId}`;
      await AsyncStorage.setItem(key, nonce.toString());
    } catch (error) {
      logger.error('[CrossWallet] Failed to update offline nonce:', error);
    }
  }

  private async detectNonceConflict(chainId: string): Promise<{ expectedNonce: number; actualNonce: number } | null> {
    try {
      const blockchainNonce = await this.getBlockchainNonce(chainId);
      const offlineNonce = await this.getOfflineNonce(chainId);
      
      if (Math.abs(blockchainNonce - offlineNonce) > 1) {
        return {
          expectedNonce: blockchainNonce,
          actualNonce: offlineNonce
        };
      }
      
      return null;
    } catch (error) {
      logger.error('[CrossWallet] Failed to detect nonce conflict:', error);
      return null;
    }
  }

  private async checkBalanceWarning(chainId: string): Promise<{ currentBalance: string; estimatedPending: string } | null> {
    try {
      const walletInfo = await this.walletManager.getWalletInfo(chainId);
      if (!walletInfo) return null;

      const currentBalance = parseFloat(walletInfo.balance);
      const externalActivity = await this.detectExternalWalletActivity(chainId);
      const externalPending = parseFloat(externalActivity.pendingAmount);
      
      // Warning if balance is low relative to pending transactions
      if (currentBalance > 0 && externalPending > 0 && (externalPending / currentBalance) > 0.5) {
        return {
          currentBalance: walletInfo.balance,
          estimatedPending: externalActivity.pendingAmount
        };
      }
      
      return null;
    } catch (error) {
      logger.error('[CrossWallet] Failed to check balance warning:', error);
      return null;
    }
  }
}

export default CrossWalletSecurityService.getInstance(); 