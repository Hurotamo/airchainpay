import * as React from 'react';
import { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Modal, TextInput, Animated, TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { QRCodeScanner } from '../src/components/QRCodeScanner';
import { Ionicons } from '@expo/vector-icons';
import { PaymentService , PaymentRequest } from '../src/services/PaymentService';
import { TransactionBuilder } from '../src/utils/TransactionBuilder';
import { logger } from '../src/utils/Logger';
import QRCode from 'react-native-qrcode-svg';
import { useSelectedChain } from '../src/components/ChainSelector';
import { MultiTokenBalanceView } from '../src/components/MultiTokenBalanceView';
import { MultiChainWalletManager } from '../src/wallet/MultiChainWalletManager';
import { TokenInfo } from '../src/types/token';
import { ThemedView } from '../components/ThemedView';
import { ThemedText } from '../components/ThemedText';
import { useThemeColor } from '../hooks/useThemeColor';
import { getChainColor, getChainGradient } from '../constants/Colors';
import { AnimatedCard } from '../components/AnimatedComponents';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeContext } from '../hooks/useThemeContext';
import { QRCodeSigner, SignedQRPayload } from '../src/utils/crypto/QRCodeSigner';

interface PaymentSetup {
  to: string;
  amount: string;
  chainId: string;
  token?: TokenInfo;
  paymentReference?: string;
}

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
    'amount' in obj && typeof (obj as SignedQRPayload).amount === 'string' &&
    'chainId' in obj && typeof (obj as SignedQRPayload).chainId === 'string' &&
    'signature' in obj && typeof (obj as SignedQRPayload).signature === 'string'
  );
}
function isTokenInfo(obj: unknown): obj is TokenInfo {
  return (
    typeof obj === 'object' && obj !== null &&
    'address' in obj && typeof (obj as TokenInfo).address === 'string' &&
    'symbol' in obj && typeof (obj as TokenInfo).symbol === 'string' &&
    'decimals' in obj && typeof (obj as TokenInfo).decimals === 'number' &&
    'isNative' in obj && typeof (obj as TokenInfo).isNative === 'boolean' &&
    'name' in obj && typeof (obj as TokenInfo).name === 'string' &&
    'chainId' in obj && typeof (obj as TokenInfo).chainId === 'string'
  );
}

function buildTokenInfo(obj: any, selectedChain: string): TokenInfo | undefined {
  if (isTokenInfo(obj)) return obj;
  if (obj && typeof obj === 'object' && 'address' in obj && 'symbol' in obj && 'decimals' in obj && 'isNative' in obj) {
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

export default function QRPayScreen() {
  const [showScanner, setShowScanner] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);
  const [scannedAddress, setScannedAddress] = useState<string | null>(null);
  const [showPaymentSetup, setShowPaymentSetup] = useState(false);
  const [paymentSetup, setPaymentSetup] = useState<PaymentSetup | null>(null);
  const [amount, setAmount] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [isAmountValid, setIsAmountValid] = useState(true);
  
  const router = useRouter();
  const { selectedChain } = useSelectedChain();
  const walletManager = MultiChainWalletManager.getInstance();
  const amountInputRef = useRef<TextInput>(null);
  
  const cardColor = useThemeColor({ light: '#f5f5f5', dark: '#2c2c2e' }, 'card');
  const accentColor = useThemeColor({ light: '#2196F3', dark: '#4dabf5' }, 'tint');

  // Validate amount input
  const validateAmount = (value: string) => {
    const numValue = parseFloat(value);
    return !isNaN(numValue) && numValue > 0 && numValue <= 1000000; // Max 1M
  };

  const handleAmountChange = useCallback((value: string) => {
    // Only allow numbers and decimal point
    const cleanValue = value.replace(/[^0-9.]/g, '').trim();
    
    // Prevent multiple decimal points
    const decimalCount = (cleanValue.match(/\./g) || []).length;
    if (decimalCount > 1) {
      const parts = cleanValue.split('.');
      const finalValue = parts[0] + '.' + parts.slice(1).join('');
      setAmount(finalValue);
      setIsAmountValid(validateAmount(finalValue));
      return;
    }
    
    // Limit decimal places to 6
    const parts = cleanValue.split('.');
    if (parts[1] && parts[1].length > 6) {
      const finalValue = parts[0] + '.' + parts[1].substring(0, 6);
      setAmount(finalValue);
      setIsAmountValid(validateAmount(finalValue));
      return;
    }
    
    setAmount(cleanValue);
    setIsAmountValid(validateAmount(cleanValue));
  }, []);
  
  // Stable input props to prevent re-renders
  const inputProps = useMemo(() => ({
    keyboardType: 'numeric' as const,
    placeholder: 'Enter amount',
    placeholderTextColor: '#999',
    autoCorrect: false,
    autoCapitalize: 'none' as const,
    spellCheck: false,
    selectTextOnFocus: false,
    blurOnSubmit: false,
    returnKeyType: 'done' as const,
    editable: true,
    maxLength: 20,
    onFocus: () => {
      // Prevent any focus-related refreshing
    },
    onBlur: () => {
      // Prevent any blur-related refreshing
    }
  }), []);
  
  // Stable input style to prevent re-renders
  const inputStyle = useMemo(() => [
    styles.amountValue,
    !isAmountValid && { borderColor: '#ff6b6b' }
  ], [isAmountValid]);


  const handleScan = async (data: string) => {
    try {
      setIsProcessing(true);
      setShowScanner(false);
      
      logger.info('QR code scanned', { data });
      
      // Try to parse as JSON, else treat as address
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(data);
      } catch {
        parsed = { address: data };
      }
      
      // Check if this is a signed QR payload and verify signature
      if (isSignedQRPayload(parsed)) {
        logger.info('Signed QR payload detected, verifying signature');
        
        const verificationResult = await QRCodeSigner.verifyQRPayload(parsed);
        
        if (!verificationResult.isValid) {
          throw new Error(`QR code signature verification failed: ${verificationResult.error}`);
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
      } else {
        logger.info('Unsigned QR payload detected');
        // Block unsigned QR codes: show error and return
        Alert.alert(
          'Unverified QR Code',
          'This QR code is not digitally signed and cannot be processed for security reasons.',
          [
            { text: 'OK', onPress: () => setShowScanner(true) }
          ]
        );
        setIsProcessing(false);
        return;
      }
      
      // When handling parsed QR data:
      if (isPaymentRequest(parsed)) {
        // Safe to use parsed as PaymentRequest
        const paymentRequest: PaymentRequest = parsed;
        // Use paymentRequest fields safely
        
        // Extract the recipient address
        const recipientAddress = paymentRequest.to || data;
        
        if (!recipientAddress) {
          throw new Error('No valid address found in QR code');
        }
        
        // Set up initial payment data
        const initialPaymentSetup: PaymentSetup = {
          to: recipientAddress,
          amount: paymentRequest.amount,
          chainId: paymentRequest.chainId || selectedChain,
          token: paymentRequest.token ? buildTokenInfo(paymentRequest.token, selectedChain) : undefined,
          paymentReference: paymentRequest.paymentReference || '',
        };
        
        setScannedAddress(recipientAddress);
        setPaymentSetup(initialPaymentSetup);
        // Only setAmount if parsed.amount is present (i.e., from QR)
        if (paymentRequest.amount) {
          setAmount(paymentRequest.amount);
          setIsAmountValid(validateAmount(paymentRequest.amount));
        }
        setPaymentReference(initialPaymentSetup.paymentReference || '');
        setShowPaymentSetup(true);
        
      } else {
        // Handle invalid or incomplete QR data
        Alert.alert('Invalid QR Payment', 'The scanned QR code does not contain a valid payment request.');
        return;
      }
      
    } catch (error: any) {
      logger.error('QR code processing failed', { error: error?.message || 'Unknown error' });
      Alert.alert(
        'Scan Error',
        'Failed to process QR code. Please try again.',
        [
          { text: 'OK', onPress: () => setShowScanner(true) }
        ]
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTokenSelect = (token: TokenInfo) => {
    setSelectedToken(token);
  };

  const handleChainChange = (chainId: string) => {
    // changeChain(chainId); // This line was removed from the new_code, so it's removed here.
    if (paymentSetup) {
      setPaymentSetup({
        ...paymentSetup,
        chainId
      });
    }
  };

  const handleSendPayment = async () => {
    if (!paymentSetup || !selectedToken) {
      Alert.alert('Error', 'Please select a token and enter payment details');
      return;
    }
    if (!isAmountValid || !amount || parseFloat(amount.trim()) <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount to pay');
      return;
    }

    try {
      setIsProcessing(true);
      
      // Build transaction using TransactionBuilder
      const transaction = TransactionBuilder.build({
        to: paymentSetup.to,
        amount: amount,
        chainId: selectedChain,
        token: selectedToken,
        paymentReference: paymentReference || undefined,
        metadata: {
          merchant: paymentSetup.paymentReference,
          location: 'QR Payment',
          timestamp: Date.now()
        }
      });
      
      logger.info('Transaction built', { transaction });
      
      // Send payment using PaymentService
      const paymentService = PaymentService.getInstance();
      const result = await paymentService.sendPayment({
        to: transaction.to,
        amount: transaction.amount,
        chainId: transaction.chainId,
        transport: 'onchain',
        token: transaction.token,
        paymentReference: transaction.paymentReference,
        extraData: {
          metadata: transaction.metadata
        }
      });
      
      logger.info('Payment processed', { result });
      
      // Handle different response types
      if (result.status === 'queued') {
        Alert.alert(
          'Payment Queued',
          result.message || 'Your payment has been queued and will be processed when you are back online.',
          [
            { 
              text: 'View Queue', 
              onPress: () => router.push('/(tabs)/tx-history')
            },
            { 
              text: 'OK', 
              onPress: () => resetPaymentFlow()
            }
          ]
        );
      } else if (result.status === 'sent') {
        Alert.alert(
          'Payment Sent',
          `Your payment of ${amount} ${selectedToken.symbol} has been sent successfully!`,
          [
            { text: 'OK', onPress: () => resetPaymentFlow() }
          ]
        );
      } else {
        Alert.alert(
          'Payment Error',
          result.message || 'Failed to send payment. Please try again.',
          [
            { text: 'OK', onPress: () => setIsProcessing(false) }
          ]
        );
      }
      
    } catch (error: any) {
      logger.error('Payment processing failed', { error: error?.message || 'Unknown error' });
      Alert.alert(
        'Payment Error',
        'Failed to process payment. Please try again.',
        [
          { text: 'OK', onPress: () => setIsProcessing(false) }
        ]
      );
    }
  };

  const resetPaymentFlow = () => {
    setShowScanner(true);
    setShowPaymentSetup(false);
    setScannedAddress(null);
    setPaymentSetup(null);
    setAmount('');
    setPaymentReference('');
    setSelectedToken(null);
    setQrData(null);
    setIsProcessing(false);
    setIsAmountValid(true);
  };

  // Add prop types for PaymentSetupModal
  interface PaymentSetupModalProps {
    visible: boolean;
    onClose: () => void;
    scannedAddress: string | null;
    cardColor: string;
    accentColor: string;
    selectedChain: string;
    handleChainChange: (chainId: string) => void;
    walletManager: any;
    selectedToken: any;
    handleTokenSelect: (token: any) => void;
    isProcessing: boolean;
    handleSendPayment: () => void;
    paymentReference: string;
    setPaymentReference: (ref: string) => void;
    amount: string;
    setAmount: (a: string) => void;
    isAmountValid: boolean;
    setIsAmountValid: (v: boolean) => void;
  }

  // Remove React.memo from PaymentSetupModal
  function PaymentSetupModal(props: PaymentSetupModalProps) {
    const {
      visible,
      onClose,
      scannedAddress,
      cardColor,
      accentColor,
      selectedChain,
      handleChainChange,
      walletManager,
      selectedToken,
      handleTokenSelect,
      isProcessing,
      handleSendPayment,
      paymentReference,
      setPaymentReference,
      amount,
      setAmount,
      isAmountValid,
      setIsAmountValid
    } = props;

    // Local state for amount and validation
    const [isFocused, setIsFocused] = React.useState(false);
    const amountInputRef = React.useRef(null);

    // Animation values
    const fadeAnim = React.useRef(new Animated.Value(0)).current;
    const slideAnim = React.useRef(new Animated.Value(50)).current;
    const scaleAnim = React.useRef(new Animated.Value(0.95)).current;

    // Theme
    const { colorScheme } = useThemeContext();
    const theme = colorScheme || 'light';
    const colors = require('../constants/Colors').Colors[theme];
    const chainColor = getChainColor(selectedChain);
    const chainGradient = getChainGradient(selectedChain);

    React.useEffect(() => {
      if (visible) {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            tension: 100,
            friction: 8,
            useNativeDriver: true,
          }),
        ]).start();
      } else {
        fadeAnim.setValue(0);
        slideAnim.setValue(50);
        scaleAnim.setValue(0.95);
      }
    }, [visible]);

    // Validate amount input
    const validateAmount = React.useCallback((value: string) => {
      const trimmed = value.trim();
      const numValue = parseFloat(trimmed);
      console.log('[Amount Validation] value:', value, 'trimmed:', trimmed, 'numValue:', numValue);
      return trimmed !== '' && !isNaN(numValue) && numValue > 0 && numValue <= 1000000;
    }, []);

    const handleAmountChange = React.useCallback((value: string) => {
      const cleanValue = value.replace(/[^0-9.]/g, '').trim();
      const decimalCount = (cleanValue.match(/\./g) || []).length;
      let finalValue = cleanValue;
      if (decimalCount > 1) {
        const parts = cleanValue.split('.');
        finalValue = parts[0] + '.' + parts.slice(1).join('');
      }
      const parts = finalValue.split('.');
      if (parts[1] && parts[1].length > 6) {
        finalValue = parts[0] + '.' + parts[1].substring(0, 6);
      }
      setAmount(finalValue);
      setIsAmountValid(validateAmount(finalValue));
    }, [setAmount, setIsAmountValid, validateAmount]);

    const inputProps = React.useMemo(() => ({
      keyboardType: 'numeric' as const,
      placeholder: '0.00',
      placeholderTextColor: colors.icon,
      autoCorrect: false,
      autoCapitalize: 'none' as const,
      spellCheck: false,
      selectTextOnFocus: false,
      blurOnSubmit: false,
      returnKeyType: 'done' as const,
      editable: true,
      maxLength: 20,
      onFocus: () => setIsFocused(true),
      onBlur: () => setIsFocused(false),
    }), [colors.icon]);

    const inputStyle = React.useMemo(() => ({
      fontSize: 22,
      fontWeight: "700",
      color: colors.text,
      backgroundColor: colors.inputBackground,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isFocused ? chainColor : (isAmountValid ? colors.inputBorder : colors.error),
      paddingVertical: 12,
      paddingHorizontal: 16,
      minWidth: 120,
      textAlign: 'right',
      minHeight: 44,
    }) as TextStyle, [isAmountValid, isFocused, chainColor, colors]);

    return (
      <Modal
        visible={visible}
        animationType="none"
        onRequestClose={onClose}
        transparent={true}
      >
        <Animated.View 
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.7)',
            justifyContent: 'center',
            alignItems: 'center',
            opacity: fadeAnim,
          }}
        >
          <Animated.View 
            style={{
              width: '94%',
              maxWidth: 420,
              borderRadius: 24,
              overflow: 'hidden',
              transform: [
                { translateY: slideAnim },
                { scale: scaleAnim }
              ],
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.18,
              shadowRadius: 24,
              elevation: 12,
            }}
          >
            <LinearGradient
              colors={chainGradient as any}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ padding: 0, borderRadius: 24 }}
            >
              <ScrollView contentContainerStyle={{ padding: 0 }} showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 24, paddingBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: chainColor + '30', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                      <Ionicons name="card-outline" size={26} color={chainColor} />
                    </View>
                    <View>
                      <ThemedText style={{ fontSize: 22, fontWeight: 700, color: colors.text }}>Set Up Payment</ThemedText>
                      <ThemedText style={{ fontSize: 14, color: colors.icon, marginTop: 2 }}>Configure your transaction details</ThemedText>
                    </View>
                  </View>
                  <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
                    <Ionicons name="close" size={26} color={colors.icon} />
                  </TouchableOpacity>
                </View>

                {/* Recipient Card */}
                <AnimatedCard style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 0, padding: 18, backgroundColor: colors.card, borderRadius: 18, shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 }} chainId={selectedChain}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Ionicons name="person-outline" size={20} color={chainColor} />
                    <ThemedText style={{ fontSize: 16, fontWeight: 600, color: colors.text, marginLeft: 8 }}>Recipient Address</ThemedText>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.inputBackground, borderRadius: 8, padding: 10 }}>
                    <ThemedText style={{ flex: 1, fontSize: 15, color: colors.text, fontFamily: 'monospace' }}>
                      {scannedAddress ? `${scannedAddress.substring(0, 8)}...${scannedAddress.substring(scannedAddress.length - 8)}` : 'No address'}
                    </ThemedText>
                    <TouchableOpacity style={{ padding: 6 }}>
                      <Ionicons name="copy-outline" size={16} color={chainColor} />
                    </TouchableOpacity>
                  </View>
                </AnimatedCard>

                {/* Network Card */}
                <AnimatedCard style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 0, padding: 18, backgroundColor: colors.card, borderRadius: 18, shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 }} chainId={selectedChain}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Ionicons name="globe-outline" size={20} color={chainColor} />
                    <ThemedText style={{ fontSize: 16, fontWeight: 600, color: colors.text, marginLeft: 8 }}>Network</ThemedText>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 8 }}>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        marginHorizontal: 4,
                        paddingVertical: 12,
                        borderRadius: 10,
                        alignItems: 'center',
                        backgroundColor: selectedChain === 'base_sepolia' ? chainColor : colors.inputBackground,
                        shadowColor: selectedChain === 'base_sepolia' ? chainColor : 'transparent',
                        shadowOpacity: selectedChain === 'base_sepolia' ? 0.18 : 0,
                      }}
                      onPress={() => handleChainChange('base_sepolia')}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="logo-bitcoin" size={16} color={selectedChain === 'base_sepolia' ? 'white' : chainColor} />
                      <ThemedText style={{ fontSize: 15, fontWeight: 600, color: selectedChain === 'base_sepolia' ? 'white' : chainColor, marginTop: 4 }}>Base Sepolia</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        marginHorizontal: 4,
                        paddingVertical: 12,
                        borderRadius: 10,
                        alignItems: 'center',
                        backgroundColor: selectedChain === 'core_testnet' ? chainColor : colors.inputBackground,
                        shadowColor: selectedChain === 'core_testnet' ? chainColor : 'transparent',
                        shadowOpacity: selectedChain === 'core_testnet' ? 0.18 : 0,
                      }}
                      onPress={() => handleChainChange('core_testnet')}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="flash" size={16} color={selectedChain === 'core_testnet' ? 'white' : chainColor} />
                      <ThemedText style={{ fontSize: 15, fontWeight: 600, color: selectedChain === 'core_testnet' ? 'white' : chainColor, marginTop: 4 }}>Core Testnet</ThemedText>
                    </TouchableOpacity>
                  </View>
                </AnimatedCard>

                {/* Token Card */}
                <AnimatedCard style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 0, padding: 18, backgroundColor: colors.card, borderRadius: 18, shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 }} chainId={selectedChain}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Ionicons name="wallet-outline" size={20} color={chainColor} />
                    <ThemedText style={{ fontSize: 16, fontWeight: 600, color: colors.text, marginLeft: 8 }}>Token</ThemedText>
                  </View>
                  <MultiTokenBalanceView
                    walletManager={walletManager}
                    selectedChainId={selectedChain}
                    onTokenSelect={handleTokenSelect}
                  />
                  {selectedToken && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                      <Ionicons name="checkmark" size={16} color={chainColor} />
                      <ThemedText style={{ fontSize: 15, fontWeight: 600, color: chainColor, marginLeft: 6 }}>
                        Selected: {selectedToken.symbol}
                      </ThemedText>
                    </View>
                  )}
                </AnimatedCard>

                {/* Amount Card */}
                <AnimatedCard style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 0, padding: 18, backgroundColor: colors.card, borderRadius: 18, shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 }} chainId={selectedChain}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Ionicons name="cash-outline" size={20} color={chainColor} />
                    <ThemedText style={{ fontSize: 16, fontWeight: 600, color: colors.text, marginLeft: 8 }}>Amount to Pay</ThemedText>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.inputBackground, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <TextInput
                      ref={amountInputRef}
                      style={inputStyle}
                      value={amount}
                      onChangeText={handleAmountChange}
                      {...inputProps}
                    />
                    {selectedToken && (
                      <View style={{ backgroundColor: chainColor, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 10 }}>
                        <ThemedText style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{selectedToken.symbol}</ThemedText>
                      </View>
                    )}
                  </View>
                  {!isAmountValid && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                      <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
                      <ThemedText style={{ color: colors.error, fontSize: 14, marginLeft: 6 }}>
                        Please enter a valid amount (0.001 - 1,000,000)
                      </ThemedText>
                    </View>
                  )}
                </AnimatedCard>

                {/* Reference Card */}
                <AnimatedCard style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 0, padding: 18, backgroundColor: colors.card, borderRadius: 18, shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 }} chainId={selectedChain}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Ionicons name="document-text-outline" size={20} color={chainColor} />
                    <ThemedText style={{ fontSize: 16, fontWeight: 600, color: colors.text, marginLeft: 8 }}>Payment Reference</ThemedText>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.inputBackground, borderRadius: 8, padding: 10 }}>
                    <ThemedText style={{ flex: 1, fontSize: 15, color: colors.text, fontStyle: 'italic' }}>
                      {paymentReference || 'No reference provided'}
                    </ThemedText>
                    {paymentReference && (
                      <TouchableOpacity style={{ padding: 6 }}>
                        <Ionicons name="create-outline" size={16} color={chainColor} />
                      </TouchableOpacity>
                    )}
                  </View>
                </AnimatedCard>

                {/* Send Button */}
                <View style={{ marginHorizontal: 16, marginTop: 24, marginBottom: 32 }}>
                  <TouchableOpacity
                    style={{
                      backgroundColor: selectedToken ? chainColor : colors.buttonSecondary,
                      borderRadius: 16,
                      alignItems: 'center',
                      paddingVertical: 18,
                      shadowColor: selectedToken ? chainColor : colors.shadow,
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.18,
                      shadowRadius: 8,
                      elevation: 5,
                      flexDirection: 'row',
                      justifyContent: 'center',
                    }}
                    onPress={handleSendPayment}
                    disabled={!selectedToken || isProcessing}
                    activeOpacity={0.85}
                  >
                    {isProcessing ? (
                      <>
                        <Ionicons name="refresh" size={20} color="white" />
                        <ThemedText style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginLeft: 10 }}>Processing...</ThemedText>
                      </>
                    ) : (
                      <>
                        <Ionicons name="send" size={20} color="white" />
                        <ThemedText style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginLeft: 10 }}>Send Payment</ThemedText>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </LinearGradient>
          </Animated.View>
        </Animated.View>
      </Modal>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerSection}>
        <View style={styles.headerIconContainer}>
          <Ionicons name="qr-code-outline" size={32} color={String(accentColor)} />
        </View>
        <ThemedText style={styles.title}>QR Pay</ThemedText>
        <ThemedText style={styles.subtitle}>Scan a payment QR code to start a transaction</ThemedText>
      </View>
      
      {qrData && (
        <View style={styles.enhancedQrModal}>
          <View style={styles.qrModalHeader}>
            <Ionicons name="qr-code" size={24} color={String(accentColor)} />
            <ThemedText style={styles.enhancedQrModalTitle}>Show this QR to the payer</ThemedText>
          </View>
          <View style={styles.qrCodeContainer}>
            <QRCode value={qrData} size={256} />
          </View>
          <TouchableOpacity 
            style={[styles.enhancedCloseQrButton, { backgroundColor: String(accentColor) }]} 
            onPress={() => { setQrData(null); setShowScanner(true); }}
            activeOpacity={0.8}
          >
            <ThemedText style={styles.enhancedCloseQrButtonText}>Close</ThemedText>
          </TouchableOpacity>
        </View>
      )}
      
      {!qrData && showScanner && !isProcessing && (
        <QRCodeScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
          title="Scan QR Code"
          subtitle="Point your camera at a QR code to scan payment details"
        />
      )}
      
      {!qrData && !showScanner && !isProcessing && (
        <TouchableOpacity 
          style={[styles.enhancedRescanButton, { backgroundColor: String(accentColor) + '20' }]} 
          onPress={() => setShowScanner(true)}
          activeOpacity={0.8}
        >
          <View style={styles.rescanButtonContent}>
            <Ionicons name="scan-outline" size={24} color={String(accentColor)} />
            <ThemedText style={[styles.enhancedRescanText, { color: String(accentColor) }]}>Scan Again</ThemedText>
          </View>
        </TouchableOpacity>
      )}
      
      {isProcessing && (
        <View style={styles.processingContainer}>
          <ThemedText style={styles.processingText}>Processing payment...</ThemedText>
        </View>
      )}

      {/* In QRPayScreen, render PaymentSetupModal with props */}
      <PaymentSetupModal
        visible={showPaymentSetup}
        onClose={() => setShowPaymentSetup(false)}
        scannedAddress={scannedAddress}
        cardColor={String(cardColor)}
        accentColor={String(accentColor)}
        selectedChain={selectedChain}
        handleChainChange={handleChainChange}
        walletManager={walletManager}
        selectedToken={selectedToken}
        handleTokenSelect={handleTokenSelect}
        isProcessing={isProcessing}
        handleSendPayment={handleSendPayment}
        paymentReference={paymentReference}
        setPaymentReference={setPaymentReference}
        amount={amount}
        setAmount={setAmount}
        isAmountValid={isAmountValid}
        setIsAmountValid={setIsAmountValid}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 16,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  headerIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#2196F3',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
  rescanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#E3F2FD',
  },
  rescanText: {
    marginLeft: 8,
    color: '#2196F3',
    fontWeight: '600',
    fontSize: 16,
  },
  processingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  processingText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  qrModal: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginVertical: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  qrModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#2196F3',
  },
  closeQrButton: {
    marginTop: 24,
    paddingVertical: 10,
    paddingHorizontal: 32,
    backgroundColor: '#2196F3',
    borderRadius: 8,
  },
  closeQrButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
  },
  modalContent: {
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  section: {
    marginVertical: 8,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  addressText: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#666',
  },
  networkButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  networkButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  networkButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  selectedToken: {
    marginTop: 12,
    padding: 8,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
  },
  selectedTokenText: {
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '600',
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  amountLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  amountValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2196F3',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#f8f9fa',
    minWidth: 120,
    textAlign: 'right',
    minHeight: 40,
  },
  changeAmountButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  changeAmountText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  referenceText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  sendButton: {
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  debugText: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 12,
    marginTop: 4,
  },
  // Enhanced styles
  enhancedModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  enhancedModalContainer: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 10,
  },
  enhancedModalContent: {
    padding: 24,
  },
  enhancedModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  enhancedModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  enhancedModalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  closeButton: {
    padding: 8,
  },
  enhancedSection: {
    marginBottom: 20,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eee',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  enhancedSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  addressContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  enhancedAddressText: {
    flex: 1,
    fontSize: 16,
    color: '#555',
    fontFamily: 'monospace',
  },
  copyButton: {
    padding: 8,
  },
  enhancedNetworkContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  enhancedNetworkButton: {
    flex: 1,
    marginHorizontal: 5,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  networkButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  networkIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  enhancedNetworkButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  enhancedSelectedToken: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 15,
  },
  selectedTokenContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tokenIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  enhancedSelectedTokenText: {
    fontSize: 16,
    fontWeight: '600',
  },
  enhancedAmountContainer: {
    marginTop: 15,
  },
  amountInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  enhancedAmountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2196F3',
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: '#ccc',
    backgroundColor: '#f8f9fa',
    minWidth: 120,
    textAlign: 'right',
    minHeight: 40,
  },
  currencyBadge: {
    backgroundColor: '#2196F3',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 10,
  },
  currencyText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FFEBE6',
    borderWidth: 1,
    borderColor: '#FF4757',
  },
  enhancedErrorText: {
    color: '#FF4757',
    fontSize: 14,
    marginLeft: 5,
  },
  referenceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 15,
  },
  enhancedReferenceText: {
    flex: 1,
    fontSize: 16,
    color: '#555',
    fontStyle: 'italic',
  },
  editReferenceButton: {
    padding: 8,
  },
  enhancedSendButton: {
    marginTop: 25,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  sendButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
       enhancedSendButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  enhancedRescanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  rescanButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  enhancedRescanText: {
    marginLeft: 12,
    fontWeight: '600',
    fontSize: 16,
  },
  enhancedQrModal: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    marginVertical: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  qrModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  enhancedQrModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
    color: '#333',
  },
  qrCodeContainer: {
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginBottom: 20,
  },
  enhancedCloseQrButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  enhancedCloseQrButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
}); 