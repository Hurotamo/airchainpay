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
import { TokenInfo } from '../wallet/TokenWalletManager';
import OfflineSecurityService from './OfflineSecurityService';
import { GasPriceValidator } from '../utils/GasPriceValidator';

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
  status: 'sent' | 'queued' | 'failed' | 'key_exchange_required' | 'pending' | 'confirmed' | 'advertising';
  transport: string;
  transactionId?: string;
  message?: string;
  timestamp: number;
  metadata?: any;
  deviceId?: string;
  deviceName?: string;
  sessionId?: string;
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
   * Includes comprehensive double-spending prevention
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
      
      // Handle offline scenarios with enhanced security
      if (!isOnline && request.transport !== 'manual') {
        logger.info('[PaymentService] Offline detected, performing security checks before queueing');
        return await this.queueOfflineTransactionWithSecurity(request);
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
      // Check network status for the target chain
      const isOnline = await this.checkNetworkStatus(request.chainId);

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

      // Sign transaction
      const signedTx = await this.walletManager.signTransaction(transaction, request.chainId);

      if (isOnline) {
        // Send immediately using TokenWalletManager
        const privateKey = await this.walletManager.exportPrivateKey();
        if (!privateKey) {
          throw new Error('No private key found in wallet storage');
        }
        // Always get chain config for merging
        const chainConfig = (await import('../constants/AppConfig')).SUPPORTED_CHAINS[request.chainId];
        if (!chainConfig) {
          throw new Error(`Unsupported chain: ${request.chainId}`);
        }
        let tokenInfo: TokenInfo;
        if (request.token) {
          // Merge request.token with chain config to ensure all fields are present
          tokenInfo = {
            symbol: request.token.symbol || chainConfig.nativeCurrency.symbol,
            name: (request.token as any).name || chainConfig.nativeCurrency.name,
            decimals: request.token.decimals || chainConfig.nativeCurrency.decimals,
            address: request.token.address || '',
            chainId: String(request.chainId),
            isNative: request.token.isNative !== undefined ? request.token.isNative : true,
            logoUri: (request.token as any).logoUri,
            isStablecoin: (request.token as any).isStablecoin
          };
        } else {
          tokenInfo = {
            symbol: chainConfig.nativeCurrency.symbol,
            name: chainConfig.nativeCurrency.name,
            decimals: chainConfig.nativeCurrency.decimals,
            address: '',
            chainId: String(request.chainId),
            isNative: true,
            logoUri: undefined,
            isStablecoin: undefined
          };
        }
        // Use TokenWalletManager to send
        const TokenWalletManager = (await import('../wallet/TokenWalletManager')).default;
        const result = await TokenWalletManager.sendTokenTransaction(
          privateKey,
          request.to,
          request.amount,
          tokenInfo,
          request.paymentReference
        );
        logger.info('[PaymentService] Manual transaction sent immediately', { hash: result.hash, to: request.to, amount: request.amount, chainId: request.chainId });
        return {
          status: 'sent',
          transport: 'manual',
          transactionId: result.hash,
          message: 'Transaction sent immediately (manual mode)',
          timestamp: Date.now(),
          metadata: result
        };
      } else {
        // Offline: queue as before
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
        logger.info('[PaymentService] Manual transaction queued (offline)', {
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
      }
    } catch (error) {
      logger.error('[PaymentService] Manual transaction failed:', error);
      throw error;
    }
  }

  /**
   * Process on-chain transaction with gas price validation
   */
  private async processOnChainTransaction(request: PaymentRequest): Promise<PaymentResult> {
    try {
      // Create transaction object for gas price validation
      const transaction = {
        to: request.to,
        value: request.token?.isNative 
          ? ethers.parseEther(request.amount) 
          : ethers.parseUnits(request.amount, request.token?.decimals || 18),
        data: request.paymentReference 
          ? ethers.hexlify(ethers.toUtf8Bytes(request.paymentReference)) 
          : undefined
      };

      // Get current gas price and validate it
      const gasPrice = await this.walletManager.getGasPrice(request.chainId);
      
      // Comprehensive gas price validation
      const gasPriceValidation = GasPriceValidator.validateGasPrice(gasPrice, request.chainId);
      if (!gasPriceValidation.isValid) {
        throw new Error(`Gas price validation failed: ${gasPriceValidation.error}`);
      }

      // Check if gas price is reasonable for current network conditions
      const reasonablenessCheck = await GasPriceValidator.isGasPriceReasonable(gasPrice, request.chainId);
      if (!reasonablenessCheck.isReasonable && reasonablenessCheck.reasonableness === 'very_high') {
        throw new Error(`Gas price is unreasonably high: ${reasonablenessCheck.proposedGwei.toFixed(2)} gwei (${reasonablenessCheck.ratio.toFixed(2)}x above current)`);
      }

      // Log warning for high gas prices
      if (gasPriceValidation.warningLevel === 'warning' || gasPriceValidation.warningLevel === 'high') {
        logger.warn('[PaymentService] High gas price detected for onchain transaction', {
          chainId: request.chainId,
          gasPrice: gasPrice.toString(),
          gasPriceGwei: gasPriceValidation.gasPriceGwei,
          warningLevel: gasPriceValidation.warningLevel,
          reasonableness: reasonablenessCheck.reasonableness
        });
      }

      // Estimate optimal gas price if current price is too high
      let finalGasPrice = gasPrice;
      if (gasPriceValidation.warningLevel === 'high') {
        const optimalEstimate = await GasPriceValidator.estimateOptimalGasPrice(request.chainId, 'normal');
        if (optimalEstimate.isValid) {
          finalGasPrice = BigInt(optimalEstimate.gasPrice);
          logger.info('[PaymentService] Using optimal gas price estimate', {
            originalPrice: gasPrice.toString(),
            optimalPrice: finalGasPrice.toString(),
            chainId: request.chainId
          });
        }
      }

      // Send transaction with validated gas price
      const result = await this.onChainTransport.send({
        to: request.to,
        amount: request.amount,
        chainId: request.chainId,
        token: request.token,
        paymentReference: request.paymentReference,
        gasPrice: finalGasPrice.toString()
      });

      return {
        status: 'sent',
        transport: 'onchain',
        timestamp: Date.now(),
        metadata: {
          ...result,
          gasPriceValidation: {
            isValid: gasPriceValidation.isValid,
            warningLevel: gasPriceValidation.warningLevel,
            gasPriceGwei: gasPriceValidation.gasPriceGwei,
            reasonableness: reasonablenessCheck.reasonableness
          }
        }
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
   * Enhanced offline transaction queueing with comprehensive security checks
   */
  private async queueOfflineTransactionWithSecurity(request: PaymentRequest): Promise<PaymentResult> {
    try {
      logger.info('[PaymentService] Performing security checks for offline transaction');

      // Step 1: Perform comprehensive security check
      const tokenInfo: TokenInfo = request.token ? {
        symbol: request.token.symbol,
        name: request.token.symbol, // Use symbol as name if not provided
        decimals: request.token.decimals,
        address: request.token.address,
        chainId: request.chainId,
        isNative: request.token.isNative
      } : {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        address: '',
        chainId: request.chainId,
        isNative: true
      };

      await OfflineSecurityService.performOfflineSecurityCheck(
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

    } catch (error) {
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
         name: request.token.symbol, // Use symbol as name if not provided
         decimals: request.token.decimals,
         address: request.token.address,
         chainId: request.chainId,
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
        throw new Error(`Insufficient available balance. Required: ${ethers.formatEther(requiredAmount)}, Available: ${ethers.formatEther(availableBalance)}`);
      }

      logger.info('[PaymentService] Balance validation passed');
    } catch (error) {
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
    } catch (error) {
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
        throw new Error('Invalid nonce for offline transaction. Please sync with network first.');
      }

      // Update offline nonce
      await this.updateOfflineNonce(chainId, offlineNonce + 1);
      
      logger.info('[PaymentService] Nonce validation passed');
    } catch (error) {
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
    } catch (error) {
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
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const key = `offline_nonce_${chainId}`;
      const stored = await AsyncStorage.getItem(key);
      return stored ? parseInt(stored, 10) : 0;
    } catch (error) {
      logger.error('[PaymentService] Failed to get offline nonce:', error);
      return 0;
    }
  }

  /**
   * Update offline nonce in local storage
   */
  private async updateOfflineNonce(chainId: string, nonce: number): Promise<void> {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const key = `offline_nonce_${chainId}`;
      await AsyncStorage.setItem(key, nonce.toString());
      logger.info('[PaymentService] Updated offline nonce', { chainId, nonce });
    } catch (error) {
      logger.error('[PaymentService] Failed to update offline nonce:', error);
      throw error;
    }
  }

  /**
   * Get stored nonce from local storage
   */
  private async getStoredNonce(chainId: string): Promise<number> {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const key = `stored_nonce_${chainId}`;
      const stored = await AsyncStorage.getItem(key);
      return stored ? parseInt(stored, 10) : 0;
    } catch (error) {
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
    } catch (error) {
      logger.error('[PaymentService] Failed to get pending transactions total:', error);
      return BigInt(0);
    }
  }

  /**
   * Update offline balance tracking
   */
  private async updateOfflineBalanceTracking(request: PaymentRequest): Promise<void> {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
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
    } catch (error) {
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

            // Clear offline balance tracking for this transaction
            if (tx.metadata?.token) {
              const tokenInfo: TokenInfo = {
                symbol: tx.metadata.token.symbol,
                name: tx.metadata.token.symbol,
                decimals: tx.metadata.token.decimals,
                address: tx.metadata.token.address,
                chainId: tx.chainId!,
                isNative: tx.metadata.token.isNative
              };
              await OfflineSecurityService.clearOfflineBalanceTracking(tx.chainId!, tx.amount, tokenInfo);
            }
            
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