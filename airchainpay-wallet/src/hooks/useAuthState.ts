import { useState, useEffect, useCallback } from 'react';
import { MultiChainWalletManager } from '../wallet/MultiChainWalletManager';
import { WalletErrorHandler } from '../utils/WalletErrorHandler';

export interface AuthState {
  hasWallet: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export const useAuthState = () => {
  const [authState, setAuthState] = useState<AuthState>({
    hasWallet: false,
    isAuthenticated: false,
    isLoading: true,
  });

  const checkAuthState = useCallback(async () => {
    try {
      console.log('[useAuthState] Checking authentication state...');
      
      const hasWallet = await MultiChainWalletManager.getInstance().hasWallet();
      console.log('[useAuthState] Has wallet:', hasWallet);
      
      if (!hasWallet) {
        setAuthState({
          hasWallet: false,
          isAuthenticated: false,
          isLoading: false,
        });
        return;
      }

      // Check if wallet setup is complete (has password and backup confirmed)
      const hasPassword = await MultiChainWalletManager.getInstance().hasPassword();
      const backupConfirmed = await MultiChainWalletManager.getInstance().isBackupConfirmed();
      const isAuthenticated = hasPassword && backupConfirmed;
      
      console.log('[useAuthState] Setup complete:', isAuthenticated, 'hasPassword:', hasPassword, 'backupConfirmed:', backupConfirmed);
      
      setAuthState({
        hasWallet,
        isAuthenticated,
        isLoading: false,
      });
    } catch (error) {
      console.error('[useAuthState] Error checking auth state:', error);
      
      // Try to handle wallet corruption automatically
      const wasFixed = await WalletErrorHandler.handleWalletError(error);
      if (wasFixed) {
        console.log('[useAuthState] Wallet corruption was fixed, rechecking...');
        // Recheck auth state after fix
        try {
          const hasWallet = await MultiChainWalletManager.getInstance().hasWallet();
          if (hasWallet) {
            const hasPassword = await MultiChainWalletManager.getInstance().hasPassword();
            const backupConfirmed = await MultiChainWalletManager.getInstance().isBackupConfirmed();
            const isAuthenticated = hasPassword && backupConfirmed;
            
            setAuthState({
              hasWallet,
              isAuthenticated,
              isLoading: false,
            });
            return;
          }
        } catch (retryError) {
          console.error('[useAuthState] Failed to recheck auth state after fix:', retryError);
        }
      }
      
      setAuthState({
        hasWallet: false,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  }, []);

  const refreshAuthState = useCallback(() => {
    setAuthState(prev => ({ ...prev, isLoading: true }));
    checkAuthState();
  }, [checkAuthState]);

  useEffect(() => {
    checkAuthState();
  }, [checkAuthState]);

  return {
    ...authState,
    refreshAuthState,
  };
}; 