"""
Deploy CrisisRelief to StudioNet and record the result.

    .venv/bin/python scripts/deploy_studionet.py

By default a fresh deployer key is generated and funded through
`sim_fundAccount`. Set DEPLOYER_PRIVATE_KEY to reuse an existing key, which is
what you want if the deployed contract's `owner` needs to stay stable across
redeployments.

The deployed address is written to deployments/studionet.json and printed. The
private key is never written to disk.
"""

import json
import os
import pathlib
import sys
import time

from eth_account import Account
from genlayer_py import create_client
from genlayer_py.chains import studionet


ONE_GEN = 10**18
FUNDING = 100 * ONE_GEN

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONTRACT_PATH = ROOT / "contracts" / "crisis_relief.py"
OUTPUT_PATH = ROOT / "deployments" / "studionet.json"
APP_OUTPUT_PATH = ROOT / "app" / "src" / "lib" / "deployment.json"


def main() -> int:
    private_key = os.environ.get("DEPLOYER_PRIVATE_KEY")
    if private_key:
        account = Account.from_key(private_key)
        print(f"Using deployer from DEPLOYER_PRIVATE_KEY: {account.address}")
    else:
        account = Account.create()
        print(f"Generated deployer: {account.address}")
        print("Set DEPLOYER_PRIVATE_KEY to reuse this identity:")
        print(f"  export DEPLOYER_PRIVATE_KEY={account.key.hex()}")

    client = create_client(chain=studionet, account=account)

    balance = client.get_balance(account.address)
    if balance < ONE_GEN:
        print(f"Funding deployer with {FUNDING // ONE_GEN} GEN ...")
        client.provider.make_request(
            method="sim_fundAccount", params=[account.address, FUNDING]
        )
        for _ in range(12):
            time.sleep(5)
            balance = client.get_balance(account.address)
            if balance > 0:
                break
    print(f"Deployer balance: {balance / ONE_GEN:.4f} GEN")
    if balance == 0:
        print("ERROR: deployer could not be funded", file=sys.stderr)
        return 1

    code = CONTRACT_PATH.read_bytes()
    print(f"Deploying {CONTRACT_PATH.name} ({len(code)} bytes) to StudioNet ...")

    tx_hash = client.deploy_contract(code=code, args=[])
    receipt = client.wait_for_transaction_receipt(
        transaction_hash=tx_hash, interval=10000, retries=90
    )

    address = receipt["data"]["contract_address"]
    print(f"Deployed at: {address}")

    # Prove the deployment is live before recording it.
    trust_model = client.read_contract(
        address=address, function_name="get_trust_model", args=[]
    )
    assert trust_model["name"] == "CrisisRelief", trust_model
    print(f"Verified on chain, owner = {trust_model['owner']}")

    record = {
        "network": "studionet",
        "chain_id": studionet.id,
        "rpc_url": studionet.rpc_urls["default"]["http"][0],
        "contract_name": "CrisisRelief",
        "contract_address": address,
        "deployer": account.address,
        "owner": trust_model["owner"],
        "deployment_tx": tx_hash if isinstance(tx_hash, str) else tx_hash.hex(),
        "deployed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "allowed_domains": trust_model["allowed_domains"],
        "min_confidence_bp": trust_model["min_confidence_bp"],
        "severity_levels": trust_model["severity_levels"],
        "settlement_window_seconds": trust_model["settlement_window_seconds"],
        "statuses": trust_model["statuses"],
    }

    encoded_record = json.dumps(record, indent=2) + "\n"
    for output_path in (OUTPUT_PATH, APP_OUTPUT_PATH):
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(encoded_record)
        print(f"Wrote {output_path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
