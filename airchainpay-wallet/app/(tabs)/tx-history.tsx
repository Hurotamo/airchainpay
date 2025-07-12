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
import { getChainColor } from '../../constants/Colors';

export default function TransactionHistoryScreen() {
  const [hasWallet, setHasWallet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<BlockchainTransaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedChain, setSelectedChain] = useState(DEFAULT_CHAIN_ID);

  const router = useRouter();

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
    return <ActivityIndicator style={{ flex: 1, alignSelf: 'center', marginTop: 40 }} />;
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
    <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={{ paddingTop: 50, paddingBottom: 20, paddingHorizontal: 20 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: 'white', marginLeft: 15 }}>
            Transaction History
          </Text>
        </View>
        
        {/* Chain Selector */}
        <View style={{ marginTop: 15 }}>
          <Text style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.8)', marginBottom: 8 }}>
            Select Network:
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: getChainColor('core_testnet') + '20',
                borderWidth: 2,
                borderColor: selectedChain === 'core_testnet' ? getChainColor('core_testnet') : 'transparent',
              }}
              onPress={() => changeChain('core_testnet')}
            >
              <Text style={{
                color: selectedChain === 'core_testnet' ? getChainColor('core_testnet') : 'rgba(255, 255, 255, 0.8)',
                fontWeight: selectedChain === 'core_testnet' ? 'bold' : 'normal',
                fontSize: 14,
              }}>
                Core Testnet {selectedChain === 'core_testnet' ? '✓' : ''}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: getChainColor('base_sepolia') + '20',
                borderWidth: 2,
                borderColor: selectedChain === 'base_sepolia' ? getChainColor('base_sepolia') : 'transparent',
              }}
              onPress={() => changeChain('base_sepolia')}
            >
              <Text style={{
                color: selectedChain === 'base_sepolia' ? getChainColor('base_sepolia') : 'rgba(255, 255, 255, 0.8)',
                fontWeight: selectedChain === 'base_sepolia' ? 'bold' : 'normal',
                fontSize: 14,
              }}>
                Base Sepolia {selectedChain === 'base_sepolia' ? '✓' : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>
      
      <ScrollView 
        style={{ flex: 1, padding: 20 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={fetchTransactions} />
        }
      >
        {/* Network Info */}
        <View style={{
          backgroundColor: 'white',
          padding: 15,
          borderRadius: 10,
          marginBottom: 15,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Ionicons name="information-circle" size={20} color={getChainColor(selectedChain)} />
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#333', marginLeft: 8 }}>
              {SUPPORTED_CHAINS[selectedChain]?.name || selectedChain}
            </Text>
          </View>
          <Text style={{ fontSize: 14, color: '#666' }}>
            Showing transactions for {SUPPORTED_CHAINS[selectedChain]?.name || selectedChain} network
          </Text>
        </View>

        {transactions.length === 0 && (
          <Text style={{ textAlign: 'center', color: '#888', marginTop: 40 }}>
            No transactions found on {SUPPORTED_CHAINS[selectedChain]?.name || selectedChain}.
          </Text>
        )}
        {transactions.map((tx, index) => {
          const key = tx.hash || `tx-${index}`;
          return (
            <View 
              key={key}
              style={{
                backgroundColor: 'white',
                padding: 15,
                borderRadius: 10,
                marginBottom: 10,
                shadowColor: '#000',
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
                  color={tx.from?.toLowerCase() === tx.to?.toLowerCase() ? '#888' : (tx.from?.toLowerCase() === tx.to?.toLowerCase() ? '#ff6b6b' : '#51cf66')}
                />
                <View style={{ marginLeft: 10 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#333' }}>
                    {tx.from?.toLowerCase() === tx.to?.toLowerCase() ? 'Self' : (tx.from?.toLowerCase() === tx.to?.toLowerCase() ? 'Sent' : 'Received')}
                  </Text>
                  <Text style={{ fontSize: 14, color: '#666', marginTop: 2 }}>
                    {new Date(tx.timestamp).toLocaleString()}
                  </Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: tx.from?.toLowerCase() === tx.to?.toLowerCase() ? '#888' : (tx.from?.toLowerCase() === tx.to?.toLowerCase() ? '#ff6b6b' : '#51cf66')
                }}>
                  {tx.from?.toLowerCase() === tx.to?.toLowerCase() ? '' : (tx.from?.toLowerCase() === tx.to?.toLowerCase() ? '-' : '+')}{tx.amount} {tx.tokenSymbol || ''}
                </Text>
                <Text style={{ fontSize: 12, color: tx.status === 'completed' ? '#51cf66' : '#ff6b6b', marginTop: 2 }}>
                  {tx.status}
                </Text>
                {tx.blockExplorerUrl && (
                  <TouchableOpacity onPress={() => handleOpenExplorer(tx.blockExplorerUrl)}>
                    <Text style={{ color: '#667eea', fontSize: 12, marginTop: 4 }}>View on Blockchain</Text>
                  </TouchableOpacity>
                )}
              </View>
                          </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
} 