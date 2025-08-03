// OnChainTransport for sending on-chain payments
import { logger } from '../../utils/Logger';
import { IPaymentTransport } from './BLETransport';
import { MultiChainWalletManager } from '../../wallet/MultiChainWalletManager';
import { WalletError, TransactionError } from '../../utils/ErrorClasses';
import { PaymentRequest, PaymentResult } from '../PaymentService';
import { ethers } from 'ethers';

export class OnChainTransport implements IPaymentTransport<PaymentRequest, PaymentResult> {
  
  /**
   * Preview transaction before sending
   */
  async previewTransaction(txData: PaymentRequest): Promise<{
    isValid: boolean;
    estimatedGas?: string;
    gasPrice?: string;
    totalCost?: string;
    balance?: string;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      logger.info('[OnChainTransport] Previewing transaction', txData);
      
      const { to, amount, chainId, token } = txData;
      
      // Validate required fields
      if (!to || !amount || !chainId) {
        errors.push('Missing required payment fields: to, amount, chainId');
        return { isValid: false, errors, warnings };
      }
      
      // Get wallet manager
      const walletManager = MultiChainWalletManager.getInstance();
      
      // Check if wallet exists
      const hasWallet = await walletManager.hasWallet();
      if (!hasWallet) {
        errors.push('No wallet found. Please create or import a wallet first.');
        return { isValid: false, errors, warnings };
      }
      
      // Get wallet info
      let walletInfo;
      try {
        walletInfo = await walletManager.getWalletInfo(chainId);
      } catch (error) {
        errors.push(`Failed to get wallet info: ${error instanceof Error ? error.message : String(error)}`);
        return { isValid: false, errors, warnings };
      }
      
      // Check private key
      let privateKey;
      try {
        privateKey = await walletManager.exportPrivateKey();
      } catch (error) {
        errors.push(`Failed to export private key: ${error instanceof Error ? error.message : String(error)}`);
        return { isValid: false, errors, warnings };
      }
      
      if (!privateKey) {
        errors.push('No private key found in wallet storage');
        return { isValid: false, errors, warnings };
      }
      
      // Validate address format
      if (!to.startsWith('0x') || to.length !== 42) {
        errors.push('Invalid recipient address format');
        return { isValid: false, errors, warnings };
      }
      
      // Validate amount
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        errors.push('Invalid amount. Must be a positive number.');
        return { isValid: false, errors, warnings };
      }
      
      // Check network connectivity
      const isOnline = await walletManager.checkNetworkStatus(chainId);
      if (!isOnline) {
        warnings.push('Network appears to be offline. Transaction may be queued for later processing.');
      }
      
      // Estimate gas (if online)
      let estimatedGas: string | undefined;
      let gasPrice: string | undefined;
      let totalCost: string | undefined;
      
      if (isOnline) {
        try {
          // Validate amount before parsing for gas estimation
          if (!amount || typeof amount !== 'string') {
            throw new Error(`Invalid amount: ${amount}. Must be a non-empty string.`);
          }
          
          const amountString = amount.trim();
          if (amountString === '') {
            throw new Error('Amount cannot be empty');
          }
          
          // Validate amount is a valid number
          const amountNum = parseFloat(amountString);
          if (isNaN(amountNum) || amountNum <= 0) {
            throw new Error(`Invalid amount: ${amountString}. Must be a positive number.`);
          }
          
          const gasEstimate = await walletManager.estimateGas({
            to,
            value: token?.isNative ? ethers.parseEther(amountString) : ethers.parseUnits(amountString, token?.decimals || 18)
          }, chainId);
          
          const currentGasPrice = await walletManager.getGasPrice(chainId);
          
          estimatedGas = gasEstimate.toString();
          gasPrice = currentGasPrice.toString();
          totalCost = (gasEstimate * currentGasPrice).toString();
          
        } catch (error) {
          warnings.push(`Failed to estimate gas: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      return {
        isValid: errors.length === 0,
        estimatedGas,
        gasPrice,
        totalCost,
        balance: walletInfo.balance,
        errors,
        warnings
      };
      
    } catch (error) {
      logger.error('[OnChainTransport] Preview failed:', error);
      errors.push(`Preview failed: ${error instanceof Error ? error.message : String(error)}`);
      return { isValid: false, errors, warnings };
    }
  }

  async send(txData: PaymentRequest): Promise<PaymentResult> {
    try {
      logger.info('[OnChainTransport] Sending payment on-chain', txData);
      
      // Extract payment data
      const { to, amount, chainId, token } = txData;
      
      if (!to || !amount || !chainId) {
        throw new WalletError('Missing required payment fields: to, amount, chainId');
      }
      
      // Get wallet manager
      const walletManager = MultiChainWalletManager.getInstance();
      const walletInfo = await walletManager.getWalletInfo(chainId);
      const privateKey = await walletManager.exportPrivateKey();

      // Enhanced debugging for private key
      logger.info('[OnChainTransport] Private key debug info', {
        hasPrivateKey: !!privateKey,
        privateKeyType: typeof privateKey,
        privateKeyLength: privateKey ? privateKey.length : 0,
        privateKeyPrefix: privateKey ? privateKey.slice(0, 4) : 'null',
        privateKeySuffix: privateKey ? privateKey.slice(-4) : 'null',
        startsWith0x: privateKey ? privateKey.startsWith('0x') : false,
        to,
        amount,
        token,
        chainId,
        walletInfo
      });

      // Enhanced private key validation
      if (!privateKey) {
        throw new WalletError('No private key found in wallet storage');
      }
      
      if (typeof privateKey !== 'string') {
        throw new WalletError(`Invalid private key type: ${typeof privateKey}. Expected string.`);
      }
      
      // Ensure private key has 0x prefix
      let formattedPrivateKey = privateKey;
      if (!privateKey.startsWith('0x')) {
        formattedPrivateKey = `0x${privateKey}`;
        logger.info('[OnChainTransport] Added 0x prefix to private key');
      }
      
      // Validate private key format (should be 66 characters: 0x + 64 hex chars)
      if (formattedPrivateKey.length !== 66) {
        throw new WalletError(`Invalid private key length: ${formattedPrivateKey.length}. Expected 66 characters (0x + 64 hex).`);
      }
      
      // Validate hex format
      const hexPart = formattedPrivateKey.slice(2);
      if (!/^[0-9a-fA-F]{64}$/.test(hexPart)) {
        throw new WalletError('Invalid private key format. Must be 64 hexadecimal characters after 0x prefix.');
      }

      // Validate other required fields
      if (!to || typeof to !== 'string' || !to.startsWith('0x')) {
        throw new WalletError('Invalid or missing recipient address');
      }
      
      // Enhanced amount validation
      if (!amount || typeof amount !== 'string') {
        throw new WalletError(`Invalid amount: ${amount}. Must be a non-empty string.`);
      }
      
      const amountString = amount.trim();
      if (amountString === '') {
        throw new WalletError('Amount cannot be empty');
      }
      
      // Check if the original amount was actually NaN
      if (typeof amount === 'number' && isNaN(amount)) {
        throw new WalletError('Amount is NaN (number)');
      }
      
      // Additional validation to catch NaN early
      if (amountString === 'NaN' || amountString === 'undefined' || amountString === 'null') {
        throw new WalletError(`Invalid amount string: ${amountString}`);
      }
      
      // Validate amount is a valid number
      const amountNum = parseFloat(amountString);
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new WalletError(`Invalid amount: ${amountString}. Must be a positive number.`);
      }
      
      logger.info('[OnChainTransport] Amount validation passed', {
        originalAmount: amountString,
        parsedAmount: amountNum,
        amountType: typeof amount
      });
      
      if (!chainId || typeof chainId !== 'string') {
        throw new WalletError('Invalid or missing chainId');
      }

      // Build TokenInfo for native token if not provided
      const tokenInfo = token ? {
        address: token.address,
        symbol: token.symbol,
        decimals: token.decimals,
        isNative: token.isNative,
        name: 'name' in token ? (token as any).name : '',
        chainId: 'chainId' in token ? (token as any).chainId : chainId,
      } : undefined;
      
      // Debug tokenInfo construction
      logger.info('[OnChainTransport] TokenInfo construction', {
        hasToken: !!token,
        tokenDecimals: token?.decimals,
        tokenDecimalsType: typeof token?.decimals,
        tokenSymbol: token?.symbol,
        tokenAddress: token?.address,
        tokenIsNative: token?.isNative,
        constructedTokenInfo: tokenInfo
      });
      
      // Send the transaction using the wallet manager with validated amount
      const transactionResult = await walletManager.sendTokenTransaction(
        to,
        amountString,
        chainId,
        tokenInfo
      );
      
      logger.info('[OnChainTransport] Payment sent successfully', transactionResult);
      
      return {
        status: 'sent',
        transport: 'onchain',
        message: 'Transaction sent successfully',
        timestamp: Date.now(),
        transactionId: transactionResult.transactionId,
        metadata: {
          hash: transactionResult.hash,
          chainId,
          to,
          amount,
          token: tokenInfo?.symbol || 'native'
        }
      };
      
    } catch (error) {
      if (error instanceof WalletError || error instanceof TransactionError) {
        logger.error('[OnChainTransport] Failed to send payment:', error.stack || error.message);
        throw error;
      } else if (error instanceof Error) {
        logger.error('[OnChainTransport] Failed to send payment:', error.stack || error.message);
        throw new TransactionError(`On-chain payment failed: ${error.message}`);
      } else {
        logger.error('[OnChainTransport] Failed to send payment:', error);
        throw new TransactionError(`On-chain payment failed: ${String(error)}`);
      }
    }
  }
} 