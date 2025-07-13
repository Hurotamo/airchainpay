require('dotenv').config();
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
const noble = require('@abandonware/noble');

// Database integration
const database = require('./utils/database');

// Swagger/OpenAPI documentation
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');

// Metrics collection
const metrics = {
  // Transaction metrics
  transactionsReceived: 0,
  transactionsProcessed: 0,
  transactionsFailed: 0,
  transactionsBroadcasted: 0,
  
  // BLE metrics
  bleConnections: 0,
  bleDisconnections: 0,
  bleAuthentications: 0,
  bleKeyExchanges: 0,
  
  // Blockchain metrics
  rpcErrors: 0,
  gasPriceUpdates: 0,
  contractEvents: 0,
  
  // Security metrics
  authFailures: 0,
  rateLimitHits: 0,
  blockedDevices: 0,
  
  // System metrics
  uptime: 0,
  memoryUsage: 0,
  cpuUsage: 0,
  
  // Reset function
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
  },
};

// Update system metrics periodically
setInterval(() => {
  metrics.uptime = process.uptime();
  metrics.memoryUsage = process.memoryUsage().heapUsed;
  metrics.cpuUsage = process.cpuUsage().user;
}, 5000);

// Input sanitization utilities
const sanitizeInput = {
  // Sanitize string inputs
  string: (input, maxLength = 1000) => {
    if (typeof input !== 'string') return null;
    return input.trim().substring(0, maxLength).replace(/[<>"'&]/g, '');
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
  },
};

// Input validation middleware
const validateInput = {
  // Validate required fields
  required: (fields) => (req, res, next) => {
    for (const field of fields) {
      if (!req.body[field] && !req.params[field] && !req.query[field]) {
        return res.status(400).json({ 
          error: `Missing required field: ${field}`,
          field: field,
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
            expectedType: type,
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
          maxLength: maxLength,
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
          field: field,
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
          field: field,
        });
      }
    }
    next();
  },
};

// SQL injection prevention
const preventSQLInjection = (req, res, next) => {
  const sqlKeywords = [
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
    'UNION', 'EXEC', 'EXECUTE', 'SCRIPT', '--', '/*', '*/', ';',
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
        field: key,
      });
    }
  }

  // Check params
  for (const [key, value] of Object.entries(req.params)) {
    if (!checkValue(value)) {
      return res.status(400).json({ 
        error: 'Invalid input detected',
        field: key,
      });
    }
  }

  // Check query
  for (const [key, value] of Object.entries(req.query)) {
    if (!checkValue(value)) {
      return res.status(400).json({ 
        error: 'Invalid input detected',
        field: key,
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
    /<embed/gi,
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
        field: key,
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

// Apply comprehensive rate limiting
const rateLimiters = {
  // Global rate limiter
  global: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 1000 requests per windowMs
    message: {
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes',
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      metrics.rateLimitHits++;
      res.status(429).json({
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes',
        timestamp: new Date().toISOString(),
      });
    },
  }),

  // Strict rate limiter for authentication endpoints
  auth: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: {
      error: 'Too many authentication attempts, please try again later.',
      retryAfter: '15 minutes',
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      metrics.rateLimitHits++;
      metrics.authFailures++;
      res.status(429).json({
        error: 'Too many authentication attempts, please try again later.',
        retryAfter: '15 minutes',
        timestamp: new Date().toISOString(),
      });
    },
  }),

  // Transaction submission rate limiter
  transactions: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 50, // limit each IP to 50 requests per windowMs
    message: {
      error: 'Too many transaction submissions, please try again later.',
      retryAfter: '1 minute',
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      metrics.rateLimitHits++;
      res.status(429).json({
        error: 'Too many transaction submissions, please try again later.',
        retryAfter: '1 minute',
        timestamp: new Date().toISOString(),
      });
    },
  }),

  // BLE endpoint rate limiter
  ble: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      error: 'Too many BLE requests, please try again later.',
      retryAfter: '1 minute',
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      metrics.rateLimitHits++;
      res.status(429).json({
        error: 'Too many BLE requests, please try again later.',
        retryAfter: '1 minute',
        timestamp: new Date().toISOString(),
      });
    },
  }),

  // Health check rate limiter (more permissive)
  health: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 300, // limit each IP to 300 requests per windowMs
    message: {
      error: 'Too many health check requests, please try again later.',
      retryAfter: '1 minute',
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      metrics.rateLimitHits++;
      res.status(429).json({
        error: 'Too many health check requests, please try again later.',
        retryAfter: '1 minute',
        timestamp: new Date().toISOString(),
      });
    },
  }),

  // Metrics endpoint rate limiter
  metrics: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // limit each IP to 60 requests per windowMs
    message: {
      error: 'Too many metrics requests, please try again later.',
      retryAfter: '1 minute',
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      metrics.rateLimitHits++;
      res.status(429).json({
        error: 'Too many metrics requests, please try again later.',
        retryAfter: '1 minute',
        timestamp: new Date().toISOString(),
      });
    },
  }),
};

// Apply global rate limiting
app.use(rateLimiters.global);

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

// Swagger UI endpoint for API documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'AirChainPay Relay API Documentation',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    docExpansion: 'list',
    filter: true,
    showRequestHeaders: true,
    showCommonExtensions: true,
  },
}));

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Get server health status
 *     description: Returns comprehensive health information including BLE status and metrics
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server health information
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthStatus'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get('/health', rateLimiters.health, (req, res) => {
  const bleStatus = getBLEStatus();
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    ble: bleStatus,
    metrics: {
      transactions: {
        received: metrics.transactionsReceived,
        processed: metrics.transactionsProcessed,
        failed: metrics.transactionsFailed,
        broadcasted: metrics.transactionsBroadcasted,
      },
      ble: {
        connections: metrics.bleConnections,
        disconnections: metrics.bleDisconnections,
        authentications: metrics.bleAuthentications,
        keyExchanges: metrics.bleKeyExchanges,
      },
      system: {
        uptime: metrics.uptime,
        memoryUsage: metrics.memoryUsage,
        cpuUsage: metrics.cpuUsage,
      },
    },
  });
});

/**
 * @swagger
 * /metrics:
 *   get:
 *     summary: Get Prometheus metrics
 *     description: Returns server metrics in Prometheus format for monitoring
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Prometheus metrics
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: |
 *                 # HELP airchainpay_transactions_received_total Total number of transactions received
 *                 # TYPE airchainpay_transactions_received_total counter
 *                 airchainpay_transactions_received_total 5
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get('/metrics', rateLimiters.metrics, (req, res) => {
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
    `airchainpay_cpu_usage_microseconds ${metrics.cpuUsage}`,
  ].join('\n');
  
  res.set('Content-Type', 'text/plain');
  res.send(prometheusMetrics);
});

/**
 * Get comprehensive BLE status information
 */
function getBLEStatus() {
  if (!bleManager) {
    return {
      enabled: false,
      initialized: false,
      error: 'BLE Manager not initialized',
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
      uptime: process.uptime(),
    };
  } catch (error) {
    return {
      enabled: true,
      initialized: false,
      error: error.message,
    };
  }
}

// BLE status endpoint for detailed monitoring
app.get('/ble/status', rateLimiters.ble, (req, res) => {
  try {
    const status = getBLEStatus();
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error getting BLE status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// BLE device list endpoint
app.get('/ble/devices', rateLimiters.ble, (req, res) => {
  try {
    if (!bleManager || !bleManager.connectedDevices) {
      return res.json({
        success: true,
        data: {
          connected: [],
          authenticated: [],
          blocked: [],
        },
        timestamp: new Date().toISOString(),
      });
    }

    const connected = Array.from(bleManager.connectedDevices.entries()).map(([id, device]) => ({
      id,
      name: device.name,
      rssi: device.rssi,
      connectedAt: device.connectedAt || Date.now(),
    }));

    const authenticated = Array.from(bleManager.authenticatedDevices.entries()).map(([id, auth]) => ({
      id,
      authenticatedAt: auth.authenticatedAt || Date.now(),
      publicKey: auth.publicKey ? '***' : null,
    }));

    const blocked = Array.from(bleManager.blockedDevices.entries()).map(([id, block]) => ({
      id,
      blockedAt: block.blockedAt || Date.now(),
      reason: block.reason || 'Authentication failures',
    }));

    res.json({
      success: true,
      data: {
        connected,
        authenticated,
        blocked,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error getting BLE devices:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
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
 * Handles secure transaction processing from BLE devices with multi-chain support
 */
async function receiveTxViaBLE(deviceId, transactionData) {
  try {
    logger.info(`[BLE] Received transaction from device: ${deviceId}`, {
      deviceId,
      txId: transactionData?.id,
      hasSignedTx: !!transactionData?.signedTransaction,
      chainId: transactionData?.chainId,
    });
    
    // Security: Validate device authentication
    if (bleManager && !bleManager.isDeviceAuthenticated(deviceId)) {
      logger.warn(`[BLE] Unauthenticated device ${deviceId} attempted transaction`);
      return { 
        success: false, 
        error: 'Device not authenticated',
        requiresAuth: true,
      };
    }

    // Security: Check if device is blocked
    if (bleManager && bleManager.isDeviceBlocked(deviceId)) {
      logger.warn(`[BLE] Blocked device ${deviceId} attempted transaction`);
      return { 
        success: false, 
        error: 'Device is blocked',
        deviceBlocked: true,
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

    // Multi-chain support: Validate and determine chain ID
    let targetChainId = transactionData.chainId;
    
    // If no chainId provided, use default (Base Sepolia)
    if (!targetChainId) {
      targetChainId = 84532; // Default to Base Sepolia
      logger.info(`[BLE] No chainId provided, defaulting to Base Sepolia (84532) for device ${deviceId}`);
    }

    // Validate chain ID is supported
    const supportedChains = [84532, 1114]; // Base Sepolia, Core Testnet 2
    if (!supportedChains.includes(parseInt(targetChainId))) {
      logger.error(`[BLE] Unsupported chain ID ${targetChainId} from device ${deviceId}`);
      return { 
        success: false, 
        error: `Unsupported chain ID: ${targetChainId}. Supported chains: ${supportedChains.join(', ')}`,
      };
    }

    // Get network info for logging
    const networkInfo = {
      84532: 'Base Sepolia',
      1114: 'Core Testnet 2',
    };
    
    logger.info(`[BLE] Processing transaction for ${networkInfo[targetChainId]} (${targetChainId}) from device ${deviceId}`);

    // Validate the transaction format using blockchain validator
    const { validateTransaction } = require('./validators/TransactionValidator');
    const validationResult = await validateTransaction({
      ...transactionData,
      chainId: targetChainId,
    });
    
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
        rateLimited: true,
      };
    }

    // Process the transaction using the blockchain processor with specific chain ID
    const { processTransaction } = require('./processors/TransactionProcessor');
    const result = await processTransaction({
      id: transactionData.id,
      signedTransaction: transactionData.signedTransaction,
      chainId: targetChainId,
      metadata: {
        deviceId,
        source: 'ble',
        network: networkInfo[targetChainId],
        timestamp: Date.now(),
      },
    }, metrics);

    // Save transaction to database
    const transactionRecord = {
      id: transactionData.id,
      hash: result.hash,
      chainId: targetChainId,
      network: networkInfo[targetChainId],
      deviceId: deviceId,
      source: 'ble',
      status: 'confirmed',
      blockNumber: result.blockNumber,
      gasUsed: result.gasUsed,
      timestamp: new Date().toISOString(),
      metadata: {
        amount: transactionData.amount,
        to: transactionData.to,
        from: transactionData.from,
      },
    };
    
    database.saveTransaction(transactionRecord);
    
    // Update device information
    database.saveDevice(deviceId, {
      name: `BLE Device ${deviceId}`,
      lastTransaction: transactionRecord.id,
      lastTransactionTime: transactionRecord.timestamp,
      status: 'active',
      capabilities: ['ble', 'transactions'],
    });

    logger.info(`[BLE] Transaction processed successfully on ${networkInfo[targetChainId]}`, {
      deviceId,
      txId: transactionData.id,
      chainId: targetChainId,
      network: networkInfo[targetChainId],
      hash: result.hash,
      blockNumber: result.blockNumber,
      gasUsed: result.gasUsed,
    });
    
    // Send success status back to device
    if (bleManager) {
      await bleManager.sendTransactionStatus(deviceId, {
        txId: transactionData.id,
        status: 'success',
        chainId: targetChainId,
        network: networkInfo[targetChainId],
        hash: result.hash,
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed,
        timestamp: Date.now(),
      });
    }

    // Log successful transaction for audit
    logger.audit('BLE Transaction Success', {
      deviceId,
      txId: transactionData.id,
      hash: result.hash,
      chainId: targetChainId,
      network: networkInfo[targetChainId],
      amount: transactionData.amount,
      to: transactionData.to,
    });

    return { 
      success: true, 
      chainId: targetChainId,
      network: networkInfo[targetChainId],
      hash: result.hash,
      blockNumber: result.blockNumber,
      gasUsed: result.gasUsed,
      timestamp: Date.now(),
    };

  } catch (error) {
    logger.error(`[BLE] Error processing transaction from ${deviceId}:`, {
      deviceId,
      txId: transactionData?.id,
      chainId: transactionData?.chainId,
      error: error.message,
      stack: error.stack,
    });
    
    // Send error status back to device
    if (bleManager && transactionData?.id) {
      try {
        await bleManager.sendTransactionStatus(deviceId, {
          txId: transactionData.id,
          status: 'failed',
          error: error.message,
          timestamp: Date.now(),
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
      chainId: transactionData?.chainId,
    });

    return { 
      success: false, 
      error: error.message,
      timestamp: Date.now(),
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
        timestamp: Date.now(),
      });
      logger.audit('BLE Device Connected', { 
        deviceId: device.id, 
        name: device.name,
        timestamp: Date.now(), 
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
      const result = await processTransaction(transaction, metrics);
      
      // Notify device of success
      if (bleManager) {
        await bleManager.sendTransactionStatus(deviceId, {
          txId: transaction.id,
          status: 'success',
          hash: result.hash,
        });
      }

      // Remove processed transaction
      deviceQueue.shift();
    } catch (error) {
      logger.error('Failed to process transaction:', error);
      
      // Notify device of failure
      if (bleManager) {
        await bleManager.sendTransactionStatus(deviceId, {
          txId: transaction.id,
          status: 'failed',
          error: error.message,
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
app.post('/transaction/submit', rateLimiters.transactions, 
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
        chainId: validatedChainId,
      }, metrics);

      res.json({
        success: true,
        hash: result.hash,
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed,
      });
    } catch (error) {
      logger.error('Transaction processing error:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

// Legacy endpoint for backward compatibility
app.post('/api/v1/submit-transaction', rateLimiters.transactions, 
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
        chainId: chainId,
      }, metrics);

      res.json({
        success: true,
        hash: result.hash,
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed,
      });
    } catch (error) {
      logger.error('Legacy transaction processing error:', error);
      res.status(500).json({ error: error.message });
    }
  },
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
            blockNumber: 12345,
          },
        ], 
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
      blockNumber: e.blockNumber,
    }));
    res.json({ payments: formatted });
  } catch (err) {
    logger.error('Error fetching payments:', err);
    res.status(500).json({ error: err.message });
  }
});

// Generate authentication token
app.post('/auth/token', rateLimiters.auth,
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
      { expiresIn: '24h' },
    );
    
    res.json({ token });
  },
);

// BLE transaction processing endpoint (for testing and manual processing)
app.post('/ble/process-transaction', rateLimiters.ble,
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
        id: sanitizedTxId,
      });

      res.json(result);
    } catch (error) {
      logger.error('BLE transaction processing error:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

// BLE status endpoint
app.get('/ble/status', (req, res) => {
  res.json({
    bleInitialized: bleManager && bleManager.isInitialized(),
    isAdvertising: bleManager && bleManager.isAdvertising,
    connectedDevices: connectedDevices ? connectedDevices.size : 0,
    queuedTransactions: transactionQueue ? Array.from(transactionQueue.values())
      .reduce((total, queue) => total + queue.length, 0) : 0,
  });
});

// BLE status endpoint with authentication and key exchange info
app.get('/ble/status', (req, res) => {
  const authStats = {
    authenticatedDevices: bleManager ? bleManager.authenticatedDevices.size : 0,
    blockedDevices: bleManager ? bleManager.blockedDevices.size : 0,
    pendingAuth: bleManager ? bleManager.authChallenges.size : 0,
  };

  const keyExchangeStats = {
    completedKeyExchange: bleManager ? Array.from(bleManager.keyExchangeState.values())
      .filter(state => state.status === 'COMPLETED').length : 0,
    pendingKeyExchange: bleManager ? Array.from(bleManager.keyExchangeState.values())
      .filter(state => state.status === 'PENDING').length : 0,
    blockedKeyExchange: bleManager ? bleManager.keyExchangeBlocked.size : 0,
  };

  res.json({
    bleInitialized: bleManager && bleManager.isInitialized(),
    isAdvertising: bleManager && bleManager.isAdvertising,
    connectedDevices: connectedDevices ? connectedDevices.size : 0,
    queuedTransactions: transactionQueue ? Array.from(transactionQueue.values())
      .reduce((total, queue) => total + queue.length, 0) : 0,
    authentication: authStats,
    keyExchange: keyExchangeStats,
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
      timestamp: Date.now(),
    });
  },
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
      reason: reason || 'Manually blocked',
    });

    logger.info(`[BLE] Device manually blocked: ${deviceId}, reason: ${reason}`);
    res.json({ success: true, message: 'Device blocked successfully' });
  },
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
  },
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
      sessionKey: authInfo.sessionKey ? 'present' : 'missing',
    });
  }

  // Get blocked devices
  for (const [deviceId, blockInfo] of bleManager.blockedDevices) {
    devices.push({
      deviceId,
      status: 'blocked',
      blockedAt: blockInfo.timestamp,
      reason: blockInfo.reason,
    });
  }

  // Get pending authentication devices
  for (const [deviceId, challengeInfo] of bleManager.authChallenges) {
    devices.push({
      deviceId,
      status: 'pending',
      challengeSentAt: challengeInfo.timestamp,
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
      timestamp: Date.now(),
    });
  },
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
  },
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
  },
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
      reason: reason || 'Manually blocked from key exchange',
    });

    logger.info(`[BLE] Device blocked from key exchange: ${deviceId}, reason: ${reason}`);
    res.json({ success: true, message: 'Device blocked from key exchange successfully' });
  },
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
  },
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
        sessionKey: 'present',
      });
    }
  }

  // Get devices with pending key exchange
  for (const [deviceId, keyState] of bleManager.keyExchangeState) {
    if (keyState.status === 'PENDING') {
      devices.push({
        deviceId,
        status: 'pending',
        initiatedAt: keyState.timestamp,
      });
    }
  }

  // Get devices blocked from key exchange
  for (const [deviceId, blockInfo] of bleManager.keyExchangeBlocked) {
    devices.push({
      deviceId,
      status: 'blocked',
      blockedAt: blockInfo.timestamp,
      reason: blockInfo.reason,
    });
  }

  res.json({ devices });
});

// ============================================================================
// DATABASE API ENDPOINTS
// ============================================================================

// Get all transactions with pagination
app.get('/api/database/transactions', 
  authenticateToken,
  validateInput.types({ limit: 'number', offset: 'number' }),
  (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;
      
      const transactions = database.getTransactions(limit, offset);
      const total = database.getTransactions(10000).length; // Get total count
      
      res.json({
        success: true,
        data: {
          transactions,
          pagination: {
            limit,
            offset,
            total,
            hasMore: offset + limit < total,
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching transactions:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

// Get transaction by ID
app.get('/api/database/transactions/:id',
  authenticateToken,
  validateInput.types({ id: 'string' }),
  (req, res) => {
    try {
      const { id } = req.params;
      const transaction = database.getTransactionById(id);
      
      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }
      
      res.json({
        success: true,
        data: transaction,
      });
    } catch (error) {
      logger.error('Error fetching transaction:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

// Get transactions by device
app.get('/api/database/transactions/device/:deviceId',
  authenticateToken,
  validateInput.types({ deviceId: 'deviceId' }),
  validateInput.types({ limit: 'number' }),
  (req, res) => {
    try {
      const { deviceId } = req.params;
      const limit = parseInt(req.query.limit) || 50;
      
      const transactions = database.getTransactionsByDevice(deviceId, limit);
      
      res.json({
        success: true,
        data: {
          deviceId,
          transactions,
          count: transactions.length,
        },
      });
    } catch (error) {
      logger.error('Error fetching device transactions:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

// Get all devices
app.get('/api/database/devices',
  authenticateToken,
  (req, res) => {
    try {
      const devices = database.getAllDevices();
      
      res.json({
        success: true,
        data: {
          devices,
          count: Object.keys(devices).length,
        },
      });
    } catch (error) {
      logger.error('Error fetching devices:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

// Get device by ID
app.get('/api/database/devices/:deviceId',
  authenticateToken,
  validateInput.types({ deviceId: 'deviceId' }),
  (req, res) => {
    try {
      const { deviceId } = req.params;
      const device = database.getDevice(deviceId);
      
      if (!device) {
        return res.status(404).json({ error: 'Device not found' });
      }
      
      res.json({
        success: true,
        data: device,
      });
    } catch (error) {
      logger.error('Error fetching device:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

// Update device status
app.put('/api/database/devices/:deviceId/status',
  authenticateToken,
  validateInput.types({ deviceId: 'deviceId' }),
  validateInput.types({ status: 'string' }),
  (req, res) => {
    try {
      const { deviceId } = req.params;
      const { status } = req.body;
      
      const success = database.updateDeviceStatus(deviceId, status);
      
      if (!success) {
        return res.status(404).json({ error: 'Device not found' });
      }
      
      res.json({
        success: true,
        message: 'Device status updated successfully',
      });
    } catch (error) {
      logger.error('Error updating device status:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

// Get metrics with time range
app.get('/api/database/metrics',
  authenticateToken,
  validateInput.types({ timeRange: 'string' }),
  (req, res) => {
    try {
      const timeRange = req.query.timeRange || '24h';
      const metrics = database.getMetrics(timeRange);
      
      res.json({
        success: true,
        data: {
          timeRange,
          metrics,
          count: metrics.length,
        },
      });
    } catch (error) {
      logger.error('Error fetching metrics:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

// Create database backup
app.post('/api/database/backup',
  authenticateToken,
  (req, res) => {
    try {
      const backupPath = database.createBackup();
      
      res.json({
        success: true,
        data: {
          backupPath,
          message: 'Backup created successfully',
        },
      });
    } catch (error) {
      logger.error('Error creating backup:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

// Get database statistics
app.get('/api/database/stats',
  authenticateToken,
  (req, res) => {
    try {
      const transactions = database.getTransactions(10000);
      const devices = database.getAllDevices();
      const metrics = database.getMetrics('24h');
      
      const stats = {
        transactions: {
          total: transactions.length,
          recent: transactions.slice(-10).length,
          byChain: transactions.reduce((acc, tx) => {
            const chain = tx.chainId || 'unknown';
            acc[chain] = (acc[chain] || 0) + 1;
            return acc;
          }, {}),
        },
        devices: {
          total: Object.keys(devices).length,
          active: Object.values(devices).filter(d => d.status === 'active').length,
          inactive: Object.values(devices).filter(d => d.status === 'inactive').length,
        },
        metrics: {
          total: metrics.length,
          timeRange: '24h',
        },
        storage: {
          dataDirectory: database.dataDir,
          backupDirectory: path.join(database.dataDir, 'backups'),
        },
      };
      
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Error fetching database stats:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

// Get database security status
app.get('/api/database/security',
  authenticateToken,
  (req, res) => {
    try {
      const securityStatus = database.getSecurityStatus();
      const recentAuditLogs = database.getRecentAuditLogs(20);
      
      res.json({
        success: true,
        data: {
          securityStatus,
          recentAuditLogs,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Error fetching security status:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

// Legacy /tx endpoint (for backward compatibility with tests)
app.post('/tx', rateLimiters.transactions, (req, res) => {
  res.status(400).json({ error: 'Legacy endpoint not supported' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

const https = require('https');

const options = {
  key: fs.readFileSync('server.key'),
  cert: fs.readFileSync('server.cert'),
};

https.createServer(options, app).listen(443, () => {
  console.log('AirChainPay Relay Node (HTTPS) listening on port 443');
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
  AUTH_BLOCK_DURATION: require('./bluetooth/BLEManager').AUTH_BLOCK_DURATION,
};

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
}); 

// Network status endpoint - shows status of all supported networks
app.get('/networks/status', async (req, res) => {
  try {
    const networks = [
      {
        chainId: 84532,
        name: 'Base Sepolia',
        rpcUrl: 'https://sepolia.base.org',
        contractAddress: '0x7B79117445C57eea1CEAb4733020A55e1D503934',
        explorer: 'https://sepolia.basescan.org',
        currency: 'ETH',
      },
      {
        chainId: 1114,
        name: 'Core Testnet 2',
        rpcUrl: 'https://rpc.test2.btcs.network',
        contractAddress: '0x7B79117445C57eea1CEAb4733020A55e1D503934',
        explorer: 'https://scan.test2.btcs.network',
        currency: 'TCORE2',
      },
    ];

    const networkStatus = [];

    for (const network of networks) {
      try {
        const provider = getProvider(network.chainId);
        const latestBlock = await provider.getBlock('latest');
        const gasPrice = await provider.getFeeData();
        const contractCode = await provider.getCode(network.contractAddress);

        networkStatus.push({
          ...network,
          status: 'online',
          blockNumber: latestBlock.number,
          gasPrice: ethers.formatUnits(gasPrice.gasPrice, 'gwei'),
          contractExists: contractCode !== '0x',
          lastChecked: new Date().toISOString(),
        });
      } catch (error) {
        networkStatus.push({
          ...network,
          status: 'offline',
          error: error.message,
          lastChecked: new Date().toISOString(),
        });
      }
    }

    res.json({
      success: true,
      data: {
        networks: networkStatus,
        totalNetworks: networks.length,
        onlineNetworks: networkStatus.filter(n => n.status === 'online').length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error getting network status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}); 