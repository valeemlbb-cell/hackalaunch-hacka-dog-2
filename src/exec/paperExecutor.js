/**
 * Paper executor: prices a decision against the live quote with a depth-aware
 * slippage model and a taker fee. No chain interaction.
 *
 * The slippage model is the standard constant-product approximation:
 *   impact_bps = (notional / liquidity) * impactFactor * 10_000
 * which means a trade worth 1% of pool depth moves the price ~60 bps at the
 * default impactFactor. Fills above maxSlippageBps are refused, not silently
 * filled at a worse price.
 *
 * @module exec/paperExecutor
 */

/** Raised when a fill would cost more slippage than the config allows. */
export class SlippageRefused extends Error {
  /** @param {string} symbol @param {number} bps @param {number} limit */
  constructor(symbol, bps, limit) {
    super(`${symbol}: slippage ${bps.toFixed(0)} bps exceeds limit ${limit} bps`);
    this.name = "SlippageRefused";
    this.slippageBps = bps;
  }
}

/**
 * Estimate price impact in basis points for a trade of `notionalUsd`.
 * @param {number} notionalUsd
 * @param {number} liquidityUsd
 * @param {number} impactFactor
 * @returns {number}
 */
export function slippageBps(notionalUsd, liquidityUsd, impactFactor) {
  if (!(liquidityUsd > 0)) return Number.POSITIVE_INFINITY;
  return (notionalUsd / liquidityUsd) * impactFactor * 10_000;
}

/**
 * Build a paper executor.
 * @param {ReturnType<import("../config.js").loadConfig>} config
 * @param {() => Date} [clock]
 * @returns {import("../types.js").Executor}
 */
export function createPaperExecutor(config, clock = () => new Date()) {
  return {
    venue: "paper",
    async execute(decision, quote, now) {
      return priceFill(decision, quote, config, now ?? clock(), "paper");
    },
  };
}

/**
 * Shared pricing used by both the paper and the devnet executor.
 * @param {import("../types.js").Decision} decision
 * @param {import("../types.js").RunnerQuote} quote
 * @param {ReturnType<import("../config.js").loadConfig>} config
 * @param {Date} now
 * @param {string} venue
 * @returns {import("../types.js").Fill}
 */
export function priceFill(decision, quote, config, now, venue) {
  const notional =
    decision.action === "SELL" ? decision.qty * quote.priceUsd : decision.notionalUsd;
  const bps = slippageBps(notional, quote.liquidityUsd, config.impactFactor);
  if (bps > config.maxSlippageBps) {
    throw new SlippageRefused(decision.symbol, bps, config.maxSlippageBps);
  }
  // buyers pay up, sellers get hit down
  const direction = decision.action === "BUY" ? 1 : -1;
  const priceUsd = quote.priceUsd * (1 + (direction * bps) / 10_000);
  const qty = decision.action === "SELL" ? decision.qty : decision.notionalUsd / priceUsd;
  const filledNotional = qty * priceUsd;
  return Object.freeze({
    mint: decision.mint,
    symbol: decision.symbol,
    side: decision.action,
    qty,
    priceUsd,
    quotedPriceUsd: quote.priceUsd,
    notionalUsd: filledNotional,
    feeUsd: (filledNotional * config.feeBps) / 10_000,
    slippageBps: bps,
    venue,
    ts: now.toISOString(),
    reason: decision.reason,
  });
}
