import { ethers } from 'ethers';
import { logger } from '../Logger';
import { MultiChainWalletManager } from '../../wallet/MultiChainWalletManager';

/**
 * QR Code Digital Signature System
 * 
 * Implements ECDSA signatures for QR code payloads to prevent tampering
 * and unauthorized transactions. Provides:
 * - Digital signatures for QR payment requests
 * - Signature verification for received QR codes
 * - Payload integrity validation
 * - Timestamp validation to prevent replay attacks
 */
export class QRCodeSigner {
  private static readonly SIGNATURE_VERSION = 'v1';
  private static readonly MAX_PAYLOAD_AGE = 5 * 60 * 1000; // 5 minutes
  private static readonly SIGNATURE_PREFIX = 'AIRCHAINPAY_SIGNATURE';

  /**
   * Sign a QR code payload with ECDSA
   * @param payload - The QR code payload to sign
   * @param chainId - The blockchain network ID
   * @returns Signed payload with signature and metadata
   */
  static async signQRPayload(payload: any, chainId: string): Promise<SignedQRPayload> {
    try {
      const walletManager = MultiChainWalletManager.getInstance();
      const walletInfo = await walletManager.getWalletInfo(chainId);
      
      if (!walletInfo) {
        throw new Error('No wallet found for chain');
      }

      // Create a standardized payload for signing
      const payloadToSign = this.createSignablePayload(payload);
      
      // Create the message to sign
      const message = this.createSignMessage(payloadToSign);
      
      // Sign the message using the wallet's private key
      const signature = await walletManager.signMessage(message);
      
      // Create the signed payload
      const signedPayload: SignedQRPayload = {
        ...payload,
        signature: {
          version: this.SIGNATURE_VERSION,
          signer: walletInfo.address,
          signature: signature,
          timestamp: Date.now(),
          chainId: chainId,
          messageHash: ethers.keccak256(ethers.toUtf8Bytes(message))
        },
        metadata: {
          signedAt: Date.now(),
          version: this.SIGNATURE_VERSION,
          integrity: 'verified'
        }
      };

      logger.info('[QRCodeSigner] QR payload signed successfully', {
        signer: walletInfo.address,
        chainId: chainId,
        payloadSize: JSON.stringify(signedPayload).length
      });

      return signedPayload;
    } catch (error) {
      logger.error('[QRCodeSigner] Failed to sign QR payload:', error);
      throw new Error(`Failed to sign QR payload: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Verify a signed QR code payload
   * @param signedPayload - The signed payload to verify
   * @returns Verification result with details
   */
  static async verifyQRPayload(signedPayload: SignedQRPayload): Promise<VerificationResult> {
    try {
      // Check if payload has signature
      if (!signedPayload.signature) {
        return {
          isValid: false,
          error: 'No signature found in payload',
          details: {
            hasSignature: false,
            hasValidTimestamp: false,
            hasValidFormat: false
          }
        };
      }

      const { signature, chainId } = signedPayload.signature;

      // Step 1: Verify timestamp to prevent replay attacks
      const timestampValidation = this.validateTimestamp(signedPayload.signature.timestamp);
      if (!timestampValidation.isValid) {
        return {
          isValid: false,
          error: 'Payload timestamp validation failed',
          details: {
            hasSignature: true,
            hasValidTimestamp: false,
            hasValidFormat: true,
            timestampError: timestampValidation.error
          }
        };
      }

      // Step 2: Verify signature format
      const formatValidation = this.validateSignatureFormat(signedPayload.signature);
      if (!formatValidation.isValid) {
        return {
          isValid: false,
          error: 'Invalid signature format',
          details: {
            hasSignature: true,
            hasValidTimestamp: true,
            hasValidFormat: false,
            formatError: formatValidation.error
          }
        };
      }

      // Step 3: Recreate the original payload for verification
      const originalPayload = this.extractOriginalPayload(signedPayload);
      const payloadToSign = this.createSignablePayload(originalPayload);
      const message = this.createSignMessage(payloadToSign);

      // Step 4: Verify the ECDSA signature
      const signatureValid = await this.verifyECDSASignature(
        message,
        signature,
        signedPayload.signature.signer
      );

      if (!signatureValid) {
        return {
          isValid: false,
          error: 'Invalid ECDSA signature',
          details: {
            hasSignature: true,
            hasValidTimestamp: true,
            hasValidFormat: true,
            signatureValid: false
          }
        };
      }

      // Step 5: Verify message hash
      const expectedHash = ethers.keccak256(ethers.toUtf8Bytes(message));
      const hashValid = signedPayload.signature.messageHash === expectedHash;

      if (!hashValid) {
        return {
          isValid: false,
          error: 'Message hash verification failed',
          details: {
            hasSignature: true,
            hasValidTimestamp: true,
            hasValidFormat: true,
            signatureValid: true,
            hashValid: false
          }
        };
      }

      logger.info('[QRCodeSigner] QR payload verification successful', {
        signer: signedPayload.signature.signer,
        chainId: chainId,
        timestamp: signedPayload.signature.timestamp
      });

      return {
        isValid: true,
        signer: signedPayload.signature.signer,
        chainId: chainId,
        timestamp: signedPayload.signature.timestamp,
        details: {
          hasSignature: true,
          hasValidTimestamp: true,
          hasValidFormat: true,
          signatureValid: true,
          hashValid: true
        }
      };

    } catch (error) {
      logger.error('[QRCodeSigner] Failed to verify QR payload:', error);
      return {
        isValid: false,
        error: `Verification failed: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          hasSignature: false,
          hasValidTimestamp: false,
          hasValidFormat: false
        }
      };
    }
  }

  /**
   * Create a standardized payload for signing
   * @param payload - Original payload
   * @returns Standardized payload for signing
   */
  private static createSignablePayload(payload: any): any {
    // Create a clean payload with only essential fields
    const signablePayload = {
      type: payload.type || 'payment_request',
      to: payload.to,
      amount: payload.amount,
      chainId: payload.chainId,
      token: payload.token ? {
        symbol: payload.token.symbol,
        address: payload.token.address,
        decimals: payload.token.decimals,
        isNative: payload.token.isNative
      } : null,
      paymentReference: payload.paymentReference || null,
      merchant: payload.merchant || null,
      location: payload.location || null,
      maxAmount: payload.maxAmount || null,
      minAmount: payload.minAmount || null,
      expiry: payload.expiry || null,
      timestamp: payload.timestamp || Date.now(),
      version: payload.version || '1.0'
    };

    return signablePayload;
  }

  /**
   * Create the message to sign
   * @param payload - The payload to create message from
   * @returns Message string to sign
   */
  private static createSignMessage(payload: any): string {
    // Create a deterministic JSON string (sorted keys)
    const sortedPayload = this.sortObjectKeys(payload);
    const jsonString = JSON.stringify(sortedPayload);
    
    // Create the message with prefix
    const message = `${this.SIGNATURE_PREFIX}\n${jsonString}`;
    
    return message;
  }

  /**
   * Sort object keys for deterministic JSON serialization
   * @param obj - Object to sort
   * @returns Object with sorted keys
   */
  private static sortObjectKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item));
    }

    const sorted: any = {};
    Object.keys(obj).sort().forEach(key => {
      sorted[key] = this.sortObjectKeys(obj[key]);
    });

    return sorted;
  }

  /**
   * Validate timestamp to prevent replay attacks
   * @param timestamp - Timestamp to validate
   * @returns Validation result
   */
  private static validateTimestamp(timestamp: number): { isValid: boolean; error?: string } {
    const now = Date.now();
    const age = now - timestamp;

    if (age < 0) {
      return { isValid: false, error: 'Future timestamp detected' };
    }

    if (age > this.MAX_PAYLOAD_AGE) {
      return { isValid: false, error: `Payload too old (${Math.floor(age / 1000)}s)` };
    }

    return { isValid: true };
  }

  /**
   * Validate signature format
   * @param signature - Signature object to validate
   * @returns Validation result
   */
  private static validateSignatureFormat(signature: any): { isValid: boolean; error?: string } {
    if (!signature.version || !signature.signer || !signature.signature || 
        !signature.timestamp || !signature.chainId || !signature.messageHash) {
      return { isValid: false, error: 'Missing required signature fields' };
    }

    if (signature.version !== this.SIGNATURE_VERSION) {
      return { isValid: false, error: `Unsupported signature version: ${signature.version}` };
    }

    if (!ethers.isAddress(signature.signer)) {
      return { isValid: false, error: 'Invalid signer address' };
    }

    if (typeof signature.signature !== 'string' || signature.signature.length < 130) {
      return { isValid: false, error: 'Invalid signature format' };
    }

    return { isValid: true };
  }

  /**
   * Extract original payload from signed payload
   * @param signedPayload - Signed payload
   * @returns Original payload without signature
   */
  private static extractOriginalPayload(signedPayload: SignedQRPayload): any {
    const { signature, metadata, ...originalPayload } = signedPayload;
    return originalPayload;
  }

  /**
   * Verify ECDSA signature
   * @param message - Original message
   * @param signature - ECDSA signature
   * @param expectedSigner - Expected signer address
   * @returns True if signature is valid
   */
  private static async verifyECDSASignature(
    message: string, 
    signature: string, 
    expectedSigner: string
  ): Promise<boolean> {
    try {
      // Recover the signer address from the signature
      const messageHash = ethers.keccak256(ethers.toUtf8Bytes(message));
      const recoveredAddress = ethers.verifyMessage(message, signature);
      
      // Check if recovered address matches expected signer
      const isValid = recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
      
      logger.info('[QRCodeSigner] ECDSA signature verification', {
        expectedSigner: expectedSigner.toLowerCase(),
        recoveredAddress: recoveredAddress.toLowerCase(),
        isValid
      });

      return isValid;
    } catch (error) {
      logger.error('[QRCodeSigner] ECDSA signature verification failed:', error);
      return false;
    }
  }

  /**
   * Check if a payload is signed
   * @param payload - Payload to check
   * @returns True if payload has valid signature structure
   */
  static isSignedPayload(payload: any): boolean {
    return payload && 
           payload.signature && 
           payload.signature.version && 
           payload.signature.signer && 
           payload.signature.signature;
  }

  /**
   * Get signature metadata for debugging
   * @param signedPayload - Signed payload
   * @returns Signature metadata
   */
  static getSignatureMetadata(signedPayload: SignedQRPayload): {
    version: string;
    signer: string;
    timestamp: number;
    chainId: string;
    age: number;
    isValid: boolean;
  } {
    if (!this.isSignedPayload(signedPayload)) {
      return {
        version: 'none',
        signer: '',
        timestamp: 0,
        chainId: '',
        age: 0,
        isValid: false
      };
    }

    const now = Date.now();
    const age = now - signedPayload.signature.timestamp;

    return {
      version: signedPayload.signature.version,
      signer: signedPayload.signature.signer,
      timestamp: signedPayload.signature.timestamp,
      chainId: signedPayload.signature.chainId,
      age: age,
      isValid: age >= 0 && age <= this.MAX_PAYLOAD_AGE
    };
  }
}

/**
 * Signed QR Payload Interface
 */
export interface SignedQRPayload {
  // Original payload fields
  type: string;
  to: string;
  amount: string;
  chainId: string;
  token?: any;
  paymentReference?: string;
  merchant?: string;
  location?: string;
  maxAmount?: string;
  minAmount?: string;
  expiry?: number;
  timestamp: number;
  version: string;
  
  // Signature fields
  signature: {
    version: string;
    signer: string;
    signature: string;
    timestamp: number;
    chainId: string;
    messageHash: string;
  };
  
  // Metadata
  metadata: {
    signedAt: number;
    version: string;
    integrity: string;
  };
}

/**
 * Verification Result Interface
 */
export interface VerificationResult {
  isValid: boolean;
  error?: string;
  signer?: string;
  chainId?: string;
  timestamp?: number;
  details: {
    hasSignature: boolean;
    hasValidTimestamp: boolean;
    hasValidFormat: boolean;
    signatureValid?: boolean;
    hashValid?: boolean;
    timestampError?: string;
    formatError?: string;
  };
} 