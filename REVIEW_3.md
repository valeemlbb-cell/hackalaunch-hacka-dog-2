# REVIEW_3 — judge 3 (token-holder vote lens)

Hackathon: Hacka Dog ($HDOG), hackalaunch.com/h/hacka-dog-2
Rule (verified on the live page 2026-09-24): "build a dog agent that trades all the dog runners".
Page state at review: Submissions open, **0 submissions**, prize pool 0.0636 SOL (~$6.71), MC $3.3K.
Winner = 24h token-holder vote after close.

## Verified myself
- `node scripts/run_tests.mjs` → 77 pass / 0 fail.
- `demo.mp4`, `demo_x.mp4`, `demo_small.mp4` all 55.2 s (well under 3 min).
- Repo IS live and public: https://github.com/valeemlbb-cell/hackalaunch-hacka-dog-2 (HTTP 200, all files present, MIT LICENSE, `.env.example` only, no keypairs, `runs/` gitignored).
- Rules page reachable, rule text matches what README claims.

## Score: 82 / 100

Would I vote for it over a typical submission? Yes — it is far above the median
meme-hackathon entry (real tests, real gates, honest disclosure). It does not
yet feel *inevitable*, because nothing in it has touched a chain.

### Strengths
- Directly answers all five words of the rule: discovers its own dog universe
  (lexicon, not a hardcoded list), scores "running", trades, journals.
- The seven gates are the actual product and are explained well.
- Honesty section ("what is real, what is not") buys real trust from a voter.
- Zero-friction eval: `npm install && npm start` on a fresh clone, no key.

### Why a voter hesitates
1. **No devnet signature exists.** README/RUN.md admit the settlement path was
   never executed (faucet 429). This is the single line a rival will quote.
   Everything else is simulated fills on a synthetic tape.
2. **SUBMISSION.md still says Repository: _(fill in after gh repo create)_**
   while the repo is already public. A judge reading the pasted description
   sees a blank where the proof should be.
3. Demo is terminal-only and defaults to the synthetic tape; a voter cannot
   tell from the video that it works on real market data.
4. Nothing holder-facing: no screenshot/GIF in the README header, no hosted
   run, nothing to retweet.

## Single change that most raises odds
**Land one real devnet transaction and put the explorer link at the top of the
README, in SUBMISSION.md, and on screen in the video.** Fund `devnet-agent.json`
manually (faucet.solana.com, or any funded devnet key), run the 4-tick devnet
command already in RUN.md step 2, then paste the signature URL. It converts the
weakest sentence in the packet ("implemented but not executed by us") into the
strongest ("here is the tx, open it"). Everything else is polish.

## Concrete fixes, ranked
1. Execute the devnet path; add `docs/devnet-proof.md` with signature(s) +
   explorer links; replace the "not yet executed by us" row with the link.
2. Fill the Repository field in SUBMISSION.md with the live URL; fix RUN.md §3
   so it reads "already published at <url>" rather than mixing that with the
   `gh repo create` instructions.
3. Re-cut the video: ~10 s of `npm run live` on real DexScreener dog pairs and
   ~10 s of the devnet signature opening in the explorer, keeping total ≤ 90 s.
4. Add a README hero: one 3-second GIF of the tick render above the fold.
5. Say the pool/vote out loud in SUBMISSION.md — one line addressed to $HDOG
   holders on why this is the useful thing to fund — plus a ready-to-post X
   thread in the packet for the voting window.
6. Minor: state in README that `npm run live` hits a third-party public API
   read-only and works without a key, so a cautious voter running it knows
   what egress to expect.
