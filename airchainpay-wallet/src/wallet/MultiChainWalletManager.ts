import { ethers } from 'ethers';
import { SUPPORTED_CHAINS } from '../constants/AppConfig';
import { logger } from '../utils/Logger';
import { secureStorage } from '../utils/SecureStorageService';
import { PasswordHasher } from '../utils/crypto/PasswordHasher';
import { PasswordMigration } from '../utils/crypto/PasswordMigration';
import { WalletCorruptionFix } from '../utils/WalletCorruptionFix';
import {  AIRCHAINPAY_TOKEN_ABI } from '../constants/abi';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys - hardcoded to avoid import issues
const STORAGE_KEYS = {
  PRIVATE_KEY: 'wallet_private_key',
  SEED_PHRASE: 'wallet_seed_phrase',
  TEMP_SEED_PHRASE: 'temp_seed_phrase',
  WALLET_PASSWORD: 'wallet_password',
  BACKUP_CONFIRMED: 'backup_confirmed'
} as const;

// Validate storage keys on initialization
console.log('[MultiChain] Storage keys initialized:', STORAGE_KEYS);
Object.entries(STORAGE_KEYS).forEach(([key, value]) => {
  if (!value || typeof value !== 'string') {
    console.error(`[MultiChain] Invalid storage key ${key}:`, value);
  } else {
    console.log(`[MultiChain] Valid storage key ${key}:`, value);
  }
});

export interface WalletInfo {
  address: string;
  balance: string;
  type: 'evm';
  chainId: string;
}

interface MinimalWallet {
  address: string;
  privateKey: string;
  [key: string]: unknown;
}

type WalletType = MinimalWallet | ethers.Wallet | ethers.HDNodeWallet;

// Add type guards for ethers.Wallet and ethers.HDNodeWallet
function isEthersWallet(wallet: WalletType): wallet is ethers.Wallet {
  return (wallet as ethers.Wallet).connect !== undefined && typeof (wallet as ethers.Wallet).connect === 'function';
}
function isHDNodeWallet(wallet: WalletType): wallet is ethers.HDNodeWallet {
  return (wallet as ethers.HDNodeWallet).signMessage !== undefined && typeof (wallet as ethers.HDNodeWallet).signMessage === 'function';
}

export class MultiChainWalletManager {
  private static instance: MultiChainWalletManager;
  private wallet: WalletType | null = null;
  private providers: Record<string, ethers.Provider> = {};

  private constructor() {
    // Initialize providers for each supported chain
    Object.entries(SUPPORTED_CHAINS).forEach(([chainId, chain]) => {
      this.providers[chainId] = new ethers.JsonRpcProvider(chain.rpcUrl);
    });
  }

  public static getInstance(): MultiChainWalletManager {
    if (!MultiChainWalletManager.instance) {
      MultiChainWalletManager.instance = new MultiChainWalletManager();
    }
    return MultiChainWalletManager.instance;
  }

  async hasWallet(): Promise<boolean> {
    try {
      console.log('[MultiChain] STORAGE_KEYS:', STORAGE_KEYS);
      console.log('[MultiChain] PRIVATE_KEY key:', STORAGE_KEYS.PRIVATE_KEY);
      
      // Safety check for the key
      if (!STORAGE_KEYS.PRIVATE_KEY) {
        console.error('[MultiChain] PRIVATE_KEY is undefined!');
        return false;
      }
      
      const privateKey = await secureStorage.getItem(STORAGE_KEYS.PRIVATE_KEY);
      if (!privateKey) {
        logger.info('[MultiChain] No private key found');
        return false;
      }

      // Check if private key is corrupted (boolean values or invalid format)
      if (privateKey === 'true' || privateKey === 'false' || 
          privateKey === '0xtrue' || privateKey === '0xfalse' ||
          privateKey === 'null' || privateKey === 'undefined' ||
          privateKey === 'NaN' || privateKey === '0xNaN') {
        logger.warn('[MultiChain] Corrupted private key detected:', privateKey);
        return false;
      }

      // Check if private key format is valid
      if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
        logger.warn('[MultiChain] Invalid private key format detected:', privateKey);
        return false;
      }

      // Additional validation: try to create a wallet with the private key
      try {
        new ethers.Wallet(privateKey);
        logger.info('[MultiChain] Private key validation successful');
      } catch (validationError) {
        logger.warn('[MultiChain] Private key validation failed:', validationError);
        return false;
      }

      const hasWallet = true;
      logger.info(`[MultiChain] hasWallet check: ${hasWallet}`);
      return hasWallet;
    } catch (error: unknown) {
      if (error instanceof Error) {
        const errorMessage = error.message;
        const errorDetails = {
          name: error.name,
          message: error.message,
          stack: error.stack
        };
        
        logger.error('[MultiChain] Failed to check wallet existence:', errorMessage, errorDetails);
      } else {
        logger.error('[MultiChain] Failed to check wallet existence:', String(error));
      }
      return false;
    }
  }

  async hasTemporarySeedPhrase(): Promise<boolean> {
    try {
      const tempSeedPhrase = await secureStorage.getItem(STORAGE_KEYS.TEMP_SEED_PHRASE);
      return !!tempSeedPhrase;
    } catch (error: unknown) {
      if (error instanceof Error) {
        const errorMessage = error.message;
        const errorDetails = {
          name: error.name,
          message: error.message,
          stack: error.stack
        };
        
        logger.error('[MultiChain] Failed to check temporary seed phrase existence:', errorMessage, errorDetails);
      } else {
        logger.error('[MultiChain] Failed to check temporary seed phrase existence:', String(error));
      }
      return false;
    }
  }

  async clearTemporarySeedPhrase(): Promise<void> {
    try {
      await secureStorage.deleteItem(STORAGE_KEYS.TEMP_SEED_PHRASE);
      logger.info('[MultiChain] Temporary seed phrase cleared');
    } catch (error: unknown) {
      if (error instanceof Error) {
        const errorMessage = error.message;
        const errorDetails = {
          name: error.name,
          message: error.message,
          stack: error.stack
        };
        
        logger.error('[MultiChain] Failed to clear temporary seed phrase:', errorMessage, errorDetails);
      } else {
        logger.error('[MultiChain] Failed to clear temporary seed phrase:', String(error));
      }
      throw error;
    }
  }

  async logStorageState(): Promise<void> {
    try {
      const privateKey = await secureStorage.getItem(STORAGE_KEYS.PRIVATE_KEY);
      const seedPhrase = await secureStorage.getItem(STORAGE_KEYS.SEED_PHRASE);
      const tempSeedPhrase = await secureStorage.getItem(STORAGE_KEYS.TEMP_SEED_PHRASE);
      const password = await secureStorage.getItem(STORAGE_KEYS.WALLET_PASSWORD);
      const backupConfirmed = await secureStorage.getItem(STORAGE_KEYS.BACKUP_CONFIRMED);

      const securityLevel = await secureStorage.getSecurityLevel();
      const keychainAvailable = await secureStorage.isKeychainAvailable();
      
      logger.info('[MultiChain] Storage state:', {
        hasPrivateKey: !!privateKey,
        hasSeedPhrase: !!seedPhrase,
        hasTempSeedPhrase: !!tempSeedPhrase,
        hasPassword: !!password,
        backupConfirmed: backupConfirmed === 'true',
        securityLevel,
        keychainAvailable
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[MultiChain] Failed to log storage state:', error);
      } else {
        logger.error('[MultiChain] Failed to log storage state:', String(error));
      }
    }
  }

  async validateWalletConsistency(): Promise<{ isValid: boolean; error?: string }> {
    try {
      const privateKey = await secureStorage.getItem(STORAGE_KEYS.PRIVATE_KEY);
      const seedPhrase = await secureStorage.getItem(STORAGE_KEYS.SEED_PHRASE);

      if (!privateKey) {
        return { isValid: false, error: 'No private key found' };
      }

      if (!seedPhrase) {
        // If no seed phrase, that's fine for imported private keys
        return { isValid: true };
      }

      // If both exist, verify they match
      try {
        const seedWallet = ethers.Wallet.fromPhrase(seedPhrase);
        if (seedWallet.privateKey !== privateKey) {
          return { 
            isValid: false, 
            error: 'Private key and seed phrase do not match. Please clear the wallet and re-import.' 
          };
        }
        return { isValid: true };
      } catch (error: unknown) {
        if (error instanceof Error) {
          return { 
            isValid: false, 
            error: 'Invalid seed phrase found. Please clear the wallet and re-import.' 
          };
        } else {
          return { 
            isValid: false, 
            error: 'Failed to validate wallet consistency' 
          };
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        return { 
          isValid: false, 
          error: 'Failed to validate wallet consistency' 
        };
      } else {
        return { 
          isValid: false, 
          error: 'Failed to validate wallet consistency' 
        };
      }
    }
  }

  async generateSeedPhrase(): Promise<string> {
    try {
      const wallet = ethers.Wallet.createRandom();
      const seedPhrase = wallet.mnemonic?.phrase;
      if (!seedPhrase) {
        const error = new Error('Failed to generate seed phrase');
        logger.error('[MultiChain] Failed to generate seed phrase: No mnemonic phrase generated');
        throw error;
      }
      
      // Store temporarily until backup is confirmed
      await secureStorage.setItem(STORAGE_KEYS.TEMP_SEED_PHRASE, seedPhrase);
      logger.info('[MultiChain] Temporary seed phrase stored successfully');
      
      // Verify storage
      const storedSeedPhrase = await secureStorage.getItem(STORAGE_KEYS.TEMP_SEED_PHRASE);
      if (!storedSeedPhrase) {
        throw new Error('Failed to store temporary seed phrase');
      }
      
      return seedPhrase;
    } catch (error: unknown) {
      if (error instanceof Error) {
        const errorMessage = error.message;
        const errorDetails = {
          name: error.name,
          message: error.message,
          stack: error.stack
        };
        
        logger.error('[MultiChain] Failed to generate seed phrase:', errorMessage, errorDetails);
      } else {
        logger.error('[MultiChain] Failed to generate seed phrase:', String(error));
      }
      throw error;
    }
  }

  async setWalletPassword(password: string): Promise<void> {
    try {
      // Hash the password before storing
      const hashedPassword = PasswordHasher.hashPassword(password);
      await secureStorage.setItem(STORAGE_KEYS.WALLET_PASSWORD, hashedPassword);
      logger.info('[MultiChain] Wallet password hashed and stored successfully');
    } catch (error: unknown) {
      if (error instanceof Error) {
        const errorMessage = error.message;
        const errorDetails = {
          name: error.name,
          message: error.message,
          stack: error.stack
        };
        
        logger.error('[MultiChain] Failed to set wallet password:', errorMessage, errorDetails);
      } else {
        logger.error('[MultiChain] Failed to set wallet password:', String(error));
      }
      throw error;
    }
  }

  async confirmBackup(): Promise<void> {
    try {
      // Log current storage state for debugging
      await this.logStorageState();
      
      // First check if we already have a wallet with a seed phrase
      const existingSeedPhrase = await secureStorage.getItem(STORAGE_KEYS.SEED_PHRASE);
      if (existingSeedPhrase) {
        // If we already have a seed phrase stored, just set backup as confirmed
        await secureStorage.setItem(STORAGE_KEYS.BACKUP_CONFIRMED, 'true');
        logger.info('[MultiChain] Backup confirmed for existing wallet');
        return;
      }

      // Check for temporary seed phrase
      const tempSeedPhrase = await secureStorage.getItem(STORAGE_KEYS.TEMP_SEED_PHRASE);
      if (!tempSeedPhrase) {
        // Check if we have a private key but no seed phrase (imported wallet)
        const privateKey = await secureStorage.getItem(STORAGE_KEYS.PRIVATE_KEY);
        if (privateKey) {
          // For imported wallets without seed phrase, just confirm backup
          await secureStorage.setItem(STORAGE_KEYS.BACKUP_CONFIRMED, 'true');
          logger.info('[MultiChain] Backup confirmed for imported wallet without seed phrase');
          return;
        }
        
        const error = new Error('No seed phrase found in temporary storage');
        logger.error('[MultiChain] Failed to confirm backup: No seed phrase found');
        throw error;
      }

      const wallet = ethers.Wallet.fromPhrase(tempSeedPhrase);
      await secureStorage.setItem(STORAGE_KEYS.PRIVATE_KEY, wallet.privateKey);
      await secureStorage.setItem(STORAGE_KEYS.SEED_PHRASE, tempSeedPhrase);
      await secureStorage.deleteItem(STORAGE_KEYS.TEMP_SEED_PHRASE);
      await secureStorage.setItem(STORAGE_KEYS.BACKUP_CONFIRMED, 'true');

      this.wallet = wallet;
      logger.info('[MultiChain] Wallet backup confirmed and stored');
    } catch (error: unknown) {
      if (error instanceof Error) {
        const errorMessage = error.message;
        const errorDetails = {
          name: error.name,
          message: error.message,
          stack: error.stack
        };
        
        logger.error('[MultiChain] Failed to confirm backup:', errorMessage, errorDetails);
      } else {
        logger.error('[MultiChain] Failed to confirm backup:', String(error));
      }
      throw error;
    }
  }

  async importFromSeedPhrase(seedPhrase: string): Promise<void> {
    try {
      const wallet = ethers.Wallet.fromPhrase(seedPhrase);
      
      // Check if there's an existing private key and verify it matches
      const existingPrivateKey = await secureStorage.getItem(STORAGE_KEYS.PRIVATE_KEY);
      if (existingPrivateKey && existingPrivateKey !== wallet.privateKey) {
        throw new Error('Seed phrase does not match the existing private key. Please clear the wallet first.');
      }
      
      await secureStorage.setItem(STORAGE_KEYS.PRIVATE_KEY, wallet.privateKey);
      await secureStorage.setItem(STORAGE_KEYS.SEED_PHRASE, seedPhrase);
      // For imported wallets, we assume the user already has the seed phrase backed up
      await secureStorage.setItem(STORAGE_KEYS.BACKUP_CONFIRMED, 'true');

      this.wallet = wallet;
      logger.info('[MultiChain] Wallet imported from seed phrase');
    } catch (error: unknown) {
      if (error instanceof Error) {
        const errorMessage = error.message;
        const errorDetails = {
          name: error.name,
          message: error.message,
          stack: error.stack
        };
        
        logger.error('[MultiChain] Failed to import from seed phrase:', errorMessage, errorDetails);
      } else {
        logger.error('[MultiChain] Failed to import from seed phrase:', String(error));
      }
      throw error;
    }
  }

  async importFromPrivateKey(privateKey: string): Promise<void> {
    try {
      // Always normalize private key to have 0x prefix
      let normalizedKey = privateKey.trim();
      if (!normalizedKey.startsWith('0x')) {
        normalizedKey = `0x${normalizedKey}`;
      }

      const wallet = new ethers.Wallet(normalizedKey);
      
      // Check if there's an existing seed phrase and verify it matches
      const existingSeedPhrase = await secureStorage.getItem(STORAGE_KEYS.SEED_PHRASE);
      if (existingSeedPhrase) {
        try {
          const seedWallet = ethers.Wallet.fromPhrase(existingSeedPhrase);
          if (seedWallet.privateKey !== wallet.privateKey) {
            throw new Error('Private key does not match the existing seed phrase. Please clear the wallet first.');
          }
        } catch (seedError: unknown) {
          if (seedError instanceof Error) {
            // If the existing seed phrase is invalid, clear it
            await secureStorage.deleteItem(STORAGE_KEYS.SEED_PHRASE);
            logger.warn('[MultiChain] Cleared invalid existing seed phrase');
          } else {
            logger.warn('[MultiChain] Cleared invalid existing seed phrase');
          }
        }
      }
      
      await secureStorage.setItem(STORAGE_KEYS.PRIVATE_KEY, normalizedKey);
      // Clear any existing seed phrase since we're importing a private key
      await secureStorage.deleteItem(STORAGE_KEYS.SEED_PHRASE);
      // For imported wallets with private key, we assume the user already has it backed up
      await secureStorage.setItem(STORAGE_KEYS.BACKUP_CONFIRMED, 'true');

      this.wallet = wallet;
      logger.info('[MultiChain] Wallet imported from private key');
    } catch (error: unknown) {
      if (error instanceof Error) {
        const errorMessage = error.message;
        const errorDetails = {
          name: error.name,
          message: error.message,
          stack: error.stack
        };
        
        logger.error('[MultiChain] Failed to import from private key:', errorMessage, errorDetails);
      } else {
        logger.error('[MultiChain] Failed to import from private key:', String(error));
      }
      throw error;
    }
  }

  async createOrLoadWallet(): Promise<WalletType> {
    if (this.wallet) {
      logger.info('[MultiChain] Returning existing wallet');
      return this.wallet;
    }

    try {
      // Check for corrupted wallet data first
      const wasCorrupted = await this.checkAndFixCorruptedWallet();
      if (wasCorrupted) {
        logger.info('[MultiChain] Corrupted wallet data was fixed, creating new wallet');
        const wallet = ethers.Wallet.createRandom();
        await secureStorage.setItem(STORAGE_KEYS.PRIVATE_KEY, wallet.privateKey);
        this.wallet = wallet;
        logger.info(`[MultiChain] Created new wallet after fixing corruption: ${wallet.address}`);
        return wallet;
      }

      const privateKey = await secureStorage.getItem(STORAGE_KEYS.PRIVATE_KEY);
      if (privateKey) {
        try {
          const wallet = new ethers.Wallet(privateKey);
          this.wallet = wallet;
          logger.info(`[MultiChain] Loaded existing wallet: ${wallet.address}`);
          return wallet;
        } catch (walletError) {
          logger.warn('[MultiChain] Failed to create wallet from stored private key, creating new wallet:', walletError);
          // Clear the corrupted private key
          await secureStorage.deleteItem(STORAGE_KEYS.PRIVATE_KEY);
          const newWallet = ethers.Wallet.createRandom();
          await secureStorage.setItem(STORAGE_KEYS.PRIVATE_KEY, newWallet.privateKey);
          this.wallet = newWallet;
          logger.info(`[MultiChain] Created new wallet after private key error: ${newWallet.address}`);
          return newWallet;
        }
      }

      const wallet = ethers.Wallet.createRandom();
      await secureStorage.setItem(STORAGE_KEYS.PRIVATE_KEY, wallet.privateKey);
      this.wallet = wallet;
      logger.info(`[MultiChain] Created new wallet: ${wallet.address}`);
      return wallet;
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[MultiChain] Failed to create/load wallet:', error);
      } else {
        logger.error('[MultiChain] Failed to create/load wallet:', String(error));
      }
      throw new Error('Failed to create/load wallet');
    }
  }

  async getWalletInfo(chainId: string): Promise<WalletInfo> {
    try {
      const chain = SUPPORTED_CHAINS[chainId];
      if (!chain) {
        throw new Error(`Chain ${chainId} not supported`);
      }

      const wallet = await this.createOrLoadWallet();
      const provider = this.providers[chain.id];
      
      if (!provider) {
        throw new Error(`Provider not initialized for ${chain.name}`);
      }

      if (isEthersWallet(wallet)) {
        const connectedWallet = wallet.connect(provider);
        
        // Try to get balance, but handle offline scenario gracefully
        let balance = '0';
        try {
          balance = ethers.formatEther(await provider.getBalance(wallet.address));
        } catch (balanceError) {
          logger.warn(`[MultiChain] Failed to get balance for ${chainId}, using offline mode:`, balanceError);
          // In offline mode, we can't get the balance, so we show 0
          balance = '0';
        }

        return {
          address: wallet.address,
          balance,
          type: 'evm',
          chainId: chain.id,
        };
      } else {
        throw new Error('Unsupported wallet type for getWalletInfo');
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error(`[MultiChain] Failed to get wallet info for chain ${chainId}:`, error);
      } else {
        logger.error(`[MultiChain] Failed to get wallet info for chain ${chainId}:`, String(error));
      }
      throw error;
    }
  }

  /**
   * Get wallet info in offline mode (no internet required)
   * This method only returns the wallet address without balance
   */
  async getWalletInfoOffline(chainId: string): Promise<WalletInfo> {
    try {
      const chain = SUPPORTED_CHAINS[chainId];
      if (!chain) {
        throw new Error(`Chain ${chainId} not supported`);
      }

      const wallet = await this.createOrLoadWallet();
      
      if (isEthersWallet(wallet)) {
        return {
          address: wallet.address,
          balance: '0', // Offline mode - no balance available
          type: 'evm',
          chainId: chain.id,
        };
      } else {
        throw new Error('Unsupported wallet type for getWalletInfoOffline');
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error(`[MultiChain] Failed to get offline wallet info for chain ${chainId}:`, error);
      } else {
        logger.error(`[MultiChain] Failed to get offline wallet info for chain ${chainId}:`, String(error));
      }
      throw error;
    }
  }

  /**
   * Get wallet address only (no internet required)
   * This method only returns the wallet address without any network calls
   */
  async getWalletAddress(): Promise<string> {
    try {
      const wallet = await this.createOrLoadWallet();
      
      if (isEthersWallet(wallet)) {
        return wallet.address;
      } else if (isHDNodeWallet(wallet)) {
        return wallet.address;
      } else {
        // For MinimalWallet type
        return wallet.address;
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[MultiChain] Failed to get wallet address:', error);
      } else {
        logger.error('[MultiChain] Failed to get wallet address:', String(error));
      }
      throw error;
    }
  }

  async signMessage(message: string): Promise<string> {
    try {
      const wallet = await this.createOrLoadWallet();
      if (isEthersWallet(wallet)) {
        return await wallet.signMessage(message);
      } else if (isHDNodeWallet(wallet)) {
        return await wallet.signMessage(message);
      } else {
        // Fallback or throw error if not a recognized wallet type
        throw new Error('Unsupported wallet type for signing message');
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[MultiChain] Failed to sign message:', error);
      } else {
        logger.error('[MultiChain] Failed to sign message:', String(error));
      }
      throw error;
    }
  }

  async signTransaction(transaction: ethers.TransactionRequest, chainId: string): Promise<string> {
    try {
      const wallet = await this.createOrLoadWallet();
      const provider = this.providers[chainId];
      
      if (!provider) {
        throw new Error(`Provider not initialized for chain ${chainId}`);
      }

      if (isEthersWallet(wallet)) {
        const connectedWallet = wallet.connect(provider);
        return await connectedWallet.signTransaction(transaction);
      } else {
        throw new Error('Unsupported wallet type for signTransaction');
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[MultiChain] Failed to sign transaction:', error);
      } else {
        logger.error('[MultiChain] Failed to sign transaction:', String(error));
      }
      throw error;
    }
  }

  /**
   * Enhanced network status check with multiple endpoints, timeouts, and fallbacks
   */
  async checkNetworkStatus(chainId: string): Promise<boolean> {
    try {
      const chain = SUPPORTED_CHAINS[chainId];
      if (!chain) {
        logger.error(`[MultiChain] Unsupported chain: ${chainId}`);
        return false;
      }

      // Multiple endpoints to try
      const endpoints = [
        chain.rpcUrl,
        ...(chain.backupRpcUrls || [])
      ];

      // Try each endpoint with timeout
      for (const endpoint of endpoints) {
        try {
          const provider = new ethers.JsonRpcProvider(endpoint);
          
          // Set timeout for the request
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Network timeout')), 5000); // 5 second timeout
          });

          const blockNumberPromise = provider.getBlockNumber();
          
          const blockNumber = await Promise.race([blockNumberPromise, timeoutPromise]);
          
          if (blockNumber > 0) {
            logger.info(`[MultiChain] Network status check passed for chain ${chainId} via ${endpoint}`);
            return true;
          }
        } catch (endpointError) {
          logger.warn(`[MultiChain] Endpoint ${endpoint} failed for chain ${chainId}:`, endpointError);
          continue; // Try next endpoint
        }
      }

      // All endpoints failed
      logger.error(`[MultiChain] All endpoints failed for chain ${chainId}`);
      return false;
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error(`[MultiChain] Network status check failed for chain ${chainId}:`, error);
      } else {
        logger.error(`[MultiChain] Network status check failed for chain ${chainId}:`, String(error));
      }
      return false;
    }
  }

  async checkTokenAllowance(
    tokenAddress: string,
    spender: string,
    chainId: string
  ): Promise<bigint> {
    try {
      const wallet = await this.createOrLoadWallet();
      const provider = this.providers[chainId];
      
      if (!provider) {
        throw new Error(`Provider not initialized for chain ${chainId}`);
      }

      if (isEthersWallet(wallet)) {
        const tokenContract = new ethers.Contract(
          tokenAddress,
          ['function allowance(address owner, address spender) view returns (uint256)'],
          provider
        );

        return await tokenContract.allowance(wallet.address, spender);
      } else {
        throw new Error('Unsupported wallet type for checkTokenAllowance');
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error(`[MultiChain] Failed to check token allowance:`, error);
      } else {
        logger.error(`[MultiChain] Failed to check token allowance:`, String(error));
      }
      throw error;
    }
  }

  async approveToken(
    tokenAddress: string,
    spender: string,
    amount: bigint,
    chainId: string
  ): Promise<string> {
    try {
      const wallet = await this.createOrLoadWallet();
      const provider = this.providers[chainId];
      
      if (!provider) {
        throw new Error(`Provider not initialized for chain ${chainId}`);
      }

      if (isEthersWallet(wallet)) {
        const connectedWallet = wallet.connect(provider);
        const tokenContract = new ethers.Contract(
          tokenAddress,
          ['function approve(address spender, uint256 amount) returns (bool)'],
          connectedWallet
        );

        const tx = await tokenContract.approve(spender, amount);
        return tx.hash;
      } else {
        throw new Error('Unsupported wallet type for approveToken');
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error(`[MultiChain] Failed to approve token:`, error);
      } else {
        logger.error(`[MultiChain] Failed to approve token:`, String(error));
      }
      throw error;
    }
  }

  async estimateGas(
    transaction: ethers.TransactionRequest,
    chainId: string
  ): Promise<bigint> {
    try {
      const provider = this.providers[chainId];
      if (!provider) {
        throw new Error(`Provider not initialized for chain ${chainId}`);
      }

      return await provider.estimateGas(transaction);
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error(`[MultiChain] Failed to estimate gas:`, error);
      } else {
        logger.error(`[MultiChain] Failed to estimate gas:`, String(error));
      }
      throw error;
    }
  }

  async getGasPrice(chainId: string): Promise<bigint> {
    try {
      const provider = this.providers[chainId];
      if (!provider) {
        throw new Error(`Provider not initialized for chain ${chainId}`);
      }

      return await provider.getFeeData().then(data => data.gasPrice || ethers.parseUnits('1', 'gwei'));
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error(`[MultiChain] Failed to get gas price:`, error);
      } else {
        logger.error(`[MultiChain] Failed to get gas price:`, String(error));
      }
      throw error;
    }
  }

  /**
   * Send a token transaction using meta-transactions (native or ERC-20)
   */
  async sendTokenTransaction(
    to: string,
    amount: string,
    chainId: string,
    tokenInfo?: {
      address: string;
      symbol: string;
      decimals: number;
      isNative: boolean;
    }
  ): Promise<{ hash: string; transactionId: string }> {
    try {
      const wallet = await this.createOrLoadWallet();
      const provider = this.providers[chainId];
      
      if (!provider) {
        throw new Error(`Provider not initialized for chain ${chainId}`);
      }

      if (!isEthersWallet(wallet)) {
        throw new Error('Unsupported wallet type for sendTokenTransaction');
      }

      const connectedWallet = wallet.connect(provider);
      
      // Enhanced amount validation and debugging
      logger.info('[MultiChain] sendTokenTransaction input validation', {
        amount,
        amountType: typeof amount,
        amountLength: amount ? amount.length : 0,
        amountIsNaN: isNaN(Number(amount)),
        amountParseFloat: parseFloat(String(amount || '')),
        to,
        chainId,
        tokenInfo
      });
      
      // Validate amount
      if (!amount || amount.trim() === '') {
        throw new Error('Amount is required');
      }
      
      // Ensure amount is a string
      const amountString = String(amount).trim();
      
      // Additional validation to catch NaN early
      if (amountString === 'NaN' || amountString === 'undefined' || amountString === 'null') {
        throw new Error(`Invalid amount string: ${amountString}`);
      }
      
      // Check if the original amount was actually NaN
      if (typeof amount === 'number' && isNaN(amount)) {
        throw new Error('Amount is NaN (number)');
      }
      
      // Validate amount is a valid number
      const amountNum = parseFloat(amountString);
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error(`Invalid amount: ${amountString}. Must be a positive number.`);
      }
      
      // Convert amount from base units to smallest units (e.g., ETH to wei)
      // The amount parameter is expected to be in base units (e.g., "10" for 10 ETH)
      const decimals = tokenInfo?.decimals || 18;
      
      logger.info('[MultiChain] Converting amount', {
        originalAmount: amountString,
        decimals,
        tokenSymbol: tokenInfo?.symbol || 'native'
      });
      
      let amountBigInt: bigint;
      
      // Ensure both parameters are in the correct format for ethers v6
      const amountForParseUnits = String(amountString);
      const decimalsForParseUnits = Number(decimals);
      
      logger.info('[MultiChain] Final parameters for parseUnits', {
        amountForParseUnits,
        amountForParseUnitsType: typeof amountForParseUnits,
        decimalsForParseUnits,
        decimalsForParseUnitsType: typeof decimalsForParseUnits
      });
      
      try {
        // Ensure amountString is a valid string before passing to parseUnits
        if (typeof amountString !== 'string' || amountString === '') {
          throw new Error(`Invalid amount string: ${amountString}`);
        }
        
        // Additional validation to ensure the string is a valid number
        const testParse = parseFloat(amountString);
        if (isNaN(testParse)) {
          throw new Error(`Amount string "${amountString}" cannot be parsed as a number`);
        }
        
        // Ensure decimals is a valid number
        if (typeof decimals !== 'number' || isNaN(decimals) || decimals < 0) {
          throw new Error(`Invalid decimals value: ${decimals}`);
        }
        
        logger.info('[MultiChain] About to call parseUnits', {
          amountString,
          amountStringType: typeof amountString,
          amountStringLength: amountString.length,
          amountStringIsNaN: amountString === 'NaN',
          decimals,
          decimalsType: typeof decimals,
          decimalsIsNaN: isNaN(decimals),
          amountForParseUnits,
          amountForParseUnitsType: typeof amountForParseUnits,
          decimalsForParseUnits,
          decimalsForParseUnitsType: typeof decimalsForParseUnits
        });
        
        // Final validation before parseUnits
        if (amountForParseUnits === 'NaN' || amountForParseUnits === 'undefined' || amountForParseUnits === 'null') {
          throw new Error(`Invalid amount for parseUnits: ${amountForParseUnits}`);
        }
        
        if (isNaN(decimalsForParseUnits) || decimalsForParseUnits < 0) {
          throw new Error(`Invalid decimals for parseUnits: ${decimalsForParseUnits}`);
        }
        
        amountBigInt = ethers.parseUnits(amountForParseUnits, decimalsForParseUnits);
        logger.info('[MultiChain] Amount converted successfully', {
          originalAmount: amountString,
          convertedAmount: amountBigInt.toString(),
          decimals
        });
      } catch (error) {
        logger.error('[MultiChain] Failed to parse amount', {
          amountString,
          amountStringType: typeof amountString,
          decimals,
          decimalsType: typeof decimals,
          amountForParseUnits,
          amountForParseUnitsType: typeof amountForParseUnits,
          decimalsForParseUnits,
          decimalsForParseUnitsType: typeof decimalsForParseUnits,
          error: error instanceof Error ? error.message : String(error)
        });
        throw new Error(`Failed to parse amount "${amountString}" with ${decimals} decimals: ${error instanceof Error ? error.message : String(error)}`);
      }

      let transaction: ethers.TransactionResponse;

      if (!tokenInfo || tokenInfo.isNative) {
        // Native token meta-transaction (ETH, MATIC, etc.)
        logger.info('[MultiChain] Sending native token meta-transaction', {
          to,
          amount: amountBigInt.toString(),
          amountBigIntType: typeof amountBigInt,
          amountBigIntIsValid: amountBigInt > 0n,
          chainId
        });

        transaction = await this.executeNativeMetaTransaction(
          to,
          amountBigInt,
          chainId
        );

      } else {
        // ERC-20 token meta-transaction
        logger.info('[MultiChain] Sending ERC-20 token meta-transaction', {
          to,
          amount: amountBigInt.toString(),
          amountBigIntType: typeof amountBigInt,
          amountBigIntIsValid: amountBigInt > 0n,
          tokenAddress: tokenInfo.address,
          chainId
        });

        transaction = await this.executeTokenMetaTransaction(
          to,
          tokenInfo.address,
          amountBigInt,
          chainId
        );
      }

      logger.info('[MultiChain] Meta-transaction sent successfully', {
        hash: transaction.hash,
        chainId,
        to,
        amount: amountBigInt.toString()
      });

      return {
        hash: transaction.hash,
        transactionId: transaction.hash // Using hash as transactionId for consistency
      };

    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[MultiChain] Failed to send token meta-transaction:', error);
      } else {
        logger.error('[MultiChain] Failed to send token meta-transaction:', String(error));
      }
      throw error;
    }
  }

  /**
   * Execute a native token meta-transaction
   */
  private async executeNativeMetaTransaction(
    to: string,
    amount: bigint,
    chainId: string
  ): Promise<ethers.TransactionResponse> {
    const wallet = await this.createOrLoadWallet();
    const provider = this.providers[chainId];
    const contractAddress = this.getContractAddress(chainId);
    
    if (!isEthersWallet(wallet)) {
      throw new Error('Unsupported wallet type for meta-transaction');
    }

    const connectedWallet = wallet.connect(provider);
    const contract = new ethers.Contract(contractAddress, AIRCHAINPAY_TOKEN_ABI, connectedWallet);

    // Get current nonce
    const nonce = await contract.getNonce(wallet.address);
    
    // Create deadline (1 hour from now)
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    
    logger.info('[MultiChain] Native meta-transaction parameters', {
      walletAddress: wallet.address,
      to,
      amount: amount.toString(),
      deadline,
      currentTime: Math.floor(Date.now() / 1000),
      timeUntilDeadline: deadline - Math.floor(Date.now() / 1000)
    });
    
    // Create payment reference
    const paymentReference = `Payment from ${wallet.address} to ${to} at ${Date.now()}`;

    // Create signature
    const signature = await this.createNativeMetaTransactionSignature(
      wallet.address,
      to,
      amount,
      paymentReference,
      nonce,
      deadline,
      contractAddress,
      chainId
    );

    // Execute meta-transaction with validation
    logger.info('[MultiChain] Executing native meta-transaction', {
      walletAddress: wallet.address,
      to,
      amount: amount.toString(),
      amountType: typeof amount,
      amountIsValid: amount > 0n,
      paymentReference,
      deadline,
      signatureLength: signature.length
    });
    
    const tx = await contract.executeNativeMetaTransaction(
      wallet.address,
      to,
      amount,
      paymentReference,
      deadline,
      signature,
      { value: amount }
    );

    return tx;
  }

  /**
   * Execute an ERC-20 token meta-transaction
   */
  private async executeTokenMetaTransaction(
    to: string,
    tokenAddress: string,
    amount: bigint,
    chainId: string
  ): Promise<ethers.TransactionResponse> {
    const wallet = await this.createOrLoadWallet();
    const provider = this.providers[chainId];
    const contractAddress = this.getContractAddress(chainId);
    
    if (!isEthersWallet(wallet)) {
      throw new Error('Unsupported wallet type for meta-transaction');
    }

    const connectedWallet = wallet.connect(provider);
    const contract = new ethers.Contract(contractAddress, AIRCHAINPAY_TOKEN_ABI, connectedWallet);

    // Get current nonce
    const nonce = await contract.getNonce(wallet.address);
    
    // Create deadline (1 hour from now)
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    
    logger.info('[MultiChain] Token meta-transaction parameters', {
      walletAddress: wallet.address,
      to,
      tokenAddress,
      amount: amount.toString(),
      deadline,
      currentTime: Math.floor(Date.now() / 1000),
      timeUntilDeadline: deadline - Math.floor(Date.now() / 1000)
    });
    
    // Create payment reference
    const paymentReference = `Token payment from ${wallet.address} to ${to} at ${Date.now()}`;

    // Create signature
    logger.info('[MultiChain] About to create token meta-transaction signature', {
      walletAddress: wallet.address,
      to,
      tokenAddress,
      amount: amount.toString(),
      paymentReference,
      nonce: nonce.toString(),
      deadline,
      contractAddress,
      chainId
    });
    
    const signature = await this.createTokenMetaTransactionSignature(
      wallet.address,
      to,
      tokenAddress,
      amount,
      paymentReference,
      nonce,
      deadline,
      contractAddress,
      chainId
    );
    
    logger.info('[MultiChain] Token meta-transaction signature created', {
      signatureLength: signature.length,
      signaturePrefix: signature.slice(0, 10) + '...'
    });

    // Execute meta-transaction with validation
    logger.info('[MultiChain] Executing token meta-transaction', {
      walletAddress: wallet.address,
      to,
      tokenAddress,
      amount: amount.toString(),
      amountType: typeof amount,
      amountIsValid: amount > 0n,
      paymentReference,
      deadline,
      signatureLength: signature.length
    });
    
    logger.info('[MultiChain] About to call contract.executeTokenMetaTransaction', {
      walletAddress: wallet.address,
      to,
      tokenAddress,
      amount: amount.toString(),
      paymentReference,
      deadline,
      signatureLength: signature.length
    });
    
    const tx = await contract.executeTokenMetaTransaction(
      wallet.address,
      to,
      tokenAddress,
      amount,
      paymentReference,
      deadline,
      signature
    );
    
    logger.info('[MultiChain] Contract call successful', {
      txHash: tx.hash,
      txType: typeof tx
    });

    return tx;
  }

  /**
   * Create signature for native meta-transaction
   */
  private async createNativeMetaTransactionSignature(
    from: string,
    to: string,
    amount: bigint,
    paymentReference: string,
    nonce: bigint,
    deadline: number,
    contractAddress: string,
    chainId: string
  ): Promise<string> {
    const wallet = await this.createOrLoadWallet();
    
    if (!isEthersWallet(wallet)) {
      throw new Error('Unsupported wallet type for signature creation');
    }

    // Get the correct chainId number from chain configuration
    const chain = SUPPORTED_CHAINS[chainId];
    if (!chain) {
      throw new Error(`Unsupported chain: ${chainId}`);
    }
    
    logger.info('[MultiChain] Creating native meta-transaction signature', {
      from,
      to,
      amount: amount.toString(),
      chainId: chainId,
      chainIdNumber: chain.chainId,
      contractAddress
    });

    const domain = {
      name: 'AirChainPayToken',
      version: '1',
      chainId: chain.chainId,
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
      from,
      to,
      amount,
      paymentReference,
      nonce,
      deadline
    };

    return await wallet.signTypedData(domain, types, value);
  }

  /**
   * Create signature for token meta-transaction
   */
  private async createTokenMetaTransactionSignature(
    from: string,
    to: string,
    token: string,
    amount: bigint,
    paymentReference: string,
    nonce: bigint,
    deadline: number,
    contractAddress: string,
    chainId: string
  ): Promise<string> {
    const wallet = await this.createOrLoadWallet();
    
    if (!isEthersWallet(wallet)) {
      throw new Error('Unsupported wallet type for signature creation');
    }

    // Get the correct chainId number from chain configuration
    const chain = SUPPORTED_CHAINS[chainId];
    if (!chain) {
      throw new Error(`Unsupported chain: ${chainId}`);
    }
    
    logger.info('[MultiChain] Creating token meta-transaction signature', {
      from,
      to,
      token,
      amount: amount.toString(),
      chainId: chainId,
      chainIdNumber: chain.chainId,
      contractAddress
    });

    const domain = {
      name: 'AirChainPayToken',
      version: '1',
      chainId: chain.chainId,
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
      from,
      to,
      token,
      amount,
      paymentReference,
      nonce,
      deadline
    };

    return await wallet.signTypedData(domain, types, value);
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

  // Add method to check if wallet password exists
  async hasPassword(): Promise<boolean> {
    try {
      const password = await secureStorage.getItem(STORAGE_KEYS.WALLET_PASSWORD);
      const hasPassword = !!password;
      logger.info(`[MultiChain] hasPassword check: ${hasPassword}`);
      return hasPassword;
    } catch (error: unknown) {
      if (error instanceof Error) {
        const errorMessage = error.message;
        const errorDetails = {
          name: error.name,
          message: error.message,
          stack: error.stack
        };
        
        logger.error('[MultiChain] Failed to check wallet password existence:', errorMessage, errorDetails);
      } else {
        logger.error('[MultiChain] Failed to check wallet password existence:', String(error));
      }
      return false;
    }
  }

  // Add method to check if backup is confirmed
  async isBackupConfirmed(): Promise<boolean> {
    try {
      const confirmed = await secureStorage.getItem(STORAGE_KEYS.BACKUP_CONFIRMED);
      const isConfirmed = confirmed === 'true';
      logger.info(`[MultiChain] isBackupConfirmed check: ${isConfirmed}`);
      return isConfirmed;
    } catch (error: unknown) {
      if (error instanceof Error) {
        const errorMessage = error.message;
        const errorDetails = {
          name: error.name,
          message: error.message,
          stack: error.stack
        };
        
        logger.error('[MultiChain] Failed to check backup confirmation:', errorMessage, errorDetails);
      } else {
        logger.error('[MultiChain] Failed to check backup confirmation:', String(error));
      }
      return false;
    }
  }

  // Add method to set backup confirmation
  async setBackupConfirmed(): Promise<void> {
    try {
      await secureStorage.setItem(STORAGE_KEYS.BACKUP_CONFIRMED, 'true');
      logger.info('[MultiChain] Backup confirmation set successfully');
    } catch (error: unknown) {
      if (error instanceof Error) {
        const errorMessage = error.message;
        const errorDetails = {
          name: error.name,
          message: error.message,
          stack: error.stack
        };
        
        logger.error('[MultiChain] Failed to set backup confirmation:', errorMessage, errorDetails);
      } else {
        logger.error('[MultiChain] Failed to set backup confirmation:', String(error));
      }
      throw error;
    }
  }

  public getChainConfig(chainId: string) {
    return SUPPORTED_CHAINS[chainId];
  }

  /**
   * Get the provider for a specific chain
   */
  public getProvider(chainId: string): ethers.Provider {
    const provider = this.providers[chainId];
    if (!provider) {
      throw new Error(`Provider not initialized for chain ${chainId}`);
    }
    return provider;
  }

  // Add logout method to clear authentication data only (not wallet data)
  async logout(clearWalletData: boolean = false): Promise<void> {
    try {
      logger.info('[MultiChain] Starting logout process...');
      
      // Clear wallet instance
      this.wallet = null;
      logger.info('[MultiChain] Wallet instance cleared');
      
      if (clearWalletData) {
        // Clear ALL wallet data including private key and seed phrase
        logger.info('[MultiChain] Clearing all wallet data as requested');
        const allKeysToDelete = [
          STORAGE_KEYS.PRIVATE_KEY,
          STORAGE_KEYS.SEED_PHRASE,
          STORAGE_KEYS.TEMP_SEED_PHRASE,
          STORAGE_KEYS.WALLET_PASSWORD,
          STORAGE_KEYS.BACKUP_CONFIRMED
        ];
        
        let deletedCount = 0;
        for (const key of allKeysToDelete) {
          try {
            await secureStorage.deleteItem(key);
            logger.info(`[MultiChain] Deleted wallet data key: ${key}`);
            deletedCount++;
          } catch (deleteError: unknown) {
            if (deleteError instanceof Error) {
              logger.warn(`[MultiChain] Failed to delete ${key}:`, deleteError);
            } else {
              logger.warn(`[MultiChain] Failed to delete ${key}:`, String(deleteError));
            }
            // Continue with other keys even if one fails
          }
        }
        
        // Also clear backup data
        try {
          await secureStorage.clearBackup();
          logger.info('[MultiChain] Cleared backup data');
        } catch (backupError: unknown) {
          logger.warn('[MultiChain] Failed to clear backup data:', backupError);
        }
        
        logger.info(`[MultiChain] Logout with wallet deletion completed. Deleted ${deletedCount} storage keys.`);
      } else {
        // Only clear authentication data, preserve wallet data (private key, seed phrase)
        // This allows users to re-authenticate with a new password without losing their wallet
        const authKeysToDelete = [
          STORAGE_KEYS.WALLET_PASSWORD,
          STORAGE_KEYS.BACKUP_CONFIRMED
        ];
        
        let deletedCount = 0;
        for (const key of authKeysToDelete) {
          try {
            await secureStorage.deleteItem(key);
            logger.info(`[MultiChain] Deleted auth key: ${key}`);
            deletedCount++;
          } catch (deleteError: unknown) {
            if (deleteError instanceof Error) {
              logger.warn(`[MultiChain] Failed to delete ${key}:`, deleteError);
            } else {
              logger.warn(`[MultiChain] Failed to delete ${key}:`, String(deleteError));
            }
            // Continue with other keys even if one fails
          }
        }
        
        logger.info(`[MultiChain] Logout completed. Deleted ${deletedCount} authentication keys. Wallet data preserved.`);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        const errorMessage = error.message;
        const errorDetails = {
          name: error.name,
          message: error.message,
          stack: error.stack
        };
        
        logger.error('[MultiChain] Failed to logout:', errorMessage, errorDetails);
      } else {
        logger.error('[MultiChain] Failed to logout:', String(error));
      }
      throw error;
    }
  }

  // Add method to clear wallet with validation
  async clearWallet(): Promise<void> {
    try {
      // Validate wallet consistency before clearing
      const validation = await this.validateWalletConsistency();
      if (!validation.isValid) {
        logger.warn('[MultiChain] Wallet consistency check failed before clearing:', validation.error);
      }

      await this.clearAllWalletData();
      logger.info('[MultiChain] Wallet cleared successfully');
    } catch (error: unknown) {
      if (error instanceof Error) {
        const errorMessage = error.message;
        const errorDetails = {
          name: error.name,
          message: error.message,
          stack: error.stack
        };
        
        logger.error('[MultiChain] Failed to clear wallet:', errorMessage, errorDetails);
      } else {
        logger.error('[MultiChain] Failed to clear wallet:', String(error));
      }
      throw error;
    }
  }

  // Add method to reset corrupted wallet data
  async resetCorruptedWallet(): Promise<void> {
    try {
      logger.warn('[MultiChain] Resetting corrupted wallet data');
      this.wallet = null;
      await WalletCorruptionFix.clearAllWalletData();
      logger.info('[MultiChain] Corrupted wallet data cleared successfully');
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[MultiChain] Failed to reset corrupted wallet:', error);
      } else {
        logger.error('[MultiChain] Failed to reset corrupted wallet:', String(error));
      }
      throw error;
    }
  }

  // Add method to check and fix corrupted wallet data
  async checkAndFixCorruptedWallet(): Promise<boolean> {
    try {
      // Use the dedicated corruption fix utility
      const wasFixed = await WalletCorruptionFix.checkAndFixCorruption();
      
      if (wasFixed) {
        logger.info('[MultiChain] Wallet corruption was fixed successfully');
      } else {
        logger.info('[MultiChain] No wallet corruption detected');
      }
      
      return wasFixed;
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[MultiChain] Failed to check and fix corrupted wallet:', error);
      } else {
        logger.error('[MultiChain] Failed to check and fix corrupted wallet:', String(error));
      }
      return false;
    }
  }

  // Add method to clear transaction history
  async clearTransactionHistory(): Promise<void> {
    try {
      logger.info('[MultiChain] Clearing transaction history...');
      
      // Clear transaction history from storage
      await secureStorage.deleteItem('transaction_history');
      
      logger.info('[MultiChain] Transaction history cleared successfully');
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[MultiChain] Failed to clear transaction history:', error);
      } else {
        logger.error('[MultiChain] Failed to clear transaction history:', String(error));
      }
      throw error;
    }
  }

  // Add method to verify wallet password
  async verifyWalletPassword(password: string): Promise<boolean> {
    try {
      const storedPasswordHash = await secureStorage.getItem(STORAGE_KEYS.WALLET_PASSWORD);
      
      if (!storedPasswordHash) {
        logger.warn('[MultiChain] No stored password hash found');
        return false;
      }

      // Check if this is a legacy plain text password and migrate it
      if (!PasswordHasher.isSecureHash(storedPasswordHash)) {
        logger.info('[MultiChain] Migrating legacy plain text password to secure hash');
        const hashedPassword = PasswordHasher.hashPassword(password);
        await secureStorage.setItem(STORAGE_KEYS.WALLET_PASSWORD, hashedPassword);
        return true; // Legacy password was plain text, so if it matches, migration is successful
      }

      // Verify against the stored hash
      const isValid = PasswordHasher.verifyPassword(password, storedPasswordHash);
      
      if (isValid) {
        logger.info('[MultiChain] Password verification successful');
      } else {
        logger.warn('[MultiChain] Password verification failed');
      }
      
      return isValid;
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[MultiChain] Failed to verify wallet password:', error);
      } else {
        logger.error('[MultiChain] Failed to verify wallet password:', String(error));
      }
      return false;
    }
  }

  /**
   * Check if password migration is needed and handle it
   */
  async checkAndMigratePassword(): Promise<{
    needsMigration: boolean;
    migrationRequired: boolean;
    error?: string;
  }> {
    try {
      const needsMigration = await PasswordMigration.isMigrationNeeded();
      
      if (!needsMigration) {
        return {
          needsMigration: false,
          migrationRequired: false
        };
      }

      // Check if there's a stored password that needs migration
      const storedPassword = await secureStorage.getItem(STORAGE_KEYS.WALLET_PASSWORD);
      
      if (!storedPassword) {
        // No password to migrate
        return {
          needsMigration: true,
          migrationRequired: false
        };
      }

      // Check if it's a legacy plain text password
      if (!PasswordHasher.isSecureHash(storedPassword)) {
        return {
          needsMigration: true,
          migrationRequired: true,
          error: 'Password security upgrade required. Please re-enter your password.'
        };
      }

      return {
        needsMigration: true,
        migrationRequired: false
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[MultiChain] Failed to check password migration:', error);
      } else {
        logger.error('[MultiChain] Failed to check password migration:', String(error));
      }
      return {
        needsMigration: false,
        migrationRequired: false,
        error: 'Failed to check password migration status'
      };
    }
  }

  /**
   * Migrate a user's password to secure hash format
   */
  async migrateUserPassword(plainTextPassword: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      logger.info('[MultiChain] Starting password migration...');
      
      // Hash the plain text password
      const hashedPassword = PasswordHasher.hashPassword(plainTextPassword);
      
      // Store the hashed password
      await secureStorage.setItem(STORAGE_KEYS.WALLET_PASSWORD, hashedPassword);
      
      logger.info('[MultiChain] Password migration completed successfully');
      return {
        success: true
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[MultiChain] Failed to migrate password:', error);
      } else {
        logger.error('[MultiChain] Failed to migrate password:', String(error));
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Add method to get seed phrase (requires authentication)
  async getSeedPhrase(): Promise<string> {
    try {
      const seedPhrase = await secureStorage.getSensitiveItem(STORAGE_KEYS.SEED_PHRASE, {
        promptMessage: 'Authenticate to view seed phrase'
      });
      if (!seedPhrase) {
        throw new Error('No seed phrase found. This wallet may have been imported with a private key only.');
      }
      return seedPhrase;
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[MultiChain] Failed to get seed phrase:', error);
      } else {
        logger.error('[MultiChain] Failed to get seed phrase:', String(error));
      }
      throw error;
    }
  }

  // Add method to export private key (requires authentication)
  async exportPrivateKey(): Promise<string> {
    try {
      const privateKey = await secureStorage.getSensitiveItem(STORAGE_KEYS.PRIVATE_KEY, {
        promptMessage: 'Authenticate to view private key'
      });
      if (!privateKey) {
        throw new Error('No private key found');
      }
      return privateKey;
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error('[MultiChain] Failed to export private key:', error);
      } else {
        logger.error('[MultiChain] Failed to export private key:', String(error));
      }
      throw error;
    }
  }

  // Add method to clear all wallet data (for wallet deletion)
  async clearAllWalletData(): Promise<void> {
    try {
      logger.info('[MultiChain] Starting complete wallet data deletion...');
      
      // Clear wallet instance
      this.wallet = null;
      logger.info('[MultiChain] Wallet instance cleared');
      
      // Clear ALL stored data including wallet data
      const allKeysToDelete = [
        STORAGE_KEYS.PRIVATE_KEY,
        STORAGE_KEYS.SEED_PHRASE,
        STORAGE_KEYS.TEMP_SEED_PHRASE,
        STORAGE_KEYS.WALLET_PASSWORD,
        STORAGE_KEYS.BACKUP_CONFIRMED
      ];
      
      let deletedCount = 0;
      for (const key of allKeysToDelete) {
        try {
          await secureStorage.deleteItem(key);
          logger.info(`[MultiChain] Deleted all wallet data key: ${key}`);
          deletedCount++;
        } catch (deleteError: unknown) {
          if (deleteError instanceof Error) {
            logger.warn(`[MultiChain] Failed to delete ${key}:`, deleteError);
          } else {
            logger.warn(`[MultiChain] Failed to delete ${key}:`, String(deleteError));
          }
          // Continue with other keys even if one fails
        }
      }
      
      // Also clear backup data when completely deleting wallet
      try {
        await secureStorage.clearBackup();
        logger.info('[MultiChain] Cleared backup data');
      } catch (backupError: unknown) {
        logger.warn('[MultiChain] Failed to clear backup data:', backupError);
      }
      
      logger.info(`[MultiChain] Complete wallet deletion completed. Deleted ${deletedCount} storage keys.`);
    } catch (error: unknown) {
      if (error instanceof Error) {
        const errorMessage = error.message;
        const errorDetails = {
          name: error.name,
          message: error.message,
          stack: error.stack
        };
        
        logger.error('[MultiChain] Failed to clear all wallet data:', errorMessage, errorDetails);
      } else {
        logger.error('[MultiChain] Failed to clear all wallet data:', String(error));
      }
      throw error;
    }
  }

  /**
   * Force sync balance from blockchain before allowing offline transactions
   */
  async forceBalanceSync(chainId: string): Promise<{ success: boolean; balance?: string; error?: string }> {
    try {
      logger.info(`[MultiChain] Force syncing balance for chain ${chainId}`);
      
      // Check if we can connect to the network
      const isOnline = await this.checkNetworkStatus(chainId);
      if (!isOnline) {
        return {
          success: false,
          error: 'Cannot sync balance: network is offline'
        };
      }

      const wallet = await this.createOrLoadWallet();
      const provider = this.providers[chainId];
      
      if (!provider) {
        return {
          success: false,
          error: `Provider not initialized for chain ${chainId}`
        };
      }

      if (isEthersWallet(wallet)) {
        const connectedWallet = wallet.connect(provider);
        
        // Add timeout for balance fetch
        const balancePromise = provider.getBalance(connectedWallet.address);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Balance fetch timeout')), 10000); // 10 second timeout
        });
        
        const balance = await Promise.race([balancePromise, timeoutPromise]);
        
        // Validate balance is reasonable
        if (balance < 0) {
          return {
            success: false,
            error: 'Invalid balance received from network'
          };
        }
        
        // Store the synced balance for offline use
        await this.storeSyncedBalance(chainId, balance.toString());
        
        logger.info(`[MultiChain] Balance synced successfully for chain ${chainId}`, {
          address: connectedWallet.address,
          balance: balance.toString()
        });
        
        return {
          success: true,
          balance: balance.toString()
        };
      } else {
        return {
          success: false,
          error: 'Unsupported wallet type for balance sync'
        };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[MultiChain] Force balance sync failed for chain ${chainId}:`, errorMessage);
      
      // Provide more specific error messages
      if (errorMessage.includes('timeout')) {
        return {
          success: false,
          error: 'Balance sync timed out. Please check your internet connection.'
        };
      } else if (errorMessage.includes('network')) {
        return {
          success: false,
          error: 'Network error during balance sync. Please try again.'
        };
      } else if (errorMessage.includes('provider')) {
        return {
          success: false,
          error: 'Blockchain provider error. Please try again later.'
        };
      } else {
        return {
          success: false,
          error: `Balance sync failed: ${errorMessage}`
        };
      }
    }
  }

  /**
   * Store synced balance for offline use
   */
  private async storeSyncedBalance(chainId: string, balance: string): Promise<void> {
    try {
      const key = `synced_balance_${chainId}`;
      const balanceData = {
        balance,
        timestamp: Date.now(),
        chainId
      };
      await AsyncStorage.setItem(key, JSON.stringify(balanceData));
      logger.info(`[MultiChain] Stored synced balance for chain ${chainId}`, balanceData);
    } catch (error: unknown) {
      logger.error(`[MultiChain] Failed to store synced balance for chain ${chainId}:`, error);
    }
  }

  /**
   * Get stored synced balance
   */
  async getStoredSyncedBalance(chainId: string): Promise<{ balance: string; timestamp: number } | null> {
    try {
      const key = `synced_balance_${chainId}`;
      const stored = await AsyncStorage.getItem(key);
      if (!stored) return null;
      
      const balanceData = JSON.parse(stored);
      return {
        balance: balanceData.balance,
        timestamp: balanceData.timestamp
      };
    } catch (error: unknown) {
      logger.error(`[MultiChain] Failed to get stored synced balance for chain ${chainId}:`, error);
      return null;
    }
  }
}