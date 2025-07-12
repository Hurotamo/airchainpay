import { ethers } from 'ethers';
import { logger } from '../utils/Logger';
import { TRANSACTION_CONFIG, SUPPORTED_CHAINS } from '../constants/AppConfig';
import { TxQueue } from './TxQueue';
import { MultiChainWalletManager } from '../wallet/MultiChainWalletManager';
import { Transaction } from '../types/transaction';

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
        throw new Error(`Unsupported chain: ${chainId}`);
      }
      this.providers[chainId] = new ethers.JsonRpcProvider(chain.rpcUrl);
    }
    return this.providers[chainId];
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
      maxGasPrice = TRANSACTION_CONFIG.maxGasPrice[chainId as keyof typeof TRANSACTION_CONFIG.maxGasPrice]
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

        // Get current gas price
        const gasPrice = await this.multiChainWalletManager.getGasPrice(chainId);
        if (BigInt(gasPrice) > BigInt(maxGasPrice)) {
          throw new Error(`Gas price too high: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);
        }

        // Estimate gas with a buffer
        const estimatedGas = await this.multiChainWalletManager.estimateGas(transaction, chainId);
        const gasLimit = Math.floor(Number(estimatedGas) * 1.2); // Add 20% buffer

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
            setTimeout(() => reject(new Error('Transaction confirmation timeout')), timeout)
          )
        ]);

        return {
          hash: tx.hash,
          status: 'confirmed',
          receipt
        };
      } catch (error) {
        lastError = error as Error;
        logger.error(`Transaction attempt ${attempt} failed:`, error);

        // Check if we should retry
        if (this.shouldRetry(error as Error)) {
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
      } catch (error) {
        logger.error(`Failed to process queued transaction ${tx.id}:`, error);
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