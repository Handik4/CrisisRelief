import { useState } from "react";

import { LiveDot } from "./ui";

type Step = {
  icon: string;
  title: string;
  short: string;
  detail: string;
  accent: string;
};

const STEPS: Step[] = [
  {
    icon: "\u{1F4B0}",
    title: "Lock Emergency GEN",
    short: "Campaign creators deposit GEN into the autonomous vault.",
    detail:
      "create_campaign is payable. The deposit is held by the contract itself, not by a multisig or an operator, and is bound to a region, a crisis type, a relief recipient and a minimum severity at the moment it is locked.",
    accent: "signal",
  },
  {
    icon: "\u{1F4E1}",
    title: "Live News Submission",
    short: "Anyone inputs a live disaster report or USGS URL.",
    detail:
      "Submission is permissionless, but the source is not. The host must exactly match one of four allowlisted domains over https, checked before any nondeterministic work begins. Lookalike subdomains and embedded credentials are rejected.",
    accent: "alert",
  },
  {
    icon: "\u{1F9E0}",
    title: "20-Validator AI Consensus",
    short: "GenLayer LLM nodes judge validity and severity across 15 AI models.",
    detail:
      "The fetched body is sealed inside a SHA-256 derived prompt fence, then judged independently by validators running different models. They must agree on the verdict, land on the same side of the confidence floor, and stay within one rung on severity.",
    accent: "critical",
  },
  {
    icon: "\u{26A1}",
    title: "Instant Settlement",
    short: "GEN is released to ground relief teams upon finalization.",
    detail:
      "The contract, not the model, applies the payout gate: PASS, at least 75% confidence, and severity at or above the campaign threshold. Only then does emit_transfer send the escrow, which executes when the transaction finalizes.",
    accent: "relief",
  },
];

const ACCENTS: Record<string, { ring: string; text: string; glow: string }> = {
  signal: { ring: "ring-signal/40", text: "text-signal", glow: "shadow-signal/20" },
  alert: { ring: "ring-alert/40", text: "text-alert", glow: "shadow-alert/20" },
  critical: { ring: "ring-critical/40", text: "text-critical", glow: "shadow-critical/20" },
  relief: { ring: "ring-relief/40", text: "text-relief", glow: "shadow-relief/20" },
};

export function HowItWorks() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="glass edge-glow animate-rise relative overflow-hidden rounded-2xl">
      {/* Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-edge/70 px-6 py-5">
        <div>
          <div className="flex items-center gap-2.5">
            <LiveDot />
            <span className="text-[11px] font-bold tracking-[0.18em] text-relief uppercase">
              Live Consensus Active
            </span>
          </div>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-50">
            How CrisisRelief Works
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-400">
            An autonomous vault that releases disaster relief funds the moment a
            decentralised set of AI validators agrees the crisis is real. No
            committee, no manual approval, no middleman.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Badge
            label="Why GenLayer?"
            value="Dynamic SHA-256 prompt fencing"
            hint="The fence token is the hash of the document itself, so injected text cannot forge a closing marker."
          />
          <Badge
            label="Trustless"
            value="Zero-middleman execution"
            hint="The payout condition is integer arithmetic in contract code. The model advises; it never authorises."
          />
        </div>
      </div>

      {/* Pipeline */}
      <div className="px-6 pt-6 pb-2">
        <div className="grid gap-3 lg:grid-cols-4">
          {STEPS.map((step, index) => {
            const accent = ACCENTS[step.accent];
            const isOpen = open === index;

            return (
              <div key={step.title} className="relative">
                {/* Connector to the next step */}
                {index < STEPS.length - 1 && (
                  <div className="pointer-events-none absolute top-9 -right-1.5 hidden h-px w-3 lg:block">
                    <div className="flow-line h-px w-full" />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : index)}
                  aria-expanded={isOpen}
                  className={`group h-full w-full rounded-xl border bg-charcoal-soft/50 p-4 text-left transition-all duration-300 hover:-translate-y-1 hover:bg-charcoal-soft ${
                    isOpen
                      ? `border-transparent ring-2 ${accent.ring} shadow-xl ${accent.glow}`
                      : "border-edge hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-void/70 text-lg ring-1 ${accent.ring} transition-transform duration-300 group-hover:scale-110`}
                    >
                      {step.icon}
                    </span>
                    <span
                      className={`font-mono text-[11px] font-bold tracking-widest ${accent.text}`}
                    >
                      STEP {index + 1}
                    </span>
                  </div>

                  <h3 className="mt-3 text-sm font-semibold text-slate-100">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                    {step.short}
                  </p>

                  <span
                    className={`mt-3 inline-flex items-center gap-1 text-[11px] font-medium ${accent.text} opacity-70 transition group-hover:opacity-100`}
                  >
                    {isOpen ? "Hide detail" : "How"}
                    <span
                      className={`transition-transform duration-300 ${isOpen ? "rotate-90" : ""}`}
                    >
                      &rsaquo;
                    </span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        {open !== null && (
          <div
            className={`animate-rise mt-3 rounded-xl border border-edge bg-void/50 p-4 ring-1 ${ACCENTS[STEPS[open].accent].ring}`}
          >
            <p className="text-sm leading-relaxed text-slate-300">
              <span className={`font-semibold ${ACCENTS[STEPS[open].accent].text}`}>
                {STEPS[open].title}.{" "}
              </span>
              {STEPS[open].detail}
            </p>
          </div>
        )}
      </div>

      <div className="px-6 pb-5 text-[11px] text-slate-600">
        Select any step to see what the contract actually enforces.
      </div>
    </section>
  );
}

function Badge({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div
      title={hint}
      className="group flex cursor-help items-center gap-3 rounded-xl border border-edge bg-void/50 px-3.5 py-2 transition hover:border-signal/40"
    >
      <span className="text-[10px] font-bold tracking-[0.14em] text-slate-500 uppercase">
        {label}
      </span>
      <span className="text-xs font-medium text-slate-200 transition group-hover:text-signal">
        {value}
      </span>
    </div>
  );
}
