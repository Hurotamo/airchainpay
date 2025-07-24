// QRTransport for generating QR payment payloads with offline support and compression
import { logger } from '../../utils/Logger';
import { IPaymentTransport } from './BLETransport';
import QRCode from 'qrcode';
import { TxQueue } from '../TxQueue';
import { MultiChainWalletManager } from '../../wallet/MultiChainWalletManager';
import { ethers } from 'ethers';
import { TokenInfo } from '../../wallet/TokenWalletManager';
import { QRCodeSigner, SignedQRPayload } from '../../utils/crypto/QRCodeSigner';
import { WalletError, TransactionError } from '../../utils/ErrorClasses';
import { PaymentRequest, PaymentResult } from '../PaymentService';
// See global type declaration for 'qrcode' in qrcode.d.ts

export class QRTransport implements IPaymentTransport {
  async send(txData: PaymentRequest): Promise<PaymentResult> {
    try {
      logger.info('[QRTransport] Processing QR payment', txData);
      
      // Extract payment data
      const {
        to, amount, chainId, token, paymentReference,
        merchant, location, maxAmount, minAmount, expiry, timestamp: inputTimestamp, ...rest
      } = txData;
      
      if (!to || !amount || !chainId) {
        throw new WalletError('Missing required payment fields: to, amount, chainId');
      }

      // Check if we're offline by attempting to connect to the network
      const isOnline = await this.checkNetworkStatus(chainId);
      
      if (!isOnline) {
        logger.info('[QRTransport] Offline detected, performing security checks before queueing');
        return await this.queueOfflineTransactionWithSecurity(txData);
      }
      
      // Create QR payment payload with all possible fields
      const qrPayload: any = {
        type: 'payment_request',
        to,
        amount,
        chainId,
        token: token || null,
        paymentReference: paymentReference || null,
        merchant: merchant || null,
        location: location || null,
        maxAmount: maxAmount || null,
        minAmount: minAmount || null,
        expiry: expiry || null,
        timestamp: inputTimestamp || Date.now(),
        version: '1.0',
        ...rest // include any other extra fields
      };

      // Sign the QR payload with digital signature
      const signedPayload = await QRCodeSigner.signQRPayload(qrPayload, chainId);

      // Encode the signed payload as QR code
      const qrData = await QRCode.toDataURL(JSON.stringify(signedPayload));

      logger.info('[QRTransport] QR payment generated successfully', {
        to,
        amount,
        chainId,
        payloadSize: JSON.stringify(qrPayload).length
      });

      return {
        status: 'sent',
        transport: 'qr',
        qrData,
        message: 'QR payment generated successfully',
        ...txData
      };

    } catch (error) {
      logger.error('[QRTransport] QR payment failed:', error);
      throw new Error(`QR payment failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Enhanced offline transaction queueing with comprehensive security checks
   */
  private async queueOfflineTransactionWithSecurity(txData: PaymentRequest): Promise<PaymentResult> {
    try {
      logger.info('[QRTransport] Performing security checks for offline transaction');

      const { to, amount, chainId, token, paymentReference } = txData;

      // Step 1: Validate balance before allowing offline transaction
      await this.validateOfflineBalance(txData);

      // Step 2: Check for duplicate transactions
      await this.checkForDuplicateTransaction(txData);

      // Step 3: Validate nonce for offline transaction
      await this.validateOfflineNonce(chainId);

      // Step 4: Create transaction object for signing
      const transaction = {
        to: to,
        value: token?.isNative ? ethers.parseEther(amount) : ethers.parseUnits(amount, token?.decimals || 18),
        data: paymentReference ? ethers.hexlify(ethers.toUtf8Bytes(paymentReference)) : undefined
      };

      // Step 5: Sign transaction for offline queueing
      const walletManager = MultiChainWalletManager.getInstance();
      const signedTx = await walletManager.signTransaction(transaction, chainId);
      
      // Step 6: Add to offline queue with enhanced metadata
      await TxQueue.addTransaction({
        id: Date.now().toString(),
        to: to,
        amount: amount,
        status: 'pending',
        chainId: chainId,
        timestamp: Date.now(),
        signedTx: signedTx,
        transport: 'qr',
        metadata: {
          token: token,
          paymentReference: paymentReference,
          merchant: txData.merchant,
          location: txData.location,
          security: {
            balanceValidated: true,
            duplicateChecked: true,
            nonceValidated: true,
            offlineTimestamp: Date.now()
          }
        }
      });

      // Step 7: Update offline balance tracking
      await this.updateOfflineBalanceTracking(txData);

      logger.info('[QRTransport] Transaction queued for offline processing with security validation', {
        to,
        amount,
        chainId,
        transport: 'qr'
      });

      return {
        status: 'queued',
        transport: 'qr',
        message: 'Transaction queued for processing when online (security validated)',
        ...txData
      };

    } catch (error) {
      logger.error('[QRTransport] Failed to queue offline transaction with security:', error);
      throw new Error(`Failed to queue offline transaction: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validate balance before allowing offline transaction
   */
  private async validateOfflineBalance(txData: PaymentRequest): Promise<void> {
    try {
      const { to, amount, chainId, token } = txData;
      const walletManager = MultiChainWalletManager.getInstance();
      const walletInfo = await walletManager.getWalletInfo(chainId);
      
      if (!walletInfo) {
        throw new Error('No wallet found for chain');
      }

      // Get current balance
      const TokenWalletManager = (await import('../../wallet/TokenWalletManager')).default;
      const tokenInfo: TokenInfo = token ? {
        symbol: token.symbol,
        name: token.symbol, // Use symbol as name if not provided
        decimals: token.decimals,
        address: token.address,
        chainId: chainId,
        isNative: token.isNative
      } : {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        address: '',
        chainId: chainId,
        isNative: true
      };

      const balance = await TokenWalletManager.getTokenBalance(walletInfo.address, tokenInfo);
      const requiredAmount = token?.isNative 
        ? ethers.parseEther(amount)
        : ethers.parseUnits(amount, token?.decimals || 18);

      // Get pending transactions total
      const pendingAmount = await this.getPendingTransactionsTotal(chainId, tokenInfo);
      
      // Calculate available balance (current balance - pending transactions)
      const availableBalance = BigInt(balance.balance) - BigInt(pendingAmount);
      
      logger.info('[QRTransport] Balance validation', {
        currentBalance: balance.balance,
        pendingAmount: pendingAmount.toString(),
        availableBalance: availableBalance.toString(),
        requiredAmount: requiredAmount.toString(),
        walletAddress: walletInfo.address
      });

      if (availableBalance < BigInt(requiredAmount)) {
        throw new TransactionError(`Insufficient available balance. Required: ${ethers.formatEther(requiredAmount)}, Available: ${ethers.formatEther(availableBalance)}`);
      }

      logger.info('[QRTransport] Balance validation passed');
    } catch (error) {
      logger.error('[QRTransport] Balance validation failed:', error);
      throw error;
    }
  }

  /**
   * Check for duplicate transactions
   */
  private async checkForDuplicateTransaction(txData: PaymentRequest): Promise<void> {
    try {
      const { to, amount, chainId } = txData;
      const pendingTxs = await TxQueue.getPendingTransactions();
      
      // Check for exact duplicates (same recipient, amount, and chain)
      const duplicate = pendingTxs.find(tx => 
        tx.to === to && 
        tx.amount === amount && 
        tx.chainId === chainId &&
        tx.status === 'pending'
      );

      if (duplicate) {
        throw new Error('Duplicate transaction detected. This transaction is already queued.');
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
        logger.warn('[QRTransport] Similar transaction found within 5 minutes', {
          existing: recentSimilar,
          new: txData
        });
        // Don't throw error for similar transactions, just log warning
      }

      logger.info('[QRTransport] Duplicate check passed');
    } catch (error) {
      logger.error('[QRTransport] Duplicate check failed:', error);
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
      
      logger.info('[QRTransport] Nonce validation', {
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
      
      logger.info('[QRTransport] Nonce validation passed');
    } catch (error) {
      logger.error('[QRTransport] Nonce validation failed:', error);
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
        const walletManager = MultiChainWalletManager.getInstance();
        const walletInfo = await walletManager.getWalletInfo(chainId);
        const provider = walletManager['providers'][chainId];
        return await provider.getTransactionCount(walletInfo.address);
      } else {
        // Use stored nonce if offline
        const storedNonce = await this.getStoredNonce(chainId);
        return storedNonce;
      }
    } catch (error) {
      logger.error('[QRTransport] Failed to get current nonce:', error);
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
      logger.error('[QRTransport] Failed to get offline nonce:', error);
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
      logger.info('[QRTransport] Updated offline nonce', { chainId, nonce });
    } catch (error) {
      logger.error('[QRTransport] Failed to update offline nonce:', error);
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
      logger.error('[QRTransport] Failed to get stored nonce:', error);
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

      logger.info('[QRTransport] Pending transactions total', {
        chainId,
        total: total.toString(),
        pendingCount: pendingTxs.filter(tx => tx.chainId === chainId && tx.status === 'pending').length
      });

      return total;
    } catch (error) {
      logger.error('[QRTransport] Failed to get pending transactions total:', error);
      return BigInt(0);
    }
  }

  /**
   * Update offline balance tracking
   */
  private async updateOfflineBalanceTracking(txData: PaymentRequest): Promise<void> {
    try {
      const { amount, chainId, token } = txData;
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const key = `offline_balance_${chainId}`;
      
      // Get current offline balance tracking
      const stored = await AsyncStorage.getItem(key);
      const tracking = stored ? JSON.parse(stored) : { pendingAmount: '0', lastUpdated: Date.now() };
      
      // Add current transaction amount to pending
      const currentPending = BigInt(tracking.pendingAmount);
      const newAmount = token?.isNative 
        ? ethers.parseEther(amount)
        : ethers.parseUnits(amount, token?.decimals || 18);
      
      tracking.pendingAmount = (currentPending + BigInt(newAmount)).toString();
      tracking.lastUpdated = Date.now();
      
      await AsyncStorage.setItem(key, JSON.stringify(tracking));
      
      logger.info('[QRTransport] Updated offline balance tracking', {
        chainId: chainId,
        newPendingAmount: tracking.pendingAmount,
        transactionAmount: amount
      });
    } catch (error) {
      logger.error('[QRTransport] Failed to update offline balance tracking:', error);
      // Don't throw error as this is not critical
    }
  }

  /**
   * Check if network is online for the specified chain
   */
  private async checkNetworkStatus(chainId: string): Promise<boolean> {
    try {
      const walletManager = MultiChainWalletManager.getInstance();
      return await walletManager.checkNetworkStatus(chainId);
    } catch (error) {
      logger.warn('[QRTransport] Network status check failed, assuming offline:', error);
      return false;
    }
  }
} 