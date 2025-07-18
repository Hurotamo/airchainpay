import { IPaymentTransport } from './BLETransport';

export class RelayTransport implements IPaymentTransport {
  async send(txData: any): Promise<any> {
    const relayUrl = 'http://localhost:4000/tx';
    try {
      const response = await fetch(relayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(txData),
      });
      if (!response.ok) {
        throw new Error(`Relay responded with status ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      throw new Error('Failed to send transaction to relay: ' + error);
    }
  }
} 