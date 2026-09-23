# Submission — Hacka Dog ($HDOG)

**Project:** hdog-agent — a dog agent that trades all the dog runners
**Team:** Warung Ops (Henggar) · X [@issue0x](https://x.com/issue0x) · Telegram @sambobolo
**Repository:** _(fill in after `gh repo create` — see RUN.md step 3)_
**Demo:** `demo.mp4` (under 3 minutes, recorded from a real run)
**Payout wallet:** `7W31iaCmjerN1jkpEnmZevn74SZxv83yEQvLsnc4PS7Q`
**Licence:** MIT

---

## Description (paste this into the platform)

The rule was five words: *build a dog agent that trades all the dog runners.*

**hdog-agent** is an autonomous agent that works out for itself which Solana
tokens are dog runners, whether each one is actually running, how much to risk
on it, and when to get out — then executes and journals every fill. It runs on
a fresh clone with `npm install && npm start`. No API key, no wallet, no account.

**It discovers its own universe.** `src/lexicon.js` classifies a token by name
and symbol against a dog lexicon — dog, inu, shiba, wif, bonk, corgi, hound and
thirty more. Ambiguous words like *bone*, *paw* and *wif* only count standalone,
so Carbone Protocol and Swift Pay are correctly not dogs. That is the "all the
dog runners" half of the rule: nothing is hardcoded, point it at live data with
`npm run live` and it finds today's dogs by itself.

**It has an opinion about what "running" means.** A 0–100 score blends 5m/1h/6h
momentum, the volume-to-liquidity ratio and pool depth. But a score never buys
anything on its own — seven hard gates have to pass first, and most of the work
is in the gates:

- `not-a-dog` — wrong universe
- `thin-liquidity` — a pool you cannot exit is not a position
- `too-new` — no history to trade against
- `no-momentum` — a deep, liquid, high-volume pool can clear the score bar while going nowhere
- `rolling-over` — up 97% on the hour but the current candle is red; the move is over
- `blow-off-top` — a vertical 5m candle is the top, not the entry
- `wash-volume` — 150x volume on a 22k pool is wash trading, not demand

**It manages risk like it expects to be wrong.** Five positions maximum at 20%
of equity each, a hard stop at −18%, a target at +45%, a trailing stop that only
arms once a position is green, a momentum-decay exit, and a 30-minute cooldown
before re-entering a name it just sold. Exits are planned before entries so
freed cash and slots are reusable in the same tick. Fills are priced with a
constant-product impact model and a 30 bps fee — and a fill that would move the
market more than 500 bps is refused outright rather than filled at a worse price.

**Everything is verifiable.** 77 tests, ~95% line coverage, `npm test`. Every
tick, decision, fill and skip is appended to `runs/journal.jsonl`. The demo is a
real run: over the shipped tape the agent takes four positions, takes profit on
the trend at +59.4%, stops out of the pump-and-knife at −20.1%, blocks five
tokens for five different reasons, and finishes +15.5%.

**On Solana, devnet only, on purpose.** `npm run doctor` makes a real call to
`api.devnet.solana.com` and prints the live slot and genesis hash. With
`HDOG_VENUE=devnet` each fill is anchored on devnet as a real transaction — a
SOL transfer carrying an SPL Memo with the fill record, returning a signature
you can open in an explorer. An agent that can move real money should not be
handed one on day one, so the guardrails are code, not prose: no wallet is ever
connected or imported, a mainnet RPC is rejected by config validation, there is
no admin path, and keypairs are gitignored.

---

## What we are not claiming

Stated plainly so nobody has to guess, and so the judging is on what is real:

1. **Fills are simulated, not swapped.** The pricing model (depth-based impact,
   fees, refusal above 500 bps) is real and tested; no order reaches a live
   market. Devnet has no liquidity in mainnet dog runners, so a devnet fill is
   an auditable on-chain *record* of the agent's decision, not a real swap.
2. **The devnet settlement path has not been executed by us.** It is implemented
   and unit-tested, but the public devnet faucet answered every airdrop request
   on 2026-09-24 with `429 — you've either reached your airdrop limit today or
   the airdrop faucet has run dry`, and the alternative faucet requires an
   interactive login an automated agent should not perform. No signature has
   been produced by us. RUN.md step 2 has the three commands to fund a key and
   run it. Devnet RPC connectivity itself *is* demonstrated in the video.
3. **The shipped tape is synthetic, not market history.** Nine tokens over eight
   5-minute candles, every price change computed from an explicit price path in
   `scripts/make_fixture.mjs`. It is a fixed scenario chosen to exercise every
   branch, not a backtest — so the +15.5% in the demo is a demonstration of the
   machinery, not a performance claim. `npm run live` runs the same agent on
   live market data.
4. **No pre-hackathon code.** Every file was written on 2026-09-24, after the
   brief was published. The only dependency is `@solana/web3.js` (Apache-2.0).

## Deliverables checklist

| requirement | status |
|---|---|
| Public GitHub repository | ready to push — `gh repo create` line in RUN.md |
| Demo video ≤ 3 minutes | `demo.mp4`, recorded from a real run (`demo_small.mp4` if size-capped) |
| Description | this file |
| Working project meeting the rule | `npm install && npm start` on a fresh clone |
| MIT licence | `LICENSE` |
| No secrets committed | `.env.example` only; keypairs gitignored |
