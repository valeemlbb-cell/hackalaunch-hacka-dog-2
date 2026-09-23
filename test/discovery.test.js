import { test } from "node:test";
import assert from "node:assert/strict";
import { createFixtureSource, toQuote, validateTape } from "../src/discovery/fixtureSource.js";
import { createDexscreenerSource, dedupeByMint, pairToQuote } from "../src/discovery/dexscreenerSource.js";
import { testConfig } from "./helpers.js";

const FETCHED = "2026-09-24T00:00:00.000Z";
const NOW_MS = Date.parse(FETCHED);

test("the shipped fixture tape is valid and replays in order", async () => {
  const source = await createFixtureSource("fixtures/runners.sample.json");
  assert.ok(source.length >= 5, "tape should be long enough to show a full trade");
  const first = await source.fetchRunners();
  const second = await source.fetchRunners();
  assert.ok(first.length > 0);
  assert.notEqual(first[0].priceUsd, second[0].priceUsd, "prices must actually move");
  assert.equal(first[0].source, "fixture");
});

test("the tape loops rather than running dry", async () => {
  const source = await createFixtureSource("fixtures/runners.sample.json");
  const seen = [];
  for (let i = 0; i < source.length + 1; i += 1) seen.push((await source.fetchRunners())[0].priceUsd);
  assert.equal(seen[0], seen[source.length]);
});

test("a broken tape is rejected with a useful message", () => {
  assert.deepEqual(validateTape(null), ["fixture must be { ticks: [...] }"]);
  assert.ok(validateTape({ ticks: [] }).includes("fixture has no ticks"));
  const problems = validateTape({ ticks: [[{ symbol: "X" }]] });
  assert.ok(problems.some((p) => p.includes("missing mint")));
  assert.ok(problems.some((p) => p.includes("priceUsd must be > 0")));
});

test("toQuote fills in missing optional fields", () => {
  const q = toQuote({ mint: "m", symbol: "HDOG", priceUsd: 1 }, FETCHED);
  assert.deepEqual(q.change, { m5: 0, h1: 0, h6: 0, h24: 0 });
  assert.equal(q.name, "HDOG");
  assert.equal(q.ageHours, 0);
});

/** @param {object} patch */
function pair(patch = {}) {
  return {
    chainId: "solana",
    baseToken: { address: "MintDog1", name: "Hacka Dog", symbol: "HDOG" },
    priceUsd: "0.00042",
    liquidity: { usd: 85_000 },
    volume: { h24: 212_000 },
    priceChange: { m5: 2.4, h1: 13.5, h6: 20 },
    pairCreatedAt: NOW_MS - 10 * 3_600_000,
    ...patch,
  };
}

test("a solana dog pair maps onto a quote", () => {
  const q = pairToQuote(pair(), FETCHED, NOW_MS);
  assert.equal(q.mint, "MintDog1");
  assert.equal(q.priceUsd, 0.00042);
  assert.equal(q.ageHours, 10);
  assert.equal(q.source, "dexscreener");
});

test("non-solana, non-dog and priceless pairs are dropped", () => {
  assert.equal(pairToQuote(pair({ chainId: "ethereum" }), FETCHED, NOW_MS), null);
  assert.equal(pairToQuote(pair({ priceUsd: "0" }), FETCHED, NOW_MS), null);
  assert.equal(
    pairToQuote(pair({ baseToken: { address: "m", name: "Catnip", symbol: "CAT" } }), FETCHED, NOW_MS),
    null,
  );
  assert.equal(pairToQuote(pair({ baseToken: { name: "Dog", symbol: "DOG" } }), FETCHED, NOW_MS), null);
});

test("the deepest pool wins when a mint has several pairs", () => {
  const shallow = pairToQuote(pair({ liquidity: { usd: 1_000 } }), FETCHED, NOW_MS);
  const deep = pairToQuote(pair({ liquidity: { usd: 900_000 } }), FETCHED, NOW_MS);
  const merged = dedupeByMint([shallow, deep]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].liquidityUsd, 900_000);
});

test("the live source filters, sorts and caps the universe without a real network", async () => {
  const payload = {
    pairs: [
      pair(),
      pair({ baseToken: { address: "MintCat", name: "Catnip Finance", symbol: "CAT" } }),
      pair({ baseToken: { address: "MintWif", name: "dogwifhat", symbol: "WIF" }, liquidity: { usd: 2_000_000 } }),
    ],
  };
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => payload });
  const source = createDexscreenerSource(testConfig({ maxUniverse: 1 }), fetchImpl, () => new Date(FETCHED));
  const quotes = await source.fetchRunners();
  assert.equal(quotes.length, 1);
  assert.equal(quotes[0].symbol, "WIF", "deepest pool first");
});

test("an http error from the live source is surfaced, not swallowed", async () => {
  const fetchImpl = async () => ({ ok: false, status: 429, statusText: "Too Many Requests" });
  const source = createDexscreenerSource(testConfig(), fetchImpl);
  await assert.rejects(() => source.fetchRunners(), /429/);
});
