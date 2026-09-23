/**
 * Configuration: defaults, env overrides, and fail-fast validation.
 * No secret ever has a default — see .env.example.
 *
 * @module config
 */

/** Strategy, risk and execution defaults. Every value is overridable by env. */
export const DEFAULTS = Object.freeze({
  // universe / discovery
  source: "fixture", // "fixture" | "dexscreener"
  fixturePath: "fixtures/runners.sample.json",
  dexscreenerQuery: "dog",
  maxUniverse: 40,

  // strategy gates
  minLiquidityUsd: 5_000,
  maxLiquidityUsd: 50_000_000,
  minVolumeRatio: 0.25, // 24h volume / liquidity
  maxVolumeRatio: 60, // above this the pair is churn, not a trend
  minAgeHours: 1,
  minMomentumPct: 3, // a runner has to actually be running
  minM5Pct: 0, // never open into a red 5m candle, however good the 1h looks
  maxM5Pct: 60, // blow-off top guard: do not chase a 5m vertical
  minScore: 45,
  exitScore: 25,

  // scoring shape
  momentumFullScalePct: 25,
  volumeRatioFullScale: 3,
  liquidityFullScaleMult: 10,
  weightMomentum: 0.55,
  weightVolume: 0.25,
  weightLiquidity: 0.2,

  // risk
  startingCashUsd: 1_000,
  maxPositions: 5,
  maxPositionPct: 0.2, // of equity, per position
  minTradeUsd: 10,
  stopLossPct: 18,
  takeProfitPct: 45,
  trailingStopPct: 22, // from peak, once in profit
  cooldownMinutes: 30,

  // execution
  venue: "paper", // "paper" | "devnet"
  feeBps: 30,
  impactFactor: 0.6, // price impact = notional/liquidity * impactFactor
  maxSlippageBps: 500, // abort the fill above this

  // devnet settlement
  rpcUrl: "https://api.devnet.solana.com",
  settlementLamports: 5_000,
  keypairPath: "", // required only when venue=devnet
  settlementPubkey: "", // required only when venue=devnet

  // loop
  // Minutes the agent's clock advances per tick. 0 = use the wall clock (live
  // trading). Replaying a recorded tape sets this to the tape's candle size so
  // time-based rules (cooldown) behave exactly as they would live.
  clockStepMinutes: 0,
  ticks: 6,
  tickSeconds: 3,
  journalPath: "runs/journal.jsonl",
});

const NUMERIC_KEYS = Object.freeze(
  Object.entries(DEFAULTS)
    .filter(([, value]) => typeof value === "number")
    .map(([key]) => key),
);

const ENV_PREFIX = "HDOG_";

/** camelCase -> HDOG_SNAKE_CASE */
function envName(key) {
  return ENV_PREFIX + key.replace(/[A-Z0-9]+/g, (m) => `_${m}`).toUpperCase();
}

/**
 * Build the effective config.
 * @param {Record<string, string|undefined>} [env]
 * @param {Partial<typeof DEFAULTS>} [overrides]
 * @returns {typeof DEFAULTS}
 */
export function loadConfig(env = process.env, overrides = {}) {
  const fromEnv = {};
  for (const key of Object.keys(DEFAULTS)) {
    const raw = env[envName(key)];
    if (raw === undefined || raw === "") continue;
    fromEnv[key] = NUMERIC_KEYS.includes(key) ? Number(raw) : String(raw);
  }
  const config = Object.freeze({ ...DEFAULTS, ...fromEnv, ...overrides });
  const problems = validateConfig(config);
  if (problems.length > 0) {
    throw new Error(`invalid config:\n  - ${problems.join("\n  - ")}`);
  }
  return config;
}

/**
 * Collect every configuration problem instead of throwing on the first.
 * @param {typeof DEFAULTS} config
 * @returns {string[]}
 */
export function validateConfig(config) {
  const problems = [];
  for (const key of NUMERIC_KEYS) {
    if (!Number.isFinite(config[key])) problems.push(`${envName(key)} must be a number`);
  }
  if (!["fixture", "dexscreener"].includes(config.source)) {
    problems.push(`${envName("source")} must be "fixture" or "dexscreener"`);
  }
  if (!["paper", "devnet"].includes(config.venue)) {
    problems.push(`${envName("venue")} must be "paper" or "devnet"`);
  }
  if (config.maxPositionPct <= 0 || config.maxPositionPct > 1) {
    problems.push(`${envName("maxPositionPct")} must be in (0, 1]`);
  }
  if (config.maxPositions < 1) problems.push(`${envName("maxPositions")} must be >= 1`);
  if (config.minScore <= config.exitScore) {
    problems.push(`${envName("minScore")} must be greater than ${envName("exitScore")}`);
  }
  if (config.minLiquidityUsd >= config.maxLiquidityUsd) {
    problems.push(`${envName("minLiquidityUsd")} must be below ${envName("maxLiquidityUsd")}`);
  }
  if (config.venue === "devnet") {
    if (!config.keypairPath) problems.push(`${envName("keypairPath")} is required when venue=devnet`);
    if (!config.settlementPubkey) {
      problems.push(`${envName("settlementPubkey")} is required when venue=devnet`);
    }
    if (!/^https:\/\/|^http:\/\//.test(config.rpcUrl)) {
      problems.push(`${envName("rpcUrl")} must be an http(s) URL`);
    }
    if (/mainnet|api\.mainnet-beta/i.test(config.rpcUrl)) {
      problems.push("mainnet RPC is refused on purpose — this agent is devnet only");
    }
  }
  return problems;
}
