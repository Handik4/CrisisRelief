"""
Integration tests for CrisisRelief against a live GenLayer network.

Unlike the direct-mode suite these run real web fetches, real LLM calls and
full leader plus validator consensus, so they are the only place where the
validator function, the GenVM runtime and native GEN transfer are actually
exercised.

    gltest tests/test_crisis_relief_integration.py -v -s --network studionet

StudioNet notes:
  - The network is gasless but payable methods still need a funded sender, so
    the suite funds the test account through `sim_fundAccount`.
  - RPC is rate limited to 30 requests per minute. `gltest.config.yaml` polls
    every 10 seconds to stay under it; the sleeps between tests keep bursts of
    view calls from stacking on top of that.
  - `emit_transfer` is an external message that runs on finalization, so the
    disbursement tests wait for FINALIZED and for triggered transactions.
"""

import time

import pytest

from genlayer_py.types import TransactionStatus
from gltest import get_contract_factory, get_default_account, get_gl_client
from gltest.accounts import create_accounts
from gltest.assertions import tx_execution_succeeded


# Deselected by default so `pytest tests/` stays offline. Run these with
# `gltest tests/test_crisis_relief_integration.py -m integration -v -s`.
pytestmark = pytest.mark.integration

ONE_GEN = 10**18
ESCROW = 2 * ONE_GEN
SETTLEMENT_WINDOW_SECONDS = 30 * 24 * 60 * 60

# A permanent USGS record of the 2023 M7.8 Pazarcik event in the Kahramanmaras
# sequence: red PAGER alert, reviewed status. Unlike the rolling summary feeds
# this event query is stable, so the evidence does not change under the suite.
TURKEY_QUAKE_URL = (
    "https://earthquake.usgs.gov/fdsnws/event/1/query"
    "?format=geojson&eventid=us6000jllz"
)

BLOCKED_URL = "https://evil.example.com/fake-quake"

# Give the rate limiter room between tests.
COOLDOWN_SECONDS = 8


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def client():
    return get_gl_client()


@pytest.fixture(scope="module")
def funded_account(client):
    """Top up the default account so payable methods can move real value."""
    account = get_default_account()
    client.provider.make_request(
        method="sim_fundAccount", params=[account.address, 100 * ONE_GEN]
    )
    time.sleep(12)
    assert client.get_balance(account.address) > 0, "funding did not land"
    return account


@pytest.fixture(scope="module")
def contract(funded_account):
    """One deployment shared by the module; each test uses its own campaign."""
    factory = get_contract_factory("CrisisRelief")
    deployed = factory.deploy(args=[])
    print("\nDeployed CrisisRelief at", deployed.address)
    return deployed


@pytest.fixture(autouse=True)
def cooldown():
    yield
    time.sleep(COOLDOWN_SECONDS)


def open_campaign(contract, region, crisis, recipient, threshold, value=ESCROW):
    """Create a campaign on chain and return its id."""
    receipt = contract.create_campaign(
        args=[region, crisis, recipient, threshold]
    ).transact(value=value)
    assert tx_execution_succeeded(receipt), "create_campaign reverted"
    return contract.get_campaign_count(args=[]).call()


def fresh_recipient():
    return create_accounts(1)[0].address


# ---------------------------------------------------------------------------
# Deployment and views
# ---------------------------------------------------------------------------


def test_contract_deploys_and_reports_its_trust_model(contract):
    model = contract.get_trust_model(args=[]).call()

    assert model["name"] == "CrisisRelief"
    assert model["allowed_domains"] == [
        "earthquake.usgs.gov",
        "api.reliefweb.int",
        "news.google.com",
        "rss.nytimes.com",
    ]
    assert model["min_confidence_bp"] == 7500
    assert model["settlement_window_seconds"] == SETTLEMENT_WINDOW_SECONDS
    assert model["statuses"] == ["ACTIVE", "EVALUATING", "DISBURSED", "REFUNDED"]
    assert model["numeric_policy"] == "integers only across the nondet boundary"


# ---------------------------------------------------------------------------
# Escrow
# ---------------------------------------------------------------------------


def test_create_campaign_moves_gen_into_contract_escrow(contract, client):
    balance_before = client.get_balance(contract.address)
    recipient = fresh_recipient()

    campaign_id = open_campaign(
        contract, "Sindh, Pakistan", "flood", recipient, "SEVERE"
    )

    assert client.get_balance(contract.address) == balance_before + ESCROW

    record = contract.get_campaign(args=[campaign_id]).call()
    assert record["status"] == "ACTIVE"
    assert record["atto_amount"] == ESCROW
    assert record["target_region"] == "Sindh, Pakistan"
    assert record["relief_address"].lower() == recipient.lower()
    assert record["expiry"] - record["created_at"] == SETTLEMENT_WINDOW_SECONDS


# ---------------------------------------------------------------------------
# Allowlist, enforced before any nondet work happens
# ---------------------------------------------------------------------------


def test_unlisted_domain_is_rejected_without_reaching_consensus(contract):
    campaign_id = open_campaign(
        contract, "Hatay, Turkey", "earthquake", fresh_recipient(), "SEVERE"
    )

    receipt = contract.trigger_relief(args=[campaign_id, BLOCKED_URL]).transact()
    assert not tx_execution_succeeded(receipt)

    record = contract.get_campaign(args=[campaign_id]).call()
    assert record["status"] == "ACTIVE"
    assert record["evidence_url"] == ""


# ---------------------------------------------------------------------------
# The disbursement path
# ---------------------------------------------------------------------------


def test_confirmed_catastrophe_disburses_escrow_to_relief_address(contract, client):
    """
    The end to end claim: real evidence, real consensus, real value transfer.
    """
    recipient = fresh_recipient()
    assert client.get_balance(recipient) == 0

    campaign_id = open_campaign(
        contract, "Kahramanmaras, Turkey", "earthquake", recipient, "SEVERE"
    )
    contract_balance_before = client.get_balance(contract.address)

    receipt = contract.trigger_relief(args=[campaign_id, TURKEY_QUAKE_URL]).transact(
        wait_transaction_status=TransactionStatus.FINALIZED,
        wait_triggered_transactions=True,
        wait_triggered_transactions_status=TransactionStatus.FINALIZED,
    )
    assert tx_execution_succeeded(receipt)

    record = contract.get_campaign(args=[campaign_id]).call()
    print("\nVerdict:", record["verdict_code"], "confidence_bp:", record["confidence_bp"])
    print("Reported severity rank:", record["reported_severity_rank"])
    print("Reason:", record["reason"])

    assert record["status"] == "DISBURSED"
    assert record["verdict_code"] == 1
    assert record["confidence_bp"] >= 7500
    assert record["reported_severity_rank"] >= record["severity_rank_required"]
    assert record["atto_amount"] == 0
    assert record["evidence_url"] == TURKEY_QUAKE_URL

    # The escrow left the contract and landed at the relief address.
    assert client.get_balance(contract.address) == contract_balance_before - ESCROW
    assert client.get_balance(recipient) == ESCROW

    # And the vault cannot be drained twice.
    replay = contract.trigger_relief(args=[campaign_id, TURKEY_QUAKE_URL]).transact()
    assert not tx_execution_succeeded(replay)
    assert client.get_balance(recipient) == ESCROW


# ---------------------------------------------------------------------------
# Negative consensus: the model rejects, the escrow stays put
# ---------------------------------------------------------------------------


def test_region_mismatch_leaves_escrow_locked(contract, client):
    """
    Genuine evidence of a genuine catastrophe, but in the wrong place. The
    payout gate should hold and the funds should stay in the contract.
    """
    recipient = fresh_recipient()
    campaign_id = open_campaign(
        contract, "Tokyo, Japan", "earthquake", recipient, "SEVERE"
    )
    contract_balance_before = client.get_balance(contract.address)

    receipt = contract.trigger_relief(args=[campaign_id, TURKEY_QUAKE_URL]).transact(
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    assert tx_execution_succeeded(receipt), "evaluation itself should not revert"

    record = contract.get_campaign(args=[campaign_id]).call()
    print("\nMismatch verdict:", record["verdict_code"], "reason:", record["reason"])

    assert record["status"] == "ACTIVE"
    assert record["atto_amount"] == ESCROW
    assert record["evidence_url"] == TURKEY_QUAKE_URL
    assert client.get_balance(contract.address) == contract_balance_before
    assert client.get_balance(recipient) == 0


# ---------------------------------------------------------------------------
# Consensus across a heterogeneous validator set
# ---------------------------------------------------------------------------


def test_validator_set_is_heterogeneous(client):
    """
    StudioNet runs a mixed pool of models. This is what makes the validator
    function meaningful: agreement has to survive different models phrasing
    the same judgement differently, which is why the validator compares
    derived integer decisions rather than raw text.
    """
    response = client.provider.make_request(method="sim_getAllValidators", params=[])
    validators = response["result"]

    models = {(v.get("provider"), v.get("model")) for v in validators}
    print(f"\n{len(validators)} validators across {len(models)} distinct models")

    assert len(validators) >= 3
    assert len(models) >= 2, "validator pool is not heterogeneous"


def test_consensus_records_agreement_from_multiple_validators(contract):
    """
    Drive one evaluation and inspect the consensus record: a leader receipt
    plus validator receipts that agreed on the outcome.
    """
    campaign_id = open_campaign(
        contract, "Kahramanmaras, Turkey", "earthquake", fresh_recipient(), "SEVERE"
    )

    receipt = contract.trigger_relief(args=[campaign_id, TURKEY_QUAKE_URL]).transact(
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    assert tx_execution_succeeded(receipt)

    consensus = receipt["consensus_data"]
    validator_receipts = consensus.get("validators", [])
    votes = consensus.get("votes", {})
    print(f"\nLeader plus {len(validator_receipts)} validator receipts")
    print("Votes:", votes)

    assert len(validator_receipts) >= 1, "no validator participated"

    agreements = [v for v in votes.values() if str(v).upper() == "AGREE"]
    assert len(agreements) >= 1, f"no validator agreed with the leader: {votes}"

    record = contract.get_campaign(args=[campaign_id]).call()
    assert record["status"] == "DISBURSED"
