import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 shadow-lg shadow-black/20">
      <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-slate-100 uppercase">
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="p-5">{children}</div>
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
      <span className="mb-1.5 block text-xs font-medium text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const inputBase =
  "w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 " +
  "placeholder:text-slate-600 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 focus:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputBase} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={inputBase} />;
}

export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
}) {
  const styles = {
    primary:
      "bg-sky-600 text-white hover:bg-sky-500 focus:ring-sky-500/40 disabled:bg-slate-700 disabled:text-slate-400",
    ghost:
      "border border-slate-700 bg-transparent text-slate-300 hover:border-slate-500 hover:text-slate-100 focus:ring-slate-500/40",
    danger:
      "bg-rose-600 text-white hover:bg-rose-500 focus:ring-rose-500/40 disabled:bg-slate-700",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition focus:ring-2 focus:outline-none disabled:cursor-not-allowed ${styles}`}
    >
      {children}
    </button>
  );
}

export function StatusPill({ status }: { status: string }) {
  const active = status === "ACTIVE";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        active
          ? "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30"
          : "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${active ? "bg-amber-400" : "bg-emerald-400"}`}
      />
      {status}
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
    error: "border-rose-500/30 bg-rose-500/10 text-rose-200",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    info: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  }[kind];
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm break-words ${styles}`}>
      {children}
    </div>
  );
}

export function Spinner() {
  return (
    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
  );
}
