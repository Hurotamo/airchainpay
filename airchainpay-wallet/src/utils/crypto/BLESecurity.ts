import * as CryptoJS from 'crypto-js';
import { logger } from '../Logger';
import { ethers } from 'ethers';

// BLE Security Configuration
const BLE_SECURITY_CONFIG = {
  KEY_SIZE: 256,
  HMAC_SIZE: 256,
  SESSION_TIMEOUT: 300000, // 5 minutes
  KEY_EXCHANGE_TIMEOUT: 30000, // 30 seconds
  MAX_RETRIES: 3,
  VERSION: '1.0'
} as const;

// Session state interface
interface BLESession {
  sessionId: string;
  deviceId: string;
  sharedKey: string;
  hmacKey: string;
  createdAt: number;
  lastActivity: number;
  isAuthenticated: boolean;
  encryptionNonce: number;
}

// Key exchange message types
type KeyExchangeMessage = {
  type: 'key_exchange_init' | 'key_exchange_response' | 'key_exchange_confirm';
  sessionId: string;
  publicKey: string;
  nonce: string;
  signature?: string;
  timestamp: number;
};

// Encrypted payment message
interface EncryptedPaymentMessage {
  type: 'encrypted_payment';
  sessionId: string;
  encryptedData: string;
  hmac: string;
  nonce: string;
  timestamp: number;
  version: string;
}

// Payment data structure
interface PaymentData {
  to: string;
  amount: string;
  chainId: string;
  paymentReference?: string;
  token?: any;
  metadata?: any;
  timestamp: number;
}

export class BLESecurity {
  private static instance: BLESecurity;
  private sessions: Map<string, BLESession> = new Map();
  private deviceKeyPair: { privateKey: string; publicKey: string } | null = null;
  private pendingKeyExchanges: Map<string, { deviceId: string; timestamp: number }> = new Map();

  private constructor() {
    this.initializeDeviceKeys();
  }

  static getInstance(): BLESecurity {
    if (!BLESecurity.instance) {
      BLESecurity.instance = new BLESecurity();
    }
    return BLESecurity.instance;
  }

  /**
   * Initialize device key pair for key exchange
   */
  private async initializeDeviceKeys(): Promise<void> {
    try {
      // Generate a new key pair for this device
      const wallet = ethers.Wallet.createRandom();
      this.deviceKeyPair = {
        privateKey: wallet.privateKey,
        publicKey: wallet.publicKey
      };
      logger.info('[BLESecurity] Device key pair initialized');
    } catch (error) {
      logger.error('[BLESecurity] Failed to initialize device keys:', error);
      throw error;
    }
  }

  /**
   * Generate a new session ID
   */
  private generateSessionId(): string {
    return ethers.id(Math.random().toString() + Date.now().toString());
  }

  /**
   * Generate a random nonce for encryption
   */
  private generateNonce(): string {
    return ethers.id(Math.random().toString() + Date.now().toString()).slice(2, 34);
  }

  /**
   * Create a new secure session with a device
   */
  async createSession(deviceId: string): Promise<string> {
    try {
      const sessionId = this.generateSessionId();
      const nonce = this.generateNonce();

      const session: BLESession = {
        sessionId,
        deviceId,
        sharedKey: '', // Will be set after key exchange
        hmacKey: '', // Will be set after key exchange
        createdAt: Date.now(),
        lastActivity: Date.now(),
        isAuthenticated: false,
        encryptionNonce: 0
      };

      this.sessions.set(sessionId, session);
      logger.info(`[BLESecurity] Created session ${sessionId} for device ${deviceId}`);
      
      return sessionId;
    } catch (error) {
      logger.error('[BLESecurity] Failed to create session:', error);
      throw error;
    }
  }

  /**
   * Initiate key exchange with another device
   */
  async initiateKeyExchange(deviceId: string): Promise<KeyExchangeMessage> {
    try {
      if (!this.deviceKeyPair) {
        throw new Error('Device keys not initialized');
      }

      const sessionId = await this.createSession(deviceId);
      const nonce = this.generateNonce();
      const timestamp = Date.now();

      // Create signature for authentication
      const messageToSign = `${sessionId}${this.deviceKeyPair.publicKey}${nonce}${timestamp}`;
      const signature = await this.signMessage(messageToSign);

      const keyExchangeMessage: KeyExchangeMessage = {
        type: 'key_exchange_init',
        sessionId,
        publicKey: this.deviceKeyPair.publicKey,
        nonce,
        signature,
        timestamp
      };

      // Store pending key exchange
      this.pendingKeyExchanges.set(sessionId, {
        deviceId,
        timestamp
      });

      logger.info(`[BLESecurity] Initiated key exchange for session ${sessionId}`);
      return keyExchangeMessage;
    } catch (error) {
      logger.error('[BLESecurity] Failed to initiate key exchange:', error);
      throw error;
    }
  }

  /**
   * Process key exchange response from another device
   */
  async processKeyExchangeResponse(message: KeyExchangeMessage): Promise<KeyExchangeMessage> {
    try {
      const { sessionId, publicKey, nonce, signature, timestamp } = message;
      
      if (!signature || !publicKey) {
        throw new Error('Missing signature or publicKey in key exchange response');
      }
      // Verify signature
      const messageToVerify = `${sessionId}${publicKey}${nonce}${timestamp}`;
      const isValidSignature = await this.verifySignature(messageToVerify, signature, publicKey);
      
      if (!isValidSignature) {
        throw new Error('Invalid signature in key exchange response');
      }

      // Generate shared key using ECDH
      const sharedSecret = await this.generateSharedSecret(publicKey);
      const sharedKey = CryptoJS.SHA256(sharedSecret).toString();
      const hmacKey = CryptoJS.SHA256(sharedKey + 'hmac').toString();

      // Update session
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      session.sharedKey = sharedKey;
      session.hmacKey = hmacKey;
      session.isAuthenticated = true;
      session.lastActivity = Date.now();

      // Create confirmation message
      const confirmNonce = this.generateNonce();
      const confirmMessage = `${sessionId}${confirmNonce}${timestamp}`;
      const confirmSignature = await this.signMessage(confirmMessage);

      const confirmMessageObj: KeyExchangeMessage = {
        type: 'key_exchange_confirm',
        sessionId,
        publicKey: this.deviceKeyPair!.publicKey,
        nonce: confirmNonce,
        signature: confirmSignature,
        timestamp
      };

      logger.info(`[BLESecurity] Key exchange completed for session ${sessionId}`);
      return confirmMessageObj;
    } catch (error) {
      logger.error('[BLESecurity] Failed to process key exchange response:', error);
      throw error;
    }
  }

  /**
   * Process key exchange confirmation
   */
  async processKeyExchangeConfirm(message: KeyExchangeMessage): Promise<void> {
    try {
      const { sessionId, signature, timestamp } = message;
      
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      if (!signature || !message.publicKey) {
        throw new Error('Missing signature or publicKey in key exchange confirmation');
      }
      // Verify confirmation signature
      const messageToVerify = `${sessionId}${message.nonce}${timestamp}`;
      const isValidSignature = await this.verifySignature(messageToVerify, signature, message.publicKey);
      
      if (!isValidSignature) {
        throw new Error('Invalid confirmation signature');
      }

      session.isAuthenticated = true;
      session.lastActivity = Date.now();
      
      // Clean up pending key exchange
      this.pendingKeyExchanges.delete(sessionId);
      
      logger.info(`[BLESecurity] Key exchange confirmed for session ${sessionId}`);
    } catch (error) {
      logger.error('[BLESecurity] Failed to process key exchange confirmation:', error);
      throw error;
    }
  }

  /**
   * Encrypt payment data for secure transmission
   */
  async encryptPaymentData(sessionId: string, paymentData: PaymentData): Promise<EncryptedPaymentMessage> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session || !session.isAuthenticated) {
        throw new Error('Invalid or unauthenticated session');
      }

      // Update session activity
      session.lastActivity = Date.now();
      session.encryptionNonce++;

      // Create data to encrypt
      const dataToEncrypt = JSON.stringify(paymentData);
      
      // Generate encryption key from shared key and nonce
      const encryptionKey = CryptoJS.SHA256(session.sharedKey + session.encryptionNonce).toString();
      
      // Encrypt the data
      const encrypted = CryptoJS.AES.encrypt(dataToEncrypt, encryptionKey, {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });

      // Generate HMAC for data integrity
      const hmac = CryptoJS.HmacSHA256(encrypted.toString(), session.hmacKey).toString();

      const encryptedMessage: EncryptedPaymentMessage = {
        type: 'encrypted_payment',
        sessionId,
        encryptedData: encrypted.toString(),
        hmac,
        nonce: session.encryptionNonce.toString(),
        timestamp: Date.now(),
        version: BLE_SECURITY_CONFIG.VERSION
      };

      logger.info(`[BLESecurity] Encrypted payment data for session ${sessionId}`);
      return encryptedMessage;
    } catch (error) {
      logger.error('[BLESecurity] Failed to encrypt payment data:', error);
      throw error;
    }
  }

  /**
   * Decrypt payment data from secure transmission
   */
  async decryptPaymentData(encryptedMessage: EncryptedPaymentMessage): Promise<PaymentData> {
    try {
      const { sessionId, encryptedData, hmac, nonce, timestamp } = encryptedMessage;
      
      const session = this.sessions.get(sessionId);
      if (!session || !session.isAuthenticated) {
        throw new Error('Invalid or unauthenticated session');
      }

      // Verify HMAC for data integrity
      const expectedHmac = CryptoJS.HmacSHA256(encryptedData, session.hmacKey).toString();
      if (hmac !== expectedHmac) {
        throw new Error('HMAC verification failed - data integrity compromised');
      }

      // Update session activity
      session.lastActivity = Date.now();

      // Generate decryption key
      const decryptionKey = CryptoJS.SHA256(session.sharedKey + nonce).toString();
      
      // Decrypt the data
      const decrypted = CryptoJS.AES.decrypt(encryptedData, decryptionKey, {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });

      const decryptedData = decrypted.toString(CryptoJS.enc.Utf8);
      if (!decryptedData) {
        throw new Error('Failed to decrypt payment data');
      }

      const paymentData: PaymentData = JSON.parse(decryptedData);
      
      logger.info(`[BLESecurity] Decrypted payment data for session ${sessionId}`);
      return paymentData;
    } catch (error) {
      logger.error('[BLESecurity] Failed to decrypt payment data:', error);
      throw error;
    }
  }

  /**
   * Generate shared secret using ECDH
   */
  private async generateSharedSecret(publicKey: string): Promise<string> {
    try {
      // Use ethers.Wallet.signingKey.computeSharedSecret for ECDH
      const myWallet = new ethers.Wallet(this.deviceKeyPair!.privateKey);
      const sharedSecret = myWallet.signingKey.computeSharedSecret(publicKey);
      return sharedSecret;
    } catch (error) {
      logger.error('[BLESecurity] Failed to generate shared secret:', error);
      throw error;
    }
  }

  /**
   * Sign a message with device private key
   */
  private async signMessage(message: string): Promise<string> {
    try {
      const wallet = new ethers.Wallet(this.deviceKeyPair!.privateKey);
      const signature = await wallet.signMessage(message);
      return signature;
    } catch (error) {
      logger.error('[BLESecurity] Failed to sign message:', error);
      throw error;
    }
  }

  /**
   * Verify a signature
   */
  private async verifySignature(message: string, signature: string, publicKey: string): Promise<boolean> {
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      const expectedAddress = new ethers.Wallet(publicKey).address;
      return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
    } catch (error) {
      logger.error('[BLESecurity] Failed to verify signature:', error);
      return false;
    }
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): BLESession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Check if session is valid and authenticated
   */
  isSessionValid(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    
    // Check if session has expired
    const now = Date.now();
    if (now - session.lastActivity > BLE_SECURITY_CONFIG.SESSION_TIMEOUT) {
      this.sessions.delete(sessionId);
      return false;
    }
    
    return session.isAuthenticated;
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > BLE_SECURITY_CONFIG.SESSION_TIMEOUT) {
        this.sessions.delete(sessionId);
        logger.info(`[BLESecurity] Cleaned up expired session ${sessionId}`);
      }
    }
  }

  /**
   * Remove a session
   */
  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    logger.info(`[BLESecurity] Removed session ${sessionId}`);
  }

  /**
   * Get device public key
   */
  getDevicePublicKey(): string | null {
    return this.deviceKeyPair?.publicKey || null;
  }
} 