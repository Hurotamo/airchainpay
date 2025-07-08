// AirChainPay Relay Server
// Handles receiving signed transactions, broadcasting to blockchain, and fetching contract events

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const config = require('../config/default');
const AIRCHAINPAY_ABI = require('./abi/AirChainPay.json');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const logger = require('./utils/logger');
const { BLEManager } = require('./bluetooth/BLEManager');
const { processTransaction } = require('./processors/TransactionProcessor');
const { validateTransaction } = require('./validators/TransactionValidator');
const { getProvider, getContract } = require('./utils/blockchain');

// Input sanitization utilities
const sanitizeInput = {
  // Sanitize string inputs
  string: (input, maxLength = 1000) => {
    if (typeof input !== 'string') return null;
    return input.trim().substring(0, maxLength).replace(/[<>\"'&]/g, '');
  },

  // Sanitize Ethereum addresses
  address: (input) => {
    if (typeof input !== 'string') return null;
    const clean = input.trim().toLowerCase();
    return /^0x[a-fA-F0-9]{40}$/.test(clean) ? clean : null;
  },

  // Sanitize transaction hashes
  hash: (input) => {
    if (typeof input !== 'string') return null;
    const clean = input.trim();
    return /^0x[a-fA-F0-9]{64}$/.test(clean) ? clean : null;
  },

  // Sanitize chain IDs
  chainId: (input) => {
    const num = parseInt(input);
    return Number.isInteger(num) && num > 0 && num <= 999999 ? num : null;
  },

  // Sanitize device IDs
  deviceId: (input) => {
    if (typeof input !== 'string') return null;
    return input.trim().substring(0, 100).replace(/[^a-zA-Z0-9\-_]/g, '');
  },

  // Sanitize JSON objects
  object: (input, allowedKeys = []) => {
    if (typeof input !== 'object' || input === null) return null;
    const sanitized = {};
    for (const key of allowedKeys) {
      if (input[key] !== undefined) {
        sanitized[key] = input[key];
      }
    }
    return sanitized;
  },

  // Sanitize arrays
  array: (input, maxLength = 100) => {
    if (!Array.isArray(input)) return null;
    return input.slice(0, maxLength);
  },

  // Sanitize numbers
  number: (input, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    const num = parseInt(input);
    return Number.isInteger(num) && num >= min && num <= max ? num : null;
  },

  // Sanitize boolean
  boolean: (input) => {
    if (typeof input === 'boolean') return input;
    if (typeof input === 'string') {
      const lower = input.toLowerCase();
      return lower === 'true' || lower === '1' ? true : 
             lower === 'false' || lower === '0' ? false : null;
    }
    return null;
  }
};

// Input validation middleware
const validateInput = {
  // Validate required fields
  required: (fields) => (req, res, next) => {
    for (const field of fields) {
      if (!req.body[field] && !req.params[field] && !req.query[field]) {
        return res.status(400).json({ 
          error: `Missing required field: ${field}`,
          field: field
        });
      }
    }
    next();
  },

  // Validate field types
  types: (fieldTypes) => (req, res, next) => {
    for (const [field, type] of Object.entries(fieldTypes)) {
      const value = req.body[field] || req.params[field] || req.query[field];
      if (value !== undefined) {
        const sanitized = sanitizeInput[type](value);
        if (sanitized === null) {
          return res.status(400).json({ 
            error: `Invalid type for field: ${field}`,
            field: field,
            expectedType: type
          });
        }
        // Update the request with sanitized value
        if (req.body[field] !== undefined) req.body[field] = sanitized;
        if (req.params[field] !== undefined) req.params[field] = sanitized;
        if (req.query[field] !== undefined) req.query[field] = sanitized;
      }
    }
    next();
  },

  // Validate field lengths
  lengths: (fieldLengths) => (req, res, next) => {
    for (const [field, maxLength] of Object.entries(fieldLengths)) {
      const value = req.body[field] || req.params[field] || req.query[field];
      if (value && typeof value === 'string' && value.length > maxLength) {
        return res.status(400).json({ 
          error: `Field too long: ${field}`,
          field: field,
          maxLength: maxLength
        });
      }
    }
    next();
  },

  // Validate Ethereum addresses
  addresses: (fields) => (req, res, next) => {
    for (const field of fields) {
      const value = req.body[field] || req.params[field] || req.query[field];
      if (value && !sanitizeInput.address(value)) {
        return res.status(400).json({ 
          error: `Invalid Ethereum address: ${field}`,
          field: field
        });
      }
    }
    next();
  },

  // Validate transaction hashes
  hashes: (fields) => (req, res, next) => {
    for (const field of fields) {
      const value = req.body[field] || req.params[field] || req.query[field];
      if (value && !sanitizeInput.hash(value)) {
        return res.status(400).json({ 
          error: `Invalid transaction hash: ${field}`,
          field: field
        });
      }
    }
    next();
  }
};

// SQL injection prevention
const preventSQLInjection = (req, res, next) => {
  const sqlKeywords = [
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
    'UNION', 'EXEC', 'EXECUTE', 'SCRIPT', '--', '/*', '*/', ';'
  ];
  
  const checkValue = (value) => {
    if (typeof value === 'string') {
      const upper = value.toUpperCase();
      for (const keyword of sqlKeywords) {
        if (upper.includes(keyword)) {
          return false;
        }
      }
    }
    return true;
  };

  // Check body
  for (const [key, value] of Object.entries(req.body)) {
    if (!checkValue(value)) {
      return res.status(400).json({ 
        error: 'Invalid input detected',
        field: key
      });
    }
  }

  // Check params
  for (const [key, value] of Object.entries(req.params)) {
    if (!checkValue(value)) {
      return res.status(400).json({ 
        error: 'Invalid input detected',
        field: key
      });
    }
  }

  // Check query
  for (const [key, value] of Object.entries(req.query)) {
    if (!checkValue(value)) {
      return res.status(400).json({ 
        error: 'Invalid input detected',
        field: key
      });
    }
  }

  next();
};

// XSS prevention middleware
const preventXSS = (req, res, next) => {
  const xssPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe/gi,
    /<object/gi,
    /<embed/gi
  ];

  const checkValue = (value) => {
    if (typeof value === 'string') {
      for (const pattern of xssPatterns) {
        if (pattern.test(value)) {
          return false;
        }
      }
    }
    return true;
  };

  // Check body
  for (const [key, value] of Object.entries(req.body)) {
    if (!checkValue(value)) {
      return res.status(400).json({ 
        error: 'XSS attempt detected',
        field: key
      });
    }
  }

  next();
};

// Flag for test mode to bypass actual blockchain calls
const isTestMode = process.env.NODE_ENV === 'test';

const app = express();
const PORT = process.env.PORT || 4000;

// Setup logging
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
const accessLogStream = fs.createWriteStream(path.join(logDir, 'access.log'), { flags: 'a' });
app.use(morgan('combined', { stream: accessLogStream }));
app.use(morgan('dev')); // Console logging for development

// Apply rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later' }
});
app.use(limiter);

// Middleware
app.use(cors());
app.use(express.json());

// Security middleware
app.use(preventSQLInjection);
app.use(preventXSS);
app.use(express.json({ limit: '1mb' })); // Limit JSON payload size

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  
  jwt.verify(token, config.jwtSecret || process.env.JWT_SECRET || 'dev_jwt_secret_placeholder', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

// Health check endpoint to verify server is running
app.get('/health', (req, res) => {
  const bleStatus = getBLEStatus();
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    ble: bleStatus
  });
});

/**
 * Get comprehensive BLE status information
 */
function getBLEStatus() {
  if (!bleManager) {
    return {
      enabled: false,
      initialized: false,
      error: 'BLE Manager not initialized'
    };
  }

  try {
    const connectedDevices = bleManager.connectedDevices ? bleManager.connectedDevices.size : 0;
    const authenticatedDevices = bleManager.authenticatedDevices ? bleManager.authenticatedDevices.size : 0;
    const blockedDevices = bleManager.blockedDevices ? bleManager.blockedDevices.size : 0;
    const blacklistedDevices = bleManager.tempBlacklist ? bleManager.tempBlacklist.size : 0;

    return {
      enabled: true,
      initialized: bleManager.isInitialized(),
      adapterState: noble ? noble.state : 'unknown',
      isAdvertising: bleManager.isAdvertising || false,
      connectedDevices,
      authenticatedDevices,
      blockedDevices,
      blacklistedDevices,
      transactionQueue: bleManager.transactionQueue ? bleManager.transactionQueue.size : 0,
      uptime: process.uptime()
    };
  } catch (error) {
    return {
      enabled: true,
      initialized: false,
      error: error.message
    };
  }
}

// BLE status endpoint for detailed monitoring
app.get('/ble/status', (req, res) => {
  try {
    const status = getBLEStatus();
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting BLE status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// BLE device list endpoint
app.get('/ble/devices', (req, res) => {
  try {
    if (!bleManager || !bleManager.connectedDevices) {
      return res.json({
        success: true,
        data: {
          connected: [],
          authenticated: [],
          blocked: []
        },
        timestamp: new Date().toISOString()
      });
    }

    const connected = Array.from(bleManager.connectedDevices.entries()).map(([id, device]) => ({
      id,
      name: device.name,
      rssi: device.rssi,
      connectedAt: device.connectedAt || Date.now()
    }));

    const authenticated = Array.from(bleManager.authenticatedDevices.entries()).map(([id, auth]) => ({
      id,
      authenticatedAt: auth.authenticatedAt || Date.now(),
      publicKey: auth.publicKey ? '***' : null
    }));

    const blocked = Array.from(bleManager.blockedDevices.entries()).map(([id, block]) => ({
      id,
      blockedAt: block.blockedAt || Date.now(),
      reason: block.reason || 'Authentication failures'
    }));

    res.json({
      success: true,
      data: {
        connected,
        authenticated,
        blocked
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting BLE devices:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Example endpoint: Get contract owner address
app.get('/contract/owner', async (req, res) => {
  try {
    // In test mode, return mock data
    if (isTestMode) {
      return res.json({ owner: '0x1234567890123456789012345678901234567890' });
    }
    
    // Connect to blockchain provider and contract
    const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
    const contract = new ethers.Contract(config.contractAddress, AIRCHAINPAY_ABI, provider);
    const owner = await contract.owner();
    res.json({ owner });
  } catch (err) {
    logger.error('Error fetching contract owner:', err);
    res.status(500).json({ error: err.message });
  }
});

// BLE transaction receiving implementation is handled by BLEManager
// This function is now deprecated in favor of the complete BLE implementation

/**
 * Complete BLE transaction receiving implementation
 * Handles secure transaction processing from BLE devices
 */
async function receiveTxViaBLE(deviceId, transactionData) {
  try {
    logger.info(`[BLE] Received transaction from device: ${deviceId}`, {
      deviceId,
      txId: transactionData?.id,
      hasSignedTx: !!transactionData?.signedTransaction,
      chainId: transactionData?.chainId
    });
    
    // Security: Validate device authentication
    if (bleManager && !bleManager.isDeviceAuthenticated(deviceId)) {
      logger.warn(`[BLE] Unauthenticated device ${deviceId} attempted transaction`);
      return { 
        success: false, 
        error: 'Device not authenticated',
        requiresAuth: true
      };
    }

    // Security: Check if device is blocked
    if (bleManager && bleManager.isDeviceBlocked(deviceId)) {
      logger.warn(`[BLE] Blocked device ${deviceId} attempted transaction`);
      return { 
        success: false, 
        error: 'Device is blocked',
        deviceBlocked: true
      };
    }

    // Validate the transaction data structure
    if (!transactionData || typeof transactionData !== 'object') {
      logger.error(`[BLE] Invalid transaction data format from ${deviceId}`);
      return { success: false, error: 'Invalid transaction data format' };
    }

    // Validate required fields
    if (!transactionData.signedTransaction) {
      logger.error(`[BLE] Missing signedTransaction from ${deviceId}`);
      return { success: false, error: 'Missing signed transaction' };
    }

    if (!transactionData.id) {
      logger.error(`[BLE] Missing transaction ID from ${deviceId}`);
      return { success: false, error: 'Missing transaction ID' };
    }

    // Validate the transaction format using blockchain validator
    const { validateTransaction } = require('./validators/TransactionValidator');
    const validationResult = await validateTransaction(transactionData);
    if (!validationResult.isValid) {
      logger.error(`[BLE] Transaction validation failed for ${deviceId}: ${validationResult.error}`);
      return { success: false, error: validationResult.error };
    }

    // Security: Rate limiting check
    if (bleManager && !bleManager.checkTransactionRateLimit(deviceId)) {
      logger.warn(`[BLE] Transaction rate limit exceeded for device ${deviceId}`);
      return { 
        success: false, 
        error: 'Transaction rate limit exceeded',
        rateLimited: true
      };
    }

    // Process the transaction using the blockchain processor
    const { processTransaction } = require('./processors/TransactionProcessor');
    const result = await processTransaction({
      id: transactionData.id,
      signedTransaction: transactionData.signedTransaction,
      chainId: transactionData.chainId || config.chainId,
      metadata: {
        deviceId,
        source: 'ble',
        timestamp: Date.now()
      }
    });

    logger.info(`[BLE] Transaction processed successfully`, {
      deviceId,
      txId: transactionData.id,
      hash: result.hash,
      blockNumber: result.blockNumber,
      gasUsed: result.gasUsed
    });
    
    // Send success status back to device
    if (bleManager) {
      await bleManager.sendTransactionStatus(deviceId, {
        txId: transactionData.id,
        status: 'success',
        hash: result.hash,
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed,
        timestamp: Date.now()
      });
    }

    // Log successful transaction for audit
    logger.audit('BLE Transaction Success', {
      deviceId,
      txId: transactionData.id,
      hash: result.hash,
      chainId: transactionData.chainId || config.chainId,
      amount: transactionData.amount,
      to: transactionData.to
    });

    return { 
      success: true, 
      hash: result.hash,
      blockNumber: result.blockNumber,
      gasUsed: result.gasUsed,
      timestamp: Date.now()
    };

  } catch (error) {
    logger.error(`[BLE] Error processing transaction from ${deviceId}:`, {
      deviceId,
      txId: transactionData?.id,
      error: error.message,
      stack: error.stack
    });
    
    // Send error status back to device
    if (bleManager && transactionData?.id) {
      try {
        await bleManager.sendTransactionStatus(deviceId, {
          txId: transactionData.id,
          status: 'failed',
          error: error.message,
          timestamp: Date.now()
        });
      } catch (sendError) {
        logger.error(`[BLE] Failed to send error status to device ${deviceId}:`, sendError);
      }
    }

    // Log failed transaction for audit
    logger.audit('BLE Transaction Failed', {
      deviceId,
      txId: transactionData?.id,
      error: error.message,
      chainId: transactionData?.chainId || config.chainId
    });

    return { 
      success: false, 
      error: error.message,
      timestamp: Date.now()
    };
  }
}

// Initialize BLE Manager
let bleManager;
let connectedDevices;
let transactionQueue;

/**
 * Initialize BLE functionality
 */
async function initializeBLE() {
  try {
    bleManager = new BLEManager();
    connectedDevices = new Map();
    transactionQueue = new Map();
    
    await bleManager.initialize();
    logger.info('BLE Manager initialized');

    // Start advertising as a relay node
    await bleManager.startAdvertising();
    logger.info('Started advertising as relay node');

    // Listen for device connections
    bleManager.on('deviceConnected', (device) => {
      logger.info(`Device connected: ${device.id}`);
      connectedDevices.set(device.id, device);
    });

    // Listen for device disconnections
    bleManager.on('deviceDisconnected', (deviceId) => {
      logger.info(`Device disconnected: ${deviceId}`);
      connectedDevices.delete(deviceId);
    });

    // Listen for incoming transactions
    bleManager.on('transactionReceived', async (deviceId, transactionData) => {
      try {
        logger.info(`[BLE] Received transaction from device: ${deviceId}`);
        
        // Use the complete BLE transaction processing function
        const result = await receiveTxViaBLE(deviceId, transactionData);
        
        if (result.success) {
          logger.info(`[BLE] Transaction ${result.hash} processed successfully from ${deviceId}`);
        } else {
          logger.error(`[BLE] Transaction processing failed for ${deviceId}: ${result.error}`);
        }
      } catch (error) {
        logger.error(`[BLE] Error in transaction processing for ${deviceId}:`, error);
      }
    });

    // Listen for device authentication events
    bleManager.on('deviceAuthenticated', (deviceId) => {
      logger.info(`[BLE] Device authenticated: ${deviceId}`);
      logger.audit('BLE Device Authenticated', { deviceId, timestamp: Date.now() });
    });

    bleManager.on('deviceBlocked', (deviceId) => {
      logger.warn(`[BLE] Device blocked: ${deviceId}`);
      logger.audit('BLE Device Blocked', { deviceId, timestamp: Date.now() });
    });

    // Listen for key exchange events
    bleManager.on('keyExchangeCompleted', (deviceId) => {
      logger.info(`[BLE] Key exchange completed for device: ${deviceId}`);
      logger.audit('BLE Key Exchange Completed', { deviceId, timestamp: Date.now() });
    });

    bleManager.on('keyExchangeFailed', (deviceId, error) => {
      logger.error(`[BLE] Key exchange failed for device ${deviceId}:`, error);
      logger.audit('BLE Key Exchange Failed', { deviceId, error: error.message, timestamp: Date.now() });
    });

    // Listen for connection events
    bleManager.on('deviceConnected', (device) => {
      logger.info(`[BLE] Device connected: ${device.id}`, {
        deviceId: device.id,
        name: device.name,
        rssi: device.rssi,
        timestamp: Date.now()
      });
      logger.audit('BLE Device Connected', { 
        deviceId: device.id, 
        name: device.name,
        timestamp: Date.now() 
      });
    });

    bleManager.on('deviceDisconnected', (deviceId) => {
      logger.info(`[BLE] Device disconnected: ${deviceId}`);
      logger.audit('BLE Device Disconnected', { deviceId, timestamp: Date.now() });
    });

    // Listen for DoS protection events
    bleManager.on('deviceBlacklisted', (deviceId, reason) => {
      logger.warn(`[BLE] Device blacklisted: ${deviceId} - ${reason}`);
      logger.audit('BLE Device Blacklisted', { deviceId, reason, timestamp: Date.now() });
    });

    bleManager.on('rateLimitExceeded', (deviceId, type) => {
      logger.warn(`[BLE] Rate limit exceeded for device ${deviceId}: ${type}`);
      logger.audit('BLE Rate Limit Exceeded', { deviceId, type, timestamp: Date.now() });
    });
  } catch (error) {
    logger.error('Failed to initialize BLE:', error);
    // Don't fail the entire server if BLE fails
  }
}

/**
 * Process queued transactions for a device
 */
async function processQueuedTransactions(deviceId) {
  if (!transactionQueue || !connectedDevices) return;
  
  const deviceQueue = transactionQueue.get(deviceId);
  if (!deviceQueue || deviceQueue.length === 0) return;

  const device = connectedDevices.get(deviceId);
  if (!device) {
    logger.warn(`Device ${deviceId} disconnected, keeping transactions in queue`);
    return;
  }

  while (deviceQueue.length > 0) {
    const transaction = deviceQueue[0];
    try {
      // Process the transaction
      const result = await processTransaction(transaction);
      
      // Notify device of success
      if (bleManager) {
        await bleManager.sendTransactionStatus(deviceId, {
          txId: transaction.id,
          status: 'success',
          hash: result.hash
        });
      }

      // Remove processed transaction
      deviceQueue.shift();
    } catch (error) {
      logger.error(`Failed to process transaction:`, error);
      
      // Notify device of failure
      if (bleManager) {
        await bleManager.sendTransactionStatus(deviceId, {
          txId: transaction.id,
          status: 'failed',
          error: error.message
        });
      }

      // Move failed transaction to end of queue for retry
      deviceQueue.push(deviceQueue.shift());
      
      // Break to prevent endless retry loop
      break;
    }
  }
}

// Initialize BLE when server starts (non-blocking)
initializeBLE().catch(error => {
  logger.error('Failed to initialize BLE system:', error);
});

// Submit signed transaction for broadcasting
app.post('/transaction/submit', 
  validateInput.required(['signedTransaction']),
  validateInput.types({ signedTransaction: 'string' }),
  validateInput.lengths({ signedTransaction: 10000 }),
  async (req, res) => {
    try {
      const { signedTransaction, chainId } = req.body;
      
      // Additional validation for signed transaction
      if (!signedTransaction.startsWith('0x')) {
        return res.status(400).json({ error: 'Invalid transaction format' });
      }

      // Validate chain ID if provided
      const validatedChainId = chainId ? sanitizeInput.chainId(chainId) : config.chainId;
      if (!validatedChainId) {
        return res.status(400).json({ error: 'Invalid chain ID' });
      }

      logger.info('Received transaction for processing');
      
      const result = await processTransaction({
        signedTransaction: signedTransaction,
        chainId: validatedChainId
      });

      res.json({
        success: true,
        hash: result.hash,
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed
      });
    } catch (error) {
      logger.error('Transaction processing error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Legacy endpoint for backward compatibility
app.post('/api/v1/submit-transaction', 
  validateInput.required(['signedTransaction', 'chainId']),
  validateInput.types({ signedTransaction: 'string', chainId: 'chainId' }),
  validateInput.lengths({ signedTransaction: 10000 }),
  async (req, res) => {
    try {
      const { signedTransaction, chainId } = req.body;
      
      // Additional validation for signed transaction
      if (!signedTransaction.startsWith('0x')) {
        return res.status(400).json({ error: 'Invalid transaction format' });
      }

      logger.info('Received legacy transaction for processing');
      
      const result = await processTransaction({
        signedTransaction: signedTransaction,
        chainId: chainId
      });

      res.json({
        success: true,
        hash: result.hash,
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed
      });
    } catch (error) {
      logger.error('Legacy transaction processing error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Fetch recent Payment events from the contract
app.get('/contract/payments', async (req, res) => {
  try {
    // In test mode, return mock data
    if (isTestMode) {
      return res.json({ 
        payments: [
          {
            from: '0xsender',
            to: '0xrecipient',
            amount: '1000000000000000000',
            paymentReference: 'test-payment',
            txHash: '0xtxhash',
            blockNumber: 12345
          }
        ] 
      });
    }
    
    const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
    const contract = new ethers.Contract(config.contractAddress, AIRCHAINPAY_ABI, provider);
    // Fetch last 20 Payment events from the last ~2000 blocks
    const filter = contract.filters.Payment();
    const events = await contract.queryFilter(filter, -2000); // last ~2000 blocks
    const formatted = events.slice(-20).map(e => ({
      from: e.args.from,
      to: e.args.to,
      amount: e.args.amount.toString(),
      paymentReference: e.args.paymentReference,
      txHash: e.transactionHash,
      blockNumber: e.blockNumber
    }));
    res.json({ payments: formatted });
  } catch (err) {
    logger.error('Error fetching payments:', err);
    res.status(500).json({ error: err.message });
  }
});

// Generate authentication token
app.post('/auth/token', 
  validateInput.required(['apiKey']),
  validateInput.types({ apiKey: 'string' }),
  validateInput.lengths({ apiKey: 200 }),
  async (req, res) => {
    const { apiKey } = req.body;
    
    if (!apiKey || apiKey !== config.apiKey) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    
    const token = jwt.sign(
      { id: 'api-client', type: 'relay' },
      config.jwtSecret || process.env.JWT_SECRET || 'dev_jwt_secret_placeholder',
      { expiresIn: '24h' }
    );
    
    res.json({ token });
  }
);

// BLE transaction processing endpoint (for testing and manual processing)
app.post('/ble/process-transaction', 
  authenticateToken,
  validateInput.required(['deviceId', 'transactionData']),
  validateInput.types({ deviceId: 'deviceId' }),
  validateInput.lengths({ deviceId: 100 }),
  async (req, res) => {
    try {
      const { deviceId, transactionData } = req.body;
      
      // Validate transaction data structure
      if (!transactionData || typeof transactionData !== 'object') {
        return res.status(400).json({ error: 'Invalid transaction data format' });
      }

      // Validate required transaction fields
      if (!transactionData.signedTransaction || !transactionData.id) {
        return res.status(400).json({ error: 'Missing required transaction fields' });
      }

      // Sanitize transaction ID
      const sanitizedTxId = sanitizeInput.string(transactionData.id, 100);
      if (!sanitizedTxId) {
        return res.status(400).json({ error: 'Invalid transaction ID' });
      }

      // Process the transaction via BLE
      const result = await receiveTxViaBLE(deviceId, {
        ...transactionData,
        id: sanitizedTxId
      });

      res.json(result);
    } catch (error) {
      logger.error('BLE transaction processing error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// BLE status endpoint
app.get('/ble/status', (req, res) => {
  res.json({
    bleInitialized: bleManager && bleManager.isInitialized(),
    isAdvertising: bleManager && bleManager.isAdvertising,
    connectedDevices: connectedDevices ? connectedDevices.size : 0,
    queuedTransactions: transactionQueue ? Array.from(transactionQueue.values())
      .reduce((total, queue) => total + queue.length, 0) : 0
  });
});

// BLE status endpoint with authentication and key exchange info
app.get('/ble/status', (req, res) => {
  const authStats = {
    authenticatedDevices: bleManager ? bleManager.authenticatedDevices.size : 0,
    blockedDevices: bleManager ? bleManager.blockedDevices.size : 0,
    pendingAuth: bleManager ? bleManager.authChallenges.size : 0
  };

  const keyExchangeStats = {
    completedKeyExchange: bleManager ? Array.from(bleManager.keyExchangeState.values())
      .filter(state => state.status === 'COMPLETED').length : 0,
    pendingKeyExchange: bleManager ? Array.from(bleManager.keyExchangeState.values())
      .filter(state => state.status === 'PENDING').length : 0,
    blockedKeyExchange: bleManager ? bleManager.keyExchangeBlocked.size : 0
  };

  res.json({
    bleInitialized: bleManager && bleManager.isInitialized(),
    isAdvertising: bleManager && bleManager.isAdvertising,
    connectedDevices: connectedDevices ? connectedDevices.size : 0,
    queuedTransactions: transactionQueue ? Array.from(transactionQueue.values())
      .reduce((total, queue) => total + queue.length, 0) : 0,
    authentication: authStats,
    keyExchange: keyExchangeStats
  });
});

// Device authentication status endpoint
app.get('/ble/auth/device/:deviceId', 
  validateInput.types({ deviceId: 'deviceId' }),
  validateInput.lengths({ deviceId: 100 }),
  (req, res) => {
    const { deviceId } = req.params;
    
    if (!bleManager) {
      return res.status(503).json({ error: 'BLE manager not available' });
    }

    const authStatus = bleManager.getDeviceAuthStatus(deviceId);
    const isAuthenticated = bleManager.isDeviceAuthenticated(deviceId);
    const isBlocked = bleManager.isDeviceBlocked(deviceId);

    res.json({
      deviceId,
      authStatus,
      isAuthenticated,
      isBlocked,
      timestamp: Date.now()
    });
  }
);

// Authentication management endpoints
app.post('/ble/auth/block/:deviceId', 
  authenticateToken,
  validateInput.types({ deviceId: 'deviceId' }),
  validateInput.lengths({ deviceId: 100 }),
  validateInput.types({ reason: 'string' }),
  validateInput.lengths({ reason: 500 }),
  (req, res) => {
    const { deviceId } = req.params;
    const { reason } = req.body;

    if (!bleManager) {
      return res.status(503).json({ error: 'BLE manager not available' });
    }

    bleManager.blockedDevices.set(deviceId, {
      timestamp: Date.now(),
      reason: reason || 'Manually blocked'
    });

    logger.info(`[BLE] Device manually blocked: ${deviceId}, reason: ${reason}`);
    res.json({ success: true, message: 'Device blocked successfully' });
  }
);

app.post('/ble/auth/unblock/:deviceId', 
  authenticateToken,
  validateInput.types({ deviceId: 'deviceId' }),
  validateInput.lengths({ deviceId: 100 }),
  (req, res) => {
    const { deviceId } = req.params;

    if (!bleManager) {
      return res.status(503).json({ error: 'BLE manager not available' });
    }

    bleManager.blockedDevices.delete(deviceId);
    bleManager.authAttempts.delete(deviceId);

    logger.info(`[BLE] Device manually unblocked: ${deviceId}`);
    res.json({ success: true, message: 'Device unblocked successfully' });
  }
);

app.get('/ble/auth/devices', authenticateToken, (req, res) => {
  if (!bleManager) {
    return res.status(503).json({ error: 'BLE manager not available' });
  }

  const devices = [];
  
  // Get authenticated devices
  for (const [deviceId, authInfo] of bleManager.authenticatedDevices) {
    devices.push({
      deviceId,
      status: 'authenticated',
      authenticatedAt: authInfo.timestamp,
      publicKey: authInfo.publicKey ? 'present' : 'missing',
      sessionKey: authInfo.sessionKey ? 'present' : 'missing'
    });
  }

  // Get blocked devices
  for (const [deviceId, blockInfo] of bleManager.blockedDevices) {
    devices.push({
      deviceId,
      status: 'blocked',
      blockedAt: blockInfo.timestamp,
      reason: blockInfo.reason
    });
  }

  // Get pending authentication devices
  for (const [deviceId, challengeInfo] of bleManager.authChallenges) {
    devices.push({
      deviceId,
      status: 'pending',
      challengeSentAt: challengeInfo.timestamp
    });
  }

  res.json({ devices });
});

// Key exchange status endpoint
app.get('/ble/key-exchange/device/:deviceId', 
  validateInput.types({ deviceId: 'deviceId' }),
  validateInput.lengths({ deviceId: 100 }),
  (req, res) => {
    const { deviceId } = req.params;
    
    if (!bleManager) {
      return res.status(503).json({ error: 'BLE manager not available' });
    }

    const keyExchangeStatus = bleManager.getKeyExchangeStatus(deviceId);
    const isCompleted = bleManager.isKeyExchangeCompleted(deviceId);
    const isBlocked = bleManager.isKeyExchangeBlocked(deviceId);

    res.json({
      deviceId,
      keyExchangeStatus,
      isCompleted,
      isBlocked,
      timestamp: Date.now()
    });
  }
);

// Key exchange management endpoints
app.post('/ble/key-exchange/initiate/:deviceId', 
  authenticateToken,
  validateInput.types({ deviceId: 'deviceId' }),
  validateInput.lengths({ deviceId: 100 }),
  async (req, res) => {
    const { deviceId } = req.params;

    if (!bleManager) {
      return res.status(503).json({ error: 'BLE manager not available' });
    }

    try {
      await bleManager.initiateKeyExchange(deviceId);
      res.json({ success: true, message: 'Key exchange initiated successfully' });
    } catch (error) {
      logger.error(`[BLE] Key exchange initiation failed for device ${deviceId}:`, error);
      res.status(400).json({ error: error.message });
    }
  }
);

app.post('/ble/key-exchange/rotate/:deviceId', 
  authenticateToken,
  validateInput.types({ deviceId: 'deviceId' }),
  validateInput.lengths({ deviceId: 100 }),
  async (req, res) => {
    const { deviceId } = req.params;

    if (!bleManager) {
      return res.status(503).json({ error: 'BLE manager not available' });
    }

    try {
      await bleManager.rotateSessionKey(deviceId);
      res.json({ success: true, message: 'Session key rotation initiated successfully' });
    } catch (error) {
      logger.error(`[BLE] Key rotation failed for device ${deviceId}:`, error);
      res.status(400).json({ error: error.message });
    }
  }
);

app.post('/ble/key-exchange/block/:deviceId', 
  authenticateToken,
  validateInput.types({ deviceId: 'deviceId' }),
  validateInput.lengths({ deviceId: 100 }),
  validateInput.types({ reason: 'string' }),
  validateInput.lengths({ reason: 500 }),
  (req, res) => {
    const { deviceId } = req.params;
    const { reason } = req.body;

    if (!bleManager) {
      return res.status(503).json({ error: 'BLE manager not available' });
    }

    bleManager.keyExchangeBlocked.set(deviceId, {
      timestamp: Date.now(),
      reason: reason || 'Manually blocked from key exchange'
    });

    logger.info(`[BLE] Device blocked from key exchange: ${deviceId}, reason: ${reason}`);
    res.json({ success: true, message: 'Device blocked from key exchange successfully' });
  }
);

app.post('/ble/key-exchange/unblock/:deviceId', 
  authenticateToken,
  validateInput.types({ deviceId: 'deviceId' }),
  validateInput.lengths({ deviceId: 100 }),
  (req, res) => {
    const { deviceId } = req.params;

    if (!bleManager) {
      return res.status(503).json({ error: 'BLE manager not available' });
    }

    bleManager.keyExchangeBlocked.delete(deviceId);
    bleManager.keyExchangeAttempts.delete(deviceId);

    logger.info(`[BLE] Device unblocked from key exchange: ${deviceId}`);
    res.json({ success: true, message: 'Device unblocked from key exchange successfully' });
  }
);

app.get('/ble/key-exchange/devices', authenticateToken, (req, res) => {
  if (!bleManager) {
    return res.status(503).json({ error: 'BLE manager not available' });
  }

  const devices = [];
  
  // Get devices with completed key exchange
  for (const [deviceId, keyState] of bleManager.keyExchangeState) {
    if (keyState.status === 'COMPLETED') {
      devices.push({
        deviceId,
        status: 'completed',
        completedAt: keyState.timestamp,
        sessionKey: 'present'
      });
    }
  }

  // Get devices with pending key exchange
  for (const [deviceId, keyState] of bleManager.keyExchangeState) {
    if (keyState.status === 'PENDING') {
      devices.push({
        deviceId,
        status: 'pending',
        initiatedAt: keyState.timestamp
      });
    }
  }

  // Get devices blocked from key exchange
  for (const [deviceId, blockInfo] of bleManager.keyExchangeBlocked) {
    devices.push({
      deviceId,
      status: 'blocked',
      blockedAt: blockInfo.timestamp,
      reason: blockInfo.reason
    });
  }

  res.json({ devices });
});

// Legacy /tx endpoint (for backward compatibility with tests)
app.post('/tx', (req, res) => {
  res.status(400).json({ error: 'Legacy endpoint not supported' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start the relay server
app.listen(PORT, () => {
  console.log(`AirChainPay Relay Node listening on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Export functions for external use
module.exports = {
  app,
  receiveTxViaBLE,
  initializeBLE,
  processQueuedTransactions,
  AuthStatus: require('./bluetooth/BLEManager').AuthStatus,
  KeyExchangeStatus: require('./bluetooth/BLEManager').KeyExchangeStatus,
  AUTH_CHALLENGE_LENGTH: require('./bluetooth/BLEManager').AUTH_CHALLENGE_LENGTH,
  KEY_EXCHANGE_TIMEOUT: require('./bluetooth/BLEManager').KEY_EXCHANGE_TIMEOUT,
  AUTH_RESPONSE_TIMEOUT: require('./bluetooth/BLEManager').AUTH_RESPONSE_TIMEOUT,
  MAX_AUTH_ATTEMPTS: require('./bluetooth/BLEManager').MAX_AUTH_ATTEMPTS,
  AUTH_BLOCK_DURATION: require('./bluetooth/BLEManager').AUTH_BLOCK_DURATION
};

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
}); 