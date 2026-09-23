# hdog-agent — a dog agent that trades all the dog runners

Built for the **Hacka Dog ($HDOG)** hackathon on [hackalaunch.com](https://hackalaunch.com/h/hacka-dog-2).
The rule was five words long: *build a dog agent that trades all the dog runners*.

So this is an autonomous agent that decides, on its own, **which** Solana tokens
count as dog runners, **whether** each one is actually running, **how much** to
put into it, and **when** to get out — then executes and journals every fill.

```
  tick 1/8   universe 9 dog runners
   WIFHAT      73.9  ███████████████·····  ENTER
   SHIBX       60.9  ████████████········  ENTER
   HDOG        59.5  ████████████········  ENTER
   BONKY       43.8  █████████···········  watch
   VERTDOG      100  ████████████████████  blow-off-top
   WASHDOG     94.1  ███████████████████·  wash-volume
    BUY  WIFHAT        $200.00  108.079 @ 1.85049 (3 bps)
        ↳ runner score 73.9
   equity $998.20  cash $398.20  open 3  pnl +$0.0000
```

## Run it in 30 seconds

```bash
npm install
npm test          # 77 tests, ~95% line coverage
npm run doctor    # checks config + talks to real Solana devnet
npm start         # trades the recorded tape end to end
```

No API key. No wallet. No account. `npm start` works on a fresh clone.

## What it actually does

**1. Universe — what is a dog?**
`src/lexicon.js` matches a token's name and symbol against a dog lexicon
(`dog`, `inu`, `shiba`, `wif`, `bonk`, `corgi`, `hound`, …). Ambiguous words
like `bone`, `paw` and `wif` only count as standalone tokens, so *Carbone
Protocol* and *Swift Pay* are not dogs. This is the "all the dog runners" part
of the rule: the agent discovers its own universe instead of trading a
hardcoded list.

**2. Signal — is it running?**
`src/strategy/score.js` blends the 5m/1h/6h price changes (weighted toward the
recent), the 24h-volume-to-liquidity ratio, and pool depth into a 0–100 score.

**3. Gates — the part that matters.**
A score alone never buys anything. Seven hard blockers must all pass:

| blocker | why |
|---|---|
| `not-a-dog` | wrong universe — a cat is not a dog |
| `thin-liquidity` | a pool you cannot exit is not a position |
| `too-new` | no history to trade against |
| `no-momentum` | a deep, liquid, high-volume pool can clear the score bar while going nowhere |
| `rolling-over` | up 97% on the hour but the current candle is red — the move is over |
| `blow-off-top` | a vertical 5m candle is the top, not the entry |
| `wash-volume` | 150x volume on a 22k pool is wash trading, not demand |

**4. Risk — `src/strategy/decide.js`.**
Max 5 concurrent positions at 20% of equity each, a hard stop at −18%, a target
at +45%, a trailing stop that only arms once a position is green, a
momentum-decay exit, and a 30-minute cooldown before re-entering a name it just
sold. Exits are planned before entries so freed cash and freed slots are usable
in the same tick.

**5. Execution — `src/exec/`.**
Fills are priced with a constant-product impact model
(`impact_bps = notional / liquidity × 0.6 × 10_000`); buyers pay up, sellers get
hit down, and a fill that would move the market more than 500 bps is **refused**
rather than filled at a worse price. Every fill pays a 30 bps taker fee.

## What is real, and what is not

This section exists so nobody has to guess.

| part | status |
|---|---|
| Universe filter, scoring, gates, risk, position accounting | **Real.** 77 unit tests, ~95% line coverage. |
| Live market data (`--source=dexscreener`) | **Real.** Public read-only API, no key, filtered to Solana dog pairs. |
| Fill pricing, slippage, fees, PnL | **Real model, simulated fills.** No order reaches a live market. |
| Solana devnet connectivity (`npm run doctor`) | **Real.** Hits `api.devnet.solana.com`, prints the live slot and genesis hash. |
| On-chain devnet settlement (`HDOG_VENUE=devnet`) | **Implemented and unit-tested, but not yet executed by us** — see below. |
| Mainnet trading | **Deliberately impossible.** `config.js` refuses a mainnet RPC. |

### About the devnet settlement path

`src/exec/devnetExecutor.js` anchors each fill on Solana devnet as a real
transaction: a small SOL transfer to a settlement account carrying an SPL Memo
with the fill record, returning a real signature you can open in an explorer.

**We could not execute it ourselves.** The public devnet faucet answered every
airdrop request with `429 — you've either reached your airdrop limit today or
the airdrop faucet has run dry`, and the alternative faucet needs an interactive
login that an automated agent should not be performing. The code path is
written, unit-tested and wired into the CLI, but no signature has been produced
by us. [RUN.md](RUN.md) has the exact three commands to fund a devnet key and
run it yourself.

Be clear about what this path *is*, even when funded: devnet has no liquidity
for mainnet dog runners, so the **price** comes from live market data while the
**settlement** is a genuine devnet transaction. It is an auditable on-chain
record of what the agent decided — not a claim that a devnet swap filled.

### Why devnet only

Because an agent that can move real money should not be handed one on day one.
Every hard rule the team works under is enforced in code, not in prose:
no wallet is ever connected or imported, no key is read except from a path the
operator sets, a mainnet RPC is rejected by config validation, there is no admin
or backdoor path, and `.gitignore` keeps keypairs out of the repository.

## Layout

```
src/
  lexicon.js              what counts as a dog
  config.js               defaults, env overrides, fail-fast validation
  agent.js                discover → score → decide → execute → journal
  render.js               terminal output
  cli.js                  doctor | once | run
  discovery/
    fixtureSource.js      deterministic recorded tape
    dexscreenerSource.js  live read-only market data
  strategy/
    score.js              scoring + hard blockers
    decide.js             risk limits, entries and exits
  portfolio/portfolio.js  immutable position and PnL accounting
  exec/
    paperExecutor.js      slippage + fee pricing
    devnetExecutor.js     on-chain devnet settlement
test/                     77 tests
fixtures/                 the recorded tape (regenerate: npm run fixture)
```

Every module returns new objects instead of mutating; a portfolio snapshot is
frozen, so a tick can be replayed or discarded without side effects.

## The recorded tape

`fixtures/runners.sample.json` is **synthetic but internally consistent**: nine
tokens, eight 5-minute candles, every `change` field computed from an explicit
price path in `scripts/make_fixture.mjs`. It is not a recording of real market
history, and it is not random — it is a fixed scenario designed to exercise
every branch: a clean trend that hits the take-profit, a pump that knifes into
the stop-loss, a grinder, and five tokens that must each be blocked for a
different reason. Regenerate it with `npm run fixture`.

For live data instead: `npm run live`.

## Pre-hackathon code disclosure

**None.** Every file in this repository was written on 2026-09-24, after the
Hacka Dog hackathon brief was published, specifically for this submission. The
only third-party dependency is [`@solana/web3.js`](https://github.com/solana-labs/solana-web3.js)
(Apache-2.0), used for devnet RPC and transaction building. No other code,
assets, fonts or images are included. The terminal output is plain ASCII and
Unicode block characters.

## Team

Warung Ops — Henggar · X [@issue0x](https://x.com/issue0x) · Telegram @sambobolo

## Licence

MIT — see [LICENSE](LICENSE).
