// Enhanced Secure BLETransport implementing the complete BLE payment flow with encryption:
// Actor → Scan → Connect → Send Payment → Get Transaction Hash → Advertiser Receives Token → Advertiser Advertises
import { logger } from '../../utils/Logger';
import { BluetoothManager, AIRCHAINPAY_SERVICE_UUID, AIRCHAINPAY_CHARACTERISTIC_UUID } from '../../bluetooth/BluetoothManager';
import { BLESecurity } from '../../utils/crypto/BLESecurity';
import { MultiChainWalletManager } from '../../wallet/MultiChainWalletManager';
import { TransactionService } from '../TransactionService';
import { IPaymentTransport, BLEPaymentRequest } from './BLETransport';
import { BLEError } from '../../utils/ErrorClasses';
import { Device } from 'react-native-ble-plx';

export interface SecurePaymentRequest {
  to: string;
  amount: string;
  chainId: string;
  paymentReference?: string;
  device: any;
  token?: any;
  metadata?: any;
}

export interface SecurePaymentResult {
  status: 'sent' | 'failed' | 'pending' | 'confirmed' | 'advertising';
  transport: 'secure_ble';
  sessionId?: string;
  deviceId?: string;
  deviceName?: string;
  transactionHash?: string;
  paymentConfirmed?: boolean;
  advertiserAdvertising?: boolean;
  message?: string;
  timestamp: number;
  metadata?: any;
}

export class SecureBLETransport implements IPaymentTransport<BLEPaymentRequest, SecurePaymentResult> {
  private bluetoothManager: BluetoothManager;
  private bleSecurity: BLESecurity;
  private walletManager: MultiChainWalletManager;
  private transactionService: TransactionService;
  private keyExchangeInProgress: Map<string, boolean> = new Map();

  constructor() {
    this.bluetoothManager = BluetoothManager.getInstance();
    this.bleSecurity = BLESecurity.getInstance();
    this.walletManager = MultiChainWalletManager.getInstance();
    this.transactionService = TransactionService.getInstance();
  }

  async send(txData: BLEPaymentRequest): Promise<SecurePaymentResult> {
    try {
      logger.info('[SecureBLETransport] Starting enhanced secure BLE payment flow', txData);
      
      const { to, amount, chainId, paymentReference, device } = txData;
      
      if (!to || !amount || !chainId) {
        throw new Error('Missing required payment fields: to, amount, chainId');
      }
      
      if (!device || !device.id) {
        throw new Error('Missing BLE device information');
      }

      // Step 1: Check BLE availability and Bluetooth state
      await this.checkBLEAvailability();

      // Step 2: Connect to device (if not already connected)
      await this.connectToDevice(device);

      // Step 3: Check if we have a valid session
      const existingSession = this.findExistingSession(device.id);
      if (!existingSession || !this.bleSecurity.isSessionValid(existingSession)) {
        // Need to perform key exchange
        logger.info('[SecureBLETransport] No valid session, initiating key exchange');
        return await this.performKeyExchange(device);
      }

      // Step 4: Send encrypted payment data
      const paymentResult = await this.sendEncryptedPayment(existingSession, txData);
      
      // Step 5: Listen for transaction hash and confirmation
      const transactionResult = await this.waitForTransactionConfirmation(device);
      
      // Step 6: Wait for advertiser to start advertising (receipt confirmation)
      const advertisingResult = await this.waitForAdvertiserConfirmation(device);
      
      logger.info('[SecureBLETransport] Complete secure BLE payment flow finished', {
        deviceId: device.id,
        transactionHash: transactionResult.transactionHash,
        paymentConfirmed: transactionResult.paymentConfirmed,
        advertiserAdvertising: advertisingResult.advertiserAdvertising
      });
      
      return {
        status: 'confirmed',
        transport: 'secure_ble',
        deviceId: device.id,
        deviceName: device.name || device.localName || undefined,
        sessionId: existingSession,
        transactionHash: transactionResult.transactionHash,
        paymentConfirmed: transactionResult.paymentConfirmed,
        advertiserAdvertising: advertisingResult.advertiserAdvertising,
        message: 'Secure payment completed and advertiser confirmed receipt',
        timestamp: Date.now(),
        metadata: {
          ...txData,
          transactionHash: transactionResult.transactionHash,
          paymentConfirmed: transactionResult.paymentConfirmed,
          advertiserAdvertising: advertisingResult.advertiserAdvertising
        }
      };

    } catch (error) {
      logger.error('[SecureBLETransport] Enhanced secure BLE payment failed:', error);
      return {
        status: 'failed',
        transport: 'secure_ble',
        deviceId: txData.device?.id,
        deviceName: txData.device?.name || txData.device?.localName || undefined,
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
        metadata: txData
      };
    }
  }

  /**
   * Find existing session for device
   */
  private findExistingSession(deviceId: string): string | null {
    // This is a simplified implementation - in a real app you'd store device-session mappings
    for (const [sessionId, session] of this.bleSecurity['sessions'].entries()) {
      if (session.deviceId === deviceId) {
        return sessionId;
      }
    }
    return null;
  }

  /**
   * Perform key exchange with device
   */
  private async performKeyExchange(device: Device): Promise<SecurePaymentResult> {
    try {
      const deviceId = device.id;
      
      if (this.keyExchangeInProgress.get(deviceId)) {
        return {
          status: 'pending',
          transport: 'secure_ble',
          message: 'Key exchange already in progress',
          timestamp: Date.now()
        };
      }

      this.keyExchangeInProgress.set(deviceId, true);

      // Initiate key exchange
      const keyExchangeMessage = await this.bleSecurity.initiateKeyExchange(deviceId);
      
      // Send key exchange message via BLE
      const messageData = JSON.stringify(keyExchangeMessage);
      await this.bluetoothManager.sendDataToDevice(
        deviceId,
        AIRCHAINPAY_SERVICE_UUID,
        AIRCHAINPAY_CHARACTERISTIC_UUID,
        messageData
      );

      // Set up listener for key exchange response
      const responseListener = await this.bluetoothManager.listenForData(
        deviceId,
        AIRCHAINPAY_SERVICE_UUID,
        AIRCHAINPAY_CHARACTERISTIC_UUID,
        async (data: string) => {
          try {
            const response = JSON.parse(data);
            if (response.type === 'key_exchange_response') {
              await this.handleKeyExchangeResponse(response, deviceId);
            }
          } catch (error) {
            logger.error('[SecureBLETransport] Error processing key exchange response:', error);
          }
        }
      );

      // Wait for key exchange to complete (with timeout)
      const sessionId = keyExchangeMessage.sessionId;
      const timeout = setTimeout(() => {
        this.keyExchangeInProgress.delete(deviceId);
        responseListener.remove();
      }, 30000); // 30 second timeout

      return {
        status: 'pending',
        transport: 'secure_ble',
        sessionId,
        deviceId,
        message: 'Key exchange initiated',
        timestamp: Date.now()
      };

    } catch (error) {
      this.keyExchangeInProgress.delete(device.id);
      logger.error('[SecureBLETransport] Key exchange failed:', error);
      throw error;
    }
  }

  /**
   * Handle key exchange response
   */
  private async handleKeyExchangeResponse(response: any, deviceId: string): Promise<void> {
    try {
      // Process the key exchange response
      const confirmMessage = await this.bleSecurity.processKeyExchangeResponse(response);
      
      // Send confirmation
      const confirmData = JSON.stringify(confirmMessage);
      await this.bluetoothManager.sendDataToDevice(
        deviceId,
        AIRCHAINPAY_SERVICE_UUID,
        AIRCHAINPAY_CHARACTERISTIC_UUID,
        confirmData
      );

      this.keyExchangeInProgress.delete(deviceId);
      logger.info('[SecureBLETransport] Key exchange completed successfully');

    } catch (error) {
      this.keyExchangeInProgress.delete(deviceId);
      logger.error('[SecureBLETransport] Failed to handle key exchange response:', error);
      throw error;
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
    
    logger.info('[SecureBLETransport] BLE availability check passed');
  }

  /**
   * Step 2: Connect to device
   */
  private async connectToDevice(device: Device): Promise<void> {
    const isConnected = this.bluetoothManager.isDeviceConnected(device.id);
    if (!isConnected) {
      logger.info('[SecureBLETransport] Connecting to device:', device.id);
      await this.bluetoothManager.connectToDevice(device);
      logger.info('[SecureBLETransport] Successfully connected to device:', device.id);
    } else {
      logger.info('[SecureBLETransport] Already connected to device:', device.id);
    }
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
              
              logger.info('[SecureBLETransport] Received transaction confirmation:', response);
              
              resolve({
                transactionHash: response.transactionHash,
                paymentConfirmed: response.confirmed === true
              });
            }
          } catch (error) {
            logger.warn('[SecureBLETransport] Error parsing transaction confirmation:', error);
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
              
              logger.info('[SecureBLETransport] Received advertiser confirmation:', response);
              
              resolve({
                advertiserAdvertising: response.advertising === true
              });
            }
          } catch (error) {
            logger.warn('[SecureBLETransport] Error parsing advertiser confirmation:', error);
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
   * Send encrypted payment data
   */
  private async sendEncryptedPayment(sessionId: string, txData: BLEPaymentRequest): Promise<SecurePaymentResult> {
    try {
      // Prepare payment data
      const paymentData = {
        to: txData.to,
        amount: txData.amount,
        chainId: txData.chainId,
        paymentReference: txData.paymentReference,
        token: txData.token,
        metadata: txData.metadata,
        timestamp: Date.now()
      };

      // Encrypt payment data
      const encryptedMessage = await this.bleSecurity.encryptPaymentData(sessionId, paymentData);
      
      // Send encrypted data via BLE
      const messageData = JSON.stringify(encryptedMessage);
      await this.bluetoothManager.sendDataToDevice(
        txData.device.id,
        AIRCHAINPAY_SERVICE_UUID,
        AIRCHAINPAY_CHARACTERISTIC_UUID,
        messageData
      );

      logger.info('[SecureBLETransport] Encrypted payment sent successfully', {
        sessionId,
        deviceId: txData.device.id,
        amount: txData.amount,
        chainId: txData.chainId
      });

      return {
        status: 'sent',
        transport: 'secure_ble',
        sessionId,
        deviceId: txData.device.id,
        deviceName: txData.device.name || txData.device.localName || undefined,
        timestamp: Date.now()
      };

    } catch (error) {
      logger.error('[SecureBLETransport] Failed to send encrypted payment:', error);
      throw error;
    }
  }

  /**
   * Receive and decrypt payment data
   */
  async receiveEncryptedPayment(encryptedMessage: any): Promise<any> {
    try {
      const decryptedData = await this.bleSecurity.decryptPaymentData(encryptedMessage);
      
      logger.info('[SecureBLETransport] Received and decrypted payment data', {
        sessionId: encryptedMessage.sessionId,
        amount: decryptedData.amount,
        chainId: decryptedData.chainId
      });

      return decryptedData;
    } catch (error) {
      logger.error('[SecureBLETransport] Failed to decrypt payment data:', error);
      throw error;
    }
  }

  /**
   * Handle incoming key exchange messages
   */
  async handleIncomingKeyExchange(message: any, deviceId: string): Promise<any> {
    try {
      if (message.type === 'key_exchange_init') {
        // We received a key exchange initiation
        const sessionId = await this.bleSecurity.createSession(deviceId);
        
        // Generate our response
        const response = await this.bleSecurity.processKeyExchangeResponse(message);
        
        // Send response back
        const responseData = JSON.stringify(response);
        await this.bluetoothManager.sendDataToDevice(
          deviceId,
          AIRCHAINPAY_SERVICE_UUID,
          AIRCHAINPAY_CHARACTERISTIC_UUID,
          responseData
        );

        return response;
      } else if (message.type === 'key_exchange_confirm') {
        // We received a key exchange confirmation
        await this.bleSecurity.processKeyExchangeConfirm(message);
        return { status: 'confirmed' };
      }

      throw new Error('Unknown key exchange message type');
    } catch (error) {
      logger.error('[SecureBLETransport] Failed to handle incoming key exchange:', error);
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.bleSecurity.cleanupExpiredSessions();
    this.keyExchangeInProgress.clear();
  }
} 