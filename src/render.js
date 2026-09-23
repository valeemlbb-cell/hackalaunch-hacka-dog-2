/**
 * Terminal rendering helpers. Kept separate from the CLI so the formatting is
 * unit-testable and the CLI stays a thin wiring layer.
 *
 * @module render
 */

const CODES = Object.freeze({
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  cyan: "\u001b[36m",
});

const WIDTH = 78;

/** Colour is dropped when stdout is not a TTY or NO_COLOR is set. */
function colorEnabled() {
  return !process.env.NO_COLOR && process.env.HDOG_COLOR !== "0";
}

/**
 * @param {keyof typeof CODES} style
 * @param {string} text
 * @returns {string}
 */
export function paint(style, text) {
  if (!colorEnabled()) return text;
  return `${CODES[style] ?? ""}${text}${CODES.reset}`;
}

/** @param {number} value */
export function fmtUsd(value) {
  const settled = Math.abs(value) < 5e-5 ? 0 : value; // never print "-$0.0000"
  const sign = settled < 0 ? "-" : "";
  const abs = Math.abs(settled);
  const digits = abs >= 100 ? 2 : abs >= 1 ? 3 : 4;
  return `${sign}$${abs.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

/** @param {number} value */
export function fmtPct(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

/** @returns {string} */
export function hr() {
  return paint("dim", `  ${"─".repeat(WIDTH)}`);
}

/**
 * A compact leaderboard of the scored universe.
 * @param {import("./types.js").RunnerScore[]} scores
 * @param {ReturnType<import("./config.js").loadConfig>} config
 * @param {number} [limit]
 * @returns {string}
 */
export function renderScores(scores, config, limit = 6) {
  // tradable names lead the board; blocked ones follow so the reason is still visible
  const ordered = [...scores].sort(
    (a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score,
  );
  const rows = ordered.slice(0, limit).map((scored) => {
    const bar = "█".repeat(Math.round(scored.score / 5)).padEnd(20, "·");
    const state = scored.eligible
      ? scored.score >= config.minScore
        ? paint("green", "ENTER")
        : paint("dim", "watch")
      : paint("yellow", scored.blockers[0] ?? "blocked");
    return `   ${scored.symbol.padEnd(10)} ${String(scored.score).padStart(5)}  ${paint("cyan", bar)}  ${state}`;
  });
  return rows.join("\n") || paint("dim", "   universe empty");
}

/**
 * One-line portfolio summary.
 * @param {ReturnType<import("./portfolio/portfolio.js").stats>} value
 * @returns {string}
 */
export function renderStats(value) {
  const pnl = value.realizedPnlUsd + value.unrealizedPnlUsd;
  return (
    paint("dim", "   equity ") +
    fmtUsd(value.equityUsd) +
    paint("dim", "  cash ") +
    fmtUsd(value.cashUsd) +
    paint("dim", "  open ") +
    String(value.openPositions) +
    paint("dim", "  pnl ") +
    paint(pnl >= 0 ? "green" : "red", `${pnl >= 0 ? "+" : ""}${fmtUsd(pnl)}`)
  );
}
