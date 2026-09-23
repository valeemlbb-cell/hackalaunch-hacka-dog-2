import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, loadConfig, validateConfig } from "../src/config.js";

test("defaults load with an empty environment", () => {
  const config = loadConfig({});
  assert.equal(config.venue, "paper");
  assert.equal(config.startingCashUsd, DEFAULTS.startingCashUsd);
});

test("env overrides are typed correctly", () => {
  const config = loadConfig({ HDOG_MAX_POSITIONS: "3", HDOG_SOURCE: "dexscreener" });
  assert.equal(config.maxPositions, 3);
  assert.equal(config.source, "dexscreener");
});

test("explicit overrides beat the environment", () => {
  const config = loadConfig({ HDOG_TICKS: "9" }, { ticks: 2 });
  assert.equal(config.ticks, 2);
});

test("a non-numeric numeric field is rejected", () => {
  assert.throws(() => loadConfig({ HDOG_MAX_POSITIONS: "many" }), /MAX_POSITIONS must be a number/);
});

test("devnet venue demands a keypair and a settlement account", () => {
  const problems = validateConfig({ ...DEFAULTS, venue: "devnet" });
  assert.ok(problems.some((p) => p.includes("KEYPAIR_PATH")));
  assert.ok(problems.some((p) => p.includes("SETTLEMENT_PUBKEY")));
});

test("mainnet RPC is refused outright", () => {
  const problems = validateConfig({
    ...DEFAULTS,
    venue: "devnet",
    keypairPath: "k.json",
    settlementPubkey: "pk",
    rpcUrl: "https://api.mainnet-beta.solana.com",
  });
  assert.ok(problems.some((p) => p.includes("devnet only")));
});

test("nonsense risk limits are caught before any trade", () => {
  assert.throws(() => loadConfig({}, { maxPositionPct: 5 }), /MAX_POSITION_PCT/);
  assert.throws(() => loadConfig({}, { minScore: 10, exitScore: 20 }), /MIN_SCORE/);
  assert.throws(() => loadConfig({}, { venue: "mainnet" }), /VENUE/);
});
