import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Device } from 'react-native-ble-plx';
import { BLEPaymentData, BluetoothManager } from '../bluetooth/BluetoothManager';
import { useThemeContext } from '../hooks/useThemeContext';
import { logger } from '../utils/Logger';

interface BLEDeviceScannerProps {
  onDeviceSelect: (device: Device, paymentData?: BLEPaymentData) => void;
  autoScan?: boolean;
  scanTimeout?: number;
  showPaymentButton?: boolean;
}

interface ScannedDevice {
  device: Device;
  paymentData?: BLEPaymentData;
  rssi?: number;
  lastSeen: number;
}

export default function BLEDeviceScanner({
  onDeviceSelect,
  autoScan = false,
  scanTimeout = 30000,
  showPaymentButton = false,
}: BLEDeviceScannerProps) {
  const [devices, setDevices] = useState<ScannedDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<ScannedDevice | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [scanStartTime, setScanStartTime] = useState<number | null>(null);
  const [scanProgress, setScanProgress] = useState(0);

  const { colorScheme } = useThemeContext();
  const theme = colorScheme || 'light';
  const bluetoothManager = BluetoothManager.getInstance();

  // Effects are declared after callbacks

  // Start scanning for devices
  const startScan = useCallback(async () => {
    if (isScanning) return;

    try {
      setScanError(null);
      setIsScanning(true);
      setScanStartTime(Date.now());
      setScanProgress(0);
      setDevices([]);

      const success = await bluetoothManager.startScanning();
      if (!success) {
        throw new Error('Failed to start scanning');
      }

      // Listen for discovered devices
      bluetoothManager.onDeviceDiscovered((device, paymentData) => {
        const newDevice: ScannedDevice = {
          device,
          paymentData,
          rssi: device.rssi || undefined,
          lastSeen: Date.now(),
        };

        setDevices(prev => {
          const existingIndex = prev.findIndex(d => d.device.id === device.id);
          if (existingIndex >= 0) {
            return [
              ...prev.slice(0, existingIndex),
              newDevice,
              ...prev.slice(existingIndex + 1),
            ];
          }
          return [newDevice, ...prev];
        });
      });

      logger.info('[BLE Scanner] Started scanning for devices');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setScanError(`Failed to start scanning: ${errorMessage}`);
      setIsScanning(false);
      setScanStartTime(null);
      logger.error('[BLE Scanner] Start scan error:', error);
    }
  }, [isScanning, bluetoothManager]);

  // Stop scanning
  const stopScan = useCallback(async () => {
    if (!isScanning) return;

    try {
      await bluetoothManager.stopScanning();
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
        onPress={() => handleDeviceSelect(item)}
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
                {item.device.name || item.device.localName || 'Unknown Device'}
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
                {item.paymentData.walletAddress.substring(0, 8)}...{item.paymentData.walletAddress.slice(-6)}
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
            onPress={() => handleDeviceSelect(item)}
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
              {isConnecting && isSelected ? 'Connecting...' : hasPaymentData ? 'Pay Now' : 'Connect'}
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // Render empty state
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons 
        name="bluetooth-outline" 
        size={64} 
        color={theme === 'dark' ? '#6b7280' : '#9ca3af'} 
      />
      <Text style={[styles.emptyStateTitle, { color: theme === 'dark' ? '#d1d5db' : '#374151' }]}>
        No Devices Found
      </Text>
      <Text style={[styles.emptyStateDescription, { color: theme === 'dark' ? '#9ca3af' : '#6b7280' }]}>
        {isScanning 
          ? 'Scanning for nearby devices...' 
          : 'Start scanning to discover payment devices'
        }
      </Text>
      
      {!isScanning && (
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

      <View style={styles.deviceListContainer}>
        {devices.length > 0 ? (
          <FlatList
            data={devices}
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
            {devices.length} device{devices.length !== 1 ? 's' : ''} found
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
});
