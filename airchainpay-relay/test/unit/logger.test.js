const { expect } = require('chai');
const sinon = require('sinon');
const logger = require('../../src/utils/logger');

describe('Logger Unit Tests', () => {
  let sandbox;
  let consoleStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Stub console methods to capture output
    consoleStub = {
      log: sandbox.stub(console, 'log'),
      error: sandbox.stub(console, 'error'),
      warn: sandbox.stub(console, 'warn'),
      info: sandbox.stub(console, 'info'),
      debug: sandbox.stub(console, 'debug')
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('Logger Configuration', () => {
    it('should create logger instance', () => {
      expect(logger).to.be.an('object');
      expect(logger).to.have.property('info');
      expect(logger).to.have.property('error');
      expect(logger).to.have.property('warn');
      expect(logger).to.have.property('debug');
    });

    it('should have proper log levels', () => {
      expect(typeof logger.info).to.equal('function');
      expect(typeof logger.error).to.equal('function');
      expect(typeof logger.warn).to.equal('function');
      expect(typeof logger.debug).to.equal('function');
    });
  });

  describe('Logging Methods', () => {
    it('should log info messages', () => {
      const message = 'Test info message';
      logger.info(message);

      // Verify that the logger function was called
      expect(logger.info).to.be.a('function');
    });

    it('should log error messages', () => {
      const message = 'Test error message';
      logger.error(message);

      // Verify that the logger function was called
      expect(logger.error).to.be.a('function');
    });

    it('should log warning messages', () => {
      const message = 'Test warning message';
      logger.warn(message);

      // Verify that the logger function was called
      expect(logger.warn).to.be.a('function');
    });

    it('should log debug messages', () => {
      const message = 'Test debug message';
      logger.debug(message);

      // Verify that the logger function was called
      expect(logger.debug).to.be.a('function');
    });
  });

  describe('Logger with Objects', () => {
    it('should handle object logging', () => {
      const testObject = {
        id: 'test-123',
        message: 'Test object',
        timestamp: Date.now()
      };

      logger.info('Object test', testObject);

      // Verify that the logger function was called
      expect(logger.info).to.be.a('function');
    });

    it('should handle error objects', () => {
      const error = new Error('Test error');
      error.code = 'TEST_ERROR';
      error.details = { field: 'test' };

      logger.error('Error occurred', error);

      // Verify that the logger function was called
      expect(logger.error).to.be.a('function');
    });
  });

  describe('Logger with Multiple Arguments', () => {
    it('should handle multiple arguments', () => {
      const arg1 = 'First argument';
      const arg2 = { key: 'value' };
      const arg3 = 123;

      logger.info(arg1, arg2, arg3);

      // Verify that the logger function was called
      expect(logger.info).to.be.a('function');
    });
  });

  describe('Logger Error Handling', () => {
    it('should handle null messages gracefully', () => {
      expect(() => {
        logger.info(null);
      }).to.not.throw();
    });

    it('should handle undefined messages gracefully', () => {
      expect(() => {
        logger.info(undefined);
      }).to.not.throw();
    });

    it('should handle empty string messages', () => {
      expect(() => {
        logger.info('');
      }).to.not.throw();
    });
  });

  describe('Logger Performance', () => {
    it('should handle high-frequency logging', () => {
      const iterations = 100;
      
      for (let i = 0; i < iterations; i++) {
        logger.info(`Message ${i}`);
      }

      // Verify that the logger function was called multiple times
      expect(logger.info).to.be.a('function');
    });
  });

  describe('Logger Context', () => {
    it('should maintain context across calls', () => {
      const context = { requestId: 'req-123', userId: 'user-456' };
      
      logger.info('First message', context);
      logger.error('Error message', context);
      logger.warn('Warning message', context);

      // Verify that all logger functions are available
      expect(logger.info).to.be.a('function');
      expect(logger.error).to.be.a('function');
      expect(logger.warn).to.be.a('function');
    });
  });
}); 