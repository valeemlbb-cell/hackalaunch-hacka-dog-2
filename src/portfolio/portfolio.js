/**
 * Portfolio accounting. Every function returns a new snapshot — nothing is
 * mutated in place, so a tick can be replayed or rolled back safely.
 *
 * @module portfolio/portfolio
 */

/**
 * @param {number} cashUsd
 * @returns {import("../types.js").Portfolio}
 */
export function createPortfolio(cashUsd) {
  return Object.freeze({
    cashUsd,
    positions: Object.freeze({}),
    realizedPnlUsd: 0,
    feesPaidUsd: 0,
    closedAt: Object.freeze({}),
  });
}

/**
 * Apply a fill and return the resulting portfolio.
 * @param {import("../types.js").Portfolio} portfolio
 * @param {import("../types.js").Fill} fill
 * @returns {import("../types.js").Portfolio}
 */
export function applyFill(portfolio, fill) {
  return fill.side === "BUY" ? applyBuy(portfolio, fill) : applySell(portfolio, fill);
}

/**
 * @param {import("../types.js").Portfolio} portfolio
 * @param {import("../types.js").Fill} fill
 */
function applyBuy(portfolio, fill) {
  const cost = fill.qty * fill.priceUsd + fill.feeUsd;
  if (cost > portfolio.cashUsd + 1e-9) {
    throw new Error(`insufficient cash for ${fill.symbol}: need ${cost}, have ${portfolio.cashUsd}`);
  }
  const existing = portfolio.positions[fill.mint];
  const qty = (existing?.qty ?? 0) + fill.qty;
  const avgPriceUsd = existing
    ? (existing.qty * existing.avgPriceUsd + fill.qty * fill.priceUsd) / qty
    : fill.priceUsd;
  const position = Object.freeze({
    mint: fill.mint,
    symbol: fill.symbol,
    qty,
    avgPriceUsd,
    lastPriceUsd: fill.priceUsd,
    openedAt: existing?.openedAt ?? fill.ts,
    peakPriceUsd: Math.max(existing?.peakPriceUsd ?? 0, fill.priceUsd),
  });
  return Object.freeze({
    ...portfolio,
    cashUsd: portfolio.cashUsd - cost,
    feesPaidUsd: portfolio.feesPaidUsd + fill.feeUsd,
    positions: Object.freeze({ ...portfolio.positions, [fill.mint]: position }),
  });
}

/**
 * @param {import("../types.js").Portfolio} portfolio
 * @param {import("../types.js").Fill} fill
 */
function applySell(portfolio, fill) {
  const existing = portfolio.positions[fill.mint];
  if (!existing) throw new Error(`cannot sell ${fill.symbol}: no open position`);
  if (fill.qty > existing.qty + 1e-9) {
    throw new Error(`cannot sell ${fill.qty} ${fill.symbol}: only ${existing.qty} held`);
  }
  const proceeds = fill.qty * fill.priceUsd - fill.feeUsd;
  const realized = fill.qty * (fill.priceUsd - existing.avgPriceUsd) - fill.feeUsd;
  const remaining = existing.qty - fill.qty;
  const positions = { ...portfolio.positions };
  const closedAt = { ...portfolio.closedAt };
  if (remaining <= 1e-9) {
    delete positions[fill.mint];
    closedAt[fill.mint] = fill.ts;
  } else {
    positions[fill.mint] = Object.freeze({ ...existing, qty: remaining, lastPriceUsd: fill.priceUsd });
  }
  return Object.freeze({
    ...portfolio,
    cashUsd: portfolio.cashUsd + proceeds,
    realizedPnlUsd: portfolio.realizedPnlUsd + realized,
    feesPaidUsd: portfolio.feesPaidUsd + fill.feeUsd,
    positions: Object.freeze(positions),
    closedAt: Object.freeze(closedAt),
  });
}

/**
 * Mark open positions to the latest quotes.
 * @param {import("../types.js").Portfolio} portfolio
 * @param {Record<string, number>} priceByMint
 * @returns {import("../types.js").Portfolio}
 */
export function markToMarket(portfolio, priceByMint) {
  const positions = {};
  for (const [mint, position] of Object.entries(portfolio.positions)) {
    const price = priceByMint[mint];
    positions[mint] = Number.isFinite(price)
      ? Object.freeze({
          ...position,
          lastPriceUsd: price,
          peakPriceUsd: Math.max(position.peakPriceUsd, price),
        })
      : position;
  }
  return Object.freeze({ ...portfolio, positions: Object.freeze(positions) });
}

/**
 * Unrealized PnL percent for one position at its marked price.
 * @param {import("../types.js").Position} position
 * @returns {number}
 */
export function positionPnlPct(position) {
  if (!position || position.avgPriceUsd <= 0) return 0;
  return ((position.lastPriceUsd - position.avgPriceUsd) / position.avgPriceUsd) * 100;
}

/**
 * Drawdown percent from the position's peak marked price.
 * @param {import("../types.js").Position} position
 * @returns {number}
 */
export function drawdownFromPeakPct(position) {
  if (!position || position.peakPriceUsd <= 0) return 0;
  return ((position.peakPriceUsd - position.lastPriceUsd) / position.peakPriceUsd) * 100;
}

/**
 * Headline numbers for a portfolio.
 * @param {import("../types.js").Portfolio} portfolio
 */
export function stats(portfolio) {
  const open = Object.values(portfolio.positions);
  const positionsValueUsd = open.reduce((sum, p) => sum + p.qty * p.lastPriceUsd, 0);
  const unrealizedPnlUsd = open.reduce(
    (sum, p) => sum + p.qty * (p.lastPriceUsd - p.avgPriceUsd),
    0,
  );
  return {
    cashUsd: portfolio.cashUsd,
    positionsValueUsd,
    equityUsd: portfolio.cashUsd + positionsValueUsd,
    unrealizedPnlUsd,
    realizedPnlUsd: portfolio.realizedPnlUsd,
    feesPaidUsd: portfolio.feesPaidUsd,
    openPositions: open.length,
  };
}
