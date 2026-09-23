/**
 * Shared type definitions for the Hacka Dog agent.
 * Plain JSDoc typedefs so the project runs on bare Node with no build step.
 *
 * @module types
 */

/**
 * Percent price changes over rolling windows, as returned by market data sources.
 * @typedef {Object} PriceChange
 * @property {number} m5   Percent change over the last 5 minutes.
 * @property {number} h1   Percent change over the last hour.
 * @property {number} h6   Percent change over the last 6 hours.
 * @property {number} h24  Percent change over the last 24 hours.
 */

/**
 * One tradable dog-runner token at a point in time.
 * @typedef {Object} RunnerQuote
 * @property {string} mint            SPL mint address.
 * @property {string} symbol          Ticker, e.g. "HDOG".
 * @property {string} name            Human readable name.
 * @property {number} priceUsd        Last price in USD.
 * @property {number} liquidityUsd    Pool liquidity in USD.
 * @property {number} volume24hUsd    24h traded volume in USD.
 * @property {PriceChange} change     Rolling percent changes.
 * @property {number} ageHours        Hours since the pair was created.
 * @property {string} source          Data source id, e.g. "fixture" | "dexscreener".
 * @property {string} fetchedAt       ISO timestamp of the observation.
 */

/**
 * Result of scoring one quote against the runner strategy.
 * @typedef {Object} RunnerScore
 * @property {string} mint
 * @property {string} symbol
 * @property {number} score       0..100, higher is a stronger runner.
 * @property {boolean} eligible   True when no blocker fired.
 * @property {string[]} blockers  Reasons the token cannot be entered.
 * @property {Object} parts       Individual normalized score components.
 */

/**
 * An instruction the strategy wants the executor to carry out.
 * @typedef {Object} Decision
 * @property {"BUY"|"SELL"} action
 * @property {string} mint
 * @property {string} symbol
 * @property {number} notionalUsd  Intended trade size in USD (always positive).
 * @property {number} [qty]        Token quantity, set for exits.
 * @property {number} score        Strategy score at decision time.
 * @property {string} reason       Short human readable justification.
 */

/**
 * A completed trade, whatever the venue.
 * @typedef {Object} Fill
 * @property {string} mint
 * @property {string} symbol
 * @property {"BUY"|"SELL"} side
 * @property {number} qty
 * @property {number} priceUsd       Effective fill price after slippage.
 * @property {number} quotedPriceUsd Mid price the decision was based on.
 * @property {number} notionalUsd    qty * priceUsd.
 * @property {number} feeUsd
 * @property {number} slippageBps
 * @property {string} venue          "paper" | "devnet".
 * @property {string} ts             ISO timestamp.
 * @property {string} [signature]    Solana devnet transaction signature.
 * @property {string} reason
 */

/**
 * An open position in one mint.
 * @typedef {Object} Position
 * @property {string} mint
 * @property {string} symbol
 * @property {number} qty
 * @property {number} avgPriceUsd
 * @property {number} lastPriceUsd
 * @property {string} openedAt
 * @property {number} peakPriceUsd  Highest marked price since entry (trailing stop).
 */

/**
 * Immutable portfolio snapshot.
 * @typedef {Object} Portfolio
 * @property {number} cashUsd
 * @property {Record<string, Position>} positions
 * @property {number} realizedPnlUsd
 * @property {number} feesPaidUsd
 * @property {Record<string, string>} closedAt  mint -> ISO time of last exit (cooldown).
 */

/**
 * Anything that can hand the agent a list of dog runners.
 * @typedef {Object} RunnerSource
 * @property {string} id
 * @property {() => Promise<RunnerQuote[]>} fetchRunners
 */

/**
 * Anything that can turn a Decision into a Fill.
 * @typedef {Object} Executor
 * @property {string} venue
 * @property {(decision: Decision, quote: RunnerQuote) => Promise<Fill>} execute
 */

export {};
