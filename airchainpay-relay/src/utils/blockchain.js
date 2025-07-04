const { ethers } = require('ethers');
const logger = require('./logger');
const { SUPPORTED_CHAINS } = require('../../config/default');
const { AirChainPay } = require('../abi/AirChainPay.json');

// Cache for providers and contracts
const providers = new Map();
const contracts = new Map();

/**
 * Get provider for a specific chain
 */
function getProvider(chainId) {
  if (!SUPPORTED_CHAINS[chainId]) {
    throw new Error(`Unsupported chain: ${chainId}`);
  }

  if (!providers.has(chainId)) {
    const provider = new ethers.JsonRpcProvider(SUPPORTED_CHAINS[chainId].rpcUrl);
    providers.set(chainId, provider);
  }

  return providers.get(chainId);
}

/**
 * Get contract instance for a specific chain
 */
function getContract(chainId) {
  if (!SUPPORTED_CHAINS[chainId]) {
    throw new Error(`Unsupported chain: ${chainId}`);
  }

  if (!contracts.has(chainId)) {
    const provider = getProvider(chainId);
    const contractAddress = SUPPORTED_CHAINS[chainId].contractAddress;
    if (!contractAddress) {
      throw new Error(`No contract address for chain: ${chainId}`);
    }

    const contract = new ethers.Contract(contractAddress, AirChainPay.abi, provider);
    contracts.set(chainId, contract);
  }

  return contracts.get(chainId);
}

/**
 * Clean up connections
 */
function cleanup() {
  providers.clear();
  contracts.clear();
}

/**
 * Validates a transaction format and data
 * @param {Object} txData - The transaction data to validate
 * @returns {Promise<{isValid: boolean, error?: string}>}
 */
async function validateTransaction(txData) {
  try {
    // Check required fields
    if (!txData) {
      return { isValid: false, error: 'Transaction data is missing' };
    }

    // Validate transaction ID
    if (!txData.id || typeof txData.id !== 'string') {
      return { isValid: false, error: 'Invalid transaction ID' };
    }

    // Validate recipient address
    if (!txData.to || !ethers.isAddress(txData.to)) {
      return { isValid: false, error: 'Invalid recipient address' };
    }

    // Validate amount
    if (!txData.amount || isNaN(parseFloat(txData.amount)) || parseFloat(txData.amount) <= 0) {
      return { isValid: false, error: 'Invalid transaction amount' };
    }

    // Validate chain ID if present
    if (txData.chainId !== undefined) {
      const chainId = parseInt(txData.chainId);
      if (isNaN(chainId) || chainId <= 0) {
        return { isValid: false, error: 'Invalid chain ID' };
      }
    }

    // Validate token address if present
    if (txData.tokenAddress && !ethers.isAddress(txData.tokenAddress)) {
      return { isValid: false, error: 'Invalid token address' };
    }

    // Validate timestamp
    if (!txData.timestamp || typeof txData.timestamp !== 'number' || txData.timestamp <= 0) {
      return { isValid: false, error: 'Invalid timestamp' };
    }

    // Validate status
    const validStatuses = ['pending', 'sending', 'completed', 'failed'];
    if (!txData.status || !validStatuses.includes(txData.status)) {
      return { isValid: false, error: 'Invalid transaction status' };
    }

    // Optional metadata validation
    if (txData.metadata) {
      if (typeof txData.metadata !== 'object') {
        return { isValid: false, error: 'Invalid metadata format' };
      }

      // Validate device ID if present
      if (txData.metadata.deviceId && typeof txData.metadata.deviceId !== 'string') {
        return { isValid: false, error: 'Invalid device ID in metadata' };
      }

      // Validate retry count if present
      if (txData.metadata.retryCount !== undefined) {
        const retryCount = parseInt(txData.metadata.retryCount);
        if (isNaN(retryCount) || retryCount < 0) {
          return { isValid: false, error: 'Invalid retry count in metadata' };
        }
      }
    }

    // All validations passed
    return { isValid: true };
  } catch (error) {
    logger.error('[Blockchain] Transaction validation error:', error);
    return { 
      isValid: false, 
      error: error instanceof Error ? error.message : 'Unknown validation error' 
    };
  }
}

/**
 * Estimates the gas required for a transaction
 * @param {Object} txData - The transaction data
 * @param {ethers.providers.Provider} provider - The ethers provider
 * @returns {Promise<{gasLimit: ethers.BigNumber, error?: string}>}
 */
async function estimateGas(txData, provider) {
  try {
    const tx = {
      to: txData.to,
      value: ethers.utils.parseEther(txData.amount.toString())
    };

    if (txData.tokenAddress) {
      // For token transfers, estimate gas for ERC20 transfer
      const tokenContract = new ethers.Contract(
        txData.tokenAddress,
        ['function transfer(address to, uint256 amount)'],
        provider
      );
      
      const gasLimit = await tokenContract.estimateGas.transfer(
        txData.to,
        ethers.utils.parseUnits(txData.amount.toString(), 18) // Assuming 18 decimals
      );
      
      return { gasLimit };
    } else {
      // For native token transfers
      const gasLimit = await provider.estimateGas(tx);
      return { gasLimit };
    }
  } catch (error) {
    logger.error('[Blockchain] Gas estimation error:', error);
    return { 
      gasLimit: ethers.BigNumber.from(21000), // Default gas limit
      error: error instanceof Error ? error.message : 'Gas estimation failed' 
    };
  }
}

module.exports = {
  getProvider,
  getContract,
  cleanup,
  validateTransaction,
  estimateGas
}; 