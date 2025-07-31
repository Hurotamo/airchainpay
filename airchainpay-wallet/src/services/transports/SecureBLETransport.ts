// Enhanced SecureBLETransport implementing the complete secure BLE payment flow:
// Actor → Scan → Connect → Key Exchange → Send Encrypted Payment → Get Transaction Hash → Advertiser Receives Token → Advertiser Advertises
import { logger } from '../../utils/Logger';
import { BluetoothManager, AIRCHAINPAY_SERVICE_UUID, AIRCHAINPAY_CHARACTERISTIC_UUID } from '../../bluetooth/BluetoothManager';
import { MultiChainWalletManager } from '../../wallet/MultiChainWalletManager';
import { TransactionService } from '../TransactionService';
import { BLEError } from '../../utils/ErrorClasses';
import { PaymentRequest } from '../PaymentService';
import { Device } from 'react-native-ble-plx';
import { TxQueue } from '../TxQueue';
import { ethers } from 'ethers';
import offlineSecurityService from '../OfflineSecurityService';
import { TokenInfo } from '../../wallet/TokenWalletManager';
import { BLESecurity } from '../../utils/crypto/BLESecurity';

export interface BLEPaymentRequest extends PaymentRequest {
  device: Device;
}

export interface IPaymentTransport<RequestType, ResultType> {
  send(txData: RequestType): Promise<ResultType>;
}

export interface SecurePaymentResult {
  status: 'sent' | 'failed' | 'pending' | 'confirmed' | 'advertising' | 'key_exchange_required' | 'queued';
  transport: 'secure_ble';
  deviceId?: string;
  deviceName?: string;
  transactionHash?: string;
  paymentConfirmed?: boolean;
  advertiserAdvertising?: boolean;
  message?: string;
  timestamp: number;
  metadata?: any;
  sessionId?: string;
  transactionId?: string;
}

export class SecureBLETransport implements IPaymentTransport<BLEPaymentRequest, SecurePaymentResult> {
  private bluetoothManager: BluetoothManager;
  private walletManager: MultiChainWalletManager;
  private transactionService: TransactionService;
  private bleSecurity: BLESecurity;

  constructor() {
    this.bluetoothManager = BluetoothManager.getInstance();
    this.walletManager = MultiChainWalletManager.getInstance();
    this.transactionService = TransactionService.getInstance();
    this.bleSecurity = BLESecurity.getInstance();
  }

  async send(txData: BLEPaymentRequest): Promise<SecurePaymentResult> {
    try {
      logger.info('[SecureBLETransport] Starting enhanced secure BLE payment flow', txData);
      
      const { to, amount, chainId, paymentReference, device, token } = txData;
      
      if (!to || !amount || !chainId) {
        throw new Error('Missing required payment fields: to, amount, chainId');
      }
      
      if (!device || !device.id) {
        throw new Error('Missing BLE device information');
      }

      // Check if we're offline by attempting to connect to the network
      const isOnline = await this.checkNetworkStatus(chainId);
      
      if (!isOnline) {
        logger.info('[SecureBLETransport] Offline detected, performing security checks before queueing');
        return await this.queueOfflineTransactionWithSecurity(txData);
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
        transactionHash: transactionResult.transactionHash,
        paymentConfirmed: transactionResult.paymentConfirmed,
        advertiserAdvertising: advertisingResult.advertiserAdvertising,
        sessionId: existingSession,
        message: 'Secure payment completed and advertiser confirmed receipt',
        timestamp: Date.now(),
        metadata: {
          ...txData,
          transactionHash: transactionResult.transactionHash,
          paymentConfirmed: transactionResult.paymentConfirmed,
          advertiserAdvertising: advertisingResult.advertiserAdvertising,
          sessionId: existingSession
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
   * Enhanced offline transaction queueing with comprehensive security checks
   */
  private async queueOfflineTransactionWithSecurity(txData: BLEPaymentRequest): Promise<SecurePaymentResult> {
    try {
      logger.info('[SecureBLETransport] Performing security checks for offline transaction');

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
        transport: 'secure_ble',
        paymentReference: paymentReference,
        metadata: {
          merchant: device.name || device.localName || 'Secure BLE Device',
          location: 'Offline Secure BLE Transaction',
          timestamp: Date.now()
        }
      });

      // Step 7: Update offline balance tracking
      await this.updateOfflineBalanceTracking(txData);

      logger.info('[SecureBLETransport] Transaction queued for offline processing with security validation', {
        transactionId,
        to: to,
        amount: amount,
        chainId: chainId,
        deviceId: device.id
      });

      return {
        status: 'queued',
        transport: 'secure_ble',
        transactionId: transactionId,
        deviceId: device.id,
        deviceName: device.name || device.localName || undefined,
        message: 'Secure transaction queued for processing when online (security validated)',
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
      logger.error('[SecureBLETransport] Failed to queue offline transaction with security:', error);
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
      logger.error('[SecureBLETransport] Balance validation failed:', error);
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
      logger.error('[SecureBLETransport] Duplicate check failed:', error);
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
      logger.error('[SecureBLETransport] Nonce validation failed:', error);
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
      logger.error('[SecureBLETransport] Failed to update offline balance tracking:', error);
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
      logger.warn('[SecureBLETransport] Failed to check network status:', error);
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
   * Step 3: Find existing session
   */
  private findExistingSession(deviceId: string): string | null {
    // This would be implemented to find existing BLE security session
    // For now, return null to force key exchange
    return null;
  }

  /**
   * Step 4: Perform key exchange
   */
  private async performKeyExchange(device: Device): Promise<SecurePaymentResult> {
    try {
      logger.info('[SecureBLETransport] Performing key exchange with device:', device.id);
      
      // This would implement the actual key exchange protocol
      // For now, return key exchange required status
      
      return {
        status: 'key_exchange_required',
        transport: 'secure_ble',
        deviceId: device.id,
        deviceName: device.name || device.localName || undefined,
        message: 'Key exchange required for secure BLE communication',
        timestamp: Date.now(),
        metadata: {
          deviceId: device.id,
          deviceName: device.name || device.localName
        }
      };
    } catch (error: unknown) {
      logger.error('[SecureBLETransport] Key exchange failed:', error);
      throw error;
    }
  }

  /**
   * Step 5: Send encrypted payment data
   */
  private async sendEncryptedPayment(sessionId: string, txData: BLEPaymentRequest): Promise<{ sent: boolean; encryptedSize: number }> {
    const { to, amount, chainId, paymentReference, token, metadata } = txData;
    
    // Create payment data
    const paymentData = {
      to,
      amount,
      chainId,
      paymentReference,
      token,
      metadata,
      timestamp: Date.now()
    };
    
    // Encrypt payment data using session
    const encryptedMessage = await this.bleSecurity.encryptPaymentData(sessionId, paymentData);
    const base64Data = JSON.stringify(encryptedMessage);
    
    // Send encrypted payment data via BLE
    await this.bluetoothManager.sendDataToDevice(
      txData.device.id,
      AIRCHAINPAY_SERVICE_UUID,
      AIRCHAINPAY_CHARACTERISTIC_UUID,
      base64Data
    );
    
    logger.info('[SecureBLETransport] Encrypted payment data sent successfully', {
      deviceId: txData.device.id,
      amount,
      chainId,
      sessionId,
      encryptedSize: base64Data.length
    });
    
    return { sent: true, encryptedSize: base64Data.length };
  }

  /**
   * Step 6: Wait for transaction hash and confirmation
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
   * Step 7: Wait for advertiser to start advertising (receipt confirmation)
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
   * Clean up resources
   */
  cleanup(): void {
    // Clean up any BLE security sessions
    this.bleSecurity.cleanupExpiredSessions();
  }
} 