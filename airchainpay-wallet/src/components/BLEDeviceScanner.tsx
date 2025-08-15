import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Device } from 'react-native-ble-plx';
import { BLEPaymentData, BluetoothManager } from '../bluetooth/BluetoothManager';
import { useThemeContext } from '../hooks/useThemeContext';
import { logger } from '../utils/Logger';

interface BLEDeviceScannerProps {
  onDeviceSelect: (device: Device, paymentData?: BLEPaymentData) => void;
  onPaymentSelect?: (walletAddress: string, token: string, device: Device) => void;
  autoScan?: boolean;
  scanTimeout?: number;
  targetWalletAddress?: string; // Filter devices by specific wallet address
  showWalletFilter?: boolean; // Show wallet address input field
}

interface ScannedDevice {
  device: Device;
  paymentData?: BLEPaymentData;
  rssi?: number;
  lastSeen: number;
}

export default function BLEDeviceScanner({
  onDeviceSelect,
  onPaymentSelect,
  autoScan = false,
  scanTimeout = 30000,
  targetWalletAddress,
  showWalletFilter = false,
}: BLEDeviceScannerProps) {
  const [devices, setDevices] = useState<ScannedDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<ScannedDevice | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [scanStartTime, setScanStartTime] = useState<number | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [walletFilter, setWalletFilter] = useState<string>(targetWalletAddress || '');
  const [filteredDevices, setFilteredDevices] = useState<ScannedDevice[]>([]);

  const { colorScheme } = useThemeContext();
  const theme = colorScheme || 'light';
  const bluetoothManager = BluetoothManager.getInstance();
  const discoverySubscriptionRef = useRef<{ remove: () => void } | null>(null);

  // Filter devices by wallet address
  const filterDevicesByWallet = useCallback((deviceList: ScannedDevice[], filterAddress: string): ScannedDevice[] => {
    logger.info('[BLE Scanner] 🔍 Filtering devices by wallet:', {
      totalDevices: deviceList.length,
      filterAddress: filterAddress,
      deviceWallets: deviceList.map(d => ({
        deviceId: d.device.id,
        deviceName: d.device.name || d.device.localName || 'Unknown',
        walletAddress: d.paymentData?.walletAddress || 'No wallet data',
      })),
    });
    
    if (!filterAddress.trim()) {
      return deviceList;
    }
    
    const normalizedFilter = filterAddress.toLowerCase().trim();
    const filtered = deviceList.filter(device => {
      if (!device.paymentData?.walletAddress) {
        logger.info('[BLE Scanner] 🎯 Device filter check (no wallet):', {
          deviceId: device.device.id,
          deviceName: device.device.name || device.device.localName || 'Unknown',
          hasPaymentData: !!device.paymentData,
          matches: false,
        });
        return false;
      }
      const matches = device.paymentData.walletAddress.toLowerCase().includes(normalizedFilter);
      logger.info('[BLE Scanner] 🎯 Device filter check:', {
        deviceId: device.device.id,
        deviceName: device.device.name || device.device.localName || 'Unknown',
        deviceWallet: device.paymentData.walletAddress,
        filterAddress: filterAddress,
        matches,
      });
      return matches;
    });
    
    logger.info('[BLE Scanner] ✅ Filter results:', {
      totalDevices: deviceList.length,
      filteredDevices: filtered.length,
      filterAddress: filterAddress,
    });
    
    return filtered;
  }, []);

  // Update filtered devices when devices or wallet filter changes
  useEffect(() => {
    const filtered = filterDevicesByWallet(devices, walletFilter);
    setFilteredDevices(filtered);
  }, [devices, walletFilter, filterDevicesByWallet]);

  // Effects are declared after callbacks

  // Start scanning for devices
  const startScan = useCallback(async () => {
    if (isScanning) return;

    try {
      logger.info('[BLE Scanner] 🚀 Starting BLE scan process');
      
      // Quick pre-check to avoid native start errors
      logger.info('[BLE Scanner] 📡 Checking BLE availability...');
      const isBleAvailable = bluetoothManager.isBleAvailable();
      const isBluetoothEnabled = await bluetoothManager.isBluetoothEnabled();
      logger.info('[BLE Scanner] 📡 Pre-check results:', { isBleAvailable, isBluetoothEnabled });
      
      if (!isBleAvailable || !isBluetoothEnabled) {
        setScanError('Bluetooth is off or unavailable');
        return;
      }

      // Ensure permissions on Android; surface friendly error
      logger.info('[BLE Scanner] 🔐 Requesting BLE permissions...');
      try {
        const ok = await bluetoothManager.requestAllPermissions();
        logger.info('[BLE Scanner] 🔐 Permission request result:', { ok });
        if (!ok) {
          setScanError('Bluetooth permissions are required');
          return;
        }
      } catch {}

      setScanError(null);
      setIsScanning(true);
      setScanStartTime(Date.now());
      setScanProgress(0);
      setDevices([]);
      logger.info('[BLE Scanner] 🔄 Scan state initialized, clearing device list');

      // Remove any stale listener before starting again
      try { discoverySubscriptionRef.current?.remove?.(); } catch {}
      discoverySubscriptionRef.current = null;

      logger.info('[BLE Scanner] 🔍 Initiating BLE device scan...');
      const success = await bluetoothManager.startScanning();
      logger.info('[BLE Scanner] 🔍 Scan initiation result:', { success });
      if (!success) {
        throw new Error('Failed to start scanning');
      }
      logger.info('[BLE Scanner] ✅ BLE scan started successfully');

      // Listen for discovered devices
      const subscription = bluetoothManager.onDeviceDiscovered((device, paymentData) => {
        logger.info('[BLE Scanner] 🔍 Device discovery callback triggered:', {
          deviceId: device.id,
          deviceName: device.name,
          localName: device.localName,
          hasPaymentData: !!paymentData,
          paymentData: paymentData ? {
            walletAddress: paymentData.walletAddress,
            token: paymentData.token,
            amount: paymentData.amount,
          } : null,
          rssi: device.rssi,
        });

        const newDevice: ScannedDevice = {
          device,
          paymentData,
          rssi: device.rssi || undefined,
          lastSeen: Date.now(),
        };

        logger.info('[BLE Scanner] 📱 Adding device to UI list:', {
          deviceId: device.id,
          deviceName: device.name || device.localName || 'Unknown',
          hasPaymentData: !!paymentData,
        });

        setDevices(prev => {
          const existingIndex = prev.findIndex(d => d.device.id === device.id);
          if (existingIndex >= 0) {
            logger.info('[BLE Scanner] 🔄 Updating existing device in list:', {
              deviceId: device.id,
              existingIndex,
            });
            return [
              ...prev.slice(0, existingIndex),
              newDevice,
              ...prev.slice(existingIndex + 1),
            ];
          }
          logger.info('[BLE Scanner] ➕ Adding new device to list:', {
            deviceId: device.id,
            totalDevicesAfter: prev.length + 1,
          });
          return [newDevice, ...prev];
        });
      });

      discoverySubscriptionRef.current = subscription;

      logger.info('[BLE Scanner] Started scanning for devices');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[BLE Scanner] ❌ Scan start failed:', {
        error: errorMessage,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        scanState: { isScanning, devices: devices.length }
      });
      setScanError(`Failed to start scanning: ${errorMessage}`);
      setIsScanning(false);
      setScanStartTime(null);
    }
  }, [isScanning, bluetoothManager]);

  // Stop scanning
  const stopScan = useCallback(async () => {
    if (!isScanning) return;

    try {
      await bluetoothManager.stopScanning();
      try { discoverySubscriptionRef.current?.remove?.(); } catch {}
      discoverySubscriptionRef.current = null;
      setIsScanning(false);
      setScanStartTime(null);
      setScanProgress(0);
      logger.info('[BLE Scanner] Stopped scanning');
    } catch (error) {
      logger.error('[BLE Scanner] Stop scan error:', error);
    }
  }, [isScanning, bluetoothManager]);

  // Auto-scan effect (placed after callbacks to satisfy linter order)
  useEffect(() => {
    if (autoScan) {
      startScan();
    }
  }, [autoScan, startScan]);

  // Ensure scanning stops and listeners are removed on unmount
  useEffect(() => {
    return () => {
      try {
        bluetoothManager.stopScanning();
      } catch {}
      try { discoverySubscriptionRef.current?.remove?.(); } catch {}
      discoverySubscriptionRef.current = null;
    };
  }, [bluetoothManager]);

  // Scan progress effect
  useEffect(() => {
    if (isScanning && scanStartTime) {
      const interval = setInterval(() => {
        const elapsed = Date.now() - scanStartTime;
        const progress = Math.min((elapsed / scanTimeout) * 100, 100);
        setScanProgress(progress);
        if (progress >= 100) {
          stopScan();
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isScanning, scanStartTime, scanTimeout, stopScan]);

  // Handle device selection
  const handleDeviceSelect = useCallback(async (scannedDevice: ScannedDevice) => {
    if (isConnecting) return;

    try {
      setIsConnecting(true);
      setSelectedDevice(scannedDevice);

      // Attempt to connect to the device
      const connected = await bluetoothManager.connectToDevice(scannedDevice.device);
      
      if (connected) {
        logger.info('[BLE Scanner] Successfully connected to device:', scannedDevice.device.name || scannedDevice.device.id);
        
        // Call the parent callback with device and payment data
        onDeviceSelect(scannedDevice.device, scannedDevice.paymentData);
      } else {
        throw new Error('Failed to connect to device');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Alert.alert(
        'Connection Failed',
        `Failed to connect to ${scannedDevice.device.name || 'device'}: ${errorMessage}`,
        [{ text: 'OK' }]
      );
      logger.error('[BLE Scanner] Device connection error:', error);
    } finally {
      setIsConnecting(false);
      setSelectedDevice(null);
    }
  }, [isConnecting, bluetoothManager, onDeviceSelect]);

  // Handle payment selection
  const handlePaymentSelect = useCallback((scannedDevice: ScannedDevice) => {
    if (scannedDevice.paymentData && onPaymentSelect) {
      onPaymentSelect(
        scannedDevice.paymentData.walletAddress,
        scannedDevice.paymentData.token,
        scannedDevice.device
      );
    }
  }, [onPaymentSelect]);

  // Refresh devices list
  const handleRefresh = useCallback(() => {
    if (isScanning) {
      stopScan();
    }
    startScan();
  }, [isScanning, startScan, stopScan]);

  // Get device status indicator
  const getDeviceStatus = (device: ScannedDevice) => {
    const now = Date.now();
    const timeSinceLastSeen = now - device.lastSeen;
    
    if (timeSinceLastSeen < 5000) {
      return { color: '#10b981', text: 'Strong' };
    } else if (timeSinceLastSeen < 15000) {
      return { color: '#f59e0b', text: 'Good' };
    } else {
      return { color: '#ef4444', text: 'Weak' };
    }
  };

  // Render device item
  const renderDeviceItem = ({ item }: { item: ScannedDevice }) => {
    const status = getDeviceStatus(item);
    const isSelected = selectedDevice?.device.id === item.device.id;
    const hasPaymentData = !!item.paymentData;

    return (
      <TouchableOpacity
        style={[
          styles.deviceItem,
          isSelected && styles.deviceItemSelected,
          { 
            backgroundColor: theme === 'dark' ? '#1a1a1a' : '#ffffff',
            borderColor: theme === 'dark' ? '#333333' : '#e5e7eb',
            borderWidth: 1
          }
        ]}
        onPress={() => hasPaymentData ? handlePaymentSelect(item) : handleDeviceSelect(item)}
        disabled={isConnecting}
        activeOpacity={0.8}
      >
        <View style={styles.deviceHeader}>
          <View style={styles.deviceInfo}>
            <View style={styles.deviceNameRow}>
              <Ionicons 
                name="bluetooth" 
                size={20} 
                color={theme === 'dark' ? '#3b82f6' : '#1d4ed8'} 
              />
              <Text style={[styles.deviceName, { color: theme === 'dark' ? '#ffffff' : '#111827' }]}>
                {hasPaymentData ? 
                  `Wallet: ${item.paymentData?.walletAddress}` : 
                  (item.device.name || item.device.localName || 'Unknown Device')
                }
              </Text>
              {hasPaymentData && (
                <View style={styles.paymentBadge}>
                  <Ionicons name="card" size={12} color="#ffffff" />
                  <Text style={styles.paymentBadgeText}>PAY</Text>
                </View>
              )}
            </View>
            
            <Text style={[styles.deviceId, { color: theme === 'dark' ? '#9ca3af' : '#6b7280' }]}>
              {item.device.id}
            </Text>
          </View>
          
          <View style={styles.deviceStatus}>
            <View style={[styles.signalIndicator, { backgroundColor: status.color }]} />
            <Text style={[styles.signalText, { color: status.color }]}>
              {status.text}
            </Text>
          </View>
        </View>

        {item.paymentData && (
          <View style={styles.paymentInfo}>
            <View style={styles.paymentRow}>
              <Text style={[styles.paymentLabel, { color: theme === 'dark' ? '#9ca3af' : '#6b7280' }]}>
                Amount:
              </Text>
              <Text style={[styles.paymentValue, { color: theme === 'dark' ? '#10b981' : '#059669' }]}>
                {item.paymentData.amount} {item.paymentData.token}
              </Text>
            </View>
            
            <View style={styles.paymentRow}>
              <Text style={[styles.paymentLabel, { color: theme === 'dark' ? '#9ca3af' : '#6b7280' }]}>
                Wallet:
              </Text>
              <Text style={[styles.paymentValue, { color: theme === 'dark' ? '#ffffff' : '#111827' }]}>
                {item.paymentData.walletAddress}
              </Text>
            </View>
            
            <View style={styles.paymentRow}>
              <Text style={[styles.paymentLabel, { color: theme === 'dark' ? '#9ca3af' : '#6b7280' }]}>
                Token:
              </Text>
              <Text style={[styles.paymentValue, { color: theme === 'dark' ? '#10b981' : '#059669' }]}>
                {item.paymentData.token}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.deviceActions}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              hasPaymentData ? styles.payButton : styles.connectButton,
              isSelected && styles.actionButtonSelected
            ]}
            onPress={() => hasPaymentData ? handlePaymentSelect(item) : handleDeviceSelect(item)}
            disabled={isConnecting}
            activeOpacity={0.8}
          >
            {isConnecting && isSelected ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Ionicons 
                name={hasPaymentData ? "card" : "bluetooth"} 
                size={16} 
                color="#ffffff" 
              />
            )}
            <Text style={styles.actionButtonText}>
              {isConnecting && isSelected ? 'Connecting...' : hasPaymentData ? `Pay ${item.paymentData?.token}` : 'Connect'}
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // Render empty state
  const renderEmptyState = () => {
    const hasFilter = showWalletFilter && walletFilter.length > 0;
    const hasDevicesButFiltered = hasFilter && devices.length > 0 && filteredDevices.length === 0;
    
    return (
      <View style={styles.emptyState}>
        <Ionicons 
          name={hasDevicesButFiltered ? "funnel-outline" : "bluetooth-outline"} 
          size={64} 
          color={theme === 'dark' ? '#6b7280' : '#9ca3af'} 
        />
        <Text style={[styles.emptyStateTitle, { color: theme === 'dark' ? '#d1d5db' : '#374151' }]}>
          {hasDevicesButFiltered ? 'No Matching Devices' : 'No Devices Found'}
        </Text>
        <Text style={[styles.emptyStateDescription, { color: theme === 'dark' ? '#9ca3af' : '#6b7280' }]}>
          {hasDevicesButFiltered 
            ? `No devices found with wallet address containing "${walletFilter}". Try adjusting your filter or clear it to see all devices.`
            : isScanning 
              ? 'Scanning for nearby devices...' 
              : 'Start scanning to discover payment devices'
          }
        </Text>
        
        {hasDevicesButFiltered ? (
          <TouchableOpacity
            style={styles.startScanButton}
            onPress={() => setWalletFilter('')}
            activeOpacity={0.8}
          >
            <Ionicons name="close-circle" size={20} color="#ffffff" />
            <Text style={styles.startScanButtonText}>Clear Filter</Text>
          </TouchableOpacity>
        ) : !isScanning && (
          <TouchableOpacity
            style={styles.startScanButton}
            onPress={startScan}
            activeOpacity={0.8}
          >
            <Ionicons name="search" size={20} color="#ffffff" />
            <Text style={styles.startScanButtonText}>Start Scanning</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Render wallet address filter
  const renderWalletFilter = () => {
    if (!showWalletFilter) return null;
    
    return (
      <View style={styles.walletFilterContainer}>
        <Text style={[styles.walletFilterLabel, { color: theme === 'dark' ? '#d1d5db' : '#374151' }]}>
          Filter by Wallet Address:
        </Text>
        <View style={styles.walletFilterInputContainer}>
          <Ionicons 
            name="wallet-outline" 
            size={20} 
            color={theme === 'dark' ? '#9ca3af' : '#6b7280'} 
            style={styles.walletFilterIcon}
          />
          <TextInput
            style={[
              styles.walletFilterInput,
              {
                color: theme === 'dark' ? '#ffffff' : '#111827',
                backgroundColor: theme === 'dark' ? '#1f2937' : '#f9fafb',
                borderColor: theme === 'dark' ? '#374151' : '#d1d5db',
              }
            ]}
            value={walletFilter}
            onChangeText={setWalletFilter}
            placeholder="Enter wallet address (0x...)"
            placeholderTextColor={theme === 'dark' ? '#6b7280' : '#9ca3af'}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
          />
          {walletFilter.length > 0 && (
            <TouchableOpacity
              onPress={() => setWalletFilter('')}
              style={styles.clearFilterButton}
            >
              <Ionicons name="close-circle" size={20} color={theme === 'dark' ? '#6b7280' : '#9ca3af'} />
            </TouchableOpacity>
          )}
        </View>
        {walletFilter.length > 0 && (
          <Text style={[styles.filterResultText, { color: theme === 'dark' ? '#9ca3af' : '#6b7280' }]}>
            {filteredDevices.length} of {devices.length} devices match filter
          </Text>
        )}
      </View>
    );
  };

  // Render scan controls
  const renderScanControls = () => (
    <View style={styles.scanControls}>
      <View style={styles.scanStatus}>
        <View style={styles.scanStatusRow}>
          <Ionicons 
            name={isScanning ? "radio" : "radio-outline"} 
            size={20} 
            color={isScanning ? '#10b981' : theme === 'dark' ? '#9ca3af' : '#6b7280'} 
          />
          <Text style={[styles.scanStatusText, { color: theme === 'dark' ? '#d1d5db' : '#374151' }]}>
            {isScanning ? 'Scanning...' : 'Ready to scan'}
          </Text>
        </View>
        
        {isScanning && (
          <View style={styles.scanProgressContainer}>
            <View style={styles.scanProgressBar}>
              <View 
                style={[
                  styles.scanProgressFill, 
                  { width: `${scanProgress}%` }
                ]} 
              />
            </View>
            <Text style={[styles.scanProgressText, { color: theme === 'dark' ? '#9ca3af' : '#6b7280' }]}>
              {Math.round(scanProgress)}%
            </Text>
          </View>
        )}
      </View>

      <View style={styles.scanButtons}>
        {!isScanning ? (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={startScan}
            activeOpacity={0.8}
          >
            <Ionicons name="search" size={20} color="#ffffff" />
            <Text style={styles.primaryButtonText}>Start Scan</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.stopButton}
            onPress={stopScan}
            activeOpacity={0.8}
          >
            <Ionicons name="stop-circle" size={20} color="#ffffff" />
            <Text style={styles.stopButtonText}>Stop Scan</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity
          style={[styles.secondaryButton, { borderColor: theme === 'dark' ? '#404040' : '#d1d5db' }]}
          onPress={handleRefresh}
          disabled={isScanning}
          activeOpacity={0.8}
        >
          <Ionicons name="refresh" size={20} color={theme === 'dark' ? '#d1d5db' : '#6b7280'} />
          <Text style={[styles.secondaryButtonText, { color: theme === 'dark' ? '#d1d5db' : '#6b7280' }]}>
            Refresh
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Get the devices to display (filtered or all)
  const devicesToDisplay = showWalletFilter ? filteredDevices : devices;
  
  logger.info('[BLE Scanner] 📱 UI Render State:', {
    totalDevices: devices.length,
    filteredDevices: filteredDevices.length,
    walletFilter: walletFilter.trim(),
    devicesToDisplay: devicesToDisplay.length,
    isScanning,
    scanError,
    deviceDetails: devicesToDisplay.map(d => ({
      id: d.device.id,
      name: d.device.name || d.device.localName || 'Unknown',
      hasPaymentData: !!d.paymentData,
      walletAddress: d.paymentData?.walletAddress || 'No wallet',
    })),
  });

  return (
    <View style={styles.container}>
      {scanError && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning" size={20} color="#ffffff" />
          <Text style={styles.errorBannerText}>{scanError}</Text>
          <TouchableOpacity onPress={() => setScanError(null)}>
            <Ionicons name="close" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>
      )}

      {renderScanControls()}
      {renderWalletFilter()}

      <View style={styles.deviceListContainer}>
        {devicesToDisplay.length > 0 ? (
          <FlatList
            data={devicesToDisplay}
            renderItem={renderDeviceItem}
            keyExtractor={(item) => item.device.id}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isScanning}
                onRefresh={handleRefresh}
                colors={['#3b82f6']}
                tintColor={theme === 'dark' ? '#3b82f6' : '#1d4ed8'}
              />
            }
            contentContainerStyle={styles.deviceList}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        ) : (
          renderEmptyState()
        )}
      </View>

      {devices.length > 0 && (
        <View style={styles.deviceCount}>
          <Text style={[styles.deviceCountText, { color: theme === 'dark' ? '#9ca3af' : '#6b7280' }]}>
            {showWalletFilter && walletFilter.length > 0 
              ? `${devicesToDisplay.length} of ${devices.length} devices match filter`
              : `${devices.length} device${devices.length !== 1 ? 's' : ''} found`
            }
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorBanner: {
    backgroundColor: '#ef4444',
    padding: 12,
    marginBottom: 16,
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
  scanControls: {
    marginBottom: 20,
    gap: 16,
  },
  scanStatus: {
    gap: 12,
  },
  scanStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanStatusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  scanProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scanProgressBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    overflow: 'hidden',
  },
  scanProgressFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 3,
  },
  scanProgressText: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'right',
  },
  scanButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#3b82f6',
    gap: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  stopButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#ef4444',
    gap: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  stopButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
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
  deviceListContainer: {
    flex: 1,
  },
  deviceList: {
    paddingBottom: 20,
  },
  separator: {
    height: 12,
  },
  deviceItem: {
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  deviceItemSelected: {
    borderColor: '#3b82f6',
    borderWidth: 2,
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  deviceInfo: {
    flex: 1,
    gap: 4,
  },
  deviceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  paymentBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  deviceId: {
    fontSize: 14,
    fontFamily: 'monospace',
  },
  deviceStatus: {
    alignItems: 'center',
    gap: 4,
  },
  signalIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  signalText: {
    fontSize: 12,
    fontWeight: '600',
  },
  paymentInfo: {
    marginBottom: 16,
    gap: 8,
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paymentLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  paymentValue: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  deviceActions: {
    alignItems: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    minWidth: 120,
  },
  connectButton: {
    backgroundColor: '#3b82f6',
  },
  payButton: {
    backgroundColor: '#10b981',
  },
  actionButtonSelected: {
    backgroundColor: '#6b7280',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyStateDescription: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  startScanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#3b82f6',
    gap: 8,
    marginTop: 8,
  },
  startScanButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  deviceCount: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  deviceCountText: {
    fontSize: 14,
    fontWeight: '500',
  },
  walletFilterContainer: {
    marginBottom: 20,
    gap: 12,
  },
  walletFilterLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  walletFilterInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  walletFilterIcon: {
    position: 'absolute',
    left: 12,
    zIndex: 1,
  },
  walletFilterInput: {
    flex: 1,
    paddingLeft: 44,
    paddingRight: 44,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 14,
    fontFamily: 'monospace',
  },
  clearFilterButton: {
    position: 'absolute',
    right: 12,
    zIndex: 1,
  },
  filterResultText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
});
