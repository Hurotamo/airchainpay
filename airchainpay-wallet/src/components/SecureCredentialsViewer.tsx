import React, { useState, useEffect } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Modal,
  Platform,
  Clipboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedView } from '../../components/ThemedView';
import { ThemedText } from '../../components/ThemedText';
import { WalletEncryption } from '../utils/crypto/WalletEncryption';
import { logger } from '../utils/Logger';

interface SecureCredentialsViewerProps {
  isVisible: boolean;
  onClose: () => void;
  type: 'seedphrase' | 'privatekey';
}

export default function SecureCredentialsViewer({
  isVisible,
  onClose,
  type,
}: SecureCredentialsViewerProps) {
  const [password, setPassword] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [credentials, setCredentials] = useState('');
  const [showCredentials, setShowCredentials] = useState(false);
  const [clipboardTimer, setClipboardTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  useEffect(() => {
    return () => {
      // Clear clipboard and timer when component unmounts
      if (clipboardTimer) {
        clearTimeout(clipboardTimer);
      }
      Clipboard.setString('');
    };
  }, [clipboardTimer]);

  const handleClose = () => {
    setPassword('');
    setIsVerified(false);
    setCredentials('');
    setShowCredentials(false);
    setCopiedToClipboard(false);
    if (clipboardTimer) {
      clearTimeout(clipboardTimer);
    }
    Clipboard.setString('');
    onClose();
  };

  const handleVerifyPassword = async () => {
    try {
      const isValid = await WalletEncryption.verifyPassword(password);
      if (!isValid) {
        Alert.alert('Error', 'Invalid password');
        return;
      }

      const creds = await WalletEncryption.retrieveCredentials(password, type);
      setCredentials(creds);
      setIsVerified(true);
      setShowCredentials(false);
    } catch (error) {
      logger.error('Error verifying password:', error);
      Alert.alert('Error', String(error));
    }
  };

  const handleCopyToClipboard = async () => {
    try {
      // Show warning before copying
      Alert.alert(
        'Security Warning',
        'Copying sensitive data to the clipboard can be risky. The clipboard will be cleared after 30 seconds. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Copy',
            style: 'destructive',
            onPress: async () => {
              await Clipboard.setString(credentials);
              setCopiedToClipboard(true);

              // Clear clipboard after 30 seconds
              if (clipboardTimer) {
                clearTimeout(clipboardTimer);
              }
              const timer = setTimeout(() => {
                Clipboard.setString('');
                setCopiedToClipboard(false);
              }, 30000);
              setClipboardTimer(timer);

              Alert.alert(
                'Copied',
                'The data has been copied to your clipboard and will be cleared in 30 seconds'
              );
            },
          },
        ]
      );
    } catch (error) {
      logger.error('Error copying to clipboard:', error);
      Alert.alert('Error', 'Failed to copy to clipboard');
    }
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <ThemedView style={styles.modalContent}>
          <View style={styles.header}>
            <ThemedText style={styles.title}>
              View {type === 'seedphrase' ? 'Seed Phrase' : 'Private Key'}
            </ThemedText>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          {!isVerified ? (
            <View style={styles.passwordContainer}>
              <ThemedText style={styles.subtitle}>
                Enter your password to view your {type === 'seedphrase' ? 'seed phrase' : 'private key'}
              </ThemedText>
              <TextInput
                style={styles.input}
                placeholder="Enter password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholderTextColor="#666"
              />
              <TouchableOpacity
                style={styles.button}
                onPress={handleVerifyPassword}
              >
                <ThemedText style={styles.buttonText}>Verify Password</ThemedText>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.credentialsContainer}>
              <ThemedText style={styles.warningText}>
                Never share this information with anyone. Keep it in a safe place.
              </ThemedText>
              
              <View style={styles.credentialsBox}>
                <TouchableOpacity
                  style={styles.showHideButton}
                  onPress={() => setShowCredentials(!showCredentials)}
                >
                  <Ionicons
                    name={showCredentials ? 'eye-off' : 'eye'}
                    size={24}
                    color="#666"
                  />
                </TouchableOpacity>
                
                <ThemedText style={styles.credentials}>
                  {showCredentials ? credentials : '••••••••••••'}
                </ThemedText>
              </View>

              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    copiedToClipboard && styles.actionButtonDisabled,
                  ]}
                  onPress={handleCopyToClipboard}
                  disabled={copiedToClipboard}
                >
                  <Ionicons
                    name={copiedToClipboard ? 'checkmark' : 'copy'}
                    size={20}
                    color={copiedToClipboard ? '#4CAF50' : '#666'}
                  />
                  <ThemedText style={styles.actionButtonText}>
                    {copiedToClipboard ? 'Copied' : 'Copy to Clipboard'}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 8,
  },
  passwordContainer: {
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  input: {
    width: '100%',
    height: 48,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  credentialsContainer: {
    alignItems: 'center',
  },
  warningText: {
    color: '#f44336',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  credentialsBox: {
    width: '100%',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  showHideButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 8,
    zIndex: 1,
  },
  credentials: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
}); 