const { ethers } = require('ethers');
const logger = require('../utils/logger');
const { getProvider } = require('../utils/blockchain');

/**
 * Process a signed transaction and broadcast it to the blockchain
 * @param {Object} transactionData - The transaction data
 * @param {Object} metrics - Metrics object to update
 * @returns {Promise<{hash: string, status: string}>}
 */
async function processTransaction(transactionData, metrics = null) {
  try {
    logger.info('Processing transaction:', { 
      id: transactionData.id,
      chainId: transactionData.chainId, 
    });

    // Increment received metric if metrics object is provided
    if (metrics) {
      metrics.transactionsReceived++;
    }

    // Validate transaction data
    if (!transactionData.signedTransaction) {
      throw new Error('Signed transaction is required');
    }

    if (!transactionData.chainId) {
      throw new Error('Chain ID is required');
    }

    // Get provider for the specified chain
    const provider = getProvider(transactionData.chainId);
    
    // Parse the signed transaction
    let parsedTx;
    try {
      parsedTx = ethers.Transaction.from(transactionData.signedTransaction);
    } catch (error) {
      logger.error('Failed to parse signed transaction:', error);
      if (metrics) {
        metrics.transactionsFailed++;
      }
      throw new Error('Invalid signed transaction format');
    }

    // Validate transaction before broadcasting
    const validationResult = await validateTransactionBeforeBroadcast(parsedTx, provider);
    if (!validationResult.isValid) {
      if (metrics) {
        metrics.transactionsFailed++;
      }
      throw new Error(`Transaction validation failed: ${validationResult.error}`);
    }

    // Broadcast the transaction
    logger.info('Broadcasting transaction to blockchain');
    const txResponse = await provider.broadcastTransaction(transactionData.signedTransaction);
    
    // Wait for transaction to be mined (optional, can be configured)
    const receipt = await txResponse.wait();
    
    logger.info('Transaction broadcasted successfully:', {
      hash: txResponse.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    });

    // Increment success metrics
    if (metrics) {
      metrics.transactionsProcessed++;
      metrics.transactionsBroadcasted++;
    }

    return {
      hash: txResponse.hash,
      status: 'success',
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    };

  } catch (error) {
    logger.error('Transaction processing failed:', error);
    if (metrics) {
      metrics.transactionsFailed++;
    }
    throw error;
  }
}

/**
 * Validate transaction before broadcasting
 * @param {ethers.Transaction} parsedTx - Parsed transaction
 * @param {ethers.Provider} provider - Blockchain provider
 * @returns {Promise<{isValid: boolean, error?: string}>}
 */
async function validateTransactionBeforeBroadcast(parsedTx, provider) {
  try {
    // Check if transaction is already mined
    const existingReceipt = await provider.getTransactionReceipt(parsedTx.hash);
    if (existingReceipt) {
      return { isValid: false, error: 'Transaction already mined' };
    }

    // Validate nonce
    const sender = parsedTx.from;
    const currentNonce = await provider.getTransactionCount(sender);
    if (parsedTx.nonce < currentNonce) {
      return { isValid: false, error: 'Transaction nonce too low' };
    }

    // Validate gas price (optional check)
    const gasPrice = await provider.getFeeData();
    if (parsedTx.gasPrice && parsedTx.gasPrice < gasPrice.gasPrice) {
      logger.warn('Transaction gas price may be too low');
    }

    return { isValid: true };
  } catch (error) {
    logger.error('Transaction validation error:', error);
    return { isValid: false, error: error.message };
  }
}

/**
 * Get transaction status
 * @param {string} txHash - Transaction hash
 * @param {number} chainId - Chain ID
 * @returns {Promise<{status: string, receipt?: Object}>}
 */
async function getTransactionStatus(txHash, chainId) {
  try {
    const provider = getProvider(chainId);
    const receipt = await provider.getTransactionReceipt(txHash);
    
    if (!receipt) {
      return { status: 'pending' };
    }

    return {
      status: receipt.status === 1 ? 'success' : 'failed',
      receipt: {
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.effectiveGasPrice.toString(),
      },
    };
  } catch (error) {
    logger.error('Failed to get transaction status:', error);
    throw error;
  }
}

module.exports = {
  processTransaction,
  validateTransactionBeforeBroadcast,
  getTransactionStatus,
}; 