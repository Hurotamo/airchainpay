// Enhanced BLETransport implementing the complete BLE payment flow:
// Actor → Scan → Connect → Send Payment → Get Transaction Hash → Advertiser Receives Token → Advertiser Advertises
import { logger } from '../../utils/Logger';
import { BluetoothManager, AIRCHAINPAY_SERVICE_UUID, AIRCHAINPAY_CHARACTERISTIC_UUID, BLEPaymentData, SupportedToken } from '../../bluetooth/BluetoothManager';
import { TransactionBuilder } from '../../utils/TransactionBuilder';
import { MultiChainWalletManager } from '../../wallet/MultiChainWalletManager';
import { TransactionService } from '../TransactionService';
import { BLEError } from '../../utils/ErrorClasses';
import { PaymentRequest } from '../PaymentService';
import { Device } from 'react-native-ble-plx';
import { TxQueue } from '../TxQueue';
import { ethers } from 'ethers';
import offlineSecurityService from '../OfflineSecurityService';
import { TokenInfo } from '../../wallet/TokenWalletManager';
import { createEnvelope, parseEnvelope } from './BLEEnvelope';
import { BLESecurity } from '../../utils/crypto/BLESecurity';
import { BLEAdvertisingMonitor } from '../../bluetooth/BLEAdvertisingMonitor';

export interface BLEPaymentRequest extends PaymentRequest {
  device: Device;
}

export interface IPaymentTransport<RequestType, ResultType> {
  send(txData: RequestType): Promise<ResultType>;
}

export interface EnhancedPaymentResult {
  status: 'sent' | 'failed' | 'pending' | 'confirmed' | 'advertising' | 'queued';
  transport: 'ble';
  deviceId?: string;
  deviceName?: string;
  transactionHash?: string;
  paymentConfirmed?: boolean;
  advertiserAdvertising?: boolean;
  message?: string;
  timestamp: number;
  metadata?: any;
  transactionId?: string;
}

export class BLETransport implements IPaymentTransport<BLEPaymentRequest, EnhancedPaymentResult> {
  private bluetoothManager: BluetoothManager;
  private walletManager: MultiChainWalletManager;
  private transactionService: TransactionService;
  private security: BLESecurity;
  private sessionId: string | null = null;
  private monitor = BLEAdvertisingMonitor.getInstance();

  constructor() {
    this.bluetoothManager = BluetoothManager.getInstance();
    this.walletManager = MultiChainWalletManager.getInstance();
    this.transactionService = TransactionService.getInstance();
    this.security = BLESecurity.getInstance();
  }

  async send(txData: BLEPaymentRequest): Promise<EnhancedPaymentResult> {
    try {
      logger.info('[BLETransport] Starting enhanced BLE payment flow', txData);
      
      // Extract payment data
      const { to, amount, chainId, device } = txData;
      
      if (!to || !amount || !chainId) {
        throw new Error('Missing required payment fields: to, amount, chainId');
      }
      
      if (!device || !device.id) {
        throw new Error('Missing BLE device information');
      }

      // Check if we're offline by attempting to connect to the network
      const isOnline = await this.checkNetworkStatus(chainId);
      
      if (!isOnline) {
        logger.info('[BLETransport] Offline detected, performing centralized security checks before queueing');
        return await this.queueOfflineTransactionWithCentralizedSecurity(txData);
      }
      
      // Step 1: Check BLE availability and Bluetooth state
      await this.checkBLEAvailability();
      
      // Step 2: Connect to device (if not already connected)
      await this.connectToDevice(device);
      
      // Step 3: Send payment data
      await this.sendPaymentData(device, txData);
      
      // Step 4: Listen for transaction hash and confirmation
      const transactionResult = await this.waitForTransactionConfirmation(device);
      
      // Step 5: Wait for advertiser to start advertising (receipt confirmation)
      const advertisingResult = await this.waitForAdvertiserConfirmation(device);
      
      logger.info('[BLETransport] Complete BLE payment flow finished', {
        deviceId: device.id,
        transactionHash: transactionResult.transactionHash,
        paymentConfirmed: transactionResult.paymentConfirmed,
        advertiserAdvertising: advertisingResult.advertiserAdvertising
      });
      
      return {
        status: 'confirmed',
        transport: 'ble',
        transactionId: transactionResult.transactionHash,
        message: 'BLE payment completed successfully',
        timestamp: Date.now(),
        deviceId: device.id,
        deviceName: device.name || device.localName || undefined,
        transactionHash: transactionResult.transactionHash,
        paymentConfirmed: transactionResult.paymentConfirmed,
        advertiserAdvertising: advertisingResult.advertiserAdvertising
      };
    } catch (error: unknown) {
      logger.error('[BLETransport] BLE payment failed:', error);
      throw new Error(`BLE payment failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Enhanced offline transaction queueing with centralized security checks
   */
  private async queueOfflineTransactionWithCentralizedSecurity(txData: BLEPaymentRequest): Promise<EnhancedPaymentResult> {
    try {
      logger.info('[BLETransport] Performing centralized security checks for offline transaction');

      const { to, amount, chainId, token, paymentReference, device } = txData;

      // Use centralized security service for all checks
      const tokenInfo: TokenInfo = token
        ? {
            symbol: token.symbol,
            name: token.symbol,
            decimals: token.decimals,
            address: token.address,
            chainId: chainId,
            isNative: token.isNative
          }
        : {
            symbol: 'ETH',
            name: 'Ethereum',
            decimals: 18,
            address: '',
            chainId: chainId,
            isNative: true
          };

      // Perform comprehensive security checks using centralized service
      await offlineSecurityService.performOfflineSecurityCheck(
        to,
        amount,
        chainId,
        tokenInfo
      );

      // Validate amount before parsing
      if (!amount || typeof amount !== 'string') {
        throw new Error(`Invalid amount: ${amount}. Must be a non-empty string.`);
      }
      
      const amountString = amount.trim();
      if (amountString === '') {
        throw new Error('Amount cannot be empty');
      }
      
      // Check if the original amount was actually NaN
      if (typeof amount === 'number' && isNaN(amount)) {
        throw new Error('Amount is NaN (number)');
      }
      
      // Additional validation to catch NaN early
      if (amountString === 'NaN' || amountString === 'undefined' || amountString === 'null') {
        throw new Error(`Invalid amount string: ${amountString}`);
      }
      
      // Validate amount is a valid number
      const amountNum = parseFloat(amountString);
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error(`Invalid amount: ${amountString}. Must be a positive number.`);
      }
      
      logger.info('[BLETransport] Amount validation passed', {
        originalAmount: amountString,
        parsedAmount: amountNum,
        tokenDecimals: token?.decimals || 18,
        isNative: token?.isNative
      });

      // Create transaction object for signing with validated amount
      const transaction = {
        to: to,
        value: token?.isNative ? ethers.parseEther(amountString) : ethers.parseUnits(amountString, token?.decimals || 18),
        data: paymentReference ? ethers.hexlify(ethers.toUtf8Bytes(paymentReference)) : undefined
      };

      // Sign transaction for offline queueing
      const signedTx = await this.walletManager.signTransaction(transaction, chainId);
      
      // Add to offline queue with enhanced metadata
      const transactionId = Date.now().toString();
      await TxQueue.addTransaction({
        id: transactionId,
        to: to,
        amount: amount,
        status: 'pending',
        chainId: chainId,
        timestamp: Date.now(),
        signedTx: signedTx,
        transport: 'ble',
        paymentReference: paymentReference,
        metadata: {
          merchant: device.name || device.localName || 'BLE Device',
          location: 'Offline BLE Transaction',
          timestamp: Date.now()
        }
      });

      // Update offline balance tracking using centralized service
      await offlineSecurityService.updateOfflineBalanceTracking(chainId, amount, tokenInfo);

      logger.info('[BLETransport] Transaction queued for offline processing with centralized security validation', {
        to,
        amount,
        chainId,
        transport: 'ble'
      });

      return {
        status: 'queued',
        transport: 'ble',
        message: 'Transaction queued for offline processing (security validated)',
        timestamp: Date.now(),
        deviceId: device.id,
        deviceName: device.name || device.localName || undefined
      };
    } catch (error: unknown) {
      logger.error('[BLETransport] Centralized security check failed:', error);
      throw error;
    }
  }

  /**
   * Check if network is online for the specified chain
   */
  private async checkNetworkStatus(chainId: string): Promise<boolean> {
    try {
      return await this.walletManager.checkNetworkStatus(chainId);
    } catch (error: unknown) {
      logger.warn('[BLETransport] Failed to check network status:', error);
      return false;
    }
  }

  /**
   * Step 1: Check BLE availability and Bluetooth state
   */
  private async checkBLEAvailability(): Promise<void> {
    if (!this.bluetoothManager.isBleAvailable()) {
      throw new BLEError('BLE not available on this device');
    }
    
    const isBluetoothEnabled = await this.bluetoothManager.isBluetoothEnabled();
    if (!isBluetoothEnabled) {
      throw new BLEError('Bluetooth is not enabled');
    }
    
    logger.info('[BLETransport] BLE availability check passed');
  }

  /**
   * Step 2: Connect to device (if not already connected)
   */
  private async connectToDevice(device: Device): Promise<void> {
    const isConnected = this.bluetoothManager.isDeviceConnected(device.id);
    if (!isConnected) {
      logger.info('[BLETransport] Connecting to device:', device.id);
      await this.bluetoothManager.connectToDevice(device);
      logger.info('[BLETransport] Successfully connected to device:', device.id);
      // Initiate key exchange after connect
      await this.runKeyExchange(device);
    } else {
      logger.info('[BLETransport] Already connected to device:', device.id);
    }
  }

  private async runKeyExchange(device: Device): Promise<void> {
    try {
      const init = await this.security.initiateKeyExchange(device.id);
      const initEnvelope = createEnvelope('payment_request', init, init.sessionId, '0', '');
      // Send key exchange init over same channel
      await this.bluetoothManager.sendDataToDevice(
        device.id,
        AIRCHAINPAY_SERVICE_UUID,
        AIRCHAINPAY_CHARACTERISTIC_UUID,
        JSON.stringify(initEnvelope)
      );

      // Wait for response
      const response = await new Promise<any>(async (resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Key exchange response timeout'));
        }, 30000);
        const sub = await this.bluetoothManager.listenForData(
          device.id,
          AIRCHAINPAY_SERVICE_UUID,
          AIRCHAINPAY_CHARACTERISTIC_UUID,
          (data) => {
            try {
              const env = parseEnvelope<any>(data);
              if (env.type === 'payment_request' && env.payload?.type === 'key_exchange_response') {
                clearTimeout(timeout);
                cleanup();
                resolve(env.payload);
              }
            } catch {}
          }
        );
        const cleanup = () => { try { sub.remove(); } catch {} };
      });

      const confirm = await this.security.processKeyExchangeResponse(response);
      // Send confirm
      const confirmEnvelope = createEnvelope('payment_request', confirm, confirm.sessionId, '0', '');
      await this.bluetoothManager.sendDataToDevice(
        device.id,
        AIRCHAINPAY_SERVICE_UUID,
        AIRCHAINPAY_CHARACTERISTIC_UUID,
        JSON.stringify(confirmEnvelope)
      );

      await this.security.processKeyExchangeConfirm(confirm);
      this.sessionId = confirm.sessionId;
      logger.info('[BLETransport] Key exchange completed', { sessionId: this.sessionId });
    } catch (error) {
      logger.warn('[BLETransport] Key exchange failed; proceeding without session', error);
      this.sessionId = null;
    }
  }

  /**
   * Step 3: Send payment data
   */
  private async sendPaymentData(device: Device, txData: BLEPaymentRequest): Promise<void> {
    const { to, amount, chainId } = txData;
    
    // When constructing BLE payment data, do not include 'timestamp' property
    const paymentData: PaymentRequest = {
      to,
      amount,
      chainId,
      transport: 'ble',
    };
    
    // Compress payment data using protobuf + CBOR
    const compressedData = await TransactionBuilder.serializeBLEPayment(paymentData);

    let payload: any = compressedData.toString('base64');
    let sessionId = this.sessionId || 'no-session';
    let nonce = '0';
    let hmac = '';

    // If we have a session, encrypt the compressed payload and attach HMAC/nonce
    if (this.sessionId) {
      const encrypted = await this.security.encryptPaymentData(this.sessionId, {
        to: paymentData.to,
        amount: paymentData.amount,
        chainId: paymentData.chainId,
        paymentReference: paymentData.paymentReference,
        token: paymentData.token,
        metadata: paymentData.metadata,
        timestamp: Date.now()
      } as any);
      payload = encrypted;
      sessionId = encrypted.sessionId;
      nonce = encrypted.nonce;
      hmac = encrypted.hmac;
    }

    // Wrap into envelope
    const envelope = createEnvelope('payment_request', payload, sessionId, nonce, hmac);

    // Send envelope JSON via BLE, chunking if large
    const json = JSON.stringify(envelope);
    const base64 = Buffer.from(json, 'utf8').toString('base64');
    const useChunking = base64.length > 4096; // align with BluetoothManager threshold

    this.monitor.startMonitoring({ sessionId: sessionId || 'no-session', deviceName: device.name || device.id, mode: this.sessionId ? 'secure' : 'basic' });
    if (useChunking && (this.bluetoothManager as any).sendLargeDataToDevice) {
      await (this.bluetoothManager as any).sendLargeDataToDevice(
        device.id,
        AIRCHAINPAY_SERVICE_UUID,
        AIRCHAINPAY_CHARACTERISTIC_UUID,
        base64
      );
    } else {
      await this.bluetoothManager.sendDataToDevice(
      device.id,
      AIRCHAINPAY_SERVICE_UUID,
      AIRCHAINPAY_CHARACTERISTIC_UUID,
        json
      );
    }
    
    logger.info('[BLETransport] Payment data sent successfully', {
      deviceId: device.id,
      amount,
      chainId,
      compressedSize: compressedData.length,
      size: json.length,
      type: 'payment_request',
      sessionId
    });
    this.monitor.recordSuccessMetrics(sessionId || 'no-session', base64.length);
    this.monitor.stopMonitoring(sessionId || 'no-session');
  }

  /**
   * Step 4: Listen for transaction hash and confirmation
   */
  private async waitForTransactionConfirmation(device: Device): Promise<{ transactionHash: string; paymentConfirmed: boolean }> {
    logger.info('[BLETransport] Waiting for transaction confirmation');
    
    return new Promise<{ transactionHash: string; paymentConfirmed: boolean }>(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Transaction confirmation timeout'));
      }, 30000); // 30 second timeout

      const listen = (this.bluetoothManager as any).listenForChunks || this.bluetoothManager.listenForData.bind(this.bluetoothManager);
      const listener = await listen(
        device.id,
        AIRCHAINPAY_SERVICE_UUID,
        AIRCHAINPAY_CHARACTERISTIC_UUID,
        (data: string) => {
          try {
            const env = parseEnvelope<any>(data);
            if (env.type === 'transaction_confirmation') {
              clearTimeout(timeout);
              cleanup();
              resolve({
                transactionHash: env.payload?.transactionHash || '',
                paymentConfirmed: env.payload?.confirmed === true
              });
            }
          } catch (error) {
            logger.warn('[BLETransport] Error parsing transaction confirmation:', error);
            this.monitor.recordErrorMetrics(this.sessionId || 'no-session', error as Error, { type: 'transaction_confirmation' });
          }
        }
      );

      const cleanup = () => {
        try { listener.remove(); } catch {}
      };
    });
  }

  /**
   * Step 5: Wait for advertiser to start advertising (receipt confirmation)
   */
  private async waitForAdvertiserConfirmation(device: Device): Promise<{ advertiserAdvertising: boolean }> {
    logger.info('[BLETransport] Waiting for advertiser confirmation');
    
    return new Promise<{ advertiserAdvertising: boolean }>(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Advertiser confirmation timeout'));
      }, 30000); // 30 second timeout

      const listener = await this.bluetoothManager.listenForData(
        device.id,
        AIRCHAINPAY_SERVICE_UUID,
        AIRCHAINPAY_CHARACTERISTIC_UUID,
        (data: string) => {
          try {
            const env = parseEnvelope<any>(data);
            if (env.type === 'advertiser_confirmation') {
              clearTimeout(timeout);
              cleanup();
              resolve({
                advertiserAdvertising: env.payload?.advertising === true
              });
            }
          } catch (error) {
            logger.warn('[BLETransport] Error parsing advertiser confirmation:', error);
          }
        }
      );

      const cleanup = () => {
        try { listener.remove(); } catch {}
      };
    });
  }

  /**
   * Start advertising as payment receiver
   */
  async startAdvertisingAsReceiver(): Promise<void> {
    try {
      if (!this.bluetoothManager.isAdvertisingSupported()) {
        throw new Error('BLE advertising not supported on this device');
      }
      
      const walletAddress = await this.walletManager.getWalletAddress();
      const paymentData: BLEPaymentData = {
        walletAddress,
        amount: '0',
        token: 'ETH' as SupportedToken,
        timestamp: Date.now()
      };
      
      await this.bluetoothManager.startAdvertising(paymentData);
      logger.info('[BLETransport] Started advertising as payment receiver');
      
    } catch (error) {
      logger.error('[BLETransport] Failed to start advertising:', error);
      throw error;
    }
  }

  /**
   * Stop advertising
   */
  async stopAdvertising(): Promise<void> {
    try {
      await this.bluetoothManager.stopAdvertising();
      logger.info('[BLETransport] Stopped advertising');
    } catch (error) {
      logger.error('[BLETransport] Failed to stop advertising:', error);
      throw error;
    }
  }
} 