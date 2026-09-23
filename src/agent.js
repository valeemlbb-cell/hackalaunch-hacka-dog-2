/**
 * The dog agent itself: discover -> score -> decide -> execute -> journal.
 *
 * The agent owns no I/O of its own. The source, the executor, the journal and
 * the clock are all injected, which is why the whole loop is testable without
 * a network or a chain.
 *
 * @module agent
 */

import { decide } from "./strategy/decide.js";
import { applyFill, createPortfolio, markToMarket, stats } from "./portfolio/portfolio.js";
import { SlippageRefused } from "./exec/paperExecutor.js";

/**
 * @typedef {Object} TickResult
 * @property {number} tick
 * @property {import("./types.js").Portfolio} portfolio
 * @property {import("./types.js").RunnerScore[]} scores
 * @property {import("./types.js").Decision[]} decisions
 * @property {import("./types.js").Fill[]} fills
 * @property {{decision: import("./types.js").Decision, error: string}[]} skipped
 * @property {number} universeSize
 */

/**
 * @param {Object} deps
 * @param {import("./types.js").RunnerSource} deps.source
 * @param {import("./types.js").Executor} deps.executor
 * @param {ReturnType<import("./config.js").loadConfig>} deps.config
 * @param {{write: (event: string, data: object) => Promise<void>}} deps.journal
 * @param {() => Date} [deps.clock]
 */
export function createAgent({ source, executor, config, journal, clock = () => new Date() }) {
  let portfolio = createPortfolio(config.startingCashUsd);
  let tick = 0;
  /** mint -> last observed pool depth, so the end-of-run exit still pays slippage. */
  const lastLiquidityUsd = new Map();
  const stepMs = (config.clockStepMinutes ?? 0) * 60_000;

  /**
   * The agent's notion of "now". With clockStepMinutes = 0 this is the wall
   * clock; replaying a tape it advances one candle per tick so cooldowns and
   * holding periods mean the same thing as they do live.
   */
  function tickTime() {
    return stepMs > 0 ? new Date(clock().getTime() + (tick - 1) * stepMs) : clock();
  }

  /**
   * Run exactly one tick.
   * @returns {Promise<TickResult>}
   */
  async function runTick() {
    tick += 1;
    const quotes = await source.fetchRunners();
    const quoteByMint = new Map(quotes.map((quote) => [quote.mint, quote]));
    for (const quote of quotes) lastLiquidityUsd.set(quote.mint, quote.liquidityUsd);
    portfolio = markToMarket(
      portfolio,
      Object.fromEntries(quotes.map((quote) => [quote.mint, quote.priceUsd])),
    );

    const now = tickTime();
    const { decisions, scores } = decide(quotes, portfolio, config, now);
    const fills = [];
    const skipped = [];

    for (const decision of decisions) {
      const quote = quoteByMint.get(decision.mint);
      if (!quote) {
        skipped.push({ decision, error: "no quote this tick" });
        continue;
      }
      try {
        const fill = await executor.execute(decision, quote, now);
        portfolio = applyFill(portfolio, fill);
        fills.push(fill);
        await journal.write("fill", { tick, fill });
      } catch (error) {
        const reason = error instanceof SlippageRefused ? error.message : String(error?.message ?? error);
        skipped.push({ decision, error: reason });
        await journal.write("skip", { tick, decision, error: reason });
      }
    }

    const result = {
      tick,
      portfolio,
      scores,
      decisions,
      fills,
      skipped,
      universeSize: quotes.length,
    };
    await journal.write("tick", {
      tick,
      universeSize: quotes.length,
      decisions: decisions.length,
      fills: fills.length,
      skipped: skipped.length,
      stats: stats(portfolio),
      top: scores.slice(0, 3).map((s) => ({ symbol: s.symbol, score: s.score, eligible: s.eligible })),
    });
    return result;
  }

  /**
   * Liquidate every open position at the last marked price. Called at the end
   * of a bounded run so reported PnL is realized, not paper-only.
   * @returns {Promise<import("./types.js").Fill[]>}
   */
  async function closeAll() {
    const fills = [];
    const now = tickTime();
    for (const position of Object.values(portfolio.positions)) {
      const decision = {
        action: "SELL",
        mint: position.mint,
        symbol: position.symbol,
        qty: position.qty,
        notionalUsd: position.qty * position.lastPriceUsd,
        score: 0,
        reason: "end of run",
      };
      const quote = {
        mint: position.mint,
        symbol: position.symbol,
        name: position.symbol,
        priceUsd: position.lastPriceUsd,
        liquidityUsd: lastLiquidityUsd.get(position.mint) ?? config.minLiquidityUsd,
        volume24hUsd: 0,
        change: { m5: 0, h1: 0, h6: 0, h24: 0 },
        ageHours: 0,
        source: "internal",
        fetchedAt: now.toISOString(),
      };
      const fill = await executor.execute(decision, quote, now);
      portfolio = applyFill(portfolio, fill);
      fills.push(fill);
      await journal.write("fill", { tick, fill });
    }
    return fills;
  }

  return {
    runTick,
    closeAll,
    get portfolio() {
      return portfolio;
    },
    get stats() {
      return stats(portfolio);
    },
  };
}
