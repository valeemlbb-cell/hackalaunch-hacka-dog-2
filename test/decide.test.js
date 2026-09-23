import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, exitReason, inCooldown } from "../src/strategy/decide.js";
import { applyFill, createPortfolio, markToMarket } from "../src/portfolio/portfolio.js";
import { quote, testConfig } from "./helpers.js";

const config = testConfig();
const NOW = new Date("2026-09-24T12:00:00.000Z");

/** @param {Partial<import("../src/types.js").Position>} patch */
function position(patch = {}) {
  return {
    mint: "m",
    symbol: "HDOG",
    qty: 100,
    avgPriceUsd: 1,
    lastPriceUsd: 1,
    openedAt: "2026-09-24T11:00:00.000Z",
    peakPriceUsd: 1,
    ...patch,
  };
}

test("stop loss fires below the configured drawdown", () => {
  assert.match(exitReason(position({ lastPriceUsd: 0.8 }), 60, config), /stop-loss/);
  assert.equal(exitReason(position({ lastPriceUsd: 0.95 }), 60, config), null);
});

test("take profit fires above the target", () => {
  assert.match(exitReason(position({ lastPriceUsd: 1.5, peakPriceUsd: 1.5 }), 60, config), /take-profit/);
});

test("the trailing stop only applies to a winner giving back its gain", () => {
  const winner = position({ lastPriceUsd: 1.1, peakPriceUsd: 1.45 });
  assert.match(exitReason(winner, 60, config), /trailing-stop/);
  // still under water: the stop loss owns this case, not the trailing stop
  const loser = position({ lastPriceUsd: 0.95, peakPriceUsd: 1.3 });
  assert.equal(exitReason(loser, 60, config), null);
});

test("a token that dies or leaves the universe is closed", () => {
  assert.match(exitReason(position(), 5, config), /momentum gone/);
  assert.equal(exitReason(position(), undefined, config), "left universe");
});

test("cooldown blocks re-entry for the configured window", () => {
  const portfolio = { ...createPortfolio(100), closedAt: { m: "2026-09-24T11:45:00.000Z" } };
  assert.equal(inCooldown(portfolio, "m", NOW, config), true);
  assert.equal(inCooldown(portfolio, "m", new Date("2026-09-24T12:30:01.000Z"), config), false);
  assert.equal(inCooldown(createPortfolio(100), "m", NOW, config), false);
});

test("entries respect the position cap and the per-trade size", () => {
  const quotes = ["A", "B", "C", "D", "E", "F", "G"].map((letter, index) =>
    quote({
      mint: `mint-${letter}`,
      symbol: `DOG${letter}`,
      change: { m5: 8 - index * 0.1, h1: 15, h6: 20 },
    }),
  );
  const { decisions } = decide(quotes, createPortfolio(1000), config, NOW);
  assert.equal(decisions.length, config.maxPositions);
  assert.ok(decisions.every((d) => d.action === "BUY"));
  assert.ok(Math.abs(decisions[0].notionalUsd - 200) < 1e-6);
});

test("blocked tokens are never bought", () => {
  const quotes = [
    quote({ mint: "cat", symbol: "CATNIP", name: "Catnip Finance" }),
    quote({ mint: "thin", symbol: "PUPPY", liquidityUsd: 900 }),
    quote({ mint: "new", symbol: "NEWPUP", ageHours: 0.1 }),
    quote({ mint: "top", symbol: "VERTDOG", change: { m5: 180, h1: 200, h6: 220 } }),
  ];
  const { decisions } = decide(quotes, createPortfolio(1000), config, NOW);
  assert.deepEqual(decisions, []);
});

test("an exit frees a slot and its cash in the same tick", () => {
  const losing = quote({ mint: "old", symbol: "OLDDOG", priceUsd: 0.5, change: { m5: 0.1, h1: 0, h6: 0 } });
  const winner = quote({ mint: "new", symbol: "NEWDOG", change: { m5: 9, h1: 18, h6: 25 } });
  let portfolio = applyFill(createPortfolio(60), {
    mint: "old",
    symbol: "OLDDOG",
    side: "BUY",
    qty: 50,
    priceUsd: 1,
    quotedPriceUsd: 1,
    notionalUsd: 50,
    feeUsd: 0,
    slippageBps: 0,
    venue: "test",
    ts: NOW.toISOString(),
    reason: "seed",
  });
  portfolio = markToMarket(portfolio, { old: 0.5, new: 1 });
  // one slot, and the whole book may go into it, so the freed cash is spendable
  const tight = testConfig({ maxPositions: 1, maxPositionPct: 1 });
  const { decisions } = decide([losing, winner], portfolio, tight, NOW);
  assert.equal(decisions[0].action, "SELL");
  assert.equal(decisions[0].symbol, "OLDDOG");
  assert.equal(decisions[1].action, "BUY");
  assert.equal(decisions[1].symbol, "NEWDOG");
});

test("a buy always leaves enough cash for its fee", () => {
  const { decisions } = decide([quote()], createPortfolio(50), testConfig({ maxPositionPct: 1 }), NOW);
  const buy = decisions[0];
  assert.ok(buy.notionalUsd * (1 + config.feeBps / 10_000) <= 50 + 1e-9);
});

test("dust cash produces no trade at all", () => {
  const { decisions } = decide([quote()], createPortfolio(1), config, NOW);
  assert.deepEqual(decisions, []);
});
