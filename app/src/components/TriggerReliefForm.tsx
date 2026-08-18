import { useState } from "react";

import {
  formatConfidence,
  formatGen,
  readCampaign,
  severityName,
  shortAddress,
  triggerRelief,
  type Campaign,
} from "../lib/genlayer";
import {
  Alert,
  Button,
  Card,
  Field,
  SeverityBadge,
  Select,
  Spinner,
  TextInput,
} from "./ui";

const SAMPLE_URL =
  "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=us6000jllz";

/** Mirrors the pipeline the contract runs, so the wait is legible. */
const STAGES = [
  "Validating source domain",
  "Fetching report and building SHA-256 fence",
  "Validators judging across 15 models",
  "Applying payout gate and settling",
];

function ConsensusProgress() {
  return (
    <div className="space-y-2 rounded-xl border border-edge bg-void/50 p-4">
      <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-signal uppercase">
        <Spinner />
        Consensus in progress
      </div>
      <ul className="mt-2 space-y-1.5">
        {STAGES.map((stage, i) => (
          <li
            key={stage}
            style={{ animationDelay: `${i * 400}ms` }}
            className="animate-breathe flex items-center gap-2 text-xs text-slate-400"
          >
            <span className="h-1 w-1 rounded-full bg-signal" />
            {stage}
          </li>
        ))}
      </ul>
      <p className="pt-1 text-[11px] text-slate-600">
        Typically one to two minutes. Funds move when the transaction finalizes.
      </p>
    </div>
  );
}

function Outcome({ campaign }: { campaign: Campaign }) {
  const disbursed = campaign.status === "DISBURSED";
  const passed = campaign.verdict_code === 1;

  return (
    <div className="animate-rise space-y-3">
      <Alert kind={disbursed ? "success" : "info"}>
        {disbursed ? (
          <>
            <span className="font-semibold">Relief disbursed.</span> Escrow sent to{" "}
            <span className="font-mono text-xs">
              {shortAddress(campaign.relief_address)}
            </span>
            .
          </>
        ) : (
          <>
            <span className="font-semibold">Gate not cleared.</span> The escrow stays
            locked and can be retried with stronger evidence.
          </>
        )}
      </Alert>

      <div className="overflow-hidden rounded-xl border border-edge bg-void/50">
        <div className="grid grid-cols-3 divide-x divide-edge/70">
          <div className="px-3 py-4 text-center">
            <div className="text-[10px] font-bold tracking-[0.12em] text-slate-600 uppercase">
              Verdict
            </div>
            <div
              className={`mt-1.5 text-xl font-bold ${passed ? "text-relief" : "text-critical"}`}
            >
              {passed ? "PASS" : "FAIL"}
            </div>
          </div>
          <div className="px-3 py-4 text-center">
            <div className="text-[10px] font-bold tracking-[0.12em] text-slate-600 uppercase">
              Confidence
            </div>
            <div className="mt-1.5 font-mono text-xl font-bold text-slate-100 tabular-nums">
              {formatConfidence(campaign.confidence_bp)}
            </div>
          </div>
          <div className="px-3 py-4 text-center">
            <div className="text-[10px] font-bold tracking-[0.12em] text-slate-600 uppercase">
              Severity
            </div>
            <div className="mt-2">
              <SeverityBadge level={severityName(campaign.reported_severity_rank)} />
            </div>
          </div>
        </div>

        {campaign.reason && (
          <p className="border-t border-edge/70 px-4 py-3 text-sm leading-relaxed text-slate-300">
            {campaign.reason}
          </p>
        )}

        <p className="border-t border-edge/70 px-4 py-2.5 text-[11px] text-slate-600">
          Requires {campaign.severity_threshold} or higher and at least 75% confidence.
        </p>
      </div>
    </div>
  );
}

export function TriggerReliefForm({
  campaigns,
  selectedId,
  onSelect,
  onSettled,
}: {
  campaigns: Campaign[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onSettled: () => void;
}) {
  const [newsUrl, setNewsUrl] = useState(SAMPLE_URL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Campaign | null>(null);

  const now = Math.floor(Date.now() / 1000);
  const active = campaigns.filter(
    (c) => c.status === "ACTIVE" && now <= c.expiry,
  );
  const selectedCampaign = active.find((c) => c.campaign_id === selectedId);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedCampaign) return;
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      await triggerRelief(selectedCampaign.campaign_id, newsUrl);
      setResult(await readCampaign(selectedCampaign.campaign_id));
      onSettled();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Trigger Relief"
      subtitle="Submit evidence and let validator consensus decide"
      accent="relief"
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Campaign">
          <Select
            required
            value={selectedCampaign?.campaign_id ?? ""}
            onChange={(e) => onSelect(e.target.value ? Number(e.target.value) : null)}
            disabled={busy || active.length === 0}
          >
            <option value="">
              {active.length === 0 ? "No active campaigns" : "Select a campaign"}
            </option>
            {active.map((c) => (
              <option key={c.campaign_id} value={c.campaign_id}>
                #{c.campaign_id} {c.target_region} - {c.crisis_type} (
                {formatGen(c.atto_amount)} GEN)
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Evidence URL"
          hint="https only, on an allowlisted domain: earthquake.usgs.gov, api.reliefweb.int, news.google.com, rss.nytimes.com"
        >
          <TextInput
            required
            type="url"
            value={newsUrl}
            onChange={(e) => setNewsUrl(e.target.value)}
            spellCheck={false}
            disabled={busy}
          />
        </Field>

        {error && <Alert kind="error">{error}</Alert>}

        <Button
          type="submit"
          variant="relief"
          disabled={busy || !selectedCampaign}
          className="w-full"
        >
          {busy && <Spinner />}
          {busy ? "Awaiting consensus..." : "Submit evidence"}
        </Button>

        {busy && <ConsensusProgress />}
        {result && <Outcome campaign={result} />}
      </form>
    </Card>
  );
}
