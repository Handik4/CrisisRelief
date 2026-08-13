import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  children,
  action,
  accent = "signal",
  className = "",
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  accent?: "signal" | "relief" | "alert";
  className?: string;
}) {
  const glow = {
    signal: "shadow-signal/5",
    relief: "shadow-relief/5",
    alert: "shadow-alert/5",
  }[accent];

  return (
    <section
      className={`glass edge-glow relative overflow-hidden rounded-2xl shadow-2xl ${glow} ${className}`}
    >
      {title && (
        <header className="flex items-start justify-between gap-4 border-b border-edge/70 px-5 py-4">
          <div>
            <h2 className="text-[13px] font-semibold tracking-[0.14em] text-slate-100 uppercase">
              {title}
            </h2>
            {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={title ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold tracking-[0.1em] text-slate-400 uppercase">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-slate-600">{hint}</span>}
    </label>
  );
}

const inputBase =
  "w-full rounded-xl border border-edge bg-void/60 px-3.5 py-2.5 text-sm text-slate-100 transition " +
  "placeholder:text-slate-700 hover:border-slate-700 " +
  "focus:border-signal/60 focus:ring-4 focus:ring-signal/10 focus:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-40";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputBase} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputBase} cursor-pointer`} />;
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "relief" | "ghost";
}) {
  const styles = {
    primary:
      "bg-gradient-to-r from-signal to-sky-500 text-void font-semibold hover:brightness-110 " +
      "shadow-lg shadow-signal/20 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 disabled:shadow-none",
    relief:
      "bg-gradient-to-r from-relief to-emerald-500 text-void font-semibold hover:brightness-110 " +
      "shadow-lg shadow-relief/20 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 disabled:shadow-none",
    ghost:
      "border border-edge bg-transparent text-slate-300 hover:border-signal/50 hover:text-signal " +
      "disabled:opacity-40",
  }[variant];

  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm transition-all duration-200 hover:-translate-y-px active:translate-y-0 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

/** Pulsing dot used for live indicators. */
export function LiveDot({ color = "relief" }: { color?: "relief" | "signal" | "alert" }) {
  const tone = {
    relief: "bg-relief text-relief",
    signal: "bg-signal text-signal",
    alert: "bg-alert text-alert",
  }[color];
  return (
    <span className="relative flex h-2 w-2">
      <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${tone} animate-ping`} />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${tone}`} />
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const active = status === "ACTIVE";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold tracking-[0.1em] uppercase ${
        active
          ? "bg-alert/10 text-alert ring-1 ring-alert/30"
          : "bg-gold/10 text-gold shadow-[0_0_18px_-4px] shadow-gold/40 ring-1 ring-gold/40"
      }`}
    >
      {active ? <LiveDot color="alert" /> : <span>&#10003;</span>}
      {status}
    </span>
  );
}

/** Severity ramps from amber through red as the rank climbs. */
export function SeverityBadge({ level }: { level: string }) {
  const tone =
    {
      MINOR: "bg-slate-500/10 text-slate-300 ring-slate-500/30",
      MODERATE: "bg-alert/10 text-alert ring-alert/30",
      SEVERE: "bg-orange-500/10 text-orange-300 ring-orange-500/30",
      CATASTROPHIC: "bg-critical/10 text-critical ring-critical/40",
    }[level] ?? "bg-slate-500/10 text-slate-400 ring-slate-500/30";

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wider uppercase ring-1 ${tone}`}
    >
      {level}
    </span>
  );
}

export function Alert({
  kind,
  children,
}: {
  kind: "error" | "success" | "info";
  children: ReactNode;
}) {
  const styles = {
    error: "border-critical/30 bg-critical/10 text-rose-200",
    success: "border-relief/30 bg-relief/10 text-emerald-200",
    info: "border-signal/30 bg-signal/10 text-cyan-100",
  }[kind];
  return (
    <div
      className={`animate-rise rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed break-words ${styles}`}
    >
      {children}
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/25 border-t-current ${className}`}
    />
  );
}
