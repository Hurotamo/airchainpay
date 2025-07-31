import React, { useState, useCallback, useEffect } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  StyleSheet, 
  Alert, 
  ActivityIndicator, 
  TouchableOpacity, 
  RefreshControl,
  Platform,
  Modal,
  TextInput,
  KeyboardAvoidingView
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { MultiChainWalletManager } from '../../src/wallet/MultiChainWalletManager';
import { getAllTransactions } from '../../src/services/TxQueue';
import { useSelectedChain } from '../../src/components/ChainSelector';
import { TokenSelector } from '../../src/components/TokenSelector';
import { TokenInfo } from '../../src/types/token';
import { logger } from '../../src/utils/Logger';
import { WalletBackupScreen } from '../../src/components/WalletBackupScreen';
import WalletSetupScreen from '../../src/components/WalletSetupScreen';
import { 
  AnimatedCard, 
  AnimatedGradientCard, 
  AnimatedButton, 
  PulsingDot
} from '../../components/AnimatedComponents';
import { Colors, ChainColors, getChainColor, getBlueBlackGradient } from '../../constants/Colors';
import { useThemeContext } from '../../hooks/useThemeContext';
import { CrossWalletSecurityWarning } from '../../src/components/CrossWalletSecurityWarning';
import { SecurityWarning } from '../../src/services/CrossWalletSecurityService';
import { OfflineTransactionExpiryWarning } from '../../src/components/OfflineTransactionExpiryWarning';
import { ExpiryWarning } from '../../src/services/OfflineTransactionExpiryService';

// Initialize the transaction queue
// initTxQueue();

export default function HomeScreen() {
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string>('0');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [walletExists, setWalletExists] = useState<boolean | null>(null);
  
  // Import modal states
  const [showSeedPhraseModal, setShowSeedPhraseModal] = useState(false);
  const [showPrivateKeyModal, setShowPrivateKeyModal] = useState(false);
  const [seedPhraseInput, setSeedPhraseInput] = useState('');
  const [privateKeyInput, setPrivateKeyInput] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  
  // Wallet backup states
  const [showBackupScreen, setShowBackupScreen] = useState(false);
  const [generatedSeedPhrase, setGeneratedSeedPhrase] = useState('');
  
  const router = useRouter();
  
  // Multi-chain state
  const { selectedChain, changeChain, selectedChainConfig } = useSelectedChain();
  
  // Theme context
  const { colorScheme } = useThemeContext();
  const theme = colorScheme || 'light';
  const colors = Colors[theme];

  const checkWalletStatus = useCallback(async () => {
    try {
      const hasWallet = await MultiChainWalletManager.getInstance().hasWallet();
      setWalletExists(hasWallet);
      return hasWallet;
    } catch (error) {
      logger.error('Failed to check wallet status:', error);
      setWalletExists(false);
      return false;
    }
  }, []);

  const loadWalletData = useCallback(async () => {
    try {
      // Check if wallet exists first
      const hasWallet = await checkWalletStatus();
      
      if (!hasWallet) {
        // No wallet exists, reset state
        setAddress(null);
        setBalance('0');
        return;
      }

      // Use multi-chain wallet manager
      const walletInfo = await MultiChainWalletManager.getInstance().getWalletInfo(selectedChain);
      
      setAddress(walletInfo.address);
      // Format address for display
      const formattedAddress = `${walletInfo.address.substring(0, 6)}...${walletInfo.address.substring(walletInfo.address.length - 4)}`;
      setAddress(formattedAddress);
      setBalance(walletInfo.balance);
    } catch (error) {
      logger.error('Failed to load wallet:', error);
      // Reset state on error
      setAddress(null);
      setBalance('0');
    } finally {
      setLoading(false);
    }
  }, [selectedChain, checkWalletStatus]);

  const loadRecentTransactions = useCallback(async () => {
    try {
      const txs = await getAllTransactions();
      // Sort by timestamp (newest first) and take only the 5 most recent
      const sortedTxs = txs
        .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
        .slice(0, 5);
      setRecentTransactions(sortedTxs);
    } catch (error) {
      logger.error('Failed to load recent transactions:', error);
    }
  }, []);

  // Load wallet and refresh data when screen is focused or chain changes
  useFocusEffect(
    useCallback(() => {
      loadWalletData();
      loadRecentTransactions();
    }, [loadWalletData, loadRecentTransactions])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadWalletData();
    await loadRecentTransactions();
    setRefreshing(false);
  }, [loadWalletData, loadRecentTransactions]);

  const handleCreateWallet = async () => {
    setLoading(true);
    try {
      // Generate seed phrase and create wallet
      const seedPhrase = await MultiChainWalletManager.getInstance().generateSeedPhrase();
      setGeneratedSeedPhrase(seedPhrase);
      setShowBackupScreen(true);
    } catch (error) {
      logger.error('Failed to create wallet:', error);
      Alert.alert('Create Wallet Error', String(error));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSet = async (password: string) => {
    try {
      await MultiChainWalletManager.getInstance().setWalletPassword(password);
    } catch (error) {
      logger.error('Failed to set password:', error);
      throw error;
    }
  };

  const handleBackupConfirmed = async () => {
    try {
      await MultiChainWalletManager.getInstance().confirmBackup();
      setShowBackupScreen(false);
      setGeneratedSeedPhrase('');
      
      // Load wallet data to show the new wallet
      await loadWalletData();
      
      Alert.alert(
        'Wallet Created Successfully!', 
        'Your wallet is now ready to use. Your seed phrase has been backed up securely.'
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorDetails = error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : { message: String(error) };
      
      logger.error('Failed to confirm backup:', errorMessage, errorDetails);
      
      // Provide more specific error messages
      let userFriendlyMessage = errorMessage;
      if (errorMessage.includes('No seed phrase found in temporary storage')) {
        userFriendlyMessage = 'Wallet setup incomplete. Please try creating the wallet again.';
      } else if (errorMessage.includes('Failed to set item')) {
        userFriendlyMessage = 'Failed to save wallet data. Please check your device storage and try again.';
      }
      
      Alert.alert('Backup Error', userFriendlyMessage);
    }
  };

  const handleCancelBackup = () => {
    Alert.alert(
      'Cancel Wallet Creation',
      'Are you sure you want to cancel? Your wallet will not be created.',
      [
        { text: 'Continue Setup', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: async () => {
            // Clean up temporary seed phrase if user cancels
            try {
              await MultiChainWalletManager.getInstance().clearTemporarySeedPhrase();
            } catch (error) {
              logger.error('Failed to clean up temporary seed phrase after cancel:', error);
            }
            setShowBackupScreen(false);
            setGeneratedSeedPhrase('');
          }
        }
      ]
    );
  };

  const handleWalletCreated = () => {
    checkWalletStatus();
    loadWalletData();
  };

  // Handle token selection
  const handleTokenSelect = (token: TokenInfo) => {
    setSelectedToken(token);
    // Update balance if available
    if (token.balance) {
      setBalance(token.balance);
    }
  };

  // Format transaction for display
  const formatTx = (tx: string) => {
    if (!tx) return '';
    if (tx.length <= 16) return tx;
    return `${tx.substring(0, 8)}...${tx.substring(tx.length - 8)}`;
  };

  // Get status icon based on transaction status
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <PulsingDot color="#FFB800" size={12} />;
      case 'sent':
        return <Ionicons name="checkmark-circle" size={16} color="#00D4AA" />;
      case 'confirmed':
        return <Ionicons name="shield-checkmark" size={16} color="#00D4AA" />;
      case 'failed':
        return <Ionicons name="close-circle" size={16} color="#FF4757" />;
      default:
        return <Ionicons name="help-circle" size={16} color="#64748B" />;
    }
  };

  // Navigate to send payment screen
  const goToSendPayment = () => {
    router.push('/send-payment' as any);
  };

  // Navigate to receive payment screen
  const goToReceivePayment = () => {
    router.push('/receive-payment' as any);
  };

  // Navigate to BLE payment screen
  const goToBlePayment = () => {
    router.push('/(tabs)/ble-payment');
  };

  // Navigate to QR Pay screen
  const goToQRPay = () => {
    router.push('/qr-pay');
  };

  // Handle import seed phrase
  const handleImportSeedPhrase = () => {
    setSeedPhraseInput('');
    setShowSeedPhraseModal(true);
  };

  const processSeedPhraseImport = async () => {
    if (!seedPhraseInput?.trim()) {
      Alert.alert('Invalid Input', 'Please enter a valid seed phrase');
      return;
    }

    setImportLoading(true);
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
                    await MultiChainWalletManager.getInstance().importFromSeedPhrase(seedPhraseInput.trim());
                    setShowSeedPhraseModal(false);
                    setSeedPhraseInput('');
                    Alert.alert(
                      'Wallet Imported Successfully', 
                      'Your wallet has been imported from the seed phrase and is ready to use.',
                      [
                        {
                          text: 'OK',
                          onPress: () => {
                            loadWalletData();
                          }
                        }
                      ]
                    );
                  } catch (clearError) {
                    logger.error('Failed to clear and import seed phrase:', clearError);
                    Alert.alert('Import Error', String(clearError));
                  }
                }
              }
            ]
          );
          return;
        }
      }

      await MultiChainWalletManager.getInstance().importFromSeedPhrase(seedPhraseInput.trim());
      
      setShowSeedPhraseModal(false);
      setSeedPhraseInput('');
      
      Alert.alert(
        'Wallet Imported Successfully', 
        'Your wallet has been imported from the seed phrase and is ready to use.',
        [
          {
            text: 'OK',
            onPress: () => {
              loadWalletData();
            }
          }
        ]
      );
    } catch (error) {
      logger.error('Failed to import seed phrase:', error);
      
      // Provide more specific error messages
      let userFriendlyMessage = String(error);
      if (userFriendlyMessage.includes('does not match the existing')) {
        userFriendlyMessage = 'The seed phrase conflicts with an existing wallet. Please clear the wallet first or use a different seed phrase.';
      } else if (userFriendlyMessage.includes('Invalid mnemonic')) {
        userFriendlyMessage = 'Invalid seed phrase. Please check the 12 or 24 words and try again.';
      }
      
      Alert.alert('Import Error', userFriendlyMessage);
    } finally {
      setImportLoading(false);
    }
  };

  // Handle import private key
  const handleImportPrivateKey = () => {
    setPrivateKeyInput('');
    setShowPrivateKeyModal(true);
  };

  const processPrivateKeyImport = async () => {
    if (!privateKeyInput?.trim()) {
      Alert.alert('Invalid Input', 'Please enter a valid private key');
      return;
    }

    setImportLoading(true);
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
                    await MultiChainWalletManager.getInstance().importFromPrivateKey(privateKeyInput.trim());
                    setShowPrivateKeyModal(false);
                    setPrivateKeyInput('');
                    Alert.alert(
                      'Wallet Imported Successfully', 
                      'Your wallet has been imported from the private key and is ready to use.',
                      [
                        {
                          text: 'OK',
                          onPress: () => {
                            loadWalletData();
                          }
                        }
                      ]
                    );
                  } catch (clearError) {
                    logger.error('Failed to clear and import private key:', clearError);
                    Alert.alert('Import Error', String(clearError));
                  }
                }
              }
            ]
          );
          return;
        }
      }

      await MultiChainWalletManager.getInstance().importFromPrivateKey(privateKeyInput.trim());
      
      setShowPrivateKeyModal(false);
      setPrivateKeyInput('');
      
      Alert.alert(
        'Wallet Imported Successfully', 
        'Your wallet has been imported from the private key and is ready to use.',
        [
          {
            text: 'OK',
            onPress: () => {
              loadWalletData();
            }
          }
        ]
      );
    } catch (error) {
      logger.error('Failed to import private key:', error);
      
      // Provide more specific error messages
      let userFriendlyMessage = String(error);
      if (userFriendlyMessage.includes('does not match the existing')) {
        userFriendlyMessage = 'The private key conflicts with an existing wallet. Please clear the wallet first or use a different private key.';
      } else if (userFriendlyMessage.includes('invalid private key')) {
        userFriendlyMessage = 'Invalid private key. Please check the format and try again.';
      }
      
      Alert.alert('Import Error', userFriendlyMessage);
    } finally {
      setImportLoading(false);
    }
  };

  // Get chain display info
  const getChainDisplayInfo = () => {
    switch (selectedChain) {
      case 'core_testnet':
        return { name: 'Core Testnet', symbol: 'CORE', icon: 'diamond' };
      case 'base_sepolia':
        return { name: 'Base Sepolia', symbol: 'ETH', icon: 'logo-bitcoin' };
      default:
        return { name: 'Base Sepolia', symbol: 'ETH', icon: 'logo-bitcoin' };
    }
  };

  const chainInfo = getChainDisplayInfo();
  const chainColor = getChainColor(selectedChain);

  const handleWarningDismiss = (warning: SecurityWarning) => {
    logger.info('[HomeScreen] User dismissed security warning:', warning);
    // Could implement analytics or user preference tracking here
  };

  const handleExpiryWarningDismiss = (warning: ExpiryWarning) => {
    logger.info('[HomeScreen] User dismissed expiry warning:', warning);
    // Could implement analytics or user preference tracking here
  };

  if (loading && !address) {
    return (
      <LinearGradient
        colors={getBlueBlackGradient('primary') as any}
        style={styles.loadingContainer}
      >
        <ActivityIndicator size="large" color="white" />
        <Text style={styles.loadingText}>Loading AirChainPay...</Text>
      </LinearGradient>
    );
  }

  // Show wallet setup screen if no wallet exists
  if (!loading && walletExists === false) {
    return (
      <WalletSetupScreen
        onWalletCreated={handleWalletCreated}
        title="Welcome to AirChainPay"
        subtitle="Create or import a wallet to get started"
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Cross-Wallet Security Warnings */}
        <CrossWalletSecurityWarning
          chainId={selectedChain}
          onWarningDismiss={handleWarningDismiss}
        />

        {/* Offline Transaction Expiry Warnings */}
        <OfflineTransactionExpiryWarning
          onWarningDismiss={handleExpiryWarningDismiss}
        />

        {!address ? (
          <AnimatedCard delay={200} style={styles.welcomeCard}>
            <View style={styles.welcomeContent}>
              <Text style={[styles.welcomeTitle, { color: colors.text }]}>
                Welcome to AirChainPay
              </Text>
              <Text style={[styles.welcomeSubtitle, { color: colors.icon }]}>
                Your multi-chain payment solution
              </Text>
              
              {/* Primary Action - Create Wallet */}
              <AnimatedButton
                title="Create New Wallet"
                onPress={handleCreateWallet}
                chainId={selectedChain}
                icon="add-circle"
                style={{ marginTop: 20, marginBottom: 16 }}
              />
              
              {/* Secondary Actions - Import Options */}
              <View style={styles.importOptionsContainer}>
                <Text style={[styles.importOptionsTitle, { color: colors.text }]}>
                  Or import existing wallet:
                </Text>
                
                <View style={styles.importButtonsRow}>
                  <TouchableOpacity
                    style={[styles.importButton, { borderColor: chainColor }]}
                    onPress={handleImportSeedPhrase}
                  >
                    <Ionicons name="key" size={18} color={chainColor} />
                    <Text style={[styles.importButtonText, { color: chainColor }]}>
                      Seed Phrase
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.importButton, { borderColor: chainColor }]}
                    onPress={handleImportPrivateKey}
                  >
                    <Ionicons name="shield" size={18} color={chainColor} />
                    <Text style={[styles.importButtonText, { color: chainColor }]}>
                      Private Key
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </AnimatedCard>
        ) : (
          <>
            {/* Token Selector */}
            <AnimatedCard delay={50} style={styles.tokenSelectorCard}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 12 }]}>
                Select Token
              </Text>
              <TokenSelector
                selectedChain={selectedChain}
                selectedToken={selectedToken}
                onTokenSelect={handleTokenSelect}
                showBalance={true}
              />
            </AnimatedCard>

            {/* Network Info Card */}
            <AnimatedCard delay={75} style={styles.networkInfoCard}>
              <View style={styles.networkInfoContent}>
                <Ionicons name="information-circle" size={20} color={getChainColor(selectedChain)} />
                <View style={styles.networkInfoText}>
                  <Text style={[styles.networkInfoTitle, { color: colors.text }]}>
                    Multi-Chain Tokens Available
                  </Text>
                  <Text style={[styles.networkInfoSubtitle, { color: colors.icon }]}>
                    Currently on {selectedChainConfig.name}. 
                  </Text>
                  <View style={styles.networkSelectorHint}>
                    <Ionicons name="arrow-up" size={16} color={getChainColor(selectedChain)} />
                    <Text style={[styles.networkSelectorHintText, { color: getChainColor(selectedChain) }]}>
                      Tap the network selector above to switch networks
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.networkInfoActions}>
                <View style={styles.availableNetworks}>
                  <Text style={[styles.availableNetworksTitle, { color: colors.text }]}>
                    Available Networks (Tap to Switch):
                  </Text>
                  <View style={styles.networkChipsContainer}>
                    <TouchableOpacity 
                      style={[styles.networkChip, { backgroundColor: getChainColor('core_testnet') + '20', borderColor: getChainColor('core_testnet') }]}
                      onPress={() => changeChain('core_testnet')}
                    >
                      <Text style={[styles.networkChipText, { color: getChainColor('core_testnet') }]}>
                        Core Testnet {selectedChain === 'core_testnet' ? '✓' : ''}
                      </Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={[styles.networkChip, { backgroundColor: getChainColor('base_sepolia') + '20', borderColor: getChainColor('base_sepolia') }]}
                      onPress={() => changeChain('base_sepolia')}
                    >
                      <Text style={[styles.networkChipText, { color: getChainColor('base_sepolia') }]}>
                        Base Sepolia {selectedChain === 'base_sepolia' ? '✓' : ''}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </AnimatedCard>

            {/* Balance Card */}
            <AnimatedGradientCard 
              chainId="base_sepolia"
              delay={100}
              style={styles.balanceCard}
            >
              <View style={styles.balanceContent}>
                <View style={styles.balanceHeader}>
                  <View style={styles.balanceInfo}>
                    <Text style={styles.balanceLabel}>Total Balance</Text>
                    <PulsingDot color="rgba(255,255,255,0.8)" size={8} />
                  </View>
                </View>
                <Text style={styles.balanceAmount}>
                  {parseFloat(balance).toFixed(4)} {selectedToken?.symbol || chainInfo.symbol}
                </Text>
                <Text style={styles.balanceUSD}>
                  ≈ $0.00 USD
                </Text>
                <View style={styles.addressContainer}>
                  <Text style={styles.addressLabel}>Wallet Address</Text>
                  <Text style={styles.addressText}>{address}</Text>
                </View>
              </View>
            </AnimatedGradientCard>

            {/* Action Buttons */}
            <AnimatedCard delay={200} style={styles.actionsCard}>
              <View style={styles.actionsGrid}>
                <TouchableOpacity 
                  style={[styles.actionButton, styles.sendButton]}
                  onPress={goToSendPayment}
                  activeOpacity={0.8}
                >
                  <View style={[styles.actionIcon, styles.sendIcon]}>
                    <Ionicons name="arrow-up" size={28} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.actionText, styles.sendText]}>Send</Text>
                  <Text style={[styles.actionSubtext, styles.sendSubtext]}>Transfer funds</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.actionButton, styles.receiveButton]}
                  onPress={goToReceivePayment}
                  activeOpacity={0.8}
                >
                  <View style={[styles.actionIcon, styles.receiveIcon]}>
                    <Ionicons name="arrow-down" size={28} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.actionText, styles.receiveText]}>Receive</Text>
                  <Text style={[styles.actionSubtext, styles.receiveSubtext]}>Get paid</Text>
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity 
                style={[styles.actionButton, styles.bleButton]}
                onPress={goToBlePayment}
                activeOpacity={0.8}
              >
                <View style={[styles.actionIcon, styles.bleIcon]}>
                  <Ionicons name="bluetooth" size={28} color="#FFFFFF" />
                </View>
                <View style={styles.bleButtonContent}>
                  <Text style={[styles.actionText, styles.bleText]}>BLE Pay</Text>
                  <Text style={[styles.actionSubtext, styles.bleSubtext]}>Offline payments via Bluetooth</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.actionButton, styles.qrButton]}
                onPress={goToQRPay}
                activeOpacity={0.8}
              >
                <View style={[styles.actionIcon, styles.qrIcon]}>
                  <Ionicons name="qr-code-outline" size={28} color="#FFFFFF" />
                </View>
                <View style={styles.bleButtonContent}>
                  <Text style={[styles.actionText, styles.bleText]}>QR Pay</Text>
                  <Text style={[styles.actionSubtext, styles.bleSubtext]}>Scan to pay</Text>
                </View>
              </TouchableOpacity>
            </AnimatedCard>

            {/* Recent Transactions */}
            {recentTransactions.length > 0 && (
              <AnimatedCard delay={300} style={styles.transactionsCard}>
                <View style={styles.transactionsHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Recent Transactions
                  </Text>
                  <TouchableOpacity onPress={() => router.push('/(tabs)/tx-history')}>
                    <Text style={[styles.viewAllText, { color: ChainColors.base.primary }]}>
                      View All
                    </Text>
                  </TouchableOpacity>
                </View>
                
                {recentTransactions.map((tx, index) => (
                  <View 
                    key={tx.id || index} 
                    style={[styles.transactionItem, { borderBottomColor: colors.border }]}
                  >
                    <View style={styles.transactionLeft}>
                      {getStatusIcon(tx.status)}
                      <View style={styles.transactionDetails}>
                        <Text style={[styles.transactionHash, { color: colors.text }]}>
                          {formatTx(tx.hash)}
                        </Text>
                        <Text style={[styles.transactionStatus, { color: colors.icon }]}>
                          {tx.status} • {tx.amount} {selectedToken?.symbol || chainInfo.symbol}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.transactionTime, { color: colors.icon }]}>
                      {new Date(tx.timestamp).toLocaleDateString()}
                    </Text>
                  </View>
                ))}
              </AnimatedCard>
            )}
          </>
        )}
      </ScrollView>

      {/* Seed Phrase Import Modal */}
      <Modal
        visible={showSeedPhraseModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSeedPhraseModal(false)}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContainer}>
            <LinearGradient
              colors={getBlueBlackGradient('primary') as any}
              style={styles.modalGradient}
            >
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Import Seed Phrase</Text>
                <Text style={styles.modalSubtitle}>
                  Enter your 12 or 24 word seed phrase
                </Text>
                
                <TextInput
                  style={styles.modalInput}
                  placeholder="Enter seed phrase..."
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={seedPhraseInput}
                  onChangeText={setSeedPhraseInput}
                  multiline
                  numberOfLines={4}
                  secureTextEntry={false}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonSecondary]}
                    onPress={() => setShowSeedPhraseModal(false)}
                    disabled={importLoading}
                  >
                    <Text style={styles.modalButtonTextSecondary}>Cancel</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonPrimary]}
                    onPress={processSeedPhraseImport}
                    disabled={importLoading}
                  >
                    {importLoading ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text style={styles.modalButtonTextPrimary}>Import</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </LinearGradient>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Private Key Import Modal */}
      <Modal
        visible={showPrivateKeyModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPrivateKeyModal(false)}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContainer}>
            <LinearGradient
              colors={getBlueBlackGradient('primary') as any}
              style={styles.modalGradient}
            >
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Import Private Key</Text>
                <Text style={styles.modalSubtitle}>
                  Enter your private key (with or without 0x prefix)
                </Text>
                
                <TextInput
                  style={styles.modalInput}
                  placeholder="Enter private key..."
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={privateKeyInput}
                  onChangeText={setPrivateKeyInput}
                  secureTextEntry={true}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonSecondary]}
                    onPress={() => setShowPrivateKeyModal(false)}
                    disabled={importLoading}
                  >
                    <Text style={styles.modalButtonTextSecondary}>Cancel</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonPrimary]}
                    onPress={processPrivateKeyImport}
                    disabled={importLoading}
                  >
                    {importLoading ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text style={styles.modalButtonTextPrimary}>Import</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </LinearGradient>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Wallet Backup Screen */}
      <Modal
        visible={showBackupScreen}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <WalletBackupScreen
          seedPhrase={generatedSeedPhrase}
          onPasswordSet={handlePasswordSet}
          onBackupConfirmed={handleBackupConfirmed}
          onCancel={handleCancelBackup}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 100,
  },
  tokenSelectorCard: {
    margin: 16,
    padding: 16,
  },
  welcomeCard: {
    margin: 16,
    padding: 24,
  },
  welcomeContent: {
    alignItems: 'center',
  },
  welcomeLogoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  welcomeLogo: {
    width: 60,
    height: 60,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  balanceCard: {
    margin: 16,
    padding: 20,
  },
  balanceContent: {
    alignItems: 'center',
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  balanceLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  balanceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginRight: 8,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  balanceUSD: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 16,
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 8,
    borderRadius: 8,
  },
  addressLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginRight: 8,
  },
  addressText: {
    fontSize: 14,
    color: 'white',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  actionsCard: {
    margin: 16,
    padding: 16,
  },
  actionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 1,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 8,
    alignItems: 'center',
  },
  sendButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  receiveButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  bleButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  qrButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  sendIcon: {
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  receiveIcon: {
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  bleIcon: {
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  qrIcon: {
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  bleButtonContent: {
    alignItems: 'center',
  },
  bleText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'rgba(0, 122, 255, 1)',
  },
  bleSubtext: {
    fontSize: 12,
    color: 'rgba(0, 122, 255, 0.6)',
  },
  actionText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  sendText: {
    color: 'rgba(0, 122, 255, 1)',
  },
  receiveText: {
    color: 'rgba(0, 122, 255, 1)',
  },
  actionSubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  sendSubtext: {
    color: 'rgba(0, 122, 255, 0.6)',
  },
  receiveSubtext: {
    color: 'rgba(0, 122, 255, 0.6)',
  },
  transactionsCard: {
    margin: 16,
    padding: 16,
  },
  transactionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  viewAllText: {
    fontSize: 14,
    color: 'rgba(0, 122, 255, 1)',
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transactionDetails: {
    marginLeft: 16,
  },
  transactionHash: {
    fontSize: 14,
    color: 'white',
  },
  transactionStatus: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  transactionTime: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalInput: {
    width: '100%',
    height: 120,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    color: 'white',
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalButton: {
    padding: 16,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 8,
  },
  modalButtonPrimary: {
    backgroundColor: 'rgba(0, 122, 255, 1)',
  },
  modalButtonSecondary: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  modalButtonTextPrimary: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  modalButtonTextSecondary: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
  },
  networkInfoCard: {
    margin: 16,
    padding: 20,
  },
  networkInfoContent: {
    alignItems: 'center',
  },
  networkInfoText: {
    alignItems: 'center',
    marginBottom: 16,
  },
  networkInfoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  networkInfoSubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  networkSelectorHint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  networkSelectorHintText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  networkInfoActions: {
    alignItems: 'center',
  },
  availableNetworks: {
    alignItems: 'center',
  },
  availableNetworksTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  networkChipsContainer: {
    flexDirection: 'row',
  },
  networkChip: {
    padding: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 8,
  },
  networkChipText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: 'white',
    marginTop: 16,
  },
  importOptionsContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  importOptionsTitle: {
    fontSize: 16,
    marginBottom: 12,
  },
  importButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    minWidth: 120,
    justifyContent: 'center',
  },
  importButtonText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
});
