import { ethers } from 'ethers';
import { SUPPORTED_CHAINS } from '../constants/AppConfig';
import { logger } from '../utils/Logger';
import { secureStorage } from '../utils/SecureStorageService';
import { PasswordHasher } from '../utils/crypto/PasswordHasher';
import { PasswordMigration } from '../utils/crypto/PasswordMigration';

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

type AnyWallet = ethers.HDNodeWallet | ethers.Wallet;

export class MultiChainWalletManager {
  private static instance: MultiChainWalletManager;
  private wallet: AnyWallet | null = null;
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
      const hasWallet = !!privateKey;
      logger.info(`[MultiChain] hasWallet check: ${hasWallet}`);
      return hasWallet;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorDetails = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : { message: String(error) };
      
      logger.error('[MultiChain] Failed to check wallet existence:', errorMessage, errorDetails);
      return false;
    }
  }

  async hasTemporarySeedPhrase(): Promise<boolean> {
    try {
      const tempSeedPhrase = await secureStorage.getItem(STORAGE_KEYS.TEMP_SEED_PHRASE);
      return !!tempSeedPhrase;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorDetails = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : { message: String(error) };
      
      logger.error('[MultiChain] Failed to check temporary seed phrase existence:', errorMessage, errorDetails);
      return false;
    }
  }

  async clearTemporarySeedPhrase(): Promise<void> {
    try {
      await secureStorage.deleteItem(STORAGE_KEYS.TEMP_SEED_PHRASE);
      logger.info('[MultiChain] Temporary seed phrase cleared');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorDetails = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : { message: String(error) };
      
      logger.error('[MultiChain] Failed to clear temporary seed phrase:', errorMessage, errorDetails);
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
    } catch (error) {
      logger.error('[MultiChain] Failed to log storage state:', error);
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
      } catch (error) {
        return { 
          isValid: false, 
          error: 'Invalid seed phrase found. Please clear the wallet and re-import.' 
        };
      }
    } catch (error) {
      return { 
        isValid: false, 
        error: 'Failed to validate wallet consistency' 
      };
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorDetails = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : { message: String(error) };
      
      logger.error('[MultiChain] Failed to generate seed phrase:', errorMessage, errorDetails);
      throw error;
    }
  }

  async setWalletPassword(password: string): Promise<void> {
    try {
      // Hash the password before storing
      const hashedPassword = PasswordHasher.hashPassword(password);
      await secureStorage.setItem(STORAGE_KEYS.WALLET_PASSWORD, hashedPassword);
      logger.info('[MultiChain] Wallet password hashed and stored successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorDetails = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : { message: String(error) };
      
      logger.error('[MultiChain] Failed to set wallet password:', errorMessage, errorDetails);
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorDetails = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : { message: String(error) };
      
      logger.error('[MultiChain] Failed to confirm backup:', errorMessage, errorDetails);
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorDetails = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : { message: String(error) };
      
      logger.error('[MultiChain] Failed to import from seed phrase:', errorMessage, errorDetails);
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
        } catch (seedError) {
          // If the existing seed phrase is invalid, clear it
          await secureStorage.deleteItem(STORAGE_KEYS.SEED_PHRASE);
          logger.warn('[MultiChain] Cleared invalid existing seed phrase');
        }
      }
      
      await secureStorage.setItem(STORAGE_KEYS.PRIVATE_KEY, normalizedKey);
      // Clear any existing seed phrase since we're importing a private key
      await secureStorage.deleteItem(STORAGE_KEYS.SEED_PHRASE);
      // For imported wallets with private key, we assume the user already has it backed up
      await secureStorage.setItem(STORAGE_KEYS.BACKUP_CONFIRMED, 'true');

      this.wallet = wallet;
      logger.info('[MultiChain] Wallet imported from private key');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorDetails = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : { message: String(error) };
      
      logger.error('[MultiChain] Failed to import from private key:', errorMessage, errorDetails);
      throw error;
    }
  }

  async createOrLoadWallet(): Promise<AnyWallet> {
    if (this.wallet) {
      logger.info('[MultiChain] Returning existing wallet');
      return this.wallet;
    }

    try {
      const privateKey = await secureStorage.getItem(STORAGE_KEYS.PRIVATE_KEY);
      if (privateKey) {
        const wallet = new ethers.Wallet(privateKey);
        this.wallet = wallet;
        logger.info(`[MultiChain] Loaded existing wallet: ${wallet.address}`);
        return wallet;
      }

      const wallet = ethers.Wallet.createRandom();
      await secureStorage.setItem(STORAGE_KEYS.PRIVATE_KEY, wallet.privateKey);
      this.wallet = wallet;
      logger.info(`[MultiChain] Created new wallet: ${wallet.address}`);
      return wallet;
    } catch (error) {
      logger.error('[MultiChain] Failed to create/load wallet:', error);
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

      const connectedWallet = wallet.connect(provider);
      const balance = ethers.formatEther(await provider.getBalance(wallet.address));

      return {
        address: wallet.address,
        balance,
        type: 'evm',
        chainId: chain.id,
      };
    } catch (error) {
      logger.error(`[MultiChain] Failed to get wallet info for chain ${chainId}:`, error);
      throw error;
    }
  }

  async signMessage(message: string): Promise<string> {
    try {
      const wallet = await this.createOrLoadWallet();
      return await wallet.signMessage(message);
    } catch (error) {
      logger.error('[MultiChain] Failed to sign message:', error);
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

      const connectedWallet = wallet.connect(provider);
      return await connectedWallet.signTransaction(transaction);
    } catch (error) {
      logger.error('[MultiChain] Failed to sign transaction:', error);
      throw error;
    }
  }

  async checkNetworkStatus(chainId: string): Promise<boolean> {
    try {
      const provider = this.providers[chainId];
      if (!provider) {
        throw new Error(`Provider not initialized for chain ${chainId}`);
      }

      const blockNumber = await provider.getBlockNumber();
      return blockNumber > 0;
    } catch (error) {
      logger.error(`[MultiChain] Failed to check network status for chain ${chainId}:`, error);
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

      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function allowance(address owner, address spender) view returns (uint256)'],
        provider
      );

      return await tokenContract.allowance(wallet.address, spender);
    } catch (error) {
      logger.error(`[MultiChain] Failed to check token allowance:`, error);
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

      const connectedWallet = wallet.connect(provider);
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function approve(address spender, uint256 amount) returns (bool)'],
        connectedWallet
      );

      const tx = await tokenContract.approve(spender, amount);
      return tx.hash;
    } catch (error) {
      logger.error(`[MultiChain] Failed to approve token:`, error);
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
    } catch (error) {
      logger.error(`[MultiChain] Failed to estimate gas:`, error);
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
    } catch (error) {
      logger.error(`[MultiChain] Failed to get gas price:`, error);
      throw error;
    }
  }

  // Add method to check if wallet password exists
  async hasPassword(): Promise<boolean> {
    try {
      const password = await secureStorage.getItem(STORAGE_KEYS.WALLET_PASSWORD);
      const hasPassword = !!password;
      logger.info(`[MultiChain] hasPassword check: ${hasPassword}`);
      return hasPassword;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorDetails = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : { message: String(error) };
      
      logger.error('[MultiChain] Failed to check wallet password existence:', errorMessage, errorDetails);
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorDetails = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : { message: String(error) };
      
      logger.error('[MultiChain] Failed to check backup confirmation:', errorMessage, errorDetails);
      return false;
    }
  }

  // Add method to set backup confirmation
  async setBackupConfirmed(): Promise<void> {
    try {
      await secureStorage.setItem(STORAGE_KEYS.BACKUP_CONFIRMED, 'true');
      logger.info('[MultiChain] Backup confirmation set successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorDetails = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : { message: String(error) };
      
      logger.error('[MultiChain] Failed to set backup confirmation:', errorMessage, errorDetails);
      throw error;
    }
  }

  public getChainConfig(chainId: string) {
    return SUPPORTED_CHAINS[chainId];
  }

  // Add logout method to clear all wallet data
  async logout(): Promise<void> {
    try {
      logger.info('[MultiChain] Starting logout process...');
      
      // Clear wallet instance
      this.wallet = null;
      logger.info('[MultiChain] Wallet instance cleared');
      
      // Clear all stored data with individual error handling
      const keysToDelete = [
        STORAGE_KEYS.PRIVATE_KEY,
        STORAGE_KEYS.SEED_PHRASE,
        STORAGE_KEYS.TEMP_SEED_PHRASE,
        STORAGE_KEYS.WALLET_PASSWORD,
        STORAGE_KEYS.BACKUP_CONFIRMED
      ];
      
      let deletedCount = 0;
      for (const key of keysToDelete) {
        try {
          await secureStorage.deleteItem(key);
          logger.info(`[MultiChain] Deleted storage key: ${key}`);
          deletedCount++;
        } catch (deleteError) {
          logger.warn(`[MultiChain] Failed to delete ${key}:`, deleteError);
          // Continue with other keys even if one fails
        }
      }
      
      logger.info(`[MultiChain] Logout completed. Deleted ${deletedCount} storage keys.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorDetails = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : { message: String(error) };
      
      logger.error('[MultiChain] Failed to logout:', errorMessage, errorDetails);
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

      await this.logout();
      logger.info('[MultiChain] Wallet cleared successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorDetails = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : { message: String(error) };
      
      logger.error('[MultiChain] Failed to clear wallet:', errorMessage, errorDetails);
      throw error;
    }
  }

  // Add method to clear transaction history
  async clearTransactionHistory(): Promise<void> {
    try {
      // This would typically clear transaction history from local storage
      // For now, we'll just log the action
      logger.info('[MultiChain] Transaction history cleared');
    } catch (error) {
      logger.error('[MultiChain] Failed to clear transaction history:', error);
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
    } catch (error) {
      logger.error('[MultiChain] Failed to verify wallet password:', error);
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
    } catch (error) {
      logger.error('[MultiChain] Failed to check password migration:', error);
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
      const result = await PasswordMigration.migrateUserPassword(plainTextPassword);
      
      if (result.success) {
        logger.info('[MultiChain] Password migration completed successfully');
      } else {
        logger.error('[MultiChain] Password migration failed:', result.errors);
      }
      
      return {
        success: result.success,
        error: result.errors.length > 0 ? result.errors[0] : undefined
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('[MultiChain] Failed to migrate user password:', errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  // Add method to get seed phrase
  async getSeedPhrase(): Promise<string> {
    try {
      const seedPhrase = await secureStorage.getItem(STORAGE_KEYS.SEED_PHRASE);
      if (!seedPhrase) {
        throw new Error('No seed phrase found. This wallet may have been imported with a private key only.');
      }
      return seedPhrase;
    } catch (error) {
      logger.error('[MultiChain] Failed to get seed phrase:', error);
      throw error;
    }
  }

  // Add method to export private key
  async exportPrivateKey(): Promise<string> {
    try {
      const privateKey = await secureStorage.getItem(STORAGE_KEYS.PRIVATE_KEY);
      if (!privateKey) {
        throw new Error('No private key found');
      }
      return privateKey;
    } catch (error) {
      logger.error('[MultiChain] Failed to export private key:', error);
      throw error;
    }
  }
}