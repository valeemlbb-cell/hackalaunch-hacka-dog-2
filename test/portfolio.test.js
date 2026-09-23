import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyFill,
  createPortfolio,
  drawdownFromPeakPct,
  markToMarket,
  positionPnlPct,
  stats,
} from "../src/portfolio/portfolio.js";

const MINT = "MintDog1111111111111111111111111111111111";

/** @param {Partial<import("../src/types.js").Fill>} patch */
function fill(patch = {}) {
  return {
    mint: MINT,
    symbol: "HDOG",
    side: "BUY",
    qty: 100,
    priceUsd: 1,
    quotedPriceUsd: 1,
    notionalUsd: 100,
    feeUsd: 0.3,
    slippageBps: 5,
    venue: "test",
    ts: "2026-09-24T00:00:00.000Z",
    reason: "test",
    ...patch,
  };
}

test("a buy moves cash into a position without mutating the input", () => {
  const before = createPortfolio(1000);
  const after = applyFill(before, fill());
  assert.equal(before.cashUsd, 1000, "original snapshot must be untouched");
  assert.equal(Object.keys(before.positions).length, 0);
  assert.equal(after.cashUsd, 1000 - 100.3);
  assert.equal(after.positions[MINT].qty, 100);
  assert.equal(after.positions[MINT].avgPriceUsd, 1);
});

test("a second buy averages the entry price", () => {
  const after = applyFill(applyFill(createPortfolio(1000), fill()), fill({ priceUsd: 2, notionalUsd: 200 }));
  assert.equal(after.positions[MINT].qty, 200);
  assert.equal(after.positions[MINT].avgPriceUsd, 1.5);
});

test("a full sell closes the position, books PnL and starts the cooldown", () => {
  const opened = applyFill(createPortfolio(1000), fill());
  const closed = applyFill(opened, fill({ side: "SELL", priceUsd: 1.5, notionalUsd: 150, feeUsd: 0.45 }));
  assert.equal(closed.positions[MINT], undefined);
  assert.ok(Math.abs(closed.realizedPnlUsd - (50 - 0.45)) < 1e-9);
  assert.equal(closed.closedAt[MINT], "2026-09-24T00:00:00.000Z");
  assert.ok(Math.abs(closed.feesPaidUsd - 0.75) < 1e-9);
});

test("a partial sell leaves the rest of the position open", () => {
  const opened = applyFill(createPortfolio(1000), fill());
  const trimmed = applyFill(opened, fill({ side: "SELL", qty: 40, priceUsd: 1.2, feeUsd: 0.1 }));
  assert.equal(trimmed.positions[MINT].qty, 60);
  assert.equal(trimmed.closedAt[MINT], undefined);
});

test("overdrawing cash or overselling a position throws", () => {
  assert.throws(() => applyFill(createPortfolio(50), fill()), /insufficient cash/);
  assert.throws(
    () => applyFill(createPortfolio(1000), fill({ side: "SELL" })),
    /no open position/,
  );
  const opened = applyFill(createPortfolio(1000), fill());
  assert.throws(() => applyFill(opened, fill({ side: "SELL", qty: 999 })), /only 100/);
});

test("marking to market updates the price and tracks the peak", () => {
  const opened = applyFill(createPortfolio(1000), fill());
  const up = markToMarket(opened, { [MINT]: 1.8 });
  const back = markToMarket(up, { [MINT]: 1.2 });
  assert.equal(back.positions[MINT].lastPriceUsd, 1.2);
  assert.equal(back.positions[MINT].peakPriceUsd, 1.8, "peak must not fall");
  assert.ok(Math.abs(positionPnlPct(back.positions[MINT]) - 20) < 1e-9);
  assert.ok(Math.abs(drawdownFromPeakPct(back.positions[MINT]) - 33.333) < 0.01);
});

test("a missing price leaves the position marked where it was", () => {
  const opened = applyFill(createPortfolio(1000), fill());
  const marked = markToMarket(opened, {});
  assert.equal(marked.positions[MINT].lastPriceUsd, 1);
});

test("stats add cash and positions into equity", () => {
  const opened = markToMarket(applyFill(createPortfolio(1000), fill()), { [MINT]: 1.5 });
  const value = stats(opened);
  assert.equal(value.openPositions, 1);
  assert.equal(value.positionsValueUsd, 150);
  assert.ok(Math.abs(value.equityUsd - (899.7 + 150)) < 1e-9);
  assert.equal(value.unrealizedPnlUsd, 50);
});

test("pnl helpers are safe on empty input", () => {
  assert.equal(positionPnlPct(undefined), 0);
  assert.equal(drawdownFromPeakPct(undefined), 0);
  assert.equal(stats(createPortfolio(10)).equityUsd, 10);
});
