import { studionet } from "genlayer-js/chains";

export const STUDIONET_CHAIN_ID = studionet.id; // 61999
export const STUDIONET_CHAIN_ID_HEX = `0x${STUDIONET_CHAIN_ID.toString(16)}`;
export const STUDIONET_RPC = studionet.rpcUrls.default.http[0];

/** Minimal EIP-1193 surface, so we do not depend on a wallet SDK. */
export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: never[]) => void) => void;
  removeListener?: (event: string, handler: (...args: never[]) => void) => void;
  isMetaMask?: boolean;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] };
  }
}

export class WalletError extends Error {
  constructor(
    message: string,
    readonly kind: "no-provider" | "rejected" | "chain" | "unknown",
  ) {
    super(message);
    this.name = "WalletError";
  }
}

/**
 * Prefer an explicitly MetaMask provider when several wallets inject
 * themselves, which is the usual cause of "the wrong wallet opened".
 */
export function getInjectedProvider(): Eip1193Provider | null {
  const injected = window.ethereum;
  if (!injected) return null;
  if (injected.providers?.length) {
    return injected.providers.find((p) => p.isMetaMask) ?? injected.providers[0];
  }
  return injected;
}

export function hasInjectedProvider(): boolean {
  return getInjectedProvider() !== null;
}

function isUserRejection(err: unknown): boolean {
  // EIP-1193 userRejectedRequest.
  return typeof err === "object" && err !== null && "code" in err && err.code === 4001;
}

export async function requestAccounts(): Promise<string[]> {
  const provider = getInjectedProvider();
  if (!provider) {
    throw new WalletError(
      "No Web3 wallet detected. Install MetaMask, or use the StudioNet burner wallet.",
      "no-provider",
    );
  }
  try {
    const accounts = (await provider.request({
      method: "eth_requestAccounts",
    })) as string[];
    if (!accounts?.length) {
      throw new WalletError("Wallet returned no accounts.", "unknown");
    }
    return accounts;
  } catch (err) {
    if (err instanceof WalletError) throw err;
    if (isUserRejection(err)) {
      throw new WalletError("Connection request was rejected.", "rejected");
    }
    throw new WalletError(
      err instanceof Error ? err.message : "Could not connect to the wallet.",
      "unknown",
    );
  }
}

/** Accounts already authorised, without triggering a popup. */
export async function getSilentAccounts(): Promise<string[]> {
  const provider = getInjectedProvider();
  if (!provider) return [];
  try {
    return ((await provider.request({ method: "eth_accounts" })) as string[]) ?? [];
  } catch {
    return [];
  }
}

export async function getChainId(): Promise<number | null> {
  const provider = getInjectedProvider();
  if (!provider) return null;
  try {
    const hex = (await provider.request({ method: "eth_chainId" })) as string;
    return parseInt(hex, 16);
  } catch {
    return null;
  }
}

/**
 * Ask the wallet to move to StudioNet, adding the network first if the wallet
 * has never seen it (error 4902).
 */
export async function switchToStudioNet(): Promise<void> {
  const provider = getInjectedProvider();
  if (!provider) {
    throw new WalletError("No Web3 wallet detected.", "no-provider");
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: STUDIONET_CHAIN_ID_HEX }],
    });
    return;
  } catch (err) {
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? (err as { code: number }).code
        : null;

    if (isUserRejection(err)) {
      throw new WalletError("Network switch was rejected.", "rejected");
    }

    // 4902: unrecognised chain. Some wallets nest it under `data`.
    const nested =
      typeof err === "object" && err !== null && "data" in err
        ? (err as { data?: { originalError?: { code?: number } } }).data
            ?.originalError?.code
        : null;

    if (code !== 4902 && nested !== 4902) {
      throw new WalletError(
        err instanceof Error ? err.message : "Could not switch network.",
        "chain",
      );
    }
  }

  try {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: STUDIONET_CHAIN_ID_HEX,
          chainName: "GenLayer Studio Network",
          rpcUrls: [STUDIONET_RPC],
          nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
          blockExplorerUrls: ["https://genlayer-explorer.vercel.app"],
        },
      ],
    });
  } catch (err) {
    if (isUserRejection(err)) {
      throw new WalletError("Adding the StudioNet network was rejected.", "rejected");
    }
    throw new WalletError(
      err instanceof Error ? err.message : "Could not add the StudioNet network.",
      "chain",
    );
  }
}

export function onWalletEvent(
  event: "accountsChanged" | "chainChanged",
  handler: (payload: never) => void,
): () => void {
  const provider = getInjectedProvider();
  if (!provider?.on) return () => {};
  provider.on(event, handler);
  return () => provider.removeListener?.(event, handler);
}
