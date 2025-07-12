// BLEPaymentScreen.tsx - React Native Secure BLE Payment UI
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

import { 
  AIRCHAINPAY_SERVICE_UUID,
  AIRCHAINPAY_CHARACTERISTIC_UUID
} from '../bluetooth/BluetoothManager';
import { useBLEManager } from '../hooks/wallet/useBLEManager';
import { TxQueue } from '../services/TxQueue';
import { Transaction } from '../types/transaction';
import { getChainColor } from '../constants/Colors';
import { useSelectedChain } from '../components/ChainSelector';
import { PulsingDot } from '../../components/AnimatedComponents';
import { PaymentService } from '../services/PaymentService';
import { BLESecurity } from '../utils/crypto/BLESecurity';
import { SecureBLETransport } from '../services/transports/SecureBLETransport';
import * as Clipboard from 'expo-clipboard';

const { width } = Dimensions.get('window');

import { Device } from 'react-native-ble-plx';

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

  // 1. Add new state for stepper, transaction form, and transaction hash
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

    // Permissions are always granted now, so skip permission checks

    // Check if advertising is truly supported
    const trulySupported = await bleManager.isAdvertisingTrulySupported();
    if (!trulySupported) {
      setAdvertisingError('BLE advertising is not supported on this device or platform.');
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
      await bleManager.startAdvertising();
      setIsAdvertising(true);
      setAdvertisingStatus('Advertising as AirChainPay device');
      const timestamp = new Date().toISOString();
      const deviceName = bleManager.deviceName || 'unknown';
      logger.info(`User started BLE advertising at ${timestamp} (device: ${deviceName})`);
    } catch (error: any) {
      setAdvertisingError(error.message || 'Failed to start advertising');
      setAdvertisingStatus('Advertising failed');
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
      setAdvertisingError(error.message || 'Failed to stop advertising');
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
    logger.error(msg, error);
    setErrorBanner(msg + (error?.message ? `: ${error.message}` : ''));
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  // Secure device connection with key exchange
  const handleSecureConnectDevice = async (device: Device) => {
    if (!bleManager) {
      handleError('Bluetooth manager not available');
      Alert.alert('Error', 'Bluetooth manager not available');
      return;
    }

    setSelectedDevice(device);
    setConnectionStatus('Initiating secure connection...');
    setSecurityStatus('key_exchange');

    try {
      // Connect to device
      await bleManager.connectToDevice(device);
      setConnectionStatus('Connected, performing key exchange...');

      // Use the public send method which handles key exchange internally
      const paymentRequest = {
        to: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6', // Example address
        amount: '0.001',
        chainId: selectedChain,
        device: device
      };

      const result = await secureBleTransport.send(paymentRequest);
      
      if (result.status === 'key_exchange_required') {
        setSessionId(result.sessionId || null);
        setConnectionStatus('Key exchange in progress...');
        setSecurityStatus('key_exchange');
        
        // Set up listener for key exchange response
      await bleManager.listenForData(
        device.id,
        AIRCHAINPAY_SERVICE_UUID,
        AIRCHAINPAY_CHARACTERISTIC_UUID,
          async (data: string) => {
            try {
              const response = JSON.parse(data);
              if (response.type === 'key_exchange_response') {
                // Handle the response through the transport
                await secureBleTransport.handleIncomingKeyExchange(response, device.id);
                setSecurityStatus('encrypted');
                setConnectionStatus('Secure connection established');
                setDevicePublicKey(response.publicKey);
                setCurrentStep(1); // After successful pairing
              }
            } catch (error) {
              logger.error('[BLE] Error processing key exchange response:', error);
            }
          }
        );
      } else if (result.status === 'sent') {
        setSecurityStatus('encrypted');
        setConnectionStatus('Secure connection established');
        setSessionId(result.sessionId || null);
        setCurrentStep(1); // After successful pairing
      }
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

  // 6. Update confirmSendSecureTx to only allow sending at step 4, and use transactionForm/transactionHash
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
      setConnectionStatus('Sending encrypted payment...');
      const paymentRequest = {
        to: transactionForm.to,
        amount: transactionForm.amount,
        chainId: selectedChain,
        transport: 'secure_ble' as const,
        extraData: { device: selectedDevice },
        token: { symbol: transactionForm.token },
        paymentReference: transactionHash,
      };
      const result = await paymentService.sendPayment(paymentRequest);
      if (result.status === 'sent') {
        setLastReceipt({
          hash: transactionHash,
          device: selectedDevice,
          amount: transactionForm.amount,
          chain: selectedChain,
          timestamp: Date.now(),
          sessionId: sessionId || ''
        });
        setCurrentStep(5); // Go to receipt step
        Alert.alert('Success', 'Encrypted payment sent successfully');
      } else {
        throw new Error(result.message || 'Payment failed');
      }
    } catch (error) {
      handleError('Failed to send encrypted payment', error);
      Alert.alert('Error', 'Failed to send encrypted payment', [
        { text: 'Retry', onPress: confirmSendSecureTx },
        { text: 'Cancel', style: 'cancel' },
      ]);
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
            </View>
            
            {devices.length > 0 ? (
                <FlatList
                  data={devices}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.deviceItem}
                    onPress={() => handleSecureConnectDevice(item)}
                    >
                      <View style={styles.deviceInfo}>
                        <Text style={styles.deviceName}>
                          {item.name || item.localName || 'Unknown Device'}
                        </Text>
                        <Text style={styles.deviceId}>{item.id}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#666" />
                    </TouchableOpacity>
                  )}
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

          <View style={styles.securityInfo}>
            <View style={styles.securityStatus}>
              <View style={[styles.statusDot, { backgroundColor: isAdvertising ? '#48dbfb' : '#ff6b6b' }]} />
              <Text style={styles.securityStatusText}>{advertisingStatus}</Text>
            </View>

            {/* All warnings and errors removed for advertising */}

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  isAdvertising && styles.buttonDisabled
                ]}
                onPress={isAdvertising ? handleStopAdvertising : handleStartAdvertising}
                disabled={isAdvertising}
              >
                {isAdvertising ? (
                  <>
                    <ActivityIndicator color="#fff" size="small" />
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
        </View>
      </View>
    </View>
  );

  return (
    <ScrollView
      ref={scrollViewRef}
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {errorBanner && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorBanner}</Text>
        </View>
      )}

      <View style={styles.header}>
              <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={chainColor} />
              </TouchableOpacity>
        <Text style={[styles.title, { color: chainColor }]}>BLE Payment</Text>
        <View style={styles.headerRight} />
        </View>

      <View style={styles.tabContainer}>
            <TouchableOpacity
          style={[styles.tab, activeTab === 'secure_ble' && styles.activeTab]}
          onPress={() => setActiveTab('secure_ble')}
        >
          <Ionicons 
            name="shield-checkmark" 
            size={20} 
            color={activeTab === 'secure_ble' ? chainColor : '#666'} 
          />
          <Text style={[styles.tabText, activeTab === 'secure_ble' && { color: chainColor }]}>
            Secure Payment
          </Text>
            </TouchableOpacity>
        
            <TouchableOpacity
          style={[styles.tab, activeTab === 'devices' && styles.activeTab]}
          onPress={() => setActiveTab('devices')}
        >
          <Ionicons 
            name="bluetooth" 
            size={20} 
            color={activeTab === 'devices' ? chainColor : '#666'} 
          />
          <Text style={[styles.tabText, activeTab === 'devices' && { color: chainColor }]}>
            Devices
          </Text>
            </TouchableOpacity>

            <TouchableOpacity
          style={[styles.tab, activeTab === 'advertising' && styles.activeTab]}
          onPress={() => setActiveTab('advertising')}
        >
          <Ionicons 
            name="link" 
            size={20} 
            color={activeTab === 'advertising' ? chainColor : '#666'} 
          />
          <Text style={[styles.tabText, activeTab === 'advertising' && { color: chainColor }]}>
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
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  deviceId: {
    fontSize: 12,
    color: '#666',
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
    backgroundColor: '#ff6b6b',
    padding: 12,
    margin: 16,
    borderRadius: 8,
  },
  errorText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: '600',
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
}); 