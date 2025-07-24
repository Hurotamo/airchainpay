import React, { useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  // Modal, // Removed unused variable
  // ActivityIndicator, // Removed unused variable
} from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedView } from '../../components/ThemedView';
import { ThemedText } from '../../components/ThemedText';
import { WalletEncryption } from '../utils/crypto/WalletEncryption';
import { MultiChainWalletManager } from '../wallet/MultiChainWalletManager';
import { logger } from '../utils/Logger';
import { ethers } from 'ethers';
import { wordlists } from 'ethers/wordlists';
import { PasswordMigration } from '../utils/crypto/PasswordMigration';
import { WalletError, BLEError, TransactionError } from '../utils/ErrorClasses';

export default function WalletImportScreen() {
  const [step, setStep] = useState<'credentials' | 'password'>('credentials');
  const [credentials, setCredentials] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [importType, setImportType] = useState<'seedphrase' | 'privatekey'>('privatekey');
  const router = useRouter();
  // const [loading, setLoading] = useState(false); // Removed unused variable

  const validatePassword = (pass: string): string | null => {
    const validation = PasswordMigration.validatePassword(pass);
    if (!validation.isValid) {
      return validation.feedback[0] || 'Password does not meet security requirements';
    }
    return null;
  };

  const validatePrivateKey = (key: string): string | null => {
    if (!key) return 'Private key cannot be empty';
    
    try {
      // Remove 0x prefix if present
      const cleanKey = key.startsWith('0x') ? key.slice(2) : key;
      
      // Check length
      if (cleanKey.length !== 64) {
        return 'Private key must be 64 characters long (32 bytes)';
      }

      // Check if it's a valid hex string
      if (!/^[0-9a-fA-F]+$/.test(cleanKey)) {
        return 'Private key must contain only hexadecimal characters';
      }

      // Try to create a wallet with the key
      new ethers.Wallet(key);
      return null;
    } catch (error) {
      return 'Invalid private key format';
    }
  };

  const validateSeedPhrase = (phrase: string): string | null => {
    if (!phrase) return 'Seed phrase cannot be empty';
    
    // Clean and split the phrase
    const words = phrase.trim().toLowerCase().split(/\s+/);
    
    // Check word count
    if (words.length !== 12 && words.length !== 24) {
      return 'Seed phrase must be 12 or 24 words';
    }

    // Check each word against BIP39 wordlist
    const invalidWords = words.filter(word => !wordlists.en.getWordIndex(word));
    if (invalidWords.length > 0) {
      return `Invalid word(s) in seed phrase: ${invalidWords.join(', ')}`;
    }

    // Verify checksum
    try {
      ethers.Wallet.fromPhrase(phrase);
    } catch (error) {
      return 'Invalid seed phrase checksum';
    }

    return null;
  };

  const handleImportCredentials = async () => {
    try {
      const trimmedCredentials = credentials.trim();
      
      // Validate based on import type
      const validationError = importType === 'privatekey' 
        ? validatePrivateKey(trimmedCredentials)
        : validateSeedPhrase(trimmedCredentials);

      if (validationError) {
        Alert.alert('Error', validationError);
        return;
      }

      // Move to password creation step
      setStep('password');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('Error validating credentials:', { error: errorMessage, type: importType });
      Alert.alert('Error', `Invalid ${importType === 'seedphrase' ? 'seed phrase' : 'private key'} format`);
    }
  };

  const handleCreatePassword = async () => {
    try {
      // Validate password
      const passwordError = validatePassword(password);
      if (passwordError) {
        Alert.alert('Error', passwordError);
        return;
      }

      if (password !== confirmPassword) {
        Alert.alert('Error', 'Passwords do not match');
        return;
      }

      let trimmedCredentials = credentials.trim();

      // For private keys, clean and validate the format
      if (importType === 'privatekey') {
        // Remove any whitespace and newlines
        trimmedCredentials = trimmedCredentials.replace(/\s+/g, '');
        
        logger.info('Processing private key:', {
          length: trimmedCredentials.length,
          hasPrefix: trimmedCredentials.startsWith('0x')
        });

        // Clean the format
        trimmedCredentials = trimmedCredentials.startsWith('0x') 
          ? trimmedCredentials 
          : `0x${trimmedCredentials}`;

        // Validate the final format
        const cleanKey = trimmedCredentials.slice(2); // Remove 0x for length check
        if (!/^[0-9a-fA-F]{64}$/.test(cleanKey)) {
          const validationError = {
            message: 'Invalid private key format',
            details: {
              length: cleanKey.length,
              expectedLength: 64,
              hasValidChars: /^[0-9a-fA-F]+$/.test(cleanKey)
            }
          };
          
          logger.error('Private key validation failed:', validationError);
          Alert.alert(
            'Error',
            'Invalid private key format. Please ensure your key:\n' +
            '• Is 64 characters long (excluding 0x prefix)\n' +
            '• Contains only valid hexadecimal characters (0-9, a-f, A-F)\n' +
            '• Has no spaces or special characters'
          );
          return;
        }
      }

      // First try to initialize the wallet
      try {
        logger.info(`Initializing wallet with ${importType}...`);
        
        const walletManager = MultiChainWalletManager.getInstance();
        if (importType === 'privatekey') {
          await walletManager.importFromPrivateKey(trimmedCredentials);
        } else {
          await walletManager.importFromSeedPhrase(trimmedCredentials);
        }
        
        logger.info('Wallet initialization successful');
      } catch (error) {
        let errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        const errorDetails = error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : { message: errorMessage };
        logger.error(`Failed to initialize ${importType}:`, { error: errorDetails });
        // Provide more user-friendly error messages
        if (error instanceof WalletError) {
          Alert.alert('Wallet Error', error.message);
        } else if (error instanceof BLEError) {
          Alert.alert('Bluetooth Error', error.message);
        } else if (error instanceof TransactionError) {
          Alert.alert('Transaction Error', error.message);
        } else {
          let userMessage = 'Failed to initialize wallet. ';
          if (errorMessage.includes('Invalid private key')) {
            userMessage += 'Please check that your private key is correct and try again.';
          } else if (errorMessage.includes('network')) {
            userMessage += 'There seems to be a network issue. Please check your connection and try again.';
          } else {
            userMessage += errorMessage;
          }
          Alert.alert('Error', userMessage);
        }
        return;
      }

      // If wallet initialization succeeded, encrypt and store credentials
      try {
        logger.info('Encrypting credentials...');
        await WalletEncryption.encryptCredentials(trimmedCredentials, password, importType);
        logger.info('Credentials encrypted successfully');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        const errorDetails = error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : { message: errorMessage };

        logger.error('Failed to encrypt credentials:', { error: errorDetails });
        Alert.alert(
          'Error',
          'Failed to secure wallet credentials. Please try again with a different password.'
        );
        return;
      }

      // Set backup confirmation for imported wallets
      try {
        await MultiChainWalletManager.getInstance().setBackupConfirmed();
      } catch (error) {
        logger.error('Failed to set backup confirmation:', error);
      }

      Alert.alert(
        'Success',
        'Wallet imported successfully!',
        [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorDetails = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : { message: errorMessage };

      logger.error('Error in wallet import process:', { error: errorDetails });
      Alert.alert(
        'Error',
        'Failed to complete wallet import. Please check your credentials and try again.'
      );
    }
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView style={styles.scrollView}>
          <View style={styles.content}>
            {step === 'credentials' ? (
              <>
                <ThemedText style={styles.title}>Import Wallet</ThemedText>
                
                <View style={styles.typeSelector}>
                  <TouchableOpacity
                    style={[
                      styles.typeButton,
                      importType === 'privatekey' && styles.selectedType,
                    ]}
                    onPress={() => setImportType('privatekey')}
                  >
                    <ThemedText style={styles.typeText}>Private Key</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.typeButton,
                      importType === 'seedphrase' && styles.selectedType,
                    ]}
                    onPress={() => setImportType('seedphrase')}
                  >
                    <ThemedText style={styles.typeText}>Seed Phrase</ThemedText>
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={styles.input}
                  placeholder={importType === 'seedphrase' ? 'Enter seed phrase' : 'Enter private key'}
                  value={credentials}
                  onChangeText={setCredentials}
                  multiline={importType === 'seedphrase'}
                  numberOfLines={importType === 'seedphrase' ? 3 : 1}
                  autoCapitalize="none"
                  placeholderTextColor="#666"
                />

                <TouchableOpacity
                  style={styles.button}
                  onPress={handleImportCredentials}
                >
                  <ThemedText style={styles.buttonText}>Continue</ThemedText>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <ThemedText style={styles.title}>Create Password</ThemedText>
                <ThemedText style={styles.subtitle}>
                  Create a strong password to protect your wallet
                </ThemedText>

                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    placeholderTextColor="#666"
                  />

                  <TextInput
                    style={styles.input}
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    placeholderTextColor="#666"
                  />
                </View>

                <View style={styles.requirements}>
                  <ThemedText style={styles.requirementText}>
                    • At least 8 characters{'\n'}
                    • One uppercase letter{'\n'}
                    • One lowercase letter{'\n'}
                    • One number
                  </ThemedText>
                </View>

                <TouchableOpacity
                  style={styles.button}
                  onPress={handleCreatePassword}
                >
                  <ThemedText style={styles.buttonText}>Import Wallet</ThemedText>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 24,
    opacity: 0.7,
  },
  typeSelector: {
    flexDirection: 'row',
    marginBottom: 24,
    gap: 12,
  },
  typeButton: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  selectedType: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  typeText: {
    fontSize: 16,
    fontWeight: '600',
  },
  inputContainer: {
    gap: 16,
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  requirements: {
    backgroundColor: '#f5f5f5',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  requirementText: {
    fontSize: 14,
    lineHeight: 24,
  },
  button: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
}); 