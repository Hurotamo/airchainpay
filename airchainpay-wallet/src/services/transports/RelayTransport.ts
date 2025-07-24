import { IPaymentTransport } from './BLETransport';
import { logger } from '../../utils/Logger';
import { getRelayConfig } from '../../constants/config';
import { WalletError, TransactionError } from '../../utils/ErrorClasses';
import { PaymentRequest, PaymentResult } from '../PaymentService';

export class RelayTransport implements IPaymentTransport {
  private getRelayUrl(): string {
    const config = getRelayConfig();
    // Use the first endpoint as primary
    return `${config.relayEndpoints[0]}${config.transactionEndpoint}`;
  }

  private async checkRelayHealth(): Promise<boolean> {
    const config = getRelayConfig();
    
    for (const endpoint of config.relayEndpoints) {
      try {
        const healthUrl = `${endpoint}${config.healthEndpoint}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // Reduced timeout
        
        logger.info('[RelayTransport] Testing relay health at', { url: healthUrl });
        
        const response = await fetch(healthUrl, { 
          signal: controller.signal,
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'AirChainPay-Wallet/1.0'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          logger.info('[RelayTransport] Relay health check passed', { url: healthUrl });
          return true;
        } else {
          logger.warn('[RelayTransport] Relay health check failed', { 
            url: healthUrl, 
            status: response.status 
          });
        }
              } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.warn('[RelayTransport] Relay health check error', { 
            url: endpoint, 
            error: errorMessage 
          });
        }
    }
    
    logger.error('[RelayTransport] All relay health checks failed');
    return false;
  }

  async send(txData: PaymentRequest): Promise<PaymentResult> {
    // First check if relay is available
    const isRelayHealthy = await this.checkRelayHealth();
    if (!isRelayHealthy) {
      throw new WalletError('Relay server is not available');
    }

    const relayUrl = this.getRelayUrl();
    
    try {
      logger.info('[RelayTransport] Sending transaction to relay', {
        url: relayUrl,
        data: {
          to: txData.to,
          amount: txData.amount,
          chainId: txData.chainId,
          hasSignedTx: !!txData.signedTx
        }
      });

      // Format the request according to what the relay expects
      const requestData = {
        signed_tx: txData.signedTx || '',
        rpc_url: this.getRpcUrl(txData.chainId),
        chain_id: parseInt(txData.chainId) || 1114
      };

      logger.info('[RelayTransport] Request data', requestData);

      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(relayUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestData),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('[RelayTransport] Relay responded with error', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        throw new TransactionError(`Relay responded with status ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      logger.info('[RelayTransport] Transaction sent successfully', result);
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      logger.error('[RelayTransport] Failed to send transaction to relay', {
        error: errorMessage,
        url: relayUrl,
        stack: errorStack
      });
      throw new TransactionError('Failed to send transaction to relay: ' + errorMessage);
    }
  }

  private getRpcUrl(chainId: string): string {
    // Map chain IDs to RPC URLs
    const rpcUrls: { [key: string]: string } = {
      '1114': 'https://rpc.test2.btcs.network', // Core Testnet 2
      '84532': 'https://base-sepolia.drpc.org', // Base Sepolia
      '1116': 'https://rpc.coredao.org', // Core Mainnet
    };
    
    return rpcUrls[chainId] || 'https://rpc.test2.btcs.network';
  }
} 