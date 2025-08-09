import { BluetoothManager, AIRCHAINPAY_SERVICE_UUID, AIRCHAINPAY_CHARACTERISTIC_UUID } from '../bluetooth/BluetoothManager';
import { parseEnvelope, createEnvelope } from './transports/BLEEnvelope';
import { TransactionBuilder } from '../utils/TransactionBuilder';
import { PaymentRequest } from './PaymentService';
import { logger } from '../utils/Logger';
import { BLESecurity } from '../utils/crypto/BLESecurity';
import { ethers } from 'ethers';
import { TransactionService } from './TransactionService';
import { MultiChainWalletManager } from '../wallet/MultiChainWalletManager';
import offlineSecurityService from './OfflineSecurityService';
import { TxQueue } from './TxQueue';
import { ERC20_ABI } from '../constants/abi';
import { BLEAdvertisingMonitor } from '../bluetooth/BLEAdvertisingMonitor';

export class BLEReceiverService {
  private static instance: BLEReceiverService | null = null;
  private bleManager: BluetoothManager;
  private security: BLESecurity;
  private monitor = BLEAdvertisingMonitor.getInstance();

  private constructor() {
    this.bleManager = BluetoothManager.getInstance();
    this.security = BLESecurity.getInstance();
  }

  public static getInstance(): BLEReceiverService {
    if (!BLEReceiverService.instance) {
      BLEReceiverService.instance = new BLEReceiverService();
    }
    return BLEReceiverService.instance;
  }

  /**
   * Start listening for incoming BLE payment requests on a connected device.
   * This only handles deserialization and validation; execution is handled elsewhere.
   */
  async listenForPaymentRequests(
    deviceId: string,
    onPaymentRequest: (request: PaymentRequest) => void
  ): Promise<{ remove: () => void }> {
    const listener = await this.bleManager.listenForData(
      deviceId,
      AIRCHAINPAY_SERVICE_UUID,
      AIRCHAINPAY_CHARACTERISTIC_UUID,
      async (data: string) => {
        try {
          const request = await this.processRawEnvelope(deviceId, data);
          if (request) {
            onPaymentRequest(request);
            // Execute and respond over BLE
            try {
              await this.handlePaymentRequest(deviceId, request);
              this.monitor.recordSuccessMetrics('no-session', Buffer.byteLength(data, 'utf8'));
            } catch (err) {
              logger.error('[BLEReceiverService] Failed to handle payment request', err);
              this.monitor.recordErrorMetrics('no-session', err as Error, { type: 'payment_request' });
            }
          }
        } catch (error) {
          logger.warn('[BLEReceiverService] Failed to process incoming payment request', error);
          this.monitor.recordErrorMetrics('no-session', error as Error, { type: 'payment_request' });
        }
      }
    );

    logger.info('[BLEReceiverService] Listening for BLE payment requests', { deviceId });
    return listener;
  }

  /**
   * Process a raw envelope string and return a PaymentRequest if valid.
   * - Supports compressed payloads (base64 -> Buffer -> TransactionBuilder.deserializeBLEPayment)
   * - Falls back to JSON payloads for backward compatibility
   */
  async processRawEnvelope(deviceId: string, raw: string): Promise<PaymentRequest | null> {
    const env = parseEnvelope<any>(raw);
    if (env.type !== 'payment_request') {
      return null;
    }

    try {
      let request: PaymentRequest | null = null;

      if (env.payload && env.payload.type === 'key_exchange_init') {
        // Create response and send back
        const response = await this.security.createKeyExchangeResponse(env.payload);
        const responseEnvelope = createEnvelope('payment_request', response, response.sessionId, '0', '');
        await this.bleManager.sendDataToDevice(
          deviceId,
          AIRCHAINPAY_SERVICE_UUID,
          AIRCHAINPAY_CHARACTERISTIC_UUID,
          JSON.stringify(responseEnvelope)
        );
        return null;
      }

      if (env.payload && env.payload.type === 'encrypted_payment') {
        // Validate session/HMAC/nonce and decrypt
        const decrypted = await this.security.decryptPaymentData(env.payload);
        request = {
          to: decrypted.to,
          amount: decrypted.amount,
          chainId: decrypted.chainId,
          transport: 'ble',
          paymentReference: decrypted.paymentReference,
          token: decrypted.token,
          metadata: decrypted.metadata
        } as PaymentRequest;
      } else if (typeof env.payload === 'string') {
        // Compressed payload path (base64 string)
        const buffer = Buffer.from(env.payload, 'base64');
        request = await TransactionBuilder.deserializeBLEPayment(buffer);
      } else if (typeof env.payload === 'object' && env.payload !== null) {
        // Legacy JSON payload path
        request = env.payload as PaymentRequest;
      }

      if (!request) {
        throw new Error('Empty or invalid payment request');
      }

      // Minimal validation
      if (!request.to || !request.amount || !request.chainId) {
        throw new Error('Missing required fields in payment request');
      }

      logger.info('[BLEReceiverService] Deserialized BLE payment request', {
        chainId: request.chainId,
        amount: request.amount,
        hasToken: Boolean(request.token),
      });

      return request;
    } catch (error) {
      logger.error('[BLEReceiverService] Error deserializing BLE payment request', error);
      return null;
    }
  }

  /**
   * Execute payment on-chain if online; otherwise queue offline and track.
   * Sends transaction and advertiser confirmations back over BLE.
   */
  private async handlePaymentRequest(deviceId: string, request: PaymentRequest): Promise<void> {
    const walletManager = MultiChainWalletManager.getInstance();
    const txService = TransactionService.getInstance();
    const isOnline = await walletManager.checkNetworkStatus(request.chainId);

    if (!request.to || !request.amount || !request.chainId) {
      throw new Error('Invalid payment request');
    }

    const buildTx = (): ethers.TransactionRequest => {
      if (request.token && !request.token.isNative) {
        const iface = new ethers.Interface(ERC20_ABI as any);
        const amountUnits = ethers.parseUnits(request.amount, request.token.decimals || 18);
        const data = iface.encodeFunctionData('transfer', [request.to, amountUnits]);
        return { to: request.token.address, data, value: 0n };
      }
      const value = ethers.parseEther(request.amount);
      return { to: request.to, value };
    };

    if (!isOnline) {
      // Offline queue path
      const tokenInfo = request.token
        ? { symbol: request.token.symbol, name: request.token.symbol, decimals: request.token.decimals, address: request.token.address, chainId: request.chainId, isNative: request.token.isNative }
        : { symbol: 'ETH', name: 'Ethereum', decimals: 18, address: '', chainId: request.chainId, isNative: true };

      await offlineSecurityService.performOfflineSecurityCheck(request.to, request.amount, request.chainId, tokenInfo as any);

      const tx = buildTx();
      const signedTx = await walletManager.signTransaction(tx, request.chainId);
      const id = Date.now().toString();
      await TxQueue.addTransaction({ id, ...request, status: 'pending', timestamp: Date.now(), signedTx, transport: 'ble' });
      await offlineSecurityService.updateOfflineBalanceTracking(request.chainId, request.amount, tokenInfo as any);

      const confirmation = createEnvelope('transaction_confirmation', { transactionHash: id, confirmed: false }, 'no-session', '0', '');
      await this.bleManager.sendDataToDevice(deviceId, AIRCHAINPAY_SERVICE_UUID, AIRCHAINPAY_CHARACTERISTIC_UUID, JSON.stringify(confirmation));
      return;
    }

    // Online path
    const tx = buildTx();
    const result = await txService.sendTransaction(tx, request.chainId);
    const confirmed = result.status === 'confirmed';
    const confirmation = createEnvelope('transaction_confirmation', { transactionHash: result.hash, confirmed }, 'no-session', '0', '');
    await this.bleManager.sendDataToDevice(deviceId, AIRCHAINPAY_SERVICE_UUID, AIRCHAINPAY_CHARACTERISTIC_UUID, JSON.stringify(confirmation));

    // Optionally confirm advertiser advertising
    const adv = createEnvelope('advertiser_confirmation', { advertising: true }, 'no-session', '0', '');
    await this.bleManager.sendDataToDevice(deviceId, AIRCHAINPAY_SERVICE_UUID, AIRCHAINPAY_CHARACTERISTIC_UUID, JSON.stringify(adv));
  }
}

export default BLEReceiverService;

