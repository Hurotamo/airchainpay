const { expect } = require('chai');
const sinon = require('sinon');
const request = require('supertest');
const express = require('express');

// Mock the security middleware
const securityMiddleware = require('../../src/middleware/security');

describe('Security Middleware', () => {
  let app;

  beforeEach(() => {
    app = express();
  });

  describe('Rate Limiters', () => {
    it('should have global rate limiter configured', () => {
      expect(securityMiddleware.rateLimiters.global).to.be.a('function');
    });

    it('should have auth rate limiter configured', () => {
      expect(securityMiddleware.rateLimiters.auth).to.be.a('function');
    });

    it('should have transactions rate limiter configured', () => {
      expect(securityMiddleware.rateLimiters.transactions).to.be.a('function');
    });

    it('should have BLE rate limiter configured', () => {
      expect(securityMiddleware.rateLimiters.ble).to.be.a('function');
    });
  });

  describe('Input Validation', () => {
    it('should have transaction validation middleware', () => {
      expect(securityMiddleware.validateTransaction).to.be.an('array');
      expect(securityMiddleware.validateTransaction).to.have.lengthOf(3);
    });

    it('should have device ID validation middleware', () => {
      expect(securityMiddleware.validateDeviceId).to.be.an('array');
      expect(securityMiddleware.validateDeviceId).to.have.lengthOf(2);
    });
  });

  describe('Request Logger', () => {
    it('should be a function', () => {
      expect(securityMiddleware.requestLogger).to.be.a('function');
    });

    it('should call next()', (done) => {
      const req = {};
      const res = {
        on: sinon.stub(),
        statusCode: 200
      };
      const next = sinon.stub();

      securityMiddleware.requestLogger(req, res, next);

      expect(next.called).to.be.true;
      done();
    });
  });

  describe('Error Handler', () => {
    it('should be a function', () => {
      expect(securityMiddleware.errorHandler).to.be.a('function');
    });

    it('should handle errors in development', () => {
      const req = { url: '/test', method: 'GET', ip: '127.0.0.1' };
      const res = {
        status: sinon.stub().returnsThis(),
        json: sinon.stub()
      };
      const error = new Error('Test error');
      const next = sinon.stub();

      // Set development environment
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      securityMiddleware.errorHandler(error, req, res, next);

      expect(res.status.calledWith(500)).to.be.true;
      expect(res.json.called).to.be.true;

      // Restore environment
      process.env.NODE_ENV = originalEnv;
    });

    it('should handle errors in production', () => {
      const req = { url: '/test', method: 'GET', ip: '127.0.0.1' };
      const res = {
        status: sinon.stub().returnsThis(),
        json: sinon.stub()
      };
      const error = new Error('Test error');
      const next = sinon.stub();

      // Set production environment
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      securityMiddleware.errorHandler(error, req, res, next);

      expect(res.status.calledWith(500)).to.be.true;
      expect(res.json.called).to.be.true;

      // Restore environment
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('CORS Configuration', () => {
    it('should have CORS options configured', () => {
      expect(securityMiddleware.corsOptions).to.be.an('object');
      expect(securityMiddleware.corsOptions.origin).to.be.a('function');
      expect(securityMiddleware.corsOptions.credentials).to.be.true;
      expect(securityMiddleware.corsOptions.methods).to.be.an('array');
    });

    it('should allow all origins when CORS_ORIGINS is *', () => {
      const originalEnv = process.env.CORS_ORIGINS;
      process.env.CORS_ORIGINS = '*';

      const callback = sinon.stub();
      securityMiddleware.corsOptions.origin('http://example.com', callback);

      expect(callback.calledWith(null, true)).to.be.true;

      process.env.CORS_ORIGINS = originalEnv;
    });

    it('should allow specific origins', () => {
      const originalEnv = process.env.CORS_ORIGINS;
      process.env.CORS_ORIGINS = 'http://example.com,https://test.com';

      const callback = sinon.stub();
      securityMiddleware.corsOptions.origin('http://example.com', callback);

      expect(callback.calledWith(null, true)).to.be.true;

      process.env.CORS_ORIGINS = originalEnv;
    });

    it('should block unauthorized origins', () => {
      const originalEnv = process.env.CORS_ORIGINS;
      process.env.CORS_ORIGINS = 'http://example.com,https://test.com';

      const callback = sinon.stub();
      securityMiddleware.corsOptions.origin('http://malicious.com', callback);

      expect(callback.calledWith(sinon.match.instanceOf(Error))).to.be.true;

      process.env.CORS_ORIGINS = originalEnv;
    });
  });

  describe('IP Whitelist', () => {
    it('should be a function', () => {
      expect(securityMiddleware.ipWhitelist).to.be.a('function');
    });

    it('should allow whitelisted IPs', () => {
      const whitelist = ['127.0.0.1', '192.168.1.1'];
      const middleware = securityMiddleware.ipWhitelist(whitelist);

      const req = { ip: '127.0.0.1' };
      const res = {};
      const next = sinon.stub();

      middleware(req, res, next);

      expect(next.called).to.be.true;
    });

    it('should block non-whitelisted IPs', () => {
      const whitelist = ['127.0.0.1'];
      const middleware = securityMiddleware.ipWhitelist(whitelist);

      const req = { ip: '192.168.1.1' };
      const res = {
        status: sinon.stub().returnsThis(),
        json: sinon.stub()
      };
      const next = sinon.stub();

      middleware(req, res, next);

      expect(res.status.calledWith(403)).to.be.true;
      expect(res.json.called).to.be.true;
      expect(next.called).to.be.false;
    });

    it('should allow all IPs when * is in whitelist', () => {
      const whitelist = ['127.0.0.1', '*'];
      const middleware = securityMiddleware.ipWhitelist(whitelist);

      const req = { ip: '192.168.1.1' };
      const res = {};
      const next = sinon.stub();

      middleware(req, res, next);

      expect(next.called).to.be.true;
    });
  });

  describe('Request Size Limit', () => {
    it('should be a function', () => {
      expect(securityMiddleware.requestSizeLimit).to.be.a('function');
    });

    it('should allow requests within size limit', () => {
      const middleware = securityMiddleware.requestSizeLimit('10mb');
      const req = { headers: { 'content-length': '5242880' } }; // 5MB
      const res = {};
      const next = sinon.stub();

      middleware(req, res, next);

      expect(next.called).to.be.true;
    });

    it('should block requests exceeding size limit', () => {
      const middleware = securityMiddleware.requestSizeLimit('1mb');
      const req = { headers: { 'content-length': '2097152' } }; // 2MB
      const res = {
        status: sinon.stub().returnsThis(),
        json: sinon.stub()
      };
      const next = sinon.stub();

      middleware(req, res, next);

      expect(res.status.calledWith(413)).to.be.true;
      expect(res.json.called).to.be.true;
      expect(next.called).to.be.false;
    });
  });

  describe('Security Headers', () => {
    it('should be a function', () => {
      expect(securityMiddleware.securityHeaders).to.be.a('function');
    });

    it('should set security headers', () => {
      const req = {};
      const res = {
        setHeader: sinon.stub()
      };
      const next = sinon.stub();

      securityMiddleware.securityHeaders(req, res, next);

      expect(res.setHeader.called).to.be.true;
      expect(next.called).to.be.true;
    });
  });

  describe('Helmet Configuration', () => {
    it('should have helmet configured', () => {
      expect(securityMiddleware.helmet).to.be.a('function');
    });
  });

  describe('Compression Configuration', () => {
    it('should have compression configured', () => {
      expect(securityMiddleware.compression).to.be.a('function');
    });
  });
}); 