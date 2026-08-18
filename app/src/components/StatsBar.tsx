import { useEffect, useRef, useState } from "react";

import { formatGen, type Campaign } from "../lib/genlayer";
import { LiveDot } from "./ui";

/** Eases a displayed number toward its target so live updates read as motion. */
function useCountUp(target: number, duration = 700) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return value;
}

function Stat({
  label,
  value,
  unit,
  hint,
  accent,
  live,
}: {
  label: string;
  value: string;
  unit?: string;
  hint: string;
  accent: "signal" | "alert" | "gold";
  live?: boolean;
}) {
  const tone = {
    signal: "text-signal from-signal/12",
    alert: "text-alert from-alert/12",
    gold: "text-gold from-gold/12",
  }[accent];

  return (
    <div className="group glass relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 hover:border-slate-700">
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-60 transition-opacity duration-300 group-hover:opacity-100 ${tone.split(" ")[1]}`}
      />
      <div className="relative">
        <div className="flex items-center gap-2">
          {live && <LiveDot color={accent === "gold" ? "relief" : accent} />}
          <span className="text-[10px] font-bold tracking-[0.16em] text-slate-500 uppercase">
            {label}
          </span>
        </div>

        <div className="mt-2.5 flex items-baseline gap-1.5">
          <span
            className={`font-mono text-3xl font-bold tabular-nums ${tone.split(" ")[0]}`}
          >
            {value}
          </span>
          {unit && (
            <span className="text-sm font-medium text-slate-500">{unit}</span>
          )}
        </div>

        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">{hint}</p>
      </div>
    </div>
  );
}

export function StatsBar({ campaigns }: { campaigns: Campaign[] }) {
  const now = Math.floor(Date.now() / 1000);
  const escrowed = campaigns.filter(
    (c) => c.status === "ACTIVE" || c.status === "EVALUATING",
  );
  const active = escrowed.filter((c) => now <= c.expiry);
  const settled = campaigns.filter((c) => c.status === "DISBURSED");

  const lockedAtto = escrowed.reduce((sum, c) => sum + BigInt(c.atto_amount), 0n);
  const liquidity = useCountUp(Number(formatGen(lockedAtto, 4)) || 0);
  const activeCount = useCountUp(active.length);
  const settledCount = useCountUp(settled.length);

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Stat
        label="Total Vault Liquidity"
        value={liquidity.toFixed(liquidity % 1 === 0 ? 0 : 2)}
        unit="GEN"
        hint="Escrowed across all active campaigns, held by the contract itself."
        accent="signal"
        live
      />
      <Stat
        label="Active Disasters"
        value={String(Math.round(activeCount))}
        hint="Campaigns armed and awaiting qualifying evidence."
        accent="alert"
        live
      />
      <Stat
        label="Campaigns Settled"
        value={String(Math.round(settledCount))}
        hint="Relief disbursed by consensus. The contract zeroes the escrow on payout, so the historical GEN total is not recoverable on chain."
        accent="gold"
      />
    </div>
  );
}
