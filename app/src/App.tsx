import { useCallback, useEffect, useState } from "react";

import { CampaignList } from "./components/CampaignList";
import { CreateCampaignForm } from "./components/CreateCampaignForm";
import { TriggerReliefForm } from "./components/TriggerReliefForm";
import { Alert, Button } from "./components/ui";
import {
  CHAIN_ID,
  CONTRACT_ADDRESS,
  account,
  formatGen,
  fundSelf,
  readAllCampaigns,
  readBalance,
  resetAccount,
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
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-50">
            CrisisRelief
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Autonomous AI disaster relief vault
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-right">
          <div>
            <div className="text-[11px] tracking-wide text-slate-500 uppercase">
              Contract, chain {CHAIN_ID}
            </div>
            <code className="text-xs text-sky-400">
              {shortAddress(CONTRACT_ADDRESS)}
            </code>
          </div>
          <div>
            <div className="text-[11px] tracking-wide text-slate-500 uppercase">
              Your burner
            </div>
            <code className="text-xs text-slate-300">
              {shortAddress(account.address)}
            </code>
          </div>
          <div>
            <div className="text-[11px] tracking-wide text-slate-500 uppercase">
              Balance
            </div>
            <span className="text-xs text-slate-200">
              {balance === null ? "..." : `${formatGen(balance)} GEN`}
            </span>
          </div>
          <Button variant="ghost" onClick={onFund} disabled={funding}>
            {funding ? "Funding..." : "Faucet"}
          </Button>
        </div>
      </div>
    </header>
  );
}

export default function App() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(true);
  const [funding, setFunding] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, bal] = await Promise.all([
        readAllCampaigns(),
        readBalance(account.address),
      ]);
      setCampaigns(list);
      setBalance(bal);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleFund() {
    setFunding(true);
    try {
      await fundSelf();
      await new Promise((r) => setTimeout(r, 6000));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFunding(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <Header balance={balance} onFund={handleFund} funding={funding} />

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {error && <Alert kind="error">{error}</Alert>}

        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          <div className="space-y-6">
            <CampaignList
              campaigns={campaigns}
              loading={loading}
              onSelect={setSelectedId}
            />
          </div>

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

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-6 text-xs text-slate-500">
          <span>
            Funds release only when validator consensus confirms an allowlisted report
            matches the campaign region, type and severity.
          </span>
          <button onClick={resetAccount} className="hover:text-slate-300">
            Reset burner account
          </button>
        </footer>
      </main>
    </div>
  );
}
