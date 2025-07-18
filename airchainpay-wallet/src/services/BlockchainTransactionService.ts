import { ethers } from 'ethers';
import { logger } from '../utils/Logger';
import { SUPPORTED_CHAINS, STORAGE_KEYS } from '../constants/AppConfig';
import { MultiChainWalletManager } from '../wallet/MultiChainWalletManager';
import { Transaction } from '../types/transaction';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface BlockchainTransaction extends Transaction {
  hash: string;
  blockNumber?: number;
  gasUsed?: string;
  gasPrice?: string;
  nonce: number;
  from: string;
  to: string;
  value: string;
  chainId: string;
  blockExplorerUrl: string;
  isTokenTransfer?: boolean;
  tokenSymbol?: string;
  tokenDecimals?: number;
}

export interface TransactionHistoryOptions {
  fromBlock?: number;
  toBlock?: number;
  limit?: number;
  includePending?: boolean;
}

export class BlockchainTransactionService {
  private static instance: BlockchainTransactionService;
  private multiChainWalletManager: MultiChainWalletManager;
  private providers: Record<string, ethers.Provider>;
  private listeners: Map<string, (transactions: BlockchainTransaction[]) => void>;
  private pollingIntervals: Map<string, NodeJS.Timeout>;

  private constructor() {
    this.multiChainWalletManager = MultiChainWalletManager.getInstance();
    this.providers = {};
    this.listeners = new Map();
    this.pollingIntervals = new Map();
    
    // Initialize providers for each supported chain
    Object.entries(SUPPORTED_CHAINS).forEach(([chainId, chain]) => {
      this.providers[chainId] = new ethers.JsonRpcProvider(chain.rpcUrl);
    });
  }

  static getInstance(): BlockchainTransactionService {
    if (!BlockchainTransactionService.instance) {
      BlockchainTransactionService.instance = new BlockchainTransactionService();
    }
    return BlockchainTransactionService.instance;
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
   * Get transaction history from blockchain
   */
  async getTransactionHistory(
    chainId: string,
    options: TransactionHistoryOptions = {}
  ): Promise<BlockchainTransaction[]> {
    try {
      const walletInfo = await this.multiChainWalletManager.getWalletInfo(chainId);
      if (!walletInfo) {
        throw new Error('No wallet found for chain');
      }

      const address = walletInfo.address;
      const provider = this.getProvider(chainId);
      const chain = SUPPORTED_CHAINS[chainId as keyof typeof SUPPORTED_CHAINS];
      
      if (!chain) {
        throw new Error(`Unsupported chain: ${chainId}`);
      }

      // Get current block number
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = options.fromBlock || Math.max(0, currentBlock - 10000); // Last 10k blocks
      const toBlock = options.toBlock || currentBlock;

      // Get all transactions for the address
      const transactions: BlockchainTransaction[] = [];

      // Get incoming transactions (transactions where this address is the recipient)
      const incomingTxs = await this.getIncomingTransactions(provider, address, fromBlock, toBlock, chainId);
      transactions.push(...incomingTxs);

      // Get outgoing transactions (transactions where this address is the sender)
      const outgoingTxs = await this.getOutgoingTransactions(provider, address, fromBlock, toBlock, chainId);
      transactions.push(...outgoingTxs);

      // Sort by timestamp (newest first)
      transactions.sort((a, b) => b.timestamp - a.timestamp);

      // Apply limit if specified
      if (options.limit) {
        transactions.splice(options.limit);
      }

      // Add blockchain explorer URLs
      transactions.forEach(tx => {
        tx.blockExplorerUrl = `${chain.blockExplorer}/tx/${tx.hash}`;
      });

      // Cache transactions locally
      await this.cacheTransactions(chainId, transactions);

      return transactions;
    } catch (error) {
      logger.error('Failed to get transaction history:', error);
      throw error;
    }
  }

  /**
   * Get incoming transactions (where address is recipient)
   */
  private async getIncomingTransactions(
    provider: ethers.Provider,
    address: string,
    fromBlock: number,
    toBlock: number,
    chainId: string
  ): Promise<BlockchainTransaction[]> {
    const transactions: BlockchainTransaction[] = [];
    
    try {
      // Get logs for incoming transfers
      const filter = {
        fromBlock,
        toBlock,
        topics: [
          ethers.id('Transfer(address,address,uint256)'),
          null,
          ethers.zeroPadValue(address, 32)
        ]
      };

      const logs = await provider.getLogs(filter);
      
      for (const log of logs) {
        try {
          const tx = await provider.getTransaction(log.transactionHash);
          if (!tx) continue;

          const receipt = await provider.getTransactionReceipt(log.transactionHash);
          const block = await provider.getBlock(log.blockNumber!);

          const transaction: BlockchainTransaction = {
            id: log.transactionHash,
            hash: log.transactionHash,
            from: tx.from,
            to: address,
            value: ethers.formatEther(tx.value),
            amount: ethers.formatEther(tx.value),
            status: receipt?.status === 1 ? 'completed' : 'failed',
            timestamp: block?.timestamp ? block.timestamp * 1000 : Date.now(),
            blockNumber: log.blockNumber,
            gasUsed: receipt?.gasUsed?.toString(),
            gasPrice: tx.gasPrice?.toString(),
            nonce: tx.nonce,
            chainId,
            blockExplorerUrl: '',
            isTokenTransfer: true,
          };

          transactions.push(transaction);
        } catch (error) {
          logger.error('Error processing incoming transaction:', error);
        }
      }
    } catch (error) {
      logger.error('Error getting incoming transactions:', error);
    }

    return transactions;
  }

  /**
   * Get outgoing transactions (where address is sender)
   */
  private async getOutgoingTransactions(
    provider: ethers.Provider,
    address: string,
    fromBlock: number,
    toBlock: number,
    chainId: string
  ): Promise<BlockchainTransaction[]> {
    const transactions: BlockchainTransaction[] = [];
    
    try {
      // Get logs for outgoing transfers
      const filter = {
        fromBlock,
        toBlock,
        topics: [
          ethers.id('Transfer(address,address,uint256)'),
          ethers.zeroPadValue(address, 32)
        ]
      };

      const logs = await provider.getLogs(filter);
      
      for (const log of logs) {
        try {
          const tx = await provider.getTransaction(log.transactionHash);
          if (!tx) continue;

          const receipt = await provider.getTransactionReceipt(log.transactionHash);
          const block = await provider.getBlock(log.blockNumber!);

          // Parse transfer data
          const iface = new ethers.Interface(['event Transfer(address indexed from, address indexed to, uint256 value)']);
          const parsedLog = iface.parseLog(log);
          const recipient = parsedLog?.args?.[1];
          const value = parsedLog?.args?.[2];

          const transaction: BlockchainTransaction = {
            id: log.transactionHash,
            hash: log.transactionHash,
            from: address,
            to: recipient,
            value: ethers.formatEther(value || 0),
            amount: ethers.formatEther(value || 0),
            status: receipt?.status === 1 ? 'completed' : 'failed',
            timestamp: block?.timestamp ? block.timestamp * 1000 : Date.now(),
            blockNumber: log.blockNumber,
            gasUsed: receipt?.gasUsed?.toString(),
            gasPrice: tx.gasPrice?.toString(),
            nonce: tx.nonce,
            chainId,
            blockExplorerUrl: '',
            isTokenTransfer: true,
          };

          transactions.push(transaction);
        } catch (error) {
          logger.error('Error processing outgoing transaction:', error);
        }
      }
    } catch (error) {
      logger.error('Error getting outgoing transactions:', error);
    }

    return transactions;
  }

  /**
   * Get native token transactions (ETH, CORE, etc.)
   */
  private async getNativeTokenTransactions(
    provider: ethers.Provider,
    address: string,
    fromBlock: number,
    toBlock: number,
    chainId: string
  ): Promise<BlockchainTransaction[]> {
    const transactions: BlockchainTransaction[] = [];
    
    try {
      // Get all transactions involving this address
      const filter = {
        fromBlock,
        toBlock,
        address
      };

      const logs = await provider.getLogs(filter);
      
      for (const log of logs) {
        try {
          const tx = await provider.getTransaction(log.transactionHash);
          if (!tx) continue;

          const receipt = await provider.getTransactionReceipt(log.transactionHash);
          const block = await provider.getBlock(log.blockNumber!);

          const isIncoming = tx.to?.toLowerCase() === address.toLowerCase();
          const isOutgoing = tx.from.toLowerCase() === address.toLowerCase();

          if (isIncoming || isOutgoing) {
            const transaction: BlockchainTransaction = {
              id: log.transactionHash,
              hash: log.transactionHash,
              from: tx.from,
              to: tx.to || '',
              value: ethers.formatEther(tx.value),
              amount: ethers.formatEther(tx.value),
              status: receipt?.status === 1 ? 'completed' : 'failed',
              timestamp: block?.timestamp ? block.timestamp * 1000 : Date.now(),
              blockNumber: log.blockNumber,
              gasUsed: receipt?.gasUsed?.toString(),
              gasPrice: tx.gasPrice?.toString(),
              nonce: tx.nonce,
              chainId,
              blockExplorerUrl: '',
              isTokenTransfer: false,
            };

            transactions.push(transaction);
          }
        } catch (error) {
          logger.error('Error processing native token transaction:', error);
        }
      }
    } catch (error) {
      logger.error('Error getting native token transactions:', error);
    }

    return transactions;
  }

  /**
   * Start real-time transaction monitoring
   */
  startTransactionMonitoring(chainId: string, callback: (transactions: BlockchainTransaction[]) => void): void {
    const key = `${chainId}_monitor`;
    
    // Store the callback
    this.listeners.set(key, callback);

    // Start polling for new transactions
    let pollInterval: any = setInterval(async () => {
      try {
        const transactions = await this.getTransactionHistory(chainId, { limit: 50 });
        const listener = this.listeners.get(key);
        if (listener) {
          listener(transactions);
        }
      } catch (error) {
        logger.error('Error in transaction monitoring:', error);
      }
    }, 30000); // Poll every 30 seconds

    this.pollingIntervals.set(key, pollInterval);
  }

  /**
   * Stop real-time transaction monitoring
   */
  stopTransactionMonitoring(chainId: string): void {
    const key = `${chainId}_monitor`;
    const interval = this.pollingIntervals.get(key);
    
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(key);
    }
    
    this.listeners.delete(key);
  }

  /**
   * Cache transactions locally
   */
  private async cacheTransactions(chainId: string, transactions: BlockchainTransaction[]): Promise<void> {
    try {
      const key = `${STORAGE_KEYS.TRANSACTION_HISTORY}_${chainId}`;
      // Use AsyncStorage for transaction history (non-sensitive data)
      await AsyncStorage.setItem(key, JSON.stringify(transactions));
      logger.info(`[BlockchainTransactionService] Cached ${transactions.length} transactions for chain ${chainId}`);
    } catch (error) {
      logger.error('Failed to cache transactions:', error);
    }
  }

  /**
   * Get cached transactions
   */
  async getCachedTransactions(chainId: string): Promise<BlockchainTransaction[]> {
    try {
      const key = `${STORAGE_KEYS.TRANSACTION_HISTORY}_${chainId}`;
      // Use AsyncStorage for transaction history (non-sensitive data)
      const cached = await AsyncStorage.getItem(key);
      if (cached) {
        const transactions = JSON.parse(cached);
        logger.info(`[BlockchainTransactionService] Retrieved ${transactions.length} cached transactions for chain ${chainId}`);
        return transactions;
      }
      return [];
    } catch (error) {
      logger.error('Failed to get cached transactions:', error);
      return [];
    }
  }

  /**
   * Get transaction details from blockchain
   */
  async getTransactionDetails(hash: string, chainId: string): Promise<BlockchainTransaction | null> {
    try {
      const provider = this.getProvider(chainId);
      const tx = await provider.getTransaction(hash);
      const receipt = await provider.getTransactionReceipt(hash);
      const block = receipt ? await provider.getBlock(receipt.blockNumber!) : null;

      if (!tx) return null;

      const transaction: BlockchainTransaction = {
        id: hash,
        hash,
        from: tx.from,
        to: tx.to || '',
        value: ethers.formatEther(tx.value),
        amount: ethers.formatEther(tx.value),
        status: receipt?.status === 1 ? 'completed' : 'failed',
        timestamp: block?.timestamp ? block.timestamp * 1000 : Date.now(),
        blockNumber: receipt?.blockNumber,
        gasUsed: receipt?.gasUsed?.toString(),
        gasPrice: tx.gasPrice?.toString(),
        nonce: tx.nonce,
        chainId,
        blockExplorerUrl: `${SUPPORTED_CHAINS[chainId as keyof typeof SUPPORTED_CHAINS]?.blockExplorer}/tx/${hash}`,
        isTokenTransfer: false,
      };

      return transaction;
    } catch (error) {
      logger.error('Failed to get transaction details:', error);
      return null;
    }
  }

  /**
   * Open transaction in blockchain explorer
   */
  openInBlockchainExplorer(transaction: BlockchainTransaction): void {
    // This would typically open a URL in the device's browser
    // For React Native, you'd use Linking.openURL
    if (transaction.blockExplorerUrl) {
      // Linking.openURL(transaction.blockExplorerUrl);
      logger.info('Opening transaction in explorer:', transaction.blockExplorerUrl);
    }
  }
} 