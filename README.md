# CrisisRelief

An autonomous AI disaster relief vault built as a GenLayer Intelligent Contract,
with a React dashboard wired to a live StudioNet deployment.

A donor locks GEN into an escrow campaign that names a target region, a crisis
type, a relief recipient and a minimum severity. Anyone may later submit a news
or agency report URL. The contract fetches that URL, wraps the untrusted body in
a SHA-256 derived prompt fence, and asks the validator set to judge whether the
report confirms a real crisis matching the campaign terms. If the judgement
clears the gate, the escrowed GEN is released to the relief address.

No human approves the payout. The trust boundary is the domain allowlist, the
prompt fence, and validator consensus over an integer verdict.

## Live deployment

| | |
|---|---|
| Network | StudioNet |
| Chain ID | `61999` |
| RPC | `https://studio.genlayer.com/api` |
| Contract | `0xF8DFE446D5D05870680D63350b90960f350b57dF` |
| Deploy tx | `0x80a7855e594e47837d433160b884fc8777f5793629d6838b73bb366f6887ad97` |
| Owner | `0x9e72d2018A232639601B1992d590467Df54C4298` |

The full record lives in [`deployments/studionet.json`](deployments/studionet.json),
which the dashboard imports directly, so the UI and the tests always target the
same address. Redeploy with:

```bash
.venv/bin/python scripts/deploy_studionet.py
```

The script generates and funds a deployer, deploys, reads `get_trust_model` back
off chain to prove the deployment is live, and only then writes the JSON. Set
`DEPLOYER_PRIVATE_KEY` to keep a stable `owner` across redeployments.

## Layout

```
contracts/crisis_relief.py                the intelligent contract
tests/test_crisis_relief.py               57 direct-mode tests, web and LLM mocked
tests/test_crisis_relief_integration.py   7 integration tests against a live network
scripts/deploy_studionet.py               deploy and record
deployments/studionet.json                live address, imported by the app
app/                                      React 19 + Tailwind v4 dashboard
gltest.config.yaml                        network configuration, studionet default
pytest.ini                                integration tests opt in via a marker
```

## Architecture

```
      donor                                          anyone
        |                                              |
        | create_campaign(region, type, relief, sev)   | trigger_relief(id, url)
        | payable, locks GEN                           |
        v                                              v
  +-----------------------------------------------------------------+
  |                      CrisisRelief contract                       |
  |                                                                  |
  |  campaigns: TreeMap[u256, Campaign]   campaign_count   owner      |
  |                                                                  |
  |  1. allowlist check      host must be one of four exact domains  |
  |  2. bind storage         region/type/threshold/amount -> locals  |
  |     +-------------------- nondet boundary ---------------------+ |
  |  3. | fetch              gl.nondet.web.get, truncate to 12k    | |
  |  4. | fence              token = sha256(body)[:32]             | |
  |  5. | judge              gl.nondet.exec_prompt, text mode      | |
  |  6. | normalize          -> verdict_code, confidence_bp, rank  | |
  |     +---------------- integers only cross back ---------------+ |
  |  7. gate                 contract arithmetic, not the model     |
  |  8. disburse             emit_transfer on finalization          |
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
| `get_campaign(campaign_id)` | view | Full public record of one campaign. |
| `get_campaign_count()` | view | Number of campaigns created. |
| `get_trust_model()` | view | The verification rules an integrator can rely on. |

Severity threshold is one of `MINOR`, `MODERATE`, `SEVERE`, `CATASTROPHIC`.
Campaign status is `ACTIVE` or `DISBURSED`.

### How a payout is decided

1. **Domain allowlist.** `news_url` must be `https` and its host must be exactly
   one of `earthquake.usgs.gov`, `api.reliefweb.int`, `news.google.com`,
   `rss.nytimes.com`. This runs before any nondeterministic work.
2. **Fetch.** The body is retrieved with `gl.nondet.web.get` and truncated to
   12,000 characters. HTTP failures are classified as `[EXTERNAL]` (4xx,
   deterministic) or `[TRANSIENT]` (5xx, retryable).
3. **Prompt fence.** See below.
4. **Judgement.** Validators reach consensus through `gl.vm.run_nondet_unsafe`
   with a custom validator function.
5. **Deterministic gate.** The model's answer is normalized to integers, then
   the contract applies the arithmetic: verdict must be `PASS`, confidence at
   least 7,500 basis points, and reported severity rank at least the campaign
   threshold.
6. **Disbursement.** Status flips to `DISBURSED` and the escrow is sent to the
   relief address via `emit_transfer`.

A failed evaluation leaves the campaign `ACTIVE` and the funds locked, so a
later report can be submitted. A disbursed campaign cannot be triggered again.

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

### Direct mode, 57 tests, offline, ~1s

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

React 19, Tailwind v4, Vite, `genlayer-js`. It imports
`deployments/studionet.json`, so it points at the live contract with no
configuration.

- **Campaigns** lists every campaign with region, crisis type, minimum severity,
  locked GEN, recipient and donor, plus the consensus verdict, confidence and
  reasoning once evidence has been submitted.
- **Create campaign** deposits emergency GEN into escrow.
- **Trigger relief** submits an evidence URL and renders the verdict, confidence
  and severity alongside the disbursement outcome.

StudioNet is a sandbox, so the dashboard keeps a burner key in `localStorage`
and tops it up with the faucet button rather than asking for a wallet. Nothing
it holds is meant to have value.

Writes wait for `FINALIZED` rather than `ACCEPTED`, because `emit_transfer` is
an external message that only executes once the triggering transaction
finalizes. The campaign will read `DISBURSED` slightly before the GEN actually
lands at the relief address.

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
