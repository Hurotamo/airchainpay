import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  FlatList,
  TextInput
} from 'react-native';
import { logger } from '../utils/Logger';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../../hooks/useThemeContext';
// import { Colors } from '../../constants/Colors';
import { BLEPaymentService } from '../services/BLEPaymentService';
import { BLETransport } from '../services/transports/BLETransport';
import { BLEPaymentData, SupportedToken, SUPPORTED_TOKENS } from '../bluetooth/BluetoothManager';
import { SUPPORTED_CHAINS } from '../constants/AppConfig';
// import { Transaction } from '../types/transaction';
// import { getChainColor } from '../constants/Colors';
// import { useSelectedChain } from '../components/ChainSelector';
// import { PaymentService } from '../services/PaymentService';
import { Device } from 'react-native-ble-plx';

// const { width } = Dimensions.get('window');

export default function BLEPaymentScreen() {
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<{ device: Device; paymentData?: BLEPaymentData }[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<{ device: Device; paymentData?: BLEPaymentData } | null>(null);
  // const [connectionStatus, setConnectionStatus] = useState('Not connected');
  const [bleAvailable, setBleAvailable] = useState(false);
  const [activeTab, setActiveTab] = useState<'scan' | 'advertise'>('scan');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // const [showConfirmSend, setShowConfirmSend] = useState(false);

  // Advertising states
  const [isAdvertising, setIsAdvertising] = useState(false);
  const [advertisingStatus, setAdvertisingStatus] = useState('Not advertising');
  const [advertisingSupported, setAdvertisingSupported] = useState(false);

  // Payment form states
  const [paymentForm, setPaymentForm] = useState({
    walletAddress: '',
    amount: '',
    token: 'USDC' as SupportedToken,
    chainId: 'base_sepolia'
  });

  const [currentStep, setCurrentStep] = useState(0); // 0: Main, 1: Confirm, 2: Receipt
  const [lastReceipt, setLastReceipt] = useState<{
    hash: string;
    device: Device | null;
    amount: string;
    token: string;
    timestamp: number;
    chainId?: string;
  } | null>(null);
  const [statusText, setStatusText] = useState<string>('');

  const blePaymentService = BLEPaymentService.getInstance();
  const bleTransport = React.useMemo(() => new BLETransport(), []);
  const { colorScheme } = useThemeContext();
  const theme = colorScheme || 'light';
  // const { selectedChain } = useSelectedChain();
  // const paymentService = PaymentService.getInstance();

  // Initialize BLE
  useEffect(() => {
    const initializeBLE = async () => {
      try {
        const bleAvailable = blePaymentService.isBleAvailable();
        setBleAvailable(bleAvailable);

        if (!bleAvailable) {
          setErrorMessage('Bluetooth is not available on this device');
          return;
        }

        const advSupported = blePaymentService.isAdvertisingSupported();
        setAdvertisingSupported(advSupported);

        const permissionsGranted = await blePaymentService.requestPermissions();
        if (!permissionsGranted) {
          setErrorMessage('Bluetooth permissions are required. Please grant permissions and restart the app.');
          return;
        }

        // const status = await blePaymentService.getBleStatus();
        // setBluetoothEnabled(status.available);

        logger.info('[BLE Payment] BLE initialized successfully');

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setErrorMessage(`Failed to initialize BLE: ${errorMessage}`);
        logger.error('[BLE Payment] BLE initialization failed:', error);
      }
    };

    initializeBLE();
  }, [blePaymentService]);

  // Handle device discovery
  const handleDevicesFound = useCallback((discoveredDevices: { device: Device; paymentData?: BLEPaymentData }[]) => {
    setDevices(discoveredDevices);
  }, []);

  // Start scanning
  const handleStartScan = async () => {
    if (!bleAvailable) {
      setErrorMessage('Bluetooth is not available');
      return;
    }

    try {
      setScanning(true);
      setErrorMessage(null);
      
      blePaymentService.startScanning(handleDevicesFound);
      
      logger.info('[BLE Payment] Started scanning for devices');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setErrorMessage(`Failed to start scanning: ${errorMessage}`);
      setScanning(false);
      logger.error('[BLE Payment] Scan failed:', error);
    }
  };

  // Stop scanning
  const handleStopScan = () => {
    try {
      blePaymentService.stopScanning();
      setScanning(false);
      logger.info('[BLE Payment] Stopped scanning');
    } catch (error) {
      logger.error('[BLE Payment] Error stopping scan:', error);
    }
  };

  // Start advertising
  const handleStartAdvertising = async () => {
    if (!blePaymentService.isAdvertisingSupported()) {
      setErrorMessage('BLE advertising is not supported on this device');
      return;
    }

    if (!paymentForm.walletAddress || !paymentForm.amount) {
      setErrorMessage('Please enter wallet address and amount');
      return;
    }

    try {
      setAdvertisingStatus('Starting advertising...');
      setErrorMessage(null);
      
      const result = await blePaymentService.startAdvertising(
        paymentForm.walletAddress,
        paymentForm.amount,
        paymentForm.token,
        paymentForm.chainId
      );
      
      if (result.success) {
        setIsAdvertising(true);
        setAdvertisingStatus('Advertising payment availability');
        logger.info('[BLE Payment] Started advertising successfully');
      } else {
        setErrorMessage(result.message || 'Failed to start advertising');
        setAdvertisingStatus('Advertising failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setErrorMessage(errorMessage);
      setAdvertisingStatus('Advertising failed');
      logger.error('[BLE Payment] Advertising error:', error);
    }
  };

  // Stop advertising
  const handleStopAdvertising = async () => {
    try {
      await blePaymentService.stopAdvertising();
      setIsAdvertising(false);
      setAdvertisingStatus('Not advertising');
      setErrorMessage(null);
      logger.info('[BLE Payment] Stopped advertising');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setErrorMessage(errorMessage);
      logger.error('[BLE Payment] Stop advertising error:', error);
    }
  };

  // Connect to device
  const handleConnectDevice = async (deviceInfo: { device: Device; paymentData?: BLEPaymentData }) => {
    try {
      // setConnectionStatus('Connecting...');
      setSelectedDevice(deviceInfo);
      setStatusText('Connecting to device...');
      
      await blePaymentService.connectToDevice(deviceInfo.device);
      
      // setConnectionStatus('Connected');
      logger.info('[BLE Payment] Connected to device successfully');
      setStatusText('Connected');
      
      setCurrentStep(1);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // setConnectionStatus('Connection failed');
      setErrorMessage(`Failed to connect: ${errorMessage}`);
      logger.error('[BLE Payment] Connection error:', error);
    }
  };

  // Send payment
  const handleSendPayment = async () => {
    if (!selectedDevice) {
      setErrorMessage('No device selected');
      return;
    }

    try {
      // setShowConfirmSend(false);
      setStatusText('Sending payment...');

      const result = await bleTransport.send({
        to: selectedDevice.paymentData?.walletAddress || '',
        amount: selectedDevice.paymentData?.amount || '',
        chainId: selectedDevice.paymentData?.chainId || 'base_sepolia',
        transport: 'ble',
        device: selectedDevice.device,
      });

      setStatusText('Waiting for confirmation...');

      setLastReceipt({
        hash: result.transactionHash || '',
        device: selectedDevice.device,
        amount: selectedDevice.paymentData?.amount || '',
        token: selectedDevice.paymentData?.token || 'USDC',
        timestamp: Date.now(),
        chainId: selectedDevice.paymentData?.chainId || 'base_sepolia'
      });

      setCurrentStep(2);
      logger.info('[BLE Payment] Payment flow completed');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setErrorMessage(`Failed to send payment: ${errorMessage}`);
      setStatusText('Payment failed');
      logger.error('[BLE Payment] Payment error:', error);
    }
  };

  // Render device item
  const renderDeviceItem = ({ item }: { item: { device: Device; paymentData?: BLEPaymentData } }) => (
    <TouchableOpacity
      style={[styles.deviceItem, { backgroundColor: theme === 'dark' ? '#2a2a2a' : '#f5f5f5' }]}
      onPress={() => handleConnectDevice(item)}
    >
      <View style={styles.deviceInfo}>
        <Text style={[styles.deviceName, { color: theme === 'dark' ? '#fff' : '#000' }]}>
          {item.device.name || item.device.localName || 'Unknown Device'}
        </Text>
        <Text style={[styles.deviceId, { color: theme === 'dark' ? '#ccc' : '#666' }]}>
          {item.device.id}
        </Text>
        {item.paymentData && (
          <View style={styles.paymentInfo}>
            <Text style={[styles.paymentText, { color: theme === 'dark' ? '#48dbfb' : '#007AFF' }]}>
              {item.paymentData.amount} {item.paymentData.token}
            </Text>
            <Text style={[styles.walletText, { color: theme === 'dark' ? '#ccc' : '#666' }]}>
              {item.paymentData.walletAddress.substring(0, 8)}...{item.paymentData.walletAddress.substring(-6)}
            </Text>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme === 'dark' ? '#ccc' : '#666'} />
    </TouchableOpacity>
  );

  // Render scan section
  const renderScanSection = () => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme === 'dark' ? '#fff' : '#000' }]}>
        Scan for Payment Devices
      </Text>
      
      <View style={styles.scanControls}>
        <TouchableOpacity
          style={[styles.primaryButton, scanning ? styles.stopButton : null]}
          onPress={scanning ? handleStopScan : handleStartScan}
          disabled={!bleAvailable}
        >
          <Ionicons 
            name={scanning ? "stop-circle" : "search"} 
            size={20} 
            color="#fff" 
          />
          <Text style={styles.primaryButtonText}>
            {scanning ? 'Stop Scan' : 'Start Scan'}
          </Text>
        </TouchableOpacity>
        
        <Text style={[styles.statusText, { color: theme === 'dark' ? '#ccc' : '#666' }]}>
          {scanning ? 'Scanning for devices...' : 'Ready to scan'}
        </Text>
      </View>

      <View style={styles.deviceListContainer}>
        <FlatList
          data={devices}
          renderItem={renderDeviceItem}
          keyExtractor={(item) => item.device.id}
          style={styles.deviceList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: theme === 'dark' ? '#ccc' : '#666' }]}>
              {scanning ? 'Scanning for devices...' : 'No devices found'}
            </Text>
          }
        />
      </View>
    </View>
  );

  // Render advertise section (polished card UI)
  const renderAdvertiseSection = () => (
    <View style={styles.section}>
      <View style={[styles.card, { backgroundColor: theme === 'dark' ? '#0e0f10' : '#ffffff', borderColor: theme === 'dark' ? '#1f2123' : '#e7e7e7' }]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Ionicons name="radio" size={18} color={theme === 'dark' ? '#8ab4ff' : '#1a73e8'} />
            <Text style={[styles.sectionTitle, { color: theme === 'dark' ? '#fff' : '#111' }]}>Advertise payment availability</Text>
          </View>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, isAdvertising && styles.statusBadgeActive]}>
              <Text style={styles.statusBadgeText}>{isAdvertising ? 'Advertising' : 'Idle'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.formContainer}>
          {!advertisingSupported && (
            <Text style={[styles.helperText, { color: theme === 'dark' ? '#f59e0b' : '#b45309' }]}>Advertising is not supported on this platform. You can still scan and pay as a central device.</Text>
          )}
          <Text style={[styles.label, { color: theme === 'dark' ? '#cfd3d7' : '#4a4a4a' }]}>Wallet address</Text>
          <TextInput
            style={[styles.input, { 
              backgroundColor: theme === 'dark' ? '#181a1b' : '#f5f7fb',
              color: theme === 'dark' ? '#fff' : '#000',
              borderColor: theme === 'dark' ? '#2a2d2f' : '#e3e6ea',
              borderWidth: 1
            }]}
            placeholder="0x..."
            placeholderTextColor={theme === 'dark' ? '#8a8f98' : '#9aa0a6'}
            value={paymentForm.walletAddress}
            onChangeText={(text) => setPaymentForm(prev => ({ ...prev, walletAddress: text }))}
            autoCapitalize="none"
          />
          <Text style={[styles.helperText, { color: theme === 'dark' ? '#8a8f98' : '#6b7280' }]}>Address that will receive the payment.</Text>

          <Text style={[styles.label, { color: theme === 'dark' ? '#cfd3d7' : '#4a4a4a' }]}>Amount</Text>
          <TextInput
            style={[styles.input, { 
              backgroundColor: theme === 'dark' ? '#181a1b' : '#f5f7fb',
              color: theme === 'dark' ? '#fff' : '#000',
              borderColor: theme === 'dark' ? '#2a2d2f' : '#e3e6ea',
              borderWidth: 1
            }]}
            placeholder={`0.00 ${paymentForm.token}`}
            placeholderTextColor={theme === 'dark' ? '#8a8f98' : '#9aa0a6'}
            value={paymentForm.amount}
            onChangeText={(text) => setPaymentForm(prev => ({ ...prev, amount: text }))}
            keyboardType="numeric"
          />

          <Text style={[styles.label, { color: theme === 'dark' ? '#cfd3d7' : '#4a4a4a', marginTop: 10 }]}>Token</Text>
          <View style={styles.chipRow}>
            {Object.keys(SUPPORTED_TOKENS).map((token) => (
              <TouchableOpacity
                key={token}
                style={[styles.chip, paymentForm.token === token && styles.chipActive]}
                onPress={() => setPaymentForm(prev => ({ ...prev, token: token as SupportedToken }))}
              >
                <Text style={[styles.chipText, paymentForm.token === token && styles.chipTextActive]}>{token}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.advertisingControls}>
          <TouchableOpacity
            style={[styles.primaryButton, isAdvertising ? styles.stopButton : null]}
            onPress={isAdvertising ? handleStopAdvertising : handleStartAdvertising}
            disabled={!advertisingSupported}
          >
            <Ionicons 
              name={isAdvertising ? 'stop-circle' : 'radio'}
              size={20}
              color="#fff"
            />
            <Text style={styles.primaryButtonText}>
              {isAdvertising ? 'Stop advertising' : 'Start advertising'}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.statusText, { color: theme === 'dark' ? '#aeb4bb' : '#6b7280' }]}>
            {advertisingStatus}
          </Text>
        </View>
      </View>
    </View>
  );

  // Render payment confirmation
  const renderPaymentConfirmation = () => {
    if (!selectedDevice) return null;

    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme === 'dark' ? '#fff' : '#000' }]}>
          Confirm Payment
        </Text>
        
        <View style={styles.paymentDetails}>
          <Text style={[styles.paymentLabel, { color: theme === 'dark' ? '#ccc' : '#666' }]}>
            Device:
          </Text>
          <Text style={[styles.paymentValue, { color: theme === 'dark' ? '#fff' : '#000' }]}>
            {selectedDevice.device.name || selectedDevice.device.localName || 'Unknown Device'}
          </Text>
          
          <Text style={[styles.paymentLabel, { color: theme === 'dark' ? '#ccc' : '#666' }]}>
            Amount:
          </Text>
          <Text style={[styles.paymentValue, { color: theme === 'dark' ? '#fff' : '#000' }]}>
            {selectedDevice.paymentData?.amount} {selectedDevice.paymentData?.token}
          </Text>
          
          <Text style={[styles.paymentLabel, { color: theme === 'dark' ? '#ccc' : '#666' }]}>
            Wallet:
          </Text>
          <Text style={[styles.paymentValue, { color: theme === 'dark' ? '#fff' : '#000' }]}>
            {selectedDevice.paymentData?.walletAddress.substring(0, 8)}...{selectedDevice.paymentData?.walletAddress.substring(-6)}
          </Text>
        </View>
        
        <TouchableOpacity
          style={styles.confirmButton}
          onPress={handleSendPayment}
        >
          <Text style={styles.confirmButtonText}>Send Payment</Text>
        </TouchableOpacity>
        {!!statusText && (
          <Text style={[styles.statusText, { color: theme === 'dark' ? '#ccc' : '#666', marginTop: 10 }]}>
            {statusText}
          </Text>
        )}
      </View>
    );
  };

  // Render receipt
  const renderReceipt = () => {
    if (!lastReceipt) return null;

    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme === 'dark' ? '#fff' : '#000' }]}>
          Payment Complete
        </Text>
        
        <View style={styles.receiptContainer}>
          <Ionicons name="checkmark-circle" size={60} color="#4CAF50" />
          <Text style={[styles.receiptTitle, { color: theme === 'dark' ? '#fff' : '#000' }]}>
            Payment Sent Successfully
          </Text>
          
          <View style={styles.receiptDetails}>
            <Text style={[styles.receiptLabel, { color: theme === 'dark' ? '#ccc' : '#666' }]}>
              Transaction Hash:
            </Text>
            <Text style={[styles.receiptValue, { color: theme === 'dark' ? '#fff' : '#000' }]} selectable>
              {lastReceipt.hash}
            </Text>
            {lastReceipt.chainId && SUPPORTED_CHAINS[lastReceipt.chainId] ? (
              <TouchableOpacity
                onPress={() => {
                  const base = SUPPORTED_CHAINS[lastReceipt.chainId!].blockExplorer;
                  const url = `${base}/tx/${lastReceipt.hash}`;
                  logger.info('[BLE Payment] Open explorer', { url });
                }}
                style={{ marginBottom: 10 }}
              >
                <Text style={{ color: '#1a73e8' }}>View on Explorer</Text>
              </TouchableOpacity>
            ) : null}
            
            <Text style={[styles.receiptLabel, { color: theme === 'dark' ? '#ccc' : '#666' }]}>
              Amount:
            </Text>
            <Text style={[styles.receiptValue, { color: theme === 'dark' ? '#fff' : '#000' }]}>
              {lastReceipt.amount} {lastReceipt.token}
            </Text>
            
            <Text style={[styles.receiptLabel, { color: theme === 'dark' ? '#ccc' : '#666' }]}>
              Device:
            </Text>
            <Text style={[styles.receiptValue, { color: theme === 'dark' ? '#fff' : '#000' }]}>
              {lastReceipt.device?.name || 'Unknown Device'}
            </Text>
          </View>
        </View>
        
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => setCurrentStep(0)}
        >
          <Text style={styles.primaryButtonText}>New Payment</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Render main content
  const renderMainContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <View style={styles.tabContainer}>
            <View style={styles.tabHeader}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'scan' && styles.activeTab]}
                onPress={() => setActiveTab('scan')}
              >
                <Text style={[styles.tabText, activeTab === 'scan' && styles.activeTabText]}>
                  Scan
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'advertise' && styles.activeTab]}
                onPress={() => setActiveTab('advertise')}
              >
                <Text style={[styles.tabText, activeTab === 'advertise' && styles.activeTabText]}>
                  Advertise
                </Text>
              </TouchableOpacity>
            </View>
            
            {activeTab === 'scan' ? renderScanSection() : renderAdvertiseSection()}
          </View>
        );
      case 1:
        return renderPaymentConfirmation();
      case 2:
        return renderReceipt();
      default:
        return renderScanSection();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme === 'dark' ? '#000' : '#fff' }]}>
      {errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{errorMessage}</Text>
          <TouchableOpacity onPress={() => setErrorMessage(null)}>
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
      
      {renderMainContent()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorBanner: {
    backgroundColor: '#ff6b6b',
    padding: 10,
    margin: 10,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorBannerText: {
    color: '#fff',
    flex: 1,
    marginRight: 10,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  tabContainer: {
    flex: 1,
  },
  tabHeader: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    padding: 15,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  scanControls: {
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  stopButton: {
    backgroundColor: '#ff6b6b',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  statusText: {
    textAlign: 'center',
    fontSize: 14,
  },
  deviceList: {
    maxHeight: 400,
  },
  deviceListContainer: {
    flex: 1,
  },
  deviceItem: {
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  deviceId: {
    fontSize: 12,
    marginBottom: 5,
  },
  paymentInfo: {
    marginTop: 5,
  },
  paymentText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  walletText: {
    fontSize: 12,
  },
  emptyText: {
    textAlign: 'center',
    padding: 20,
    fontSize: 16,
  },
  formContainer: {
    marginBottom: 20,
  },
  input: {
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    fontSize: 16,
  },
  tokenSelector: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  tokenButton: {
    flex: 1,
    padding: 10,
    marginHorizontal: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  tokenButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  tokenButtonText: {
    fontSize: 14,
    color: '#666',
  },
  tokenButtonTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  advertisingControls: {
    marginTop: 20,
  },
  paymentDetails: {
    marginBottom: 20,
  },
  paymentLabel: {
    fontSize: 14,
    marginBottom: 5,
  },
  paymentValue: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  confirmButton: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  receiptContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  receiptTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 20,
  },
  receiptDetails: {
    width: '100%',
  },
  receiptLabel: {
    fontSize: 14,
    marginBottom: 5,
  },
  receiptValue: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  // Polished advertise card styles
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    backgroundColor: '#edf2f7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeActive: {
    backgroundColor: '#16a34a',
  },
  statusBadgeText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '600',
  },
  label: {
    fontSize: 13,
    marginBottom: 6,
  },
  helperText: {
    fontSize: 12,
    marginTop: 6,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: 'transparent',
  },
  chipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  chipText: {
    color: '#374151',
    fontSize: 14,
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
}); 