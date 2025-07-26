// OnChainTransport for sending on-chain payments
import { logger } from '../../utils/Logger';
import { IPaymentTransport } from './BLETransport';
import { MultiChainWalletManager } from '../../wallet/MultiChainWalletManager';
import { WalletError, TransactionError } from '../../utils/ErrorClasses';
import { PaymentRequest, PaymentResult } from '../PaymentService';

export class OnChainTransport implements IPaymentTransport<PaymentRequest, PaymentResult> {
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
      if (!amount || isNaN(Number(amount))) {
        throw new WalletError('Invalid or missing amount');
      }
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
      
      // Send the transaction using the wallet manager
      const transactionResult = await walletManager.sendTokenTransaction(
        to,
        amount,
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