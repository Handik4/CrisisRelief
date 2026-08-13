import { useCallback, useEffect, useState } from "react";

import { CampaignList } from "./components/CampaignList";
import { CreateCampaignForm } from "./components/CreateCampaignForm";
import { HowItWorks } from "./components/HowItWorks";
import { StatsBar } from "./components/StatsBar";
import { TriggerReliefForm } from "./components/TriggerReliefForm";
import { Alert, Button, LiveDot, Spinner } from "./components/ui";
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

function Meta({
  label,
  value,
  mono = true,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: string;
}) {
  return (
    <div className="text-right">
      <div className="text-[10px] font-bold tracking-[0.14em] text-slate-600 uppercase">
        {label}
      </div>
      <div
        className={`mt-0.5 text-xs ${mono ? "font-mono" : ""} ${accent ?? "text-slate-300"}`}
      >
        {value}
      </div>
    </div>
  );
}

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
          <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-signal/20 to-critical/20 text-xl ring-1 ring-signal/30">
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

        <div className="flex flex-wrap items-center gap-5">
          <Meta
            label={`Contract, chain ${CHAIN_ID}`}
            value={shortAddress(CONTRACT_ADDRESS)}
            accent="text-signal"
          />
          <Meta label="Your burner" value={shortAddress(account.address)} />
          <Meta
            label="Balance"
            value={balance === null ? "..." : `${formatGen(balance)} GEN`}
            accent="text-slate-100"
          />
          <Button variant="ghost" onClick={onFund} disabled={funding}>
            {funding && <Spinner />}
            {funding ? "Funding" : "Faucet"}
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
    <div className="min-h-screen text-slate-200">
      <Header balance={balance} onFund={handleFund} funding={funding} />

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        {error && <Alert kind="error">{error}</Alert>}

        <HowItWorks />
        <StatsBar campaigns={campaigns} />

        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          <CampaignList
            campaigns={campaigns}
            loading={loading}
            onSelect={setSelectedId}
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
          <button
            onClick={resetAccount}
            className="transition hover:text-slate-400"
          >
            Reset burner account
          </button>
        </footer>
      </main>
    </div>
  );
}
