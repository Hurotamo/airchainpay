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
  res.json({ status: 'ok', version: '1.0.0' });
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

// BLE/USSD stubs for future integration of offline/alternative transaction relaying
function receiveTxViaBLE() {
  // TODO: Implement BLE receive logic
}

// USSD transaction receiving implementation
function receiveTxViaUSSD(ussdData) {
  // Log the USSD request
  const logPath = path.join(__dirname, '../logs/ussd.log');
  fs.appendFileSync(logPath, JSON.stringify(ussdData) + '\n');
  
  // Parse the USSD data
  // Format expected: *CODE*TXHASH*SIGNATURE#
  const parts = ussdData.text.split('*');
  if (parts.length < 3) {
    return { error: 'Invalid USSD format' };
  }
  
  // Extract transaction data
  const txData = {
    hash: parts[1],
    signature: parts[2],
    phone: ussdData.phoneNumber,
    timestamp: new Date().toISOString()
  };
  
  // Store the transaction for processing
  const txsPath = path.join(__dirname, '../data/ussd_txs.json');
  let txs = [];
  if (fs.existsSync(txsPath)) {
    txs = JSON.parse(fs.readFileSync(txsPath, 'utf8'));
  }
  txs.push(txData);
  fs.writeFileSync(txsPath, JSON.stringify(txs, null, 2));
  
  return { success: true, message: 'Transaction received for processing' };
}

// USSD endpoint
app.post('/ussd', (req, res) => {
  const { sessionId, serviceCode, phoneNumber, text } = req.body;
  
  if (!sessionId || !phoneNumber) {
    return res.status(400).json({ error: 'Missing required USSD parameters' });
  }
  
  const result = receiveTxViaUSSD({
    sessionId,
    serviceCode,
    phoneNumber,
    text
  });
  
  if (result.error) {
    return res.status(400).json(result);
  }
  
  // Format response for USSD
  let response = 'END Transaction received. It will be processed shortly.';
  if (text === '') {
    response = 'CON Welcome to AirChainPay\n1. Submit transaction\n2. Check status';
  } else if (text === '2') {
    response = 'END Your transactions are being processed.';
  }
  
  res.set('Content-Type', 'text/plain');
  res.send(response);
});

// Process USSD transactions
async function processUSSDTransactions() {
  const txsPath = path.join(__dirname, '../data/ussd_txs.json');
  if (!fs.existsSync(txsPath)) return;
  
  const txs = JSON.parse(fs.readFileSync(txsPath, 'utf8'));
  const pendingTxs = txs.filter(tx => !tx.processed);
  
  if (pendingTxs.length === 0) return;
  
  const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
  
  for (const tx of pendingTxs) {
    try {
      // Attempt to broadcast the transaction
      // In a real implementation, you'd reconstruct the full signed tx
      // from the data provided via USSD
      const mockSignedTx = tx.signature; // This would be the actual signed tx in production
      
      // Mark as processed to avoid reprocessing
      tx.processed = true;
      tx.processedAt = new Date().toISOString();
      
      console.log(`Processed USSD transaction from ${tx.phone}`);
    } catch (err) {
      console.error(`Error processing USSD transaction: ${err.message}`);
      tx.error = err.message;
    }
  }
  
  // Save updated status
  fs.writeFileSync(txsPath, JSON.stringify(txs, null, 2));
}

// Set up periodic processing of USSD transactions
setInterval(processUSSDTransactions, 60000); // Process every minute

// Receive a signed transaction from client and broadcast to blockchain
app.post('/tx', authenticateToken, async (req, res) => {
  const { signedTx } = req.body;
  if (!signedTx) {
    return res.status(400).json({ error: 'signedTx is required' });
  }
  
  // Validate the signed transaction format
  try {
    ethers.Transaction.from(signedTx);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid transaction format', details: err.message });
  }
  
  // Log received transaction to file for audit/debug
  const logPath = path.join(__dirname, '../logs/tx.log');
  fs.appendFileSync(logPath, `${new Date().toISOString()} - ${req.user?.id || 'anonymous'} - ${signedTx}\n`);

  // Broadcast transaction to blockchain
  try {
    // In test mode, return mock response
    if (isTestMode) {
      return res.json({ 
        status: 'broadcasted', 
        txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        timestamp: new Date().toISOString()
      });
    }
    
    const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
    const txResponse = await provider.broadcastTransaction(signedTx);
    
    // Log success
    console.log(`Transaction broadcast success: ${txResponse.hash}`);
    
    res.json({ 
      status: 'broadcasted', 
      txHash: txResponse.hash,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Broadcast error:', err);
    res.status(500).json({ 
      error: 'Broadcast failed', 
      details: err.message,
      timestamp: new Date().toISOString()
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