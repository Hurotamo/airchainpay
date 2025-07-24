import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Alert, 
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { MultiChainWalletManager } from '../wallet/MultiChainWalletManager';
import { logger } from '../utils/Logger';
import { AnimatedCard, AnimatedButton } from '../../components/AnimatedComponents';
import { Colors, getChainColor, getChainGradient } from '../../constants/Colors';
import { useThemeContext } from '../../hooks/useThemeContext';
import { useSelectedChain } from '../components/ChainSelector';
import { WalletBackupScreen } from './WalletBackupScreen';
import { WalletError, BLEError, TransactionError } from '../utils/ErrorClasses';

interface WalletSetupScreenProps {
  onWalletCreated?: () => void;
  title?: string;
  subtitle?: string;
}

export default function WalletSetupScreen({ 
  onWalletCreated, 
  title = "Welcome to AirChainPay",
  subtitle = "Offline Wallet"
}: WalletSetupScreenProps) {
  const [loading, setLoading] = useState(false);
  const [showImportSeed, setShowImportSeed] = useState(false);
  const [showImportPrivateKey, setShowImportPrivateKey] = useState(false);
  const [seedPhrase, setSeedPhrase] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupSeedPhrase, setBackupSeedPhrase] = useState('');
  
  // Theme context
  const { colorScheme } = useThemeContext();
  const theme = colorScheme || 'light';
  const colors = Colors[theme];
  
  // Chain context
  const { selectedChain } = useSelectedChain();
  const chainColor = getChainColor(selectedChain);
  const chainGradient = getChainGradient(selectedChain);

  const handleCreateWallet = async () => {
    setLoading(true);
    try {
      console.log('[WalletSetup] Creating wallet for chain:', selectedChain);
      logger.info('Attempting to create wallet. Selected chain:', selectedChain);
      
      // Generate seed phrase first
      const seedPhrase = await MultiChainWalletManager.getInstance().generateSeedPhrase();
      console.log('[WalletSetup] Seed phrase generated, showing backup modal');
      setBackupSeedPhrase(seedPhrase);
      setShowBackupModal(true);
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorDetails = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : { message: String(error) };
      console.error('[WalletSetup] Failed to create wallet:', errorMessage);
      logger.error('Failed to create wallet:', errorMessage, errorDetails);
      if (error instanceof WalletError) {
        Alert.alert('Wallet Error', error.message);
      } else if (error instanceof BLEError) {
        Alert.alert('Bluetooth Error', error.message);
      } else if (error instanceof TransactionError) {
        Alert.alert('Transaction Error', error.message);
      } else if (errorMessage.includes('not supported')) {
        Alert.alert('Create Wallet Error', 'Selected network is not supported. Please choose a different network.');
      } else if (errorMessage.includes('RPC URL')) {
        Alert.alert('Create Wallet Error', 'Network RPC URL is not configured. Please check your app settings or network configuration.');
      } else if (errorMessage.includes('Failed to set item')) {
        Alert.alert('Create Wallet Error', 'Failed to securely store wallet credentials. Please check device permissions.');
      } else if (errorMessage.includes('network') || errorMessage.includes('provider')) {
        Alert.alert('Create Wallet Error', 'Network error: Unable to connect to the blockchain. Please check your internet connection or try again later.');
      } else {
        Alert.alert('Create Wallet Error', errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSet = async (password: string) => {
    try {
      console.log('[WalletSetup] Setting wallet password...');
      await MultiChainWalletManager.getInstance().setWalletPassword(password);
      
      // For imports (both seed phrase and private key), the wallet is already imported
      // and backup is already confirmed, so we just need to set the password
      const isImport = showImportSeed || showImportPrivateKey;
      console.log('[WalletSetup] Is import:', isImport);
      
      // For new wallet creation, we need to confirm the backup to move temp seed phrase to permanent storage
      if (!isImport) {
        console.log('[WalletSetup] Confirming backup for new wallet...');
        await MultiChainWalletManager.getInstance().confirmBackup();
        console.log('[WalletSetup] Backup confirmed successfully');
      }
      
      const message = isImport 
        ? 'Your wallet has been imported and secured with a password.'
        : 'Your wallet has been created and secured with a password. Your seed phrase has been backed up securely.';
      
      console.log('[WalletSetup] Wallet setup complete, showing success alert');
      Alert.alert(
        isImport ? 'Wallet Imported Successfully' : 'Wallet Created Successfully', 
        message,
        [
          {
            text: 'OK',
            onPress: () => {
              console.log('[WalletSetup] User confirmed success, calling onWalletCreated');
              setShowBackupModal(false);
              setBackupSeedPhrase('');
              setSeedPhrase('');
              setPrivateKey('');
              setShowImportSeed(false);
              setShowImportPrivateKey(false);
              onWalletCreated?.();
            }
          }
        ]
      );
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorDetails = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : { message: String(error) };
      console.error('[WalletSetup] Failed to set password or confirm backup:', errorMessage);
      logger.error('Failed to set password or confirm backup:', errorMessage, errorDetails);
      if (error instanceof WalletError) {
        Alert.alert('Wallet Error', error.message);
      } else if (error instanceof BLEError) {
        Alert.alert('Bluetooth Error', error.message);
      } else if (error instanceof TransactionError) {
        Alert.alert('Transaction Error', error.message);
      } else {
        // Provide more specific error messages
        let userFriendlyMessage = errorMessage;
        if (errorMessage.includes('No seed phrase found in temporary storage')) {
          userFriendlyMessage = 'Wallet setup incomplete. Please try creating the wallet again.';
        } else if (errorMessage.includes('Failed to set item')) {
          userFriendlyMessage = 'Failed to save wallet data. Please check your device storage and try again.';
        }
        Alert.alert('Setup Error', userFriendlyMessage);
      }
    }
  };

  const handleBackupConfirmed = () => {
    setShowBackupModal(false);
    setBackupSeedPhrase('');
    setSeedPhrase('');
    setPrivateKey('');
    setShowImportSeed(false);
    setShowImportPrivateKey(false);
    onWalletCreated?.();
  };

  const handleBackupCancel = () => {
    // Clean up temporary seed phrase if user cancels
    MultiChainWalletManager.getInstance().clearTemporarySeedPhrase().catch(error => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorDetails = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : { message: String(error) };
      
      logger.error('Failed to clean up temporary seed phrase after cancel:', errorMessage, errorDetails);
    });
    setShowBackupModal(false);
    setBackupSeedPhrase('');
    setSeedPhrase('');
    setPrivateKey('');
    setShowImportSeed(false);
    setShowImportPrivateKey(false);
  };

  const handleImportSeedPhrase = async () => {
    if (!seedPhrase.trim()) {
      Alert.alert('Invalid Input', 'Please enter a valid seed phrase');
      return;
    }

    setLoading(true);
    try {
      // Check if there's an existing wallet that might conflict
      const hasExistingWallet = await MultiChainWalletManager.getInstance().hasWallet();
      if (hasExistingWallet) {
        const validation = await MultiChainWalletManager.getInstance().validateWalletConsistency();
        if (!validation.isValid) {
          Alert.alert(
            'Wallet Conflict',
            'There is an existing wallet that conflicts with the seed phrase you want to import. Would you like to clear the existing wallet and import the new one?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Clear & Import',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await MultiChainWalletManager.getInstance().clearWallet();
                    await MultiChainWalletManager.getInstance().importFromSeedPhrase(seedPhrase.trim());
                    setBackupSeedPhrase('');
                    setShowBackupModal(true);
                  } catch (clearError) {
                    const clearErrorMessage = clearError instanceof Error ? clearError.message : 'Unknown error occurred';
                    Alert.alert('Import Error', clearErrorMessage);
                  }
                }
              }
            ]
          );
          return;
        }
      }

      await MultiChainWalletManager.getInstance().importFromSeedPhrase(seedPhrase.trim());
      
      // Show password setup screen using modal (same as private key import)
      setBackupSeedPhrase('');
      setShowBackupModal(true);
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorDetails = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : { message: String(error) };
      logger.error('Failed to import seed phrase:', errorMessage, errorDetails);
      if (error instanceof WalletError) {
        Alert.alert('Wallet Error', error.message);
      } else if (error instanceof BLEError) {
        Alert.alert('Bluetooth Error', error.message);
      } else if (error instanceof TransactionError) {
        Alert.alert('Transaction Error', error.message);
      } else {
        // Provide more specific error messages
        let userFriendlyMessage = errorMessage;
        if (errorMessage.includes('does not match the existing')) {
          userFriendlyMessage = 'The seed phrase conflicts with an existing wallet. Please clear the wallet first or use a different seed phrase.';
        } else if (errorMessage.includes('Invalid mnemonic')) {
          userFriendlyMessage = 'Invalid seed phrase. Please check the 12 or 24 words and try again.';
        }
        Alert.alert('Import Error', userFriendlyMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleImportPrivateKey = async () => {
    if (!privateKey.trim()) {
      Alert.alert('Invalid Input', 'Please enter a valid private key');
      return;
    }

    setLoading(true);
    try {
      // Check if there's an existing wallet that might conflict
      const hasExistingWallet = await MultiChainWalletManager.getInstance().hasWallet();
      if (hasExistingWallet) {
        const validation = await MultiChainWalletManager.getInstance().validateWalletConsistency();
        if (!validation.isValid) {
          Alert.alert(
            'Wallet Conflict',
            'There is an existing wallet that conflicts with the private key you want to import. Would you like to clear the existing wallet and import the new one?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Clear & Import',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await MultiChainWalletManager.getInstance().clearWallet();
                    await MultiChainWalletManager.getInstance().importFromPrivateKey(privateKey.trim());
                    setBackupSeedPhrase('');
                    setShowBackupModal(true);
                  } catch (clearError) {
                    const clearErrorMessage = clearError instanceof Error ? clearError.message : 'Unknown error occurred';
                    Alert.alert('Import Error', clearErrorMessage);
                  }
                }
              }
            ]
          );
          return;
        }
      }

      await MultiChainWalletManager.getInstance().importFromPrivateKey(privateKey.trim());
      
      // Show password setup screen using modal (no seed phrase for private key import)
      setBackupSeedPhrase('');
      setShowBackupModal(true);
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorDetails = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : { message: String(error) };
      logger.error('Failed to import private key:', errorMessage, errorDetails);
      if (error instanceof WalletError) {
        Alert.alert('Wallet Error', error.message);
      } else if (error instanceof BLEError) {
        Alert.alert('Bluetooth Error', error.message);
      } else if (error instanceof TransactionError) {
        Alert.alert('Transaction Error', error.message);
      } else {
        // Provide more specific error messages
        let userFriendlyMessage = errorMessage;
        if (errorMessage.includes('does not match the existing')) {
          userFriendlyMessage = 'The private key conflicts with an existing wallet. Please clear the wallet first or use a different private key.';
        } else if (errorMessage.includes('invalid private key')) {
          userFriendlyMessage = 'Invalid private key. Please check the format and try again.';
        }
        Alert.alert('Import Error', userFriendlyMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const resetImportForms = () => {
    setShowImportSeed(false);
    setShowImportPrivateKey(false);
    setSeedPhrase('');
    setPrivateKey('');
  };

  return (
    <LinearGradient
      colors={chainGradient as any}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <KeyboardAvoidingView 
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <AnimatedCard delay={0} style={styles.headerCard}>
            <View style={styles.headerContent}>
              <View style={[styles.iconContainer, { backgroundColor: chainColor + '20' }]}>
                <Ionicons name="wallet" size={32} color={chainColor} />
              </View>
              <Text style={[styles.title, { color: colors.text }]}>
                {title}
              </Text>
              <Text style={[styles.subtitle, { color: colors.icon }]}>
                {subtitle}
              </Text>
              <Text style={[styles.welcomeDescription, { color: colors.icon }]}>
                Experience seamless cross-chain transactions, secure BLE payments, and lightning-fast QR code transfers. Your digital wallet, reimagined for the future of decentralized finance.
              </Text>
              <View style={styles.featureList}>
                <View style={styles.featureItem}>
                  <Ionicons name="flash" size={16} color={chainColor} />
                  <Text style={[styles.featureText, { color: colors.icon }]}>
                    Multi-Chain Support
                  </Text>
                </View>
                <View style={styles.featureItem}>
                  <Ionicons name="bluetooth" size={16} color={chainColor} />
                  <Text style={[styles.featureText, { color: colors.icon }]}>
                    BLE Payments
                  </Text>
                </View>
                <View style={styles.featureItem}>
                  <Ionicons name="qr-code" size={16} color={chainColor} />
                  <Text style={[styles.featureText, { color: colors.icon }]}>
                    QR Code Transfers
                  </Text>
                </View>
                <View style={styles.featureItem}>
                  <Ionicons name="shield-checkmark" size={16} color={chainColor} />
                  <Text style={[styles.featureText, { color: colors.icon }]}>
                    Enterprise Security
                  </Text>
                </View>
              </View>
            </View>
          </AnimatedCard>

          {/* Main Options */}
          {!showImportSeed && !showImportPrivateKey && (
            <>
              <AnimatedCard delay={100} style={styles.optionCard}>
                <AnimatedButton
                  title="Create New Wallet"
                  onPress={handleCreateWallet}
                  chainId={selectedChain}
                  icon="add-circle"
                  loading={loading}
                  style={styles.primaryButton}
                />
                <Text style={[styles.optionDescription, { color: colors.icon }]}>
                  Generate a new wallet with a secure private key and seed phrase backup
                </Text>
              </AnimatedCard>

              <AnimatedCard delay={200} style={styles.optionCard}>
                <TouchableOpacity
                  style={[styles.secondaryButton, { borderColor: chainColor }]}
                  onPress={() => setShowImportSeed(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="key" size={22} color={chainColor} />
                  <Text style={[styles.secondaryButtonText, { color: chainColor }]}>
                    Import Seed Phrase
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.optionDescription, { color: colors.icon }]}>
                  Restore your existing wallet using 12 or 24 word seed phrase
                </Text>
              </AnimatedCard>

              <AnimatedCard delay={300} style={styles.optionCard}>
                <TouchableOpacity
                  style={[styles.secondaryButton, { borderColor: chainColor }]}
                  onPress={() => setShowImportPrivateKey(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="shield" size={22} color={chainColor} />
                  <Text style={[styles.secondaryButtonText, { color: chainColor }]}>
                    Import Private Key
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.optionDescription, { color: colors.icon }]}>
                  Import wallet using private key for advanced users
                </Text>
              </AnimatedCard>
            </>
          )}

          {/* Import Seed Phrase Form */}
          {showImportSeed && (
            <AnimatedCard delay={100} style={styles.importCard}>
              <View style={styles.importHeader}>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={resetImportForms}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-back" size={24} color={chainColor} />
                </TouchableOpacity>
                <Text style={[styles.importTitle, { color: colors.text }]}>
                  Import Seed Phrase
                </Text>
              </View>
              
              <Text style={[styles.importDescription, { color: colors.icon }]}>
                Enter your 12 or 24 word seed phrase separated by spaces. This will restore your existing wallet.
              </Text>
              
              <TextInput
                style={[styles.textInput, { 
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.text
                }]}
                placeholder="Enter your seed phrase here..."
                placeholderTextColor={colors.icon}
                value={seedPhrase}
                onChangeText={setSeedPhrase}
                multiline
                numberOfLines={4}
                secureTextEntry
                textAlignVertical="top"
              />
              
              <AnimatedButton
                title="Import Wallet"
                onPress={handleImportSeedPhrase}
                chainId={selectedChain}
                icon="download"
                loading={loading}
                style={styles.importButton}
              />
            </AnimatedCard>
          )}

          {/* Import Private Key Form */}
          {showImportPrivateKey && (
            <AnimatedCard delay={100} style={styles.importCard}>
              <View style={styles.importHeader}>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={resetImportForms}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-back" size={24} color={chainColor} />
                </TouchableOpacity>
                <Text style={[styles.importTitle, { color: colors.text }]}>
                  Import Private Key
                </Text>
              </View>
              
              <Text style={[styles.importDescription, { color: colors.icon }]}>
                Enter your private key (starts with 0x for EVM chains). Keep your private key secure and never share it.
              </Text>
              
              <TextInput
                style={[styles.textInput, { 
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.text
                }]}
                placeholder="Enter your private key here..."
                placeholderTextColor={colors.icon}
                value={privateKey}
                onChangeText={setPrivateKey}
                secureTextEntry
                textAlignVertical="top"
              />
              
              <AnimatedButton
                title="Import Wallet"
                onPress={handleImportPrivateKey}
                chainId={selectedChain}
                icon="download"
                loading={loading}
                style={styles.importButton}
              />
            </AnimatedCard>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Wallet Backup Modal */}
      <Modal
        visible={showBackupModal}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <WalletBackupScreen
          seedPhrase={backupSeedPhrase}
          onPasswordSet={handlePasswordSet}
          onBackupConfirmed={handleBackupConfirmed}
          onCancel={handleBackupCancel}
        />
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  headerCard: {
    marginBottom: 32,
    padding: 28,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  headerContent: {
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
    opacity: 0.8,
  },
  welcomeDescription: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 16,
    marginBottom: 24,
    opacity: 0.7,
    paddingHorizontal: 8,
  },
  featureList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 16,
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  featureText: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  optionCard: {
    marginBottom: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  primaryButton: {
    marginBottom: 12,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.05)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    letterSpacing: 0.3,
  },
  optionDescription: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 12,
    opacity: 0.7,
    paddingHorizontal: 8,
  },
  importCard: {
    padding: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  importHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  importTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
  },
  importDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
    opacity: 0.7,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 20,
    minHeight: 80,
    textAlignVertical: 'top',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  importButton: {
    marginTop: 8,
  },
}); 