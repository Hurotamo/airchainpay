// OnChainTransport for sending on-chain payments
import TokenWalletManager, { TokenInfo } from '../../wallet/TokenWalletManager';
import { logger } from '../../utils/Logger';
import { SUPPORTED_CHAINS } from '../../constants/AppConfig';
import { IPaymentTransport } from './BLETransport';
import { MultiChainWalletManager } from '../../wallet/MultiChainWalletManager';

export class OnChainTransport implements IPaymentTransport {
  async send(txData: any): Promise<any> {
    try {
      logger.info('[OnChainTransport] Sending payment on-chain', txData);
      
      // Extract payment data
      const { to, amount, chainId, token, paymentReference, gasPrice } = txData;
      
      if (!to || !amount || !chainId) {
        throw new Error('Missing required payment fields: to, amount, chainId');
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
        throw new Error('No private key found in wallet storage');
      }
      
      if (typeof privateKey !== 'string') {
        throw new Error(`Invalid private key type: ${typeof privateKey}. Expected string.`);
      }
      
      // Ensure private key has 0x prefix
      let formattedPrivateKey = privateKey;
      if (!privateKey.startsWith('0x')) {
        formattedPrivateKey = `0x${privateKey}`;
        logger.info('[OnChainTransport] Added 0x prefix to private key');
      }
      
      // Validate private key format (should be 66 characters: 0x + 64 hex chars)
      if (formattedPrivateKey.length !== 66) {
        throw new Error(`Invalid private key length: ${formattedPrivateKey.length}. Expected 66 characters (0x + 64 hex).`);
      }
      
      // Validate hex format
      const hexPart = formattedPrivateKey.slice(2);
      if (!/^[0-9a-fA-F]{64}$/.test(hexPart)) {
        throw new Error('Invalid private key format. Must be 64 hexadecimal characters after 0x prefix.');
      }

      // Validate other required fields
      if (!to || typeof to !== 'string' || !to.startsWith('0x')) {
        throw new Error('Invalid or missing recipient address');
      }
      if (!amount || isNaN(Number(amount))) {
        throw new Error('Invalid or missing amount');
      }
      if (!chainId || typeof chainId !== 'string') {
        throw new Error('Invalid or missing chainId');
      }

      // Build TokenInfo for native token if not provided
      let tokenInfo: TokenInfo;
      if (token) {
        tokenInfo = token;
      } else {
        const chainConfig = SUPPORTED_CHAINS[chainId];
        if (!chainConfig) {
          throw new Error(`Unsupported chain: ${chainId}`);
        }
        tokenInfo = {
          symbol: chainConfig.nativeCurrency.symbol,
          name: chainConfig.nativeCurrency.name,
          decimals: chainConfig.nativeCurrency.decimals,
          address: '', // Native token has no contract address
          chainId: chainId,
          isNative: true,
        };
      }
      
      // Send transaction using TokenWalletManager instance
      const result = await TokenWalletManager.sendTokenTransaction(
        formattedPrivateKey, // Use the formatted private key
        to,
        amount,
        tokenInfo,
        paymentReference,
        gasPrice // Pass gas price if provided
      );
      
      logger.info('[OnChainTransport] Payment sent successfully', result);
      return {
        status: 'sent',
        transport: 'onchain',
        hash: result.hash,
        chainId: result.chainId,
        ...txData
      };
      
    } catch (error) {
      if (error instanceof Error) {
        logger.error('[OnChainTransport] Failed to send payment:', error.stack || error.message);
        throw new Error(`On-chain payment failed: ${error.message}`);
      } else {
        logger.error('[OnChainTransport] Failed to send payment:', error);
        throw new Error(`On-chain payment failed: ${String(error)}`);
      }
    }
  }
} 