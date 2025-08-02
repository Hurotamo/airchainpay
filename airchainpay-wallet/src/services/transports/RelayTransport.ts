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
    this.relayUrl = 'https://relay.airchainpay.com'; 
  }

  public static getInstance(): RelayTransport {
    if (!RelayTransport.instance) {
      RelayTransport.instance = new RelayTransport();
    }
    return RelayTransport.instance;
  }

  async send(txData: PaymentRequestWithSignedTx): Promise<PaymentResult> {
    try {
      logger.info('[RelayTransport] Sending transaction via relay', {
        to: txData.to,
        amount: txData.amount,
        chainId: txData.chainId,
        hasSignedTx: !!txData.signedTx
      });

      // Prepare relay request
      const relayRequest = {
        to: txData.to,
        amount: txData.amount,
        chainId: txData.chainId,
        token: txData.token,
        paymentReference: txData.paymentReference,
        metadata: txData.metadata,
        signed_tx: txData.signedTx || '',
        timestamp: Date.now()
      };

      // Send to relay (simulated for now)
      const response = await fetch(`${this.relayUrl}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(relayRequest)
      });

      if (!response.ok) {
        throw new Error(`Relay request failed: ${response.statusText}`);
      }

      const result = await response.json();

      logger.info('[RelayTransport] Transaction sent successfully via relay', {
        transactionId: result.transactionId,
        hash: result.hash
      });

      return {
        status: 'sent',
        transport: 'relay',
        transactionId: result.transactionId,
        message: 'Transaction sent successfully via relay',
        timestamp: Date.now()
      };

    } catch (error: unknown) {
      logger.error('[RelayTransport] Failed to send transaction via relay:', error);
      throw new Error(`Relay transport failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} 