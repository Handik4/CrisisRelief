import { useCallback, useEffect, useState } from "react";

import { CampaignList } from "./components/CampaignList";
import { CreateCampaignForm } from "./components/CreateCampaignForm";
import { HowItWorks } from "./components/HowItWorks";
import { StatsBar } from "./components/StatsBar";
import { TriggerReliefForm } from "./components/TriggerReliefForm";
import { WalletMenu } from "./components/WalletMenu";
import { Alert, Button, LiveDot } from "./components/ui";
import { WalletProvider, useWallet } from "./lib/WalletContext";
import {
  CHAIN_ID,
  CONTRACT_ADDRESS,
  fundAddress,
  reclaimFunds,
  readAllCampaigns,
  readBalance,
  resetBurnerAccount,
  shortAddress,
  type Campaign,
} from "./lib/genlayer";

function Header({
  balance,
  onFund,
  funding,
}: {
  balance: bigint | null;
  onFund: () => void;
  funding: boolean;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-edge/70 bg-void/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-6 py-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-signal/20 to-critical/20 text-xl ring-1 ring-signal/30">
            &#9760;
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-50">
              CrisisRelief
            </h1>
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <LiveDot />
              Autonomous AI disaster relief vault
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="hidden text-right lg:block">
            <div className="text-[10px] font-bold tracking-[0.14em] text-slate-600 uppercase">
              Contract, chain {CHAIN_ID}
            </div>
            <div className="mt-0.5 font-mono text-xs text-signal">
              {shortAddress(CONTRACT_ADDRESS)}
            </div>
          </div>

          <WalletMenu balance={balance} onFund={onFund} funding={funding} />
        </div>
      </div>
    </header>
  );
}

/** Full-width warning shown while a connected wallet is on the wrong chain. */
function NetworkBanner() {
  const wallet = useWallet();
  if (!wallet.wrongNetwork) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-critical/30 bg-critical/10 px-4 py-3">
      <p className="text-sm text-rose-200">
        <span className="font-semibold">Wrong network.</span> Your wallet is on chain{" "}
        {wallet.chainId}. CrisisRelief is deployed on StudioNet ({CHAIN_ID}), so
        transactions will not reach the contract until you switch.
      </p>
      <Button onClick={wallet.switchNetwork} disabled={wallet.switching}>
        {wallet.switching ? "Switching..." : "Switch to StudioNet"}
      </Button>
    </div>
  );
}

function Dashboard() {
  const wallet = useWallet();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(true);
  const [funding, setFunding] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reclaimingId, setReclaimingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, bal] = await Promise.all([
        readAllCampaigns(),
        readBalance(wallet.address),
      ]);
      setCampaigns(list);
      setBalance(bal);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [wallet.address]);

  // Re-reads whenever the active address changes, so the balance always
  // belongs to the wallet that would actually sign.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleFund() {
    setFunding(true);
    try {
      await fundAddress(wallet.address);
      await new Promise((r) => setTimeout(r, 6000));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFunding(false);
    }
  }

  async function handleReclaim(campaignId: number) {
    setReclaimingId(campaignId);
    setError(null);
    try {
      await reclaimFunds(campaignId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReclaimingId(null);
    }
  }

  return (
    <div className="min-h-screen text-slate-200">
      <Header balance={balance} onFund={handleFund} funding={funding} />

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        {wallet.error && <Alert kind="error">{wallet.error}</Alert>}
        {error && <Alert kind="error">{error}</Alert>}
        <NetworkBanner />

        <HowItWorks />
        <StatsBar campaigns={campaigns} />

        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          <CampaignList
            campaigns={campaigns}
            loading={loading}
            onSelect={setSelectedId}
            walletAddress={wallet.address}
            reclaimingId={reclaimingId}
            onReclaim={handleReclaim}
          />

          <div className="space-y-6">
            <CreateCampaignForm onCreated={refresh} />
            <TriggerReliefForm
              campaigns={campaigns}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onSettled={refresh}
            />
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-edge/70 pt-6 text-[11px] text-slate-600">
          <span>
            Funds release only when validator consensus confirms an allowlisted report
            matches the campaign region, type and severity.
          </span>
          {wallet.mode === "burner" && (
            <button
              onClick={resetBurnerAccount}
              className="transition hover:text-slate-400"
            >
              Reset burner account
            </button>
          )}
        </footer>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <Dashboard />
    </WalletProvider>
  );
}
