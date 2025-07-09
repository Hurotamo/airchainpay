const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const path = require('path');

// Mock the database module
const Database = require('../../src/utils/database');

describe('Database Module', () => {
  let database;
  let fsStub;
  let pathStub;

  beforeEach(() => {
    // Create a fresh database instance for each test
    database = new Database();
    
    // Stub fs methods
    fsStub = sinon.stub(fs);
    pathStub = sinon.stub(path);
    
    // Mock path.join to return predictable paths
    pathStub.join.returns('/mock/data/path');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Database Initialization', () => {
    it('should create data directory if it does not exist', () => {
      fsStub.existsSync.returns(false);
      fsStub.mkdirSync.returns(undefined);
      
      database.initialize();
      
      expect(fsStub.mkdirSync.called).to.be.true;
      expect(fsStub.mkdirSync.firstCall.args[1]).to.deep.equal({ recursive: true });
    });

    it('should not create data directory if it already exists', () => {
      fsStub.existsSync.returns(true);
      
      database.initialize();
      
      expect(fsStub.mkdirSync.called).to.be.false;
    });

    it('should initialize files with default values', () => {
      fsStub.existsSync.returns(false);
      fsStub.writeFileSync.returns(undefined);
      
      database.initialize();
      
      expect(fsStub.writeFileSync.called).to.be.true;
    });
  });

  describe('File Operations', () => {
    it('should read file correctly', () => {
      const mockData = JSON.stringify({ test: 'data' });
      fsStub.readFileSync.returns(mockData);
      
      const result = database.readFile('/test/path');
      
      expect(result).to.deep.equal({ test: 'data' });
      expect(fsStub.readFileSync.calledWith('/test/path', 'utf8')).to.be.true;
    });

    it('should handle file read errors', () => {
      fsStub.readFileSync.throws(new Error('File not found'));
      
      const result = database.readFile('/test/path');
      
      expect(result).to.be.null;
    });

    it('should write file correctly', () => {
      const testData = { test: 'data' };
      fsStub.writeFileSync.returns(undefined);
      
      const result = database.writeFile('/test/path', testData);
      
      expect(result).to.be.true;
      expect(fsStub.writeFileSync.calledWith('/test/path', JSON.stringify(testData, null, 2))).to.be.true;
    });

    it('should handle file write errors', () => {
      fsStub.writeFileSync.throws(new Error('Permission denied'));
      
      const result = database.writeFile('/test/path', { test: 'data' });
      
      expect(result).to.be.false;
    });
  });

  describe('Transaction Operations', () => {
    beforeEach(() => {
      fsStub.readFileSync.returns('[]');
      fsStub.writeFileSync.returns(undefined);
    });

    it('should save transaction with generated ID', () => {
      const transaction = { signedTransaction: '0x123', chainId: 84532 };
      
      const result = database.saveTransaction(transaction);
      
      expect(result).to.be.true;
      expect(transaction.id).to.be.a('string');
      expect(transaction.timestamp).to.be.a('string');
    });

    it('should save transaction with existing ID', () => {
      const transaction = { 
        id: 'existing-id', 
        signedTransaction: '0x123', 
        chainId: 84532 
      };
      
      const result = database.saveTransaction(transaction);
      
      expect(result).to.be.true;
      expect(transaction.id).to.equal('existing-id');
    });

    it('should limit transactions to 1000', () => {
      // Create 1001 transactions
      const transactions = Array.from({ length: 1001 }, (_, i) => ({
        id: `tx-${i}`,
        signedTransaction: `0x${i}`,
        chainId: 84532
      }));
      
      fsStub.readFileSync.returns(JSON.stringify(transactions));
      
      const newTransaction = { signedTransaction: '0xnew', chainId: 84532 };
      database.saveTransaction(newTransaction);
      
      // Should keep only the last 1000 transactions
      expect(fsStub.writeFileSync.called).to.be.true;
      const writtenData = JSON.parse(fsStub.writeFileSync.firstCall.args[1]);
      expect(writtenData).to.have.lengthOf(1000);
    });

    it('should get transactions with limit and offset', () => {
      const transactions = Array.from({ length: 10 }, (_, i) => ({
        id: `tx-${i}`,
        signedTransaction: `0x${i}`,
        chainId: 84532
      }));
      
      fsStub.readFileSync.returns(JSON.stringify(transactions));
      
      const result = database.getTransactions(5, 2);
      
      expect(result).to.have.lengthOf(5);
      expect(result[0].id).to.equal('tx-2');
    });

    it('should get transaction by ID', () => {
      const transactions = [
        { id: 'tx-1', signedTransaction: '0x123', chainId: 84532 },
        { id: 'tx-2', signedTransaction: '0x456', chainId: 84532 }
      ];
      
      fsStub.readFileSync.returns(JSON.stringify(transactions));
      
      const result = database.getTransactionById('tx-1');
      
      expect(result).to.deep.equal(transactions[0]);
    });

    it('should get transactions by device', () => {
      const transactions = [
        { id: 'tx-1', deviceId: 'device-1', signedTransaction: '0x123', chainId: 84532 },
        { id: 'tx-2', deviceId: 'device-2', signedTransaction: '0x456', chainId: 84532 },
        { id: 'tx-3', deviceId: 'device-1', signedTransaction: '0x789', chainId: 84532 }
      ];
      
      fsStub.readFileSync.returns(JSON.stringify(transactions));
      
      const result = database.getTransactionsByDevice('device-1', 10);
      
      expect(result).to.have.lengthOf(2);
      expect(result[0].deviceId).to.equal('device-1');
      expect(result[1].deviceId).to.equal('device-1');
    });
  });

  describe('Device Operations', () => {
    beforeEach(() => {
      fsStub.readFileSync.returns('{}');
      fsStub.writeFileSync.returns(undefined);
    });

    it('should save device data', () => {
      const deviceId = 'device-123';
      const deviceData = { name: 'Test Device', status: 'active' };
      
      const result = database.saveDevice(deviceId, deviceData);
      
      expect(result).to.be.true;
      expect(fsStub.writeFileSync.called).to.be.true;
    });

    it('should get device by ID', () => {
      const devices = {
        'device-1': { name: 'Device 1', status: 'active' },
        'device-2': { name: 'Device 2', status: 'inactive' }
      };
      
      fsStub.readFileSync.returns(JSON.stringify(devices));
      
      const result = database.getDevice('device-1');
      
      expect(result).to.deep.equal(devices['device-1']);
    });

    it('should get all devices', () => {
      const devices = {
        'device-1': { name: 'Device 1', status: 'active' },
        'device-2': { name: 'Device 2', status: 'inactive' }
      };
      
      fsStub.readFileSync.returns(JSON.stringify(devices));
      
      const result = database.getAllDevices();
      
      expect(result).to.deep.equal(devices);
    });

    it('should update device status', () => {
      const devices = {
        'device-1': { name: 'Device 1', status: 'active' }
      };
      
      fsStub.readFileSync.returns(JSON.stringify(devices));
      
      const result = database.updateDeviceStatus('device-1', 'inactive');
      
      expect(result).to.be.true;
      expect(fsStub.writeFileSync.called).to.be.true;
    });

    it('should return false when updating non-existent device', () => {
      fsStub.readFileSync.returns('{}');
      
      const result = database.updateDeviceStatus('non-existent', 'active');
      
      expect(result).to.be.false;
    });
  });

  describe('Metrics Operations', () => {
    beforeEach(() => {
      fsStub.readFileSync.returns('{}');
      fsStub.writeFileSync.returns(undefined);
    });

    it('should save metrics with timestamp', () => {
      const metrics = { uptime: 100, memoryUsage: 1024 };
      
      const result = database.saveMetrics(metrics);
      
      expect(result).to.be.true;
      expect(fsStub.writeFileSync.called).to.be.true;
    });

    it('should get metrics for time range', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      
      const metrics = {
        [oneHourAgo.toISOString()]: { uptime: 100, memoryUsage: 1024 },
        [twoHoursAgo.toISOString()]: { uptime: 50, memoryUsage: 512 }
      };
      
      fsStub.readFileSync.returns(JSON.stringify(metrics));
      
      const result = database.getMetrics('1h');
      
      expect(result).to.have.lengthOf(1);
      expect(result[0].uptime).to.equal(100);
    });
  });

  describe('Utility Methods', () => {
    it('should generate unique IDs', () => {
      const id1 = database.generateId();
      const id2 = database.generateId();
      
      expect(id1).to.be.a('string');
      expect(id2).to.be.a('string');
      expect(id1).to.not.equal(id2);
    });

    it('should create backup', () => {
      fsStub.existsSync.returns(false);
      fsStub.mkdirSync.returns(undefined);
      fsStub.copyFileSync.returns(undefined);
      
      const result = database.createBackup();
      
      expect(result).to.be.a('string');
      expect(fsStub.mkdirSync.called).to.be.true;
      expect(fsStub.copyFileSync.called).to.be.true;
    });

    it('should cleanup old backups', () => {
      const mockBackups = [
        { name: 'backup-2023-01-01', path: '/backups/backup-2023-01-01', time: new Date('2023-01-01') },
        { name: 'backup-2023-01-02', path: '/backups/backup-2023-01-02', time: new Date('2023-01-02') },
        { name: 'backup-2023-01-03', path: '/backups/backup-2023-01-03', time: new Date('2023-01-03') }
      ];
      
      fsStub.existsSync.returns(true);
      fsStub.readdirSync.returns(['backup-2023-01-01', 'backup-2023-01-02', 'backup-2023-01-03']);
      fsStub.statSync.returns({ mtime: new Date('2023-01-01') });
      fsStub.rmSync.returns(undefined);
      
      database.cleanup();
      
      expect(fsStub.rmSync.called).to.be.true;
    });
  });
}); 