import { useState } from "react";

import { SEVERITY_LEVELS, createCampaign } from "../lib/genlayer";
import { Alert, Button, Card, Field, Select, Spinner, TextInput } from "./ui";

export function CreateCampaignForm({ onCreated }: { onCreated: () => void }) {
  const [targetRegion, setTargetRegion] = useState("");
  const [crisisType, setCrisisType] = useState("");
  const [reliefAddress, setReliefAddress] = useState("");
  const [severityThreshold, setSeverityThreshold] = useState("SEVERE");
  const [amountGen, setAmountGen] = useState("1");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(null);
    setBusy(true);
    try {
      const { hash } = await createCampaign({
        targetRegion,
        crisisType,
        reliefAddress,
        severityThreshold,
        amountGen,
      });
      setDone(`Escrow locked. Transaction ${hash}`);
      setTargetRegion("");
      setCrisisType("");
      setReliefAddress("");
      setAmountGen("1");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Create campaign"
      subtitle="Lock emergency GEN behind a set of release conditions"
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
        {done && <Alert kind="success">{done}</Alert>}

        <Button type="submit" disabled={busy}>
          {busy && <Spinner />}
          {busy ? "Locking escrow..." : "Lock relief funds"}
        </Button>
      </form>
    </Card>
  );
}
