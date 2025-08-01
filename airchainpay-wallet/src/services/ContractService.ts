import { ethers } from 'ethers';
import { logger } from '../utils/Logger';
import { SUPPORTED_CHAINS } from '../constants/AppConfig';
import { AIRCHAINPAY_TOKEN_ABI, AIRCHAINPAY_ABI, ERC20_ABI } from '../constants/abi';
import { getContractAddress } from '../constants/contract';

export interface ContractCallOptions {
  gasLimit?: bigint;
  gasPrice?: bigint;
  value?: bigint;
}

export class ContractService {
  private static instance: ContractService;
  private providers: Record<string, ethers.Provider> = {};

  private constructor() {
    // Initialize providers for each supported chain
    Object.entries(SUPPORTED_CHAINS).forEach(([chainId, chain]) => {
      this.providers[chainId] = new ethers.JsonRpcProvider(chain.rpcUrl);
    });
  }

  static getInstance(): ContractService {
    if (!ContractService.instance) {
      ContractService.instance = new ContractService();
    }
    return ContractService.instance;
  }

  private getProvider(chainId: string): ethers.Provider {
    const provider = this.providers[chainId];
    if (!provider) {
      throw new Error(`Provider not initialized for chain: ${chainId}`);
    }
    return provider;
  }

  /**
   * Get AirChainPayToken contract instance
   */
  getAirChainPayTokenContract(chainId: string, signer?: ethers.Signer): any {
    const provider = this.getProvider(chainId);
    const contractAddress = getContractAddress(chainId);
    const contract = new ethers.Contract(contractAddress, AIRCHAINPAY_TOKEN_ABI, provider);
    
    if (signer) {
      return contract.connect(signer);
    }
    return contract;
  }

  /**
   * Get AirChainPay contract instance (legacy)
   */
  getAirChainPayContract(chainId: string, signer?: ethers.Signer): any {
    const provider = this.getProvider(chainId);
    const contractAddress = getContractAddress(chainId);
    const contract = new ethers.Contract(contractAddress, AIRCHAINPAY_ABI, provider);
    
    if (signer) {
      return contract.connect(signer);
    }
    return contract;
  }

  /**
   * Get ERC-20 token contract instance
   */
  getERC20Contract(tokenAddress: string, chainId: string, signer?: ethers.Signer): any {
    const provider = this.getProvider(chainId);
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    
    if (signer) {
      return contract.connect(signer);
    }
    return contract;
  }

  /**
   * Get supported tokens from AirChainPayToken contract
   */
  async getSupportedTokens(chainId: string): Promise<string[]> {
    try {
      const contract = this.getAirChainPayTokenContract(chainId);
      const tokens = await contract.getSupportedTokens();
      logger.info(`[ContractService] Retrieved ${tokens.length} supported tokens for chain ${chainId}`);
      return tokens;
    } catch (error) {
      logger.error(`[ContractService] Failed to get supported tokens for chain ${chainId}:`, error);
      throw error;
    }
  }

  /**
   * Get token configuration from AirChainPayToken contract
   */
  async getTokenConfig(tokenAddress: string, chainId: string): Promise<{
    isSupported: boolean;
    isStablecoin: boolean;
    decimals: number;
    symbol: string;
    minAmount: bigint;
    maxAmount: bigint;
  }> {
    try {
      const contract = this.getAirChainPayTokenContract(chainId);
      const config = await contract.getTokenConfig(tokenAddress);
      logger.info(`[ContractService] Retrieved token config for ${tokenAddress} on chain ${chainId}`);
      return config;
    } catch (error) {
      logger.error(`[ContractService] Failed to get token config for ${tokenAddress} on chain ${chainId}:`, error);
      throw error;
    }
  }

  /**
   * Get native fee rate from AirChainPayToken contract
   */
  async getNativeFeeRate(chainId: string): Promise<bigint> {
    try {
      const contract = this.getAirChainPayTokenContract(chainId);
      const feeRate = await contract.nativeFeeRate();
      logger.info(`[ContractService] Native fee rate for chain ${chainId}: ${feeRate}`);
      return feeRate;
    } catch (error) {
      logger.error(`[ContractService] Failed to get native fee rate for chain ${chainId}:`, error);
      throw error;
    }
  }

  /**
   * Get token fee rate from AirChainPayToken contract
   */
  async getTokenFeeRate(chainId: string): Promise<bigint> {
    try {
      const contract = this.getAirChainPayTokenContract(chainId);
      const feeRate = await contract.tokenFeeRate();
      logger.info(`[ContractService] Token fee rate for chain ${chainId}: ${feeRate}`);
      return feeRate;
    } catch (error) {
      logger.error(`[ContractService] Failed to get token fee rate for chain ${chainId}:`, error);
      throw error;
    }
  }

  /**
   * Get payment details from AirChainPayToken contract
   */
  async getPayment(paymentId: string, chainId: string): Promise<{
    from: string;
    to: string;
    amount: bigint;
    token: string;
    tokenType: number;
    paymentReference: string;
    timestamp: bigint;
    paymentId: string;
    isRelayed: boolean;
  }> {
    try {
      const contract = this.getAirChainPayTokenContract(chainId);
      const payment = await contract.payments(paymentId);
      logger.info(`[ContractService] Retrieved payment ${paymentId} for chain ${chainId}`);
      return payment;
    } catch (error) {
      logger.error(`[ContractService] Failed to get payment ${paymentId} for chain ${chainId}:`, error);
      throw error;
    }
  }

  /**
   * Get user payment count from AirChainPayToken contract
   */
  async getUserPaymentCount(userAddress: string, chainId: string): Promise<bigint> {
    try {
      const contract = this.getAirChainPayTokenContract(chainId);
      const count = await contract.userPaymentCount(userAddress);
      logger.info(`[ContractService] User payment count for ${userAddress} on chain ${chainId}: ${count}`);
      return count;
    } catch (error) {
      logger.error(`[ContractService] Failed to get user payment count for ${userAddress} on chain ${chainId}:`, error);
      throw error;
    }
  }

  /**
   * Get total payments from AirChainPayToken contract
   */
  async getTotalPayments(chainId: string): Promise<bigint> {
    try {
      const contract = this.getAirChainPayTokenContract(chainId);
      const total = await contract.totalPayments();
      logger.info(`[ContractService] Total payments for chain ${chainId}: ${total}`);
      return total;
    } catch (error) {
      logger.error(`[ContractService] Failed to get total payments for chain ${chainId}:`, error);
      throw error;
    }
  }

  /**
   * Get total native volume from AirChainPayToken contract
   */
  async getTotalNativeVolume(chainId: string): Promise<bigint> {
    try {
      const contract = this.getAirChainPayTokenContract(chainId);
      const volume = await contract.totalNativeVolume();
      logger.info(`[ContractService] Total native volume for chain ${chainId}: ${volume}`);
      return volume;
    } catch (error) {
      logger.error(`[ContractService] Failed to get total native volume for chain ${chainId}:`, error);
      throw error;
    }
  }

  /**
   * Get total token volume from AirChainPayToken contract
   */
  async getTotalTokenVolume(tokenAddress: string, chainId: string): Promise<bigint> {
    try {
      const contract = this.getAirChainPayTokenContract(chainId);
      const volume = await contract.totalTokenVolume(tokenAddress);
      logger.info(`[ContractService] Total token volume for ${tokenAddress} on chain ${chainId}: ${volume}`);
      return volume;
    } catch (error) {
      logger.error(`[ContractService] Failed to get total token volume for ${tokenAddress} on chain ${chainId}:`, error);
      throw error;
    }
  }

  /**
   * Get nonce for a user on a specific chain
   */
  async getNonce(userAddress: string, chainId: string): Promise<bigint> {
    try {
      const contract = this.getAirChainPayTokenContract(chainId);
      const nonce = await contract.getNonce(userAddress);
      logger.info(`[ContractService] Nonce for ${userAddress} on chain ${chainId}: ${nonce}`);
      return nonce;
    } catch (error) {
      logger.error(`[ContractService] Failed to get nonce for ${userAddress} on chain ${chainId}:`, error);
      throw error;
    }
  }

  /**
   * Execute native meta-transaction
   */
  async executeNativeMetaTransaction(
    from: string,
    to: string,
    amount: bigint,
    paymentReference: string,
    deadline: number,
    signature: string,
    chainId: string,
    signer: ethers.Signer,
    options?: ContractCallOptions
  ): Promise<ethers.TransactionResponse> {
    try {
      const contract = this.getAirChainPayTokenContract(chainId, signer);
      const tx = await contract.executeNativeMetaTransaction(
        from,
        to,
        amount,
        paymentReference,
        deadline,
        signature,
        { 
          value: amount,
          gasLimit: options?.gasLimit,
          gasPrice: options?.gasPrice
        }
      );
      logger.info(`[ContractService] Native meta-transaction executed: ${tx.hash}`);
      return tx;
    } catch (error) {
      logger.error(`[ContractService] Failed to execute native meta-transaction:`, error);
      throw error;
    }
  }

  /**
   * Execute token meta-transaction
   */
  async executeTokenMetaTransaction(
    from: string,
    to: string,
    tokenAddress: string,
    amount: bigint,
    paymentReference: string,
    deadline: number,
    signature: string,
    chainId: string,
    signer: ethers.Signer,
    options?: ContractCallOptions
  ): Promise<ethers.TransactionResponse> {
    try {
      const contract = this.getAirChainPayTokenContract(chainId, signer);
      const tx = await contract.executeTokenMetaTransaction(
        from,
        to,
        tokenAddress,
        amount,
        paymentReference,
        deadline,
        signature,
        { 
          gasLimit: options?.gasLimit,
          gasPrice: options?.gasPrice
        }
      );
      logger.info(`[ContractService] Token meta-transaction executed: ${tx.hash}`);
      return tx;
    } catch (error) {
      logger.error(`[ContractService] Failed to execute token meta-transaction:`, error);
      throw error;
    }
  }

  /**
   * Execute batch native meta-transaction
   */
  async executeBatchNativeMetaTransaction(
    from: string,
    recipients: string[],
    amounts: bigint[],
    paymentReference: string,
    deadline: number,
    signature: string,
    chainId: string,
    signer: ethers.Signer,
    options?: ContractCallOptions
  ): Promise<ethers.TransactionResponse> {
    try {
      const contract = this.getAirChainPayTokenContract(chainId, signer);
      const totalAmount = amounts.reduce((sum, amount) => sum + amount, 0n);
      const tx = await contract.executeBatchNativeMetaTransaction(
        from,
        recipients,
        amounts,
        paymentReference,
        deadline,
        signature,
        { 
          value: totalAmount,
          gasLimit: options?.gasLimit,
          gasPrice: options?.gasPrice
        }
      );
      logger.info(`[ContractService] Batch native meta-transaction executed: ${tx.hash}`);
      return tx;
    } catch (error) {
      logger.error(`[ContractService] Failed to execute batch native meta-transaction:`, error);
      throw error;
    }
  }

  /**
   * Execute batch token meta-transaction
   */
  async executeBatchTokenMetaTransaction(
    from: string,
    tokenAddress: string,
    recipients: string[],
    amounts: bigint[],
    paymentReference: string,
    deadline: number,
    signature: string,
    chainId: string,
    signer: ethers.Signer,
    options?: ContractCallOptions
  ): Promise<ethers.TransactionResponse> {
    try {
      const contract = this.getAirChainPayTokenContract(chainId, signer);
      const tx = await contract.executeBatchTokenMetaTransaction(
        from,
        tokenAddress,
        recipients,
        amounts,
        paymentReference,
        deadline,
        signature,
        { 
          gasLimit: options?.gasLimit,
          gasPrice: options?.gasPrice
        }
      );
      logger.info(`[ContractService] Batch token meta-transaction executed: ${tx.hash}`);
      return tx;
    } catch (error) {
      logger.error(`[ContractService] Failed to execute batch token meta-transaction:`, error);
      throw error;
    }
  }
} 