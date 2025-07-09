const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

class Database {
  constructor() {
    this.dataDir = path.join(__dirname, '../../data');
    this.transactionsFile = path.join(this.dataDir, 'transactions.json');
    this.devicesFile = path.join(this.dataDir, 'devices.json');
    this.metricsFile = path.join(this.dataDir, 'metrics.json');
    this.auditFile = path.join(this.dataDir, 'audit.log');
    this.integrityFile = path.join(this.dataDir, 'integrity.json');
    
    this.initialize();
  }

  initialize() {
    // Create data directory if it doesn't exist
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    // Initialize files if they don't exist
    this.initializeFile(this.transactionsFile, []);
    this.initializeFile(this.devicesFile, {});
    this.initializeFile(this.metricsFile, {});
    this.initializeFile(this.integrityFile, {});
    
    // Verify data integrity on startup
    this.verifyDataIntegrity();
  }

  initializeFile(filePath, defaultValue) {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
      this.updateIntegrityHash(filePath);
    }
  }

  // Data integrity protection
  calculateHash(data) {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  updateIntegrityHash(filePath) {
    try {
      const data = this.readFile(filePath);
      const hash = this.calculateHash(data);
      
      const integrity = this.readFile(this.integrityFile) || {};
      integrity[path.basename(filePath)] = {
        hash,
        lastModified: new Date().toISOString(),
        size: JSON.stringify(data).length
      };
      
      fs.writeFileSync(this.integrityFile, JSON.stringify(integrity, null, 2));
      return true;
    } catch (error) {
      logger.error(`Error updating integrity hash for ${filePath}:`, error);
      return false;
    }
  }

  verifyDataIntegrity() {
    const integrity = this.readFile(this.integrityFile) || {};
    const files = [this.transactionsFile, this.devicesFile, this.metricsFile];
    
    for (const filePath of files) {
      const fileName = path.basename(filePath);
      const storedHash = integrity[fileName]?.hash;
      
      if (storedHash) {
        const data = this.readFile(filePath);
        const currentHash = this.calculateHash(data);
        
        if (currentHash !== storedHash) {
          logger.error(`🚨 DATA INTEGRITY VIOLATION DETECTED: ${fileName}`);
          logger.error(`Expected hash: ${storedHash}`);
          logger.error(`Current hash: ${currentHash}`);
          
          // Log security incident
          this.logSecurityIncident('DATA_INTEGRITY_VIOLATION', {
            file: fileName,
            expectedHash: storedHash,
            currentHash: currentHash,
            timestamp: new Date().toISOString()
          });
          
          // In production, you might want to:
          // 1. Stop the server
          // 2. Restore from backup
          // 3. Alert administrators
          // 4. Block all write operations
        } else {
          logger.info(`✅ Data integrity verified for ${fileName}`);
        }
      }
    }
  }

  // Audit logging
  logSecurityIncident(type, details) {
    const auditEntry = {
      type: 'SECURITY_INCIDENT',
      incidentType: type,
      details,
      timestamp: new Date().toISOString(),
      serverInfo: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        pid: process.pid
      }
    };
    
    const auditLine = JSON.stringify(auditEntry) + '\n';
    fs.appendFileSync(this.auditFile, auditLine);
    
    logger.error(`🚨 SECURITY INCIDENT: ${type}`, details);
  }

  logDataAccess(operation, file, details = {}) {
    const auditEntry = {
      type: 'DATA_ACCESS',
      operation,
      file,
      details,
      timestamp: new Date().toISOString(),
      user: process.env.USER || 'system'
    };
    
    const auditLine = JSON.stringify(auditEntry) + '\n';
    fs.appendFileSync(this.auditFile, auditLine);
  }

  readFile(filePath) {
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(data);
      
      // Log read access
      this.logDataAccess('READ', path.basename(filePath));
      
      return parsed;
    } catch (error) {
      logger.error(`Error reading file ${filePath}:`, error);
      return null;
    }
  }

  writeFile(filePath, data) {
    try {
      // Verify integrity before writing
      this.verifyDataIntegrity();
      
      const jsonData = JSON.stringify(data, null, 2);
      fs.writeFileSync(filePath, jsonData);
      
      // Update integrity hash after writing
      this.updateIntegrityHash(filePath);
      
      // Log write access
      this.logDataAccess('WRITE', path.basename(filePath), {
        dataSize: jsonData.length,
        recordCount: Array.isArray(data) ? data.length : Object.keys(data).length
      });
      
      return true;
    } catch (error) {
      logger.error(`Error writing file ${filePath}:`, error);
      return false;
    }
  }

  // Transaction methods with enhanced security
  saveTransaction(transaction) {
    // Validate transaction data
    if (!this.validateTransactionData(transaction)) {
      this.logSecurityIncident('INVALID_TRANSACTION_DATA', { transaction });
      return false;
    }
    
    const transactions = this.readFile(this.transactionsFile) || [];
    transaction.id = transaction.id || this.generateId();
    transaction.timestamp = transaction.timestamp || new Date().toISOString();
    
    // Add security metadata
    transaction.security = {
      hash: this.calculateHash(transaction),
      createdAt: new Date().toISOString(),
      serverId: process.env.SERVER_ID || 'unknown'
    };
    
    transactions.push(transaction);
    
    // Keep only last 1000 transactions
    if (transactions.length > 1000) {
      transactions.splice(0, transactions.length - 1000);
    }
    
    const success = this.writeFile(this.transactionsFile, transactions);
    
    if (success) {
      logger.info(`Transaction saved: ${transaction.id}`);
    } else {
      this.logSecurityIncident('TRANSACTION_SAVE_FAILED', { transactionId: transaction.id });
    }
    
    return success;
  }

  validateTransactionData(transaction) {
    // Basic validation
    if (!transaction || typeof transaction !== 'object') return false;
    
    // Required fields
    const requiredFields = ['id', 'hash', 'chainId', 'deviceId'];
    for (const field of requiredFields) {
      if (!transaction[field]) return false;
    }
    
    // Validate hash format
    if (!/^0x[a-fA-F0-9]{64}$/.test(transaction.hash)) return false;
    
    // Validate chain ID
    if (!Number.isInteger(transaction.chainId) || transaction.chainId <= 0) return false;
    
    // Validate device ID
    if (typeof transaction.deviceId !== 'string' || transaction.deviceId.length > 100) return false;
    
    return true;
  }

  getTransactions(limit = 100, offset = 0) {
    const transactions = this.readFile(this.transactionsFile) || [];
    return transactions.slice(offset, offset + limit);
  }

  getTransactionById(id) {
    const transactions = this.readFile(this.transactionsFile) || [];
    return transactions.find(tx => tx.id === id);
  }

  getTransactionsByDevice(deviceId, limit = 50) {
    const transactions = this.readFile(this.transactionsFile) || [];
    return transactions
      .filter(tx => tx.deviceId === deviceId)
      .slice(-limit);
  }

  // Device methods with enhanced security
  saveDevice(deviceId, deviceData) {
    // Validate device data
    if (!this.validateDeviceData(deviceId, deviceData)) {
      this.logSecurityIncident('INVALID_DEVICE_DATA', { deviceId, deviceData });
      return false;
    }
    
    const devices = this.readFile(this.devicesFile) || {};
    devices[deviceId] = {
      ...deviceData,
      lastSeen: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      security: {
        hash: this.calculateHash(deviceData),
        lastModified: new Date().toISOString(),
        serverId: process.env.SERVER_ID || 'unknown'
      }
    };
    
    const success = this.writeFile(this.devicesFile, devices);
    
    if (success) {
      logger.info(`Device saved: ${deviceId}`);
    } else {
      this.logSecurityIncident('DEVICE_SAVE_FAILED', { deviceId });
    }
    
    return success;
  }

  validateDeviceData(deviceId, deviceData) {
    // Basic validation
    if (!deviceId || typeof deviceId !== 'string') return false;
    if (!deviceData || typeof deviceData !== 'object') return false;
    
    // Validate device ID format
    if (!/^[a-zA-Z0-9\-_]{1,100}$/.test(deviceId)) return false;
    
    // Validate device data
    if (deviceData.name && typeof deviceData.name !== 'string') return false;
    if (deviceData.status && !['active', 'inactive', 'blocked'].includes(deviceData.status)) return false;
    
    return true;
  }

  getDevice(deviceId) {
    const devices = this.readFile(this.devicesFile) || {};
    return devices[deviceId];
  }

  getAllDevices() {
    return this.readFile(this.devicesFile) || {};
  }

  updateDeviceStatus(deviceId, status) {
    const devices = this.readFile(this.devicesFile) || {};
    if (devices[deviceId]) {
      devices[deviceId] = {
        ...devices[deviceId],
        status,
        lastSeen: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      return this.writeFile(this.devicesFile, devices);
    }
    return false;
  }

  // Metrics methods with enhanced security
  saveMetrics(metrics) {
    // Validate metrics data
    if (!this.validateMetricsData(metrics)) {
      this.logSecurityIncident('INVALID_METRICS_DATA', { metrics });
      return false;
    }
    
    const existingMetrics = this.readFile(this.metricsFile) || {};
    const timestamp = new Date().toISOString();
    
    existingMetrics[timestamp] = {
      ...metrics,
      timestamp,
      security: {
        hash: this.calculateHash(metrics),
        serverId: process.env.SERVER_ID || 'unknown'
      }
    };
    
    // Keep only last 24 hours of metrics
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const filteredMetrics = {};
    
    Object.entries(existingMetrics).forEach(([key, value]) => {
      if (key >= oneDayAgo) {
        filteredMetrics[key] = value;
      }
    });
    
    return this.writeFile(this.metricsFile, filteredMetrics);
  }

  validateMetricsData(metrics) {
    // Basic validation
    if (!metrics || typeof metrics !== 'object') return false;
    
    // Validate numeric fields
    const numericFields = ['transactionsReceived', 'transactionsProcessed', 'uptime', 'memoryUsage'];
    for (const field of numericFields) {
      if (metrics[field] !== undefined && !Number.isFinite(metrics[field])) return false;
    }
    
    return true;
  }

  getMetrics(timeRange = '24h') {
    const metrics = this.readFile(this.metricsFile) || {};
    const now = new Date();
    const timeRanges = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000
    };
    
    const cutoff = new Date(now.getTime() - (timeRanges[timeRange] || timeRanges['24h']));
    
    return Object.entries(metrics)
      .filter(([timestamp]) => new Date(timestamp) >= cutoff)
      .map(([timestamp, data]) => ({ timestamp, ...data }));
  }

  // Utility methods
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Enhanced backup with integrity verification
  createBackup() {
    const backupDir = path.join(this.dataDir, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup-${timestamp}`);
    
    if (!fs.existsSync(backupPath)) {
      fs.mkdirSync(backupPath, { recursive: true });
    }
    
    const files = [this.transactionsFile, this.devicesFile, this.metricsFile, this.integrityFile];
    const backupFiles = [];
    
    files.forEach(file => {
      if (fs.existsSync(file)) {
        const fileName = path.basename(file);
        const backupFile = path.join(backupPath, fileName);
        fs.copyFileSync(file, backupFile);
        backupFiles.push(fileName);
      }
    });
    
    // Create backup integrity file
    const backupIntegrity = {
      timestamp: new Date().toISOString(),
      files: backupFiles,
      serverInfo: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        pid: process.pid
      }
    };
    
    fs.writeFileSync(path.join(backupPath, 'backup-info.json'), JSON.stringify(backupIntegrity, null, 2));
    
    logger.info(`Backup created at ${backupPath} with ${backupFiles.length} files`);
    this.logDataAccess('BACKUP_CREATED', 'backup', { backupPath, files: backupFiles });
    
    return backupPath;
  }

  // Cleanup old data with security logging
  cleanup() {
    // Remove old backups (keep last 7 days)
    const backupDir = path.join(this.dataDir, 'backups');
    if (fs.existsSync(backupDir)) {
      const backups = fs.readdirSync(backupDir)
        .filter(dir => dir.startsWith('backup-'))
        .map(dir => ({
          name: dir,
          path: path.join(backupDir, dir),
          time: fs.statSync(path.join(backupDir, dir)).mtime
        }))
        .sort((a, b) => b.time - a.time);
      
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const oldBackups = backups.filter(backup => backup.time < cutoff);
      
      oldBackups.forEach(backup => {
        try {
          fs.rmSync(backup.path, { recursive: true, force: true });
          logger.info(`Removed old backup: ${backup.name}`);
        } catch (error) {
          logger.error(`Failed to remove old backup ${backup.name}:`, error);
        }
      });
    }
  }

  // Security monitoring methods
  getSecurityStatus() {
    const integrity = this.readFile(this.integrityFile) || {};
    const auditLog = this.getRecentAuditLogs(100);
    
    return {
      dataIntegrity: {
        verified: Object.keys(integrity).length > 0,
        files: Object.keys(integrity),
        lastCheck: new Date().toISOString()
      },
      securityIncidents: auditLog.filter(log => log.type === 'SECURITY_INCIDENT').length,
      recentAccess: auditLog.filter(log => log.type === 'DATA_ACCESS').length,
      auditLogSize: fs.existsSync(this.auditFile) ? fs.statSync(this.auditFile).size : 0
    };
  }

  getRecentAuditLogs(limit = 50) {
    if (!fs.existsSync(this.auditFile)) return [];
    
    try {
      const content = fs.readFileSync(this.auditFile, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      const logs = lines.slice(-limit).map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(log => log !== null);
      
      return logs;
    } catch (error) {
      logger.error('Error reading audit logs:', error);
      return [];
    }
  }
}

module.exports = new Database(); 