const noble = require('@abandonware/noble');
const bleno = require('@abandonware/bleno');
const logger = require('../utils/logger');
const crypto = require('crypto');
const EventEmitter = require('events');
const { validateTransaction } = require('../utils/blockchain');

// Constants
const AIRCHAINPAY_SERVICE_UUID = '0000abcd-0000-1000-8000-00805f9b34fb';
const AIRCHAINPAY_CHARACTERISTIC_UUID = '0000dcba-0000-1000-8000-00805f9b34fb';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const SCAN_TIMEOUT = 30000;
const CONNECTION_TIMEOUT = 15000;

const ConnectionStatus = {
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  FAILED: 'FAILED'
};

class BLEManager extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      scanTimeout: SCAN_TIMEOUT,
      connectionTimeout: CONNECTION_TIMEOUT,
      serviceUUID: AIRCHAINPAY_SERVICE_UUID,
      characteristicUUID: AIRCHAINPAY_CHARACTERISTIC_UUID,
      ...config
    };
    
    this.initialized = false;
    this.connectedDevices = new Map();
    this.encryptionKeys = new Map();
    this.transactionQueue = new Map();
    this.isAdvertising = false;
    
    // Bind event handlers
    this.handleDeviceConnect = this.handleDeviceConnect.bind(this);
    this.handleDeviceDisconnect = this.handleDeviceDisconnect.bind(this);
    this.handleData = this.handleData.bind(this);
    
    // Initialize noble
    noble.on('stateChange', this.handleStateChange.bind(this));
    noble.on('discover', this.handleDiscover.bind(this));
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
      throw error;
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
      manufacturerData: peripheral.advertisement.manufacturerData
    };

    // Check if it's an AirChainPay device
    if (deviceInfo.name && deviceInfo.name.includes('AirChainPay')) {
      logger.info('[BLE] Discovered AirChainPay device:', deviceInfo);
      this.emit('deviceDiscovered', deviceInfo);
    }
  }

  async startScanning() {
    if (!this.initialized) {
      throw new Error('BLE Manager not initialized');
    }

    try {
      await noble.startScanningAsync([this.config.serviceUUID], false);
      logger.info('[BLE] Started scanning for devices');
    } catch (error) {
      logger.error('[BLE] Failed to start scanning:', error);
      throw error;
    }
  }

  stopScanning() {
    noble.stopScanning();
    logger.info('[BLE] Stopped scanning');
  }

  async connectToDevice(deviceId) {
    const peripheral = noble.peripherals[deviceId];
    if (!peripheral) {
      throw new Error(`Device ${deviceId} not found`);
    }

    try {
      await peripheral.connectAsync();
      const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
        [this.config.serviceUUID],
        [this.config.characteristicUUID]
      );

      this.connectedDevices.set(deviceId, {
        peripheral,
        characteristics: characteristics[0]
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

      // Validate and process transaction
      this.processTransaction(deviceId, parsedData);
    } catch (error) {
      logger.error('[BLE] Error processing received data:', error);
    }
  }

  async processTransaction(deviceId, txData) {
    try {
      // Validate transaction format and data
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
        type: 'TX_ACK',
        txId: txData.id,
        status: 'received'
      });

      logger.info('[BLE] Transaction processed:', txData.id);
    } catch (error) {
      logger.error('[BLE] Transaction processing failed:', error);
      
      // Send error back to device
      await this.sendData(deviceId, {
        type: 'TX_ERROR',
        txId: txData.id,
        error: error.message
      });
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

    return decipher.update(encrypted) + decipher.final('utf8');
  }

  getEncryptionKey(deviceId) {
    if (!this.encryptionKeys.has(deviceId)) {
      // Generate a new key for this device
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
      this.transactionQueue.delete(deviceId);
      logger.info('[BLE] Disconnected from device:', deviceId);
      this.emit('deviceDisconnected', deviceId);
    }
  }

  async startAdvertising() {
    if (this.isAdvertising) return;

    try {
      // Initialize bleno if not already done
      if (!bleno.initialized) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Bleno initialization timeout'));
          }, 10000);

          bleno.on('stateChange', (state) => {
            clearTimeout(timeout);
            if (state === 'poweredOn') {
              bleno.initialized = true;
              resolve();
            } else {
              reject(new Error(`Bluetooth adapter state: ${state}`));
            }
          });
        });
      }

      // Create characteristic with proper error handling
      const characteristic = new bleno.Characteristic({
        uuid: AIRCHAINPAY_CHARACTERISTIC_UUID,
        properties: ['read', 'write', 'notify', 'indicate'],
        secure: ['read', 'write'],
        onReadRequest: async (offset, callback) => {
          try {
            // Return relay status
            const status = {
              name: 'AirChainPay Relay',
              version: '1.0.0',
              ready: true
            };
            callback(bleno.Characteristic.RESULT_SUCCESS, Buffer.from(JSON.stringify(status)));
          } catch (error) {
            logger.error('[BLE] Read request error:', error);
            callback(bleno.Characteristic.RESULT_UNLIKELY_ERROR);
          }
        },
        onWriteRequest: async (data, offset, withoutResponse, callback) => {
          try {
            await this.handleData(data);
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
        }
      });

      // Create service with proper error handling
      const service = new bleno.PrimaryService({
        uuid: AIRCHAINPAY_SERVICE_UUID,
        characteristics: [characteristic]
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
      throw error;
    }
  }

  stopAdvertising() {
    if (!this.isAdvertising) return;

    try {
      bleno.stopAdvertising();
      this.isAdvertising = false;
      logger.info('[BLE] Stopped advertising');
    } catch (error) {
      logger.error('[BLE] Failed to stop advertising:', error);
      throw error;
    }
  }

  destroy() {
    // Cleanup all connections and resources
    for (const deviceId of this.connectedDevices.keys()) {
      this.disconnectDevice(deviceId);
    }
    
    this.stopScanning();
    this.stopAdvertising();
    this.removeAllListeners();
    this.initialized = false;
    logger.info('[BLE] Manager destroyed');
  }
}

module.exports = {
  BLEManager,
  AIRCHAINPAY_SERVICE_UUID,
  AIRCHAINPAY_CHARACTERISTIC_UUID,
  ConnectionStatus
}; 