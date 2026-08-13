import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { burnerAccount, setActiveWallet, type WalletMode } from "./genlayer";
import {
  STUDIONET_CHAIN_ID,
  WalletError,
  getChainId,
  getSilentAccounts,
  hasInjectedProvider,
  onWalletEvent,
  requestAccounts,
  switchToStudioNet,
} from "./wallet";

const MODE_KEY = "crisisrelief.walletMode";

type WalletState = {
  mode: WalletMode;
  address: `0x${string}`;
  chainId: number | null;
  /** Only meaningful in injected mode; the burner always talks to StudioNet. */
  wrongNetwork: boolean;
  providerAvailable: boolean;
  connecting: boolean;
  switching: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  useBurner: () => void;
  switchNetwork: () => Promise<void>;
  clearError: () => void;
};

const WalletContext = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const burnerAddress = burnerAccount.address as `0x${string}`;

  const [mode, setMode] = useState<WalletMode>("burner");
  const [injectedAddress, setInjectedAddress] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const providerAvailable = useMemo(() => hasInjectedProvider(), []);
  const address = mode === "injected" && injectedAddress ? injectedAddress : burnerAddress;

  // Keep the signing layer in step with the UI on every change.
  useEffect(() => {
    setActiveWallet({ mode, address });
  }, [mode, address]);

  const applyInjected = useCallback(async (accounts: string[]) => {
    if (!accounts.length) return false;
    setInjectedAddress(accounts[0] as `0x${string}`);
    setChainId(await getChainId());
    setMode("injected");
    localStorage.setItem(MODE_KEY, "injected");
    return true;
  }, []);

  // Restore a previous session without prompting: eth_accounts only returns
  // addresses the user has already authorised.
  useEffect(() => {
    if (localStorage.getItem(MODE_KEY) !== "injected" || !providerAvailable) return;
    void (async () => {
      const accounts = await getSilentAccounts();
      if (!accounts.length) {
        localStorage.removeItem(MODE_KEY);
        return;
      }
      await applyInjected(accounts);
    })();
  }, [providerAvailable, applyInjected]);

  // React to the user changing account or network inside the wallet itself.
  useEffect(() => {
    if (!providerAvailable) return;

    const offAccounts = onWalletEvent("accountsChanged", (accounts) => {
      const list = (accounts ?? []) as unknown as string[];
      if (!list.length) {
        // The user revoked access from inside the wallet.
        setInjectedAddress(null);
        setMode("burner");
        localStorage.removeItem(MODE_KEY);
        return;
      }
      setInjectedAddress(list[0] as `0x${string}`);
    });

    const offChain = onWalletEvent("chainChanged", (hex) => {
      setChainId(parseInt(hex as unknown as string, 16));
    });

    return () => {
      offAccounts();
      offChain();
    };
  }, [providerAvailable]);

  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      await applyInjected(await requestAccounts());
    } catch (err) {
      setError(
        err instanceof WalletError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not connect.",
      );
    } finally {
      setConnecting(false);
    }
  }, [applyInjected]);

  const useBurner = useCallback(() => {
    setError(null);
    setMode("burner");
    localStorage.removeItem(MODE_KEY);
  }, []);

  const disconnect = useCallback(() => {
    // A dapp cannot revoke wallet access; it can only stop using it. Falling
    // back to the burner keeps the dashboard usable rather than dead-ending.
    setInjectedAddress(null);
    useBurner();
  }, [useBurner]);

  const switchNetwork = useCallback(async () => {
    setError(null);
    setSwitching(true);
    try {
      await switchToStudioNet();
      setChainId(await getChainId());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch network.");
    } finally {
      setSwitching(false);
    }
  }, []);

  const value: WalletState = {
    mode,
    address,
    chainId,
    wrongNetwork: mode === "injected" && chainId !== null && chainId !== STUDIONET_CHAIN_ID,
    providerAvailable,
    connecting,
    switching,
    error,
    connect,
    disconnect,
    useBurner,
    switchNetwork,
    clearError: () => setError(null),
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
