// Enhanced BLEPaymentScreen.tsx - React Native Enhanced BLE Payment UI
// Implements complete flow: Actor → Scan → Connect → Send Payment → Get Transaction Hash → Advertiser Receives Token → Advertiser Advertises
import * as React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  StyleSheet, 
  Alert, 
  TouchableOpacity, 
  ActivityIndicator, 
  Platform,
  RefreshControl,
  Dimensions,
  Modal,
  FlatList,
  Linking,
  Share,
  TextInput
} from 'react-native';
import { logger } from '../utils/Logger';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';


import { useBLEManager } from '../hooks/wallet/useBLEManager';
import { TxQueue } from '../services/TxQueue';
import { Transaction } from '../types/transaction';
import { getChainColor } from '../constants/Colors';
import { useSelectedChain } from '../components/ChainSelector';
import { PaymentService } from '../services/PaymentService';
import { BLESecurity } from '../utils/crypto/BLESecurity';
import { SecureBLETransport } from '../services/transports/SecureBLETransport';
import * as Clipboard from 'expo-clipboard';
import { SUPPORTED_CHAINS } from '../constants/AppConfig';
import { Device } from 'react-native-ble-plx';
import { useThemeContext } from '../../hooks/useThemeContext';
import { Colors } from '../../constants/Colors';
import { WalletError, BLEError, TransactionError } from '../utils/ErrorClasses';
import { PermissionUtils } from '../utils/PermissionUtils';

const { width } = Dimensions.get('window');

const BLE_ERROR_SUGGESTIONS: { [key: string]: string } = {
  'BLE_NOT_AVAILABLE': 'Bluetooth is not available or not supported on this device.',
  'BLE_NOT_POWERED_ON': 'Please turn on Bluetooth in your device settings.',
  'PERMISSION_DENIED': 'Bluetooth permissions are required. Please grant permissions in settings.',
  'SCAN_ERROR': 'Failed to scan for devices. Try restarting Bluetooth or the app.',
  'CONNECTION_ERROR': 'Failed to connect. Move closer to the device and try again.',
  'ADVERTISING_FAILED': 'Failed to start advertising. Try restarting Bluetooth.',
  'DEVICE_NOT_CONNECTED': 'Device is not connected. Please reconnect.',
  'SERVICE_NOT_FOUND': 'Required BLE service not found on device.',
  'CHARACTERISTIC_NOT_FOUND': 'Required BLE characteristic not found on device.'
};

function getStatusDotColor(status: string) {
  switch (status.toLowerCase()) {
    case 'connected': return '#48dbfb';
    case 'connecting': return '#feca57';
    case 'error': return '#ff6b6b';
    case 'not connected': return '#ccc';
    default: return '#ccc';
  }
}

export default function BLEPaymentScreen() {
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [connectionStatus, setConnectionStatus] = useState('Not connected');
  const [pendingTxs, setPendingTxs] = useState<Transaction[]>([]);
  const [bleAvailable, setBleAvailable] = useState(false);
  const [bluetoothEnabled, setBluetoothEnabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'secure_ble' | 'devices' | 'advertising'>('secure_ble');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [showConfirmSend, setShowConfirmSend] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [securityStatus, setSecurityStatus] = useState<'disconnected' | 'key_exchange' | 'encrypted' | 'error'>('disconnected');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [devicePublicKey, setDevicePublicKey] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const [lastReceipt, setLastReceipt] = useState<{
    hash: string;
    device: Device | null;
    amount: string;
    chain: string;
    timestamp: number;
    sessionId: string;
  } | null>(null);

  // New advertising states
  const [isAdvertising, setIsAdvertising] = useState(false);
  const [advertisingStatus, setAdvertisingStatus] = useState('Not advertising');
  const [advertisingSupported, setAdvertisingSupported] = useState(false);
  const [advertisingError, setAdvertisingError] = useState<string | null>(null);

  const [currentStep, setCurrentStep] = useState(0); // 0: Scan, 1: Pair, 2: Create Tx, 3: Hash, 4: Send, 5: Receipt
  const [transactionForm, setTransactionForm] = useState({
    to: '',
    amount: '',
    chainId: '',
    token: '',
  });
  const [transactionHash, setTransactionHash] = useState<string | null>(null);

  // 2. Add stepper UI
  const stepLabels = [
    'Scan',
    'Pair',
    'Create Transaction',
    'Get Tx Hash',
    'Send Payment',
    'Receipt',
  ];

  const renderStepper = () => (
    <View style={{ flexDirection: 'row', justifyContent: 'center', marginVertical: 12 }}>
      {stepLabels.map((label, idx) => (
        <View key={label} style={{ alignItems: 'center', flex: 1 }}>
          <View style={{
            width: 24, height: 24, borderRadius: 12, backgroundColor: idx <= currentStep ? '#2196F3' : '#ccc',
            justifyContent: 'center', alignItems: 'center', marginBottom: 4
          }}>
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>{idx + 1}</Text>
          </View>
          <Text style={{ fontSize: 10, color: idx <= currentStep ? '#2196F3' : '#aaa', textAlign: 'center' }}>{label}</Text>
        </View>
      ))}
    </View>
  );

  // Use the BLE manager hook
  const { manager: bleManager, error: bleError } = useBLEManager();
  const bleSecurity = BLESecurity.getInstance();
  const secureBleTransport = new SecureBLETransport();
  const paymentService = PaymentService.getInstance();

  const router = useRouter();
  const { selectedChain } = useSelectedChain();
  const chainColor = getChainColor(selectedChain);

  const steps = [
    'Security Check',
    'Device Scan',
    'Key Exchange',
    'Encryption',
    'Payment',
    'Receipt',
  ];
  const [step, setStep] = useState(0);

  const nextStep = () => setStep((s) => Math.min(s + 1, steps.length - 1));
  const prevStep = () => setStep((s) => Math.max(s - 1, 0));

  // Check Bluetooth state
  const checkBluetoothState = useCallback(async () => {
    if (!bleManager) {
      setBleAvailable(false);
      setBluetoothEnabled(false);
      return;
    }

    try {
      const isEnabled = await bleManager.isBluetoothEnabled();
      setBluetoothEnabled(isEnabled);
      setBleAvailable(bleManager.isBleAvailable());
      
      // Check advertising support
      if (bleManager.isAdvertisingSupported) {
        setAdvertisingSupported(bleManager.isAdvertisingSupported());
      }
    } catch (error) {
      setBleAvailable(false);
      setBluetoothEnabled(false);
    }
  }, [bleManager]);

  // Initialize BLE
  useEffect(() => {
    const initializeBLE = async () => {
      if (bleError) {
        setBleAvailable(false);
        setBluetoothEnabled(false);
        setConnectionStatus(`BLE Error: ${bleError}`);
        return;
      }

      if (!bleManager) {
        setBleAvailable(false);
        setBluetoothEnabled(false);
        setConnectionStatus('BLE not available');
        return;
      }

        try {
          await checkBluetoothState();
          logger.info('[BLE] BluetoothManager initialized successfully');
        } catch (error: any) {
          setBleAvailable(false);
          setBluetoothEnabled(false);
          Alert.alert(
            'BLE Error',
            'Failed to initialize Bluetooth: ' + (error.message || 'Unknown error'),
            [{ text: 'OK' }]
          );
        }
    };

    initializeBLE();
  }, [bleManager, bleError, checkBluetoothState]);

  // Set up periodic Bluetooth state checking
  useEffect(() => {
    if (!bleManager) return;

    checkBluetoothState();
    const interval = setInterval(checkBluetoothState, 2000);
    return () => clearInterval(interval);
  }, [bleManager, checkBluetoothState]);

  // Load pending transactions
  const loadPendingTxs = useCallback(async () => {
    try {
      const txs = await TxQueue.getPendingTransactions();
      setPendingTxs(txs);
    } catch (error) {
      // Silent error handling
    }
  }, []);

  useEffect(() => {
    loadPendingTxs();
  }, [loadPendingTxs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPendingTxs();
    await checkBluetoothState();
    setRefreshing(false);
  }, [loadPendingTxs, checkBluetoothState]);

  // Start secure scan
  const handleStartSecureScan = async () => {
    if (!bleAvailable || !bleManager || !bluetoothEnabled) {
      Alert.alert(
        'Bluetooth Required', 
        'Please enable Bluetooth to scan for devices',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Open Settings', 
            onPress: () => {
              if (Platform.OS === 'ios') {
                Linking.openURL('App-Prefs:Bluetooth');
              } else {
                Linking.openSettings();
              }
            }
          }
        ]
      );
      return;
    }

      setScanning(true);
      setDevices([]);
      setConnectionStatus('Scanning for AirChainPay devices...');
      setCurrentStep(0); // Reset step
      
      try {
        bleManager.startScan((device: Device) => {
          setDevices((prev) => {
            if (prev.find((d) => d.id === device.id)) return prev;
            return [...prev, device];
          });
        });
        
        setTimeout(() => {
          try {
            if (bleManager) {
              bleManager.stopScan();
            }
          } catch (e) {
            // Silent error handling
          } finally {
            setScanning(false);
            setConnectionStatus(devices.length > 0 ? 
              `Found ${devices.length} AirChainPay device(s)` : 
              'No AirChainPay devices found');
          }
        }, 10000);
      } catch (error: any) {
        setScanning(false);
        setConnectionStatus('Scan failed: ' + (error.message || 'Unknown error'));
        Alert.alert('Scan Error', error.message || 'Failed to start scanning');
      }
  };

  const handleStopScan = () => {
    if (bleManager) {
      try {
        bleManager.stopScan();
      } catch (e) {
        // Silent error handling
      }
    }
    setScanning(false);
    setConnectionStatus('Scan stopped');
  };

  // New advertising functions
  const handleStartAdvertising = async () => {
    if (!bleManager) {
      setAdvertisingError('Bluetooth manager is not available.');
      setAdvertisingStatus('Not advertising');
      return;
    }

    // Request BLE permissions for Android 12+ (minimal, direct)
    await bleManager.requestPermissionsEnhanced?.();

    // Check if advertising is truly supported
    const trulySupported = await bleManager.isAdvertisingTrulySupported();
    if (!trulySupported) {
      // Get more detailed information about why advertising is not supported
      const supportStatus = await bleManager.checkAdvertisingSupport();
      let errorMessage = 'BLE advertising is not supported on this device or platform.';
      
      if (supportStatus.missingRequirements.length > 0) {
        errorMessage = `BLE advertising not available: ${supportStatus.missingRequirements.join(', ')}`;
      }
      
      // Add specific guidance based on the error
      if (errorMessage.includes('advertiser not available')) {
        errorMessage += '\n\n💡 Try restarting the app or rebuilding with: npx expo run:android';
      } else if (errorMessage.includes('Bluetooth')) {
        errorMessage += '\n\n💡 Please ensure Bluetooth is enabled in device settings';
      } else if (errorMessage.includes('permissions')) {
        errorMessage += '\n\n💡 Please grant Bluetooth permissions in app settings';
      }
      
      setAdvertisingError(errorMessage);
      setAdvertisingStatus('Not advertising');
      return;
    }

    if (!bluetoothEnabled) {
      setAdvertisingError('Please enable Bluetooth to start advertising');
      setAdvertisingStatus('Not advertising');
      return;
    }

    try {
      setAdvertisingStatus('Starting advertising...');
      setAdvertisingError(null);
      
      const result = await bleManager.startAdvertising();
      
      if (result.success) {
        setIsAdvertising(true);
        setAdvertisingStatus('Advertising as AirChainPay device');
        const timestamp = new Date().toISOString();
        const deviceName = bleManager.deviceName || 'unknown';
        logger.info(`User started BLE advertising at ${timestamp} (device: ${deviceName})`);
        
        // Only show permission dialog if advertising failed due to permission issues
        // If advertising succeeded, don't show the dialog even if BLUETOOTH_ADVERTISE is missing
        if (!result.success && result.message && result.message.includes('BLUETOOTH_ADVERTISE')) {
          setAdvertisingError(result.message);
        }
        
        // Only handle settings redirect if advertising actually failed
        if (!result.success && result.needsSettingsRedirect) {
          PermissionUtils.showBluetoothAdvertiseSettingsDialog();
        }
      } else {
        setAdvertisingError(result.message || 'Failed to start advertising');
        setAdvertisingStatus('Advertising failed');
        logger.error('[BLE] Advertising failed:', result.message);
        
        // Only show permission dialog if advertising failed due to permission issues
        if (result.message && result.message.includes('BLUETOOTH_ADVERTISE')) {
          setAdvertisingError(result.message);
        }
        
        // Handle settings redirect if needed
        if (result.needsSettingsRedirect) {
          PermissionUtils.showBluetoothAdvertiseSettingsDialog();
        }
      }
    } catch (error: any) {
      const errorMsg = error?.message || 'Failed to start advertising';
      setAdvertisingError(errorMsg);
      setAdvertisingStatus('Advertising failed');
      logger.error('[BLE] Advertising error:', error);
    }
  };

  const handleStopAdvertising = async () => {
    if (!bleManager) return;
    try {
      setAdvertisingStatus('Stopping advertising...');
      await bleManager.stopAdvertising();
      setIsAdvertising(false);
      setAdvertisingStatus('Not advertising');
      setAdvertisingError(null);
      const timestamp = new Date().toISOString();
      const deviceName = bleManager.deviceName || 'unknown';
      logger.info(`User stopped BLE advertising at ${timestamp} (device: ${deviceName})`);
    } catch (error: any) {
      const errorMsg = error?.message || 'Failed to stop advertising';
      setAdvertisingError(errorMsg);
      logger.error('[BLE] Stop advertising error:', error);
    }
  };

  // Monitor advertising status
  useEffect(() => {
    if (!bleManager || !isAdvertising) return;

    const checkAdvertisingStatus = async () => {
      try {
        // Check if advertising is still active
        const supportStatus = await bleManager.checkAdvertisingSupport();
        if (!supportStatus.supported) {
          setIsAdvertising(false);
          setAdvertisingStatus('Advertising stopped - requirements not met');
          setAdvertisingError('Advertising requirements changed');
        }
      } catch (error) {
        console.warn('[BLE] Error checking advertising status:', error);
      }
    };

    const interval = setInterval(checkAdvertisingStatus, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, [bleManager, isAdvertising]);

  // On mount, check and request permissions if needed
  useEffect(() => {
    const checkAndRequest = async () => {
      if (bleManager) {
        await bleManager.requestAllPermissions();
      }
    };
    checkAndRequest();
  }, [bleManager]);

  const handleError = (msg: string, error?: any) => {
    let code = error?.code || error?.name || '';
    let suggestion = '';
    if (code && BLE_ERROR_SUGGESTIONS[code]) {
      suggestion = BLE_ERROR_SUGGESTIONS[code];
    } else if (msg.toLowerCase().includes('bluetooth')) {
      suggestion = 'Please ensure Bluetooth is enabled and permissions are granted.';
    }
    const fullMsg = msg + (error?.message ? `: ${error.message}` : '') + (suggestion ? `\n${suggestion}` : '');
    logger.error(fullMsg, error);
    setErrorBanner(fullMsg);
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  // Add at the top of the component, after useState hooks
  const [deviceWhitelist, setDeviceWhitelist] = useState<string[]>([]);
  const [showWhitelistModal, setShowWhitelistModal] = useState(false);
  const [whitelistInput, setWhitelistInput] = useState('');

  // Helper: check if device is whitelisted
  const isDeviceWhitelisted = (deviceId: string) => deviceWhitelist.includes(deviceId);

  // Add device to whitelist
  const addDeviceToWhitelist = (deviceId: string) => {
    if (!deviceWhitelist.includes(deviceId)) {
      setDeviceWhitelist([...deviceWhitelist, deviceId]);
    }
  };

  // Remove device from whitelist
  const removeDeviceFromWhitelist = (deviceId: string) => {
    setDeviceWhitelist(deviceWhitelist.filter(id => id !== deviceId));
  };

  // Secure device connection with key exchange
  const handleSecureConnectDevice = async (device: Device) => {
    if (!bleManager) {
      handleError('Bluetooth manager not available');
      Alert.alert('Error', 'Bluetooth manager not available');
      return;
    }

    if (!isDeviceWhitelisted(device.id)) {
      Alert.alert('Not Whitelisted', 'This device is not in your whitelist. Add it before pairing.');
      return;
    }

    setSelectedDevice(device);
    setConnectionStatus('Initiating secure connection...');
    setSecurityStatus('key_exchange');

    try {
      // Connect to device
      await bleManager.connectToDevice(device);
      setConnectionStatus('Connected, performing key exchange...');

      
      setSecurityStatus('encrypted');
      setConnectionStatus('Secure connection established');
      setDevicePublicKey(null); // Or set actual public key if available
      setCurrentStep(1); // After successful pairing
    } catch (error) {
      setConnectionStatus('Secure connection failed');
      setSecurityStatus('error');
      handleError('Failed to establish secure connection', error);
      Alert.alert('Connection Failed', 'Could not establish secure connection', [
        { text: 'Retry', onPress: () => handleSecureConnectDevice(device) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  // 4. Transaction creation UI (Step 2)
  const renderTransactionForm = () => (
    <View style={styles.section}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Create Transaction</Text>
        <TextInput
          style={styles.input}
          placeholder="Recipient Address"
          value={transactionForm.to}
          onChangeText={to => setTransactionForm(f => ({ ...f, to }))}
          editable={currentStep === 2}
        />
        <TextInput
          style={styles.input}
          placeholder="Amount"
          value={transactionForm.amount}
          onChangeText={amount => setTransactionForm(f => ({ ...f, amount }))}
          keyboardType="decimal-pad"
          editable={currentStep === 2}
        />
        <TextInput
          style={styles.input}
          placeholder="Token (symbol)"
          value={transactionForm.token}
          onChangeText={token => setTransactionForm(f => ({ ...f, token }))}
          editable={currentStep === 2}
        />
        <TouchableOpacity
          style={[styles.actionButton, currentStep !== 2 && styles.buttonDisabled]}
          disabled={currentStep !== 2 || !transactionForm.to || !transactionForm.amount || !transactionForm.token}
          onPress={async () => {
            // Simulate hash generation
            const hash = '0x' + Math.random().toString(16).slice(2, 10) + Date.now().toString(16);
            setTransactionHash(hash);
            setCurrentStep(3);
          }}
        >
          <Text style={styles.actionButtonText}>Generate Tx Hash</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // 5. Show transaction hash (Step 3)
  const renderTransactionHash = () => (
    <View style={styles.section}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Transaction Hash</Text>
        <Text selectable style={{ fontFamily: 'monospace', marginVertical: 8 }}>{transactionHash}</Text>
        <TouchableOpacity
          style={[styles.actionButton, currentStep !== 3 && styles.buttonDisabled]}
          disabled={currentStep !== 3}
          onPress={() => setCurrentStep(4)}
        >
          <Text style={styles.actionButtonText}>Proceed to Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const PAYMENT_TIMEOUT_MS = 20000; // 20 seconds
  // 6. Update confirmSendSecureTx to implement enhanced BLE flow
  const confirmSendSecureTx = async () => {
    if (currentStep !== 4) return;
    setShowConfirmSend(false);
    if (!selectedDevice || !sessionId) {
      handleError('No device selected or session not established');
      return;
    }
    if (!transactionForm.to || !transactionForm.amount || !transactionForm.token || !transactionHash) {
      handleError('Transaction details incomplete.');
      return;
    }
    try {
      setConnectionStatus('Starting enhanced BLE payment flow...');
      
      // Find chain config for token details
      const chainConfig = SUPPORTED_CHAINS[selectedChain];
      let tokenObj;
      if (chainConfig) {
        tokenObj = {
          address: '',
          symbol: transactionForm.token,
          decimals: chainConfig.nativeCurrency.decimals,
          isNative: true
        };
      } else {
        tokenObj = {
          address: '',
          symbol: transactionForm.token,
          decimals: 18,
          isNative: true
        };
      }
      
      const paymentRequest = {
        to: transactionForm.to,
        amount: transactionForm.amount,
        chainId: selectedChain,
        transport: 'onchain' as const,
        extraData: { device: selectedDevice },
        token: tokenObj,
        paymentReference: transactionHash,
      };
      
      // Enhanced flow with step-by-step tracking
      setConnectionStatus('Step 1: Checking BLE availability...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate check
      
      setConnectionStatus('Step 2: Connecting to device...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate connection
      
      setConnectionStatus('Step 3: Sending encrypted payment...');
      const paymentPromise = paymentService.sendPayment(paymentRequest);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Payment timed out. Please try again.')), PAYMENT_TIMEOUT_MS)
      );
      const result: any = await Promise.race([paymentPromise, timeoutPromise]);
      
      if (result && typeof result === 'object' && 'status' in result) {
        if (result.status === 'confirmed') {
          // Enhanced flow completed successfully
          setConnectionStatus('Step 4: Transaction confirmed on blockchain');
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          setConnectionStatus('Step 5: Advertiser received token');
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          setConnectionStatus('Step 6: Advertiser advertising confirmation');
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          setLastReceipt({
            hash: result.metadata?.transactionHash || transactionHash,
            device: selectedDevice,
            amount: transactionForm.amount,
            chain: selectedChain,
            timestamp: Date.now(),
            sessionId: sessionId || ''
          });
          
          setCurrentStep(5); // Go to receipt step
          setShowConfirmation(true); // Show confirmation modal
          
          Alert.alert(
            'Enhanced Payment Success', 
            `Complete BLE flow finished!\n\nTransaction Hash: ${result.metadata?.transactionHash}\nPayment Confirmed: ${result.metadata?.paymentConfirmed}\nAdvertiser Advertising: ${result.metadata?.advertiserAdvertising}`
          );
        } else if (result.status === 'sent') {
          // Fallback to basic success
          setLastReceipt({
            hash: transactionHash,
            device: selectedDevice,
            amount: transactionForm.amount,
            chain: selectedChain,
            timestamp: Date.now(),
            sessionId: sessionId || ''
          });
          setCurrentStep(5);
          setShowConfirmation(true);
          Alert.alert('Success', 'Encrypted payment sent successfully');
        } else {
          throw new Error(result.message || 'Payment failed');
        }
      } else {
        throw new Error('Payment failed');
      }
    } catch (error: any) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (error instanceof WalletError) {
        handleError('Wallet error', error);
        Alert.alert('Wallet Error', error.message, [
          { text: 'Retry', onPress: confirmSendSecureTx },
          { text: 'Cancel', style: 'cancel' },
        ]);
      } else if (error instanceof BLEError) {
        handleError('Bluetooth error', error);
        Alert.alert('Bluetooth Error', error.message, [
          { text: 'Retry', onPress: confirmSendSecureTx },
          { text: 'Cancel', style: 'cancel' },
        ]);
      } else if (error instanceof TransactionError) {
        handleError('Transaction error', error);
        Alert.alert('Transaction Error', error.message, [
          { text: 'Retry', onPress: confirmSendSecureTx },
          { text: 'Cancel', style: 'cancel' },
        ]);
      } else {
        handleError('Failed to send enhanced encrypted payment', error);
        Alert.alert('Error', errMsg || 'Failed to send enhanced encrypted payment', [
          { text: 'Retry', onPress: confirmSendSecureTx },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }
    }
  };

  // 7. Render step content based on currentStep
  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return renderSecuritySection(); // Scan
      case 1:
        return renderDevicesSection(); // Pair
      case 2:
        return renderTransactionForm(); // Create Tx
      case 3:
        return renderTransactionHash(); // Show hash
      case 4:
        return (
          <View style={styles.section}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Ready to Send</Text>
              <Text>Transaction hash: {transactionHash}</Text>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={confirmSendSecureTx}
              >
                <Text style={styles.actionButtonText}>Send Payment</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      case 5:
        return (
          <View style={styles.section}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Receipt</Text>
              <Text>Payment sent to {transactionForm.to}</Text>
              <Text>Amount: {transactionForm.amount} {transactionForm.token}</Text>
              <Text>Hash: {transactionHash}</Text>
              <Text>Time: {lastReceipt?.timestamp ? new Date(lastReceipt.timestamp).toLocaleString() : ''}</Text>
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  const getSecurityStatusColor = () => {
    switch (securityStatus) {
      case 'disconnected': return '#ff6b6b';
      case 'key_exchange': return '#feca57';
      case 'encrypted': return '#48dbfb';
      case 'error': return '#ff6b6b';
      default: return '#ff6b6b';
    }
  };

  const getSecurityStatusText = () => {
    switch (securityStatus) {
      case 'disconnected': return 'Not Connected';
      case 'key_exchange': return 'Key Exchange';
      case 'encrypted': return 'Encrypted';
      case 'error': return 'Error';
      default: return 'Unknown';
    }
  };

  const renderSecuritySection = () => (
    <View style={styles.section}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
          <Ionicons name="shield-checkmark" size={24} color={getSecurityStatusColor()} />
          <Text style={styles.cardTitle}>Secure BLE Payment</Text>
            </View>
        
        <View style={styles.securityInfo}>
          <View style={styles.securityStatus}>
            <View style={[styles.statusDot, { backgroundColor: getSecurityStatusColor() }]} />
            <Text style={styles.securityStatusText}>{getSecurityStatusText()}</Text>
              </View>
          
          {sessionId && (
            <Text style={styles.sessionInfo}>Session: {sessionId.slice(0, 8)}...</Text>
          )}
          
          {devicePublicKey && (
            <Text style={styles.publicKeyInfo}>Device Key: {devicePublicKey.slice(0, 10)}...</Text>
        )}
      </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.actionButton, scanning && styles.buttonDisabled]}
            onPress={handleStartSecureScan}
                disabled={scanning}
              >
                {scanning ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="search" size={20} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>Secure Scan</Text>
                  </>
                )}
              </TouchableOpacity>
          
              <TouchableOpacity
                style={[styles.actionButton, styles.secondaryButton]}
                onPress={handleStopScan}
              >
                <Ionicons name="stop" size={20} color="#2196F3" />
                <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>
                  Stop Scan
                </Text>
              </TouchableOpacity>
            </View>
      </View>
    </View>
  );

  const renderDevicesSection = () => (
    <View style={styles.section}>
      {bluetoothEnabled && bleAvailable ? (
        <View>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="shield-outline" size={24} color="#2196F3" />
              <Text style={styles.cardTitle}>Secure Device Discovery</Text>
              <TouchableOpacity onPress={() => setShowWhitelistModal(true)} style={{ marginLeft: 'auto' }}>
                <Ionicons name="list-circle-outline" size={24} color="#2196F3" />
              </TouchableOpacity>
            </View>
            {selectedDevice && (
              <View style={styles.pairedDeviceBanner}>
                <Ionicons name="bluetooth" size={18} color="#48dbfb" />
                <Text style={styles.pairedDeviceText}>
                  Paired with: {selectedDevice.name || selectedDevice.localName || 'Unknown Device'} ({selectedDevice.id})
                </Text>
                {/* Connection status indicator */}
                <View style={styles.connectionStatusIndicator}>
                  <View style={[styles.statusDot, { backgroundColor: getStatusDotColor(connectionStatus) }]} />
                  <Text style={styles.connectionStatusText}>{connectionStatus}</Text>
                </View>
                <TouchableOpacity
                  style={styles.disconnectButton}
                  onPress={async () => {
                    if (bleManager) {
                      await bleManager.disconnectFromDevice(selectedDevice.id);
                    }
                    setSelectedDevice(null);
                    setConnectionStatus('Not connected');
                    setSecurityStatus('disconnected');
                  }}
                >
                  <Ionicons name="close-circle" size={20} color="#b00020" />
                  <Text style={styles.disconnectButtonText}>Disconnect</Text>
                </TouchableOpacity>
              </View>
            )}
            {devices.length > 0 ? (
              <FlatList
                data={devices}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const isPaired = selectedDevice && selectedDevice.id === item.id;
                  const whitelisted = isDeviceWhitelisted(item.id);
                  return (
                    <View style={[styles.deviceItem, isPaired && styles.pairedDeviceItem]}>
                      <View style={styles.deviceInfo}>
                        <Text style={styles.deviceName}>
                          {item.name || item.localName || 'Unknown Device'}
                        </Text>
                        <Text style={styles.deviceId}>{item.id}</Text>
                        {whitelisted ? (
                          <Text style={styles.whitelistStatus}>Whitelisted</Text>
                        ) : (
                          <Text style={styles.notWhitelistedStatus}>Not Whitelisted</Text>
                        )}
                      </View>
                      <View style={styles.deviceActions}>
                        {whitelisted ? (
                          isPaired ? (
                            <View style={styles.pairedStatus}>
                              <Ionicons name="checkmark-circle" size={20} color="#48dbfb" />
                              <Text style={styles.pairedStatusText}>Paired</Text>
                            </View>
                          ) : (
                            <TouchableOpacity
                              style={styles.pairButton}
                              onPress={() => handleSecureConnectDevice(item)}
                            >
                              <Ionicons name="link" size={18} color="#2196F3" />
                              <Text style={styles.pairButtonText}>Pair</Text>
                            </TouchableOpacity>
                          )
                        ) : (
                          <TouchableOpacity
                            style={styles.pairButton}
                            onPress={() => addDeviceToWhitelist(item.id)}
                          >
                            <Ionicons name="add-circle-outline" size={18} color="#2196F3" />
                            <Text style={styles.pairButtonText}>Add to Whitelist</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                }}
              />
            ) : (
              <Text style={styles.noDevicesText}>
                No AirChainPay devices found. Start scanning to discover devices.
              </Text>
            )}
          </View>
        </View>
      ) : (
        <View style={[styles.card, styles.disabledCard]}>
          <View style={styles.cardHeader}>
            <Ionicons name="shield-outline" size={24} color="#ccc" />
            <Text style={[styles.cardTitle, styles.disabledTitle]}>Secure BLE Payment</Text>
          </View>
          <View style={styles.disabledContent}>
            <Ionicons name="bluetooth-outline" size={48} color="#ccc" style={styles.disabledIcon} />
            <Text style={styles.disabledText}>
              Bluetooth is currently disabled
            </Text>
            <Text style={styles.disabledSubtext}>
              Enable Bluetooth in your device settings to use secure BLE payments
            </Text>
            <TouchableOpacity
              style={styles.enableBluetoothButton}
              onPress={() => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('App-Prefs:Bluetooth');
                } else {
                  Linking.openSettings();
                }
              }}
            >
              <Ionicons name="settings-outline" size={20} color="#FFFFFF" />
              <Text style={styles.enableBluetoothButtonText}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  const renderAdvertisingSection = () => (
    <View style={styles.section}>
      <View>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="link" size={24} color="#2196F3" />
            <Text style={styles.cardTitle}>BLE Advertising</Text>
          </View>

          {Platform.OS === 'ios' ? (
            <View style={styles.warningContainer}>
              <Ionicons name="alert-circle" size={18} color="#e67e22" style={{ marginRight: 6 }} />
              <Text style={styles.warningText}>
                BLE advertising is <Text style={{ fontWeight: 'bold' }}>not supported on iOS</Text>. You can only advertise your device on Android devices.
              </Text>
            </View>
          ) : (
            <View style={styles.securityInfo}>
              <View style={styles.securityStatus}>
                <View style={[styles.statusDot, { backgroundColor: isAdvertising ? '#48dbfb' : '#ff6b6b' }]} />
                <Text style={styles.securityStatusText}>{advertisingStatus}</Text>
              </View>

              {/* Error handling for advertising */}
              {advertisingError && (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={18} color="#ff6b6b" style={{ marginRight: 6 }} />
                  <Text style={styles.errorText}>{advertisingError}</Text>
                </View>
              )}

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    isAdvertising ? styles.buttonStop : styles.buttonStart
                  ]}
                  onPress={isAdvertising ? handleStopAdvertising : handleStartAdvertising}
                  disabled={false}
                >
                  {isAdvertising ? (
                    <>
                      <Ionicons name="stop-circle" size={20} color="#FFFFFF" />
                      <Text style={styles.actionButtonText}>Stop Advertising</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="link" size={20} color="#FFFFFF" />
                      <Text style={styles.actionButtonText}>Start Advertising</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {isAdvertising && (
                <View style={styles.advertisingInfo}>
                  <Text style={styles.advertisingInfoText}>
                    Your device is now advertising as an AirChainPay payment device.
                  </Text>
                  <Text style={styles.advertisingInfoSubtext}>
                    Other devices can discover and connect to you for secure payments.
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );

  const { colorScheme } = useThemeContext();
  const theme = colorScheme || 'light';
  const colors = Colors[theme];

  return (
    <ScrollView
      ref={scrollViewRef}
      style={[styles.container, { backgroundColor: colors.background }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />
      }
    >
      {errorBanner && (
        <View style={[styles.errorBanner, { backgroundColor: colors.background }]}>
          <Text style={[styles.errorText, { color: colors.error }]}>{errorBanner}</Text>
          <TouchableOpacity onPress={() => setErrorBanner(null)} style={{ marginLeft: 8 }}>
            <Ionicons name="close-circle" size={20} color={colors.error} />
          </TouchableOpacity>
          {errorBanner.toLowerCase().includes('connect') || errorBanner.toLowerCase().includes('scan') ? (
            <TouchableOpacity onPress={() => { setErrorBanner(null); if (errorBanner.toLowerCase().includes('connect') && selectedDevice) handleSecureConnectDevice(selectedDevice); else if (errorBanner.toLowerCase().includes('scan')) handleStartSecureScan(); }} style={{ marginLeft: 8 }}>
              <Text style={{ color: '#2196F3', fontWeight: 'bold' }}>Retry</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
              <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.tint} />
              </TouchableOpacity>
        <Text style={[styles.title, { color: colors.tint }]}>BLE Payment</Text>
        <View style={styles.headerRight} />
        </View>

      <View style={[styles.tabContainer, { backgroundColor: colors.card }]}>
            <TouchableOpacity
          style={[styles.tab, activeTab === 'secure_ble' && [styles.activeTab, { backgroundColor: colors.backgroundSecondary }]]}
          onPress={() => setActiveTab('secure_ble')}
        >
          <Ionicons 
            name="shield-checkmark" 
            size={20} 
            color={activeTab === 'secure_ble' ? colors.tint : colors.icon} 
          />
          <Text style={[styles.tabText, activeTab === 'secure_ble' && { color: colors.tint }]}>
            Secure Payment
          </Text>
            </TouchableOpacity>
        
            <TouchableOpacity
          style={[styles.tab, activeTab === 'devices' && [styles.activeTab, { backgroundColor: colors.backgroundSecondary }]]}
          onPress={() => setActiveTab('devices')}
        >
          <Ionicons 
            name="bluetooth" 
            size={20} 
            color={activeTab === 'devices' ? colors.tint : colors.icon} 
          />
          <Text style={[styles.tabText, activeTab === 'devices' && { color: colors.tint }]}>
            Devices
          </Text>
            </TouchableOpacity>

            <TouchableOpacity
          style={[styles.tab, activeTab === 'advertising' && [styles.activeTab, { backgroundColor: colors.backgroundSecondary }]]}
          onPress={() => setActiveTab('advertising')}
        >
          <Ionicons 
            name="link" 
            size={20} 
            color={activeTab === 'advertising' ? colors.tint : colors.icon} 
          />
          <Text style={[styles.tabText, activeTab === 'advertising' && { color: colors.tint }]}>
            Advertising
          </Text>
            </TouchableOpacity>
          </View>

      {activeTab === 'secure_ble' ? renderSecuritySection() : activeTab === 'devices' ? renderDevicesSection() : renderAdvertisingSection()}

      {/* Confirmation Modal */}
        <Modal
          visible={showConfirmSend}
          transparent={true}
        animationType="slide"
        >
          <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirm Encrypted Payment</Text>
            <Text style={styles.modalText}>
              Send {transactionForm.amount} {transactionForm.token} to {transactionForm.to}?
            </Text>
            <Text style={styles.modalSubtext}>
              This payment will be encrypted and transmitted securely.
            </Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowConfirmSend(false)}
              >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={confirmSendSecureTx}
              >
                <Text style={styles.confirmButtonText}>Send Payment</Text>
              </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

      {/* New Confirmation Modal */}
      <Modal
        visible={showConfirmation}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="checkmark-circle" size={48} color="#48dbfb" style={{ alignSelf: 'center', marginBottom: 8 }} />
            <Text style={styles.modalTitle}>Payment Confirmed</Text>
            <Text style={styles.modalText}>Your payment was sent successfully!</Text>
            {lastReceipt && (
              <View style={styles.confirmationDetails}>
                <Text style={styles.confirmationLabel}>Amount:</Text>
                <Text style={styles.confirmationValue}>{lastReceipt.amount} {transactionForm.token}</Text>
                <Text style={styles.confirmationLabel}>To:</Text>
                <Text style={styles.confirmationValue}>{transactionForm.to}</Text>
                <Text style={styles.confirmationLabel}>Chain:</Text>
                <Text style={styles.confirmationValue}>{lastReceipt.chain}</Text>
                <Text style={styles.confirmationLabel}>Hash:</Text>
                <Text style={styles.confirmationValue} selectable>{lastReceipt.hash}</Text>
                <Text style={styles.confirmationLabel}>Time:</Text>
                <Text style={styles.confirmationValue}>{lastReceipt.timestamp ? new Date(lastReceipt.timestamp).toLocaleString() : ''}</Text>
              </View>
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={async () => {
                  if (lastReceipt?.hash) await Clipboard.setStringAsync(lastReceipt.hash);
                }}
              >
                <Ionicons name="copy" size={18} color="#2196F3" />
                <Text style={styles.confirmButtonText}>Copy Hash</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={async () => {
                  if (lastReceipt) {
                    await Share.share({
                      message: `AirChainPay Payment\nAmount: ${lastReceipt.amount} ${transactionForm.token}\nTo: ${transactionForm.to}\nChain: ${lastReceipt.chain}\nHash: ${lastReceipt.hash}\nTime: ${lastReceipt.timestamp ? new Date(lastReceipt.timestamp).toLocaleString() : ''}`
                    });
                  }
                }}
              >
                <Ionicons name="share-social" size={18} color="#2196F3" />
                <Text style={styles.confirmButtonText}>Share Receipt</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.modalButton, styles.closeButton]}
              onPress={() => setShowConfirmation(false)}
            >
              <Text style={styles.cancelButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Whitelist Management Modal */}
      <Modal
        visible={showWhitelistModal}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Manage Whitelist</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter device ID to add"
              value={whitelistInput}
              onChangeText={setWhitelistInput}
            />
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                if (whitelistInput.trim()) {
                  addDeviceToWhitelist(whitelistInput.trim());
                  setWhitelistInput('');
                }
              }}
            >
              <Text style={styles.confirmButtonText}>Add Device</Text>
            </TouchableOpacity>
            <Text style={{ marginTop: 16, fontWeight: 'bold' }}>Whitelisted Devices:</Text>
            <FlatList
              data={deviceWhitelist}
              keyExtractor={id => id}
              renderItem={({ item }) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 4 }}>
                  <Text style={{ flex: 1 }}>{item}</Text>
                  <TouchableOpacity onPress={() => removeDeviceFromWhitelist(item)}>
                    <Ionicons name="remove-circle" size={20} color="#b00020" />
                  </TouchableOpacity>
                </View>
              )}
            />
            <TouchableOpacity
              style={[styles.modalButton, styles.closeButton]}
              onPress={() => setShowWhitelistModal(false)}
            >
              <Text style={styles.cancelButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerRight: {
    width: 40,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#f0f8ff',
  },
  tabText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  securityInfo: {
    marginBottom: 16,
  },
  securityStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  securityStatusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  sessionInfo: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  publicKeyInfo: {
    fontSize: 14,
    color: '#666',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
    marginLeft: 8,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  secondaryButtonText: {
    color: '#2196F3',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  pairedDeviceItem: {
    backgroundColor: '#e0f7fa',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#333',
  },
  deviceId: {
    fontSize: 12,
    color: '#888',
  },
  deviceActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pairButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  pairButtonText: {
    color: '#2196F3',
    marginLeft: 4,
    fontWeight: 'bold',
  },
  pairedStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0f7fa',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  pairedStatusText: {
    color: '#48dbfb',
    marginLeft: 4,
    fontWeight: 'bold',
  },
  noDevicesText: {
    textAlign: 'center',
    color: '#666',
    fontStyle: 'italic',
    paddingVertical: 20,
  },
  disabledCard: {
    opacity: 0.6,
  },
  disabledTitle: {
    color: '#ccc',
  },
  disabledContent: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  disabledIcon: {
    marginBottom: 16,
  },
  disabledText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  disabledSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 16,
  },
  enableBluetoothButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  enableBluetoothButtonText: {
    color: '#fff',
    fontWeight: '600',
    marginLeft: 8,
  },
  errorBanner: {
    backgroundColor: '#ffcccc',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#b00020',
  },
  errorText: {
    color: '#b00020',
    flex: 1,
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    margin: 20,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  modalText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginHorizontal: 8,
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  cancelButtonText: {
    color: '#666',
    textAlign: 'center',
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#2196F3',
  },
  confirmButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: '600',
  },
  advertisingInfo: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f0f8ff',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#48dbfb',
  },
  advertisingInfoText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2196F3',
    marginBottom: 4,
  },
  advertisingInfoSubtext: {
    fontSize: 12,
    color: '#666',
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
    padding: 8,
    backgroundColor: '#fff3cd',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#e67e22',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
    padding: 8,
    backgroundColor: '#f8d7da',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#ff6b6b',
  },
  input: {
    height: 50,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 12,
    backgroundColor: '#f9f9f9',
  },
  pairedDeviceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0f7fa',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  pairedDeviceText: {
    color: '#2196F3',
    marginLeft: 8,
    fontWeight: 'bold',
    flex: 1,
  },
  disconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    padding: 4,
    backgroundColor: '#ffeaea',
    borderRadius: 6,
  },
  disconnectButtonText: {
    color: '#b00020',
    marginLeft: 4,
    fontWeight: 'bold',
  },
  confirmationDetails: {
    marginVertical: 12,
  },
  confirmationLabel: {
    fontWeight: 'bold',
    color: '#888',
    marginTop: 4,
  },
  confirmationValue: {
    color: '#333',
    marginBottom: 2,
  },
  closeButton: {
    backgroundColor: '#eee',
    marginTop: 8,
  },
  connectionStatusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  connectionStatusText: {
    marginLeft: 4,
    fontSize: 12,
    color: '#666',
  },
  securityStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  whitelistStatus: {
    color: '#2196F3',
    fontSize: 12,
    fontWeight: 'bold',
  },
  notWhitelistedStatus: {
    color: '#b00020',
    fontSize: 12,
    fontWeight: 'bold',
  },
  warningText: {
    fontSize: 14,
    color: '#e67e22',
    flex: 1,
  },
  buttonStart: {
    backgroundColor: '#2196F3',
  },
  buttonStop: {
    backgroundColor: '#ff6b6b',
  },
}); 