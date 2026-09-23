# REVIEW_2 — deliverables checklist audit (hacka-dog-2)

Judge 2. Audited 2026-09-24. Rules page re-read: https://hackalaunch.com/h/hacka-dog-2
Brief: *"build a dog agent that trades all the dog runners"*. Close 30 Sep 2:59 PM UTC,
pool 0.0636 SOL, winner by 24h token-holder vote. No formal judging rubric published —
so the packet is judged as: does every required artefact exist, work, and match its claims.

## Checklist

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1 | Public GitHub repo | PASS | github.com/valeemlbb-cell/hackalaunch-hacka-dog-2 fetched anonymously — public, MIT, 40 tracked files |
| 2 | Demo video <= 3 min | PASS | 55.2s, three encodes, h264 |
| 3 | Demo shows the real thing | PASS | frames at 2s/25s/52s: real tick output, gates firing, BUY fills, equity line; outro card states limits |
| 4 | Description | PASS (one blank field) | SUBMISSION.md — repo URL line still a placeholder |
| 5 | Tests run and pass | PASS (re-run by me) | `node scripts/run_tests.mjs` → 77 pass / 0 fail, node v24.19.0 |
| 6 | Coverage claim ~95% | PASS | `--experimental-test-coverage` → all files 94.95% line, 87.76% branch |
| 7 | README setup/networks/program IDs | PASS | install/test/doctor/start, fixture vs live source, devnet-only rationale, real/not-real table. No program IDs to state — there is no deployed program |
| 8 | Fresh-clone runnable | PASS | one dep (@solana/web3.js), no key, no wallet, no account |
| 9 | Devnet only, mainnet blocked | PASS | config.js:136 rejects any `mainnet` RPC; `npm run doctor` hit api.devnet.solana.com live (slot 503122582, core 4.3.0-rc.0) |
| 10 | No secrets committed | PASS | `.env.example` only, no values; `.gitignore` covers `*keypair*.json`, `*devnet*.json`, `.env`, `runs/`; grep for key material clean |
| 11 | No admin/backdoor path | PASS | no privileged branch in src/; no outreach/posting feature at all |
| 12 | Pre-hackathon work marked | PASS | explicit "**None.**" disclosure in README + SUBMISSION item 4; git history is 3 commits all dated 2026-09-24 |
| 13 | MIT licence | PASS | LICENSE, Copyright 2026 Warung Ops |
| 14 | Licensed assets only | PASS | ASCII/Unicode terminal render, no fonts or images shipped |
| 15 | Payout wallet stated | PASS | 7W31iaCmjerN1jkpEnmZevn74SZxv83yEQvLsnc4PS7Q in SUBMISSION.md + RUN.md |
| 16 | gh push line in RUN.md | PASS | present, `--public --push`; repo already pushed |

Nothing required is missing. The honesty sections are the packet's strongest asset —
every claim I spot-checked (77 tests, 94.95%, devnet reachable, synthetic tape) was true.

## Fixes, highest value first

1. **SUBMISSION.md still says `Repository: _(fill in after gh repo create)_`** while the
   repo is live. The description is the block pasted into the platform; shipping it with a
   blank repo line is the single likeliest way to lose the submission. Set it to
   `https://github.com/valeemlbb-cell/hackalaunch-hacka-dog-2`.
2. **The video's outro card says `github: hdog-agent`** — not a resolvable URL. A voter who
   only watches the clip cannot find the repo. Re-render the last card with the full slug.
3. **RUN.md step 3 `gh repo create hdog-agent`** contradicts the actual repo name
   (`hackalaunch-hacka-dog-2`) named two lines above it. Make the command match, or label it
   clearly as "to fork under your own name".
4. **No on-chain artefact.** The faucet 429 is disclosed cleanly and the disclosure is worth
   more than a fake signature — but on a Solana hackathon a single real devnet tx would turn
   the weakest row of the honesty table into the strongest. Retry `solana airdrop` on a
   different egress, or ask the user for ~0.05 devnet SOL, then paste one explorer link into
   README and SUBMISSION and cut a 5s shot into the video.
5. **`demo_x.mp4` is byte-identical to `demo_small.mp4`** (md5 55bfbf56…). Drop one; 835 KB of
   duplicate binary in a judged repo reads as sloppiness.
6. **No CI.** A 12-line `.github/workflows/test.yml` running `npm ci && npm test` gives voters
   a green check without cloning. Cheap, visible, and it substantiates the 77-tests claim.
7. **No sample journal in the repo** — `runs/` is gitignored (correctly), so the
   "every fill is journalled" claim has nothing to point at. Commit a trimmed
   `docs/journal.sample.jsonl` from a real run.
8. **Video has no audio track.** The title and outro cards carry the argument, so this is
   survivable, but 30s of voiceover or on-screen step captions over the tick section would
   make the gate logic legible to a voter who does not read terminals.

## Score

**88 / 100.** Every required deliverable is present, verified by re-execution, and honestly
labelled. Points off for the blank repo field in the description (1), the unreachable repo
reference in the video (2), the naming contradiction (3), and the absence of any on-chain
evidence on a Solana hackathon (4). Fixes 1–3 and 5 are minutes of work and should land
before submission.
