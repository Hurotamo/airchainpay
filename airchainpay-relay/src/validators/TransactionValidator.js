const { ethers } = require('ethers');
const logger = require('../utils/logger');

/**
 * Validate transaction data structure and content
 * @param {Object} transactionData - The transaction data to validate
 * @returns {Promise<{isValid: boolean, error?: string}>}
 */
async function validateTransaction(transactionData) {
  try {
    // Check if transaction data exists
    if (!transactionData) {
      return { isValid: false, error: 'Transaction data is missing' };
    }

    // Validate basic structure
    const requiredFields = ['id', 'to', 'amount', 'chainId', 'timestamp'];
    for (const field of requiredFields) {
      if (!transactionData[field]) {
        return { isValid: false, error: `Missing required field: ${field}` };
      }
    }

    // Validate transaction ID
    if (typeof transactionData.id !== 'string' || transactionData.id.trim().length === 0) {
      return { isValid: false, error: 'Invalid transaction ID' };
    }

    // Validate recipient address
    if (!ethers.isAddress(transactionData.to)) {
      return { isValid: false, error: 'Invalid recipient address' };
    }

    // Validate amount
    const amount = parseFloat(transactionData.amount);
    if (isNaN(amount) || amount <= 0) {
      return { isValid: false, error: 'Invalid transaction amount' };
    }

    // Validate chain ID
    const chainId = parseInt(transactionData.chainId);
    if (isNaN(chainId) || chainId <= 0) {
      return { isValid: false, error: 'Invalid chain ID' };
    }

    // Validate timestamp
    const timestamp = parseInt(transactionData.timestamp);
    if (isNaN(timestamp) || timestamp <= 0) {
      return { isValid: false, error: 'Invalid timestamp' };
    }

    // Check if timestamp is not too old (e.g., within last 24 hours)
    const currentTime = Math.floor(Date.now() / 1000);
    const maxAge = 24 * 60 * 60; // 24 hours in seconds
    if (currentTime - timestamp > maxAge) {
      return { isValid: false, error: 'Transaction timestamp too old' };
    }

    // Validate token address if present
    if (transactionData.tokenAddress) {
      if (!ethers.isAddress(transactionData.tokenAddress)) {
        return { isValid: false, error: 'Invalid token address' };
      }
    }

    // Validate status if present
    if (transactionData.status) {
      const validStatuses = ['pending', 'sending', 'completed', 'failed'];
      if (!validStatuses.includes(transactionData.status)) {
        return { isValid: false, error: 'Invalid transaction status' };
      }
    }

    // Validate metadata if present
    if (transactionData.metadata) {
      const metadataValidation = validateMetadata(transactionData.metadata);
      if (!metadataValidation.isValid) {
        return metadataValidation;
      }
    }

    // Validate signed transaction if present
    if (transactionData.signedTransaction) {
      const signedTxValidation = validateSignedTransaction(transactionData.signedTransaction);
      if (!signedTxValidation.isValid) {
        return signedTxValidation;
      }
    }

    logger.info('Transaction validation passed:', { id: transactionData.id });
    return { isValid: true };

  } catch (error) {
    logger.error('Transaction validation error:', error);
    return { 
      isValid: false, 
      error: error instanceof Error ? error.message : 'Unknown validation error', 
    };
  }
}

/**
 * Validate transaction metadata
 * @param {Object} metadata - Metadata to validate
 * @returns {Promise<{isValid: boolean, error?: string}>}
 */
function validateMetadata(metadata) {
  try {
    if (typeof metadata !== 'object' || metadata === null) {
      return { isValid: false, error: 'Invalid metadata format' };
    }

    // Validate device ID if present
    if (metadata.deviceId && typeof metadata.deviceId !== 'string') {
      return { isValid: false, error: 'Invalid device ID in metadata' };
    }

    // Validate retry count if present
    if (metadata.retryCount !== undefined) {
      const retryCount = parseInt(metadata.retryCount);
      if (isNaN(retryCount) || retryCount < 0) {
        return { isValid: false, error: 'Invalid retry count in metadata' };
      }
    }

    // Validate additional data if present
    if (metadata.additionalData && typeof metadata.additionalData !== 'object') {
      return { isValid: false, error: 'Invalid additional data format' };
    }

    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: 'Metadata validation failed' };
  }
}

/**
 * Validate signed transaction format
 * @param {string} signedTransaction - Signed transaction string
 * @returns {Promise<{isValid: boolean, error?: string}>}
 */
function validateSignedTransaction(signedTransaction) {
  try {
    if (typeof signedTransaction !== 'string') {
      return { isValid: false, error: 'Signed transaction must be a string' };
    }

    if (!signedTransaction.startsWith('0x')) {
      return { isValid: false, error: 'Signed transaction must start with 0x' };
    }

    // Try to parse the transaction
    try {
      const parsedTx = ethers.Transaction.from(signedTransaction);
      
      // Basic validation of parsed transaction
      if (!parsedTx.from || !parsedTx.to) {
        return { isValid: false, error: 'Invalid transaction format' };
      }

      return { isValid: true };
    } catch (parseError) {
      return { isValid: false, error: 'Invalid signed transaction format' };
    }
  } catch (error) {
    return { isValid: false, error: 'Signed transaction validation failed' };
  }
}

/**
 * Validate transaction for specific chain requirements
 * @param {Object} transactionData - Transaction data
 * @returns {Promise<{isValid: boolean, error?: string}>}
 */
async function validateTransactionForChain(transactionData) {
  try {
    // Chain-specific validations can be added here
    // For example, checking if the chain supports the token type
    
    // Validate gas limit for the chain
    if (transactionData.gasLimit) {
      const gasLimit = parseInt(transactionData.gasLimit);
      if (isNaN(gasLimit) || gasLimit <= 0) {
        return { isValid: false, error: 'Invalid gas limit' };
      }
    }

    // Validate gas price for the chain
    if (transactionData.gasPrice) {
      const gasPrice = parseInt(transactionData.gasPrice);
      if (isNaN(gasPrice) || gasPrice <= 0) {
        return { isValid: false, error: 'Invalid gas price' };
      }
    }

    return { isValid: true };
  } catch (error) {
    logger.error('Chain-specific validation error:', error);
    return { isValid: false, error: 'Chain validation failed' };
  }
}

module.exports = {
  validateTransaction,
  validateMetadata,
  validateSignedTransaction,
  validateTransactionForChain,
}; 