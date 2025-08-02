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
    
    let processedCount = 0;
    let failedCount = 0;
    
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
          processedCount++;
          logger.info('[PaymentService] Queued transaction sent successfully via relay', { id: tx.id });
          
        } catch (relayError: unknown) {
          logger.warn('[PaymentService] Relay failed for queued transaction, trying on-chain fallback:', relayError);
          
          try {
            // Fallback to on-chain transport (on-chain -> blockchain)
            const onChainResult = await this.onChainTransport.send({ ...tx, transport: (tx.transport ?? 'onchain') as PaymentRequest['transport'] });
            
            // Remove from queue on success
            await TxQueue.removeTransaction(tx.id || '');
            processedCount++;
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
            
            failedCount++;
            // Keep transaction in queue for retry later
            // Could implement retry logic here with exponential backoff
          }
        }
      } catch (err: unknown) {
        logger.error('[PaymentService] Failed to process queued transaction', {
          id: tx.id,
          error: err instanceof Error ? err.message : String(err)
        });
        failedCount++;
      }
    }
    
    logger.info('[PaymentService] Finished processing queued transactions', {
      total: queued.length,
      processed: processedCount,
      failed: failedCount,
      remaining: queued.length - processedCount - failedCount
    });
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.secureBleTransport.cleanup();
  }
} 