import { useState } from "react";

import {
  formatConfidence,
  formatGen,
  readCampaign,
  severityName,
  triggerRelief,
  type Campaign,
} from "../lib/genlayer";
import { Alert, Button, Card, Field, Select, Spinner, TextInput } from "./ui";

const SAMPLE_URL =
  "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=us6000jllz";

function Outcome({ campaign }: { campaign: Campaign }) {
  const disbursed = campaign.status === "DISBURSED";
  const passed = campaign.verdict_code === 1;

  return (
    <div className="space-y-3">
      <Alert kind={disbursed ? "success" : "info"}>
        {disbursed
          ? `Relief disbursed to ${campaign.relief_address}.`
          : "Evaluation complete. The gate was not cleared, so the escrow stays locked."}
      </Alert>

      <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-[11px] tracking-wide text-slate-500 uppercase">
              Verdict
            </div>
            <div
              className={`mt-1 text-lg font-semibold ${
                passed ? "text-emerald-300" : "text-rose-300"
              }`}
            >
              {passed ? "PASS" : "FAIL"}
            </div>
          </div>
          <div>
            <div className="text-[11px] tracking-wide text-slate-500 uppercase">
              Confidence
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-100">
              {formatConfidence(campaign.confidence_bp)}
            </div>
          </div>
          <div>
            <div className="text-[11px] tracking-wide text-slate-500 uppercase">
              Severity
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-100">
              {severityName(campaign.reported_severity_rank)}
            </div>
          </div>
        </div>

        {campaign.reason && (
          <p className="mt-4 border-t border-slate-800 pt-3 text-sm leading-relaxed text-slate-300">
            {campaign.reason}
          </p>
        )}

        <p className="mt-3 text-xs text-slate-500">
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

  const active = campaigns.filter((c) => c.status === "ACTIVE");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (selectedId === null) return;
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      await triggerRelief(selectedId, newsUrl);
      setResult(await readCampaign(selectedId));
      onSettled();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Trigger relief"
      subtitle="Submit a report and let validator consensus decide"
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Campaign">
          <Select
            required
            value={selectedId ?? ""}
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
          hint="Must be https on an allowlisted domain: earthquake.usgs.gov, api.reliefweb.int, news.google.com, rss.nytimes.com"
        >
          <TextInput
            required
            type="url"
            value={newsUrl}
            onChange={(e) => setNewsUrl(e.target.value)}
            disabled={busy}
          />
        </Field>

        {error && <Alert kind="error">{error}</Alert>}

        <Button type="submit" disabled={busy || selectedId === null}>
          {busy && <Spinner />}
          {busy ? "Awaiting consensus..." : "Submit evidence"}
        </Button>

        {busy && (
          <p className="text-xs text-slate-500">
            Validators are fetching the report, applying the prompt fence and voting.
            This usually takes a minute or two.
          </p>
        )}

        {result && <Outcome campaign={result} />}
      </form>
    </Card>
  );
}
