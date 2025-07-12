// Centralized PaymentService for BLE, QR, and normal payments
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

export interface PaymentRequest {
  to: string;
  amount: string;
  chainId: string;
  transport: 'ble' | 'secure_ble' | 'qr' | 'manual' | 'onchain';
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
  status: 'sent' | 'failed' | 'queued' | 'key_exchange_required' | 'generated';
  transport: 'ble' | 'secure_ble' | 'qr' | 'manual' | 'onchain';
  transactionId?: string;
  deviceId?: string;
  deviceName?: string;
  sessionId?: string;
  message?: string;
  timestamp: number;
  metadata?: any;
  qrData?: string;
}

export class PaymentService {
  private static instance: PaymentService;
  private bleTransport: BLETransport;
  private secureBleTransport: SecureBLETransport;
  private qrTransport: QRTransport;
  private onChainTransport: OnChainTransport;
  private walletManager: MultiChainWalletManager;
  private transactionService: TransactionService;

  private constructor() {
    this.bleTransport = new BLETransport();
    this.secureBleTransport = new SecureBLETransport();
    this.qrTransport = new QRTransport();
    this.onChainTransport = new OnChainTransport();
    this.walletManager = MultiChainWalletManager.getInstance();
    this.transactionService = TransactionService.getInstance();
  }

  static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }

  /**
   * Send payment using the specified transport method
   * Supports offline-first approach with automatic queueing
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
      // For manual/onchain/offline, check for signedTx
      if ((request.transport === 'manual' || request.transport === 'onchain') && !(request as any).signedTx) {
        throw new Error('Missing signedTx in payment request for manual/onchain transport.');
      }

      // Validate payment request
      this.validatePaymentRequest(request);

      // Check network status for the target chain
      const isOnline = await this.checkNetworkStatus(request.chainId);
      
      // Handle offline scenarios
      if (!isOnline && request.transport !== 'manual') {
        logger.info('[PaymentService] Offline detected, queueing transaction');
        return await this.queueOfflineTransaction(request);
      }

      // Process based on transport type
      switch (request.transport) {
        case 'ble':
          return await this.processBLETransaction(request);
        case 'secure_ble':
          return await this.processSecureBLETransaction(request);
        case 'qr':
          return await this.processQRTransaction(request);
        case 'manual':
          return await this.processManualTransaction(request);
        case 'onchain':
          return await this.processOnChainTransaction(request);
        default:
          throw new Error(`Unsupported transport: ${request.transport}`);
      }

    } catch (error) {
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
   * Process BLE transaction (peer-to-peer) - Legacy unencrypted
   */
  private async processBLETransaction(request: PaymentRequest): Promise<PaymentResult> {
    try {
      const result = await this.bleTransport.send({
        to: request.to,
        amount: request.amount,
        chainId: request.chainId,
        paymentReference: request.paymentReference,
        device: request.extraData?.device,
        token: request.token,
        metadata: request.metadata
      });

      return {
        status: 'sent',
        transport: 'ble',
        deviceId: result.deviceId,
        deviceName: result.deviceName,
        timestamp: Date.now(),
        metadata: result
      };

    } catch (error) {
      logger.error('[PaymentService] BLE transaction failed:', error);
      throw error;
    }
  }

  /**
   * Process Secure BLE transaction (encrypted peer-to-peer)
   */
  private async processSecureBLETransaction(request: PaymentRequest): Promise<PaymentResult> {
    try {
      const result = await this.secureBleTransport.send({
        to: request.to,
        amount: request.amount,
        chainId: request.chainId,
        paymentReference: request.paymentReference,
        device: request.extraData?.device,
        token: request.token,
        metadata: request.metadata
      });

      return {
        status: result.status,
        transport: 'secure_ble',
        deviceId: result.deviceId,
        deviceName: result.deviceName,
        sessionId: result.sessionId,
        message: result.message,
        timestamp: Date.now(),
        metadata: result
      };

    } catch (error) {
      logger.error('[PaymentService] Secure BLE transaction failed:', error);
      throw error;
    }
  }

  /**
   * Process QR transaction (offline QR code exchange)
   */
  private async processQRTransaction(request: PaymentRequest): Promise<PaymentResult> {
    try {
      const result = await this.qrTransport.send({
        to: request.to,
        amount: request.amount,
        chainId: request.chainId,
        token: request.token,
        paymentReference: request.paymentReference,
        merchant: request.metadata?.merchant,
        location: request.metadata?.location,
        maxAmount: request.metadata?.maxAmount,
        minAmount: request.metadata?.minAmount,
        expiry: request.metadata?.expiry,
        timestamp: request.metadata?.timestamp
      });

      return {
        status: result.status,
        transport: 'qr',
        qrData: result.qrData,
        message: result.message,
        timestamp: Date.now(),
        metadata: result
      };

    } catch (error) {
      logger.error('[PaymentService] QR transaction failed:', error);
      throw error;
    }
  }

  /**
   * Process manual transaction (offline signing)
   */
  private async processManualTransaction(request: PaymentRequest): Promise<PaymentResult> {
    try {
      // Create transaction object for signing
      const transaction = {
        to: request.to,
        value: request.token?.isNative 
          ? ethers.parseEther(request.amount) 
          : ethers.parseUnits(request.amount, request.token?.decimals || 18),
        data: request.paymentReference 
          ? ethers.hexlify(ethers.toUtf8Bytes(request.paymentReference)) 
          : undefined
      };

      // Sign transaction offline
      const signedTx = await this.walletManager.signTransaction(transaction, request.chainId);
      
      // Add to offline queue
      const transactionId = Date.now().toString();
      await TxQueue.addTransaction({
        id: transactionId,
        to: request.to,
        amount: request.amount,
        status: 'pending',
        chainId: request.chainId,
        timestamp: Date.now(),
        signedTx: signedTx,
        transport: 'manual',
        metadata: {
          token: request.token,
          paymentReference: request.paymentReference,
          merchant: request.metadata?.merchant,
          location: request.metadata?.location
        }
      });

      logger.info('[PaymentService] Manual transaction queued', {
        transactionId,
        to: request.to,
        amount: request.amount,
        chainId: request.chainId
      });

      return {
        status: 'queued',
        transport: 'manual',
        transactionId: transactionId,
        message: 'Transaction signed and queued for processing when online',
        timestamp: Date.now()
      };

    } catch (error) {
      logger.error('[PaymentService] Manual transaction failed:', error);
      throw error;
    }
  }

  /**
   * Process on-chain transaction
   */
  private async processOnChainTransaction(request: PaymentRequest): Promise<PaymentResult> {
    try {
      const result = await this.onChainTransport.send({
        to: request.to,
        amount: request.amount,
        chainId: request.chainId,
        token: request.token,
        paymentReference: request.paymentReference
      });

      return {
        status: 'sent',
        transport: 'onchain',
        timestamp: Date.now(),
        metadata: result
      };

    } catch (error) {
      logger.error('[PaymentService] On-chain transaction failed:', error);
      throw error;
    }
  }

  /**
   * Validate payment request
   */
  private validatePaymentRequest(request: PaymentRequest): void {
    if (!request.to || !request.amount || !request.chainId) {
      throw new Error('Missing required fields: to, amount, chainId');
    }

    if (parseFloat(request.amount) <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    // Validate address format
    if (!ethers.isAddress(request.to)) {
      throw new Error('Invalid recipient address');
    }
  }

  /**
   * Check network status for a specific chain
   */
  private async checkNetworkStatus(chainId: string): Promise<boolean> {
    try {
      return await this.walletManager.checkNetworkStatus(chainId);
    } catch (error) {
      logger.warn('[PaymentService] Failed to check network status:', error);
      return false;
    }
  }

  /**
   * Queue transaction for offline processing
   */
  private async queueOfflineTransaction(request: PaymentRequest): Promise<PaymentResult> {
    try {
      // Create transaction object for signing
      const transaction = {
        to: request.to,
        value: request.token?.isNative 
          ? ethers.parseEther(request.amount) 
          : ethers.parseUnits(request.amount, request.token?.decimals || 18),
        data: request.paymentReference 
          ? ethers.hexlify(ethers.toUtf8Bytes(request.paymentReference)) 
          : undefined
      };

      // Sign transaction for offline queueing
      const signedTx = await this.walletManager.signTransaction(transaction, request.chainId);
      
      // Add to offline queue
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
          token: request.token,
          paymentReference: request.paymentReference,
          merchant: request.metadata?.merchant,
          location: request.metadata?.location
        }
      });

      logger.info('[PaymentService] Transaction queued for offline processing', {
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
        message: 'Transaction queued for processing when online',
        timestamp: Date.now()
      };

    } catch (error) {
      logger.error('[PaymentService] Failed to queue offline transaction:', error);
      throw error;
    }
  }

  /**
   * Get pending transactions from queue
   */
  async getPendingTransactions(): Promise<Transaction[]> {
    return await TxQueue.getPendingTransactions();
  }

  /**
   * Process queued transactions when online
   */
  async processQueuedTransactions(): Promise<void> {
    try {
      const pendingTxs = await this.getPendingTransactions();
      
      for (const tx of pendingTxs) {
        try {
          if (!tx.chainId || !tx.signedTx) {
            logger.warn('[PaymentService] Skipping transaction without chainId or signedTx:', tx.id);
            continue;
          }

          const isOnline = await this.checkNetworkStatus(tx.chainId);
          if (isOnline) {
            // Process the queued transaction using the signed transaction
            const provider = this.transactionService['getProvider'](tx.chainId);
            const txResponse = await provider.broadcastTransaction(tx.signedTx);
            const receipt = await txResponse.wait();
            
            // Update transaction with hash
            await TxQueue.updateTransaction(tx.id, { 
              status: 'completed',
              hash: txResponse.hash
            });
            
            logger.info('[PaymentService] Queued transaction processed', {
              transactionId: tx.id,
              hash: txResponse.hash
            });
          }
        } catch (error) {
          logger.error('[PaymentService] Failed to process queued transaction:', error);
          await TxQueue.updateTransaction(tx.id, { status: 'failed' });
        }
      }
    } catch (error) {
      logger.error('[PaymentService] Failed to process queued transactions:', error);
    }
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.secureBleTransport.cleanup();
  }
} 