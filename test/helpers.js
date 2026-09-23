/** Shared test builders. */

import { loadConfig } from "../src/config.js";

/** @param {Partial<ReturnType<typeof loadConfig>>} [overrides] */
export function testConfig(overrides = {}) {
  return loadConfig({}, { tickSeconds: 0, ...overrides });
}

/** @param {Partial<import("../src/types.js").RunnerQuote>} [patch] */
export function quote(patch = {}) {
  return {
    mint: patch.mint ?? "MintDog1111111111111111111111111111111111",
    symbol: patch.symbol ?? "HDOG",
    name: patch.name ?? "Hacka Dog",
    priceUsd: patch.priceUsd ?? 1,
    liquidityUsd: patch.liquidityUsd ?? 200_000,
    volume24hUsd: patch.volume24hUsd ?? 600_000,
    change: { m5: 4, h1: 10, h6: 18, h24: 30, ...(patch.change ?? {}) },
    ageHours: patch.ageHours ?? 50,
    source: "test",
    fetchedAt: patch.fetchedAt ?? "2026-09-24T00:00:00.000Z",
  };
}

/**
 * A source that replays fixed ticks.
 * @param {import("../src/types.js").RunnerQuote[][]} ticks
 */
export function stubSource(ticks) {
  let cursor = 0;
  return {
    id: "stub",
    async fetchRunners() {
      const tick = ticks[Math.min(cursor, ticks.length - 1)];
      cursor += 1;
      return tick;
    },
  };
}

/** An executor that fills everything at the quoted price with no fee. */
export function stubExecutor(onExecute) {
  const fills = [];
  return {
    venue: "stub",
    fills,
    async execute(decision, q, now) {
      onExecute?.(decision, q);
      const qty = decision.action === "SELL" ? decision.qty : decision.notionalUsd / q.priceUsd;
      const fill = {
        mint: decision.mint,
        symbol: decision.symbol,
        side: decision.action,
        qty,
        priceUsd: q.priceUsd,
        quotedPriceUsd: q.priceUsd,
        notionalUsd: qty * q.priceUsd,
        feeUsd: 0,
        slippageBps: 0,
        venue: "stub",
        ts: (now ?? new Date("2026-09-24T00:00:00.000Z")).toISOString(),
        reason: decision.reason,
      };
      fills.push(fill);
      return fill;
    },
  };
}
