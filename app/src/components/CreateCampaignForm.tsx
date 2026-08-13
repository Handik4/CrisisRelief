import { useState } from "react";

import { SEVERITY_LEVELS, createCampaign, shortAddress } from "../lib/genlayer";
import { Alert, Button, Card, Field, Select, Spinner, TextInput } from "./ui";

type Phase = "idle" | "signing" | "mining";

const PHASE_COPY: Record<Exclude<Phase, "idle">, string> = {
  signing: "Submitting transaction...",
  mining: "Locking escrow, awaiting finalization...",
};

export function CreateCampaignForm({ onCreated }: { onCreated: () => void }) {
  const [targetRegion, setTargetRegion] = useState("");
  const [crisisType, setCrisisType] = useState("");
  const [reliefAddress, setReliefAddress] = useState("");
  const [severityThreshold, setSeverityThreshold] = useState("SEVERE");
  const [amountGen, setAmountGen] = useState("1");

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ hash: string; amount: string } | null>(null);

  const busy = phase !== "idle";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(null);
    setPhase("signing");
    try {
      // The write helper waits for FINALIZED internally; flip the label as
      // soon as the request is away so the user sees progress, not a stall.
      setTimeout(() => setPhase((p) => (p === "signing" ? "mining" : p)), 1200);
      const { hash } = await createCampaign({
        targetRegion,
        crisisType,
        reliefAddress,
        severityThreshold,
        amountGen,
      });
      setDone({ hash, amount: amountGen });
      setTargetRegion("");
      setCrisisType("");
      setReliefAddress("");
      setAmountGen("1");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPhase("idle");
    }
  }

  return (
    <Card
      title="Lock Emergency Funds"
      subtitle="Deposit GEN behind a set of release conditions"
      accent="signal"
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Target region" hint="Where the crisis must occur">
          <TextInput
            required
            value={targetRegion}
            onChange={(e) => setTargetRegion(e.target.value)}
            placeholder="Kahramanmaras, Turkey"
            disabled={busy}
          />
        </Field>

        <Field label="Crisis type">
          <TextInput
            required
            value={crisisType}
            onChange={(e) => setCrisisType(e.target.value)}
            placeholder="earthquake"
            disabled={busy}
          />
        </Field>

        <Field label="Relief address" hint="Receives the escrow when verified">
          <TextInput
            required
            value={reliefAddress}
            onChange={(e) => setReliefAddress(e.target.value)}
            placeholder="0x..."
            pattern="0x[a-fA-F0-9]{40}"
            spellCheck={false}
            disabled={busy}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Minimum severity">
            <Select
              value={severityThreshold}
              onChange={(e) => setSeverityThreshold(e.target.value)}
              disabled={busy}
            >
              {SEVERITY_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Deposit (GEN)">
            <TextInput
              required
              value={amountGen}
              onChange={(e) => setAmountGen(e.target.value)}
              placeholder="2.5"
              inputMode="decimal"
              disabled={busy}
            />
          </Field>
        </div>

        {error && <Alert kind="error">{error}</Alert>}

        {done && (
          <Alert kind="success">
            <span className="font-semibold">{done.amount} GEN locked in escrow.</span>
            <br />
            <span className="font-mono text-xs opacity-80">
              tx {shortAddress(done.hash)}
            </span>
          </Alert>
        )}

        <Button type="submit" disabled={busy} className="w-full">
          {busy && <Spinner />}
          {busy ? PHASE_COPY[phase as Exclude<Phase, "idle">] : "Lock relief funds"}
        </Button>

        {busy && (
          <p className="animate-breathe text-center text-[11px] text-slate-600">
            Escrow settles once the transaction finalizes.
          </p>
        )}
      </form>
    </Card>
  );
}
