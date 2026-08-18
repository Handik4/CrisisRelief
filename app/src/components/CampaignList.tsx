import {
  formatConfidence,
  formatGen,
  severityName,
  shortAddress,
  type Campaign,
} from "../lib/genlayer";
import { Button, Card, SeverityBadge, StatusPill } from "./ui";

function Metric({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold tracking-[0.12em] text-slate-600 uppercase">
        {label}
      </div>
      <div className="mt-1 text-sm text-slate-200">{children}</div>
    </div>
  );
}

function ConsensusPanel({ campaign }: { campaign: Campaign }) {
  if (!campaign.evidence_url) return null;

  const passed = campaign.verdict_code === 1;
  const cleared = campaign.status === "DISBURSED";

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-edge bg-void/50">
      <div className="flex flex-wrap items-center gap-2 border-b border-edge/70 px-4 py-2.5">
        <span
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wider uppercase ${
            passed
              ? "bg-relief/10 text-relief ring-1 ring-relief/30"
              : "bg-critical/10 text-critical ring-1 ring-critical/30"
          }`}
        >
          Consensus {passed ? "PASS" : "FAIL"}
        </span>

        <span className="font-mono text-xs text-slate-400">
          {formatConfidence(campaign.confidence_bp)} confidence
        </span>

        <SeverityBadge level={severityName(campaign.reported_severity_rank)} />

        {passed && !cleared && (
          <span className="text-[11px] text-alert">gate not cleared</span>
        )}
      </div>

      <div className="px-4 py-3">
        {campaign.reason && (
          <p className="text-sm leading-relaxed text-slate-300">{campaign.reason}</p>
        )}
        <a
          href={campaign.evidence_url}
          target="_blank"
          rel="noreferrer"
          className="mt-2.5 block truncate font-mono text-[11px] text-signal/70 transition hover:text-signal"
        >
          {campaign.evidence_url}
        </a>
      </div>
    </div>
  );
}

export function CampaignList({
  campaigns,
  loading,
  onSelect,
  walletAddress,
  reclaimingId,
  onReclaim,
}: {
  campaigns: Campaign[];
  loading: boolean;
  onSelect: (id: number) => void;
  walletAddress: string;
  reclaimingId: number | null;
  onReclaim: (id: number) => void;
}) {
  const now = Math.floor(Date.now() / 1000);

  return (
    <Card
      title="Relief Campaigns"
      subtitle={`${campaigns.length} on chain`}
      action={
        loading && campaigns.length > 0 ? (
          <span className="animate-breathe text-[11px] text-slate-500">syncing</span>
        ) : undefined
      }
    >
      {loading && campaigns.length === 0 && (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="animate-breathe h-32 rounded-xl border border-edge bg-charcoal-soft/40"
            />
          ))}
        </div>
      )}

      {!loading && campaigns.length === 0 && (
        <div className="rounded-xl border border-dashed border-edge px-6 py-12 text-center">
          <div className="text-3xl opacity-40">&#128230;</div>
          <p className="mt-3 text-sm text-slate-400">No campaigns yet.</p>
          <p className="mt-1 text-xs text-slate-600">
            Lock emergency GEN to arm the first vault.
          </p>
        </div>
      )}

      <ul className="space-y-3">
        {campaigns.map((campaign, index) => {
          const expired = now > campaign.expiry;
          const donor = campaign.donor.toLowerCase() === walletAddress.toLowerCase();
          const reclaimable = campaign.status === "ACTIVE" && expired && donor;
          const evidenceOpen = campaign.status === "ACTIVE" && !expired;

          return (
            <li
              key={campaign.campaign_id}
              style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
              className="animate-rise group rounded-xl border border-edge bg-charcoal-soft/40 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-700 hover:bg-charcoal-soft/70"
            >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-slate-600">
                    #{String(campaign.campaign_id).padStart(3, "0")}
                  </span>
                  <SeverityBadge level={campaign.severity_threshold} />
                </div>
                <h3 className="mt-1.5 truncate text-lg font-semibold tracking-tight text-slate-50">
                  {campaign.target_region}
                </h3>
                <p className="text-sm text-slate-400 capitalize">
                  {campaign.crisis_type}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <StatusPill status={campaign.status} />
                {evidenceOpen && (
                  <Button
                    variant="ghost"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => onSelect(campaign.campaign_id)}
                  >
                    Submit evidence
                  </Button>
                )}
                {reclaimable && (
                  <Button
                    variant="ghost"
                    className="px-3 py-1.5 text-xs"
                    disabled={reclaimingId === campaign.campaign_id}
                    onClick={() => onReclaim(campaign.campaign_id)}
                  >
                    {reclaimingId === campaign.campaign_id
                      ? "Reclaiming..."
                      : "Reclaim GEN"}
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
              <Metric label="Locked">
                <span className="font-mono font-semibold text-signal">
                  {formatGen(campaign.atto_amount)}
                </span>
                <span className="ml-1 text-xs text-slate-500">GEN</span>
              </Metric>
              <Metric label="Min severity">{campaign.severity_threshold}</Metric>
              <Metric label="Recipient">
                <span className="font-mono text-xs">
                  {shortAddress(campaign.relief_address)}
                </span>
              </Metric>
              <Metric label="Donor">
                <span className="font-mono text-xs">
                  {shortAddress(campaign.donor)}
                </span>
              </Metric>
              <Metric label="Settlement window">
                {campaign.status === "ACTIVE" && expired
                  ? "Expired"
                  : new Date(campaign.expiry * 1000).toLocaleDateString()}
              </Metric>
            </div>

            <ConsensusPanel campaign={campaign} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
