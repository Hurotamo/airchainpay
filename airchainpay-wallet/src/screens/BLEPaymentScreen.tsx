import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { logger } from '../utils/Logger';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../../hooks/useThemeContext';
import { BLEPaymentService } from '../services/BLEPaymentService';
import { BLETransport } from '../services/transports/BLETransport';
import { BLEPaymentData, SupportedToken, SUPPORTED_TOKENS } from '../bluetooth/BluetoothManager';
import { SUPPORTED_CHAINS } from '../constants/AppConfig';
import { Device } from 'react-native-ble-plx';
import BLEDeviceScanner from '../components/BLEDeviceScanner';

export default function BLEPaymentScreen() {
  const [selectedDevice, setSelectedDevice] = useState<{ device: Device; paymentData?: BLEPaymentData } | null>(null);
  const [activeTab, setActiveTab] = useState<'scan' | 'advertise'>('scan');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
  const [isProcessing, setIsProcessing] = useState(false);

  const blePaymentService = BLEPaymentService.getInstance();
  const bleTransport = React.useMemo(() => new BLETransport(), []);
  const { colorScheme } = useThemeContext();
  const theme = colorScheme || 'light';

  // Initialize BLE
  useEffect(() => {
    const initializeBLE = async () => {
      try {
        const bleAvailable = blePaymentService.isBleAvailable();

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

        logger.info('[BLE Payment] BLE initialized successfully');

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setErrorMessage(`Failed to initialize BLE: ${errorMessage}`);
        logger.error('[BLE Payment] BLE initialization failed:', error);
      }
    };

    initializeBLE();
  }, [blePaymentService]);

  // Handle device selection from scanner
  const handleDeviceSelect = useCallback((device: Device, paymentData?: BLEPaymentData) => {
    setSelectedDevice({ device, paymentData });
    setCurrentStep(1);
    logger.info('[BLE Payment] Device selected:', device.name || device.id);
  }, []);

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
        const msg = result.message || 'Failed to start advertising';
        if (msg.toLowerCase().includes('does not support') && msg.toLowerCase().includes('advertis')) {
          setErrorMessage('Device does not support BLE peripheral advertising');
        } else {
          setErrorMessage(msg);
        }
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

  // Send payment
  const handleSendPayment = async () => {
    if (!selectedDevice) {
      setErrorMessage('No device selected');
      return;
    }

    try {
      setIsProcessing(true);
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
    } finally {
      setIsProcessing(false);
    }
  };

  // Go back to main screen
  const handleBackToMain = useCallback(() => {
    setCurrentStep(0);
    setSelectedDevice(null);
    setStatusText('');
    setErrorMessage(null);
  }, []);

  // Render scan section with enhanced scanner
  const renderScanSection = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name="search" size={24} color={theme === 'dark' ? '#3b82f6' : '#1d4ed8'} />
        <Text style={[styles.sectionTitle, { color: theme === 'dark' ? '#ffffff' : '#111827' }]}>
          Scan for Payment Devices
        </Text>
      </View>
      
      <Text style={[styles.sectionDescription, { color: theme === 'dark' ? '#9ca3af' : '#6b7280' }]}>
        Discover nearby devices that are advertising payment availability
      </Text>
      
      <BLEDeviceScanner
        onDeviceSelect={handleDeviceSelect}
        autoScan={false}
        scanTimeout={30000}
        showPaymentButton={true}
      />
    </View>
  );

  // Render advertise section (polished card UI)
  const renderAdvertiseSection = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name="radio" size={24} color={theme === 'dark' ? '#10b981' : '#059669'} />
        <Text style={[styles.sectionTitle, { color: theme === 'dark' ? '#ffffff' : '#111827' }]}>
          Advertise Payment Availability
        </Text>
      </View>
      
      <Text style={[styles.sectionDescription, { color: theme === 'dark' ? '#9ca3af' : '#6b7280' }]}>
        Make yourself available to receive payments from nearby devices
      </Text>
      
      <View style={[styles.card, { backgroundColor: theme === 'dark' ? '#1a1a1a' : '#ffffff', borderColor: theme === 'dark' ? '#333333' : '#e5e7eb' }]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={[styles.statusBadge, isAdvertising && styles.statusBadgeActive]}>
              <Ionicons 
                name={isAdvertising ? "radio" : "radio-outline"} 
                size={14} 
                color={isAdvertising ? "#ffffff" : "#6b7280"} 
              />
              <Text style={[styles.statusBadgeText, { color: isAdvertising ? "#ffffff" : theme === 'dark' ? '#9ca3af' : '#6b7280' }]}>
                {isAdvertising ? 'Advertising' : 'Idle'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.formContainer}>
          {!advertisingSupported && (
            <View style={styles.warningBanner}>
              <Ionicons name="warning" size={16} color="#f59e0b" />
              <Text style={styles.warningText}>
                Advertising is not supported on this platform. You can still scan and pay as a central device.
              </Text>
            </View>
          )}
          
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme === 'dark' ? '#d1d5db' : '#374151' }]}>
              Wallet Address
            </Text>
            <TextInput
              style={[styles.input, { 
                backgroundColor: theme === 'dark' ? '#262626' : '#f9fafb',
                color: theme === 'dark' ? '#ffffff' : '#111827',
                borderColor: theme === 'dark' ? '#404040' : '#d1d5db',
                borderWidth: 1
              }]}
              placeholder="0x..."
              placeholderTextColor={theme === 'dark' ? '#6b7280' : '#9ca3af'}
              value={paymentForm.walletAddress}
              onChangeText={(text) => setPaymentForm(prev => ({ ...prev, walletAddress: text }))}
              autoCapitalize="none"
            />
            <Text style={[styles.helperText, { color: theme === 'dark' ? '#9ca3af' : '#6b7280' }]}>
              Address that will receive the payment
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme === 'dark' ? '#d1d5db' : '#374151' }]}>
              Amount
            </Text>
            <TextInput
              style={[styles.input, { 
                backgroundColor: theme === 'dark' ? '#262626' : '#f9fafb',
                color: theme === 'dark' ? '#ffffff' : '#111827',
                borderColor: theme === 'dark' ? '#404040' : '#d1d5db',
                borderWidth: 1
              }]}
              placeholder={`0.00 ${paymentForm.token}`}
              placeholderTextColor={theme === 'dark' ? '#6b7280' : '#9ca3af'}
              value={paymentForm.amount}
              onChangeText={(text) => setPaymentForm(prev => ({ ...prev, amount: text }))}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme === 'dark' ? '#d1d5db' : '#374151' }]}>
              Token
            </Text>
            <View style={styles.chipRow}>
              {Object.keys(SUPPORTED_TOKENS).map((token) => (
                <TouchableOpacity
                  key={token}
                  style={[
                    styles.chip, 
                    paymentForm.token === token && styles.chipActive,
                    { borderColor: theme === 'dark' ? '#404040' : '#d1d5db' }
                  ]}
                  onPress={() => setPaymentForm(prev => ({ ...prev, token: token as SupportedToken }))}
                >
                  <Text style={[
                    styles.chipText, 
                    paymentForm.token === token && styles.chipTextActive,
                    { color: paymentForm.token === token ? '#ffffff' : theme === 'dark' ? '#d1d5db' : '#374151' }
                  ]}>
                    {token}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.advertisingControls}>
          <TouchableOpacity
            style={[
              styles.primaryButton, 
              isAdvertising ? styles.stopButton : null,
              !advertisingSupported && styles.disabledButton
            ]}
            onPress={isAdvertising ? handleStopAdvertising : handleStartAdvertising}
            disabled={!advertisingSupported}
            activeOpacity={0.8}
          >
            <Ionicons 
              name={isAdvertising ? 'stop-circle' : 'radio'}
              size={20}
              color="#ffffff"
            />
            <Text style={styles.primaryButtonText}>
              {isAdvertising ? 'Stop Advertising' : 'Start Advertising'}
            </Text>
          </TouchableOpacity>
          
          <Text style={[styles.statusText, { color: theme === 'dark' ? '#9ca3af' : '#6b7280' }]}>
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
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="card" size={24} color={theme === 'dark' ? '#10b981' : '#059669'} />
            <Text style={[styles.sectionTitle, { color: theme === 'dark' ? '#ffffff' : '#111827' }]}>
              Confirm Payment
            </Text>
          </View>
          
          <View style={[styles.card, { backgroundColor: theme === 'dark' ? '#1a1a1a' : '#ffffff', borderColor: theme === 'dark' ? '#333333' : '#e5e7eb' }]}>
            <View style={styles.deviceInfo}>
              <View style={styles.deviceHeader}>
                <Ionicons 
                  name="bluetooth" 
                  size={20} 
                  color={theme === 'dark' ? '#3b82f6' : '#1d4ed8'} 
                />
                <Text style={[styles.deviceName, { color: theme === 'dark' ? '#ffffff' : '#111827' }]}>
                  {selectedDevice.device.name || selectedDevice.device.localName || 'Unknown Device'}
                </Text>
              </View>
              <Text style={[styles.deviceId, { color: theme === 'dark' ? '#9ca3af' : '#6b7280' }]}>
                {selectedDevice.device.id}
              </Text>
            </View>
            
            {selectedDevice.paymentData && (
              <View style={styles.paymentDetails}>
                <View style={styles.paymentRow}>
                  <Text style={[styles.paymentLabel, { color: theme === 'dark' ? '#9ca3af' : '#6b7280' }]}>
                    Amount:
                  </Text>
                  <Text style={[styles.paymentValue, { color: theme === 'dark' ? '#10b981' : '#059669' }]}>
                    {selectedDevice.paymentData.amount} {selectedDevice.paymentData.token}
                  </Text>
                </View>
                
                <View style={styles.paymentRow}>
                  <Text style={[styles.paymentLabel, { color: theme === 'dark' ? '#9ca3af' : '#6b7280' }]}>
                    To Wallet:
                  </Text>
                  <Text style={[styles.paymentValue, { color: theme === 'dark' ? '#ffffff' : '#111827' }]}>
                    {selectedDevice.paymentData.walletAddress.substring(0, 8)}...{selectedDevice.paymentData.walletAddress.substring(-6)}
                  </Text>
                </View>
                
                {selectedDevice.paymentData.chainId && (
                  <View style={styles.paymentRow}>
                    <Text style={[styles.paymentLabel, { color: theme === 'dark' ? '#9ca3af' : '#6b7280' }]}>
                      Network:
                    </Text>
                    <Text style={[styles.paymentValue, { color: theme === 'dark' ? '#ffffff' : '#111827' }]}>
                      {selectedDevice.paymentData.chainId}
                    </Text>
                  </View>
                )}
              </View>
            )}
            
            <View style={styles.confirmationActions}>
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: theme === 'dark' ? '#404040' : '#d1d5db' }]}
                onPress={handleBackToMain}
                activeOpacity={0.8}
              >
                <Ionicons name="arrow-back" size={16} color={theme === 'dark' ? '#d1d5db' : '#6b7280'} />
                <Text style={[styles.secondaryButtonText, { color: theme === 'dark' ? '#d1d5db' : '#6b7280' }]}>
                  Back
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.confirmButton, isProcessing && styles.processingButton]}
                onPress={handleSendPayment}
                disabled={isProcessing}
                activeOpacity={0.8}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Ionicons name="checkmark-circle" size={16} color="#ffffff" />
                )}
                <Text style={styles.confirmButtonText}>
                  {isProcessing ? 'Processing...' : 'Send Payment'}
                </Text>
              </TouchableOpacity>
            </View>
            
            {!!statusText && (
              <Text style={[styles.statusText, { color: theme === 'dark' ? '#9ca3af' : '#6b7280', marginTop: 16, textAlign: 'center' }]}>
                {statusText}
              </Text>
            )}
          </View>
        </View>
      </ScrollView>
    );
  };

  // Render receipt
  const renderReceipt = () => {
    if (!lastReceipt) return null;

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="checkmark-circle" size={24} color={theme === 'dark' ? '#10b981' : '#059669'} />
            <Text style={[styles.sectionTitle, { color: theme === 'dark' ? '#ffffff' : '#111827' }]}>
              Payment Complete
            </Text>
          </View>
          
          <View style={[styles.card, { backgroundColor: theme === 'dark' ? '#1a1a1a' : '#ffffff', borderColor: theme === 'dark' ? '#333333' : '#e5e7eb' }]}>
            <View style={styles.receiptContainer}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark-circle" size={64} color="#10b981" />
              </View>
              
              <Text style={[styles.receiptTitle, { color: theme === 'dark' ? '#ffffff' : '#111827' }]}>
                Payment Sent Successfully
              </Text>
              
              <View style={styles.receiptDetails}>
                <View style={styles.receiptRow}>
                  <Text style={[styles.receiptLabel, { color: theme === 'dark' ? '#9ca3af' : '#6b7280' }]}>
                    Transaction Hash:
                  </Text>
                  <Text style={[styles.receiptValue, { color: theme === 'dark' ? '#ffffff' : '#111827' }]} selectable>
                    {lastReceipt.hash}
                  </Text>
                </View>
                
                {lastReceipt.chainId && SUPPORTED_CHAINS[lastReceipt.chainId] ? (
                  <TouchableOpacity
                    onPress={() => {
                      const base = SUPPORTED_CHAINS[lastReceipt.chainId!].blockExplorer;
                      const url = `${base}/tx/${lastReceipt.hash}`;
                      logger.info('[BLE Payment] Open explorer', { url });
                    }}
                    style={styles.explorerLink}
                  >
                    <Ionicons name="open-outline" size={16} color="#3b82f6" />
                    <Text style={styles.explorerLinkText}>View on Explorer</Text>
                  </TouchableOpacity>
                ) : null}
                
                <View style={styles.receiptRow}>
                  <Text style={[styles.receiptLabel, { color: theme === 'dark' ? '#9ca3af' : '#6b7280' }]}>
                    Amount:
                  </Text>
                  <Text style={[styles.receiptValue, { color: theme === 'dark' ? '#10b981' : '#059669' }]}>
                    {lastReceipt.amount} {lastReceipt.token}
                  </Text>
                </View>
                
                <View style={styles.receiptRow}>
                  <Text style={[styles.receiptLabel, { color: theme === 'dark' ? '#9ca3af' : '#6b7280' }]}>
                    Device:
                  </Text>
                  <Text style={[styles.receiptValue, { color: theme === 'dark' ? '#ffffff' : '#111827' }]}>
                    {lastReceipt.device?.name || 'Unknown Device'}
                  </Text>
                </View>
              </View>
            </View>
            
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleBackToMain}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle" size={20} color="#ffffff" />
              <Text style={styles.primaryButtonText}>New Payment</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  };

  // Render main content
  const renderMainContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
            <View style={styles.tabContainer}>
              <View style={styles.tabHeader}>
                <TouchableOpacity
                  style={[styles.tab, activeTab === 'scan' && styles.activeTab]}
                  onPress={() => setActiveTab('scan')}
                  activeOpacity={0.8}
                >
                  <Ionicons 
                    name="search" 
                    size={20} 
                    color={activeTab === 'scan' ? '#3b82f6' : theme === 'dark' ? '#9ca3af' : '#6b7280'} 
                  />
                  <Text style={[styles.tabText, activeTab === 'scan' && styles.activeTabText]}>
                    Scan
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tab, activeTab === 'advertise' && styles.activeTab]}
                  onPress={() => setActiveTab('advertise')}
                  activeOpacity={0.8}
                >
                  <Ionicons 
                    name="radio" 
                    size={20} 
                    color={activeTab === 'advertise' ? '#10b981' : theme === 'dark' ? '#9ca3af' : '#6b7280'} 
                  />
                  <Text style={[styles.tabText, activeTab === 'advertise' && styles.activeTabText]}>
                    Advertise
                  </Text>
                </TouchableOpacity>
              </View>
              
              {activeTab === 'scan' ? renderScanSection() : renderAdvertiseSection()}
            </View>
          </ScrollView>
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
    <View style={[styles.container, { backgroundColor: theme === 'dark' ? '#000000' : '#ffffff' }]}>
      {errorMessage && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning" size={20} color="#ffffff" />
          <Text style={styles.errorBannerText}>{errorMessage}</Text>
          <TouchableOpacity onPress={() => setErrorMessage(null)}>
            <Ionicons name="close" size={20} color="#ffffff" />
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
  scrollContent: {
    flexGrow: 1,
  },
  errorBanner: {
    backgroundColor: '#ef4444',
    padding: 12,
    margin: 16,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorBannerText: {
    color: '#ffffff',
    flex: 1,
    fontSize: 14,
  },
  section: {
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  sectionDescription: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  tabContainer: {
    flex: 1,
  },
  tabHeader: {
    flexDirection: 'row',
    marginBottom: 24,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 20,
  },
  tab: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
  },
  activeTab: {
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#3b82f6',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    backgroundColor: '#f3f4f6',
  },
  statusBadgeActive: {
    backgroundColor: '#10b981',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  warningBanner: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  warningText: {
    color: '#92400e',
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  formContainer: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  chipActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  advertisingControls: {
    marginTop: 24,
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
    backgroundColor: '#3b82f6',
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  stopButton: {
    backgroundColor: '#ef4444',
  },
  disabledButton: {
    backgroundColor: '#9ca3af',
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  statusText: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
  },
  deviceInfo: {
    marginBottom: 20,
    gap: 8,
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: '600',
  },
  deviceId: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#6b7280',
  },
  paymentDetails: {
    marginBottom: 24,
    gap: 12,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paymentLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  paymentValue: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  confirmationActions: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#10b981',
    gap: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  processingButton: {
    backgroundColor: '#6b7280',
  },
  confirmButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  receiptContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  successIcon: {
    marginBottom: 16,
  },
  receiptTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 24,
    textAlign: 'center',
  },
  receiptDetails: {
    width: '100%',
    gap: 12,
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  receiptLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  receiptValue: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'monospace',
    color: '#111827',
  },
  explorerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    padding: 8,
  },
  explorerLinkText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '500',
  },
}); 