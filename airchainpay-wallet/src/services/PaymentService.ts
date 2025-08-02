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
import { WalletError,  } from '../utils/ErrorClasses';

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
    adjustedGasPrice?: string;
    adjustedGasLimit?: string;
    delayHours?: number;
    originalTimestamp?: number;
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
    this.relayTransport = RelayTransport.getInstance();
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
        logger.info('[PaymentService] No internet connection detected, queueing transaction for offline processing');
        
        // Perform comprehensive security checks for offline transaction
        const tokenInfo: TokenInfo = request.token
          ? {
              symbol: request.token.symbol,
              name: request.token.symbol, // Use symbol as name if not available
              decimals: request.token.decimals,
              address: request.token.address,
              chainId: request.chainId, // Use the main chainId
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

        // Sign the transaction for offline queueing
        const signedTx = await this.signTransactionForRelay(request);
        
        // Queue transaction for later relay submission
        const transactionId = Date.now().toString();
        const queuedTx = {
          id: transactionId,
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
        
        // Update offline balance tracking
        await offlineSecurityService.updateOfflineBalanceTracking(
          request.chainId,
          request.amount,
          tokenInfo
        );
        
        logger.info('[PaymentService] Transaction queued successfully for offline processing', {
          transactionId,
          to: request.to,
          amount: request.amount,
          chainId: request.chainId
        });
        
        return {
          status: 'queued',
          transport: 'relay',
          transactionId: transactionId,
          message: 'Transaction queued for relay submission when online (security validated)',
          timestamp: Date.now(),
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
   * Get queue status for user feedback
   */
  async getQueueStatus(): Promise<{
    total: number;
    queued: number;
    pending: number;
    failed: number;
  }> {
    return await TxQueue.getQueueStatus();
  }

  /**
   * Get pending transactions from queue
   */
  async getPendingTransactions(): Promise<Transaction[]> {
    return await TxQueue.getPendingTransactions();
  }

  /**
   * Process queued transactions with retry logic and exponential backoff
   */
  async processQueuedTransactions(): Promise<void> {
    const queued = await TxQueue.getQueuedTransactions();
    
    if (queued.length === 0) {
      logger.info('[PaymentService] No queued transactions to process');
      return;
    }
    
    logger.info('[PaymentService] Processing queued transactions with retry logic', { count: queued.length });
    
    let processedCount = 0;
    let failedCount = 0;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    const MAX_CONCURRENT = 2; // Process max 2 transactions at a time
    
    // Process transactions in batches to avoid overwhelming the network
    for (let i = 0; i < queued.length; i += MAX_CONCURRENT) {
      const batch = queued.slice(i, i + MAX_CONCURRENT);
      
      // Process batch concurrently
      const batchPromises = batch.map(async (tx) => {
        return await this.processQueuedTransactionWithRetry(tx, MAX_RETRIES);
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Count results
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            processedCount++;
          } else {
            failedCount++;
          }
        } else {
          failedCount++;
        }
      }
      
      // Add delay between batches to avoid rate limiting
      if (i + MAX_CONCURRENT < queued.length) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      }
    }
    
    logger.info('[PaymentService] Finished processing queued transactions with retry logic', {
      total: queued.length,
      processed: processedCount,
      failed: failedCount,
      remaining: queued.length - processedCount - failedCount
    });
  }

  /**
   * Process a single queued transaction with exponential backoff retry
   */
  private async processQueuedTransactionWithRetry(
    tx: Transaction, 
    maxRetries: number
  ): Promise<{ success: boolean; error?: string }> {
    let lastError: string | undefined;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Check if we have internet connection
        const isOnline = await this.checkNetworkStatus(tx.chainId || '');
        
        if (!isOnline) {
          logger.info('[PaymentService] Still offline, skipping queued transaction', { id: tx.id });
          return { success: false, error: 'Network offline' };
        }
        
        logger.info('[PaymentService] Processing queued transaction', { 
          id: tx.id, 
          to: tx.to, 
          amount: tx.amount,
          chainId: tx.chainId,
          attempt: attempt + 1
        });
        
        // Calculate delay hours for gas adjustment
        const delayHours = (Date.now() - (tx.timestamp || Date.now())) / (1000 * 60 * 60);
        
        try {
          // Try relay first (relay -> blockchain)
          logger.info('[PaymentService] Attempting to send queued transaction via relay');
          
          // Adjust gas price for delayed transaction
          if (delayHours > 0.1) { // If delayed more than 6 minutes
            const adjustedRequest = await this.adjustTransactionForDelay(tx, delayHours);
            await this.relayTransport.send({ ...adjustedRequest, transport: (tx.transport ?? 'relay') as PaymentRequest['transport'] });
          } else {
            await this.relayTransport.send({ ...tx, transport: (tx.transport ?? 'relay') as PaymentRequest['transport'] });
          }
          
          // Remove from queue on success
          await TxQueue.removeTransaction(tx.id || '');
          logger.info('[PaymentService] Queued transaction sent successfully via relay', { id: tx.id });
          
          return { success: true };
          
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
            
            return { success: true };
            
          } catch (onChainError: unknown) {
            lastError = `Relay: ${relayError instanceof Error ? relayError.message : String(relayError)}, OnChain: ${onChainError instanceof Error ? onChainError.message : String(onChainError)}`;
            logger.error('[PaymentService] Both relay and on-chain failed for queued transaction', {
              id: tx.id,
              relayError: relayError instanceof Error ? relayError.message : String(relayError),
              onChainError: onChainError instanceof Error ? onChainError.message : String(onChainError)
            });
            
            // Continue to retry if we haven't exceeded max retries
            if (attempt < maxRetries) {
              const backoffDelay = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s
              logger.info('[PaymentService] Retrying queued transaction with backoff', {
                id: tx.id,
                attempt: attempt + 1,
                backoffDelay
              });
              await new Promise(resolve => setTimeout(resolve, backoffDelay));
              continue;
            }
          }
        }
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
        logger.error('[PaymentService] Failed to process queued transaction', {
          id: tx.id,
          error: lastError,
          attempt: attempt + 1
        });
        
        if (attempt < maxRetries) {
          const backoffDelay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          continue;
        }
      }
    }
    
    // All retries exhausted
    logger.error('[PaymentService] All retries exhausted for queued transaction', {
      id: tx.id,
      maxRetries,
      lastError
    });
    
    return { success: false, error: lastError };
  }

  /**
   * Adjust transaction parameters for delayed execution
   */
  private async adjustTransactionForDelay(tx: Transaction, delayHours: number): Promise<PaymentRequest> {
    try {
      const chainId = tx.chainId || '';
      
      // Get current gas price and adjust for delay
      const currentGasPrice = await this.walletManager.getGasPrice(chainId);
      const adjustedGasPrice = await this.adjustGasPriceForDelayedTransaction(currentGasPrice, delayHours, chainId);
      
      // Estimate gas limit with buffer
      const transaction = {
        to: tx.to,
        value: tx.amount ? ethers.parseEther(tx.amount) : BigInt(0),
        data: tx.paymentReference ? ethers.hexlify(ethers.toUtf8Bytes(tx.paymentReference)) : undefined
      };
      
      const adjustedGasLimit = await this.estimateGasForDelayedTransaction(transaction, chainId);
      
      return {
        to: tx.to,
        amount: tx.amount,
        chainId: tx.chainId || '',
        transport: (tx.transport as PaymentRequest['transport']) || 'relay',
        token: tx.token,
        paymentReference: tx.paymentReference,
        metadata: {
          ...tx.metadata,
          adjustedGasPrice: adjustedGasPrice.toString(),
          adjustedGasLimit: adjustedGasLimit.toString(),
          delayHours,
          originalTimestamp: tx.timestamp
        }
      };
    } catch (error: unknown) {
      logger.warn('[PaymentService] Failed to adjust transaction for delay, using original:', error);
      return {
        to: tx.to,
        amount: tx.amount,
        chainId: tx.chainId || '',
        transport: (tx.transport as PaymentRequest['transport']) || 'relay',
        token: tx.token,
        paymentReference: tx.paymentReference,
        metadata: tx.metadata
      };
    }
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.secureBleTransport.cleanup();
  }

  /**
   * Adjust gas price for delayed transactions based on network conditions
   */
  private async adjustGasPriceForDelayedTransaction(
    originalGasPrice: bigint,
    delayHours: number,
    chainId: string
  ): Promise<bigint> {
    try {
      // Get current gas price from network
      const currentGasPrice = await this.walletManager.getGasPrice(chainId);
      
      // Calculate time-based adjustment
      const baseMultiplier = 1.1; // 10% base increase
      const timeMultiplier = Math.min(1 + (delayHours * 0.05), 2.0); // Max 2x for very old transactions
      
      // Use the higher of current gas price or adjusted original price
      const adjustedOriginalPrice = originalGasPrice * BigInt(Math.floor(timeMultiplier * 100)) / BigInt(100);
      const finalGasPrice = currentGasPrice > adjustedOriginalPrice ? currentGasPrice : adjustedOriginalPrice;
      
      logger.info('[PaymentService] Gas price adjustment for delayed transaction', {
        originalGasPrice: originalGasPrice.toString(),
        currentGasPrice: currentGasPrice.toString(),
        adjustedOriginalPrice: adjustedOriginalPrice.toString(),
        finalGasPrice: finalGasPrice.toString(),
        delayHours,
        timeMultiplier
      });
      
      return finalGasPrice;
    } catch (error: unknown) {
      logger.warn('[PaymentService] Failed to adjust gas price, using original:', error);
      return originalGasPrice;
    }
  }

  /**
   * Estimate gas limit for delayed transaction
   */
  private async estimateGasForDelayedTransaction(
    transaction: ethers.TransactionRequest,
    chainId: string
  ): Promise<bigint> {
    try {
      // Add buffer for delayed transactions
      const baseGasLimit = await this.walletManager.estimateGas(transaction, chainId);
      const bufferMultiplier = 1.2; // 20% buffer
      
      const adjustedGasLimit = baseGasLimit * BigInt(Math.floor(bufferMultiplier * 100)) / BigInt(100);
      
      logger.info('[PaymentService] Gas limit estimation for delayed transaction', {
        baseGasLimit: baseGasLimit.toString(),
        adjustedGasLimit: adjustedGasLimit.toString(),
        bufferMultiplier
      });
      
      return adjustedGasLimit;
    } catch (error: unknown) {
      logger.warn('[PaymentService] Failed to estimate gas for delayed transaction:', error);
      // Return a safe default
      return BigInt(21000); // Basic ETH transfer gas limit
    }
  }

  /**
   * Get detailed queue status with user-friendly information
   */
  async getDetailedQueueStatus(): Promise<{
    total: number;
    queued: number;
    pending: number;
    failed: number;
    processing: boolean;
    lastProcessed?: number;
    estimatedTimeRemaining?: number;
    errors?: string[];
  }> {
    try {
      const basicStatus = await TxQueue.getQueueStatus();
      const queued = await TxQueue.getQueuedTransactions();
      
      // Calculate estimated time remaining (rough estimate: 30 seconds per transaction)
      const estimatedTimeRemaining = queued.length > 0 ? queued.length * 30 : 0;
      
      // Get recent errors from failed transactions
      const failedTransactions = await this.getFailedTransactions();
      const errors = failedTransactions.slice(0, 3).map(tx => tx.error || 'Unknown error');
      
      return {
        ...basicStatus,
        processing: false, // TODO: Add processing state tracking
        estimatedTimeRemaining,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error: unknown) {
      logger.error('[PaymentService] Failed to get detailed queue status:', error);
      return {
        total: 0,
        queued: 0,
        pending: 0,
        failed: 0,
        processing: false
      };
    }
  }

  /**
   * Get failed transactions for user feedback
   */
  async getFailedTransactions(): Promise<Array<{ id: string; error: string; timestamp: number }>> {
    try {
      const allTransactions = await TxQueue.getPendingTransactions();
      return allTransactions
        .filter(tx => tx.status === 'failed')
        .map(tx => ({
          id: tx.id || '',
          error: typeof tx.error === 'string' ? tx.error : 'Unknown error',
          timestamp: tx.timestamp || Date.now()
        }));
    } catch (error: unknown) {
      logger.error('[PaymentService] Failed to get failed transactions:', error);
      return [];
    }
  }

  /**
   * Get user-friendly status message for queue
   */
  async getQueueStatusMessage(): Promise<{
    message: string;
    type: 'success' | 'warning' | 'error' | 'info';
    actionRequired?: boolean;
  }> {
    try {
      const status = await this.getDetailedQueueStatus();
      
      if (status.total === 0) {
        return {
          message: 'No queued transactions',
          type: 'success'
        };
      }
      
      if (status.failed > 0) {
        return {
          message: `${status.failed} transaction(s) failed. Check details for more information.`,
          type: 'error',
          actionRequired: true
        };
      }
      
      if (status.queued > 0) {
        const timeMessage = status.estimatedTimeRemaining 
          ? `Estimated time: ${Math.ceil(status.estimatedTimeRemaining / 60)} minutes`
          : '';
        
        return {
          message: `${status.queued} transaction(s) queued for processing. ${timeMessage}`.trim(),
          type: 'info'
        };
      }
      
      if (status.pending > 0) {
        return {
          message: `${status.pending} transaction(s) pending confirmation`,
          type: 'warning'
        };
      }
      
      return {
        message: 'Processing transactions...',
        type: 'info'
      };
    } catch (error: unknown) {
      logger.error('[PaymentService] Failed to get queue status message:', error);
      return {
        message: 'Unable to get queue status',
        type: 'error'
      };
    }
  }

  /**
   * Force sync balance before allowing offline transactions
   */
  async forceSyncBeforeOffline(chainId: string): Promise<{
    success: boolean;
    message: string;
    balance?: string;
  }> {
    try {
      logger.info('[PaymentService] Force syncing balance before offline transaction');
      
      const syncResult = await this.walletManager.forceBalanceSync(chainId);
      
      if (syncResult.success) {
        return {
          success: true,
          message: 'Balance synced successfully. You can now send offline transactions.',
          balance: syncResult.balance
        };
      } else {
        return {
          success: false,
          message: `Failed to sync balance: ${syncResult.error}. Please check your internet connection.`
        };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[PaymentService] Force sync failed:', errorMessage);
      return {
        success: false,
        message: `Sync failed: ${errorMessage}`
      };
    }
  }
} 