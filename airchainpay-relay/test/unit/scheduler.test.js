const { expect } = require('chai');
const sinon = require('sinon');

// Mock the scheduler module
const Scheduler = require('../../src/scheduler');

describe('Scheduler Module', () => {
  let scheduler;
  let clock;

  beforeEach(() => {
    scheduler = new Scheduler();
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
    scheduler.stop();
  });

  describe('Scheduler Initialization', () => {
    it('should initialize with empty tasks map', () => {
      expect(scheduler.tasks).to.be.instanceOf(Map);
      expect(scheduler.tasks.size).to.equal(0);
    });

    it('should initialize with isRunning as false', () => {
      expect(scheduler.isRunning).to.be.false;
    });
  });

  describe('Scheduler Start/Stop', () => {
    it('should start scheduler successfully', () => {
      scheduler.start();
      
      expect(scheduler.isRunning).to.be.true;
      expect(scheduler.tasks.size).to.be.greaterThan(0);
    });

    it('should not start scheduler if already running', () => {
      scheduler.start();
      const initialTaskCount = scheduler.tasks.size;
      
      scheduler.start(); // Try to start again
      
      expect(scheduler.tasks.size).to.equal(initialTaskCount);
    });

    it('should stop scheduler successfully', () => {
      scheduler.start();
      expect(scheduler.isRunning).to.be.true;
      
      scheduler.stop();
      
      expect(scheduler.isRunning).to.be.false;
      expect(scheduler.tasks.size).to.equal(0);
    });

    it('should not stop scheduler if not running', () => {
      scheduler.stop(); // Should not throw error
      expect(scheduler.isRunning).to.be.false;
    });
  });

  describe('Task Scheduling', () => {
    it('should schedule a task successfully', () => {
      const taskFunction = sinon.stub();
      const cronExpression = '*/1 * * * * *'; // Every second
      
      scheduler.scheduleTask('test-task', cronExpression, taskFunction);
      
      expect(scheduler.tasks.has('test-task')).to.be.true;
      expect(scheduler.tasks.get('test-task')).to.be.an('object');
    });

    it('should handle task scheduling errors', () => {
      const taskFunction = sinon.stub();
      const invalidCronExpression = 'invalid-cron';
      
      // Should not throw error
      expect(() => {
        scheduler.scheduleTask('test-task', invalidCronExpression, taskFunction);
      }).to.not.throw();
    });

    it('should execute scheduled tasks', () => {
      const taskFunction = sinon.stub();
      const cronExpression = '*/1 * * * * *'; // Every second
      
      scheduler.scheduleTask('test-task', cronExpression, taskFunction);
      
      // Advance time to trigger task
      clock.tick(1000);
      
      expect(taskFunction.called).to.be.true;
    });

    it('should handle task execution errors', () => {
      const taskFunction = sinon.stub().throws(new Error('Task error'));
      const cronExpression = '*/1 * * * * *';
      
      scheduler.scheduleTask('test-task', cronExpression, taskFunction);
      
      // Should not throw error when task fails
      expect(() => {
        clock.tick(1000);
      }).to.not.throw();
    });
  });

  describe('Task Status', () => {
    it('should return task status', () => {
      const taskFunction = sinon.stub();
      scheduler.scheduleTask('test-task', '*/1 * * * * *', taskFunction);
      
      const status = scheduler.getTaskStatus();
      
      expect(status).to.have.property('test-task');
      expect(status['test-task']).to.have.property('running');
      expect(status['test-task']).to.have.property('nextRun');
    });
  });

  describe('Manual Task Execution', () => {
    it('should execute daily backup task', async () => {
      const createBackupStub = sinon.stub(scheduler, 'createDailyBackup');
      const cleanupStub = sinon.stub(scheduler, 'cleanupOldData');
      
      await scheduler.executeTask('daily-backup');
      
      expect(createBackupStub.called).to.be.true;
    });

    it('should execute cleanup task', async () => {
      const cleanupStub = sinon.stub(scheduler, 'cleanupOldData');
      
      await scheduler.executeTask('cleanup');
      
      expect(cleanupStub.called).to.be.true;
    });

    it('should execute health check task', async () => {
      const healthCheckStub = sinon.stub(scheduler, 'performHealthCheck');
      
      await scheduler.executeTask('health-check');
      
      expect(healthCheckStub.called).to.be.true;
    });

    it('should execute metrics collection task', async () => {
      const metricsStub = sinon.stub(scheduler, 'collectMetrics');
      
      await scheduler.executeTask('metrics-collection');
      
      expect(metricsStub.called).to.be.true;
    });

    it('should execute BLE status check task', async () => {
      const bleStub = sinon.stub(scheduler, 'checkBLEStatus');
      
      await scheduler.executeTask('ble-status-check');
      
      expect(bleStub.called).to.be.true;
    });

    it('should execute log rotation task', async () => {
      const logRotationStub = sinon.stub(scheduler, 'rotateLogs');
      
      await scheduler.executeTask('log-rotation');
      
      expect(logRotationStub.called).to.be.true;
    });

    it('should handle unknown task', async () => {
      const loggerStub = sinon.stub(console, 'error');
      
      await scheduler.executeTask('unknown-task');
      
      expect(loggerStub.called).to.be.true;
      
      console.error.restore();
    });
  });

  describe('Health Check', () => {
    it('should perform health check successfully', async () => {
      const healthData = await scheduler.performHealthCheck();
      
      expect(healthData).to.have.property('timestamp');
      expect(healthData).to.have.property('uptime');
      expect(healthData).to.have.property('memoryUsage');
      expect(healthData).to.have.property('cpuUsage');
      expect(healthData).to.have.property('activeConnections');
    });

    it('should check health status correctly', () => {
      const healthyData = {
        uptime: 1000,
        memoryUsage: { heapUsed: 1024 * 1024 } // 1MB
      };
      
      const isHealthy = scheduler.checkHealthStatus(healthyData);
      expect(isHealthy).to.be.true;
    });

    it('should detect unhealthy status for high memory usage', () => {
      const unhealthyData = {
        uptime: 1000,
        memoryUsage: { heapUsed: 2 * 1024 * 1024 * 1024 } // 2GB
      };
      
      const isHealthy = scheduler.checkHealthStatus(unhealthyData);
      expect(isHealthy).to.be.false;
    });

    it('should detect unhealthy status for high uptime', () => {
      const unhealthyData = {
        uptime: 31 * 24 * 60 * 60, // 31 days
        memoryUsage: { heapUsed: 1024 * 1024 }
      };
      
      const isHealthy = scheduler.checkHealthStatus(unhealthyData);
      expect(isHealthy).to.be.false;
    });
  });

  describe('Metrics Collection', () => {
    it('should collect metrics successfully', async () => {
      const metrics = await scheduler.collectMetrics();
      
      expect(metrics).to.have.property('timestamp');
      expect(metrics).to.have.property('uptime');
      expect(metrics).to.have.property('memoryUsage');
      expect(metrics).to.have.property('cpuUsage');
    });
  });

  describe('BLE Status Check', () => {
    it('should check BLE status successfully', async () => {
      // This would be implemented when BLE manager is available
      await scheduler.checkBLEStatus();
      // Should not throw error
    });
  });

  describe('Log Rotation', () => {
    it('should rotate logs successfully', async () => {
      await scheduler.rotateLogs();
      // Should not throw error
    });
  });

  describe('Active Connections', () => {
    it('should return active connections count', () => {
      const count = scheduler.getActiveConnections();
      expect(count).to.be.a('number');
      expect(count).to.be.at.least(0);
    });
  });

  describe('Scheduled Tasks Configuration', () => {
    it('should have correct cron expressions for tasks', () => {
      const expectedTasks = [
        'daily-backup',
        'cleanup',
        'health-check',
        'metrics-collection',
        'ble-status-check',
        'log-rotation'
      ];
      
      scheduler.start();
      
      expectedTasks.forEach(taskName => {
        expect(scheduler.tasks.has(taskName)).to.be.true;
      });
    });
  });
}); 