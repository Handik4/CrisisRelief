import { useEffect, useRef, useState } from "react";

import { useWallet } from "../lib/WalletContext";
import { CHAIN_ID, formatGen, shortAddress } from "../lib/genlayer";
import { Button, LiveDot, Spinner } from "./ui";

const METAMASK_URL = "https://metamask.io/download/";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3.5 py-2.5">
      <span className="text-[10px] font-bold tracking-[0.14em] text-slate-600 uppercase">
        {label}
      </span>
      <span className="text-right text-xs">{children}</span>
    </div>
  );
}

export function WalletMenu({
  balance,
  onFund,
  funding,
}: {
  balance: bigint | null;
  onFund: () => void;
  funding: boolean;
}) {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const connected = wallet.mode === "injected";
  const onStudioNet = !wallet.wrongNetwork;

  // Disconnected and no wallet installed: point at the install page but keep
  // the burner path obvious, since it is the faster route on a sandbox.
  if (!connected && !wallet.providerAvailable) {
    return (
      <div className="flex items-center gap-3">
        <BurnerChip balance={balance} onFund={onFund} funding={funding} />
        <a
          href={METAMASK_URL}
          target="_blank"
          rel="noreferrer"
          title="No Web3 provider detected in this browser"
          className="inline-flex items-center gap-2 rounded-xl border border-alert/30 bg-alert/10 px-3.5 py-2.5 text-xs font-medium text-alert transition hover:border-alert/60"
        >
          <span>&#9888;</span> Install MetaMask
        </a>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="flex items-center gap-3">
        <BurnerChip balance={balance} onFund={onFund} funding={funding} />
        <Button onClick={wallet.connect} disabled={wallet.connecting}>
          {wallet.connecting ? <Spinner /> : <span>&#128279;</span>}
          {wallet.connecting ? "Connecting" : "Connect Wallet"}
        </Button>
      </div>
    );
  }

  return (
    <div className="relative flex items-center gap-3" ref={rootRef}>
      {wallet.wrongNetwork && (
        <Button
          variant="ghost"
          onClick={wallet.switchNetwork}
          disabled={wallet.switching}
          className="border-critical/40 text-critical hover:border-critical hover:text-critical"
        >
          {wallet.switching ? <Spinner /> : <span>&#9888;</span>}
          {wallet.switching ? "Switching" : "Switch to StudioNet"}
        </Button>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex items-center gap-3 rounded-xl border px-3.5 py-2 transition ${
          onStudioNet
            ? "border-edge bg-void/60 hover:border-signal/50"
            : "border-critical/50 bg-critical/10"
        }`}
      >
        <span className="flex items-center gap-2">
          {onStudioNet ? <LiveDot /> : <span className="text-critical">&#9888;</span>}
          <span className="text-left">
            <span className="block font-mono text-xs text-slate-100">
              {shortAddress(wallet.address)}
            </span>
            <span
              className={`block text-[10px] ${onStudioNet ? "text-slate-500" : "text-critical"}`}
            >
              {onStudioNet ? `StudioNet - ${CHAIN_ID}` : `Wrong network - ${wallet.chainId}`}
            </span>
          </span>
        </span>
        <span className="border-l border-edge pl-3 font-mono text-xs text-slate-200">
          {balance === null ? "..." : `${formatGen(balance)} GEN`}
        </span>
        <span
          className={`text-slate-600 transition-transform ${open ? "rotate-180" : ""}`}
        >
          &#9662;
        </span>
      </button>

      {open && (
        // Opaque rather than glass: this floats over high-contrast content, and
        // a translucent panel let the page bleed through and hurt legibility.
        <div className="animate-rise absolute top-full right-0 z-30 mt-2 w-72 overflow-hidden rounded-xl border border-edge bg-charcoal shadow-2xl shadow-black/60">
          <div className="divide-y divide-edge/70">
            <Row label="Wallet">
              <span className="text-slate-200">Injected (MetaMask)</span>
            </Row>
            <Row label="Address">
              <span className="font-mono text-slate-300">
                {shortAddress(wallet.address)}
              </span>
            </Row>
            <Row label="Network">
              <span className={onStudioNet ? "text-relief" : "text-critical"}>
                {onStudioNet ? "StudioNet" : "Unsupported"} ({wallet.chainId ?? "?"})
              </span>
            </Row>
            <Row label="Balance">
              <span className="font-mono text-slate-200">
                {balance === null ? "..." : `${formatGen(balance)} GEN`}
              </span>
            </Row>
          </div>

          <div className="space-y-2 border-t border-edge/70 p-3">
            <Button
              variant="ghost"
              onClick={onFund}
              disabled={funding}
              className="w-full text-xs"
            >
              {funding && <Spinner />}
              {funding ? "Funding" : "Fund from StudioNet faucet"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                wallet.useBurner();
                setOpen(false);
              }}
              className="w-full text-xs"
            >
              Switch to burner wallet
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                wallet.disconnect();
                setOpen(false);
              }}
              className="w-full border-critical/30 text-xs text-critical hover:border-critical hover:text-critical"
            >
              Disconnect
            </Button>
            <p className="pt-1 text-[10px] leading-relaxed text-slate-600">
              Disconnecting stops this dashboard using the wallet. Revoke access
              from inside MetaMask to remove the permission entirely.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Compact burner readout shown while no external wallet is in use. */
function BurnerChip({
  balance,
  onFund,
  funding,
}: {
  balance: bigint | null;
  onFund: () => void;
  funding: boolean;
}) {
  const wallet = useWallet();
  return (
    <div className="flex items-center gap-3 rounded-xl border border-edge bg-void/60 px-3.5 py-2">
      <span>
        <span className="block text-[10px] font-bold tracking-[0.12em] text-slate-600 uppercase">
          Burner
        </span>
        <span className="block font-mono text-xs text-slate-300">
          {shortAddress(wallet.address)}
        </span>
      </span>
      <span className="border-l border-edge pl-3 font-mono text-xs text-slate-200">
        {balance === null ? "..." : `${formatGen(balance)} GEN`}
      </span>
      <button
        onClick={onFund}
        disabled={funding}
        title="Fund this address from the StudioNet faucet"
        className="border-l border-edge pl-3 text-xs text-slate-500 transition hover:text-signal disabled:opacity-40"
      >
        {funding ? <Spinner /> : "Faucet"}
      </button>
    </div>
  );
}
