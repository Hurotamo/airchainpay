import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TokenWalletManager, TokenBalance, TokenInfo } from '../wallet/TokenWalletManager';
import { MultiChainWalletManager } from '../wallet/MultiChainWalletManager';
import { SUPPORTED_CHAINS } from '../constants/AppConfig';
import { getTokenLogo } from '../constants/logos';
import { useThemeColor } from '../../hooks/useThemeColor';

// Correct token addresses for each network
const TOKEN_ADDRESSES = {
  base_sepolia: {
    USDC: '0xa52C05C9726f1DeFc3d9b0eB5411C66F0920bBeC',
    USDT: '0x3c6E5e4F0b3B56a5324E5e6D2a009b34Eb63885d'
  },
  core_testnet: {
    USDC: '0x960a4ecbd07ee1700e96df39242f1a13e904d50c',
    USDT: '0x2df197428353c8847b8c3d042eb9d50e52f14b5a'
  }
};

interface MultiTokenBalanceViewProps {
  walletManager: MultiChainWalletManager;
  selectedChainId: string;
  onTokenSelect?: (token: TokenInfo) => void;
  onSendPress?: (token: TokenInfo) => void;
  onReceivePress?: (token: TokenInfo) => void;
}

interface ChainBalances {
  chainId: string;
  chainName: string;
  balances: TokenBalance[];
  isLoading: boolean;
  error?: string;
}

export const MultiTokenBalanceView: React.FC<MultiTokenBalanceViewProps> = ({
  walletManager,
  selectedChainId,
  onTokenSelect,
  onSendPress,
  onReceivePress,
}) => {
  const [chainBalances, setChainBalances] = useState<ChainBalances[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [totalUSDValue, setTotalUSDValue] = useState(0);
  const [showAllChains, setShowAllChains] = useState(false);
  const [tokenWalletManager] = useState(() => new TokenWalletManager());

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const tintColor = useThemeColor({}, 'tint');
  const cardColor = useThemeColor({ light: '#f8f9fa', dark: '#1a1a1a' }, 'card');

  // Initialize chain balances
  useEffect(() => {
    const initializeChainBalances = () => {
      const chains = showAllChains 
        ? Object.keys(SUPPORTED_CHAINS)
        : [selectedChainId];

      const initialBalances: ChainBalances[] = chains.map(chainId => ({
        chainId,
        chainName: SUPPORTED_CHAINS[chainId]?.name || chainId,
        balances: [],
        isLoading: true,
      }));

      setChainBalances(initialBalances);
    };

    initializeChainBalances();
  }, [selectedChainId, showAllChains]);

  // Load balances for all chains
  const loadBalances = useCallback(async () => {
    const chains = showAllChains 
      ? Object.keys(SUPPORTED_CHAINS)
      : [selectedChainId];

    const balancePromises = chains.map(async (chainId) => {
      try {
        const walletInfo = await walletManager.getWalletInfo(chainId);
        const walletAddress = walletInfo.address;
        if (!walletAddress) {
          throw new Error('Wallet not initialized');
        }

        const chainConfig = SUPPORTED_CHAINS[chainId];
        const nativeSymbol = chainConfig?.nativeCurrency?.symbol || 'ETH';
        const nativeName = chainConfig?.nativeCurrency?.name || 'Ethereum';
        
        const balances: TokenBalance[] = [];
        
        // Add native token balance
        const nativeBalance = await tokenWalletManager.getTokenBalance(walletAddress, {
          symbol: nativeSymbol,
          name: nativeName,
          address: '0x0000000000000000000000000000000000000000',
          decimals: 18,
          chainId: chainId,
          isNative: true,
          logoUri: getTokenLogo(nativeSymbol, chainId),
        });
        balances.push(nativeBalance);
        
        // Add ERC-20 token balances
        const chainTokens = TOKEN_ADDRESSES[chainId as keyof typeof TOKEN_ADDRESSES];
        if (chainTokens) {
          const erc20Tokens = [
            {
              symbol: 'USDC',
              name: 'USD Coin',
              address: chainTokens.USDC,
              decimals: 6,
              isStablecoin: true,
              logoUri: getTokenLogo('USDC', chainId),
            },
            {
              symbol: 'USDT',
              name: 'Tether USD',
              address: chainTokens.USDT,
              decimals: 6,
              isStablecoin: true,
              logoUri: getTokenLogo('USDT', chainId),
            },
          ];
          
          for (const token of erc20Tokens) {
            try {
              const tokenBalance = await tokenWalletManager.getTokenBalance(walletAddress, {
                ...token,
                chainId,
                isNative: false,
              });
              balances.push(tokenBalance);
            } catch (error) {
              console.log(`Failed to load ${token.symbol} balance:`, error);
              // Add token with zero balance if loading fails
              balances.push({
                token: {
                  ...token,
                  chainId,
                  isNative: false,
                },
                balance: '0',
                formattedBalance: '0',
              });
            }
          }
        }
        
        return {
          chainId,
          chainName: SUPPORTED_CHAINS[chainId]?.name || chainId,
          balances,
          isLoading: false,
        };
      } catch (error) {
        console.error(`Error loading balances for ${chainId}:`, error);
        return {
          chainId,
          chainName: SUPPORTED_CHAINS[chainId]?.name || chainId,
          balances: [],
          isLoading: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    const results = await Promise.all(balancePromises);
    setChainBalances(results);

    // Calculate total USD value
    const total = results.reduce((sum: number, chain: ChainBalances) => {
      return sum + chain.balances.reduce((chainSum: number, balance: TokenBalance) => {
        return chainSum + 0; // Remove usdValue calculation for now
      }, 0);
    }, 0);
    setTotalUSDValue(total);
  }, [walletManager, selectedChainId, showAllChains, tokenWalletManager]);

  // Load balances on mount and when dependencies change
  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  // Refresh handler
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadBalances();
    setIsRefreshing(false);
  }, [loadBalances]);

  // Render token balance card
  const renderTokenBalance = (balance: TokenBalance, chainId: string) => {
    const isNative = balance.token.address === '0x0000000000000000000000000000000000000000';
    const isStablecoin = balance.token.isStablecoin;

    return (
      <TouchableOpacity
        key={`${chainId}-${balance.token.symbol}`}
        style={[styles.tokenCard, { backgroundColor: cardColor as any }]}
        onPress={() => onTokenSelect?.(balance.token)}
      >
        <View style={styles.tokenHeader}>
          <View style={styles.tokenInfo}>
            {balance.token.logoUri ? (
              <Image source={typeof balance.token.logoUri === 'string' ? { uri: balance.token.logoUri } : balance.token.logoUri} style={styles.tokenLogo} />
            ) : (
              <View style={[styles.tokenLogo, styles.placeholderLogo]}>
                <Text style={styles.placeholderText}>
                  {balance.token.symbol.charAt(0)}
                </Text>
              </View>
            )}
            <View style={styles.tokenDetails}>
              <Text style={[styles.tokenSymbol, { color: textColor as any }]}>
                {balance.token.symbol}
              </Text>
              <Text style={[styles.tokenName, { color: textColor as any + '80' }]}>
                {balance.token.name}
              </Text>
              <View style={styles.tokenTags}>
                {isNative && (
                  <View style={styles.nativeTag}>
                    <Text style={styles.tagText}>Native</Text>
                  </View>
                )}
                {isStablecoin && (
                  <View style={styles.stablecoinTag}>
                    <Text style={styles.tagText}>Stable</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
          <View style={styles.balanceInfo}>
            <Text style={[styles.balance, { color: textColor as any }]}>
              {parseFloat(balance.formattedBalance).toFixed(6)} {balance.token.symbol}
            </Text>
          </View>
        </View>
        
        <View style={styles.tokenActions}>
          <TouchableOpacity
            style={[styles.actionButton, { borderColor: tintColor as any }]}
            onPress={() => onSendPress?.(balance.token)}
          >
            <Ionicons name="arrow-up" size={16} color={tintColor as any} />
            <Text style={[styles.actionText, { color: tintColor as any }]}>Send</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionButton, { borderColor: tintColor as any }]}
            onPress={() => onReceivePress?.(balance.token)}
          >
            <Ionicons name="arrow-down" size={16} color={tintColor as any} />
            <Text style={[styles.actionText, { color: tintColor as any }]}>Receive</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // Render chain section
  const renderChainSection = (chainBalance: ChainBalances) => {
    const chainConfig = SUPPORTED_CHAINS[chainBalance.chainId];
    const totalChainValue = chainBalance.balances.reduce((sum: number, balance: TokenBalance) => {
      return sum + 0; // Remove usdValue calculation for now
    }, 0);

    return (
      <View key={chainBalance.chainId} style={styles.chainSection}>
        <View style={styles.chainHeader}>
          <View style={styles.chainInfo}>
            <Text style={[styles.chainName, { color: textColor as any }]}>
              {chainBalance.chainName}
            </Text>
            <Text style={[styles.chainType, { color: textColor as any + '60' }]}>
              {chainConfig?.type?.toUpperCase() || 'UNKNOWN'}
            </Text>
          </View>
          <View style={styles.chainValue}>
            <Text style={[styles.chainTotal, { color: textColor as any }]}>
              ${totalChainValue.toFixed(2)}
            </Text>
            <Text style={[styles.tokenCount, { color: textColor as any + '60' }]}>
              {chainBalance.balances.length} tokens
            </Text>
          </View>
        </View>

        {chainBalance.isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={tintColor as any} />
            <Text style={[styles.loadingText, { color: textColor as any + '60' }]}>
              Loading balances...
            </Text>
          </View>
        ) : chainBalance.error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="warning" size={20} color="#ff6b6b" />
            <Text style={styles.errorText}>{chainBalance.error}</Text>
          </View>
        ) : (
          <View style={styles.tokensContainer}>
            {chainBalance.balances.map((balance) => 
              renderTokenBalance(balance, chainBalance.chainId)
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: backgroundColor as any }]}>
      {/* Total Portfolio Value */}
      <View style={[styles.portfolioHeader, { backgroundColor: cardColor as any }]}>
        <Text style={[styles.portfolioLabel, { color: textColor as any + '80' }]}>
          Total Portfolio Value
        </Text>
        <Text style={[styles.portfolioValue, { color: textColor as any }]}>
          ${totalUSDValue.toFixed(2)}
        </Text>
        
        <View style={styles.portfolioActions}>
          <TouchableOpacity
            style={[styles.toggleButton, { borderColor: tintColor as any }]}
            onPress={() => setShowAllChains(!showAllChains)}
          >
            <Text style={[styles.toggleText, { color: tintColor as any }]}>
              {showAllChains ? 'Current Chain' : 'All Chains'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Chain Balances */}
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {chainBalances.map(renderChainSection)}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  portfolioHeader: {
    padding: 20,
    borderRadius: 12,
    margin: 16,
    alignItems: 'center',
  },
  portfolioLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  portfolioValue: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  portfolioActions: {
    flexDirection: 'row',
  },
  toggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
  },
  chainSection: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  chainHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  chainInfo: {
    flex: 1,
  },
  chainName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  chainType: {
    fontSize: 12,
    marginTop: 2,
  },
  chainValue: {
    alignItems: 'flex-end',
  },
  chainTotal: {
    fontSize: 16,
    fontWeight: '600',
  },
  tokenCount: {
    fontSize: 12,
    marginTop: 2,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#ff6b6b',
  },
  tokensContainer: {
    gap: 12,
  },
  tokenCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  tokenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tokenInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  tokenLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  placeholderLogo: {
    backgroundColor: '#4a90e2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  tokenDetails: {
    flex: 1,
  },
  tokenSymbol: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  tokenName: {
    fontSize: 12,
    marginTop: 2,
  },
  tokenTags: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 4,
  },
  nativeTag: {
    backgroundColor: '#2196f3',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  stablecoinTag: {
    backgroundColor: '#4caf50',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  tagText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
  },
  balanceInfo: {
    alignItems: 'flex-end',
  },
  balance: {
    fontSize: 16,
    fontWeight: '600',
  },
  tokenActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '500',
  },
}); 