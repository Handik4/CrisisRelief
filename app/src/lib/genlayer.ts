import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus, type CalldataEncodable } from "genlayer-js/types";

import deployment from "./deployment.json";
import { getInjectedProvider } from "./wallet";

export const CONTRACT_ADDRESS = deployment.contract_address as `0x${string}`;
export const CHAIN_ID = deployment.chain_id;
export const EXPLORER = "https://genlayer-explorer.vercel.app";

export const ONE_GEN = 10n ** 18n;

const STORAGE_KEY = "crisisrelief.privateKey";

/**
 * StudioNet is a sandbox, so the dashboard can fall back to a burner key in
 * localStorage for instant testing. Nothing it holds is meant to have value.
 */
function loadOrCreatePrivateKey(): `0x${string}` {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored?.startsWith("0x")) {
    return stored as `0x${string}`;
  }
  const key = generatePrivateKey();
  localStorage.setItem(STORAGE_KEY, key);
  return key;
}

export const burnerAccount = createAccount(loadOrCreatePrivateKey());

/**
 * Reads never sign, so they always go straight to the RPC regardless of which
 * wallet is connected. Keeping a dedicated client means the campaign list still
 * loads when no wallet is connected at all.
 */
const readClient = createClient({ chain: studionet, account: burnerAccount });

export type WalletMode = "burner" | "injected";

type ActiveWallet = { mode: WalletMode; address: `0x${string}` };

let activeWallet: ActiveWallet = {
  mode: "burner",
  address: burnerAccount.address as `0x${string}`,
};

/**
 * genlayer-js decides how to sign from the shape of `account`: an Account
 * object signs locally, while a bare address delegates eth_sendTransaction to
 * the injected provider. That is the whole difference between the two modes.
 */
export function setActiveWallet(next: ActiveWallet) {
  activeWallet = next;
}

export function getActiveWallet(): ActiveWallet {
  return activeWallet;
}

function writeClient() {
  if (activeWallet.mode === "burner") {
    return createClient({ chain: studionet, account: burnerAccount });
  }
  const provider = getInjectedProvider();
  if (!provider) {
    throw new Error("Wallet disconnected. Reconnect or switch to the burner wallet.");
  }
  return createClient({
    chain: studionet,
    account: activeWallet.address,
    provider,
  });
}

export function resetBurnerAccount() {
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type CampaignStatus = "ACTIVE" | "EVALUATING" | "DISBURSED" | "REFUNDED";

export type Campaign = {
  campaign_id: number;
  donor: string;
  target_region: string;
  crisis_type: string;
  relief_address: string;
  severity_threshold: string;
  severity_rank_required: number;
  atto_amount: number | bigint;
  status: CampaignStatus;
  evidence_url: string;
  verdict_code: number;
  confidence_bp: number;
  reported_severity_rank: number;
  reason: string;
  created_at: number;
  expiry: number;
};

export type TrustModel = {
  name: string;
  description: string;
  allowed_domains: string[];
  severity_levels: string[];
  confidence_scale_bp: number;
  min_confidence_bp: number;
  confidence_tolerance_bp: number;
  prompt_fencing: string;
  numeric_policy: string;
  settlement_window_seconds: number;
  statuses: string[];
  owner: string;
};

export const SEVERITY_LEVELS = [
  "MINOR",
  "MODERATE",
  "SEVERE",
  "CATASTROPHIC",
] as const;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function readTrustModel(): Promise<TrustModel> {
  return (await readClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_trust_model",
    args: [],
  })) as TrustModel;
}

export async function readCampaignCount(): Promise<number> {
  const raw = await readClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_campaign_count",
    args: [],
  });
  return Number(raw);
}

export async function readCampaign(id: number): Promise<Campaign> {
  return (await readClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_campaign",
    args: [id],
  })) as Campaign;
}

export async function readAllCampaigns(): Promise<Campaign[]> {
  const count = await readCampaignCount();
  if (count === 0) return [];
  const ids = Array.from({ length: count }, (_, i) => i + 1);
  const settled = await Promise.allSettled(ids.map(readCampaign));
  return settled
    .filter((r): r is PromiseFulfilledResult<Campaign> => r.status === "fulfilled")
    .map((r) => r.value)
    .reverse();
}

export async function readBalance(address: string): Promise<bigint> {
  return await readClient.getBalance({ address: address as `0x${string}` });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function send(
  functionName: string,
  args: CalldataEncodable[],
  value: bigint,
): Promise<{ hash: string; receipt: unknown }> {
  // Resolved per call, so a wallet change between transactions is picked up
  // without any component needing to rebuild a client.
  const client = writeClient();
  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value,
  });
  // Wait for FINALIZED, not ACCEPTED: `emit_transfer` is an external message
  // that only runs once the triggering transaction finalizes, so the escrow
  // has not actually moved until then.
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    interval: 6000,
    retries: 120,
  });
  return { hash, receipt };
}

export async function createCampaign(params: {
  targetRegion: string;
  crisisType: string;
  reliefAddress: string;
  severityThreshold: string;
  amountGen: string;
}) {
  const atto = parseGen(params.amountGen);
  if (atto <= 0n) throw new Error("Deposit must be greater than zero");
  return send(
    "create_campaign",
    [
      params.targetRegion,
      params.crisisType,
      params.reliefAddress,
      params.severityThreshold,
    ],
    atto,
  );
}

export async function triggerRelief(campaignId: number, newsUrl: string) {
  return send("trigger_relief", [campaignId, newsUrl], 0n);
}

export async function reclaimFunds(campaignId: number) {
  return send("reclaim_funds", [campaignId], 0n);
}

/**
 * StudioNet exposes a faucet RPC that credits any address, so it works for a
 * connected MetaMask account just as well as for the burner. It is not in the
 * typed client surface, so call it through the raw provider.
 */
export async function fundAddress(address: string, amountGen = 100) {
  // The faucet compares the amount numerically server side, so it has to go
  // over the wire as a JSON number rather than a decimal string. Whole GEN
  // amounts stay exactly representable as doubles well past any useful size.
  await readClient.request({
    method: "sim_fundAccount" as never,
    params: [address, amountGen * 1e18] as never,
  });
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function parseGen(input: string): bigint {
  const trimmed = input.trim();
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === "" || trimmed === ".") {
    throw new Error("Enter a GEN amount, for example 2.5");
  }
  const [whole, fraction = ""] = trimmed.split(".");
  const padded = (fraction + "0".repeat(18)).slice(0, 18);
  return BigInt(whole || "0") * ONE_GEN + BigInt(padded || "0");
}

export function formatGen(atto: bigint | number, decimals = 4): string {
  const value = BigInt(atto);
  const whole = value / ONE_GEN;
  const remainder = value % ONE_GEN;
  if (remainder === 0n) return whole.toString();
  const fraction = remainder.toString().padStart(18, "0").slice(0, decimals);
  return `${whole}.${fraction}`.replace(/\.?0+$/, "");
}

export function shortAddress(address: string): string {
  if (!address || address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatConfidence(bp: number): string {
  return `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 2)}%`;
}

export function severityName(rank: number): string {
  return SEVERITY_LEVELS[rank - 1] ?? "UNRATED";
}
