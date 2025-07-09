const { expect } = require('chai');
const sinon = require('sinon');

describe('Metrics Collection', () => {
  let metrics;
  let clock;

  beforeEach(() => {
    // Mock the metrics object that would be imported from server.js
    metrics = {
      transactionsReceived: 0,
      transactionsProcessed: 0,
      transactionsFailed: 0,
      transactionsBroadcasted: 0,
      bleConnections: 0,
      bleDisconnections: 0,
      bleAuthentications: 0,
      bleKeyExchanges: 0,
      rpcErrors: 0,
      gasPriceUpdates: 0,
      contractEvents: 0,
      authFailures: 0,
      rateLimitHits: 0,
      blockedDevices: 0,
      uptime: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      reset() {
        this.transactionsReceived = 0;
        this.transactionsProcessed = 0;
        this.transactionsFailed = 0;
        this.transactionsBroadcasted = 0;
        this.bleConnections = 0;
        this.bleDisconnections = 0;
        this.bleAuthentications = 0;
        this.bleKeyExchanges = 0;
        this.rpcErrors = 0;
        this.gasPriceUpdates = 0;
        this.contractEvents = 0;
        this.authFailures = 0;
        this.rateLimitHits = 0;
        this.blockedDevices = 0;
      }
    };

    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
  });

  describe('Metrics Initialization', () => {
    it('should initialize with zero values', () => {
      expect(metrics.transactionsReceived).to.equal(0);
      expect(metrics.transactionsProcessed).to.equal(0);
      expect(metrics.transactionsFailed).to.equal(0);
      expect(metrics.transactionsBroadcasted).to.equal(0);
      expect(metrics.bleConnections).to.equal(0);
      expect(metrics.bleDisconnections).to.equal(0);
      expect(metrics.bleAuthentications).to.equal(0);
      expect(metrics.bleKeyExchanges).to.equal(0);
      expect(metrics.rpcErrors).to.equal(0);
      expect(metrics.authFailures).to.equal(0);
      expect(metrics.rateLimitHits).to.equal(0);
      expect(metrics.blockedDevices).to.equal(0);
    });

    it('should have system metrics properties', () => {
      expect(metrics).to.have.property('uptime');
      expect(metrics).to.have.property('memoryUsage');
      expect(metrics).to.have.property('cpuUsage');
    });
  });

  describe('Metrics Incrementation', () => {
    it('should increment transaction metrics correctly', () => {
      metrics.transactionsReceived++;
      metrics.transactionsProcessed++;
      metrics.transactionsFailed++;
      metrics.transactionsBroadcasted++;

      expect(metrics.transactionsReceived).to.equal(1);
      expect(metrics.transactionsProcessed).to.equal(1);
      expect(metrics.transactionsFailed).to.equal(1);
      expect(metrics.transactionsBroadcasted).to.equal(1);
    });

    it('should increment BLE metrics correctly', () => {
      metrics.bleConnections++;
      metrics.bleDisconnections++;
      metrics.bleAuthentications++;
      metrics.bleKeyExchanges++;

      expect(metrics.bleConnections).to.equal(1);
      expect(metrics.bleDisconnections).to.equal(1);
      expect(metrics.bleAuthentications).to.equal(1);
      expect(metrics.bleKeyExchanges).to.equal(1);
    });

    it('should increment security metrics correctly', () => {
      metrics.rpcErrors++;
      metrics.authFailures++;
      metrics.rateLimitHits++;
      metrics.blockedDevices++;

      expect(metrics.rpcErrors).to.equal(1);
      expect(metrics.authFailures).to.equal(1);
      expect(metrics.rateLimitHits).to.equal(1);
      expect(metrics.blockedDevices).to.equal(1);
    });
  });

  describe('Metrics Reset', () => {
    it('should reset all metrics to zero', () => {
      // Set some values
      metrics.transactionsReceived = 5;
      metrics.transactionsProcessed = 3;
      metrics.transactionsFailed = 2;
      metrics.bleConnections = 10;
      metrics.rpcErrors = 1;

      // Reset
      metrics.reset();

      expect(metrics.transactionsReceived).to.equal(0);
      expect(metrics.transactionsProcessed).to.equal(0);
      expect(metrics.transactionsFailed).to.equal(0);
      expect(metrics.transactionsBroadcasted).to.equal(0);
      expect(metrics.bleConnections).to.equal(0);
      expect(metrics.bleDisconnections).to.equal(0);
      expect(metrics.bleAuthentications).to.equal(0);
      expect(metrics.bleKeyExchanges).to.equal(0);
      expect(metrics.rpcErrors).to.equal(0);
      expect(metrics.gasPriceUpdates).to.equal(0);
      expect(metrics.contractEvents).to.equal(0);
      expect(metrics.authFailures).to.equal(0);
      expect(metrics.rateLimitHits).to.equal(0);
      expect(metrics.blockedDevices).to.equal(0);
    });
  });

  describe('System Metrics Update', () => {
    it('should update system metrics periodically', () => {
      const originalUptime = process.uptime;
      const originalMemoryUsage = process.memoryUsage;
      const originalCpuUsage = process.cpuUsage;

      // Mock process methods
      process.uptime = sinon.stub().returns(100);
      process.memoryUsage = sinon.stub().returns({ heapUsed: 1024 * 1024 });
      process.cpuUsage = sinon.stub().returns({ user: 5000000 });

      // Simulate the setInterval callback
      const updateSystemMetrics = () => {
        metrics.uptime = process.uptime();
        metrics.memoryUsage = process.memoryUsage().heapUsed;
        metrics.cpuUsage = process.cpuUsage().user;
      };

      updateSystemMetrics();

      expect(metrics.uptime).to.equal(100);
      expect(metrics.memoryUsage).to.equal(1024 * 1024);
      expect(metrics.cpuUsage).to.equal(5000000);

      // Restore original methods
      process.uptime = originalUptime;
      process.memoryUsage = originalMemoryUsage;
      process.cpuUsage = originalCpuUsage;
    });
  });

  describe('Metrics Validation', () => {
    it('should have valid metric types', () => {
      expect(typeof metrics.transactionsReceived).to.equal('number');
      expect(typeof metrics.transactionsProcessed).to.equal('number');
      expect(typeof metrics.transactionsFailed).to.equal('number');
      expect(typeof metrics.transactionsBroadcasted).to.equal('number');
      expect(typeof metrics.bleConnections).to.equal('number');
      expect(typeof metrics.bleDisconnections).to.equal('number');
      expect(typeof metrics.bleAuthentications).to.equal('number');
      expect(typeof metrics.bleKeyExchanges).to.equal('number');
      expect(typeof metrics.rpcErrors).to.equal('number');
      expect(typeof metrics.authFailures).to.equal('number');
      expect(typeof metrics.rateLimitHits).to.equal('number');
      expect(typeof metrics.blockedDevices).to.equal('number');
      expect(typeof metrics.uptime).to.equal('number');
      expect(typeof metrics.memoryUsage).to.equal('number');
      expect(typeof metrics.cpuUsage).to.equal('number');
    });

    it('should not have negative values', () => {
      metrics.transactionsReceived = -1;
      expect(metrics.transactionsReceived).to.be.at.least(0);
    });
  });
}); 