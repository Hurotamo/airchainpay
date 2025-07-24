import { ethers } from 'ethers';
import { logger } from './Logger';
import { SUPPORTED_CHAINS } from '../constants/AppConfig';

/**
 * Gas Price Validation System
 * 
 * Implements comprehensive gas price validation and limits to prevent:
 * - Excessive gas fees
 * - Front-running attacks
 * - Gas price manipulation
 * - Unreasonable transaction costs
 */
export class GasPriceValidator {
  // Gas price limits in gwei for different networks
  private static readonly GAS_PRICE_LIMITS = {
    base_sepolia: {
      min: 0.1,      // 0.1 gwei minimum
      max: 50,       // 50 gwei maximum
      warning: 20,   // Warning at 20 gwei
      emergency: 100 // Emergency limit
    },
    core_testnet: {
      min: 0.1,
      max: 100,      // Higher limit for Core
      warning: 50,
      emergency: 200
    }
  };

  // Gas limit bounds for different transaction types
  private static readonly GAS_LIMIT_BOUNDS = {
    nativeTransfer: {
      min: 21000,
      max: 25000,
      recommended: 21000
    },
    erc20Transfer: {
      min: 65000,
      max: 80000,
      recommended: 65000
    },
    contractInteraction: {
      min: 100000,
      max: 500000,
      recommended: 150000
    },
    complexTransaction: {
      min: 200000,
      max: 1000000,
      recommended: 300000
    }
  };

  // Dynamic gas price tracking
  private static gasPriceHistory: Map<string, { timestamp: number; price: bigint }[]> = new Map();
  private static readonly HISTORY_WINDOW = 10 * 60 * 1000; // 10 minutes

  /**
   * Validate gas price for a transaction
   * @param gasPrice - Gas price in wei
   * @param chainId - Blockchain network ID
   * @returns Validation result with details
   */
  static validateGasPrice(gasPrice: bigint, chainId: string): GasPriceValidationResult {
    try {
      const limits = this.GAS_PRICE_LIMITS[chainId as keyof typeof this.GAS_PRICE_LIMITS];
      if (!limits) {
        return {
          isValid: false,
          error: `Unsupported chain: ${chainId}`,
          details: {
            chainId,
            gasPrice: gasPrice.toString(),
            limits: null
          }
        };
      }

      const gasPriceGwei = Number(ethers.formatUnits(gasPrice, 'gwei'));
      
      // Check minimum gas price
      if (gasPriceGwei < limits.min) {
        return {
          isValid: false,
          error: `Gas price too low: ${gasPriceGwei.toFixed(2)} gwei (minimum: ${limits.min} gwei)`,
          details: {
            chainId,
            gasPrice: gasPrice.toString(),
            gasPriceGwei,
            limits,
            issue: 'below_minimum'
          }
        };
      }

      // Check maximum gas price
      if (gasPriceGwei > limits.max) {
        return {
          isValid: false,
          error: `Gas price too high: ${gasPriceGwei.toFixed(2)} gwei (maximum: ${limits.max} gwei)`,
          details: {
            chainId,
            gasPrice: gasPrice.toString(),
            gasPriceGwei,
            limits,
            issue: 'above_maximum'
          }
        };
      }

      // Check for suspicious price spikes
      const spikeCheck = this.checkForPriceSpike(gasPrice, chainId);
      if (!spikeCheck.isValid) {
        return {
          isValid: false,
          error: `Suspicious gas price spike detected: ${spikeCheck.error}`,
          details: {
            chainId,
            gasPrice: gasPrice.toString(),
            gasPriceGwei,
            limits,
            issue: 'price_spike',
            spikeDetails: spikeCheck.details
          }
        };
      }

      // Determine warning level
      let warningLevel: 'none' | 'warning' | 'high' = 'none';
      if (gasPriceGwei > limits.emergency) {
        warningLevel = 'high';
      } else if (gasPriceGwei > limits.warning) {
        warningLevel = 'warning';
      }

      logger.info('[GasPriceValidator] Gas price validation passed', {
        chainId,
        gasPrice: gasPrice.toString(),
        gasPriceGwei,
        warningLevel
      });

      return {
        isValid: true,
        gasPrice: gasPrice.toString(),
        gasPriceGwei,
        warningLevel,
        details: {
          chainId,
          gasPrice: gasPrice.toString(),
          gasPriceGwei,
          limits,
          issue: null
        }
      };

    } catch (error) {
      logger.error('[GasPriceValidator] Gas price validation failed:', error);
      return {
        isValid: false,
        error: `Gas price validation error: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          chainId,
          gasPrice: gasPrice.toString(),
          limits: null
        }
      };
    }
  }

  /**
   * Validate gas limit for transaction type
   * @param gasLimit - Gas limit in wei
   * @param transactionType - Type of transaction
   * @returns Validation result
   */
  static validateGasLimit(gasLimit: bigint, transactionType: keyof typeof this.GAS_LIMIT_BOUNDS): GasLimitValidationResult {
    try {
      const bounds = this.GAS_LIMIT_BOUNDS[transactionType];
      if (!bounds) {
        return {
          isValid: false,
          error: `Unknown transaction type: ${transactionType}`,
          details: {
            gasLimit: gasLimit.toString(),
            transactionType,
            bounds: null
          }
        };
      }

      const gasLimitNumber = Number(gasLimit);

      // Check minimum gas limit
      if (gasLimitNumber < bounds.min) {
        return {
          isValid: false,
          error: `Gas limit too low: ${gasLimitNumber} (minimum: ${bounds.min})`,
          details: {
            gasLimit: gasLimit.toString(),
            transactionType,
            bounds,
            issue: 'below_minimum'
          }
        };
      }

      // Check maximum gas limit
      if (gasLimitNumber > bounds.max) {
        return {
          isValid: false,
          error: `Gas limit too high: ${gasLimitNumber} (maximum: ${bounds.max})`,
          details: {
            gasLimit: gasLimit.toString(),
            transactionType,
            bounds,
            issue: 'above_maximum'
          }
        };
      }

      // Determine efficiency
      const efficiency = gasLimitNumber <= bounds.recommended ? 'optimal' : 
                       gasLimitNumber <= bounds.recommended * 1.2 ? 'good' : 'high';

      logger.info('[GasPriceValidator] Gas limit validation passed', {
        transactionType,
        gasLimit: gasLimit.toString(),
        efficiency
      });

      return {
        isValid: true,
        gasLimit: gasLimit.toString(),
        efficiency,
        details: {
          gasLimit: gasLimit.toString(),
          transactionType,
          bounds,
          issue: null
        }
      };

    } catch (error) {
      logger.error('[GasPriceValidator] Gas limit validation failed:', error);
      return {
        isValid: false,
        error: `Gas limit validation error: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          gasLimit: gasLimit.toString(),
          transactionType,
          bounds: null
        }
      };
    }
  }

  /**
   * Estimate optimal gas price for a transaction
   * @param chainId - Blockchain network ID
   * @param priority - Transaction priority (low, normal, high, urgent)
   * @returns Estimated gas price
   */
  static async estimateOptimalGasPrice(
    chainId: string, 
    priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal'
  ): Promise<GasPriceEstimate> {
    try {
      const limits = this.GAS_PRICE_LIMITS[chainId as keyof typeof this.GAS_PRICE_LIMITS];
      if (!limits) {
        throw new Error(`Unsupported chain: ${chainId}`);
      }

      // Get current network gas price
      const provider = this.getProvider(chainId);
      const feeData = await provider.getFeeData();
      const currentGasPrice = feeData.gasPrice || ethers.parseUnits('1', 'gwei');

      // Calculate optimal gas price based on priority
      let optimalGasPrice: bigint;
      const currentGwei = Number(ethers.formatUnits(currentGasPrice, 'gwei'));

      switch (priority) {
        case 'low':
          optimalGasPrice = ethers.parseUnits(Math.max(currentGwei * 0.8, limits.min).toString(), 'gwei');
          break;
        case 'normal':
          optimalGasPrice = currentGasPrice;
          break;
        case 'high':
          optimalGasPrice = ethers.parseUnits(Math.min(currentGwei * 1.5, limits.max).toString(), 'gwei');
          break;
        case 'urgent':
          optimalGasPrice = ethers.parseUnits(Math.min(currentGwei * 2, limits.max).toString(), 'gwei');
          break;
        default:
          optimalGasPrice = currentGasPrice;
      }

      // Validate the estimated gas price
      const validation = this.validateGasPrice(optimalGasPrice, chainId);
      if (!validation.isValid) {
        // Fall back to a safe default
        optimalGasPrice = ethers.parseUnits(limits.warning.toString(), 'gwei');
      }

      // Record gas price for history
      this.recordGasPrice(chainId, optimalGasPrice);

      logger.info('[GasPriceValidator] Gas price estimated', {
        chainId,
        priority,
        currentGasPrice: currentGasPrice.toString(),
        optimalGasPrice: optimalGasPrice.toString(),
        currentGwei,
        optimalGwei: Number(ethers.formatUnits(optimalGasPrice, 'gwei'))
      });

      return {
        gasPrice: optimalGasPrice.toString(),
        gasPriceGwei: Number(ethers.formatUnits(optimalGasPrice, 'gwei')),
        priority,
        chainId,
        isValid: true
      };

    } catch (error) {
      logger.error('[GasPriceValidator] Failed to estimate gas price:', error);
      return {
        gasPrice: '0',
        gasPriceGwei: 0,
        priority,
        chainId,
        isValid: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Check for suspicious gas price spikes
   * @param gasPrice - Current gas price
   * @param chainId - Blockchain network ID
   * @returns Spike detection result
   */
  private static checkForPriceSpike(gasPrice: bigint, chainId: string): SpikeDetectionResult {
    try {
      const history = this.gasPriceHistory.get(chainId) || [];
      const now = Date.now();
      
      // Clean old entries
      const recentHistory = history.filter(entry => now - entry.timestamp < this.HISTORY_WINDOW);
      this.gasPriceHistory.set(chainId, recentHistory);

      if (recentHistory.length < 3) {
        // Not enough history to detect spikes
        return { isValid: true };
      }

      // Calculate average gas price from recent history
      const recentPrices = recentHistory.slice(-5); // Last 5 entries
      const totalPrice = recentPrices.reduce((sum, entry) => sum + entry.price, BigInt(0));
      const averagePrice = totalPrice / BigInt(recentPrices.length);

      // Check if current price is significantly higher than average
      const priceRatio = Number(gasPrice) / Number(averagePrice);
      const spikeThreshold = 3.0; // 3x increase is suspicious

      if (priceRatio > spikeThreshold) {
        return {
          isValid: false,
          error: `Gas price spike detected: ${priceRatio.toFixed(2)}x above average`,
          details: {
            currentPrice: gasPrice.toString(),
            averagePrice: averagePrice.toString(),
            priceRatio,
            spikeThreshold,
            recentHistoryLength: recentHistory.length
          }
        };
      }

      return { isValid: true };

    } catch (error) {
      logger.error('[GasPriceValidator] Spike detection failed:', error);
      return { isValid: true }; // Fail safe - allow transaction
    }
  }

  /**
   * Record gas price for historical analysis
   * @param chainId - Blockchain network ID
   * @param gasPrice - Gas price to record
   */
  private static recordGasPrice(chainId: string, gasPrice: bigint): void {
    try {
      const history = this.gasPriceHistory.get(chainId) || [];
      history.push({
        timestamp: Date.now(),
        price: gasPrice
      });

      // Keep only recent history
      const now = Date.now();
      const recentHistory = history.filter(entry => now - entry.timestamp < this.HISTORY_WINDOW);
      this.gasPriceHistory.set(chainId, recentHistory);

    } catch (error) {
      logger.error('[GasPriceValidator] Failed to record gas price:', error);
    }
  }

  /**
   * Get provider for chain
   * @param chainId - Blockchain network ID
   * @returns Ethers provider
   */
  private static getProvider(chainId: string): ethers.Provider {
    const chainConfig = SUPPORTED_CHAINS[chainId as keyof typeof SUPPORTED_CHAINS];
    if (!chainConfig) {
      throw new Error(`Unsupported chain: ${chainId}`);
    }
    return new ethers.JsonRpcProvider(chainConfig.rpcUrl);
  }

  /**
   * Get gas price statistics for a chain
   * @param chainId - Blockchain network ID
   * @returns Gas price statistics
   */
  static getGasPriceStats(chainId: string): GasPriceStats {
    try {
      const history = this.gasPriceHistory.get(chainId) || [];
      const now = Date.now();
      const recentHistory = history.filter(entry => now - entry.timestamp < this.HISTORY_WINDOW);

      if (recentHistory.length === 0) {
        return {
          chainId,
          averagePrice: '0',
          minPrice: '0',
          maxPrice: '0',
          priceCount: 0,
          lastUpdate: 0
        };
      }

      const prices = recentHistory.map(entry => entry.price);
      const totalPrice = prices.reduce((sum, price) => sum + price, BigInt(0));
      const averagePrice = totalPrice / BigInt(prices.length);
      const minPrice = prices.reduce((min, price) => price < min ? price : min);
      const maxPrice = prices.reduce((max, price) => price > max ? price : max);

      return {
        chainId,
        averagePrice: averagePrice.toString(),
        minPrice: minPrice.toString(),
        maxPrice: maxPrice.toString(),
        priceCount: recentHistory.length,
        lastUpdate: recentHistory[recentHistory.length - 1]?.timestamp || 0
      };

    } catch (error) {
      logger.error('[GasPriceValidator] Failed to get gas price stats:', error);
      return {
        chainId,
        averagePrice: '0',
        minPrice: '0',
        maxPrice: '0',
        priceCount: 0,
        lastUpdate: 0
      };
    }
  }

  /**
   * Check if gas price is reasonable for the current network conditions
   * @param gasPrice - Gas price to check
   * @param chainId - Blockchain network ID
   * @returns Reasonableness check result
   */
  static async isGasPriceReasonable(gasPrice: bigint, chainId: string): Promise<ReasonablenessCheck> {
    try {
      const provider = this.getProvider(chainId);
      const feeData = await provider.getFeeData();
      const currentGasPrice = feeData.gasPrice || ethers.parseUnits('1', 'gwei');

      const currentGwei = Number(ethers.formatUnits(currentGasPrice, 'gwei'));
      const proposedGwei = Number(ethers.formatUnits(gasPrice, 'gwei'));

      const ratio = proposedGwei / currentGwei;
      let reasonableness: 'very_low' | 'low' | 'reasonable' | 'high' | 'very_high';

      if (ratio < 0.5) reasonableness = 'very_low';
      else if (ratio < 0.8) reasonableness = 'low';
      else if (ratio <= 1.5) reasonableness = 'reasonable';
      else if (ratio <= 3.0) reasonableness = 'high';
      else reasonableness = 'very_high';

      return {
        isReasonable: reasonableness === 'reasonable',
        reasonableness,
        ratio,
        currentGasPrice: currentGasPrice.toString(),
        proposedGasPrice: gasPrice.toString(),
        currentGwei,
        proposedGwei,
        chainId
      };

    } catch (error) {
      logger.error('[GasPriceValidator] Reasonableness check failed:', error);
      return {
        isReasonable: false,
        reasonableness: 'very_high',
        ratio: 999,
        currentGasPrice: '0',
        proposedGasPrice: gasPrice.toString(),
        currentGwei: 0,
        proposedGwei: Number(ethers.formatUnits(gasPrice, 'gwei')),
        chainId,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

/**
 * Gas Price Validation Result Interface
 */
export interface GasPriceValidationResult {
  isValid: boolean;
  error?: string;
  gasPrice?: string;
  gasPriceGwei?: number;
  warningLevel?: 'none' | 'warning' | 'high';
  details: {
    chainId: string;
    gasPrice: string;
    gasPriceGwei?: number;
    limits?: any;
    issue?: string | null;
    spikeDetails?: any;
  };
}

/**
 * Gas Limit Validation Result Interface
 */
export interface GasLimitValidationResult {
  isValid: boolean;
  error?: string;
  gasLimit?: string;
  efficiency?: 'optimal' | 'good' | 'high';
  details: {
    gasLimit: string;
    transactionType: string;
    bounds?: any;
    issue?: string | null;
  };
}

/**
 * Gas Price Estimate Interface
 */
export interface GasPriceEstimate {
  gasPrice: string;
  gasPriceGwei: number;
  priority: string;
  chainId: string;
  isValid: boolean;
  error?: string;
}

/**
 * Spike Detection Result Interface
 */
export interface SpikeDetectionResult {
  isValid: boolean;
  error?: string;
  details?: any;
}

/**
 * Gas Price Statistics Interface
 */
export interface GasPriceStats {
  chainId: string;
  averagePrice: string;
  minPrice: string;
  maxPrice: string;
  priceCount: number;
  lastUpdate: number;
}

/**
 * Reasonableness Check Interface
 */
export interface ReasonablenessCheck {
  isReasonable: boolean;
  reasonableness: 'very_low' | 'low' | 'reasonable' | 'high' | 'very_high';
  ratio: number;
  currentGasPrice: string;
  proposedGasPrice: string;
  currentGwei: number;
  proposedGwei: number;
  chainId: string;
  error?: string;
} 