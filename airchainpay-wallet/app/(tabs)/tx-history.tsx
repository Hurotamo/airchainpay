import * as React from 'react';
import { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Linking, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { MultiChainWalletManager } from '../../src/wallet/MultiChainWalletManager';
import { logger } from '../../src/utils/Logger';
import WalletSetupScreen from '../../src/components/WalletSetupScreen';
import { BlockchainTransactionService, BlockchainTransaction } from '../../src/services/BlockchainTransactionService';
import { DEFAULT_CHAIN_ID, SUPPORTED_CHAINS } from '../../src/constants/AppConfig';
import { getChainColor , Colors } from '../../constants/Colors';
import { useThemeContext } from '../../hooks/useThemeContext';
import { ThemedView } from '../../components/ThemedView';

export default function TransactionHistoryScreen() {
  const [hasWallet, setHasWallet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<BlockchainTransaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedChain, setSelectedChain] = useState(DEFAULT_CHAIN_ID);

  const router = useRouter();
  const { colorScheme } = useThemeContext();
  const theme = colorScheme || 'light';
  const colors = Colors[theme];

  const checkWalletStatus = useCallback(async () => {
    try {
      const walletExists = await MultiChainWalletManager.getInstance().hasWallet();
      setHasWallet(walletExists);
    } catch (error) {
      logger.error('Failed to check wallet status:', error);
      setHasWallet(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    setRefreshing(true);
    try {
      const txs = await BlockchainTransactionService.getInstance().getTransactionHistory(selectedChain, { limit: 50 });
      setTransactions(txs);
    } catch (error) {
      logger.error('Failed to fetch transaction history:', error);
    } finally {
      setRefreshing(false);
    }
  }, [selectedChain]);

  const changeChain = useCallback((chainId: string) => {
    setSelectedChain(chainId);
    logger.info(`[TransactionHistory] Changed to chain: ${chainId}`);
  }, []);

  useFocusEffect(
    useCallback(() => {
      checkWalletStatus();
    }, [checkWalletStatus])
  );

  useEffect(() => {
    if (hasWallet) {
      fetchTransactions();
      // Start real-time monitoring
      BlockchainTransactionService.getInstance().startTransactionMonitoring(selectedChain, setTransactions);
      return () => {
        BlockchainTransactionService.getInstance().stopTransactionMonitoring(selectedChain);
      };
    }
  }, [hasWallet, selectedChain, fetchTransactions]);

  const handleWalletCreated = () => {
    checkWalletStatus();
  };

  const handleOpenExplorer = (url: string) => {
    if (url) {
      Linking.openURL(url);
    }
  };

  if (loading) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.tint} />
        <Text style={{ color: colors.text, marginTop: 16 }}>Loading transactions...</Text>
      </ThemedView>
    );
  }

  if (!hasWallet) {
    return (
      <WalletSetupScreen
        onWalletCreated={handleWalletCreated}
        title="Transaction History"
        subtitle="Create or import a wallet to view your transaction history"
      />
    );
  }

  return (
    <ThemedView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: 50, paddingBottom: 20, paddingHorizontal: 20, backgroundColor: colors.card }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.tint} />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: colors.tint, marginLeft: 15 }}>
            Transaction History
          </Text>
        </View>
        
        {/* Chain Selector */}
        <View style={{ marginTop: 15 }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.text, marginBottom: 8, textAlign: 'center' }}>
            Multi-Chain Networks
          </Text>
          <Text style={{ fontSize: 12, color: colors.icon, marginBottom: 16, textAlign: 'center' }}>
            Select network to view transactions
          </Text>
          <View style={{ flexDirection: 'column', gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <TouchableOpacity
                style={{
                  width: '45%',
                  paddingVertical: 16,
                  paddingHorizontal: 16,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: getChainColor('core_testnet') + '15',
                  borderWidth: 2,
                  borderColor: selectedChain === 'core_testnet' ? getChainColor('core_testnet') : 'transparent',
                  shadowColor: selectedChain === 'core_testnet' ? getChainColor('core_testnet') : 'transparent',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: selectedChain === 'core_testnet' ? 0.2 : 0,
                  shadowRadius: 4,
                  elevation: selectedChain === 'core_testnet' ? 3 : 0,
                  minHeight: 60,
                }}
                onPress={() => changeChain('core_testnet')}
              >
                <Text style={{
                  color: getChainColor('core_testnet'),
                  fontWeight: selectedChain === 'core_testnet' ? 'bold' : '600',
                  fontSize: 16,
                  textAlign: 'center',
                }}>
                  Core Testnet
                </Text>
                {selectedChain === 'core_testnet' && (
                  <View style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: getChainColor('core_testnet'),
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Ionicons name="checkmark" size={10} color="white" />
                  </View>
                )}
              </TouchableOpacity>
              
              <TouchableOpacity
                style={{
                  width: '45%',
                  paddingVertical: 16,
                  paddingHorizontal: 16,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: getChainColor('base_sepolia') + '15',
                  borderWidth: 2,
                  borderColor: selectedChain === 'base_sepolia' ? getChainColor('base_sepolia') : 'transparent',
                  shadowColor: selectedChain === 'base_sepolia' ? getChainColor('base_sepolia') : 'transparent',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: selectedChain === 'base_sepolia' ? 0.2 : 0,
                  shadowRadius: 4,
                  elevation: selectedChain === 'base_sepolia' ? 3 : 0,
                  minHeight: 60,
                }}
                onPress={() => changeChain('base_sepolia')}
              >
                <Text style={{
                  color: getChainColor('base_sepolia'),
                  fontWeight: selectedChain === 'base_sepolia' ? 'bold' : '600',
                  fontSize: 16,
                  textAlign: 'center',
                }}>
                  Base Sepolia
                </Text>
                {selectedChain === 'base_sepolia' && (
                  <View style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: getChainColor('base_sepolia'),
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Ionicons name="checkmark" size={10} color="white" />
                  </View>
                )}
              </TouchableOpacity>
            </View>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <TouchableOpacity
                style={{
                  width: '45%',
                  paddingVertical: 16,
                  paddingHorizontal: 16,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selectedChain === 'morph_holesky' ? getChainColor('morph_holesky') : getChainColor('morph_holesky') + '15',
                  borderWidth: 2,
                  borderColor: selectedChain === 'morph_holesky' ? getChainColor('morph_holesky') : 'transparent',
                  shadowColor: selectedChain === 'morph_holesky' ? getChainColor('morph_holesky') : 'transparent',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: selectedChain === 'morph_holesky' ? 0.2 : 0,
                  shadowRadius: 4,
                  elevation: selectedChain === 'morph_holesky' ? 3 : 0,
                  minHeight: 60,
                }}
                onPress={() => changeChain('morph_holesky')}
              >
                <Text style={{
                  color: selectedChain === 'morph_holesky' ? 'white' : getChainColor('morph_holesky'),
                  fontWeight: selectedChain === 'morph_holesky' ? 'bold' : '600',
                  fontSize: 16,
                  textAlign: 'center',
                }}>
                  Morph
                </Text>
                {selectedChain === 'morph_holesky' && (
                  <View style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: 'white',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Ionicons name="checkmark" size={10} color={getChainColor('morph_holesky')} />
                  </View>
                )}
              </TouchableOpacity>
              
              <TouchableOpacity
                style={{
                  width: '45%',
                  paddingVertical: 16,
                  paddingHorizontal: 16,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: getChainColor('lisk_sepolia') + '15',
                  borderWidth: 2,
                  borderColor: selectedChain === 'lisk_sepolia' ? getChainColor('lisk_sepolia') : 'transparent',
                  shadowColor: selectedChain === 'lisk_sepolia' ? getChainColor('lisk_sepolia') : 'transparent',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: selectedChain === 'lisk_sepolia' ? 0.2 : 0,
                  shadowRadius: 4,
                  elevation: selectedChain === 'lisk_sepolia' ? 3 : 0,
                  minHeight: 60,
                }}
                onPress={() => changeChain('lisk_sepolia')}
              >
                <Text style={{
                  color: getChainColor('lisk_sepolia'),
                  fontWeight: selectedChain === 'lisk_sepolia' ? 'bold' : '600',
                  fontSize: 16,
                  textAlign: 'center',
                }}>
                  Lisk Sepolia
                </Text>
                {selectedChain === 'lisk_sepolia' && (
                  <View style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: getChainColor('lisk_sepolia'),
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Ionicons name="checkmark" size={10} color="white" />
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
      
      <ScrollView 
        style={{ flex: 1, padding: 20 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={fetchTransactions} tintColor={colors.tint} />
        }
      >
        {/* Network Info */}
        <View style={{
          backgroundColor: colors.card,
          padding: 15,
          borderRadius: 10,
          marginBottom: 15,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Ionicons name="information-circle" size={20} color={getChainColor(selectedChain)} />
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginLeft: 8 }}>
              {SUPPORTED_CHAINS[selectedChain]?.name || selectedChain}
            </Text>
          </View>
          <Text style={{ fontSize: 14, color: colors.icon }}>
            Showing transactions for {SUPPORTED_CHAINS[selectedChain]?.name || selectedChain} network
          </Text>
        </View>

        {transactions.length === 0 && (
          <Text style={{ textAlign: 'center', color: colors.icon, marginTop: 40 }}>
            No transactions found on {SUPPORTED_CHAINS[selectedChain]?.name || selectedChain}.
          </Text>
        )}
        {transactions.map((tx, index) => {
          const key = tx.hash || `tx-${index}`;
          return (
            <View 
              key={key}
              style={{
                backgroundColor: colors.card,
                padding: 15,
                borderRadius: 10,
                marginBottom: 10,
                shadowColor: colors.shadow,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 3,
              }}
            >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons
                  name={tx.from?.toLowerCase() === tx.to?.toLowerCase() ? 'swap-horizontal' : (tx.from?.toLowerCase() === tx.to?.toLowerCase() ? 'arrow-up-circle' : 'arrow-down-circle')}
                  size={24}
                  color={tx.from?.toLowerCase() === tx.to?.toLowerCase() ? colors.icon : (tx.from?.toLowerCase() === tx.to?.toLowerCase() ? colors.error : colors.success)}
                />
                <View style={{ marginLeft: 10 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
                    {tx.from?.toLowerCase() === tx.to?.toLowerCase() ? 'Self' : (tx.from?.toLowerCase() === tx.to?.toLowerCase() ? 'Sent' : 'Received')}
                  </Text>
                  <Text style={{ fontSize: 14, color: colors.icon, marginTop: 2 }}>
                    {new Date(tx.timestamp).toLocaleString()}
                  </Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: tx.from?.toLowerCase() === tx.to?.toLowerCase() ? colors.icon : (tx.from?.toLowerCase() === tx.to?.toLowerCase() ? colors.error : colors.success)
                }}>
                  {tx.from?.toLowerCase() === tx.to?.toLowerCase() ? '' : (tx.from?.toLowerCase() === tx.to?.toLowerCase() ? '-' : '+')}{tx.amount} {tx.tokenSymbol || ''}
                </Text>
                <Text style={{ fontSize: 12, color: tx.status === 'completed' ? colors.success : colors.error, marginTop: 2 }}>
                  {tx.status}
                </Text>
                {tx.blockExplorerUrl && (
                  <TouchableOpacity onPress={() => handleOpenExplorer(tx.blockExplorerUrl)}>
                    <Text style={{ color: colors.tint, fontSize: 12, marginTop: 4 }}>View on Blockchain</Text>
                  </TouchableOpacity>
                )}
              </View>
                          </View>
            </View>
          );
        })}
      </ScrollView>
    </ThemedView>
  );
} 