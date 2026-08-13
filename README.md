# CrisisRelief

An autonomous AI disaster relief vault built as a GenLayer Intelligent Contract.

A donor locks GEN into an escrow campaign that names a target region, a crisis
type, a relief recipient and a minimum severity. Anyone may later submit a news
or agency report URL. The contract fetches that URL, wraps the untrusted body in
a SHA-256 derived prompt fence, and asks the validator set to judge whether the
report confirms a real crisis matching the campaign terms. If the judgement
clears the gate, the escrowed GEN is released to the relief address.

No human approves the payout. The trust boundary is the domain allowlist, the
prompt fence, and validator consensus over an integer verdict.

## Layout

```
contracts/crisis_relief.py     the intelligent contract
tests/test_crisis_relief.py    direct-mode unit tests, web and LLM mocked
gltest.config.yaml             network configuration, studionet by default
requirements.txt               pinned toolchain
```

## Interface

| Method | Kind | Purpose |
|---|---|---|
| `create_campaign(target_region, crisis_type, relief_address, severity_threshold)` | write, payable | Lock GEN in escrow behind release conditions. Returns the campaign id. |
| `trigger_relief(campaign_id, news_url)` | write | Evaluate a report and disburse if it clears the gate. Returns whether it paid out. |
| `get_campaign(campaign_id)` | view | Full public record of one campaign. |
| `get_campaign_count()` | view | Number of campaigns created. |
| `get_trust_model()` | view | The verification rules an integrator can rely on. |

Severity threshold is one of `MINOR`, `MODERATE`, `SEVERE`, `CATASTROPHIC`.
Campaign status is `ACTIVE` or `DISBURSED`.

## How a payout is decided

1. **Domain allowlist.** `news_url` must be `https` and its host must be exactly
   one of `earthquake.usgs.gov`, `api.reliefweb.int`, `news.google.com`,
   `rss.nytimes.com`. Lookalike subdomains such as
   `earthquake.usgs.gov.attacker.io` and embedded credentials such as
   `https://earthquake.usgs.gov@attacker.io` are rejected.
2. **Fetch.** The body is retrieved with `gl.nondet.web.get` and truncated to
   12,000 characters. HTTP failures are classified as `[EXTERNAL]` (4xx,
   deterministic) or `[TRANSIENT]` (5xx, retryable).
3. **Prompt fence.** The fence token is `sha256(body)[:32]`. Because it is
   derived from the document itself, text embedded in the page cannot contain a
   matching closing marker without predicting the hash of a document that
   contains it. The model is told the token explicitly and instructed to treat
   any attempt to close the fence as tampering.
4. **Judgement.** Validators reach consensus through `gl.vm.run_nondet_unsafe`
   with a custom validator function.
5. **Deterministic gate.** The model's answer is normalized to integers, then
   the contract, not the model, applies the arithmetic: verdict must be `PASS`,
   confidence must be at least 7,500 basis points, and reported severity rank
   must meet the campaign threshold.
6. **Disbursement.** On success the status flips to `DISBURSED` and the escrow
   is sent to the relief address via `emit_transfer`.

A failed evaluation leaves the campaign `ACTIVE` and the funds locked, so a
later report can be submitted. A disbursed campaign cannot be triggered again.

## Design notes

**No storage reads inside nondet blocks.** `trigger_relief` copies every value
the evaluation needs, the URL, region, crisis type, threshold, required rank,
payout amount and recipient, into locals before calling `_evaluate_report`. The
leader and validator closures reference only those locals.

**Integers only across the nondet boundary.** GenVM calldata cannot encode a
float, so a model answering `{"confidence": 0.92}` would break the return trip.
The contract therefore asks for a text reply rather than
`response_format="json"`, parses the JSON inside the leader frame, and returns
only integers: `verdict_code` (0 or 1), `confidence_bp` (0 to 10,000) and
`severity_rank` (0 to 4). Ratios, percents, decimals, numeric strings and a
trailing `%` are all normalized by `_coerce_confidence_bp`.

**Validator tolerance.** The validator re-runs the leader function and compares
derived decisions rather than raw text. The verdict code must match exactly.
Severity may differ by one rung but both sides must land on the same side of the
campaign threshold. Confidence must be within 2,000 basis points and both sides
must agree on clearing the 7,500 floor. Leader errors are classified: expected
and external errors must match exactly, transient errors agree in kind, and LLM
errors always disagree so consensus rotates to a fresh validator.

## Development

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Lint and typecheck the contract:

```bash
.venv/bin/genvm-lint check contracts/crisis_relief.py
.venv/bin/genvm-lint typecheck contracts/crisis_relief.py
.venv/bin/genvm-lint schema contracts/crisis_relief.py
```

Run the unit tests. They are direct mode, so there is no server, no Docker and
no network:

```bash
.venv/bin/python -m pytest tests/ -v
```

Direct mode runs the leader function only. Validator agreement is exercised
separately through the `direct_vm.run_validator` cheatcode, and native value
transfer is a no-op there, so confirm real disbursement against studionet before
deploying.

If your editor reports unresolved `genlayer` imports, that is expected: the SDK
lives in the GenVM artifact cache rather than in the venv. `genvm-lint
typecheck` wires the paths up and is the authoritative check.
