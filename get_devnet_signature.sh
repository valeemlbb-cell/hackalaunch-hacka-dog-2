#!/usr/bin/env bash
# One devnet signature for the hacka-dog-2 submission. Valueless test SOL,
# throwaway keys, devnet only. Takes about a minute once the faucet lets you in.
set -euo pipefail
cd "$(dirname "$0")"

solana-keygen new --no-bip39-passphrase --force -o devnet-agent.json
solana-keygen new --no-bip39-passphrase --force -o devnet-settlement.json
solana airdrop 1 -k devnet-agent.json --url devnet   # retry, or https://faucet.solana.com

HDOG_VENUE=devnet \
HDOG_KEYPAIR_PATH=devnet-agent.json \
HDOG_SETTLEMENT_PUBKEY="$(solana-keygen pubkey devnet-settlement.json)" \
HDOG_COLOR=0 \
node src/cli.js run --ticks=4 --tick-seconds=0 | tee devnet-run.txt

echo
echo "Signatures printed above. Open one at:"
echo "  https://explorer.solana.com/tx/<signature>?cluster=devnet"
echo "Then paste that link into README.md and SUBMISSION.md and re-commit."
