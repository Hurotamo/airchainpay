// QRTransport for generating QR payment payloads with offline support and compression
import { logger } from '../../utils/Logger';
import { IPaymentTransport } from './BLETransport';
import QRCode from 'qrcode';
import { TxQueue } from '../TxQueue';
import { MultiChainWalletManager } from '../../wallet/MultiChainWalletManager';
import { TransactionBuilder } from '../../utils/TransactionBuilder';
import { ethers } from 'ethers';
// See global type declaration for 'qrcode' in qrcode.d.ts

export class QRTransport implements IPaymentTransport {
  async send(txData: any): Promise<any> {
    try {
      logger.info('[QRTransport] Processing QR payment', txData);
      
      // Extract payment data
      const {
        to, amount, chainId, token, paymentReference,
        merchant, location, maxAmount, minAmount, expiry, timestamp: inputTimestamp, ...rest
      } = txData;
      
      if (!to || !amount || !chainId) {
        throw new Error('Missing required payment fields: to, amount, chainId');
      }

      // Check if we're offline by attempting to connect to the network
      const isOnline = await this.checkNetworkStatus(chainId);
      
      if (!isOnline) {
        logger.info('[QRTransport] Offline detected, queueing transaction');
        return await this.queueOfflineTransaction(txData);
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
      
      // Remove null fields for cleaner payload
      Object.keys(qrPayload).forEach(key => {
        if (qrPayload[key] === null) {
          delete qrPayload[key];
        }
      });
      
      // Compress QR payload using protobuf + CBOR
      const compressedData = await TransactionBuilder.serializeQRPayment(qrPayload);
      
      // Convert compressed data to base64 for QR encoding
      const qrData = compressedData.toString('base64');
      
      logger.info('[QRTransport] QR payment compressed successfully', {
        originalSize: JSON.stringify(qrPayload).length,
        compressedSize: compressedData.length,
        compressionRatio: `${(((JSON.stringify(qrPayload).length - compressedData.length) / JSON.stringify(qrPayload).length) * 100).toFixed(2)}%`
      });
      
      // Do not generate QR code image here; let UI handle rendering
      return {
        status: 'generated',
        transport: 'qr',
        qrData: qrData, // This is the compressed base64 string to encode in the QR code
        compressionUsed: true,
        compressedSize: compressedData.length,
        ...qrPayload
      };
      
    } catch (error) {
      logger.error('[QRTransport] Failed to process QR payment:', error);
      throw new Error(`QR payment processing failed: ${error instanceof Error ? error.message : String(error)}`);
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

  /**
   * Queue transaction for offline processing
   */
  private async queueOfflineTransaction(txData: any): Promise<any> {
    try {
      const { to, amount, chainId, token, paymentReference } = txData;
      
      // Create transaction object for signing
      const transaction = {
        to: to,
        value: token?.isNative ? ethers.parseEther(amount) : ethers.parseUnits(amount, token?.decimals || 18),
        data: paymentReference ? ethers.hexlify(ethers.toUtf8Bytes(paymentReference)) : undefined
      };

      // Sign transaction for offline queueing
      const walletManager = MultiChainWalletManager.getInstance();
      const signedTx = await walletManager.signTransaction(transaction, chainId);
      
      // Add to offline queue
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
          location: txData.location
        }
      });

      logger.info('[QRTransport] Transaction queued for offline processing', {
        to,
        amount,
        chainId,
        transport: 'qr'
      });

      return {
        status: 'queued',
        transport: 'qr',
        message: 'Transaction queued for processing when online',
        ...txData
      };

    } catch (error) {
      logger.error('[QRTransport] Failed to queue offline transaction:', error);
      throw new Error(`Failed to queue offline transaction: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} 