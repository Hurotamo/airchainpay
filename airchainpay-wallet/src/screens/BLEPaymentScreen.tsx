
import * as React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  StyleSheet, 
  Alert, 
  TouchableOpacity, 
  RefreshControl,
  FlatList,
  TextInput
} from 'react-native';
import { logger } from '../utils/Logger';
import { Ionicons } from '@expo/vector-icons';

import { BLEPaymentService, BLEPaymentDevice, BLEPaymentStatus } from '../services/BLEPaymentService';
import { getChainColor } from '../constants/Colors';
import { useSelectedChain } from '../components/ChainSelector';
import * as Clipboard from 'expo-clipboard';
import { useThemeContext } from '../../hooks/useThemeContext';

// Helper to get chain key for color
function chainKey(selectedChain: any): string {
  if (!selectedChain) return 'core_testnet';
  if (typeof selectedChain === 'string') return selectedChain;
  if (selectedChain.key) return selectedChain.key;
  if (selectedChain.id) return selectedChain.id;
  if (selectedChain.name) return selectedChain.name.toLowerCase().replace(/\s/g, '_');
  return 'core_testnet';
}

export default function BLEPaymentScreen() {
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<BLEPaymentDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<BLEPaymentDevice | null>(null);
  const [bleStatus, setBleStatus] = useState<BLEPaymentStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'advertising' | 'scanning' | 'devices'>('advertising');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Advertising states
  const [isAdvertising, setIsAdvertising] = useState(false);
  const [advertisingStatus, setAdvertisingStatus] = useState('Not advertising');
  const [advertisingError, setAdvertisingError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState('PYUSDT');

  // BLE Service
  const bleService = BLEPaymentService.getInstance();
  const { selectedChain } = useSelectedChain();
  const { colorScheme } = useThemeContext();
  const theme = colorScheme === 'dark' ? { 
    background: '#000', 
    text: '#fff', 
    placeholder: '#666',
    border: '#333'
  } : { 
    background: '#fff', 
    text: '#000', 
    placeholder: '#999',
    border: '#ddd'
  };

  // Initialize BLE service
  useEffect(() => {
    const initializeBLE = async () => {
      try {
        // Check BLE support
        const support = await bleService.checkBLESupport();
        if (!support.supported) {
          setErrorBanner(`BLE not supported: ${support.error || 'Unknown error'}`);
          return;
        }

        // Request permissions if needed
        if (!support.permissions) {
          const permissionResult = await bleService.requestPermissions();
          if (!permissionResult.success) {
            setErrorBanner(`Permission denied: ${permissionResult.error}`);
            return;
          }
        }

        // Enable logging
        bleService.setLoggingEnabled(true);
        
        logger.info('[BLE] BLE service initialized successfully');
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        setErrorBanner(`BLE initialization failed: ${errorMsg}`);
        logger.error('[BLE] Initialization error:', error);
      }
    };

    initializeBLE();
  }, []);

  // Update status periodically
  useEffect(() => {
    const updateStatus = () => {
      const status = bleService.getStatus();
      setBleStatus(status);
      setIsAdvertising(status.isAdvertising);
      setDevices(status.discoveredDevices);
      setScanning(status.isScanning);
      
      if (status.lastError) {
        setErrorBanner(status.lastError);
      } else {
        setErrorBanner(null);
      }
    };

    const interval = setInterval(updateStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  // Handle device found during scanning
  const handleDeviceFound = useCallback((device: BLEPaymentDevice) => {
    setDevices(prev => {
      // Check if device already exists
      const exists = prev.find(d => d.device.id === device.device.id);
      if (exists) {
        // Update existing device
        return prev.map(d => d.device.id === device.device.id ? device : d);
      } else {
        // Add new device
        return [...prev, device];
      }
    });
  }, []);

  // Start advertising
  const handleStartAdvertising = async () => {
    if (!walletAddress.trim()) {
      setAdvertisingError('Please enter a wallet address');
      return;
    }

    try {
      setAdvertisingStatus('Starting advertising...');
      setAdvertisingError(null);
      
      const result = await bleService.startAdvertising(
        walletAddress.trim(),
        paymentAmount || undefined,
        selectedToken,
        selectedChain || 'Core Testnet',
        { autoStopMs: 60000, logActivity: true }
      );
      
      if (result.success) {
        setAdvertisingStatus('Advertising wallet address and payment intent');
        logger.info('[BLE] Started advertising wallet address');
      } else {
        setAdvertisingError(result.error || 'Failed to start advertising');
        setAdvertisingStatus('Advertising failed');
      }
    } catch (error: any) {
      const errorMsg = error?.message || 'Failed to start advertising';
      setAdvertisingError(errorMsg);
      setAdvertisingStatus('Advertising failed');
      logger.error('[BLE] Advertising error:', error);
    }
  };

  // Stop advertising
  const handleStopAdvertising = async () => {
    try {
      setAdvertisingStatus('Stopping advertising...');
      
      const result = await bleService.stopAdvertising();
      
      if (result.success) {
        setAdvertisingStatus('Not advertising');
        setIsAdvertising(false);
        logger.info('[BLE] Stopped advertising');
      } else {
        setAdvertisingError(result.error || 'Failed to stop advertising');
      }
    } catch (error: any) {
      const errorMsg = error?.message || 'Failed to stop advertising';
      setAdvertisingError(errorMsg);
      logger.error('[BLE] Stop advertising error:', error);
    }
  };

  // Start scanning
  const handleStartScanning = async () => {
    try {
      setScanning(true);
      setDevices([]);
      
      const result = await bleService.startScanning(
        { scanTimeoutMs: 30000, logActivity: true },
        handleDeviceFound
      );
      
      if (!result.success) {
        setErrorBanner(result.error || 'Failed to start scanning');
      } else {
        logger.info('[BLE] Started scanning for payment devices');
      }
    } catch (error: any) {
      const errorMsg = error?.message || 'Failed to start scanning';
      setErrorBanner(errorMsg);
      logger.error('[BLE] Scanning error:', error);
    }
  };

  // Stop scanning
  const handleStopScanning = async () => {
    try {
      const result = await bleService.stopScanning();
      
      if (result.success) {
        setScanning(false);
        logger.info('[BLE] Stopped scanning');
      } else {
        setErrorBanner(result.error || 'Failed to stop scanning');
      }
    } catch (error: any) {
      const errorMsg = error?.message || 'Failed to stop scanning';
      setErrorBanner(errorMsg);
      logger.error('[BLE] Stop scanning error:', error);
    }
  };

  // Handle device selection
  const handleDeviceSelect = (device: BLEPaymentDevice) => {
    setSelectedDevice(device);
    setActiveTab('devices');
  };

  // Handle payment to selected device
  const handlePaymentToDevice = async (device: BLEPaymentDevice) => {
    try {
      Alert.alert(
        'Send Payment',
        `Send payment to ${device.payload.walletAddress}?\nAmount: ${device.payload.amount || 'Any amount'}\nToken: ${device.payload.token}`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Send', 
            onPress: () => {
              // Here you would implement the actual payment logic
              logger.info('[BLE] Payment initiated to device:', device);
              Alert.alert('Success', 'Payment sent successfully!');
            }
          }
        ]
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setErrorBanner(`Payment failed: ${errorMsg}`);
      logger.error('[BLE] Payment error:', error);
    }
  };

  // Handle error
  const handleError = (msg: string, error?: any) => {
    setErrorBanner(msg);
    if (error) {
      logger.error('[BLE] Error:', error);
    }
  };

  // Copy wallet address to clipboard
  const copyWalletAddress = async (address: string) => {
    try {
      await Clipboard.setStringAsync(address);
      Alert.alert('Copied', 'Wallet address copied to clipboard');
    } catch (error) {
      logger.error('[BLE] Copy to clipboard failed:', error);
    }
  };

  // Render advertising section
  const renderAdvertisingSection = () => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>
        Broadcast Payment Intent
      </Text>
      
      <View style={styles.inputContainer}>
        <Text style={[styles.label, { color: theme.text }]}>Wallet Address</Text>
        <TextInput
          style={[styles.input, { 
            backgroundColor: theme.background, 
            color: theme.text,
            borderColor: theme.border 
          }]}
          value={walletAddress}
          onChangeText={setWalletAddress}
          placeholder="Enter wallet address to broadcast"
          placeholderTextColor={theme.placeholder}
        />
      </View>

      <View style={styles.inputContainer}>
        <Text style={[styles.label, { color: theme.text }]}>Amount (Optional)</Text>
        <TextInput
          style={[styles.input, { 
            backgroundColor: theme.background, 
            color: theme.text,
            borderColor: theme.border 
          }]}
          value={paymentAmount}
          onChangeText={setPaymentAmount}
          placeholder="Enter amount to request"
          placeholderTextColor={theme.placeholder}
          keyboardType="numeric"
        />
      </View>

      <View style={styles.inputContainer}>
        <Text style={[styles.label, { color: theme.text }]}>Token</Text>
        <View style={[styles.tokenSelector, { borderColor: theme.border }]}>
          {['PYUSDT', 'USDT', 'ETH'].map(token => (
            <TouchableOpacity
              key={token}
              style={[
                styles.tokenOption,
                                 selectedToken === token && { backgroundColor: getChainColor(chainKey(selectedChain)) }
              ]}
              onPress={() => setSelectedToken(token)}
            >
              <Text style={[
                styles.tokenText,
                { color: selectedToken === token ? 'white' : theme.text }
              ]}>
                {token}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.buttonContainer}>
        {!isAdvertising ? (
          <TouchableOpacity
                         style={[styles.button, { backgroundColor: getChainColor(chainKey(selectedChain)) }]}
             onPress={handleStartAdvertising}
             disabled={!walletAddress.trim()}
          >
            <Ionicons name="radio-outline" size={20} color="white" />
            <Text style={styles.buttonText}>Start Broadcasting</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.button, { backgroundColor: '#ff6b6b' }]}
            onPress={handleStopAdvertising}
          >
            <Ionicons name="stop-outline" size={20} color="white" />
            <Text style={styles.buttonText}>Stop Broadcasting</Text>
          </TouchableOpacity>
        )}
      </View>

      {advertisingError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{advertisingError}</Text>
        </View>
      )}

      <View style={styles.statusContainer}>
        <View style={[styles.statusDot, { 
          backgroundColor: isAdvertising ? '#48dbfb' : '#ccc' 
        }]} />
        <Text style={[styles.statusText, { color: theme.text }]}>
          {advertisingStatus}
        </Text>
      </View>
    </View>
  );

  // Render scanning section
  const renderScanningSection = () => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>
        Discover Nearby Wallets
      </Text>
      
      <View style={styles.buttonContainer}>
        {!scanning ? (
          <TouchableOpacity
                         style={[styles.button, { backgroundColor: getChainColor(chainKey(selectedChain)) }]}
             onPress={handleStartScanning}
          >
            <Ionicons name="search-outline" size={20} color="white" />
            <Text style={styles.buttonText}>Start Scanning</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.button, { backgroundColor: '#ff6b6b' }]}
            onPress={handleStopScanning}
          >
            <Ionicons name="stop-outline" size={20} color="white" />
            <Text style={styles.buttonText}>Stop Scanning</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.statusContainer}>
        <View style={[styles.statusDot, { 
          backgroundColor: scanning ? '#48dbfb' : '#ccc' 
        }]} />
        <Text style={[styles.statusText, { color: theme.text }]}>
          {scanning ? 'Scanning for nearby wallets...' : 'Not scanning'}
        </Text>
      </View>
    </View>
  );

  // Render devices section
  const renderDevicesSection = () => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>
        Discovered Wallets ({devices.length})
      </Text>
      
      {devices.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="bluetooth-outline" size={48} color={theme.placeholder} />
          <Text style={[styles.emptyText, { color: theme.placeholder }]}>
            No wallets discovered yet
          </Text>
          <Text style={[styles.emptySubtext, { color: theme.placeholder }]}>
            Start scanning to find nearby AirChainPay wallets
          </Text>
        </View>
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(item) => item.device.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.deviceCard, { 
                backgroundColor: theme.background,
                borderColor: theme.border 
              }]}
              onPress={() => handleDeviceSelect(item)}
            >
              <View style={styles.deviceHeader}>
                                 <Ionicons name="wallet-outline" size={24} color={getChainColor(chainKey(selectedChain))} />
                <View style={styles.deviceInfo}>
                  <Text style={[styles.deviceName, { color: theme.text }]}>
                    {item.device.name || item.device.localName || 'Unknown Device'}
                  </Text>
                  <Text style={[styles.deviceAddress, { color: theme.placeholder }]}>
                    {item.payload.walletAddress.substring(0, 8)}...{item.payload.walletAddress.substring(-8)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => copyWalletAddress(item.payload.walletAddress)}
                  style={styles.copyButton}
                >
                  <Ionicons name="copy-outline" size={16} color={theme.placeholder} />
                </TouchableOpacity>
              </View>
              
              <View style={styles.deviceDetails}>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.placeholder }]}>Amount:</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>
                    {item.payload.amount || 'Any amount'}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.placeholder }]}>Token:</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>
                    {item.payload.token}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.placeholder }]}>Distance:</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>
                    {item.distance ? `${item.distance.toFixed(1)}m` : 'Unknown'}
                  </Text>
                </View>
              </View>
              
              <TouchableOpacity
                                 style={[styles.payButton, { backgroundColor: getChainColor(chainKey(selectedChain)) }]}
                 onPress={() => handlePaymentToDevice(item)}
              >
                <Ionicons name="send-outline" size={16} color="white" />
                <Text style={styles.payButtonText}>Send Payment</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          style={styles.deviceList}
        />
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {errorBanner && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{errorBanner}</Text>
          <TouchableOpacity onPress={() => setErrorBanner(null)}>
            <Ionicons name="close" size={20} color="white" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>BLE Payment</Text>
        <Text style={[styles.subtitle, { color: theme.placeholder }]}>
          Offline peer-to-peer crypto payments
        </Text>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'advertising' && { 
              backgroundColor: getChainColor(chainKey(selectedChain)) 
            }
          ]}
          onPress={() => setActiveTab('advertising')}
        >
          <Ionicons 
            name="radio-outline" 
            size={20} 
            color={activeTab === 'advertising' ? 'white' : theme.text} 
          />
          <Text style={[
            styles.tabText,
            { color: activeTab === 'advertising' ? 'white' : theme.text }
          ]}>
            Broadcast
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'scanning' && { 
              backgroundColor: getChainColor(chainKey(selectedChain)) 
            }
          ]}
          onPress={() => setActiveTab('scanning')}
        >
          <Ionicons 
            name="search-outline" 
            size={20} 
            color={activeTab === 'scanning' ? 'white' : theme.text} 
          />
          <Text style={[
            styles.tabText,
            { color: activeTab === 'scanning' ? 'white' : theme.text }
          ]}>
            Scan
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'devices' && { 
              backgroundColor: getChainColor(chainKey(selectedChain)) 
            }
          ]}
          onPress={() => setActiveTab('devices')}
        >
          <Ionicons 
            name="people-outline" 
            size={20} 
            color={activeTab === 'devices' ? 'white' : theme.text} 
          />
          <Text style={[
            styles.tabText,
            { color: activeTab === 'devices' ? 'white' : theme.text }
          ]}>
            Devices ({devices.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        ref={scrollViewRef}
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              setTimeout(() => setRefreshing(false), 1000);
            }}
          />
        }
      >
        {activeTab === 'advertising' && renderAdvertisingSection()}
        {activeTab === 'scanning' && renderScanningSection()}
        {activeTab === 'devices' && renderDevicesSection()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorBanner: {
    backgroundColor: '#ff6b6b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    paddingHorizontal: 16,
  },
  errorBannerText: {
    color: 'white',
    fontSize: 14,
    flex: 1,
  },
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginHorizontal: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  tokenSelector: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tokenOption: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tokenText: {
    fontSize: 14,
    fontWeight: '600',
  },
  buttonContainer: {
    marginTop: 16,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 12,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  errorContainer: {
    backgroundColor: '#ff6b6b',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  errorText: {
    color: 'white',
    fontSize: 14,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  deviceList: {
    marginTop: 12,
  },
  deviceCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  deviceInfo: {
    flex: 1,
    marginLeft: 12,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  deviceAddress: {
    fontSize: 12,
  },
  copyButton: {
    padding: 4,
  },
  deviceDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 12,
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  payButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
}); 