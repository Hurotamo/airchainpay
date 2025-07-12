const protobuf = require('protobufjs');
const cbor = require('cbor');
const logger = require('./logger');

class PayloadCompressor {
  constructor() {
    this.root = null;
    this.isInitialized = false;
  }

  /**
   * Initialize protobuf schema
   */
  async initialize() {
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
   * Decompress transaction payload
   */
  async decompressTransactionPayload(compressedData) {
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
   * Decompress BLE payment data
   */
  async decompressBLEPaymentData(compressedData) {
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
   * Decompress QR payment request
   */
  async decompressQRPaymentRequest(compressedData) {
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
   * Try to decompress data with fallback to JSON
   */
  async decompressWithFallback(compressedData, type = 'transaction') {
    try {
      let result;
      
      switch (type) {
        case 'ble':
          result = await this.decompressBLEPaymentData(compressedData);
          break;
        case 'qr':
          result = await this.decompressQRPaymentRequest(compressedData);
          break;
        default:
          result = await this.decompressTransactionPayload(compressedData);
      }

      if (result.success) {
        return result.data;
      } else {
        // Fallback to JSON parsing
        logger.warn('[PayloadCompressor] Decompression failed, trying JSON fallback');
        return JSON.parse(compressedData.toString());
      }
    } catch (error) {
      logger.error('[PayloadCompressor] All decompression methods failed:', error);
      throw new Error('Failed to decompress payload');
    }
  }

  /**
   * Detect payload format and decompress accordingly
   */
  async autoDecompress(data) {
    try {
      // Check if data is base64 encoded
      if (typeof data === 'string' && data.match(/^[A-Za-z0-9+/]*={0,2}$/)) {
        const buffer = Buffer.from(data, 'base64');
        
        // Try to decode as CBOR
        try {
          const cborData = cbor.decode(buffer);
          // If successful, it's likely a compressed payload
          return await this.decompressWithFallback(buffer);
        } catch {
          // Not CBOR, try JSON
          return JSON.parse(data);
        }
      } else {
        // Try JSON parsing
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error('[PayloadCompressor] Auto decompression failed:', error);
      throw new Error('Failed to auto decompress payload');
    }
  }

  /**
   * Get compression statistics
   */
  getCompressionStats(originalSize, compressedSize) {
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

module.exports = new PayloadCompressor(); 