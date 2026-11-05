import { t, useLocale } from "./i18n";
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { toast } from "sonner";
import { listen } from "@tauri-apps/api/event";
import {
  getAuthState,
  logoutAccount,
  setSelectedToken as apiSetSelectedToken,
  getUserWallet,
  isTauri,
} from "./api";
import type { CurrentAuthState, UserInfo, TokenItem, UserWalletInfo } from "../types";

interface AuthContextType {
  authState: CurrentAuthState;
  isAuthReady: boolean;
  refreshState: () => Promise<void>;
  wallet: UserWalletInfo | null;
  isLoadingWallet: boolean;
  walletError: string | null;
  refreshWallet: () => Promise<void>;
  loginModalOpen: boolean;
  setLoginModalOpen: (open: boolean) => void;
  tokenModalOpen: boolean;
  setTokenModalOpen: (open: boolean) => void;
  logout: () => Promise<void>;
  onLoginSuccess: (user: UserInfo) => void;
  onTokenSelected: (key: string, token: TokenItem) => void;
}

const defaultState: CurrentAuthState = {
  is_logged_in: false,
  user: null,
  selected_token_id: null,
  selected_token_name: null,
  access_token_expires_at: null,
};

const AuthContext = createContext<AuthContextType>({
  authState: defaultState,
  isAuthReady: false,
  refreshState: async () => {},
  wallet: null,
  isLoadingWallet: false,
  walletError: null,
  refreshWallet: async () => {},
  loginModalOpen: false,
  setLoginModalOpen: () => {},
  tokenModalOpen: false,
  setTokenModalOpen: () => {},
  logout: async () => {},
  onLoginSuccess: () => {},
  onTokenSelected: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useLocale();
  const [authState, setAuthState] = useState<CurrentAuthState>(defaultState);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [wallet, setWallet] = useState<UserWalletInfo | null>(null);
  const [isLoadingWallet, setIsLoadingWallet] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  const refreshState = useCallback(async () => {
    try {
      const state = await getAuthState();
      setAuthState(state);
    } catch (err) {
      console.warn("Failed to get auth state:", err);
    } finally {
      setIsAuthReady(true);
    }
  }, []);

  const refreshWallet = useCallback(async () => {
    if (!authState.is_logged_in) {
      setWallet(null);
      setWalletError(null);
      return;
    }
    setIsLoadingWallet(true);
    setWalletError(null);
    try {
      const data = await getUserWallet();
      setWallet(data);
    } catch (err: unknown) {
      const msg = typeof err === "string" ? err : (err as Error)?.message || t("ui.43c39aa5ccfb");
      setWalletError(msg);
      console.warn("Failed to get wallet balance:", err);
    } finally {
      setIsLoadingWallet(false);
    }
  }, [authState.is_logged_in]);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  useEffect(() => {
    if (authState.is_logged_in) {
      void refreshWallet();
    } else {
      setWallet(null);
      setWalletError(null);
    }
  }, [authState.is_logged_in, authState.user?.id, refreshWallet]);

  useEffect(() => {
    if (!authState.is_logged_in || !isTauri) return;
    const refresh = () => void refreshWallet();
    const subscription = listen("wallet-refresh", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      void subscription.then((unlisten) => unlisten());
    };
  }, [authState.is_logged_in, refreshWallet]);

  const logout = async () => {
    try {
      await logoutAccount();
      setWallet(null);
      setWalletError(null);
      await refreshState();
      toast.info(t("ui.d24ba97272cd"));
    } catch {
      toast.error(t("ui.be5702badc66"));
    }
  };

  const onLoginSuccess = (_user: UserInfo) => {
    void refreshState();
    void refreshWallet();
  };

  const onTokenSelected = (_key: string, token: TokenItem) => {
    void apiSetSelectedToken(token.id, token.name);
    setAuthState((prev) => ({
      ...prev,
      selected_token_id: token.id,
      selected_token_name: token.name,
    }));
  };

  return (
    <AuthContext.Provider
      value={{
        authState,
        isAuthReady,
        refreshState,
        wallet,
        isLoadingWallet,
        walletError,
        refreshWallet,
        loginModalOpen,
        setLoginModalOpen,
        tokenModalOpen,
        setTokenModalOpen,
        logout,
        onLoginSuccess,
        onTokenSelected,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
export default useAuth;
