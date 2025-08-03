import { logger } from '../../utils/Logger';
import { PaymentRequest, PaymentResult } from '../PaymentService';

export interface IPaymentTransport<RequestType, ResultType> {
  send(txData: RequestType): Promise<ResultType>;
}

export interface PaymentRequestWithSignedTx extends PaymentRequest {
  signedTx?: string;
}

export class RelayTransport implements IPaymentTransport<PaymentRequestWithSignedTx, PaymentResult> {
  private static instance: RelayTransport;
  private relayUrl: string;

  private constructor() {
    // Use local relay server for development, or environment variable
    this.relayUrl = process.env.RELAY_SERVER_URL || 'http://localhost:4000'; 
  }

  public static getInstance(): RelayTransport {
    if (!RelayTransport.instance) {
      RelayTransport.instance = new RelayTransport();
    }
    return RelayTransport.instance;
  }

  private getChainIdForRelay(chainId: string): number {
    // Convert chain ID string to numeric value for relay
    switch (chainId) {
      case 'core_testnet':
        return 1114;
      case 'base_sepolia':
        return 84532;
      case 'morph_holesky':
        return 17000;
      case 'lisk_sepolia':
        return 4202;
      default:
        return parseInt(chainId) || 1114; // fallback to core testnet
    }
  }

  private getRpcUrlForChain(chainId: string): string {
    // Get RPC URL for the chain
    switch (chainId) {
      case 'core_testnet':
        return 'https://rpc.test2.btcs.network';
      case 'base_sepolia':
        return 'https://sepolia.base.org';
      case 'morph_holesky':
        return 'https://holesky.drpc.org';
      case 'lisk_sepolia':
        return 'https://rpc.sepolia-api.lisk.com';
      default:
        return 'https://rpc.test2.btcs.network'; // fallback to core testnet
    }
  }

  async send(txData: PaymentRequestWithSignedTx): Promise<PaymentResult> {
    const maxRetries = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`[RelayTransport] Attempt ${attempt}/${maxRetries} - Sending transaction via relay`, {
          to: txData.to,
          amount: txData.amount,
          chainId: txData.chainId,
          hasSignedTx: !!txData.signedTx,
          relayUrl: this.relayUrl
        });

        // First, check if relay server is healthy
        try {
          const healthController = new AbortController();
          const healthTimeout = setTimeout(() => healthController.abort(), 5000);
          
          const healthResponse = await fetch(`${this.relayUrl}/health`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
            signal: healthController.signal
          });
          
          clearTimeout(healthTimeout);
          
          if (!healthResponse.ok) {
            throw new Error(`Relay server health check failed: ${healthResponse.statusText}`);
          }
          
          const healthResult = await healthResponse.json();
          logger.info('[RelayTransport] Relay server health check passed', healthResult);
        } catch (healthError) {
          logger.warn('[RelayTransport] Relay server health check failed, but proceeding:', healthError);
        }

        logger.info('[RelayTransport] Sending request to relay', {
          url: `${this.relayUrl}/api/send_tx`,
          requestBody: {
            signed_tx: txData.signedTx ? `${txData.signedTx.slice(0, 20)}...` : 'empty',
            chain_id: txData.chainId
          }
        });

        // Send to relay server with timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        
        // Get the correct chain ID for the relay
        const chainId = this.getChainIdForRelay(txData.chainId);
        
        const response = await fetch(`${this.relayUrl}/api/send_tx`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'AirChainPay-Wallet/1.0.0'
          },
          body: JSON.stringify({
            signed_tx: txData.signedTx || '',
            rpc_url: this.getRpcUrlForChain(txData.chainId),
            chain_id: chainId
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeout);

        logger.info('[RelayTransport] Relay response received', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Relay request failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();

        logger.info('[RelayTransport] Transaction sent successfully via relay', {
          transactionId: result.transaction_id || result.transactionId,
          success: result.success,
          result: result
        });

        return {
          status: 'sent',
          transport: 'relay',
          transactionId: result.transaction_id || result.transactionId || 'unknown',
          message: result.message || 'Transaction sent successfully via relay',
          timestamp: Date.now()
        };

      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.error(`[RelayTransport] Attempt ${attempt} failed:`, lastError);
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          logger.info(`[RelayTransport] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // All retries failed
    logger.error('[RelayTransport] All attempts failed:', lastError);
    throw new Error(`Relay transport failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
  }
} 