import { test } from "node:test";
import assert from "node:assert/strict";
import { createPaperExecutor, priceFill, slippageBps, SlippageRefused } from "../src/exec/paperExecutor.js";
import { buildMemo, loadKeypair, MEMO_PROGRAM_ID } from "../src/exec/devnetExecutor.js";
import { quote, testConfig } from "./helpers.js";

const config = testConfig();
const CLOCK = () => new Date("2026-09-24T00:00:00.000Z");

test("price impact scales with trade size against pool depth", () => {
  assert.equal(slippageBps(1_000, 100_000, 0.6), 60);
  assert.equal(slippageBps(2_000, 100_000, 0.6), 120);
  assert.equal(slippageBps(100, 0, 0.6), Number.POSITIVE_INFINITY);
});

test("a buy pays up and a sell gets hit down", async () => {
  const executor = createPaperExecutor(config, CLOCK);
  const q = quote({ priceUsd: 2, liquidityUsd: 100_000 });
  const buy = await executor.execute(
    { action: "BUY", mint: q.mint, symbol: q.symbol, notionalUsd: 1_000, score: 70, reason: "r" },
    q,
  );
  const sell = await executor.execute(
    { action: "SELL", mint: q.mint, symbol: q.symbol, qty: 500, notionalUsd: 1_000, score: 70, reason: "r" },
    q,
  );
  assert.ok(buy.priceUsd > q.priceUsd, "buyer crosses the spread upward");
  assert.ok(sell.priceUsd < q.priceUsd, "seller crosses the spread downward");
  assert.equal(buy.venue, "paper");
  assert.equal(buy.ts, "2026-09-24T00:00:00.000Z");
});

test("a buy spends exactly its notional", async () => {
  const executor = createPaperExecutor(config, CLOCK);
  const q = quote({ priceUsd: 0.004, liquidityUsd: 250_000 });
  const fill = await executor.execute(
    { action: "BUY", mint: q.mint, symbol: q.symbol, notionalUsd: 200, score: 70, reason: "r" },
    q,
  );
  assert.ok(Math.abs(fill.qty * fill.priceUsd - 200) < 1e-9);
  assert.ok(Math.abs(fill.feeUsd - (200 * config.feeBps) / 10_000) < 1e-9);
});

test("a fill that would move the market too far is refused, not filled worse", async () => {
  const executor = createPaperExecutor(config, CLOCK);
  const q = quote({ liquidityUsd: 10_000 });
  await assert.rejects(
    () => executor.execute({ action: "BUY", mint: q.mint, symbol: q.symbol, notionalUsd: 9_000, score: 70, reason: "r" }, q),
    (error) => {
      assert.ok(error instanceof SlippageRefused);
      assert.match(error.message, /exceeds limit/);
      return true;
    },
  );
});

test("priceFill tags the venue it was asked for", () => {
  const fill = priceFill(
    { action: "BUY", mint: "m", symbol: "HDOG", notionalUsd: 100, score: 1, reason: "r" },
    quote(),
    config,
    new Date(0),
    "devnet",
  );
  assert.equal(fill.venue, "devnet");
});

test("the devnet memo is compact, valid JSON and identifies the agent", () => {
  const memo = buildMemo(
    priceFill(
      { action: "BUY", mint: "MintDog1111", symbol: "HDOG", notionalUsd: 100, score: 1, reason: "runner score 71" },
      quote(),
      config,
      new Date("2026-09-24T00:00:00.000Z"),
      "devnet",
    ),
  );
  const parsed = JSON.parse(memo);
  assert.equal(parsed.a, "hdog-agent");
  assert.equal(parsed.s, "BUY");
  assert.equal(parsed.sym, "HDOG");
  assert.ok(memo.length <= 480);
});

test("a long reason is truncated instead of blowing up the transaction", () => {
  const fill = priceFill(
    { action: "BUY", mint: "M".repeat(200), symbol: "HDOG", notionalUsd: 100, score: 1, reason: "x".repeat(500) },
    quote(),
    config,
    new Date(0),
    "devnet",
  );
  assert.ok(buildMemo(fill).length <= 480);
});

test("the memo program address is the canonical one", () => {
  assert.equal(MEMO_PROGRAM_ID, "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
});

test("a malformed keypair file fails loudly", async () => {
  await assert.rejects(() => loadKeypair("test/fixtures-missing.json"), /ENOENT|no such file/);
});
