import { ethers } from 'ethers';
import { logger } from '../utils/Logger';
import { SUPPORTED_CHAINS } from '../constants/AppConfig';
import { AIRCHAINPAY_TOKEN_ABI } from '../constants/abi';
import { MultiChainWalletManager } from '../wallet/MultiChainWalletManager';

export interface MetaTransactionRequest {
  from: string;
  to: string;
  amount: bigint;
  tokenAddress?: string; // undefined for native tokens
  paymentReference: string;
  deadline: number;
  chainId: string;
}

export interface SignedMetaTransaction {
  request: MetaTransactionRequest;
  signature: string;
  nonce: bigint;
}

export interface MetaTransactionResult {
  hash: string;
  status: 'pending' | 'confirmed' | 'failed';
  error?: string;
}

export class MetaTransactionService {
  private static instance: MetaTransactionService;
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

  static getInstance(): MetaTransactionService {
    if (!MetaTransactionService.instance) {
      MetaTransactionService.instance = new MetaTransactionService();
    }
    return MetaTransactionService.instance;
  }

  /**
   * Sign a meta-transaction offline
   */
  async signMetaTransaction(request: MetaTransactionRequest): Promise<SignedMetaTransaction> {
    try {
      const wallet = await this.multiChainWalletManager.createOrLoadWallet();
      const contractAddress = this.getContractAddress(request.chainId);
      
      // Get current nonce from contract
      const nonce = await this.getNonce(request.from, request.chainId);
      
      // Create signature
      const signature = request.tokenAddress 
        ? await this.createTokenMetaTransactionSignature(request, nonce, contractAddress)
        : await this.createNativeMetaTransactionSignature(request, nonce, contractAddress);

      logger.info('[MetaTransactionService] Meta-transaction signed successfully', {
        from: request.from,
        to: request.to,
        amount: request.amount.toString(),
        chainId: request.chainId,
        nonce: nonce.toString()
      });

      return {
        request,
        signature,
        nonce
      };
    } catch (error) {
      logger.error('[MetaTransactionService] Failed to sign meta-transaction:', error);
      throw error;
    }
  }

  /**
   * Execute a signed meta-transaction
   */
  async executeMetaTransaction(signedTx: SignedMetaTransaction): Promise<MetaTransactionResult> {
    try {
      const contractAddress = this.getContractAddress(signedTx.request.chainId);
      const provider = this.providers[signedTx.request.chainId];
      
      if (!provider) {
        throw new Error(`Provider not initialized for chain ${signedTx.request.chainId}`);
      }

      const wallet = await this.multiChainWalletManager.createOrLoadWallet();
      const connectedWallet = (wallet as ethers.Wallet).connect(provider);
      const contract = new ethers.Contract(contractAddress, AIRCHAINPAY_TOKEN_ABI, connectedWallet);

      let transaction: ethers.TransactionResponse;

      if (signedTx.request.tokenAddress) {
        // Execute ERC-20 token meta-transaction
        transaction = await contract.executeTokenMetaTransaction(
          signedTx.request.from,
          signedTx.request.to,
          signedTx.request.tokenAddress,
          signedTx.request.amount,
          signedTx.request.paymentReference,
          signedTx.request.deadline,
          signedTx.signature
        );
      } else {
        // Execute native token meta-transaction
        transaction = await contract.executeNativeMetaTransaction(
          signedTx.request.from,
          signedTx.request.to,
          signedTx.request.amount,
          signedTx.request.paymentReference,
          signedTx.request.deadline,
          signedTx.signature,
          { value: signedTx.request.amount }
        );
      }

      logger.info('[MetaTransactionService] Meta-transaction executed successfully', {
        hash: transaction.hash,
        chainId: signedTx.request.chainId
      });

      return {
        hash: transaction.hash,
        status: 'confirmed'
      };
    } catch (error) {
      logger.error('[MetaTransactionService] Failed to execute meta-transaction:', error);
      return {
        hash: '',
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get nonce for a user on a specific chain
   */
  async getNonce(userAddress: string, chainId: string): Promise<bigint> {
    try {
      const contractAddress = this.getContractAddress(chainId);
      const provider = this.providers[chainId];
      
      if (!provider) {
        throw new Error(`Provider not initialized for chain ${chainId}`);
      }

      const contract = new ethers.Contract(contractAddress, AIRCHAINPAY_TOKEN_ABI, provider);
      return await contract.getNonce(userAddress);
    } catch (error) {
      logger.error('[MetaTransactionService] Failed to get nonce:', error);
      throw error;
    }
  }

  /**
   * Create signature for native meta-transaction
   */
  private async createNativeMetaTransactionSignature(
    request: MetaTransactionRequest,
    nonce: bigint,
    contractAddress: string
  ): Promise<string> {
    const wallet = await this.multiChainWalletManager.createOrLoadWallet();
    
    const domain = {
      name: 'AirChainPayToken',
      version: '1',
      chainId: parseInt(request.chainId),
      verifyingContract: contractAddress
    };

    const types = {
      NativePayment: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'paymentReference', type: 'string' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
      ]
    };

         const value = {
       from: request.from,
       to: request.to,
       amount: request.amount,
       paymentReference: request.paymentReference,
       nonce,
       deadline: request.deadline
     };

     return await (wallet as ethers.Wallet).signTypedData(domain, types, value);
  }

  /**
   * Create signature for token meta-transaction
   */
  private async createTokenMetaTransactionSignature(
    request: MetaTransactionRequest,
    nonce: bigint,
    contractAddress: string
  ): Promise<string> {
    const wallet = await this.multiChainWalletManager.createOrLoadWallet();
    
    const domain = {
      name: 'AirChainPayToken',
      version: '1',
      chainId: parseInt(request.chainId),
      verifyingContract: contractAddress
    };

    const types = {
      TokenPayment: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'paymentReference', type: 'string' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
      ]
    };

         const value = {
       from: request.from,
       to: request.to,
       token: request.tokenAddress,
       amount: request.amount,
       paymentReference: request.paymentReference,
       nonce,
       deadline: request.deadline
     };

     return await (wallet as ethers.Wallet).signTypedData(domain, types, value);
  }

  /**
   * Get contract address for a specific chain
   */
  private getContractAddress(chainId: string): string {
    const chain = SUPPORTED_CHAINS[chainId];
    if (!chain?.contractAddress) {
      throw new Error(`Contract address not configured for chain: ${chainId}`);
    }
    return chain.contractAddress;
  }

  /**
   * Create a meta-transaction request
   */
  createMetaTransactionRequest(
    from: string,
    to: string,
    amount: string,
    chainId: string,
    tokenAddress?: string,
    paymentReference?: string
  ): MetaTransactionRequest {
    // Validate amount before parsing
    if (!amount || typeof amount !== 'string') {
      throw new Error(`Invalid amount: ${amount}. Must be a non-empty string.`);
    }
    
    const amountString = amount.trim();
    if (amountString === '') {
      throw new Error('Amount cannot be empty');
    }
    
    // Check if the original amount was actually NaN
    if (typeof amount === 'number' && isNaN(amount)) {
      throw new Error('Amount is NaN (number)');
    }
    
    // Additional validation to catch NaN early
    if (amountString === 'NaN' || amountString === 'undefined' || amountString === 'null') {
      throw new Error(`Invalid amount string: ${amountString}`);
    }
    
    // Validate amount is a valid number
    const amountNum = parseFloat(amountString);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new Error(`Invalid amount: ${amountString}. Must be a positive number.`);
    }
    
    logger.info('[MetaTransaction] Amount validation passed', {
      originalAmount: amountString,
      parsedAmount: amountNum
    });

    const amountBigInt = ethers.parseUnits(amountString, 18); // Default to 18 decimals
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    
    return {
      from,
      to,
      amount: amountBigInt,
      tokenAddress,
      paymentReference: paymentReference || `Payment from ${from} to ${to} at ${Date.now()}`,
      deadline,
      chainId
    };
  }

  /**
   * Validate a meta-transaction request
   */
  validateMetaTransactionRequest(request: MetaTransactionRequest): { isValid: boolean; error?: string } {
    if (!request.from || !request.to) {
      return { isValid: false, error: 'Invalid addresses' };
    }
    
    if (request.amount <= 0n) {
      return { isValid: false, error: 'Invalid amount' };
    }
    
    if (!request.paymentReference) {
      return { isValid: false, error: 'Payment reference required' };
    }
    
    if (request.deadline <= Math.floor(Date.now() / 1000)) {
      return { isValid: false, error: 'Transaction expired' };
    }
    
    if (!SUPPORTED_CHAINS[request.chainId]) {
      return { isValid: false, error: 'Unsupported chain' };
    }
    
    return { isValid: true };
  }
} 