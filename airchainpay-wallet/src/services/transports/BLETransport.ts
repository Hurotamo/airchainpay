// BLETransport for sending payments via Bluetooth Low Energy with compression
import { logger } from '../../utils/Logger';
import { BluetoothManager, AIRCHAINPAY_SERVICE_UUID, AIRCHAINPAY_CHARACTERISTIC_UUID } from '../../bluetooth/BluetoothManager';
import { TransactionBuilder } from '../../utils/TransactionBuilder';

export interface IPaymentTransport {
  send(txData: any): Promise<any>;
}

export class BLETransport implements IPaymentTransport {
  private bluetoothManager: BluetoothManager;

  constructor() {
    this.bluetoothManager = new BluetoothManager();
  }

  async send(txData: any): Promise<any> {
    try {
      logger.info('[BLETransport] Sending payment via BLE', txData);
      
      // Extract payment data
      const { to, amount, chainId, paymentReference, device, token, metadata } = txData;
      
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
      
      // Connect to the device if not already connected
      const isConnected = this.bluetoothManager.isDeviceConnected(device.id);
      if (!isConnected) {
        logger.info('[BLETransport] Connecting to device:', device.id);
        await this.bluetoothManager.connectToDevice(device);
      }
      
      // Prepare payment data for BLE transmission with compression
      const paymentData = {
        type: 'payment',
        to: to,
        amount: amount,
        chainId: chainId,
        paymentReference: paymentReference,
        timestamp: Date.now(),
        token: token,
        metadata: metadata
      };
      
      // Compress payment data using protobuf + CBOR
      const compressedData = await TransactionBuilder.serializeBLEPayment(paymentData);
      
      // Convert compressed data to base64 for BLE transmission
      const base64Data = compressedData.toString('base64');
      
      // Send compressed payment data via BLE
      await this.bluetoothManager.sendDataToDevice(
        device.id,
        AIRCHAINPAY_SERVICE_UUID,
        AIRCHAINPAY_CHARACTERISTIC_UUID,
        base64Data
      );
      
      logger.info('[BLETransport] Compressed payment sent successfully via BLE', {
        deviceId: device.id,
        amount,
        chainId,
        compressedSize: compressedData.length
      });
      
      return {
        status: 'sent',
        transport: 'ble',
        deviceId: device.id,
        deviceName: device.name || device.localName,
        amount,
        chainId,
        timestamp: Date.now(),
        compressionUsed: true,
        compressedSize: compressedData.length,
        ...txData
      };
      
    } catch (error) {
      logger.error('[BLETransport] Failed to send BLE payment:', error);
      throw new Error(`BLE payment failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} 