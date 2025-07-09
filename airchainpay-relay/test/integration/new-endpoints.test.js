const { expect } = require('chai');
const request = require('supertest');
const express = require('express');

// Mock the server app
const app = express();

// Mock the metrics object
const metrics = {
  transactionsReceived: 5,
  transactionsProcessed: 4,
  transactionsFailed: 1,
  transactionsBroadcasted: 3,
  bleConnections: 10,
  bleDisconnections: 8,
  bleAuthentications: 7,
  bleKeyExchanges: 6,
  rpcErrors: 2,
  gasPriceUpdates: 15,
  contractEvents: 25,
  authFailures: 3,
  rateLimitHits: 1,
  blockedDevices: 2,
  uptime: 3600,
  memoryUsage: 1024 * 1024,
  cpuUsage: 5000000
};

// Mock BLE status
const getBLEStatus = () => ({
  enabled: true,
  initialized: true,
  isAdvertising: true,
  connectedDevices: 3,
  authenticatedDevices: 2,
  blockedDevices: 1
});

// Add test endpoints
app.get('/health', (req, res) => {
  const bleStatus = getBLEStatus();
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    ble: bleStatus,
    metrics: {
      transactions: {
        received: metrics.transactionsReceived,
        processed: metrics.transactionsProcessed,
        failed: metrics.transactionsFailed,
        broadcasted: metrics.transactionsBroadcasted
      },
      ble: {
        connections: metrics.bleConnections,
        disconnections: metrics.bleDisconnections,
        authentications: metrics.bleAuthentications,
        keyExchanges: metrics.bleKeyExchanges
      },
      system: {
        uptime: metrics.uptime,
        memoryUsage: metrics.memoryUsage,
        cpuUsage: metrics.cpuUsage
      }
    }
  });
});

app.get('/metrics', (req, res) => {
  const prometheusMetrics = [
    '# HELP airchainpay_transactions_received_total Total number of transactions received',
    '# TYPE airchainpay_transactions_received_total counter',
    `airchainpay_transactions_received_total ${metrics.transactionsReceived}`,
    '',
    '# HELP airchainpay_transactions_processed_total Total number of transactions processed',
    '# TYPE airchainpay_transactions_processed_total counter',
    `airchainpay_transactions_processed_total ${metrics.transactionsProcessed}`,
    '',
    '# HELP airchainpay_transactions_failed_total Total number of transactions failed',
    '# TYPE airchainpay_transactions_failed_total counter',
    `airchainpay_transactions_failed_total ${metrics.transactionsFailed}`,
    '',
    '# HELP airchainpay_transactions_broadcasted_total Total number of transactions broadcasted',
    '# TYPE airchainpay_transactions_broadcasted_total counter',
    `airchainpay_transactions_broadcasted_total ${metrics.transactionsBroadcasted}`,
    '',
    '# HELP airchainpay_ble_connections_total Total number of BLE connections',
    '# TYPE airchainpay_ble_connections_total counter',
    `airchainpay_ble_connections_total ${metrics.bleConnections}`,
    '',
    '# HELP airchainpay_ble_disconnections_total Total number of BLE disconnections',
    '# TYPE airchainpay_ble_disconnections_total counter',
    `airchainpay_ble_disconnections_total ${metrics.bleDisconnections}`,
    '',
    '# HELP airchainpay_ble_authentications_total Total number of BLE authentications',
    '# TYPE airchainpay_ble_authentications_total counter',
    `airchainpay_ble_authentications_total ${metrics.bleAuthentications}`,
    '',
    '# HELP airchainpay_ble_key_exchanges_total Total number of BLE key exchanges',
    '# TYPE airchainpay_ble_key_exchanges_total counter',
    `airchainpay_ble_key_exchanges_total ${metrics.bleKeyExchanges}`,
    '',
    '# HELP airchainpay_rpc_errors_total Total number of RPC errors',
    '# TYPE airchainpay_rpc_errors_total counter',
    `airchainpay_rpc_errors_total ${metrics.rpcErrors}`,
    '',
    '# HELP airchainpay_auth_failures_total Total number of authentication failures',
    '# TYPE airchainpay_auth_failures_total counter',
    `airchainpay_auth_failures_total ${metrics.authFailures}`,
    '',
    '# HELP airchainpay_rate_limit_hits_total Total number of rate limit hits',
    '# TYPE airchainpay_rate_limit_hits_total counter',
    `airchainpay_rate_limit_hits_total ${metrics.rateLimitHits}`,
    '',
    '# HELP airchainpay_blocked_devices_total Total number of blocked devices',
    '# TYPE airchainpay_blocked_devices_total counter',
    `airchainpay_blocked_devices_total ${metrics.blockedDevices}`,
    '',
    '# HELP airchainpay_uptime_seconds Server uptime in seconds',
    '# TYPE airchainpay_uptime_seconds gauge',
    `airchainpay_uptime_seconds ${metrics.uptime}`,
    '',
    '# HELP airchainpay_memory_usage_bytes Memory usage in bytes',
    '# TYPE airchainpay_memory_usage_bytes gauge',
    `airchainpay_memory_usage_bytes ${metrics.memoryUsage}`,
    '',
    '# HELP airchainpay_cpu_usage_microseconds CPU usage in microseconds',
    '# TYPE airchainpay_cpu_usage_microseconds gauge',
    `airchainpay_cpu_usage_microseconds ${metrics.cpuUsage}`
  ].join('\n');
  
  res.set('Content-Type', 'text/plain');
  res.send(prometheusMetrics);
});

describe('New Endpoints Integration Tests', () => {
  describe('Health Check Endpoint', () => {
    it('should return health status with metrics', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).to.have.property('status', 'healthy');
      expect(response.body).to.have.property('timestamp');
      expect(response.body).to.have.property('uptime');
      expect(response.body).to.have.property('version', '1.0.0');
      expect(response.body).to.have.property('ble');
      expect(response.body).to.have.property('metrics');
    });

    it('should include BLE status in health response', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.ble).to.have.property('enabled', true);
      expect(response.body.ble).to.have.property('initialized', true);
      expect(response.body.ble).to.have.property('isAdvertising', true);
      expect(response.body.ble).to.have.property('connectedDevices', 3);
      expect(response.body.ble).to.have.property('authenticatedDevices', 2);
      expect(response.body.ble).to.have.property('blockedDevices', 1);
    });

    it('should include transaction metrics in health response', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.metrics.transactions).to.have.property('received', 5);
      expect(response.body.metrics.transactions).to.have.property('processed', 4);
      expect(response.body.metrics.transactions).to.have.property('failed', 1);
      expect(response.body.metrics.transactions).to.have.property('broadcasted', 3);
    });

    it('should include BLE metrics in health response', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.metrics.ble).to.have.property('connections', 10);
      expect(response.body.metrics.ble).to.have.property('disconnections', 8);
      expect(response.body.metrics.ble).to.have.property('authentications', 7);
      expect(response.body.metrics.ble).to.have.property('keyExchanges', 6);
    });

    it('should include system metrics in health response', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.metrics.system).to.have.property('uptime', 3600);
      expect(response.body.metrics.system).to.have.property('memoryUsage', 1024 * 1024);
      expect(response.body.metrics.system).to.have.property('cpuUsage', 5000000);
    });
  });

  describe('Prometheus Metrics Endpoint', () => {
    it('should return metrics in Prometheus format', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.headers['content-type']).to.equal('text/plain');
      expect(response.text).to.be.a('string');
      expect(response.text).to.contain('airchainpay_transactions_received_total');
      expect(response.text).to.contain('airchainpay_transactions_processed_total');
      expect(response.text).to.contain('airchainpay_transactions_failed_total');
      expect(response.text).to.contain('airchainpay_transactions_broadcasted_total');
    });

    it('should include transaction metrics', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.text).to.contain('airchainpay_transactions_received_total 5');
      expect(response.text).to.contain('airchainpay_transactions_processed_total 4');
      expect(response.text).to.contain('airchainpay_transactions_failed_total 1');
      expect(response.text).to.contain('airchainpay_transactions_broadcasted_total 3');
    });

    it('should include BLE metrics', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.text).to.contain('airchainpay_ble_connections_total 10');
      expect(response.text).to.contain('airchainpay_ble_disconnections_total 8');
      expect(response.text).to.contain('airchainpay_ble_authentications_total 7');
      expect(response.text).to.contain('airchainpay_ble_key_exchanges_total 6');
    });

    it('should include security metrics', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.text).to.contain('airchainpay_rpc_errors_total 2');
      expect(response.text).to.contain('airchainpay_auth_failures_total 3');
      expect(response.text).to.contain('airchainpay_rate_limit_hits_total 1');
      expect(response.text).to.contain('airchainpay_blocked_devices_total 2');
    });

    it('should include system metrics', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.text).to.contain('airchainpay_uptime_seconds 3600');
      expect(response.text).to.contain('airchainpay_memory_usage_bytes 1048576');
      expect(response.text).to.contain('airchainpay_cpu_usage_microseconds 5000000');
    });

    it('should have correct Prometheus format', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      const lines = response.text.split('\n');
      
      // Check for HELP and TYPE lines
      expect(lines).to.include.members([
        '# HELP airchainpay_transactions_received_total Total number of transactions received',
        '# TYPE airchainpay_transactions_received_total counter'
      ]);

      // Check for metric lines
      expect(lines).to.include('airchainpay_transactions_received_total 5');
      expect(lines).to.include('airchainpay_ble_connections_total 10');
      expect(lines).to.include('airchainpay_uptime_seconds 3600');
    });

    it('should have proper metric types', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      const text = response.text;
      
      // Check counter metrics
      expect(text).to.match(/airchainpay_transactions_received_total \d+/);
      expect(text).to.match(/airchainpay_transactions_processed_total \d+/);
      expect(text).to.match(/airchainpay_transactions_failed_total \d+/);
      expect(text).to.match(/airchainpay_transactions_broadcasted_total \d+/);
      expect(text).to.match(/airchainpay_ble_connections_total \d+/);
      expect(text).to.match(/airchainpay_ble_disconnections_total \d+/);
      expect(text).to.match(/airchainpay_ble_authentications_total \d+/);
      expect(text).to.match(/airchainpay_ble_key_exchanges_total \d+/);
      expect(text).to.match(/airchainpay_rpc_errors_total \d+/);
      expect(text).to.match(/airchainpay_auth_failures_total \d+/);
      expect(text).to.match(/airchainpay_rate_limit_hits_total \d+/);
      expect(text).to.match(/airchainpay_blocked_devices_total \d+/);
      
      // Check gauge metrics
      expect(text).to.match(/airchainpay_uptime_seconds \d+/);
      expect(text).to.match(/airchainpay_memory_usage_bytes \d+/);
      expect(text).to.match(/airchainpay_cpu_usage_microseconds \d+/);
    });
  });

  describe('Endpoint Response Validation', () => {
    it('should have consistent response structure', async () => {
      const healthResponse = await request(app).get('/health');
      const metricsResponse = await request(app).get('/metrics');

      expect(healthResponse.status).to.equal(200);
      expect(metricsResponse.status).to.equal(200);
      expect(healthResponse.body).to.be.an('object');
      expect(metricsResponse.text).to.be.a('string');
    });

    it('should handle concurrent requests', async () => {
      const promises = [
        request(app).get('/health'),
        request(app).get('/metrics'),
        request(app).get('/health'),
        request(app).get('/metrics')
      ];

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.status).to.equal(200);
      });
    });
  });
}); 