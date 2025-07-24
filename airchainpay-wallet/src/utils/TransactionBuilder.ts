// TransactionBuilder utility for standardizing transaction data with compression support
import { TokenInfo } from '../wallet/TokenWalletManager';
import { logger } from './Logger';
import { PayloadCompressor } from './PayloadCompressor';
import { Transaction } from '../types/transaction';
import { PaymentRequest } from '../services/PaymentService';

export interface TransactionPayload {
  to: string;
  amount: string;
  chainId: string;
  token?: TokenInfo;
  paymentReference?: string;
  metadata?: any;
}

export class TransactionBuilder {
  private static compressor = PayloadCompressor.getInstance();

  static build({ to, amount, chainId, token, paymentReference, metadata }: TransactionPayload): Transaction {
    // Standardize the transaction object
    return {
      to,
      amount,
      chainId,
      token,
      paymentReference,
      metadata,
      timestamp: Date.now(),
    };
  }

  /**
   * Serialize transaction with compression (protobuf + CBOR)
   */
  static async serializeCompressed(tx: Transaction): Promise<Buffer> {
    try {
      const compressed = await this.compressor.compressTransactionPayload(tx);
      logger.info('[TransactionBuilder] Transaction serialized with compression', {
        originalSize: compressed.originalSize,
        compressedSize: compressed.compressedSize,
        compressionRatio: `${compressed.compressionRatio.toFixed(2)}%`
      });
      return compressed.data;
    } catch (error) {
      logger.warn('[TransactionBuilder] Compression failed, falling back to JSON', error);
      return this.compressor.fallbackToJSON(tx);
    }
  }

  /**
   * Deserialize compressed transaction
   */
  static async deserializeCompressed(compressedData: Buffer): Promise<Transaction> {
    try {
      const result = await this.compressor.decompressTransactionPayload(compressedData);
      if (result.success) {
        logger.info('[TransactionBuilder] Transaction deserialized with compression');
        return result.data;
      } else {
        logger.warn('[TransactionBuilder] Decompression failed, trying JSON fallback');
        return this.deserialize(compressedData.toString());
      }
    } catch (error) {
      logger.warn('[TransactionBuilder] Decompression failed, trying JSON fallback', error);
      return this.deserialize(compressedData.toString());
    }
  }

  /**
   * Legacy JSON serialization (fallback)
   */
  static serialize(tx: Transaction): string {
    // Convert transaction object to string (for BLE/QR)
    return JSON.stringify(tx);
  }

  /**
   * Legacy JSON deserialization (fallback)
   */
  static deserialize(txString: string): Transaction {
    // Parse transaction string back to object
    try {
      return JSON.parse(txString);
    } catch {
      return null;
    }
  }

  /**
   * Serialize BLE payment data with compression
   */
  static async serializeBLEPayment(paymentData: PaymentRequest): Promise<Buffer> {
    try {
      const compressed = await this.compressor.compressBLEPaymentData(paymentData);
      logger.info('[TransactionBuilder] BLE payment serialized with compression', {
        originalSize: compressed.originalSize,
        compressedSize: compressed.compressedSize,
        compressionRatio: `${compressed.compressionRatio.toFixed(2)}%`
      });
      return compressed.data;
    } catch (error) {
      logger.warn('[TransactionBuilder] BLE compression failed, falling back to JSON', error);
      return this.compressor.fallbackToJSON(paymentData);
    }
  }

  /**
   * Deserialize BLE payment data
   */
  static async deserializeBLEPayment(compressedData: Buffer): Promise<PaymentRequest> {
    try {
      const result = await this.compressor.decompressBLEPaymentData(compressedData);
      if (result.success) {
        logger.info('[TransactionBuilder] BLE payment deserialized with compression');
        return result.data;
      } else {
        logger.warn('[TransactionBuilder] BLE decompression failed, trying JSON fallback');
        return this.deserialize(compressedData.toString());
      }
    } catch (error) {
      logger.warn('[TransactionBuilder] BLE decompression failed, trying JSON fallback', error);
      return this.deserialize(compressedData.toString());
    }
  }

  /**
   * Serialize QR payment request with compression
   */
  static async serializeQRPayment(qrData: PaymentRequest): Promise<Buffer> {
    try {
      const compressed = await this.compressor.compressQRPaymentRequest(qrData);
      logger.info('[TransactionBuilder] QR payment serialized with compression', {
        originalSize: compressed.originalSize,
        compressedSize: compressed.compressedSize,
        compressionRatio: `${compressed.compressionRatio.toFixed(2)}%`
      });
      return compressed.data;
    } catch (error) {
      logger.warn('[TransactionBuilder] QR compression failed, falling back to JSON', error);
      return this.compressor.fallbackToJSON(qrData);
    }
  }

  /**
   * Deserialize QR payment request
   */
  static async deserializeQRPayment(compressedData: Buffer): Promise<PaymentRequest> {
    try {
      const result = await this.compressor.decompressQRPaymentRequest(compressedData);
      if (result.success) {
        logger.info('[TransactionBuilder] QR payment deserialized with compression');
        return result.data;
      } else {
        logger.warn('[TransactionBuilder] QR decompression failed, trying JSON fallback');
        return this.deserialize(compressedData.toString());
      }
    } catch (error) {
      logger.warn('[TransactionBuilder] QR decompression failed, trying JSON fallback', error);
      return this.deserialize(compressedData.toString());
    }
  }
} 