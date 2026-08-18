# CrisisRelief

An autonomous AI disaster relief vault built as a GenLayer Intelligent Contract,
with a React dashboard wired to a live StudioNet deployment.

A donor locks GEN into an escrow campaign that names a target region, a crisis
type, a relief recipient and a minimum severity. Anyone may submit a news or
agency report URL during the 30-day settlement window. The contract fetches that
URL, wraps the untrusted body in a SHA-256 derived prompt fence, and asks the
validator set to judge whether the report confirms a real crisis matching the
campaign terms. If the judgement clears the gate, the escrowed GEN is released
to the relief address. If the window ends without a payout, only the original
donor can reclaim the unused escrow.

No human approves the payout. The trust boundary is the domain allowlist, the
prompt fence, and validator consensus over an integer verdict.

## Live deployment

| | |
|---|---|
| Network | StudioNet |
| Chain ID | `61999` |
| RPC | `https://studio.genlayer.com/api` |
| Contract | `0x792085f0f6422a6fd4c77C8a523A870eAd4Db785` |
| Deploy tx | `0x21048f06b6c8e4b4fff35e36ebe93142b8084996b84f2e9ecae7cf90b4dbe14f` |
| Owner | `0x7DA17683aE05D5503032cBc19FFD370D9FD05E62` |

The full record lives in [`deployments/studionet.json`](deployments/studionet.json),
and the deploy script mirrors it to `app/src/lib/deployment.json`, so the UI and
the tests always target the same address. Redeploy with:

```bash
.venv/bin/python scripts/deploy_studionet.py
```

The script generates and funds a deployer, deploys, reads `get_trust_model` back
off chain to prove the deployment is live, and only then writes both JSON files.
Set `DEPLOYER_PRIVATE_KEY` to keep a stable `owner` across redeployments.

## Layout

```
contracts/crisis_relief.py                the intelligent contract
tests/test_crisis_relief.py               65 direct-mode tests, web and LLM mocked
tests/test_crisis_relief_integration.py   7 integration tests against a live network
scripts/deploy_studionet.py               deploy and record
deployments/studionet.json                canonical live deployment record
app/                                      React 19 + Tailwind v4 dashboard
gltest.config.yaml                        network configuration, studionet default
pytest.ini                                integration tests opt in via a marker
```

## Architecture

```
      donor                                          anyone
        |                                              |
       | create_campaign(region, type, relief, sev)   | trigger_relief(id, url)
       | payable, locks GEN                           | reclaim_funds(id), donor only
        v                                              v
  +-----------------------------------------------------------------+
  |                      CrisisRelief contract                       |
  |                                                                  |
  |  campaigns: TreeMap[u256, Campaign]   campaign_count   owner      |
  |                                                                  |
   |  1. deadline check        evidence accepted through expiry       |
   |  2. allowlist check       host must be one of four exact domains  |
   |  3. bind storage          region/type/threshold/amount -> locals  |
  |     +-------------------- nondet boundary ---------------------+ |
   |  4. | fetch              gl.nondet.web.get, truncate to 12k    | |
   |  5. | fence              token = sha256(body)[:32]             | |
   |  6. | judge              gl.nondet.exec_prompt, text mode      | |
   |  7. | normalize          -> verdict_code, confidence_bp, rank  | |
  |     +---------------- integers only cross back ---------------+ |
   |  8. gate                 contract arithmetic, not the model     |
   |  9. disburse             emit_transfer on finalization          |
  +-----------------------------------------------------------------+
                                    |
                                    v
                            relief_address (EOA)
```

### Interface

| Method | Kind | Purpose |
|---|---|---|
| `create_campaign(target_region, crisis_type, relief_address, severity_threshold)` | write, payable | Lock GEN in escrow behind release conditions. Returns the campaign id. |
| `trigger_relief(campaign_id, news_url)` | write | Evaluate a report and disburse if it clears the gate. Returns whether it paid out. |
| `reclaim_funds(campaign_id)` | write | After expiry, return unused escrow to the original donor. |
| `get_campaign(campaign_id)` | view | Full public record of one campaign. |
| `get_campaign_count()` | view | Number of campaigns created. |
| `get_trust_model()` | view | The verification rules an integrator can rely on. |

Severity threshold is one of `MINOR`, `MODERATE`, `SEVERE`, `CATASTROPHIC`.
Campaign status is `ACTIVE`, `EVALUATING`, `DISBURSED` or `REFUNDED`. The
settlement window is 2,592,000 seconds (30 days). Payout is allowed at the exact
expiry timestamp; reclaim is allowed only after it.

### How a payout is decided

1. **Settlement window.** A report can be evaluated only while the campaign is
   `ACTIVE` and the transaction timestamp is at or before `expiry`. The campaign
   changes to `EVALUATING` during consensus, then returns to `ACTIVE` for a
   failed judgement or becomes `DISBURSED` for a passing one.
2. **Domain allowlist.** `news_url` must be `https` and its host must be exactly
   one of `earthquake.usgs.gov`, `api.reliefweb.int`, `news.google.com`,
   `rss.nytimes.com`. This runs before any nondeterministic work.
3. **Fetch.** The body is retrieved with `gl.nondet.web.get` and truncated to
   12,000 characters. HTTP failures are classified as `[EXTERNAL]` (4xx,
   deterministic) or `[TRANSIENT]` (5xx, retryable).
4. **Prompt fence.** See below.
5. **Judgement.** Validators reach consensus through `gl.vm.run_nondet_unsafe`
   with a custom validator function.
6. **Deterministic gate.** The model's answer is normalized to integers, then
   the contract applies the arithmetic: verdict must be `PASS`, confidence at
   least 7,500 basis points, and reported severity rank at least the campaign
   threshold.
7. **Disbursement.** Status flips to `DISBURSED` and the escrow is zeroed before
   it is sent to the relief address via `emit_transfer`.

A failed evaluation leaves the campaign `ACTIVE` and the funds locked, so a
later report can be submitted. A disbursed campaign cannot be triggered again.
After expiry, the donor can call `reclaim_funds`; it changes the status to
`REFUNDED`, zeroes the escrow before emitting the refund, and cannot be replayed.

## Security design

### SHA-256 prompt fencing

The evidence is a document fetched from the open internet, so it is untrusted
input being fed to a model that also receives instructions. A static delimiter
would be forgeable: an attacker who knows the contract source can embed the
closing marker in a page and append their own instructions.

The fence token is instead derived from the document itself:

```python
fence = hashlib.sha256(body.encode("utf-8")).hexdigest()[:32]
```

To forge a closing marker, injected text would have to contain the SHA-256 of a
document that contains it. The prompt also names the token explicitly and tells
the model that any other closing marker is evidence of tampering and should
produce a `FAIL`.

`test_injected_close_marker_does_not_match_the_real_fence` asserts that a
payload carrying a fake `-----END UNTRUSTED EVIDENCE 0000-----` plus override
instructions stays sealed inside the real fence.

### The model judges, the contract decides

The LLM never authorizes a transfer. It returns a verdict, a confidence and a
severity label; the payout condition is plain integer arithmetic in contract
code. A model that returns `PASS` with 60% confidence, or `PASS` at `SEVERE`
against a `CATASTROPHIC` campaign, does not move funds.

### Expiry and donor recovery

Campaign creation records deterministic transaction time as `created_at` and
sets `expiry = created_at + 2,592,000`. Every validator sees the same pinned
transaction timestamp, so the deadline arithmetic is reproducible. The boundary
is intentional: `trigger_relief` accepts `current_time <= expiry`, while
`reclaim_funds` requires `current_time > expiry`.

Both settlement paths require `ACTIVE`. A payout or refund sets its terminal
status and zeroes `atto_amount` before calling `emit_transfer`, so it cannot be
replayed. GenLayer queues writes in contract-specific order and commits each
transaction atomically; a payout and a refund therefore cannot both settle from
the same active state. `EVALUATING` guards the consensus execution path inside
the transaction, while failed evaluations restore `ACTIVE`.

### Integers only across the nondet boundary

GenVM calldata cannot encode a float:

```
calldata.encode({'a': 0.92}) -> TypeError: not calldata encodable 0.92: float
```

A model answering `{"confidence": 0.92}` under `response_format="json"` would be
decoded into a Python float and break the return trip out of the nondet block.
The contract therefore requests a **text** reply, parses the JSON inside the
leader frame, and returns only integers: `verdict_code` (0 or 1),
`confidence_bp` (0 to 10,000) and `severity_rank` (0 to 4). `_coerce_confidence_bp`
absorbs ratios, percents, decimals, numeric strings and a trailing `%`.

### No storage reads inside nondet blocks

`trigger_relief` copies every value the evaluation needs, the URL, region,
crisis type, threshold, required rank, payout amount and recipient, into locals
before calling `_evaluate_report`. The leader and validator closures reference
only those locals.

### Validator tolerance

The validator re-runs the leader function and compares derived decisions rather
than raw text:

- verdict code must match exactly
- severity may differ by one rung, but both sides must land on the same side of
  the campaign threshold
- confidence must be within 2,000 basis points, and both sides must agree on
  clearing the 7,500 floor

Leader errors are classified: `[EXPECTED]` and `[EXTERNAL]` must match exactly,
`[TRANSIENT]` errors agree in kind, and `[LLM_ERROR]` always disagrees so
consensus rotates to a fresh validator.

This matters because StudioNet's pool is genuinely heterogeneous. The observed
set was **20 validators across 15 distinct models** (GPT-5.4, Claude Sonnet 4.6,
Gemini 3, DeepSeek, Grok, Mistral, Kimi, Qwen, GLM, MiniMax, Gemma and others).
Agreement has to survive different models phrasing the same judgement
differently, which is why nothing text-shaped is ever compared.

## Test coverage

### Direct mode, 65 tests, offline, ~2s

```bash
.venv/bin/python -m pytest tests/ -v
```

| Area | Tests |
|---|---|
| Campaign creation and validation | 7 |
| Domain allowlist, including lookalike hosts, embedded credentials, plain http | 6 |
| Disbursement gate: verdict, confidence floor, severity threshold, replay | 7 |
| Integer normalization: ratios, percents, decimals, strings, clamping, verdict words | 20 |
| LLM resilience: alternate keys, prose-wrapped JSON, malformed replies | 5 |
| SHA-256 prompt fencing, including an injected close marker | 3 |
| Web failure classification: 4xx, 5xx, empty body | 3 |
| Consensus validator function via the `run_validator` cheatcode | 6 |
| Expiry, evaluation lock and donor recovery | 8 |

Direct mode runs the leader only and native value transfer is a no-op there,
which is what the integration suite exists to cover.

### Integration, 7 tests, live network, ~8 min

```bash
.venv/bin/gltest tests/test_crisis_relief_integration.py -m integration -v -s --network studionet
```

Deployment and views, escrow actually moving into the contract, allowlist
rejection before any nondet work, the full disbursement path with balance
assertions on both sides, replay protection, a negative consensus path where
real evidence of a real catastrophe in the wrong region leaves the escrow
locked, and validator pool heterogeneity.

Both suites live under `tests/`. Integration tests carry a marker and
`pytest.ini` deselects them by default, so `pytest tests/` stays offline.

### Verified on chain

A live run against StudioNet produced:

```
Verdict: 1  confidence_bp: 10000  severity rank: 4 (required 3)
Reason: The report confirms a magnitude 7.8 earthquake in Kahramanmaras,
        Turkey, with a red alert level indicating extreme severity.
Status: DISBURSED   contract balance -2 GEN   recipient balance +2 GEN
Consensus: leader plus 4 validator receipts, 3 agree
```

And the wrong-region control:

```
Mismatch verdict: 0
Reason: The earthquake described (M7.8, Kahramanmaras/Pazarcik) occurred in
        Turkey, not in the target region of Tokyo, Japan.
Status: ACTIVE   escrow untouched
```

## Dashboard

```bash
cd app
npm install
npm run dev
```

React 19, Tailwind v4, Vite, `genlayer-js`. It imports the deployment record
mirrored to `app/src/lib/deployment.json`, so it points at the live contract
without runtime configuration.

- **How CrisisRelief Works** is an interactive four-step pipeline: lock GEN,
  submit a report, 20-validator AI consensus, instant settlement. Selecting a
  step expands what the contract actually enforces at that stage, so the
  explanation stays tied to the code rather than to marketing copy.
- **Hero stats** show total vault liquidity in GEN, active disasters and
  campaigns settled, easing between values as the chain state changes.
- **Relief campaigns** lists every campaign with region, crisis type, minimum
  severity, locked GEN, recipient and donor, plus the consensus verdict,
  confidence and reasoning once evidence has been submitted.
- **Lock emergency funds** deposits GEN into escrow, with staged status
  feedback while the transaction mines.
- **Trigger relief** submits an evidence URL, shows the consensus pipeline while
  validators vote, then renders verdict, confidence and severity alongside the
  disbursement outcome.
- **Reclaim GEN** appears for the original donor after an active campaign's
  settlement window expires and returns the unused escrow.

Theme is deep charcoal with glassmorphic panels, neon accent edges and pulsing
live indicators. Severity ramps from slate through amber and orange to red;
disbursed campaigns carry a golden badge. All motion respects
`prefers-reduced-motion`.

One honest gap in the stats: the third counter reports **campaigns settled**
rather than GEN disbursed. `trigger_relief` zeroes `atto_amount` when it pays
out, so the historical value of past disbursements is not recoverable from
chain state. Making that a GEN figure needs a contract change: add a
`disbursed_atto: u256` field at the **end** of the `Campaign` dataclass (storage
layout is positional, so appending is the safe position), set it alongside
`campaign.atto_amount = u256(0)`, expose it from `get_campaign`, then redeploy.

StudioNet is a sandbox, so the dashboard keeps a burner key in `localStorage`
and tops it up with the faucet button rather than asking for a wallet. Nothing
it holds is meant to have value.

Writes wait for `FINALIZED` rather than `ACCEPTED`, because `emit_transfer` is
an external message that only executes once the triggering transaction
finalizes. A campaign can read `DISBURSED` or `REFUNDED` slightly before the GEN
actually lands at its destination.

## Development

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Lint, typecheck and inspect the ABI:

```bash
.venv/bin/genvm-lint check contracts/crisis_relief.py
.venv/bin/genvm-lint typecheck contracts/crisis_relief.py
.venv/bin/genvm-lint schema contracts/crisis_relief.py
```

Both pass with zero errors.

StudioNet rate limits RPC to 30 requests per minute and each poll of a pending
transaction costs one, so `gltest.config.yaml` polls every 10 seconds. Tightening
that interval will trip the limiter mid-suite.

If your editor reports unresolved `genlayer` imports, that is expected: the SDK
lives in the GenVM artifact cache rather than in the venv. `genvm-lint typecheck`
wires the paths up and is the authoritative check.
