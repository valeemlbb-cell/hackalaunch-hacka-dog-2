/**
 * Runner scoring: turn a market quote into a 0..100 "is this thing running" score,
 * plus the hard blockers that make a token untradable regardless of score.
 *
 * @module strategy/score
 */

import { classify } from "../lexicon.js";

/** @param {number} value @param {number} lo @param {number} hi */
export function clamp(value, lo, hi) {
  if (!Number.isFinite(value)) return lo;
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Blended momentum in percent. Recent windows dominate, but a token that is
 * only up on the 5m candle scores far below one trending across all three.
 * @param {import("../types.js").PriceChange} change
 * @returns {number}
 */
export function blendedMomentumPct(change) {
  const m5 = Number(change?.m5 ?? 0);
  const h1 = Number(change?.h1 ?? 0);
  const h6 = Number(change?.h6 ?? 0);
  return 0.45 * m5 + 0.35 * h1 + 0.2 * h6;
}

/**
 * Hard gates. A token failing any of these is never entered.
 * @param {import("../types.js").RunnerQuote} quote
 * @param {ReturnType<import("../config.js").loadConfig>} config
 * @returns {string[]} blocker reasons (empty = tradable)
 */
export function findBlockers(quote, config) {
  const blockers = [];
  const { isDog } = classify(quote);
  if (!isDog) blockers.push("not-a-dog");
  if (!Number.isFinite(quote.priceUsd) || quote.priceUsd <= 0) blockers.push("bad-price");
  if (quote.liquidityUsd < config.minLiquidityUsd) blockers.push("thin-liquidity");
  if (quote.liquidityUsd > config.maxLiquidityUsd) blockers.push("too-large");
  if (quote.ageHours < config.minAgeHours) blockers.push("too-new");
  if (quote.change?.m5 > config.maxM5Pct) blockers.push("blow-off-top");
  if (blendedMomentumPct(quote.change) < config.minMomentumPct) blockers.push("no-momentum");
  // A token can be up 900% on the hour and already done. Entering while the
  // most recent candle is red is how a momentum bot buys the exact top.
  if (Number(quote.change?.m5 ?? 0) < config.minM5Pct) blockers.push("rolling-over");
  const ratio = volumeRatio(quote);
  if (ratio < config.minVolumeRatio) blockers.push("no-volume");
  if (ratio > config.maxVolumeRatio) blockers.push("wash-volume");
  return blockers;
}

/** 24h volume relative to pool depth. @param {import("../types.js").RunnerQuote} quote */
export function volumeRatio(quote) {
  const liquidity = Number(quote?.liquidityUsd ?? 0);
  if (liquidity <= 0) return 0;
  return Number(quote?.volume24hUsd ?? 0) / liquidity;
}

/**
 * Score one quote.
 * @param {import("../types.js").RunnerQuote} quote
 * @param {ReturnType<import("../config.js").loadConfig>} config
 * @returns {import("../types.js").RunnerScore}
 */
export function scoreRunner(quote, config) {
  const momentum = clamp(blendedMomentumPct(quote.change) / config.momentumFullScalePct, 0, 1);
  const volume = clamp(volumeRatio(quote) / config.volumeRatioFullScale, 0, 1);
  const depthMult = quote.liquidityUsd / Math.max(1, config.minLiquidityUsd);
  const liquidity = clamp(
    Math.log10(1 + depthMult) / Math.log10(1 + config.liquidityFullScaleMult),
    0,
    1,
  );
  const raw =
    config.weightMomentum * momentum +
    config.weightVolume * volume +
    config.weightLiquidity * liquidity;
  const blockers = findBlockers(quote, config);
  return {
    mint: quote.mint,
    symbol: quote.symbol,
    score: Math.round(clamp(raw, 0, 1) * 1000) / 10,
    eligible: blockers.length === 0,
    blockers,
    parts: { momentum, volume, liquidity },
  };
}

/**
 * Score a whole universe, strongest first.
 * @param {import("../types.js").RunnerQuote[]} quotes
 * @param {ReturnType<import("../config.js").loadConfig>} config
 * @returns {import("../types.js").RunnerScore[]}
 */
export function scoreUniverse(quotes, config) {
  return quotes
    .map((quote) => scoreRunner(quote, config))
    .sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
}
