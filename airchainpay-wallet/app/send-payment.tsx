import * as React from 'react';
import { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert, 
  KeyboardAvoidingView, 
  Platform,
  ScrollView
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ethers } from 'ethers';
import { SUPPORTED_CHAINS } from '../src/constants/AppConfig';
import { TokenInfo } from '../src/types/token';
import { TokenSelector } from '../src/components/TokenSelector';
import { QRCodeScanner } from '../src/components/QRCodeScanner';
import { ThemedView } from '../components/ThemedView';
import { logger } from '../src/utils/Logger';
import { Colors, ChainColors, getBlueBlackGradient, getChainColor } from '../constants/Colors';
import { useThemeContext } from '../hooks/useThemeContext';
import { QRCodeSigner, SignedQRPayload } from '../src/utils/crypto/QRCodeSigner';
import { PaymentService, PaymentRequest } from '../src/services/PaymentService';

function isPaymentRequest(obj: unknown): obj is PaymentRequest {
  return (
    typeof obj === 'object' && obj !== null &&
    'to' in obj && typeof (obj as PaymentRequest).to === 'string' &&
    'amount' in obj && typeof (obj as PaymentRequest).amount === 'string' &&
    'chainId' in obj && typeof (obj as PaymentRequest).chainId === 'string' &&
    'transport' in obj && typeof (obj as PaymentRequest).transport === 'string'
  );
}

function isSignedQRPayload(obj: unknown): obj is SignedQRPayload {
  return (
    typeof obj === 'object' && obj !== null &&
    'type' in obj && typeof (obj as SignedQRPayload).type === 'string' &&
    'to' in obj && typeof (obj as SignedQRPayload).to === 'string' &&
    'chainId' in obj && typeof (obj as SignedQRPayload).chainId === 'string' &&
    'signature' in obj && typeof (obj as SignedQRPayload).signature === 'object' &&
    (obj as SignedQRPayload).signature !== null &&
    'version' in (obj as SignedQRPayload).signature &&
    'signer' in (obj as SignedQRPayload).signature &&
    'signature' in (obj as SignedQRPayload).signature &&
    'timestamp' in (obj as SignedQRPayload).signature &&
    'chainId' in (obj as SignedQRPayload).signature &&
    'messageHash' in (obj as SignedQRPayload).signature
  );
}

function buildTokenInfo(obj: any, selectedChain: string): TokenInfo | undefined {
  if (
    obj && typeof obj === 'object' &&
    'address' in obj && typeof obj.address === 'string' &&
    'symbol' in obj && typeof obj.symbol === 'string' &&
    'decimals' in obj && typeof obj.decimals === 'number' &&
    'isNative' in obj && typeof obj.isNative === 'boolean'
  ) {
    return {
      address: obj.address,
      symbol: obj.symbol,
      decimals: obj.decimals,
      isNative: obj.isNative,
      name: obj.name || obj.symbol || '',
      chainId: obj.chainId || selectedChain,
      chainName: obj.chainName || '',
    };
  }
  return undefined;
}

/**
 * Extract and clean address from QR code data
 * @param data - Raw QR code data
 * @param parsed - Parsed JSON object (if available)
 * @returns Clean address string or null if not found
 */
function extractCleanAddress(data: string, parsed?: any): string | null {
  // If we have parsed data with a 'to' field, use it
  if (parsed && parsed.to && typeof parsed.to === 'string') {
    return parsed.to.trim();
  }
  
  // If the raw data looks like an address, use it
  if (data.startsWith('0x') && data.length === 42) {
    return data.trim();
  }
  
  // If the raw data looks like a Bitcoin address
  if ((data.startsWith('bc1') || data.startsWith('1') || data.startsWith('3')) && data.length > 25) {
    return data.trim();
  }
  
  // Try to extract address from payment URI
  if (data.includes('ethereum:')) {
    const addressMatch = data.match(/ethereum:([0-9a-fA-Fx]+)/i);
    if (addressMatch) {
      return addressMatch[1].trim();
    }
  }
  
  // Try to extract address from any JSON-like structure
  try {
    const jsonMatch = data.match(/"to"\s*:\s*"([^"]+)"/);
    if (jsonMatch) {
      return jsonMatch[1].trim();
    }
  } catch {
    // Ignore JSON parsing errors
  }
  
  return null;
}

export default function SendPaymentScreen() {
  // Get URL parameters from QR code scan
  const params = useLocalSearchParams<{
    address?: string;
    amount?: string;
    chainId?: string;
    token?: string;
  }>();

  // Validate and sanitize amount from URL params
  const validateAmount = (amountParam: string | undefined): string => {
    if (!amountParam) return '';
    
    const trimmed = amountParam.trim();
    if (trimmed === '') return '';
    
    // Check if it's a valid number
    const num = parseFloat(trimmed);
    if (isNaN(num) || num <= 0) {
      logger.warn('[SendPayment] Invalid amount in URL params:', { amountParam, parsed: num });
      return '';
    }
    
    return trimmed;
  };

  const [recipient, setRecipient] = useState(params.address || '');
  const [amount, setAmount] = useState(validateAmount(params.amount));
  const [reference, setReference] = useState('');
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [selectedChain, setSelectedChain] = useState(params.chainId || 'base_sepolia');
  const [loading, setLoading] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const router = useRouter();

  const { colorScheme } = useThemeContext();
  const theme = colorScheme || 'light';
  const colors = Colors[theme];

  // Handle token selection based on QR code params
  useEffect(() => {
    if (params.token && params.chainId) {
      const chain = SUPPORTED_CHAINS[params.chainId];
      if (chain) {
        // Find token by symbol
        const tokenObj = {
          symbol: params.token,
          name: params.token === chain.nativeCurrency.symbol ? chain.nativeCurrency.name : params.token,
          address: '0x0000000000000000000000000000000000000000',
          decimals: chain.nativeCurrency.decimals,
          chainId: params.chainId,
          chainName: chain.name,
          isNative: params.token === chain.nativeCurrency.symbol,
        };
        const token = buildTokenInfo(tokenObj, params.chainId);
        if (token) setSelectedToken(token);
      }
    }
  }, [params.token, params.chainId]);



  const handleTokenSelect = (token: TokenInfo) => {
    setSelectedToken(token);
    setSelectedChain(token.chainId);
  };

  const handleQRScan = async (data: string) => {
    setShowQRScanner(false);

    try {
      // When parsing QR data, ensure parsed is always a Record<string, unknown> (never null)
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(data);
      } catch {
        parsed = { address: data };
      }

      // Check if this is a signed QR payload and verify signature
      if (parsed && isSignedQRPayload(parsed)) {
        logger.info('Signed QR payload detected, verifying signature');
        
        const verificationResult = await QRCodeSigner.verifyQRPayload(parsed, true); // Use lenient mode for testing
        
        if (!verificationResult.isValid) {
          Alert.alert(
            'Invalid QR Code',
            `QR code signature verification failed: ${verificationResult.error}`,
            [{ text: 'OK' }]
          );
          return;
        }
        
        logger.info('QR code signature verified successfully', {
          signer: verificationResult.signer,
          chainId: verificationResult.chainId,
          timestamp: verificationResult.timestamp
        });
        
        // Show signature verification success
        Alert.alert(
          'Secure QR Code',
          `QR code verified successfully!\n\nSigner: ${verificationResult.signer}\nChain: ${verificationResult.chainId}`,
          [{ text: 'OK' }]
        );
      } else if (parsed && isPaymentRequest(parsed)) {
        // Allow unsigned QR codes with warning
        logger.info('Unsigned but valid payment request detected');
        Alert.alert(
          'Unverified QR Code',
          'This QR code is not digitally signed but appears to be a valid payment request. Proceed with caution.',
          [
            { text: 'Cancel', onPress: () => setShowQRScanner(true) },
            { 
              text: 'Proceed', 
              onPress: () => {
                const cleanAddress = extractCleanAddress(data, parsed);
                if (cleanAddress) {
                  setRecipient(cleanAddress);
                }
                // Don't auto-set amount - let user enter it manually for security
                if ((parsed as PaymentRequest).chainId) setSelectedChain((parsed as PaymentRequest).chainId);
                Alert.alert('Payment Request Scanned', 'Recipient address has been filled from the QR code. Please enter the amount manually.');
              }
            }
          ]
        );
        return;
      }

      if (isPaymentRequest(parsed)) {
        const cleanAddress = extractCleanAddress(data, parsed);
        if (cleanAddress) {
          setRecipient(cleanAddress);
        }
        // Don't auto-set amount - let user enter it manually for security
        if ((parsed as PaymentRequest).chainId) setSelectedChain((parsed as PaymentRequest).chainId);
        Alert.alert('Payment Request Scanned', 'Recipient address has been filled from the QR code. Please enter the amount manually.');
        return;
      }

      // Check if it's a simple address
      if (data.startsWith('0x') || data.startsWith('bc1') || data.startsWith('1') || data.startsWith('3')) {
        const cleanAddress = extractCleanAddress(data);
        if (cleanAddress) {
          setRecipient(cleanAddress);
          Alert.alert('Address Scanned', 'The recipient address has been filled in from the QR code.');
        }
      } else if (data.includes('ethereum:') || data.includes('bitcoin:')) {
        // Parse payment URI
        const uri = data.toLowerCase();
        if (uri.startsWith('ethereum:')) {
          const cleanAddress = extractCleanAddress(data);
          if (cleanAddress) {
            setRecipient(cleanAddress);
          }
          // Don't auto-set amount - let user enter it manually for security
          Alert.alert('Payment Request Scanned', 'The recipient address has been filled from the QR code. Please enter the amount manually.');
        }
      } else {
        // Generic address - try to extract clean address
        const cleanAddress = extractCleanAddress(data);
        if (cleanAddress) {
          setRecipient(cleanAddress);
          Alert.alert('QR Code Scanned', 'The scanned data has been set as the recipient address.');
        } else {
          Alert.alert('Invalid QR Code', 'The scanned QR code does not contain a valid address.');
        }
      }
    } catch (error) {
      logger.error('[SendPayment] Error processing QR code:', error);
      Alert.alert('Error', 'Failed to process the scanned QR code.');
    }
  };

  const handleSendPayment = async () => {
    // Enhanced validation
    if (!recipient) {
      Alert.alert('Error', 'Recipient address is required');
      return;
    }
    
    if (!amount || amount.trim() === '') {
      Alert.alert('Error', 'Amount is required');
      return;
    }
    
    // Validate amount is a valid number
    const amountNum = parseFloat(amount.trim());
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Error', `Invalid amount: ${amount}. Please enter a valid positive number.`);
      return;
    }
    
    logger.info('[SendPayment] Validating payment request', {
      recipient,
      amount: amount.trim(),
      amountNum,
      selectedToken
    });

    if (!selectedToken) {
      Alert.alert('Error', 'Please select a token to send');
      return;
    }

    // Validate recipient address for EVM chains
    if (!ethers.isAddress(recipient)) {
      Alert.alert('Invalid Address', 'Please enter a valid address for this network');
      return;
    }

    setLoading(true);
    try {
      // Set transport as the string literal 'onchain'
      const transport: 'onchain' = 'onchain';

      // Build payment request with validated amount
      const validatedAmount = amount.trim();
      const paymentRequest: PaymentRequest = {
        to: recipient,
        amount: validatedAmount,
        chainId: selectedToken.chainId,
        transport,
        token: selectedToken,
        paymentReference: reference || undefined,
      };
      
      logger.info('[SendPayment] Sending payment request', {
        to: recipient,
        amount: validatedAmount,
        chainId: selectedToken.chainId,
        tokenSymbol: selectedToken.symbol
      });

      // If you need to sign a transaction, handle it in the PaymentService or elsewhere as needed.

      // Use PaymentService to send
      const paymentService = PaymentService.getInstance();
      const result = await paymentService.sendPayment(paymentRequest);

      if (result && result.status === 'sent') {
        Alert.alert(
          'Payment Sent',
          `Your ${selectedToken.symbol} payment was sent successfully.`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else if (result && result.status === 'queued') {
        Alert.alert(
          'Transaction Queued',
          `Your ${selectedToken.symbol} transaction has been queued for sending.`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        Alert.alert('Error', 'Payment failed.');
      }
    } catch (error) {
      logger.error('Send payment error:', error);
      Alert.alert('Error', String(error));
    } finally {
      setLoading(false);
    }
  };





  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>  
      <Stack.Screen
        options={{
          title: '',
          headerStyle: {
            backgroundColor: 'transparent',
          },
          headerTransparent: true,
          headerBackTitle: 'Back',
          headerTintColor: 'white',
        }}
      />
      {/* Header with logo */}
      <LinearGradient
        colors={getBlueBlackGradient('primary') as any}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Send Payment</Text>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Network Selector (Chip Style) */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ color: colors.text, fontWeight: 'bold', marginBottom: 8, fontSize: 16 }}>
              Multi-Chain Networks
            </Text>
            <Text style={{ color: colors.icon, marginBottom: 16, fontSize: 12 }}>
              Tap to switch between supported networks
            </Text>
            <View style={{ flexDirection: 'column', gap: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                <TouchableOpacity
                  style={[
                    styles.networkChip,
                    { 
                      backgroundColor: getChainColor('core_testnet') + '20', 
                      borderColor: getChainColor('core_testnet'),
                      width: '45%',
                      paddingVertical: 12,
                      alignItems: 'center',
                      justifyContent: 'center'
                    },
                    selectedChain === 'core_testnet' && { borderWidth: 2 }
                  ]}
                  onPress={() => {
                    setSelectedChain('core_testnet');
                    setSelectedToken(null);
                  }}
                >
                  <Text style={[
                    styles.networkChipText,
                    { color: getChainColor('core_testnet') },
                    selectedChain === 'core_testnet' && { fontWeight: 'bold' }
                  ]}>
                    Core Testnet {selectedChain === 'core_testnet' ? '✓' : ''}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.networkChip,
                    { 
                      backgroundColor: getChainColor('base_sepolia') + '20', 
                      borderColor: getChainColor('base_sepolia'),
                      width: '45%',
                      paddingVertical: 12,
                      alignItems: 'center',
                      justifyContent: 'center'
                    },
                    selectedChain === 'base_sepolia' && { borderWidth: 2 }
                  ]}
                  onPress={() => {
                    setSelectedChain('base_sepolia');
                    setSelectedToken(null);
                  }}
                >
                  <Text style={[
                    styles.networkChipText,
                    { color: getChainColor('base_sepolia') },
                    selectedChain === 'base_sepolia' && { fontWeight: 'bold' }
                  ]}>
                    Base Sepolia {selectedChain === 'base_sepolia' ? '✓' : ''}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                <TouchableOpacity
                  style={[
                    styles.networkChip,
                    { 
                      backgroundColor: selectedChain === 'morph_holesky' ? getChainColor('morph_holesky') : getChainColor('morph_holesky') + '20', 
                      borderColor: getChainColor('morph_holesky'),
                      width: '45%',
                      paddingVertical: 12,
                      alignItems: 'center',
                      justifyContent: 'center'
                    },
                    selectedChain === 'morph_holesky' && { borderWidth: 2 }
                  ]}
                  onPress={() => {
                    setSelectedChain('morph_holesky');
                    setSelectedToken(null);
                  }}
                >
                  <Text style={[
                    styles.networkChipText,
                    { color: selectedChain === 'morph_holesky' ? 'white' : getChainColor('morph_holesky') },
                    selectedChain === 'morph_holesky' && { fontWeight: 'bold' }
                  ]}>
                    Morph {selectedChain === 'morph_holesky' ? '✓' : ''}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.networkChip,
                    { 
                      backgroundColor: getChainColor('lisk_sepolia') + '20', 
                      borderColor: getChainColor('lisk_sepolia'),
                      width: '45%',
                      paddingVertical: 12,
                      alignItems: 'center',
                      justifyContent: 'center'
                    },
                    selectedChain === 'lisk_sepolia' && { borderWidth: 2 }
                  ]}
                  onPress={() => {
                    setSelectedChain('lisk_sepolia');
                    setSelectedToken(null);
                  }}
                >
                  <Text style={[
                    styles.networkChipText,
                    { color: getChainColor('lisk_sepolia') },
                    selectedChain === 'lisk_sepolia' && { fontWeight: 'bold' }
                  ]}>
                    Lisk Sepolia {selectedChain === 'lisk_sepolia' ? '✓' : ''}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          {/* Token Selector */}
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Select Token
            </Text>
            <TokenSelector
              selectedChain={selectedChain}
              selectedToken={selectedToken}
              onTokenSelect={handleTokenSelect}
              showBalance={true}
            />
          </View>

          {/* Payment Details */}
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Payment Details
            </Text>
            
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Recipient Address</Text>
              <View style={[styles.inputContainer, { borderColor: colors.border }]}>
                <TextInput
                  style={[styles.input, { color: colors.text, backgroundColor: colors.inputBackground }]}
                  placeholder="0x..."
                  placeholderTextColor={colors.icon}
                  value={recipient}
                  onChangeText={setRecipient}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity 
                  style={styles.scanButton}
                  onPress={() => setShowQRScanner(true)}
                >
                  <Ionicons name="qr-code-outline" size={24} color={ChainColors.base.primary} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                Amount {selectedToken ? `(${selectedToken.symbol})` : ''}
              </Text>
              <TextInput
                style={[styles.input, { 
                  color: colors.text, 
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.border 
                }]}
                placeholder="0.0"
                placeholderTextColor={colors.icon}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
              />
              {selectedToken && (
                <Text style={[styles.balanceHint, { color: colors.icon }]}>
                  Available: {selectedToken.balance || '0.00'} {selectedToken.symbol}
                </Text>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Reference (Optional)</Text>
              <TextInput
                style={[styles.input, { 
                  color: colors.text, 
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.border 
                }]}
                placeholder="Payment reference"
                placeholderTextColor={colors.icon}
                value={reference}
                onChangeText={setReference}
              />
            </View>
          </View>

          {/* Send Button */}
          <TouchableOpacity
            style={[
              styles.sendButton, 
              loading && styles.sendButtonDisabled,
              { opacity: (!recipient || !amount || !selectedToken) ? 0.5 : 1 }
            ]}
            onPress={handleSendPayment}
            disabled={loading || !recipient || !amount || !selectedToken}
          >
            <LinearGradient
              colors={getBlueBlackGradient('primary') as any}
              style={styles.sendButtonGradient}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="send" size={20} color="#fff" />
                  <Text style={styles.sendButtonText}>
                    Send {selectedToken?.symbol || 'Payment'}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Info Card */}
          <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
            <LinearGradient
              colors={[ChainColors.base.primary + '20', ChainColors.base.primary + '10'] as any}
              style={styles.infoIcon}
            >
              <Ionicons name="information-circle-outline" size={24} color={ChainColors.base.primary} />
            </LinearGradient>
            <View style={styles.infoContent}>
              <Text style={[styles.infoTitle, { color: colors.text }]}>
                AirChainPay Multi-Chain
              </Text>
                             <Text style={[styles.infoText, { color: colors.icon }]}>
                 Transactions will be sent to the selected network. If you&apos;re offline, 
                 they will be queued and sent when you reconnect.
               </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* QR Code Scanner Modal */}
      {showQRScanner && (
        <QRCodeScanner
          onScan={handleQRScan}
          onClose={() => setShowQRScanner(false)}
          title="Scan Address"
          subtitle="Point your camera at a QR code containing a wallet address"
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 100,
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    height: 50,
    fontSize: 16,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  scanButton: {
    padding: 8,
  },
  balanceHint: {
    fontSize: 12,
    marginTop: 4,
  },
  sendButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  sendButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
  },
  networkChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  networkChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
});