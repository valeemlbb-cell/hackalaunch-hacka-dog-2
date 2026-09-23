/**
 * Live discovery via the public DexScreener search endpoint.
 *
 * Read-only, unauthenticated, no API key, no wallet. It is used to find *which*
 * dog runners exist and what they are worth; it never places an order. The
 * agent works without it — see fixtureSource.js for the deterministic tape.
 *
 * @module discovery/dexscreenerSource
 */

import { isDogRunner } from "../lexicon.js";

const SEARCH_URL = "https://api.dexscreener.com/latest/dex/search";
const REQUEST_TIMEOUT_MS = 10_000;
const MS_PER_HOUR = 3_600_000;

/**
 * Map one DexScreener pair onto a RunnerQuote, or null when the pair is
 * unusable (wrong chain, no price, not a dog).
 * @param {any} pair
 * @param {string} fetchedAt
 * @param {number} nowMs
 * @returns {import("../types.js").RunnerQuote|null}
 */
export function pairToQuote(pair, fetchedAt, nowMs) {
  if (pair?.chainId !== "solana") return null;
  const base = pair.baseToken ?? {};
  const priceUsd = Number(pair.priceUsd);
  if (!(priceUsd > 0) || !base.address) return null;
  if (!isDogRunner({ symbol: base.symbol, name: base.name })) return null;
  const createdAt = Number(pair.pairCreatedAt ?? 0);
  return Object.freeze({
    mint: String(base.address),
    symbol: String(base.symbol ?? "?"),
    name: String(base.name ?? base.symbol ?? "?"),
    priceUsd,
    liquidityUsd: Number(pair.liquidity?.usd ?? 0),
    volume24hUsd: Number(pair.volume?.h24 ?? 0),
    change: Object.freeze({
      m5: Number(pair.priceChange?.m5 ?? 0),
      h1: Number(pair.priceChange?.h1 ?? 0),
      h6: Number(pair.priceChange?.h6 ?? 0),
      h24: Number(pair.priceChange?.h24 ?? 0),
    }),
    ageHours: createdAt > 0 ? (nowMs - createdAt) / MS_PER_HOUR : 0,
    source: "dexscreener",
    fetchedAt,
  });
}

/**
 * Keep the deepest pair per mint — DexScreener returns one row per pool.
 * @param {import("../types.js").RunnerQuote[]} quotes
 * @returns {import("../types.js").RunnerQuote[]}
 */
export function dedupeByMint(quotes) {
  const best = new Map();
  for (const quote of quotes) {
    const current = best.get(quote.mint);
    if (!current || quote.liquidityUsd > current.liquidityUsd) best.set(quote.mint, quote);
  }
  return [...best.values()];
}

/**
 * @param {ReturnType<import("../config.js").loadConfig>} config
 * @param {typeof globalThis.fetch} [fetchImpl]
 * @param {() => Date} [clock]
 * @returns {import("../types.js").RunnerSource}
 */
export function createDexscreenerSource(config, fetchImpl = globalThis.fetch, clock = () => new Date()) {
  return {
    id: "dexscreener",
    async fetchRunners() {
      const url = `${SEARCH_URL}?q=${encodeURIComponent(config.dexscreenerQuery)}`;
      const response = await fetchImpl(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`dexscreener responded ${response.status} ${response.statusText}`);
      }
      const body = await response.json();
      const now = clock();
      const quotes = (body?.pairs ?? [])
        .map((pair) => pairToQuote(pair, now.toISOString(), now.getTime()))
        .filter((quote) => quote !== null);
      return dedupeByMint(quotes)
        .sort((a, b) => b.liquidityUsd - a.liquidityUsd)
        .slice(0, config.maxUniverse);
    },
  };
}
