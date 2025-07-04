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
const { SUPPORTED_CHAINS } = require('../config/default');

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

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  
  jwt.verify(token, config.jwtSecret || 'airchainpay_secret_key', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

// Health check endpoint to verify server is running
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    bleStatus: bleManager.isInitialized() ? 'running' : 'stopped',
    connectedDevices: connectedDevices.size,
    queuedTransactions: Array.from(transactionQueue.values())
      .reduce((total, queue) => total + queue.length, 0)
  });
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
    console.error('Error fetching contract owner:', err);
    res.status(500).json({ error: err.message });
  }
});

// BLE stub for future integration of offline transaction relaying
function receiveTxViaBLE() {
  // TODO: Implement BLE receive logic
}

// Initialize BLE Manager
const bleManager = new BLEManager();

// Store connected devices and their queued transactions
const connectedDevices = new Map();
const transactionQueue = new Map();

/**
 * Initialize BLE functionality
 */
async function initializeBLE() {
  try {
    await bleManager.initialize();
    logger.info('BLE Manager initialized');

    // Start advertising as a relay node
    await bleManager.startAdvertising();
    logger.info('Started advertising as relay node');

    // Listen for device connections
    bleManager.onDeviceConnected((device) => {
      logger.info(`Device connected: ${device.id}`);
      connectedDevices.set(device.id, device);
    });

    // Listen for device disconnections
    bleManager.onDeviceDisconnected((deviceId) => {
      logger.info(`Device disconnected: ${deviceId}`);
      connectedDevices.delete(deviceId);
    });

    // Listen for incoming transactions
    bleManager.onTransactionReceived(async (deviceId, transactionData) => {
      try {
        logger.info(`Received transaction from device: ${deviceId}`);
        
        // Validate the transaction
        const validationResult = await validateTransaction(transactionData);
        if (!validationResult.isValid) {
          logger.error(`Invalid transaction from ${deviceId}: ${validationResult.error}`);
          return;
        }

        // Queue transaction for processing
        if (!transactionQueue.has(deviceId)) {
          transactionQueue.set(deviceId, []);
        }
        transactionQueue.get(deviceId).push(transactionData);

        // Process queued transactions
        processQueuedTransactions(deviceId);
      } catch (error) {
        logger.error(`Error processing transaction from ${deviceId}:`, error);
      }
    });
  } catch (error) {
    logger.error('Failed to initialize BLE:', error);
  }
}

/**
 * Process queued transactions for a device
 */
async function processQueuedTransactions(deviceId) {
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
      await bleManager.sendTransactionStatus(deviceId, {
        txId: transaction.id,
        status: 'success',
        hash: result.hash
      });

      // Remove processed transaction
      deviceQueue.shift();
    } catch (error) {
      logger.error(`Failed to process transaction:`, error);
      
      // Notify device of failure
      await bleManager.sendTransactionStatus(deviceId, {
        txId: transaction.id,
        status: 'failed',
        error: error.message
      });

      // Move failed transaction to end of queue for retry
      deviceQueue.push(deviceQueue.shift());
      
      // Break to prevent endless retry loop
      break;
    }
  }
}

// Initialize BLE when server starts
initializeBLE().catch(error => {
  logger.error('Failed to initialize BLE system:', error);
});

// API endpoints for transaction submission
app.post('/api/v1/submit-transaction', async (req, res) => {
  try {
    const { signedTransaction, chainId } = req.body;
    
    // Validate request
    if (!signedTransaction || !chainId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Process the transaction
    const result = await processTransaction({
      signedTransaction,
      chainId
    });

    res.json({
      success: true,
      hash: result.hash
    });
  } catch (error) {
    logger.error('Transaction submission failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

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
    console.error('Error fetching payments:', err);
    res.status(500).json({ error: err.message });
  }
});

// Generate authentication token
app.post('/auth/token', async (req, res) => {
  const { apiKey } = req.body;
  
  if (!apiKey || apiKey !== config.apiKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  const token = jwt.sign(
    { id: 'api-client', type: 'relay' },
    config.jwtSecret || 'airchainpay_secret_key',
    { expiresIn: '24h' }
  );
  
  res.json({ token });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start the relay server
app.listen(PORT, () => {
  console.log(`AirChainPay Relay Node listening on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

module.exports = app; // Export for testing 