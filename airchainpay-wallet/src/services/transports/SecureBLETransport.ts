// SecureBLETransport for encrypted BLE payments
import { logger } from '../../utils/Logger';
import { BluetoothManager, AIRCHAINPAY_SERVICE_UUID, AIRCHAINPAY_CHARACTERISTIC_UUID } from '../../bluetooth/BluetoothManager';
import { BLESecurity } from '../../utils/crypto/BLESecurity';
import { IPaymentTransport } from './BLETransport';

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
  status: 'sent' | 'failed' | 'key_exchange_required';
  transport: 'secure_ble';
  sessionId?: string;
  deviceId?: string;
  deviceName?: string;
  message?: string;
  timestamp: number;
}

export class SecureBLETransport implements IPaymentTransport {
  private bluetoothManager: BluetoothManager;
  private bleSecurity: BLESecurity;
  private keyExchangeInProgress: Map<string, boolean> = new Map();

  constructor() {
    this.bluetoothManager = new BluetoothManager();
    this.bleSecurity = BLESecurity.getInstance();
  }

  async send(txData: any): Promise<any> {
    try {
      logger.info('[SecureBLETransport] Processing secure BLE payment', txData);
      
      const { to, amount, chainId, paymentReference, device } = txData;
      
      if (!to || !amount || !chainId) {
        throw new Error('Missing required payment fields: to, amount, chainId');
      }
      
      if (!device || !device.id) {
        throw new Error('Missing BLE device information');
      }

      // Check if BLE is available
      if (!this.bluetoothManager.isBleAvailable()) {
        throw new Error('BLE not available on this device');
      }

      // Check if Bluetooth is enabled
      const isBluetoothEnabled = await this.bluetoothManager.isBluetoothEnabled();
      if (!isBluetoothEnabled) {
        throw new Error('Bluetooth is not enabled');
      }

      // Connect to device if not already connected
      const isConnected = this.bluetoothManager.isDeviceConnected(device.id);
      if (!isConnected) {
        logger.info('[SecureBLETransport] Connecting to device:', device.id);
        await this.bluetoothManager.connectToDevice(device);
      }

      // Check if we have a valid session
      const existingSession = this.findExistingSession(device.id);
      if (!existingSession || !this.bleSecurity.isSessionValid(existingSession)) {
        // Need to perform key exchange
        logger.info('[SecureBLETransport] No valid session, initiating key exchange');
        return await this.performKeyExchange(device);
      }

      // Send encrypted payment
      return await this.sendEncryptedPayment(existingSession, txData);

    } catch (error) {
      logger.error('[SecureBLETransport] Failed to send secure BLE payment:', error);
      throw new Error(`Secure BLE payment failed: ${error instanceof Error ? error.message : String(error)}`);
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
  private async performKeyExchange(device: any): Promise<SecurePaymentResult> {
    try {
      const deviceId = device.id;
      
      if (this.keyExchangeInProgress.get(deviceId)) {
        return {
          status: 'key_exchange_required',
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
        status: 'key_exchange_required',
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
   * Send encrypted payment data
   */
  private async sendEncryptedPayment(sessionId: string, txData: any): Promise<SecurePaymentResult> {
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
        deviceName: txData.device.name || txData.device.localName,
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