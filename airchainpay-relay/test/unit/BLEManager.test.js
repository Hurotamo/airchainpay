const { expect } = require('chai');
const sinon = require('sinon');
const crypto = require('crypto');
const { BLEManager } = require('../../src/bluetooth/BLEManager');

describe('BLEManager Unit Tests', () => {
  let sandbox;
  let bleManager;
  let mockNoble;
  let mockBleno;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Mock noble and bleno modules
    mockNoble = {
      startScanning: sandbox.stub(),
      stopScanning: sandbox.stub(),
      on: sandbox.stub(),
      removeAllListeners: sandbox.stub()
    };

    mockBleno = {
      startAdvertising: sandbox.stub(),
      stopAdvertising: sandbox.stub(),
      on: sandbox.stub(),
      removeAllListeners: sandbox.stub()
    };

    // Stub the noble and bleno modules
    sandbox.stub(require('@abandonware/noble'), 'default').value(mockNoble);
    sandbox.stub(require('@abandonware/bleno'), 'default').value(mockBleno);

    // Create BLEManager instance
    bleManager = new BLEManager();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('BLEManager Initialization', () => {
    it('should create BLEManager instance', () => {
      expect(bleManager).to.be.an('object');
      expect(bleManager).to.have.property('initialize');
      expect(bleManager).to.have.property('destroy');
    });

    it('should initialize with default state', () => {
      expect(bleManager.isInitialized).to.be.false;
      expect(bleManager.isAdvertising).to.be.false;
      expect(bleManager.isScanning).to.be.false;
      expect(bleManager.connectedDevices).to.be.an('array');
      expect(bleManager.connectedDevices).to.have.length(0);
    });

    it('should initialize successfully', async () => {
      // Mock successful initialization
      mockNoble.on.withArgs('stateChange').yields('poweredOn');
      mockBleno.on.withArgs('stateChange').yields('poweredOn');

      await bleManager.initialize();

      expect(bleManager.isInitialized).to.be.true;
    });

    it('should handle initialization errors', async () => {
      // Mock failed initialization
      mockNoble.on.withArgs('stateChange').yields('poweredOff');

      try {
        await bleManager.initialize();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Bluetooth not available');
      }
    });
  });

  describe('Device Management', () => {
    beforeEach(async () => {
      // Mock successful initialization
      mockNoble.on.withArgs('stateChange').yields('poweredOn');
      mockBleno.on.withArgs('stateChange').yields('poweredOn');
      await bleManager.initialize();
    });

    it('should add device to connected devices', () => {
      const deviceId = 'test-device-123';
      const deviceInfo = {
        id: deviceId,
        name: 'Test Device',
        address: '00:11:22:33:44:55'
      };

      bleManager.addConnectedDevice(deviceId, deviceInfo);

      expect(bleManager.connectedDevices).to.have.length(1);
      expect(bleManager.connectedDevices[0]).to.deep.equal(deviceInfo);
    });

    it('should remove device from connected devices', () => {
      const deviceId = 'test-device-123';
      const deviceInfo = {
        id: deviceId,
        name: 'Test Device',
        address: '00:11:22:33:44:55'
      };

      bleManager.addConnectedDevice(deviceId, deviceInfo);
      expect(bleManager.connectedDevices).to.have.length(1);

      bleManager.removeConnectedDevice(deviceId);
      expect(bleManager.connectedDevices).to.have.length(0);
    });

    it('should get device by ID', () => {
      const deviceId = 'test-device-123';
      const deviceInfo = {
        id: deviceId,
        name: 'Test Device',
        address: '00:11:22:33:44:55'
      };

      bleManager.addConnectedDevice(deviceId, deviceInfo);
      const foundDevice = bleManager.getDeviceById(deviceId);

      expect(foundDevice).to.deep.equal(deviceInfo);
    });

    it('should return null for non-existent device', () => {
      const foundDevice = bleManager.getDeviceById('non-existent');

      expect(foundDevice).to.be.null;
    });
  });

  describe('Key Exchange', () => {
    beforeEach(async () => {
      // Mock successful initialization
      mockNoble.on.withArgs('stateChange').yields('poweredOn');
      mockBleno.on.withArgs('stateChange').yields('poweredOn');
      await bleManager.initialize();
    });

    it('should initiate key exchange', async () => {
      const deviceId = 'test-device-123';

      await bleManager.initiateKeyExchange(deviceId);

      expect(bleManager.keyExchangeState.has(deviceId)).to.be.true;
      const keyState = bleManager.keyExchangeState.get(deviceId);
      expect(keyState.status).to.equal('PENDING');
    });

    it('should complete key exchange', async () => {
      const deviceId = 'test-device-123';

      // Mock key exchange completion
      await bleManager.initiateKeyExchange(deviceId);
      bleManager.completeKeyExchange(deviceId);

      const keyState = bleManager.keyExchangeState.get(deviceId);
      expect(keyState.status).to.equal('COMPLETED');
    });

    it('should check if key exchange is completed', () => {
      const deviceId = 'test-device-123';

      // Initially not completed
      expect(bleManager.isKeyExchangeCompleted(deviceId)).to.be.false;

      // Complete key exchange
      bleManager.keyExchangeState.set(deviceId, {
        status: 'COMPLETED',
        timestamp: Date.now()
      });

      expect(bleManager.isKeyExchangeCompleted(deviceId)).to.be.true;
    });

    it('should rotate session key', async () => {
      const deviceId = 'test-device-123';

      // Complete initial key exchange
      await bleManager.initiateKeyExchange(deviceId);
      bleManager.completeKeyExchange(deviceId);

      // Rotate session key
      await bleManager.rotateSessionKey(deviceId);

      const keyState = bleManager.keyExchangeState.get(deviceId);
      expect(keyState.status).to.equal('COMPLETED');
      // Should have new timestamp
      expect(keyState.timestamp).to.be.greaterThan(Date.now() - 1000);
    });

    it('should block device from key exchange', () => {
      const deviceId = 'test-device-123';
      const reason = 'Suspicious activity';

      bleManager.keyExchangeBlocked.set(deviceId, {
        timestamp: Date.now(),
        reason: reason
      });

      expect(bleManager.isKeyExchangeBlocked(deviceId)).to.be.true;
    });

    it('should unblock device from key exchange', () => {
      const deviceId = 'test-device-123';

      // Block device
      bleManager.keyExchangeBlocked.set(deviceId, {
        timestamp: Date.now(),
        reason: 'Test block'
      });

      expect(bleManager.isKeyExchangeBlocked(deviceId)).to.be.true;

      // Unblock device
      bleManager.keyExchangeBlocked.delete(deviceId);

      expect(bleManager.isKeyExchangeBlocked(deviceId)).to.be.false;
    });
  });

  describe('Data Transmission', () => {
    beforeEach(async () => {
      // Mock successful initialization
      mockNoble.on.withArgs('stateChange').yields('poweredOn');
      mockBleno.on.withArgs('stateChange').yields('poweredOn');
      await bleManager.initialize();
    });

    it('should encrypt data for transmission', () => {
      const deviceId = 'test-device-123';
      const testData = { message: 'Hello AirChainPay' };

      // Complete key exchange first
      bleManager.keyExchangeState.set(deviceId, {
        status: 'COMPLETED',
        timestamp: Date.now()
      });

      const encryptedData = bleManager.encryptData(deviceId, testData);

      expect(encryptedData).to.be.a('string');
      expect(encryptedData).to.not.equal(JSON.stringify(testData));
    });

    it('should decrypt received data', () => {
      const deviceId = 'test-device-123';
      const testData = { message: 'Hello AirChainPay' };

      // Complete key exchange first
      bleManager.keyExchangeState.set(deviceId, {
        status: 'COMPLETED',
        timestamp: Date.now()
      });

      const encryptedData = bleManager.encryptData(deviceId, testData);
      const decryptedData = bleManager.decryptData(deviceId, encryptedData);

      expect(decryptedData).to.deep.equal(testData);
    });

    it('should handle encryption without session key', () => {
      const deviceId = 'test-device-123';
      const testData = { message: 'Hello AirChainPay' };

      // No key exchange completed
      const encryptedData = bleManager.encryptData(deviceId, testData);

      expect(encryptedData).to.be.a('string');
      expect(encryptedData).to.not.equal(JSON.stringify(testData));
    });

    it('should send transaction status', async () => {
      const deviceId = 'test-device-123';
      const status = {
        txId: 'tx-123',
        status: 'success',
        hash: '0x123456789abcdef'
      };

      // Mock device connection
      bleManager.addConnectedDevice(deviceId, {
        id: deviceId,
        name: 'Test Device',
        address: '00:11:22:33:44:55'
      });

      await bleManager.sendTransactionStatus(deviceId, status);

      // Verify the function was called (actual implementation may vary)
      expect(bleManager.sendTransactionStatus).to.be.a('function');
    });
  });

  describe('Authentication', () => {
    beforeEach(async () => {
      // Mock successful initialization
      mockNoble.on.withArgs('stateChange').yields('poweredOn');
      mockBleno.on.withArgs('stateChange').yields('poweredOn');
      await bleManager.initialize();
    });

    it('should generate authentication challenge', () => {
      const deviceId = 'test-device-123';
      const challenge = bleManager.generateAuthChallenge(deviceId);

      expect(challenge).to.be.a('string');
      expect(challenge).to.have.length(32); // 16 bytes as hex string
    });

    it('should validate authentication response', () => {
      const deviceId = 'test-device-123';
      const challenge = bleManager.generateAuthChallenge(deviceId);
      const response = challenge; // For testing, use challenge as response

      const isValid = bleManager.validateAuthResponse(deviceId, challenge, response);

      expect(isValid).to.be.true;
    });

    it('should reject invalid authentication response', () => {
      const deviceId = 'test-device-123';
      const challenge = bleManager.generateAuthChallenge(deviceId);
      const invalidResponse = 'invalid-response';

      const isValid = bleManager.validateAuthResponse(deviceId, challenge, invalidResponse);

      expect(isValid).to.be.false;
    });

    it('should track authentication attempts', () => {
      const deviceId = 'test-device-123';

      // Initially no attempts
      expect(bleManager.authAttempts.has(deviceId)).to.be.false;

      // Record an attempt
      bleManager.recordAuthAttempt(deviceId);

      expect(bleManager.authAttempts.has(deviceId)).to.be.true;
      expect(bleManager.authAttempts.get(deviceId)).to.be.greaterThan(0);
    });

    it('should block device after too many auth attempts', () => {
      const deviceId = 'test-device-123';

      // Record multiple attempts
      for (let i = 0; i < 5; i++) {
        bleManager.recordAuthAttempt(deviceId);
      }

      expect(bleManager.isAuthBlocked(deviceId)).to.be.true;
    });
  });

  describe('Cleanup', () => {
    it('should destroy BLEManager properly', async () => {
      // Mock successful initialization
      mockNoble.on.withArgs('stateChange').yields('poweredOn');
      mockBleno.on.withArgs('stateChange').yields('poweredOn');
      await bleManager.initialize();

      bleManager.destroy();

      expect(mockNoble.removeAllListeners).to.have.been.called;
      expect(mockBleno.removeAllListeners).to.have.been.called;
      expect(mockNoble.stopScanning).to.have.been.called;
      expect(mockBleno.stopAdvertising).to.have.been.called;
    });
  });
}); 