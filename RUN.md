# RUN.md — how to run, verify and publish this repo

## 1. Run it

```bash
npm install
npm test            # 91 tests
npm run coverage    # 99% line coverage
npm run doctor      # config summary + a live call to Solana devnet
npm start           # 8 ticks over the recorded tape, then flatten the book
```

Useful variants:

```bash
npm run once                        # exactly one tick
npm run live                        # live read-only market data instead of the tape
node src/cli.js run --ticks=20 --tick-seconds=0   # fast replay, no pacing
HDOG_COLOR=0 npm start > run.txt    # plain text, no ANSI
npm run fixture                     # regenerate the recorded tape
```

Every run appends structured events to `runs/journal.jsonl`:

```bash
cat runs/journal.jsonl | head -3
```

## 2. Optional: anchor fills on Solana devnet

Not required to evaluate the agent, and **we have not run this ourselves** —
every airdrop attempt on 2026-09-24, devnet and testnet, on freshly generated
keys, returned `429 Too Many Requests` (the faucet limit is per IP per day and
resets at 00:00 UTC). The code path is unit-tested end to end against a stubbed
RPC; these are the exact commands to execute it for real. It takes a minute,
and the resulting explorer link is the one thing this packet cannot produce by
itself.

```bash
# a throwaway DEVNET keypair — valueless test SOL, never a real wallet
solana-keygen new --no-bip39-passphrase -o devnet-agent.json
solana-keygen new --no-bip39-passphrase -o devnet-settlement.json

# fund the agent key (retry, or use https://faucet.solana.com if rate limited)
solana airdrop 1 -k devnet-agent.json --url devnet

HDOG_VENUE=devnet \
HDOG_KEYPAIR_PATH=devnet-agent.json \
HDOG_SETTLEMENT_PUBKEY=$(solana-keygen pubkey devnet-settlement.json) \
node src/cli.js run --ticks=4 --tick-seconds=0
```

`npm run doctor` with `HDOG_KEYPAIR_PATH` set reports the account balance and
whether it is funded enough to settle. Each fill then prints a real devnet
signature; open it at
`https://explorer.solana.com/tx/<signature>?cluster=devnet` and read the memo.

Both `.json` keypairs are covered by `.gitignore`. A mainnet RPC is rejected by
config validation, so this cannot be pointed at real money.

## 3. Publish the repo

The repository is public at
<https://github.com/valeemlbb-cell/hackalaunch-hacka-dog-2>. To publish a fork
of it yourself, run `gh auth login` once, then from inside the checkout:

```bash
gh repo create hdog-agent --public --source=. --remote=origin --push --description "A dog agent that hunts, scores and trades Solana dog-runner tokens. Devnet only. Built for the Hacka Dog hackathon."
```

To push the current commits to the existing repository instead (one
`gh auth login`, then):

```bash
git remote add origin https://github.com/valeemlbb-cell/hackalaunch-hacka-dog-2.git 2>/dev/null || true
git push -u origin HEAD:main
```

Then confirm what went public:

```bash
gh repo view --web
git log --oneline
```

Check before you push: no `.env`, no `*.json` keypair, no `runs/` directory,
no `node_modules/`. `git status --ignored --short` will show them as ignored.

## 4. Submit

1. Repository URL from step 3.
2. `demo.mp4` (55 s) — or `demo_small.mp4`, the same cut re-encoded small
   enough for platforms that cap upload size.
3. Description: paste from [SUBMISSION.md](SUBMISSION.md).
4. Payout wallet: `7W31iaCmjerN1jkpEnmZevn74SZxv83yEQvLsnc4PS7Q`

Submission closes **30 September, 2:59 PM UTC**; token-holder voting runs the
24 hours after that.
