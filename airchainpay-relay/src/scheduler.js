const cron = require('node-cron');
const logger = require('./utils/logger');
const database = require('./utils/database');

class Scheduler {
  constructor() {
    this.tasks = new Map();
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      logger.warn('Scheduler is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting scheduled tasks');

    // Daily backup at 2 AM
    this.scheduleTask('daily-backup', '0 2 * * *', () => {
      this.createDailyBackup();
    });

    // Cleanup old data every 6 hours
    this.scheduleTask('cleanup', '0 */6 * * *', () => {
      this.cleanupOldData();
    });

    // Health check every 5 minutes
    this.scheduleTask('health-check', '*/5 * * * *', () => {
      this.performHealthCheck();
    });

    // Metrics collection every minute
    this.scheduleTask('metrics-collection', '* * * * *', () => {
      this.collectMetrics();
    });

    // BLE status check every 30 seconds
    this.scheduleTask('ble-status-check', '*/30 * * * * *', () => {
      this.checkBLEStatus();
    });

    // Log rotation check every hour
    this.scheduleTask('log-rotation', '0 * * * *', () => {
      this.rotateLogs();
    });

    logger.info('Scheduled tasks started');
  }

  stop() {
    if (!this.isRunning) {
      logger.warn('Scheduler is not running');
      return;
    }

    this.isRunning = false;
    
    // Stop all scheduled tasks
    this.tasks.forEach((task, name) => {
      if (task && task.stop) {
        task.stop();
        logger.info(`Stopped scheduled task: ${name}`);
      }
    });

    this.tasks.clear();
    logger.info('All scheduled tasks stopped');
  }

  scheduleTask(name, cronExpression, taskFunction) {
    try {
      const task = cron.schedule(cronExpression, () => {
        try {
          taskFunction();
        } catch (error) {
          logger.error(`Error in scheduled task ${name}:`, error);
        }
      }, {
        scheduled: false,
        timezone: 'UTC',
      });

      task.start();
      this.tasks.set(name, task);
      
      logger.info(`Scheduled task ${name} with cron expression: ${cronExpression}`);
    } catch (error) {
      logger.error(`Failed to schedule task ${name}:`, error);
    }
  }

  async createDailyBackup() {
    try {
      logger.info('Starting daily backup');
      
      const backupPath = database.createBackup();
      
      // Cleanup old backups (keep only last 7 days)
      database.cleanup();
      
      logger.info(`Daily backup completed: ${backupPath}`);
    } catch (error) {
      logger.error('Daily backup failed:', error);
    }
  }

  async cleanupOldData() {
    try {
      logger.info('Starting data cleanup');
      
      // Cleanup old metrics (keep only last 7 days)
      const metrics = database.getMetrics('7d');
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      // This would be implemented in the database module
      // database.cleanupOldMetrics(cutoff);
      
      // Cleanup old transactions (keep only last 1000)
      const transactions = database.getTransactions(1000);
      // database.cleanupOldTransactions(1000);
      
      logger.info('Data cleanup completed');
    } catch (error) {
      logger.error('Data cleanup failed:', error);
    }
  }

  async performHealthCheck() {
    try {
      const healthData = {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        activeConnections: this.getActiveConnections(),
      };

      // Check if server is healthy
      const isHealthy = this.checkHealthStatus(healthData);
      
      if (!isHealthy) {
        logger.warn('Health check failed', healthData);
        // Could trigger alerts here
      } else {
        logger.debug('Health check passed', healthData);
      }
    } catch (error) {
      logger.error('Health check failed:', error);
    }
  }

  async collectMetrics() {
    try {
      const metrics = {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage().heapUsed,
        cpuUsage: process.cpuUsage().user,
        // Add more metrics as needed
      };

      // Save metrics to database
      database.saveMetrics(metrics);
      
      logger.debug('Metrics collected and saved');
    } catch (error) {
      logger.error('Metrics collection failed:', error);
    }
  }

  async checkBLEStatus() {
    try {
      // This would check BLE manager status
      // const bleStatus = bleManager.getStatus();
      
      // For now, just log that we're checking
      logger.debug('BLE status check performed');
    } catch (error) {
      logger.error('BLE status check failed:', error);
    }
  }

  async rotateLogs() {
    try {
      logger.info('Starting log rotation');
      
      // This would implement log rotation logic
      // Could use winston-daily-rotate-file or similar
      
      logger.info('Log rotation completed');
    } catch (error) {
      logger.error('Log rotation failed:', error);
    }
  }

  getActiveConnections() {
    // This would return the number of active connections
    // Implementation depends on your connection tracking
    return 0;
  }

  checkHealthStatus(healthData) {
    // Basic health checks
    const maxUptime = 30 * 24 * 60 * 60; // 30 days
    const maxMemoryUsage = 1024 * 1024 * 1024; // 1GB
    
    if (healthData.uptime > maxUptime) {
      logger.warn('Server uptime exceeds maximum');
      return false;
    }
    
    if (healthData.memoryUsage.heapUsed > maxMemoryUsage) {
      logger.warn('Memory usage exceeds maximum');
      return false;
    }
    
    return true;
  }

  getTaskStatus() {
    const status = {};
    
    this.tasks.forEach((task, name) => {
      status[name] = {
        running: task && task.running,
        nextRun: task ? task.nextDate() : null,
      };
    });
    
    return status;
  }

  // Manual task execution for testing
  async executeTask(taskName) {
    const taskMap = {
      'daily-backup': () => this.createDailyBackup(),
      'cleanup': () => this.cleanupOldData(),
      'health-check': () => this.performHealthCheck(),
      'metrics-collection': () => this.collectMetrics(),
      'ble-status-check': () => this.checkBLEStatus(),
      'log-rotation': () => this.rotateLogs(),
    };

    const task = taskMap[taskName];
    if (task) {
      logger.info(`Manually executing task: ${taskName}`);
      await task();
    } else {
      logger.error(`Unknown task: ${taskName}`);
    }
  }
}

module.exports = new Scheduler(); 