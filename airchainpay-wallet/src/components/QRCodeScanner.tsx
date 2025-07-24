import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { ThemedView } from './ThemedView';
import { ThemedText } from './ThemedText';
import { logger } from '../utils/Logger';
import { Camera, CameraView } from 'expo-camera';

interface QRCodeScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
}

export function QRCodeScanner({
  onScan,
  onClose,
  title = 'Scan QR Code',
  subtitle = 'Point your camera at a QR code',
}: QRCodeScannerProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (!CameraView) {
          setHasPermission(false);
          return;
        }
        const { status } = await Camera.requestCameraPermissionsAsync();
        setHasPermission(status === 'granted');
      } catch (error) {
        logger.error('Failed to request camera permission:', error);
        setHasPermission(false);
      }
    })();
  }, []);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (!scanned) {
      setScanned(true);
      onScan(data);
    }
  };

  const resetScanner = () => {
    setScanned(false);
  };

  // Check if Camera is available
  if (!CameraView) {
    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={true}
        onRequestClose={onClose}
      >
        <View style={styles.modalOverlay}>
          <ThemedView style={styles.modalContent}>
            <ThemedText style={styles.title}>Camera Not Available</ThemedText>
            <ThemedText style={styles.subtitle}>
              The camera module is not available. Please check your installation or restart the app.
            </ThemedText>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
            >
              <ThemedText style={styles.closeButtonText}>Close</ThemedText>
            </TouchableOpacity>
          </ThemedView>
        </View>
      </Modal>
    );
  }

  if (hasPermission === null) {
    return null;
  }

  if (hasPermission === false) {
    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={true}
        onRequestClose={onClose}
      >
        <View style={styles.modalOverlay}>
          <ThemedView style={styles.modalContent}>
            <ThemedText style={styles.title}>Camera Permission Required</ThemedText>
            <ThemedText style={styles.subtitle}>
              Please grant camera permission to scan QR codes
            </ThemedText>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
            >
              <ThemedText style={styles.closeButtonText}>Close</ThemedText>
            </TouchableOpacity>
          </ThemedView>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={true}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <CameraView
          style={styles.camera}
          facing={'back'}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
        />
        <View style={styles.overlay}>
          <View style={styles.header}>
            <ThemedText style={styles.title}>{title}</ThemedText>
            <ThemedText style={styles.subtitle}>{subtitle}</ThemedText>
          </View>
          <View style={styles.scanArea} />
          <View style={styles.buttonContainer}>
            {scanned && (
              <TouchableOpacity
                style={styles.scanAgainButton}
                onPress={resetScanner}
              >
                <ThemedText style={styles.scanAgainButtonText}>Scan Again</ThemedText>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
            >
              <ThemedText style={styles.closeButtonText}>Cancel</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'space-between',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
    opacity: 0.8,
  },
  scanArea: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: 'white',
    borderRadius: 16,
    alignSelf: 'center',
  },
  buttonContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  closeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 16,
    borderRadius: 8,
    marginTop: 10,
  },
  closeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  scanAgainButton: {
    backgroundColor: 'rgba(0, 255, 0, 0.3)',
    padding: 16,
    borderRadius: 8,
    marginBottom: 10,
  },
  scanAgainButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
}); 