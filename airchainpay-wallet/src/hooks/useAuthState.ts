import { useState, useEffect, useCallback } from 'react';
import { MultiChainWalletManager } from '../wallet/MultiChainWalletManager';

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