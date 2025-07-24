import { ethers } from 'ethers';
import { logger } from '../utils/Logger';
import { TRANSACTION_CONFIG, SUPPORTED_CHAINS } from '../constants/AppConfig';
import { TxQueue } from './TxQueue';
import { MultiChainWalletManager } from '../wallet/MultiChainWalletManager';
import { Transaction } from '../types/transaction';
import { GasPriceValidator } from '../utils/GasPriceValidator';
import { WalletError, TransactionError } from '../utils/ErrorClasses';

interface TransactionOptions {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  maxGasPrice?: string;
}

interface TransactionResult {
  hash: string;
  status: 'pending' | 'confirmed' | 'failed';
  error?: string;
  receipt?: ethers.TransactionReceipt | null;
}

interface QueuedTransaction extends Transaction {
  signedTx: string;
  chainId: string;
}

export class TransactionService {
  private static instance: TransactionService;
  private multiChainWalletManager: MultiChainWalletManager;
  private providers: Record<string, ethers.Provider>;

  private constructor() {
    this.multiChainWalletManager = MultiChainWalletManager.getInstance();
    this.providers = {};
    
    // Initialize providers for each supported chain
    Object.entries(SUPPORTED_CHAINS).forEach(([chainId, chain]) => {
      this.providers[chainId] = new ethers.JsonRpcProvider(chain.rpcUrl);
    });
  }

  static getInstance(): TransactionService {
    if (!TransactionService.instance) {
      TransactionService.instance = new TransactionService();
    }
    return TransactionService.instance;
  }

  private getProvider(chainId: string): ethers.Provider {
    if (!this.providers[chainId]) {
      const chain = SUPPORTED_CHAINS[chainId as keyof typeof SUPPORTED_CHAINS];
      if (!chain) {
        throw new WalletError(`Unsupported chain: ${chainId}`);
      }
      this.providers[chainId] = new ethers.JsonRpcProvider(chain.rpcUrl);
    }
    return this.providers[chainId];
  }

  /**
   * Determine transaction type for gas limit validation
   * @param transaction - Transaction request
   * @returns Transaction type for gas limit bounds
   */
  private determineTransactionType(transaction: ethers.TransactionRequest): 'nativeTransfer' | 'erc20Transfer' | 'contractInteraction' | 'complexTransaction' {
    // Check if it's a native transfer (no data or simple data)
    if (!transaction.data || transaction.data === '0x') {
      return 'nativeTransfer';
    }

    // Check if it's an ERC-20 transfer (standard transfer function)
    if (transaction.data && transaction.data.startsWith('0xa9059cbb')) {
      return 'erc20Transfer';
    }

    // Check if it's a contract interaction (has data but not ERC-20 transfer)
    if (transaction.data && transaction.data.length > 10) {
      return 'contractInteraction';
    }

    // Default to complex transaction for unknown patterns
    return 'complexTransaction';
  }

  /**
   * Send a transaction with retry logic and proper error handling
   */
  async sendTransaction(
    transaction: ethers.TransactionRequest,
    chainId: string,
    options: TransactionOptions = {}
  ): Promise<TransactionResult> {
    const {
      maxRetries = TRANSACTION_CONFIG.maxRetries,
      retryDelay = TRANSACTION_CONFIG.retryDelay,
      timeout = TRANSACTION_CONFIG.timeout,
    } = options;

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      try {
        // Check network status
        const isOnline = await this.multiChainWalletManager.checkNetworkStatus(chainId);
        if (!isOnline) {
          // Queue transaction for offline handling
          const signedTx = await this.multiChainWalletManager.signTransaction(transaction, chainId);
          const queuedTx: QueuedTransaction = {
            id: ethers.id(Math.random().toString()),
            to: transaction.to as string,
            amount: ethers.formatEther(transaction.value || 0),
            status: 'pending',
            timestamp: Date.now(),
            chainId,
            signedTx,
          };
          await TxQueue.addTransaction(queuedTx);
          return {
            hash: ethers.id(signedTx),
            status: 'pending',
            error: 'Network offline - transaction queued'
          };
        }

        // Get current gas price and validate it
        const gasPrice = await this.multiChainWalletManager.getGasPrice(chainId);
        
        // Comprehensive gas price validation
        const gasPriceValidation = GasPriceValidator.validateGasPrice(gasPrice, chainId);
        if (!gasPriceValidation.isValid) {
          throw new TransactionError(`Gas price validation failed: ${gasPriceValidation.error}`);
        }

        // Check if gas price is reasonable for current network conditions
        const reasonablenessCheck = await GasPriceValidator.isGasPriceReasonable(gasPrice, chainId);
        if (!reasonablenessCheck.isReasonable && reasonablenessCheck.reasonableness === 'very_high') {
          throw new TransactionError(`Gas price is unreasonably high: ${reasonablenessCheck.proposedGwei.toFixed(2)} gwei (${reasonablenessCheck.ratio.toFixed(2)}x above current)`);
        }

        // Log warning for high gas prices
        if (gasPriceValidation.warningLevel === 'warning' || gasPriceValidation.warningLevel === 'high') {
          logger.warn('[TransactionService] High gas price detected', {
            chainId,
            gasPrice: gasPrice.toString(),
            gasPriceGwei: gasPriceValidation.gasPriceGwei,
            warningLevel: gasPriceValidation.warningLevel,
            reasonableness: reasonablenessCheck.reasonableness
          });
        }

        // Estimate gas with a buffer
        const estimatedGas = await this.multiChainWalletManager.estimateGas(transaction, chainId);
        const gasLimit = Math.floor(Number(estimatedGas) * 1.2); // Add 20% buffer

        // Determine transaction type for gas limit validation
        const transactionType = this.determineTransactionType(transaction);
        
        // Validate gas limit
        const gasLimitValidation = GasPriceValidator.validateGasLimit(BigInt(gasLimit), transactionType);
        if (!gasLimitValidation.isValid) {
          throw new TransactionError(`Gas limit validation failed: ${gasLimitValidation.error}`);
        }

        // Log gas limit efficiency
        if (gasLimitValidation.efficiency === 'high') {
          logger.warn('[TransactionService] High gas limit detected', {
            chainId,
            gasLimit: gasLimit.toString(),
            transactionType,
            efficiency: gasLimitValidation.efficiency
          });
        }

        // Send transaction
        const signedTx = await this.multiChainWalletManager.signTransaction({
          ...transaction,
          gasLimit,
          maxFeePerGas: gasPrice,
        }, chainId);

        // Send the signed transaction
        const provider = this.getProvider(chainId);
        const tx = await provider.broadcastTransaction(signedTx);

        // Wait for confirmation with timeout
        const receipt = await Promise.race([
          tx.wait(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new TransactionError('Transaction confirmation timeout')), timeout)
          )
        ]);

        return {
          hash: tx.hash,
          status: 'confirmed',
          receipt
        };
      } catch (error: unknown) {
        if (error instanceof Error) {
          lastError = error;
          logger.error(`Transaction attempt ${attempt} failed:`, error);

          // Check if we should retry
          if (this.shouldRetry(error)) {
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
              continue;
            }
          } else {
            // Don't retry if error is not retryable
            break;
          }
        }
      }
    }

    // All attempts failed
    const errorMessage = this.getReadableError(lastError);
    return {
      hash: '',
      status: 'failed',
      error: errorMessage
    };
  }

  /**
   * Process queued transactions
   */
  async processQueuedTransactions(): Promise<void> {
    const pendingTxs = await TxQueue.getPendingTransactions();
    
    for (const tx of pendingTxs) {
      try {
        // Parse the queued transaction
        const queuedTx = tx as QueuedTransaction;
        const isOnline = await this.multiChainWalletManager.checkNetworkStatus(queuedTx.chainId);
        
        if (!isOnline) {
          continue; // Skip if still offline
        }

        // Try to send the transaction
        const provider = this.getProvider(queuedTx.chainId);
        const result = await provider.broadcastTransaction(queuedTx.signedTx)
          .then(async (tx: ethers.TransactionResponse) => {
            const receipt = await tx.wait();
            return {
              hash: tx.hash,
              status: 'confirmed' as const,
              receipt,
              error: undefined
            } as TransactionResult;
          })
          .catch((error: Error) => ({
            hash: '',
            status: 'failed' as const,
            error: this.getReadableError(error),
            receipt: null
          } as TransactionResult));
        
        // Update transaction status
        await TxQueue.updateTransaction(tx.id, {
          status: result.status === 'confirmed' ? 'completed' : result.status,
          error: result.error,
          hash: result.hash
        });
      } catch (error: unknown) {
        if (error instanceof Error) {
          logger.error(`Failed to process queued transaction ${tx.id}:`, error);
        }
      }
    }
  }

  /**
   * Determine if an error is retryable
   */
  private shouldRetry(error: Error): boolean {
    const retryableErrors = [
      'nonce has already been used',
      'replacement transaction underpriced',
      'transaction underpriced',
      'insufficient funds for gas',
      'network error',
      'timeout',
      'rate limit exceeded',
      'could not determine fee',
      'transaction pool full'
    ];

    const errorMessage = error.message.toLowerCase();
    return retryableErrors.some(msg => errorMessage.includes(msg.toLowerCase()));
  }

  /**
   * Convert technical error messages to user-friendly ones
   */
  private getReadableError(error: Error | null): string {
    if (!error) return 'Unknown error occurred';

    const errorMessage = error.message.toLowerCase();
    
    // Map of technical errors to user-friendly messages
    const errorMap: Record<string, string> = {
      'insufficient funds': 'Not enough funds to complete the transaction',
      'nonce too low': 'Transaction already processed',
      'gas required exceeds allowance': 'Transaction would exceed gas limit',
      'already known': 'This transaction is already pending',
      'replacement transaction underpriced': 'Gas price too low to replace transaction',
      'transaction underpriced': 'Gas price too low',
      'execution reverted': 'Transaction was rejected by the network',
      'gas price too high': 'Gas price is currently too high',
      'timeout': 'Transaction took too long to confirm',
      'network error': 'Network connection issue',
      'rate limit exceeded': 'Too many requests, please try again later'
    };

    // Find matching error message
    for (const [technical, readable] of Object.entries(errorMap)) {
      if (errorMessage.includes(technical)) {
        return readable;
      }
    }

    // If no match found, return a generic message
    return 'Failed to process transaction. Please try again.';
  }
} 