import { test } from "node:test";
import assert from "node:assert/strict";
import { blendedMomentumPct, clamp, findBlockers, scoreRunner, scoreUniverse, volumeRatio } from "../src/strategy/score.js";
import { quote, testConfig } from "./helpers.js";

const config = testConfig();

test("clamp keeps values inside the range and handles NaN", () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-3, 0, 1), 0);
  assert.equal(clamp(Number.NaN, 0, 1), 0);
});

test("blended momentum weights the recent windows hardest", () => {
  const fresh = blendedMomentumPct({ m5: 10, h1: 0, h6: 0 });
  const stale = blendedMomentumPct({ m5: 0, h1: 0, h6: 10 });
  assert.ok(fresh > stale);
  assert.equal(blendedMomentumPct({ m5: 10, h1: 10, h6: 10 }), 10);
});

test("volume ratio is zero for an empty pool instead of Infinity", () => {
  assert.equal(volumeRatio({ liquidityUsd: 0, volume24hUsd: 10 }), 0);
  assert.equal(volumeRatio({ liquidityUsd: 100, volume24hUsd: 250 }), 2.5);
});

test("a healthy dog runner scores above the entry threshold", () => {
  const scored = scoreRunner(quote(), config);
  assert.ok(scored.eligible, `blockers: ${scored.blockers}`);
  assert.ok(scored.score >= config.minScore, `score was ${scored.score}`);
});

test("every hard gate produces its own blocker", () => {
  assert.ok(findBlockers(quote({ symbol: "CATNIP", name: "Catnip" }), config).includes("not-a-dog"));
  assert.ok(findBlockers(quote({ liquidityUsd: 100 }), config).includes("thin-liquidity"));
  assert.ok(findBlockers(quote({ ageHours: 0.1 }), config).includes("too-new"));
  assert.ok(findBlockers(quote({ change: { m5: 140 } }), config).includes("blow-off-top"));
  assert.ok(findBlockers(quote({ volume24hUsd: 10 }), config).includes("no-volume"));
  assert.ok(
    findBlockers(quote({ liquidityUsd: 20_000, volume24hUsd: 5_000_000 }), config).includes("wash-volume"),
  );
  assert.ok(findBlockers(quote({ priceUsd: 0 }), config).includes("bad-price"));
});

test("a token that already rolled over is not entered on its 1h chart", () => {
  // up 97% on the hour but the current candle is red: the move is over
  const done = quote({ change: { m5: -15, h1: 97, h6: 1400 } });
  const scored = scoreRunner(done, config);
  assert.ok(scored.score > config.minScore, "it still scores well, which is the trap");
  assert.equal(scored.eligible, false);
  assert.ok(scored.blockers.includes("rolling-over"));
});

test("a flat token is never entered, however deep its pool", () => {
  const flat = scoreRunner(quote({ change: { m5: 0, h1: 0, h6: 0 } }), config);
  const running = scoreRunner(quote({ change: { m5: 12, h1: 20, h6: 30 } }), config);
  assert.ok(running.score > flat.score);
  // a deep, liquid, high-volume pool can still clear the score bar on
  // liquidity + volume alone, so momentum is a hard gate, not just a weight
  assert.equal(flat.eligible, false);
  assert.ok(flat.blockers.includes("no-momentum"));
  assert.ok(running.eligible);
});

test("scoreUniverse sorts strongest first and is stable on ties", () => {
  const scores = scoreUniverse(
    [
      quote({ mint: "a", symbol: "AAA", change: { m5: 1, h1: 1, h6: 1 } }),
      quote({ mint: "b", symbol: "BBB", change: { m5: 20, h1: 25, h6: 30 } }),
      quote({ mint: "c", symbol: "CCC", change: { m5: 1, h1: 1, h6: 1 } }),
    ],
    config,
  );
  assert.equal(scores[0].symbol, "BBB");
  assert.deepEqual(scores.slice(1).map((s) => s.symbol), ["AAA", "CCC"]);
});

test("score never leaves the 0..100 range", () => {
  const extreme = scoreRunner(
    quote({ change: { m5: 900, h1: 900, h6: 900 }, liquidityUsd: 40_000_000, volume24hUsd: 80_000_000 }),
    config,
  );
  assert.ok(extreme.score <= 100 && extreme.score >= 0);
});
