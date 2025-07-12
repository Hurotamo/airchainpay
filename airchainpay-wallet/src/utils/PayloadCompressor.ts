import * as protobuf from 'protobufjs';
import * as cbor from 'cbor';
import { logger } from './Logger';

export interface CompressedPayload {
  data: Buffer;
  format: 'protobuf' | 'cbor' | 'protobuf_cbor';
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

export interface DecompressedPayload {
  data: any;
  format: string;
  success: boolean;
  error?: string;
}

export class PayloadCompressor {
  private static instance: PayloadCompressor;
  private root!: protobuf.Root;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): PayloadCompressor {
    if (!PayloadCompressor.instance) {
      PayloadCompressor.instance = new PayloadCompressor();
    }
    return PayloadCompressor.instance;
  }

  /**
   * Initialize protobuf schema
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load protobuf schema
      this.root = await protobuf.load('./src/proto/transaction.proto');
      this.isInitialized = true;
      logger.info('[PayloadCompressor] Protobuf schema loaded successfully');
    } catch (error) {
      logger.error('[PayloadCompressor] Failed to load protobuf schema:', error);
      throw new Error('Failed to initialize payload compressor');
    }
  }

  /**
   * Compress transaction payload using protobuf + CBOR
   */
  async compressTransactionPayload(txData: any): Promise<CompressedPayload> {
    await this.initialize();

    try {
      const originalSize = JSON.stringify(txData).length;
      
      // Convert to protobuf format
      const TransactionPayload = this.root.lookupType('airchainpay.TransactionPayload');
      
      // Prepare protobuf data
      const protoData = {
        to: txData.to || '',
        amount: txData.amount || '',
        chainId: txData.chainId || '',
        token: txData.token ? {
          symbol: txData.token.symbol || '',
          name: txData.token.name || '',
          decimals: txData.token.decimals || 18,
          address: txData.token.address || '',
          chainId: txData.token.chainId || '',
          isNative: txData.token.isNative || false
        } : undefined,
        paymentReference: txData.paymentReference || '',
        metadata: txData.metadata ? {
          merchant: txData.metadata.merchant || '',
          location: txData.metadata.location || '',
          maxAmount: txData.metadata.maxAmount || '',
          minAmount: txData.metadata.minAmount || '',
          expiry: txData.metadata.expiry || 0,
          timestamp: txData.metadata.timestamp || Date.now(),
          extra: txData.metadata.extra || {}
        } : undefined,
        timestamp: txData.timestamp || Date.now(),
        version: txData.version || '1.0',
        type: txData.type || 'payment_request'
      };

      // Encode with protobuf
      const protoBuffer = TransactionPayload.encode(protoData).finish();
      
      // Further compress with CBOR
      const cborBuffer = cbor.encode(protoBuffer);
      
      const compressedSize = cborBuffer.length;
      const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100;

      logger.info('[PayloadCompressor] Transaction compressed', {
        originalSize,
        compressedSize,
        compressionRatio: `${compressionRatio.toFixed(2)}%`,
        format: 'protobuf_cbor'
      });

      return {
        data: cborBuffer,
        format: 'protobuf_cbor',
        originalSize,
        compressedSize,
        compressionRatio
      };

    } catch (error) {
      logger.error('[PayloadCompressor] Failed to compress transaction:', error);
      throw new Error(`Compression failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Decompress transaction payload
   */
  async decompressTransactionPayload(compressedData: Buffer): Promise<DecompressedPayload> {
    await this.initialize();

    try {
      // Decode CBOR first
      const protoBuffer = cbor.decode(compressedData);
      
      // Decode protobuf
      const TransactionPayload = this.root.lookupType('airchainpay.TransactionPayload');
      const decodedData = TransactionPayload.decode(protoBuffer);
      
      // Convert to plain object
      const result = TransactionPayload.toObject(decodedData, {
        longs: String,
        enums: String,
        bytes: String,
      });

      logger.info('[PayloadCompressor] Transaction decompressed successfully');

      return {
        data: result,
        format: 'protobuf_cbor',
        success: true
      };

    } catch (error) {
      logger.error('[PayloadCompressor] Failed to decompress transaction:', error);
      return {
        data: null,
        format: 'protobuf_cbor',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Compress BLE payment data
   */
  async compressBLEPaymentData(paymentData: any): Promise<CompressedPayload> {
    await this.initialize();

    try {
      const originalSize = JSON.stringify(paymentData).length;
      
      const BLEPaymentData = this.root.lookupType('airchainpay.BLEPaymentData');
      
      const protoData = {
        type: paymentData.type || 'payment',
        to: paymentData.to || '',
        amount: paymentData.amount || '',
        chainId: paymentData.chainId || '',
        paymentReference: paymentData.paymentReference || '',
        timestamp: paymentData.timestamp || Date.now(),
        token: paymentData.token ? {
          symbol: paymentData.token.symbol || '',
          name: paymentData.token.name || '',
          decimals: paymentData.token.decimals || 18,
          address: paymentData.token.address || '',
          chainId: paymentData.token.chainId || '',
          isNative: paymentData.token.isNative || false
        } : undefined,
        metadata: paymentData.metadata ? {
          merchant: paymentData.metadata.merchant || '',
          location: paymentData.metadata.location || '',
          maxAmount: paymentData.metadata.maxAmount || '',
          minAmount: paymentData.metadata.minAmount || '',
          expiry: paymentData.metadata.expiry || 0,
          timestamp: paymentData.metadata.timestamp || Date.now(),
          extra: paymentData.metadata.extra || {}
        } : undefined
      };

      const protoBuffer = BLEPaymentData.encode(protoData).finish();
      const cborBuffer = cbor.encode(protoBuffer);
      
      const compressedSize = cborBuffer.length;
      const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100;

      logger.info('[PayloadCompressor] BLE payment compressed', {
        originalSize,
        compressedSize,
        compressionRatio: `${compressionRatio.toFixed(2)}%`
      });

      return {
        data: cborBuffer,
        format: 'protobuf_cbor',
        originalSize,
        compressedSize,
        compressionRatio
      };

    } catch (error) {
      logger.error('[PayloadCompressor] Failed to compress BLE payment:', error);
      throw new Error(`BLE compression failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Decompress BLE payment data
   */
  async decompressBLEPaymentData(compressedData: Buffer): Promise<DecompressedPayload> {
    await this.initialize();

    try {
      const protoBuffer = cbor.decode(compressedData);
      const BLEPaymentData = this.root.lookupType('airchainpay.BLEPaymentData');
      const decodedData = BLEPaymentData.decode(protoBuffer);
      
      const result = BLEPaymentData.toObject(decodedData, {
        longs: String,
        enums: String,
        bytes: String,
      });

      return {
        data: result,
        format: 'protobuf_cbor',
        success: true
      };

    } catch (error) {
      logger.error('[PayloadCompressor] Failed to decompress BLE payment:', error);
      return {
        data: null,
        format: 'protobuf_cbor',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Compress QR payment request
   */
  async compressQRPaymentRequest(qrData: any): Promise<CompressedPayload> {
    await this.initialize();

    try {
      const originalSize = JSON.stringify(qrData).length;
      
      const QRPaymentRequest = this.root.lookupType('airchainpay.QRPaymentRequest');
      
      const protoData = {
        type: qrData.type || 'payment_request',
        to: qrData.to || '',
        amount: qrData.amount || '',
        chainId: qrData.chainId || '',
        token: qrData.token ? {
          symbol: qrData.token.symbol || '',
          name: qrData.token.name || '',
          decimals: qrData.token.decimals || 18,
          address: qrData.token.address || '',
          chainId: qrData.token.chainId || '',
          isNative: qrData.token.isNative || false
        } : undefined,
        paymentReference: qrData.paymentReference || '',
        metadata: qrData.metadata ? {
          merchant: qrData.metadata.merchant || '',
          location: qrData.metadata.location || '',
          maxAmount: qrData.metadata.maxAmount || '',
          minAmount: qrData.metadata.minAmount || '',
          expiry: qrData.metadata.expiry || 0,
          timestamp: qrData.metadata.timestamp || Date.now(),
          extra: qrData.metadata.extra || {}
        } : undefined,
        timestamp: qrData.timestamp || Date.now(),
        version: qrData.version || '1.0'
      };

      const protoBuffer = QRPaymentRequest.encode(protoData).finish();
      const cborBuffer = cbor.encode(protoBuffer);
      
      const compressedSize = cborBuffer.length;
      const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100;

      logger.info('[PayloadCompressor] QR payment compressed', {
        originalSize,
        compressedSize,
        compressionRatio: `${compressionRatio.toFixed(2)}%`
      });

      return {
        data: cborBuffer,
        format: 'protobuf_cbor',
        originalSize,
        compressedSize,
        compressionRatio
      };

    } catch (error) {
      logger.error('[PayloadCompressor] Failed to compress QR payment:', error);
      throw new Error(`QR compression failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Decompress QR payment request
   */
  async decompressQRPaymentRequest(compressedData: Buffer): Promise<DecompressedPayload> {
    await this.initialize();

    try {
      const protoBuffer = cbor.decode(compressedData);
      const QRPaymentRequest = this.root.lookupType('airchainpay.QRPaymentRequest');
      const decodedData = QRPaymentRequest.decode(protoBuffer);
      
      const result = QRPaymentRequest.toObject(decodedData, {
        longs: String,
        enums: String,
        bytes: String,
      });

      return {
        data: result,
        format: 'protobuf_cbor',
        success: true
      };

    } catch (error) {
      logger.error('[PayloadCompressor] Failed to decompress QR payment:', error);
      return {
        data: null,
        format: 'protobuf_cbor',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Fallback to JSON if compression fails
   */
  fallbackToJSON(data: any): Buffer {
    const jsonString = JSON.stringify(data);
    return Buffer.from(jsonString, 'utf8');
  }

  /**
   * Get compression statistics
   */
  getCompressionStats(originalSize: number, compressedSize: number) {
    const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100;
    const spaceSaved = originalSize - compressedSize;
    
    return {
      originalSize,
      compressedSize,
      compressionRatio: `${compressionRatio.toFixed(2)}%`,
      spaceSaved,
      efficiency: compressionRatio > 0 ? 'good' : 'poor'
    };
  }
} 