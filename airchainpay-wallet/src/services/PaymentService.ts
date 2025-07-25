import { logger } from '../utils/Logger';
import { BLETransport } from './transports/BLETransport';
import { SecureBLETransport } from './transports/SecureBLETransport';
import { QRTransport } from './transports/QRTransport';
import { OnChainTransport } from './transports/OnChainTransport';
import { TxQueue } from './TxQueue';
import { MultiChainWalletManager } from '../wallet/MultiChainWalletManager';
import { TransactionService } from './TransactionService';
import { Transaction } from '../types/transaction';
import { ethers } from 'ethers';
import { TokenInfo } from '../wallet/TokenWalletManager';
import offlineSecurityService from './OfflineSecurityService';
import { RelayTransport } from './transports/RelayTransport';
import { WalletError, TransactionError } from '../utils/ErrorClasses';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PaymentRequest {
  to: string;
  amount: string;
  chainId: string;
  transport: 'ble' | 'secure_ble' | 'qr' | 'manual' | 'onchain' | 'relay';
  token?: {
    address: string;
    symbol: string;
    decimals: number;
    isNative: boolean;
  };
  paymentReference?: string;
  metadata?: {
    merchant?: string;
    location?: string;
    maxAmount?: string;
    minAmount?: string;
    timestamp?: number;
    expiry?: number;
  };
  extraData?: any;
}

export interface PaymentResult {
  status: 'sent' | 'queued' | 'failed' | 'key_exchange_required' | 'pending' | 'confirmed' | 'advertising';
  transport: 'ble' | 'secure_ble' | 'qr' | 'manual' | 'onchain' | 'relay';
  transactionId?: string;
  message?: string;
  timestamp: number;
  metadata?: any;
  deviceId?: string;
  deviceName?: string;
  sessionId?: string;
  qrData?: string;
}

function buildTokenInfo(obj: any, selectedChain: string): TokenInfo {
  return {
    symbol: obj.symbol,
    name: obj.name || obj.symbol,
    decimals: obj.decimals,
    address: obj.address,
    chainId: obj.chainId || selectedChain,
    isNative: obj.isNative
  };
}

export class PaymentService {
  private static instance: PaymentService;
  private bleTransport: BLETransport;
  private secureBleTransport: SecureBLETransport;
  private qrTransport: QRTransport;
  private onChainTransport: OnChainTransport;
  private walletManager: MultiChainWalletManager;
  private transactionService: TransactionService;
  private relayTransport: RelayTransport;

  private constructor() {
    this.bleTransport = new BLETransport();
    this.secureBleTransport = new SecureBLETransport();
    this.qrTransport = new QRTransport();
    this.onChainTransport = new OnChainTransport();
    this.walletManager = MultiChainWalletManager.getInstance();
    this.transactionService = TransactionService.getInstance();
    this.relayTransport = new RelayTransport();
  }

  static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }

  /**
   * Send payment using the proper flow:
   * - If user has internet: transaction -> relay -> blockchain
   * - If user doesn't have internet: transaction -> queued -> relay -> blockchain
   */
  async sendPayment(request: PaymentRequest): Promise<PaymentResult> {
    try {
      logger.info('[PaymentService] Processing payment request', {
        to: request.to,
        amount: request.amount,
        chainId: request.chainId,
        transport: request.transport
      });

      // Defensive: check for required fields
      if (!request.chainId) {
        throw new Error('Missing chainId in payment request.');
      }

      // Validate payment request
      this.validatePaymentRequest(request);

      // Check network status for the target chain
      const isOnline = await this.checkNetworkStatus(request.chainId);

      if (!isOnline) {
        logger.info('[PaymentService] No internet connection detected, queueing transaction for relay');
        
        // Sign the transaction for offline queueing
        const signedTx = await this.signTransactionForRelay(request);
        
        // Queue transaction for later relay submission
        const queuedTx = {
          id: Date.now().toString() + Math.random().toString(36).substring(2),
          ...request,
          status: 'queued' as const,
          timestamp: Date.now(),
          transport: 'relay' as const,
          signedTx: signedTx,
          metadata: {
            merchant: request.metadata?.merchant,
            location: request.metadata?.location,
            maxAmount: request.metadata?.maxAmount,
            minAmount: request.metadata?.minAmount,
            timestamp: request.metadata?.timestamp,
            expiry: request.metadata?.expiry,
          }
        };
        
        await TxQueue.addTransaction(queuedTx);
        
        return {
          status: 'queued',
          transport: 'relay',
          message: 'Transaction queued for relay submission when online',
          timestamp: Date.now(),
          transactionId: queuedTx.id,
        };
      }

      // User has internet connection - try relay first
      logger.info('[PaymentService] Internet connection detected, attempting relay transport');
      
      try {
        // Sign the transaction before sending to relay
        const signedTx = await this.signTransactionForRelay(request);
        
        // Add signed transaction to request
        const relayRequest = {
          ...request,
          signedTx: signedTx
        };

        // Try to send to relay
        const relayResult = await this.relayTransport.send(relayRequest);
        
        logger.info('[PaymentService] Transaction sent successfully via relay', {
          transactionId: relayResult?.transactionId,
          message: relayResult?.message
        });
        
        return {
          status: 'sent',
          transport: 'relay',
          transactionId: relayResult?.transactionId,
          message: relayResult?.message || 'Transaction sent to relay',
          timestamp: Date.now(),
          metadata: relayResult,
        };
      } catch (relayError: unknown) {
        logger.warn('[PaymentService] Relay transport failed, falling back to on-chain transport:', relayError);
        
        // Fallback to on-chain transport when relay is not available
        logger.info('[PaymentService] Using on-chain transport as fallback');
        const onChainResult = await this.onChainTransport.send(request);
        
        return {
          status: 'sent',
          transport: 'onchain',
          transactionId: onChainResult?.transactionId,
          message: 'Transaction sent on-chain (relay unavailable)',
          timestamp: Date.now(),
          metadata: onChainResult,
        };
      }
    } catch (error: unknown) {
      logger.error('[PaymentService] Payment processing failed:', error);
      return {
        status: 'failed',
        transport: request.transport,
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Sign transaction for relay submission
   */
  private async signTransactionForRelay(request: PaymentRequest): Promise<string> {
    try {
      logger.info('[PaymentService] Signing transaction for relay', {
        to: request.to,
        amount: request.amount,
        chainId: request.chainId
      });

      // Create transaction object
      const transaction = {
        to: request.to,
        value: request.token?.isNative 
          ? ethers.parseEther(request.amount) 
          : ethers.parseUnits(request.amount, request.token?.decimals || 18),
        data: request.paymentReference 
          ? ethers.hexlify(ethers.toUtf8Bytes(request.paymentReference)) 
          : undefined
      };

      // Sign the transaction
      const signedTx = await this.walletManager.signTransaction(transaction, request.chainId);
      
      logger.info('[PaymentService] Transaction signed successfully', {
        to: request.to,
        amount: request.amount,
        chainId: request.chainId,
        signedTxLength: signedTx.length
      });

      return signedTx;
    } catch (error: unknown) {
      logger.error('[PaymentService] Failed to sign transaction for relay:', error);
      throw new Error(`Failed to sign transaction: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validate payment request
   */
  private validatePaymentRequest(request: PaymentRequest): void {
    if (!request.to || !request.amount || !request.chainId) {
      throw new WalletError('Missing required fields: to, amount, chainId');
    }

    if (parseFloat(request.amount) <= 0) {
      throw new WalletError('Amount must be greater than 0');
    }

    // Validate address format
    if (!ethers.isAddress(request.to)) {
      throw new WalletError('Invalid recipient address');
    }
  }

  /**
   * Check network status for a specific chain
   */
  private async checkNetworkStatus(chainId: string): Promise<boolean> {
    try {
      return await this.walletManager.checkNetworkStatus(chainId);
    } catch (error: unknown) {
      logger.warn('[PaymentService] Failed to check network status:', error);
      return false;
    }
  }

  /**
   * Enhanced offline transaction queueing with comprehensive security checks
   */
  private async queueOfflineTransactionWithSecurity(request: PaymentRequest): Promise<PaymentResult> {
    try {
      logger.info('[PaymentService] Performing security checks for offline transaction');

      // Step 1: Perform comprehensive security check
      const tokenInfo: TokenInfo = request.token
        ? {
            symbol: request.token.symbol,
            name: typeof (request.token as any).name === 'string' && (request.token as any).name ? (request.token as any).name : request.token.symbol,
            decimals: request.token.decimals,
            address: request.token.address,
            chainId: typeof (request.token as any).chainId === 'string' && (request.token as any).chainId ? (request.token as any).chainId : request.chainId,
            isNative: request.token.isNative
          }
        : {
            symbol: 'ETH',
            name: 'Ethereum',
            decimals: 18,
            address: '',
            chainId: request.chainId,
            isNative: true
          };

      await offlineSecurityService.performOfflineSecurityCheck(
        request.to,
        request.amount,
        request.chainId,
        tokenInfo
      );

      // Step 4: Create transaction object for signing
      const transaction = {
        to: request.to,
        value: request.token?.isNative 
          ? ethers.parseEther(request.amount) 
          : ethers.parseUnits(request.amount, request.token?.decimals || 18),
        data: request.paymentReference 
          ? ethers.hexlify(ethers.toUtf8Bytes(request.paymentReference)) 
          : undefined
      };

      // Step 5: Sign transaction for offline queueing
      const signedTx = await this.walletManager.signTransaction(transaction, request.chainId);
      
      // Step 6: Add to offline queue with enhanced metadata
      const transactionId = Date.now().toString();
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
          merchant: request.metadata?.merchant,
          location: request.metadata?.location
        }
      });

      // Step 7: Update offline balance tracking
      await this.updateOfflineBalanceTracking(request);

      logger.info('[PaymentService] Transaction queued for offline processing with security validation', {
        transactionId,
        to: request.to,
        amount: request.amount,
        chainId: request.chainId,
        transport: request.transport
      });

      return {
        status: 'queued',
        transport: request.transport,
        transactionId: transactionId,
        message: 'Transaction queued for processing when online (security validated)',
        timestamp: Date.now()
      };

    } catch (error: unknown) {
      logger.error('[PaymentService] Failed to queue offline transaction with security:', error);
      throw error;
    }
  }

  /**
   * Validate balance before allowing offline transaction
   */
  private async validateOfflineBalance(request: PaymentRequest): Promise<void> {
    try {
      const walletInfo = await this.walletManager.getWalletInfo(request.chainId);
      if (!walletInfo) {
        throw new Error('No wallet found for chain');
      }

             // Get current balance
       const TokenWalletManager = (await import('../wallet/TokenWalletManager')).default;
       const tokenInfo: TokenInfo = request.token ? {
         symbol: request.token.symbol,
         name: request.token.name || request.token.symbol,
         decimals: request.token.decimals,
         address: request.token.address,
         chainId: request.token.chainId || request.chainId,
         isNative: request.token.isNative
       } : {
         symbol: 'ETH',
         name: 'Ethereum',
         decimals: 18,
         address: '',
         chainId: request.chainId,
         isNative: true
       };

      const balance = await TokenWalletManager.getTokenBalance(walletInfo.address, tokenInfo);
      const requiredAmount = request.token?.isNative 
        ? ethers.parseEther(request.amount)
        : ethers.parseUnits(request.amount, request.token?.decimals || 18);

      // Get pending transactions total
      const pendingAmount = await this.getPendingTransactionsTotal(request.chainId, tokenInfo);
      
      // Calculate available balance (current balance - pending transactions)
      const availableBalance = BigInt(balance.balance) - BigInt(pendingAmount);
      
      logger.info('[PaymentService] Balance validation', {
        currentBalance: balance.balance,
        pendingAmount: pendingAmount.toString(),
        availableBalance: availableBalance.toString(),
        requiredAmount: requiredAmount.toString(),
        walletAddress: walletInfo.address
      });

      if (availableBalance < BigInt(requiredAmount)) {
        throw new TransactionError(`Insufficient available balance. Required: ${ethers.formatEther(requiredAmount)}, Available: ${ethers.formatEther(availableBalance)}`);
      }

      logger.info('[PaymentService] Balance validation passed');
    } catch (error: unknown) {
      logger.error('[PaymentService] Balance validation failed:', error);
      throw error;
    }
  }

  /**
   * Check for duplicate transactions
   */
  private async checkForDuplicateTransaction(request: PaymentRequest): Promise<void> {
    try {
      const pendingTxs = await TxQueue.getPendingTransactions();
      
      // Check for exact duplicates (same recipient, amount, and chain)
      const duplicate = pendingTxs.find(tx => 
        tx.to === request.to && 
        tx.amount === request.amount && 
        tx.chainId === request.chainId &&
        tx.status === 'pending'
      );

      if (duplicate) {
        throw new Error('Duplicate transaction detected. This transaction is already queued.');
      }

      // Check for similar transactions within a time window (5 minutes)
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      const recentSimilar = pendingTxs.find(tx => 
        tx.to === request.to && 
        tx.chainId === request.chainId &&
        tx.timestamp > fiveMinutesAgo &&
        tx.status === 'pending'
      );

      if (recentSimilar) {
        logger.warn('[PaymentService] Similar transaction found within 5 minutes', {
          existing: recentSimilar,
          new: request
        });
        // Don't throw error for similar transactions, just log warning
      }

      logger.info('[PaymentService] Duplicate check passed');
    } catch (error: unknown) {
      logger.error('[PaymentService] Duplicate check failed:', error);
      throw error;
    }
  }

  /**
   * Validate nonce for offline transaction
   */
  private async validateOfflineNonce(chainId: string): Promise<void> {
    try {
      // Get current nonce from blockchain (if online) or from local storage
      const currentNonce = await this.getCurrentNonce(chainId);
      const offlineNonce = await this.getOfflineNonce(chainId);
      
      logger.info('[PaymentService] Nonce validation', {
        currentNonce,
        offlineNonce,
        chainId
      });

      // Ensure offline nonce is not ahead of current nonce
      if (offlineNonce >= currentNonce) {
        throw new TransactionError('Invalid nonce for offline transaction. Please sync with network first.');
      }

      // Update offline nonce
      await this.updateOfflineNonce(chainId, offlineNonce + 1);
      
      logger.info('[PaymentService] Nonce validation passed');
    } catch (error: unknown) {
      logger.error('[PaymentService] Nonce validation failed:', error);
      throw error;
    }
  }

  /**
   * Get current nonce from blockchain or local storage
   */
  private async getCurrentNonce(chainId: string): Promise<number> {
    try {
      // Try to get nonce from blockchain first
      const isOnline = await this.checkNetworkStatus(chainId);
      if (isOnline) {
        const walletInfo = await this.walletManager.getWalletInfo(chainId);
        const provider = this.transactionService['getProvider'](chainId);
        return await provider.getTransactionCount(walletInfo.address);
      } else {
        // Use stored nonce if offline
        const storedNonce = await this.getStoredNonce(chainId);
        return storedNonce;
      }
    } catch (error: unknown) {
      logger.error('[PaymentService] Failed to get current nonce:', error);
      // Fallback to stored nonce
      return await this.getStoredNonce(chainId);
    }
  }

  /**
   * Get offline nonce from local storage
   */
  private async getOfflineNonce(chainId: string): Promise<number> {
    try {
      const key = `offline_nonce_${chainId}`;
      const stored = await AsyncStorage.getItem(key);
      return stored ? parseInt(stored, 10) : 0;
    } catch (error: unknown) {
      logger.error('[PaymentService] Failed to get offline nonce:', error);
      return 0;
    }
  }

  /**
   * Update offline nonce in local storage
   */
  private async updateOfflineNonce(chainId: string, nonce: number): Promise<void> {
    try {
      const key = `offline_nonce_${chainId}`;
      await AsyncStorage.setItem(key, nonce.toString());
      logger.info('[PaymentService] Updated offline nonce', { chainId, nonce });
    } catch (error: unknown) {
      logger.error('[PaymentService] Failed to update offline nonce:', error);
      throw error;
    }
  }

  /**
   * Get stored nonce from local storage
   */
  private async getStoredNonce(chainId: string): Promise<number> {
    try {
      const key = `stored_nonce_${chainId}`;
      const stored = await AsyncStorage.getItem(key);
      return stored ? parseInt(stored, 10) : 0;
    } catch (error: unknown) {
      logger.error('[PaymentService] Failed to get stored nonce:', error);
      return 0;
    }
  }

  /**
   * Get total amount of pending transactions for a specific chain and token
   */
  private async getPendingTransactionsTotal(chainId: string, tokenInfo: TokenInfo): Promise<bigint> {
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

      logger.info('[PaymentService] Pending transactions total', {
        chainId,
        total: total.toString(),
        pendingCount: pendingTxs.filter(tx => tx.chainId === chainId && tx.status === 'pending').length
      });

      return total;
    } catch (error: unknown) {
      logger.error('[PaymentService] Failed to get pending transactions total:', error);
      return BigInt(0);
    }
  }

  /**
   * Update offline balance tracking
   */
  private async updateOfflineBalanceTracking(request: PaymentRequest): Promise<void> {
    try {
      const key = `offline_balance_${request.chainId}`;
      
      // Get current offline balance tracking
      const stored = await AsyncStorage.getItem(key);
      const tracking = stored ? JSON.parse(stored) : { pendingAmount: '0', lastUpdated: Date.now() };
      
      // Add current transaction amount to pending
      const currentPending = BigInt(tracking.pendingAmount);
      const newAmount = request.token?.isNative 
        ? ethers.parseEther(request.amount)
        : ethers.parseUnits(request.amount, request.token?.decimals || 18);
      
      tracking.pendingAmount = (currentPending + BigInt(newAmount)).toString();
      tracking.lastUpdated = Date.now();
      
      await AsyncStorage.setItem(key, JSON.stringify(tracking));
      
      logger.info('[PaymentService] Updated offline balance tracking', {
        chainId: request.chainId,
        newPendingAmount: tracking.pendingAmount,
        transactionAmount: request.amount
      });
    } catch (error: unknown) {
      logger.error('[PaymentService] Failed to update offline balance tracking:', error);
      // Don't throw error as this is not critical
    }
  }

  /**
   * Get pending transactions from queue
   */
  async getPendingTransactions(): Promise<Transaction[]> {
    return await TxQueue.getPendingTransactions();
  }

  /**
   * Process queued transactions: send all to relay when online, fallback to on-chain
   * This implements the flow: queued -> relay -> blockchain
   */
  async processQueuedTransactions(): Promise<void> {
    const queued = await TxQueue.getQueuedTransactions();
    
    if (queued.length === 0) {
      logger.info('[PaymentService] No queued transactions to process');
      return;
    }
    
    logger.info('[PaymentService] Processing queued transactions', { count: queued.length });
    
    for (const tx of queued) {
      try {
        // Check if we have internet connection
        const isOnline = await this.checkNetworkStatus(tx.chainId || '');
        
        if (!isOnline) {
          logger.info('[PaymentService] Still offline, skipping queued transaction', { id: tx.id });
          continue;
        }
        
        logger.info('[PaymentService] Processing queued transaction', { 
          id: tx.id, 
          to: tx.to, 
          amount: tx.amount,
          chainId: tx.chainId 
        });
        
        try {
          // Try relay first (relay -> blockchain)
          logger.info('[PaymentService] Attempting to send queued transaction via relay');
          await this.relayTransport.send({ ...tx, transport: (tx.transport ?? 'relay') as PaymentRequest['transport'] });
          
          // Remove from queue on success
          await TxQueue.removeTransaction(tx.id || '');
          logger.info('[PaymentService] Queued transaction sent successfully via relay', { id: tx.id });
          
        } catch (relayError: unknown) {
          logger.warn('[PaymentService] Relay failed for queued transaction, trying on-chain fallback:', relayError);
          
          try {
            // Fallback to on-chain transport (on-chain -> blockchain)
            const onChainResult = await this.onChainTransport.send({ ...tx, transport: (tx.transport ?? 'onchain') as PaymentRequest['transport'] });
            
            // Remove from queue on success
            await TxQueue.removeTransaction(tx.id || '');
            logger.info('[PaymentService] Queued transaction sent successfully on-chain', { 
              id: tx.id, 
              transactionId: onChainResult?.transactionId 
            });
            
          } catch (onChainError: unknown) {
            logger.error('[PaymentService] Both relay and on-chain failed for queued transaction', {
              id: tx.id,
              relayError: relayError instanceof Error ? relayError.message : String(relayError),
              onChainError: onChainError instanceof Error ? onChainError.message : String(onChainError)
            });
            
            // Keep transaction in queue for retry later
            // Could implement retry logic here with exponential backoff
          }
        }
      } catch (err: unknown) {
        logger.error('[PaymentService] Failed to process queued transaction', {
          id: tx.id,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.secureBleTransport.cleanup();
  }
} 