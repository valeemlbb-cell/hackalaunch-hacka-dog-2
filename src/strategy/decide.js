/**
 * Decision layer: scores + portfolio + risk limits -> an ordered list of
 * BUY/SELL decisions. Exits are always evaluated before entries so freed cash
 * and freed slots are available in the same tick.
 *
 * @module strategy/decide
 */

import { scoreUniverse } from "./score.js";
import { drawdownFromPeakPct, positionPnlPct, stats } from "../portfolio/portfolio.js";

const MS_PER_MINUTE = 60_000;

/**
 * Why (if at all) an open position should be closed this tick.
 * @param {import("../types.js").Position} position
 * @param {number|undefined} score  current runner score, undefined if it left the universe
 * @param {ReturnType<import("../config.js").loadConfig>} config
 * @returns {string|null}
 */
export function exitReason(position, score, config) {
  const pnlPct = positionPnlPct(position);
  if (pnlPct <= -config.stopLossPct) return `stop-loss ${pnlPct.toFixed(1)}%`;
  if (pnlPct >= config.takeProfitPct) return `take-profit +${pnlPct.toFixed(1)}%`;
  const drawdown = drawdownFromPeakPct(position);
  if (pnlPct > 0 && drawdown >= config.trailingStopPct) {
    return `trailing-stop -${drawdown.toFixed(1)}% from peak`;
  }
  if (score === undefined) return "left universe";
  if (score < config.exitScore) return `momentum gone (score ${score})`;
  return null;
}

/**
 * Is this mint still inside its post-exit cooldown?
 * @param {import("../types.js").Portfolio} portfolio
 * @param {string} mint
 * @param {Date} now
 * @param {ReturnType<import("../config.js").loadConfig>} config
 */
export function inCooldown(portfolio, mint, now, config) {
  const closed = portfolio.closedAt[mint];
  if (!closed) return false;
  const elapsedMinutes = (now.getTime() - new Date(closed).getTime()) / MS_PER_MINUTE;
  return elapsedMinutes < config.cooldownMinutes;
}

/**
 * Build this tick's decisions.
 * @param {import("../types.js").RunnerQuote[]} quotes
 * @param {import("../types.js").Portfolio} portfolio
 * @param {ReturnType<import("../config.js").loadConfig>} config
 * @param {Date} [now]
 * @returns {{decisions: import("../types.js").Decision[], scores: import("../types.js").RunnerScore[]}}
 */
export function decide(quotes, portfolio, config, now = new Date()) {
  const scores = scoreUniverse(quotes, config);
  const scoreByMint = new Map(scores.map((s) => [s.mint, s]));
  const exits = planExits(portfolio, scoreByMint, config);
  const exiting = new Set(exits.map((d) => d.mint));
  const entries = planEntries(scores, portfolio, exiting, config, now);
  return { decisions: [...exits, ...entries], scores };
}

/**
 * @param {import("../types.js").Portfolio} portfolio
 * @param {Map<string, import("../types.js").RunnerScore>} scoreByMint
 * @param {ReturnType<import("../config.js").loadConfig>} config
 * @returns {import("../types.js").Decision[]}
 */
function planExits(portfolio, scoreByMint, config) {
  const decisions = [];
  for (const position of Object.values(portfolio.positions)) {
    const scored = scoreByMint.get(position.mint);
    const reason = exitReason(position, scored?.score, config);
    if (!reason) continue;
    decisions.push({
      action: "SELL",
      mint: position.mint,
      symbol: position.symbol,
      qty: position.qty,
      notionalUsd: position.qty * position.lastPriceUsd,
      score: scored?.score ?? 0,
      reason,
    });
  }
  return decisions.sort((a, b) => b.notionalUsd - a.notionalUsd);
}

/**
 * @param {import("../types.js").RunnerScore[]} scores
 * @param {import("../types.js").Portfolio} portfolio
 * @param {Set<string>} exiting
 * @param {ReturnType<import("../config.js").loadConfig>} config
 * @param {Date} now
 * @returns {import("../types.js").Decision[]}
 */
function planEntries(scores, portfolio, exiting, config, now) {
  const held = new Set(Object.keys(portfolio.positions));
  const openAfterExits = [...held].filter((mint) => !exiting.has(mint)).length;
  const freeSlots = config.maxPositions - openAfterExits;
  if (freeSlots <= 0) return [];

  const { equityUsd } = stats(portfolio);
  const perTradeUsd = equityUsd * config.maxPositionPct;
  const freedCash = [...exiting].reduce((sum, mint) => {
    const position = portfolio.positions[mint];
    return sum + position.qty * position.lastPriceUsd;
  }, 0);

  const decisions = [];
  let cashLeft = portfolio.cashUsd + freedCash;
  for (const scored of scores) {
    if (decisions.length >= freeSlots) break;
    if (!scored.eligible || scored.score < config.minScore) continue;
    if (held.has(scored.mint) || inCooldown(portfolio, scored.mint, now, config)) continue;
    // leave headroom for the taker fee so the buy can never overdraw cash
    const spendable = cashLeft / (1 + config.feeBps / 10_000);
    const notionalUsd = Math.min(perTradeUsd, spendable);
    if (notionalUsd < config.minTradeUsd) break;
    decisions.push({
      action: "BUY",
      mint: scored.mint,
      symbol: scored.symbol,
      notionalUsd,
      score: scored.score,
      reason: `runner score ${scored.score}`,
    });
    cashLeft -= notionalUsd;
  }
  return decisions;
}
