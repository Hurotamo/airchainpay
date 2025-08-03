// QRTransport for generating QR payment payloads with offline support and compression
import { logger } from '../../utils/Logger';
import { MultiChainWalletManager } from '../../wallet/MultiChainWalletManager';
import { TxQueue } from '../TxQueue';
import { ethers } from 'ethers';
import { TokenInfo } from '../../wallet/TokenWalletManager';
import offlineSecurityService from '../OfflineSecurityService';
import QRCode from 'qrcode';

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

export interface IPaymentTransport<RequestType, ResultType> {
  send(txData: RequestType): Promise<ResultType>;
}

export class QRTransport implements IPaymentTransport<PaymentRequest, PaymentResult> {
  async send(txData: PaymentRequest): Promise<PaymentResult> {
    try {
      logger.info('[QRTransport] Starting QR payment flow', txData);
      
      const { to, amount, chainId, token, paymentReference } = txData;
      
      if (!to || !amount || !chainId) {
        throw new Error('Missing required payment fields: to, amount, chainId');
      }

      // Check if we're offline by attempting to connect to the network
      const isOnline = await this.checkNetworkStatus(chainId);
      
      if (!isOnline) {
        logger.info('[QRTransport] Offline detected, performing centralized security checks before queueing');
        return await this.queueOfflineTransactionWithCentralizedSecurity(txData);
      }
      
      // Create QR payment payload with essential fields only
      const qrPayload: any = {
        type: 'payment_request',
        to,
        amount,
        chainId,
        token: token || null,
        paymentReference: paymentReference || null,
        timestamp: Date.now(),
        version: '1.0'
      };

      // Encode the payload as QR code
      const qrData = await QRCode.toDataURL(JSON.stringify(qrPayload));

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
        timestamp: Date.now()
      };

    } catch (error) {
      logger.error('[QRTransport] QR payment failed:', error);
      throw new Error(`QR payment failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Enhanced offline transaction queueing with centralized security checks
   */
  private async queueOfflineTransactionWithCentralizedSecurity(txData: PaymentRequest): Promise<PaymentResult> {
    try {
      logger.info('[QRTransport] Performing centralized security checks for offline transaction');

      const { to, amount, chainId, token, paymentReference } = txData;

      // Use centralized security service for all checks
      const tokenInfo: TokenInfo = token
        ? {
            symbol: token.symbol,
            name: token.symbol,
            decimals: token.decimals,
            address: token.address,
            chainId: chainId,
            isNative: token.isNative
          }
        : {
            symbol: 'ETH',
            name: 'Ethereum',
            decimals: 18,
            address: '',
            chainId: chainId,
            isNative: true
          };

      // Perform comprehensive security checks using centralized service
      await offlineSecurityService.performOfflineSecurityCheck(
        to,
        amount,
        chainId,
        tokenInfo
      );

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
      
      logger.info('[QRTransport] Amount validation passed', {
        originalAmount: amountString,
        parsedAmount: amountNum,
        tokenDecimals: token?.decimals || 18,
        isNative: token?.isNative
      });

      // Create transaction object for signing with validated amount
      const transaction = {
        to: to,
        value: token?.isNative ? ethers.parseEther(amountString) : ethers.parseUnits(amountString, token?.decimals || 18),
        data: paymentReference ? ethers.hexlify(ethers.toUtf8Bytes(paymentReference)) : undefined
      };

      // Sign transaction for offline queueing
      const walletManager = MultiChainWalletManager.getInstance();
      const signedTx = await walletManager.signTransaction(transaction, chainId);
      
      // Add to offline queue with enhanced metadata
      await TxQueue.addTransaction({
        id: Date.now().toString(),
        to: to,
        amount: amount,
        status: 'pending',
        chainId: chainId,
        timestamp: Date.now(),
        signedTx: signedTx,
        transport: 'qr',
        paymentReference: paymentReference,
        metadata: {
          timestamp: Date.now()
        }
      });

      // Update offline balance tracking using centralized service
      await offlineSecurityService.updateOfflineBalanceTracking(chainId, amount, tokenInfo);

      logger.info('[QRTransport] Transaction queued for offline processing with centralized security validation', {
        to,
        amount,
        chainId,
        transport: 'qr'
      });

      return {
        status: 'queued',
        transport: 'qr',
        message: 'Transaction queued for offline processing (security validated)',
        timestamp: Date.now()
      };
    } catch (error: unknown) {
      logger.error('[QRTransport] Centralized security check failed:', error);
      throw error;
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