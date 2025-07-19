import { IPaymentTransport } from './BLETransport';
import { logger } from '../../utils/Logger';

export class RelayTransport implements IPaymentTransport {
  async send(txData: any): Promise<any> {
    const relayUrl = 'http://localhost:4000/send_tx';
    
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

      const response = await fetch(relayUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('[RelayTransport] Relay responded with error', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        throw new Error(`Relay responded with status ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      logger.info('[RelayTransport] Transaction sent successfully', result);
      return result;
    } catch (error) {
      logger.error('[RelayTransport] Failed to send transaction to relay', error);
      throw new Error('Failed to send transaction to relay: ' + error);
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