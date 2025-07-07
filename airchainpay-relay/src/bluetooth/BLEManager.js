const noble = require('@abandonware/noble');
const bleno = require('@abandonware/bleno');
const logger = require('../utils/logger');
const crypto = require('crypto');
const EventEmitter = require('events');

// Constants
const AIRCHAINPAY_SERVICE_UUID = '0000abcd-0000-1000-8000-00805f9b34fb';
const AIRCHAINPAY_CHARACTERISTIC_UUID = '0000dcba-0000-1000-8000-00805f9b34fb';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const SCAN_TIMEOUT = 30000;
const CONNECTION_TIMEOUT = 15000;

// Authentication constants
const AUTH_CHALLENGE_LENGTH = 32;
const AUTH_RESPONSE_TIMEOUT = 30000; // 30 seconds
const MAX_AUTH_ATTEMPTS = 3;
const AUTH_BLOCK_DURATION = 300000; // 5 minutes

// Key exchange constants
const DH_KEY_SIZE = 2048;
const SESSION_KEY_LENGTH = 32;
const KEY_EXCHANGE_TIMEOUT = 60000; // 60 seconds
const MAX_KEY_EXCHANGE_ATTEMPTS = 3;

const ConnectionStatus = {
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  FAILED: 'FAILED',
};

const AuthStatus = {
  PENDING: 'PENDING',
  AUTHENTICATED: 'AUTHENTICATED',
  FAILED: 'FAILED',
  BLOCKED: 'BLOCKED',
};

const KeyExchangeStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
};

class BLEManager extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      scanTimeout: SCAN_TIMEOUT,
      connectionTimeout: CONNECTION_TIMEOUT,
      serviceUUID: AIRCHAINPAY_SERVICE_UUID,
      characteristicUUID: AIRCHAINPAY_CHARACTERISTIC_UUID,
      maxConnections: 10, // Global BLE connection cap
      maxTxPerMinute: 10, // Per-device transaction rate limit
      maxConnectsPerMinute: 5, // Per-device connection rate limit
      ...config,
    };
    
    this.initialized = false;
    this.connectedDevices = new Map();
    this.encryptionKeys = new Map();
    this.transactionQueue = new Map();
    this.isAdvertising = false;
    this.notifyCallback = null;
    
    // DoS protection state
    this.connectionTimestamps = new Map(); // deviceId -> [timestamps]
    this.txTimestamps = new Map(); // deviceId -> [timestamps]
    this.tempBlacklist = new Map(); // deviceId -> { until, reason }
    
    // Authentication properties
    this.authenticatedDevices = new Map();
    this.authChallenges = new Map();
    this.authAttempts = new Map();
    this.blockedDevices = new Map();
    this.devicePublicKeys = new Map();
    this.relayPrivateKey = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    
    // Key exchange properties
    this.keyExchangeState = new Map(); // deviceId -> { status, dhKey, sessionKey, timestamp }
    this.keyExchangeAttempts = new Map(); // deviceId -> attempts count
    this.sessionKeys = new Map(); // deviceId -> sessionKey
    this.keyExchangeBlocked = new Map(); // deviceId -> { until, reason }
    
    // Initialize noble event handlers
    if (noble && noble.on) {
      noble.on('stateChange', this.handleStateChange.bind(this));
      noble.on('discover', this.handleDiscover.bind(this));
    }
  }

  /**
   * Check if BLE manager is initialized
   */
  isInitialized() {
    return this.initialized;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Wait for noble to be ready
      await new Promise((resolve, reject) => {
        const state = noble.state;
        if (state === 'poweredOn') {
          resolve();
        } else {
          noble.once('stateChange', (state) => {
            if (state === 'poweredOn') {
              resolve();
            } else {
              reject(new Error(`Bluetooth adapter state: ${state}`));
            }
          });
        }
      });

      this.initialized = true;
      logger.info('[BLE] Manager initialized successfully');
    } catch (error) {
      logger.error('[BLE] Failed to initialize:', error);
      // Don't throw error, just log it
      logger.warn('[BLE] BLE functionality will be disabled');
    }
  }

  handleStateChange(state) {
    logger.info('[BLE] Adapter state changed:', state);
    if (state === 'poweredOn') {
      this.emit('ready');
    } else {
      this.stopScanning();
      this.stopAdvertising();
    }
  }

  handleDiscover(peripheral) {
    const deviceInfo = {
      id: peripheral.id,
      name: peripheral.advertisement.localName,
      rssi: peripheral.rssi,
      manufacturerData: peripheral.advertisement.manufacturerData,
    };

    // Check if it's an AirChainPay device
    if (deviceInfo.name && deviceInfo.name.includes('AirChainPay')) {
      logger.info('[BLE] Discovered AirChainPay device:', deviceInfo);
      this.emit('deviceDiscovered', deviceInfo);
    }
  }

  async startScanning() {
    if (!this.initialized) {
      logger.warn('[BLE] Cannot start scanning - not initialized');
      return;
    }

    try {
      await noble.startScanningAsync([this.config.serviceUUID], false);
      logger.info('[BLE] Started scanning for devices');
    } catch (error) {
      logger.error('[BLE] Failed to start scanning:', error);
    }
  }

  stopScanning() {
    if (noble && noble.stopScanning) {
      noble.stopScanning();
      logger.info('[BLE] Stopped scanning');
    }
  }

  async connectToDevice(deviceId) {
    // DoS: Check global connection cap
    if (this.isConnectionCapReached()) {
      logger.warn(`[BLE][DoS] Connection cap reached, rejecting device: ${deviceId}`);
      throw new Error('BLE connection cap reached');
    }
    // DoS: Check temporary blacklist
    if (this.isTemporarilyBlacklisted(deviceId)) {
      logger.warn(`[BLE][DoS] Device ${deviceId} is temporarily blacklisted`);
      throw new Error('Device temporarily blacklisted due to DoS protection');
    }
    // DoS: Check connection rate limit
    if (!this.checkConnectionRateLimit(deviceId)) {
      throw new Error('Too many BLE connection attempts');
    }

    const peripheral = noble.peripherals[deviceId];
    if (!peripheral) {
      throw new Error(`Device ${deviceId} not found`);
    }

    try {
      await peripheral.connectAsync();
      const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
        [this.config.serviceUUID],
        [this.config.characteristicUUID],
      );

      this.connectedDevices.set(deviceId, {
        peripheral,
        characteristics: characteristics[0],
      });

      // Setup data handling
      characteristics[0].on('data', (data) => this.handleData(deviceId, data));
      await characteristics[0].subscribeAsync();

      logger.info('[BLE] Connected to device:', deviceId);
      this.emit('deviceConnected', deviceId);
    } catch (error) {
      logger.error('[BLE] Connection failed:', error);
      throw error;
    }
  }

  async sendData(deviceId, data) {
    const device = this.connectedDevices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not connected`);
    }

    try {
      // Encrypt data before sending
      const encryptedData = this.encryptData(deviceId, data);
      await device.characteristics.writeAsync(encryptedData, true);
      logger.info('[BLE] Data sent to device:', deviceId);
    } catch (error) {
      logger.error('[BLE] Failed to send data:', error);
      throw error;
    }
  }

  handleData(deviceId, data) {
    try {
      // Decrypt received data
      const decryptedData = this.decryptData(deviceId, data);
      const parsedData = JSON.parse(decryptedData);

      // Handle different message types
      switch (parsedData.type) {
      case 'auth_response':
        this.handleAuthResponse(deviceId, parsedData.response);
        break;
      case 'key_exchange_response':
        this.handleKeyExchangeResponse(deviceId, parsedData);
        break;
      case 'key_rotation_response':
        this.handleKeyExchangeResponse(deviceId, parsedData);
        break;
      case 'transaction':
        this.processTransaction(deviceId, parsedData);
        break;
      case 'auth_init':
        this.handleAuthInit(deviceId, parsedData);
        break;
      default:
        logger.warn(`[BLE] Unknown message type from device ${deviceId}:`, parsedData.type);
      }
    } catch (error) {
      logger.error('[BLE] Error processing received data:', error);
    }
  }

  /**
   * Handle authentication initialization from device
   */
  async handleAuthInit(deviceId, authData) {
    try {
      const { devicePublicKey } = authData;
      
      if (!devicePublicKey) {
        throw new Error('Missing device public key');
      }

      // Start authentication process
      await this.authenticateDevice(deviceId, devicePublicKey);
      
    } catch (error) {
      logger.error(`[BLE] Auth init failed for device ${deviceId}:`, error.message);
      
      // Send auth failure response
      await this.sendData(deviceId, {
        type: 'auth_failed',
        error: error.message,
      });
    }
  }

  async processTransaction(deviceId, txData) {
    // DoS: Check temporary blacklist
    if (this.isTemporarilyBlacklisted(deviceId)) {
      logger.warn(`[BLE][DoS] Device ${deviceId} is temporarily blacklisted (tx)`);
      await this.sendData(deviceId, {
        type: 'device_blacklisted',
        error: 'Device temporarily blacklisted due to DoS protection',
      });
      return;
    }
    // DoS: Check transaction rate limit
    if (!this.checkTransactionRateLimit(deviceId)) {
      await this.sendData(deviceId, {
        type: 'device_blacklisted',
        error: 'Too many BLE transactions, temporarily blacklisted',
      });
      return;
    }

    try {
      // Check if device is authenticated
      if (!this.isDeviceAuthenticated(deviceId)) {
        logger.warn(`[BLE] Unauthenticated device attempted transaction: ${deviceId}`);
        
        // Send authentication required response
        await this.sendData(deviceId, {
          type: 'auth_required',
          error: 'Device must be authenticated before processing transactions',
        });
        
        return;
      }

      // Check if device is blocked
      if (this.isDeviceBlocked(deviceId)) {
        logger.warn(`[BLE] Blocked device attempted transaction: ${deviceId}`);
        
        await this.sendData(deviceId, {
          type: 'device_blocked',
          error: 'Device is blocked due to authentication failures',
        });
        
        return;
      }

      // Validate transaction format and data
      const { validateTransaction } = require('../utils/blockchain');
      const validationResult = await validateTransaction(txData);
      if (!validationResult.isValid) {
        throw new Error(`Invalid transaction: ${validationResult.error}`);
      }

      // Add to transaction queue
      if (!this.transactionQueue.has(deviceId)) {
        this.transactionQueue.set(deviceId, []);
      }
      this.transactionQueue.get(deviceId).push(txData);

      // Emit transaction received event
      this.emit('transactionReceived', deviceId, txData);

      // Send acknowledgment back to device
      await this.sendData(deviceId, {
        type: 'ack',
        txId: txData.id,
        status: 'received',
      });

      logger.info('[BLE] Transaction processed successfully:', txData.id);
    } catch (error) {
      logger.error('[BLE] Failed to process transaction:', error);
      
      // Send error response to device
      await this.sendData(deviceId, {
        type: 'error',
        txId: txData.id,
        error: error.message,
      });
    }
  }

  async sendTransactionStatus(deviceId, status) {
    try {
      await this.sendData(deviceId, {
        type: 'status',
        ...status,
      });
      logger.info('[BLE] Transaction status sent to device:', deviceId);
    } catch (error) {
      logger.error('[BLE] Failed to send transaction status:', error);
    }
  }

  encryptData(deviceId, data) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = this.getEncryptionKey(deviceId);
    
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, encrypted]);
  }

  decryptData(deviceId, data) {
    const iv = data.slice(0, IV_LENGTH);
    const authTag = data.slice(IV_LENGTH, IV_LENGTH + 16);
    const encrypted = data.slice(IV_LENGTH + 16);
    const key = this.getEncryptionKey(deviceId);
    
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString();
  }

  /**
   * Generate Diffie-Hellman key pair for secure key exchange
   */
  generateDHKeyPair() {
    return crypto.generateKeyPairSync('dh', {
      primeLength: DH_KEY_SIZE,
      generator: 2,
    });
  }

  /**
   * Derive session key using Diffie-Hellman shared secret
   */
  deriveSessionKey(sharedSecret, deviceId, nonce) {
    const salt = Buffer.concat([
      Buffer.from(deviceId, 'utf8'),
      nonce,
    ]);
    
    return crypto.pbkdf2Sync(
      sharedSecret,
      salt,
      100000, // iterations
      SESSION_KEY_LENGTH,
      'sha256',
    );
  }

  /**
   * Initiate secure key exchange with device
   */
  async initiateKeyExchange(deviceId) {
    // Check if device is blocked from key exchange
    if (this.isKeyExchangeBlocked(deviceId)) {
      throw new Error('Device is blocked from key exchange');
    }

    // Check key exchange attempts
    const attempts = this.keyExchangeAttempts.get(deviceId) || 0;
    if (attempts >= MAX_KEY_EXCHANGE_ATTEMPTS) {
      this.keyExchangeBlocked.set(deviceId, {
        until: Date.now() + AUTH_BLOCK_DURATION,
        reason: 'Max key exchange attempts exceeded',
      });
      throw new Error('Too many key exchange attempts');
    }

    try {
      // Generate new DH key pair
      const dhKeyPair = this.generateDHKeyPair();
      const nonce = crypto.randomBytes(16);
      
      // Store key exchange state
      this.keyExchangeState.set(deviceId, {
        status: KeyExchangeStatus.PENDING,
        dhKey: dhKeyPair,
        nonce: nonce,
        timestamp: Date.now(),
      });

      // Send key exchange initiation
      await this.sendData(deviceId, {
        type: 'key_exchange_init',
        dhPublicKey: dhKeyPair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
        nonce: nonce.toString('base64'),
        relayPublicKey: this.relayPrivateKey.publicKey,
      });

      logger.info(`[BLE] Initiated key exchange with device: ${deviceId}`);
      return true;
    } catch (error) {
      // Increment failed attempts
      this.keyExchangeAttempts.set(deviceId, attempts + 1);
      logger.error(`[BLE] Key exchange initiation failed for device ${deviceId}:`, error.message);
      throw error;
    }
  }

  /**
   * Handle key exchange response from device
   */
  async handleKeyExchangeResponse(deviceId, response) {
    try {
      const keyState = this.keyExchangeState.get(deviceId);
      if (!keyState || keyState.status !== KeyExchangeStatus.PENDING) {
        throw new Error('No pending key exchange for device');
      }

      // Check timeout
      if (Date.now() - keyState.timestamp > KEY_EXCHANGE_TIMEOUT) {
        this.keyExchangeState.delete(deviceId);
        throw new Error('Key exchange timeout');
      }

      // Verify device signature
      const devicePublicKey = this.devicePublicKeys.get(deviceId);
      if (!devicePublicKey) {
        throw new Error('No public key found for device');
      }

      const verify = crypto.createVerify('SHA256');
      verify.update(keyState.dhKey.publicKey.export({ type: 'spki', format: 'der' }));
      verify.update(keyState.nonce);
      const isValid = verify.verify(devicePublicKey, Buffer.from(response.signature, 'base64'));
      
      if (!isValid) {
        throw new Error('Invalid key exchange signature');
      }

      // Compute shared secret
      const deviceDHPublicKey = crypto.createPublicKey({
        key: Buffer.from(response.dhPublicKey, 'base64'),
        format: 'der',
        type: 'spki',
      });

      const sharedSecret = crypto.diffieHellman({
        privateKey: keyState.dhKey.privateKey,
        publicKey: deviceDHPublicKey,
      });

      // Derive session key
      const sessionKey = this.deriveSessionKey(
        sharedSecret,
        deviceId,
        keyState.nonce,
      );

      // Store session key
      this.sessionKeys.set(deviceId, sessionKey);
      this.encryptionKeys.set(deviceId, sessionKey);

      // Update key exchange state
      this.keyExchangeState.set(deviceId, {
        ...keyState,
        status: KeyExchangeStatus.COMPLETED,
        sessionKey: sessionKey,
      });

      // Clear attempts
      this.keyExchangeAttempts.delete(deviceId);

      logger.info(`[BLE] Key exchange completed for device: ${deviceId}`);
      this.emit('keyExchangeCompleted', deviceId);

      return true;
    } catch (error) {
      // Increment failed attempts
      const attempts = this.keyExchangeAttempts.get(deviceId) || 0;
      this.keyExchangeAttempts.set(deviceId, attempts + 1);

      if (attempts + 1 >= MAX_KEY_EXCHANGE_ATTEMPTS) {
        this.keyExchangeBlocked.set(deviceId, {
          until: Date.now() + AUTH_BLOCK_DURATION,
          reason: 'Max key exchange attempts exceeded',
        });
        logger.warn(`[BLE] Device blocked due to key exchange failures: ${deviceId}`);
        this.emit('deviceKeyExchangeBlocked', deviceId);
      }

      logger.error(`[BLE] Key exchange failed for device ${deviceId}:`, error.message);
      return false;
    }
  }

  /**
   * Check if key exchange is completed for device
   */
  isKeyExchangeCompleted(deviceId) {
    const keyState = this.keyExchangeState.get(deviceId);
    return keyState && keyState.status === KeyExchangeStatus.COMPLETED;
  }

  /**
   * Check if device is blocked from key exchange
   */
  isKeyExchangeBlocked(deviceId) {
    const blockedInfo = this.keyExchangeBlocked.get(deviceId);
    if (!blockedInfo) return false;
    
    if (Date.now() > blockedInfo.until) {
      this.keyExchangeBlocked.delete(deviceId);
      return false;
    }
    
    return true;
  }

  /**
   * Get key exchange status for device
   */
  getKeyExchangeStatus(deviceId) {
    if (this.isKeyExchangeBlocked(deviceId)) {
      return KeyExchangeStatus.FAILED;
    }
    
    const keyState = this.keyExchangeState.get(deviceId);
    if (!keyState) {
      return KeyExchangeStatus.FAILED;
    }
    
    return keyState.status;
  }

  /**
   * Rotate session key for forward secrecy
   */
  async rotateSessionKey(deviceId) {
    if (!this.isKeyExchangeCompleted(deviceId)) {
      throw new Error('Cannot rotate key - key exchange not completed');
    }

    try {
      // Generate new DH key pair
      const newDHKeyPair = this.generateDHKeyPair();
      const newNonce = crypto.randomBytes(16);
      
      // Store new key exchange state
      this.keyExchangeState.set(deviceId, {
        status: KeyExchangeStatus.PENDING,
        dhKey: newDHKeyPair,
        nonce: newNonce,
        timestamp: Date.now(),
      });

      // Send key rotation request
      await this.sendData(deviceId, {
        type: 'key_rotation_init',
        dhPublicKey: newDHKeyPair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
        nonce: newNonce.toString('base64'),
      });

      logger.info(`[BLE] Initiated key rotation for device: ${deviceId}`);
      return true;
    } catch (error) {
      logger.error(`[BLE] Key rotation failed for device ${deviceId}:`, error.message);
      throw error;
    }
  }

  getEncryptionKey(deviceId) {
    // Use session key if available, otherwise fall back to legacy method
    if (this.sessionKeys.has(deviceId)) {
      return this.sessionKeys.get(deviceId);
    }
    
    if (!this.encryptionKeys.has(deviceId)) {
      // Generate a new key for this device (legacy fallback)
      const key = crypto.randomBytes(32);
      this.encryptionKeys.set(deviceId, key);
    }
    return this.encryptionKeys.get(deviceId);
  }

  disconnectDevice(deviceId) {
    const device = this.connectedDevices.get(deviceId);
    if (device) {
      device.peripheral.disconnect();
      this.connectedDevices.delete(deviceId);
      this.encryptionKeys.delete(deviceId);
      this.sessionKeys.delete(deviceId);
      this.keyExchangeState.delete(deviceId);
      this.keyExchangeAttempts.delete(deviceId);
      logger.info('[BLE] Device disconnected:', deviceId);
      this.emit('deviceDisconnected', deviceId);
    }
  }

  async startAdvertising() {
    if (!this.initialized) {
      logger.warn('[BLE] Cannot start advertising - not initialized');
      return;
    }

    try {
      // Wait for bleno to be ready
      await new Promise((resolve, reject) => {
        const state = bleno.state;
        if (state === 'poweredOn') {
          resolve();
        } else {
          bleno.once('stateChange', (state) => {
            if (state === 'poweredOn') {
              resolve();
            } else {
              reject(new Error(`Bluetooth adapter state: ${state}`));
            }
          });
        }
      });

      // Create characteristic for receiving transactions
      const characteristic = new bleno.Characteristic({
        uuid: AIRCHAINPAY_CHARACTERISTIC_UUID,
        properties: ['write', 'notify'],
        descriptors: [
          new bleno.Descriptor({
            uuid: '2901',
            value: 'AirChainPay Transaction',
          }),
        ],
        onWriteRequest: (data, offset, withoutResponse, callback) => {
          try {
            const decryptedData = this.decryptData('relay', data);
            const parsedData = JSON.parse(decryptedData);
            
            // Process the transaction
            this.processTransaction('relay', parsedData);
            
            callback(bleno.Characteristic.RESULT_SUCCESS);
          } catch (error) {
            logger.error('[BLE] Write request error:', error);
            callback(bleno.Characteristic.RESULT_UNLIKELY_ERROR);
          }
        },
        onSubscribe: (maxValueSize, updateValueCallback) => {
          logger.info('[BLE] Client subscribed to notifications');
          this.notifyCallback = updateValueCallback;
        },
        onUnsubscribe: () => {
          logger.info('[BLE] Client unsubscribed from notifications');
          this.notifyCallback = null;
        },
        onNotify: () => {
          logger.debug('[BLE] Notification sent');
        },
      });

      // Create service with proper error handling
      const service = new bleno.PrimaryService({
        uuid: AIRCHAINPAY_SERVICE_UUID,
        characteristics: [characteristic],
      });

      // Start advertising with proper timeout and error handling
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Advertising start timeout'));
        }, 10000);

        bleno.startAdvertising('AirChainPay Relay', [AIRCHAINPAY_SERVICE_UUID], (error) => {
          clearTimeout(timeout);
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      // Set up service when advertising starts
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Service setup timeout'));
        }, 10000);

        bleno.setServices([service], (error) => {
          clearTimeout(timeout);
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      this.isAdvertising = true;
      logger.info('[BLE] Started advertising as AirChainPay Relay');

      // Setup disconnect handler
      bleno.on('disconnect', (clientAddress) => {
        logger.info('[BLE] Client disconnected:', clientAddress);
        this.notifyCallback = null;
      });

      // Setup accept handler
      bleno.on('accept', (clientAddress) => {
        logger.info('[BLE] Client connected:', clientAddress);
      });

    } catch (error) {
      logger.error('[BLE] Failed to start advertising:', error);
      this.isAdvertising = false;
    }
  }

  stopAdvertising() {
    if (this.isAdvertising && bleno && bleno.stopAdvertising) {
      bleno.stopAdvertising();
      this.isAdvertising = false;
      logger.info('[BLE] Stopped advertising');
    }
  }

  destroy() {
    this.stopAdvertising();
    this.stopScanning();
    
    // Disconnect all devices
    for (const [deviceId] of this.connectedDevices) {
      this.disconnectDevice(deviceId);
    }
    
    this.connectedDevices.clear();
    this.encryptionKeys.clear();
    this.sessionKeys.clear();
    this.keyExchangeState.clear();
    this.keyExchangeAttempts.clear();
    this.keyExchangeBlocked.clear();
    this.transactionQueue.clear();
    
    logger.info('[BLE] Manager destroyed');
  }

  /**
   * Check if device is authenticated
   */
  isDeviceAuthenticated(deviceId) {
    return this.authenticatedDevices.has(deviceId);
  }

  /**
   * Check if device is blocked
   */
  isDeviceBlocked(deviceId) {
    const blockedInfo = this.blockedDevices.get(deviceId);
    if (!blockedInfo) return false;
    
    // Check if block duration has expired
    if (Date.now() - blockedInfo.timestamp > AUTH_BLOCK_DURATION) {
      this.blockedDevices.delete(deviceId);
      this.authAttempts.delete(deviceId);
      return false;
    }
    
    return true;
  }

  /**
   * Generate authentication challenge for device
   */
  generateAuthChallenge(deviceId) {
    const challenge = crypto.randomBytes(AUTH_CHALLENGE_LENGTH);
    const timestamp = Date.now();
    
    this.authChallenges.set(deviceId, {
      challenge: challenge.toString('hex'),
      timestamp: timestamp,
    });
    
    logger.info(`[BLE] Generated auth challenge for device: ${deviceId}`);
    return challenge.toString('hex');
  }

  /**
   * Verify device authentication response
   */
  async verifyAuthResponse(deviceId, response, devicePublicKey) {
    try {
      // Check if key exchange is completed
      if (!this.isKeyExchangeCompleted(deviceId)) {
        throw new Error('Key exchange must be completed before authentication');
      }

      const challengeInfo = this.authChallenges.get(deviceId);
      if (!challengeInfo) {
        throw new Error('No challenge found for device');
      }

      // Check if challenge has expired
      if (Date.now() - challengeInfo.timestamp > AUTH_RESPONSE_TIMEOUT) {
        this.authChallenges.delete(deviceId);
        throw new Error('Authentication challenge expired');
      }

      // Verify the response using device's public key
      const challenge = Buffer.from(challengeInfo.challenge, 'hex');
      const responseBuffer = Buffer.from(response, 'base64');
      
      // Verify signature
      const verify = crypto.createVerify('SHA256');
      verify.update(challenge);
      const isValid = verify.verify(devicePublicKey, responseBuffer);
      
      if (!isValid) {
        throw new Error('Invalid authentication response');
      }

      // Authentication successful
      this.authenticatedDevices.set(deviceId, {
        timestamp: Date.now(),
        publicKey: devicePublicKey,
        sessionKey: this.sessionKeys.get(deviceId),
      });
      
      this.authChallenges.delete(deviceId);
      this.authAttempts.delete(deviceId);
      
      logger.info(`[BLE] Device authenticated successfully: ${deviceId}`);
      this.emit('deviceAuthenticated', deviceId);
      
      return true;
    } catch (error) {
      // Increment failed attempts
      const attempts = this.authAttempts.get(deviceId) || 0;
      this.authAttempts.set(deviceId, attempts + 1);
      
      if (attempts + 1 >= MAX_AUTH_ATTEMPTS) {
        // Block device
        this.blockedDevices.set(deviceId, {
          timestamp: Date.now(),
          reason: 'Max auth attempts exceeded',
        });
        logger.warn(`[BLE] Device blocked due to auth failures: ${deviceId}`);
        this.emit('deviceBlocked', deviceId);
      }
      
      logger.error(`[BLE] Authentication failed for device ${deviceId}:`, error.message);
      return false;
    }
  }

  /**
   * Authenticate device before processing transactions
   */
  async authenticateDevice(deviceId, devicePublicKey) {
    // Check if device is already authenticated
    if (this.isDeviceAuthenticated(deviceId)) {
      return true;
    }

    // Check if device is blocked
    if (this.isDeviceBlocked(deviceId)) {
      throw new Error('Device is blocked due to authentication failures');
    }

    // Store device public key
    this.devicePublicKeys.set(deviceId, devicePublicKey);

    // Initiate secure key exchange first
    try {
      await this.initiateKeyExchange(deviceId);
      logger.info(`[BLE] Key exchange initiated for device: ${deviceId}`);
    } catch (error) {
      logger.error(`[BLE] Key exchange failed for device ${deviceId}:`, error.message);
      throw new Error(`Key exchange failed: ${error.message}`);
    }

    // Generate and send challenge
    const challenge = this.generateAuthChallenge(deviceId);
    
    // Send challenge to device
    await this.sendData(deviceId, {
      type: 'auth_challenge',
      challenge: challenge,
      relayPublicKey: this.relayPrivateKey.publicKey,
    });

    logger.info(`[BLE] Sent auth challenge to device: ${deviceId}`);
    return false; // Authentication pending
  }

  /**
   * Handle authentication response from device
   */
  async handleAuthResponse(deviceId, response) {
    const devicePublicKey = this.devicePublicKeys.get(deviceId);
    if (!devicePublicKey) {
      throw new Error('No public key found for device');
    }

    const isAuthenticated = await this.verifyAuthResponse(deviceId, response, devicePublicKey);
    
    if (isAuthenticated) {
      // Send authentication success response
      await this.sendData(deviceId, {
        type: 'auth_success',
        message: 'Device authenticated successfully',
      });
    } else {
      // Send authentication failure response
      await this.sendData(deviceId, {
        type: 'auth_failed',
        error: 'Authentication failed',
      });
    }

    return isAuthenticated;
  }

  /**
   * Get authentication status for device
   */
  getDeviceAuthStatus(deviceId) {
    if (this.isDeviceBlocked(deviceId)) {
      return AuthStatus.BLOCKED;
    }
    
    if (this.isDeviceAuthenticated(deviceId)) {
      return AuthStatus.AUTHENTICATED;
    }
    
    if (this.authChallenges.has(deviceId)) {
      return AuthStatus.PENDING;
    }
    
    return AuthStatus.FAILED;
  }

  /**
   * DoS protection: check and record connection attempts
   */
  checkConnectionRateLimit(deviceId) {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    const maxConnects = this.config.maxConnectsPerMinute;
    if (!this.connectionTimestamps.has(deviceId)) {
      this.connectionTimestamps.set(deviceId, []);
    }
    // Remove old timestamps
    const timestamps = this.connectionTimestamps.get(deviceId).filter(ts => now - ts < windowMs);
    timestamps.push(now);
    this.connectionTimestamps.set(deviceId, timestamps);
    if (timestamps.length > maxConnects) {
      this.tempBlacklist.set(deviceId, { until: now + 5 * 60 * 1000, reason: 'Too many BLE connections' });
      logger.warn(`[BLE][DoS] Device ${deviceId} temporarily blacklisted for connection spam`);
      return false;
    }
    return true;
  }

  /**
   * DoS protection: check and record transaction attempts
   */
  checkTransactionRateLimit(deviceId) {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    const maxTx = this.config.maxTxPerMinute;
    if (!this.txTimestamps.has(deviceId)) {
      this.txTimestamps.set(deviceId, []);
    }
    // Remove old timestamps
    const timestamps = this.txTimestamps.get(deviceId).filter(ts => now - ts < windowMs);
    timestamps.push(now);
    this.txTimestamps.set(deviceId, timestamps);
    if (timestamps.length > maxTx) {
      this.tempBlacklist.set(deviceId, { until: now + 5 * 60 * 1000, reason: 'Too many BLE transactions' });
      logger.warn(`[BLE][DoS] Device ${deviceId} temporarily blacklisted for transaction spam`);
      return false;
    }
    return true;
  }

  /**
   * DoS protection: check if device is blacklisted
   */
  isTemporarilyBlacklisted(deviceId) {
    const entry = this.tempBlacklist.get(deviceId);
    if (!entry) return false;
    if (Date.now() > entry.until) {
      this.tempBlacklist.delete(deviceId);
      return false;
    }
    return true;
  }

  /**
   * DoS protection: check global connection cap
   */
  isConnectionCapReached() {
    return this.connectedDevices.size >= this.config.maxConnections;
  }
}

module.exports = {
  BLEManager,
  AIRCHAINPAY_SERVICE_UUID,
  AIRCHAINPAY_CHARACTERISTIC_UUID,
  ConnectionStatus,
  AuthStatus,
  KeyExchangeStatus,
  AUTH_CHALLENGE_LENGTH,
  AUTH_RESPONSE_TIMEOUT,
  MAX_AUTH_ATTEMPTS,
  AUTH_BLOCK_DURATION,
  KEY_EXCHANGE_TIMEOUT,
  MAX_KEY_EXCHANGE_ATTEMPTS,
  DH_KEY_SIZE,
  SESSION_KEY_LENGTH,
  // DoS protection config for monitoring
  BLE_DOS_CONFIG: {
    MAX_CONNECTIONS: 10,
    MAX_TX_PER_MINUTE: 10,
    MAX_CONNECTS_PER_MINUTE: 5,
  },
}; 