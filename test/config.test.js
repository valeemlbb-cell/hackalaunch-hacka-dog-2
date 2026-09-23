import { test } from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_RPC_HOSTS, DEFAULTS, isAllowedRpcUrl, loadConfig, validateConfig } from "../src/config.js";

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

test("a custom mainnet RPC is refused in EVERY venue, not just devnet", () => {
  const hostile = "https://mainnet.helius-rpc.com/?api-key=x";
  assert.throws(() => loadConfig({ HDOG_RPC_URL: hostile }), /devnet only/, "paper venue still refuses it");
  assert.throws(
    () =>
      loadConfig({
        HDOG_VENUE: "devnet",
        HDOG_KEYPAIR_PATH: "k.json",
        HDOG_SETTLEMENT_PUBKEY: "pk",
        HDOG_RPC_URL: hostile,
      }),
    /devnet only/,
    "devnet venue refuses it too",
  );
});

test("the RPC allowlist rejects every host that is not a test cluster", () => {
  for (const url of [
    "https://mainnet.helius-rpc.com/?api-key=x",
    "https://solana-mainnet.g.alchemy.com/v2/k",
    "https://rpc.ankr.com/solana",
    "https://api.mainnet-beta.solana.com",
    "https://api.devnet.solana.com.evil.example",
    "http://8.8.8.8:8899",
    "ftp://api.devnet.solana.com",
    "not-a-url",
    "",
  ]) {
    assert.equal(isAllowedRpcUrl(url), false, `${url || "(empty)"} must be refused`);
  }
});

test("the RPC allowlist accepts the test clusters and a local validator", () => {
  for (const url of [
    "https://api.devnet.solana.com",
    "https://api.testnet.solana.com",
    "http://localhost:8899",
    "http://127.0.0.1:8899",
  ]) {
    assert.equal(isAllowedRpcUrl(url), true, `${url} must be accepted`);
  }
  assert.deepEqual(ALLOWED_RPC_HOSTS.length, 4);
});
