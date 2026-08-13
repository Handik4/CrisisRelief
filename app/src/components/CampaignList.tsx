import {
  formatConfidence,
  formatGen,
  severityName,
  shortAddress,
  type Campaign,
} from "../lib/genlayer";
import { Card, StatusPill } from "./ui";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] tracking-wide text-slate-500 uppercase">{label}</div>
      <div className="mt-0.5 text-sm text-slate-200">{value}</div>
    </div>
  );
}

function Verdict({ campaign }: { campaign: Campaign }) {
  if (!campaign.evidence_url) return null;

  const passed = campaign.verdict_code === 1;
  const disbursed = campaign.status === "DISBURSED";

  return (
    <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-xs font-semibold ${
            passed ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
          }`}
        >
          consensus: {passed ? "PASS" : "FAIL"}
        </span>
        <span className="text-xs text-slate-400">
          confidence {formatConfidence(campaign.confidence_bp)}
        </span>
        <span className="text-xs text-slate-400">
          reported {severityName(campaign.reported_severity_rank)}
        </span>
        {!disbursed && passed && (
          <span className="text-xs text-amber-300">gate not cleared</span>
        )}
      </div>

      {campaign.reason && (
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{campaign.reason}</p>
      )}

      <a
        href={campaign.evidence_url}
        target="_blank"
        rel="noreferrer"
        className="mt-2 block truncate text-xs text-sky-400 hover:text-sky-300"
      >
        {campaign.evidence_url}
      </a>
    </div>
  );
}

export function CampaignList({
  campaigns,
  loading,
  onSelect,
}: {
  campaigns: Campaign[];
  loading: boolean;
  onSelect: (id: number) => void;
}) {
  const locked = campaigns
    .filter((c) => c.status === "ACTIVE")
    .reduce((sum, c) => sum + BigInt(c.atto_amount), 0n);

  return (
    <Card
      title="Campaigns"
      subtitle={`${campaigns.length} total, ${formatGen(locked)} GEN still in escrow`}
    >
      {loading && campaigns.length === 0 && (
        <p className="text-sm text-slate-400">Loading campaigns from StudioNet...</p>
      )}

      {!loading && campaigns.length === 0 && (
        <p className="text-sm text-slate-400">
          No campaigns yet. Create one to lock relief funds in escrow.
        </p>
      )}

      <ul className="space-y-3">
        {campaigns.map((campaign) => (
          <li
            key={campaign.campaign_id}
            className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 transition hover:border-slate-700"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">
                    #{campaign.campaign_id}
                  </span>
                  <h3 className="text-base font-semibold text-slate-100">
                    {campaign.target_region}
                  </h3>
                </div>
                <p className="mt-0.5 text-sm text-slate-400 capitalize">
                  {campaign.crisis_type}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusPill status={campaign.status} />
                {campaign.status === "ACTIVE" && (
                  <button
                    onClick={() => onSelect(campaign.campaign_id)}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:border-sky-600 hover:text-sky-300"
                  >
                    Submit evidence
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric
                label="Locked"
                value={`${formatGen(campaign.atto_amount)} GEN`}
              />
              <Metric label="Min severity" value={campaign.severity_threshold} />
              <Metric
                label="Recipient"
                value={shortAddress(campaign.relief_address)}
              />
              <Metric label="Donor" value={shortAddress(campaign.donor)} />
            </div>

            <Verdict campaign={campaign} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
