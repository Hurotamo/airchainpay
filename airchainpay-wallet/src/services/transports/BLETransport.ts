// Enhanced BLETransport implementing the complete BLE payment flow:
// Actor → Scan → Connect → Send Payment → Get Transaction Hash → Advertiser Receives Token → Advertiser Advertises
import { logger } from '../../utils/Logger';
import { BluetoothManager, AIRCHAINPAY_SERVICE_UUID, AIRCHAINPAY_CHARACTERISTIC_UUID } from '../../bluetooth/BluetoothManager';
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

  constructor() {
    this.bluetoothManager = BluetoothManager.getInstance();
    this.walletManager = MultiChainWalletManager.getInstance();
    this.transactionService = TransactionService.getInstance();
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
        logger.info('[BLETransport] Offline detected, performing security checks before queueing');
        return await this.queueOfflineTransactionWithSecurity(txData);
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
        deviceId: device.id,
        deviceName: device.name || device.localName || undefined,
        transactionHash: transactionResult.transactionHash,
        paymentConfirmed: transactionResult.paymentConfirmed,
        advertiserAdvertising: advertisingResult.advertiserAdvertising,
        message: 'Payment completed and advertiser confirmed receipt',
        timestamp: Date.now(),
        metadata: {
          ...txData,
          transactionHash: transactionResult.transactionHash,
          paymentConfirmed: transactionResult.paymentConfirmed,
          advertiserAdvertising: advertisingResult.advertiserAdvertising
        }
      };
      
    } catch (error) {
      logger.error('[BLETransport] Enhanced BLE payment failed:', error);
      return {
        status: 'failed',
        transport: 'ble',
        deviceId: txData.device?.id,
        deviceName: txData.device?.name || txData.device?.localName || undefined,
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
        metadata: txData
      };
    }
  }

  /**
   * Enhanced offline transaction queueing with comprehensive security checks
   */
  private async queueOfflineTransactionWithSecurity(txData: BLEPaymentRequest): Promise<EnhancedPaymentResult> {
    try {
      logger.info('[BLETransport] Performing security checks for offline transaction');

      const { to, amount, chainId, token, paymentReference, device } = txData;

      // Step 1: Validate balance before allowing offline transaction
      await this.validateOfflineBalance(txData);

      // Step 2: Check for duplicate transactions
      await this.checkForDuplicateTransaction(txData);

      // Step 3: Validate nonce for offline transaction
      await this.validateOfflineNonce(chainId);

      // Step 4: Create transaction object for signing
      const transaction = {
        to: to,
        value: token?.isNative ? ethers.parseEther(amount) : ethers.parseUnits(amount, token?.decimals || 18),
        data: paymentReference ? ethers.hexlify(ethers.toUtf8Bytes(paymentReference)) : undefined
      };

      // Step 5: Sign transaction for offline queueing
      const signedTx = await this.walletManager.signTransaction(transaction, chainId);
      
      // Step 6: Add to offline queue with enhanced metadata
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

      // Step 7: Update offline balance tracking
      await this.updateOfflineBalanceTracking(txData);

      logger.info('[BLETransport] Transaction queued for offline processing with security validation', {
        transactionId,
        to: to,
        amount: amount,
        chainId: chainId,
        deviceId: device.id
      });

      return {
        status: 'queued',
        transport: 'ble',
        transactionId: transactionId,
        deviceId: device.id,
        deviceName: device.name || device.localName || undefined,
        message: 'Transaction queued for processing when online (security validated)',
        timestamp: Date.now(),
        metadata: {
          ...txData,
          security: {
            balanceValidated: true,
            duplicateChecked: true,
            nonceValidated: true,
            offlineTimestamp: Date.now()
          }
        }
      };

    } catch (error: unknown) {
      logger.error('[BLETransport] Failed to queue offline transaction with security:', error);
      throw error;
    }
  }

  /**
   * Validate balance before allowing offline transaction
   */
  private async validateOfflineBalance(txData: BLEPaymentRequest): Promise<void> {
    try {
      const { amount, chainId, token } = txData;
      
      const tokenInfo: TokenInfo = token ? {
        symbol: token.symbol,
        name: token.symbol, // Use symbol as name if not available
        decimals: token.decimals,
        address: token.address,
        chainId: chainId, // Use the main chainId
        isNative: token.isNative
      } : {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        address: '',
        chainId: chainId,
        isNative: true
      };

      await offlineSecurityService.validateOfflineBalance(chainId, amount, tokenInfo);
    } catch (error: unknown) {
      logger.error('[BLETransport] Balance validation failed:', error);
      throw error;
    }
  }

  /**
   * Check for duplicate transactions
   */
  private async checkForDuplicateTransaction(txData: BLEPaymentRequest): Promise<void> {
    try {
      const { to, amount, chainId } = txData;
      await offlineSecurityService.checkForDuplicateTransaction(to, amount, chainId);
    } catch (error: unknown) {
      logger.error('[BLETransport] Duplicate check failed:', error);
      throw error;
    }
  }

  /**
   * Validate nonce for offline transaction
   */
  private async validateOfflineNonce(chainId: string): Promise<void> {
    try {
      await offlineSecurityService.validateOfflineNonce(chainId);
    } catch (error: unknown) {
      logger.error('[BLETransport] Nonce validation failed:', error);
      throw error;
    }
  }

  /**
   * Update offline balance tracking
   */
  private async updateOfflineBalanceTracking(txData: BLEPaymentRequest): Promise<void> {
    try {
      const { amount, chainId, token } = txData;
      
      const tokenInfo: TokenInfo = token ? {
        symbol: token.symbol,
        name: token.symbol, // Use symbol as name if not available
        decimals: token.decimals,
        address: token.address,
        chainId: chainId, // Use the main chainId
        isNative: token.isNative
      } : {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        address: '',
        chainId: chainId,
        isNative: true
      };

      await offlineSecurityService.updateOfflineBalanceTracking(chainId, amount, tokenInfo);
    } catch (error: unknown) {
      logger.error('[BLETransport] Failed to update offline balance tracking:', error);
      // Don't throw error as this is not critical
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
   * Step 2: Connect to device
   */
  private async connectToDevice(device: Device): Promise<void> {
    const isConnected = this.bluetoothManager.isDeviceConnected(device.id);
    if (!isConnected) {
      logger.info('[BLETransport] Connecting to device:', device.id);
      await this.bluetoothManager.connectToDevice(device);
      logger.info('[BLETransport] Successfully connected to device:', device.id);
    } else {
      logger.info('[BLETransport] Already connected to device:', device.id);
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
    const base64Data = compressedData.toString('base64');
    
    // Send compressed payment data via BLE
    await this.bluetoothManager.sendDataToDevice(
      device.id,
      AIRCHAINPAY_SERVICE_UUID,
      AIRCHAINPAY_CHARACTERISTIC_UUID,
      base64Data
    );
    
    logger.info('[BLETransport] Payment data sent successfully', {
      deviceId: device.id,
      amount,
      chainId,
      compressedSize: compressedData.length
    });
  }

  /**
   * Step 4: Wait for transaction hash and confirmation
   */
  private async waitForTransactionConfirmation(device: Device): Promise<{ transactionHash: string; paymentConfirmed: boolean }> {
    return new Promise((resolve, reject) => {
      let timeout: NodeJS.Timeout;
      let listener: { remove: () => void } | null = null;
      
      // Set up timeout
      timeout = setTimeout(() => {
        if (listener) listener.remove();
        reject(new Error('Timeout waiting for transaction confirmation'));
      }, 60000); // 60 second timeout
      
      // Set up listener for transaction confirmation
      this.bluetoothManager.listenForData(
        device.id,
        AIRCHAINPAY_SERVICE_UUID,
        AIRCHAINPAY_CHARACTERISTIC_UUID,
        async (data: string) => {
          try {
            const response = JSON.parse(data);
            
            if (response.type === 'transaction_confirmation') {
              clearTimeout(timeout);
              if (listener) listener.remove();
              
              logger.info('[BLETransport] Received transaction confirmation:', response);
              
              resolve({
                transactionHash: response.transactionHash,
                paymentConfirmed: response.confirmed === true
              });
            }
          } catch (error) {
            logger.warn('[BLETransport] Error parsing transaction confirmation:', error);
          }
        }
      ).then((listenerRef) => {
        listener = listenerRef;
      }).catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Step 5: Wait for advertiser to start advertising (receipt confirmation)
   */
  private async waitForAdvertiserConfirmation(device: Device): Promise<{ advertiserAdvertising: boolean }> {
    return new Promise((resolve, reject) => {
      let timeout: NodeJS.Timeout;
      let listener: { remove: () => void } | null = null;
      
      // Set up timeout
      timeout = setTimeout(() => {
        if (listener) listener.remove();
        // Don't reject, just resolve with false - advertiser might not advertise
        resolve({ advertiserAdvertising: false });
      }, 30000); // 30 second timeout
      
      // Set up listener for advertiser confirmation
      this.bluetoothManager.listenForData(
        device.id,
        AIRCHAINPAY_SERVICE_UUID,
        AIRCHAINPAY_CHARACTERISTIC_UUID,
        async (data: string) => {
          try {
            const response = JSON.parse(data);
            
            if (response.type === 'advertiser_confirmation') {
              clearTimeout(timeout);
              if (listener) listener.remove();
              
              logger.info('[BLETransport] Received advertiser confirmation:', response);
              
              resolve({
                advertiserAdvertising: response.advertising === true
              });
            }
          } catch (error) {
            logger.warn('[BLETransport] Error parsing advertiser confirmation:', error);
          }
        }
      ).then((listenerRef) => {
        listener = listenerRef;
      }).catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Start advertising as a payment receiver (for the advertiser side)
   */
  async startAdvertisingAsReceiver(): Promise<void> {
    try {
      if (!this.bluetoothManager.isAdvertisingSupported()) {
        throw new Error('BLE advertising not supported on this device');
      }
      
      // Create minimal payment data for advertising as receiver
      const paymentData = {
        walletAddress: '0x0000000000000000000000000000000000000000', // Placeholder
        amount: '0', // No amount for receiver
        token: 'ETH' as const,
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