import { test } from "node:test";
import assert from "node:assert/strict";
import { createAgent } from "../src/agent.js";
import { createMemoryJournal } from "../src/journal.js";
import { createFixtureSource } from "../src/discovery/fixtureSource.js";
import { createPaperExecutor } from "../src/exec/paperExecutor.js";
import { quote, stubExecutor, stubSource, testConfig } from "./helpers.js";

const CLOCK = () => new Date("2026-09-24T12:00:00.000Z");

/** @param {Partial<ReturnType<typeof testConfig>>} [overrides] */
function build(ticks, overrides = {}) {
  const config = testConfig(overrides);
  const journal = createMemoryJournal();
  const executor = stubExecutor();
  const agent = createAgent({ source: stubSource(ticks), executor, config, journal, clock: CLOCK });
  return { agent, journal, executor, config };
}

test("one tick buys the runners and journals what happened", async () => {
  const runners = [
    quote({ mint: "a", symbol: "DOGA", change: { m5: 9, h1: 16, h6: 22 } }),
    quote({ mint: "b", symbol: "DOGB", change: { m5: 7, h1: 14, h6: 20 } }),
    quote({ mint: "c", symbol: "CATNIP", name: "Catnip Finance" }),
  ];
  const { agent, journal } = build([runners]);
  const result = await agent.runTick();
  assert.equal(result.universeSize, 3);
  assert.equal(result.fills.length, 2, "only the two dogs get bought");
  assert.equal(agent.stats.openPositions, 2);
  assert.equal(journal.events.filter((e) => e.event === "fill").length, 2);
  assert.equal(journal.events.at(-1).event, "tick");
});

test("cash is conserved across a buy", async () => {
  const { agent, config } = build([[quote({ mint: "a", symbol: "DOGA", change: { m5: 9, h1: 16, h6: 22 } })]]);
  await agent.runTick();
  const s = agent.stats;
  assert.ok(Math.abs(s.equityUsd - config.startingCashUsd) < 1e-6, "no fee executor: equity must be flat");
  assert.ok(s.cashUsd < config.startingCashUsd);
});

test("a position that craters is stopped out on the next tick", async () => {
  const up = quote({ mint: "a", symbol: "DOGA", priceUsd: 1, change: { m5: 9, h1: 16, h6: 22 } });
  const down = quote({ mint: "a", symbol: "DOGA", priceUsd: 0.5, change: { m5: -40, h1: -20, h6: -10 } });
  const { agent } = build([[up], [down]]);
  await agent.runTick();
  const second = await agent.runTick();
  assert.equal(second.fills[0].side, "SELL");
  assert.match(second.decisions[0].reason, /stop-loss/);
  assert.equal(agent.stats.openPositions, 0);
  assert.ok(agent.stats.realizedPnlUsd < 0);
});

test("a refused fill is recorded as a skip and never touches the book", async () => {
  const config = testConfig();
  const journal = createMemoryJournal();
  const executor = {
    venue: "boom",
    async execute() {
      throw new Error("rpc exploded");
    },
  };
  const agent = createAgent({
    source: stubSource([[quote({ mint: "a", symbol: "DOGA", change: { m5: 9, h1: 16, h6: 22 } })]]),
    executor,
    config,
    journal,
    clock: CLOCK,
  });
  const result = await agent.runTick();
  assert.equal(result.fills.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].error, /rpc exploded/);
  assert.equal(agent.stats.cashUsd, config.startingCashUsd, "a failed order must not spend cash");
  assert.ok(journal.events.some((e) => e.event === "skip"));
});

test("closeAll flattens the book", async () => {
  const runners = [
    quote({ mint: "a", symbol: "DOGA", change: { m5: 9, h1: 16, h6: 22 } }),
    quote({ mint: "b", symbol: "DOGB", change: { m5: 8, h1: 15, h6: 21 } }),
  ];
  const { agent } = build([runners]);
  await agent.runTick();
  assert.equal(agent.stats.openPositions, 2);
  const fills = await agent.closeAll();
  assert.equal(fills.length, 2);
  assert.ok(fills.every((f) => f.side === "SELL"));
  assert.equal(agent.stats.openPositions, 0);
  assert.equal(await agent.closeAll().then((f) => f.length), 0);
});

test("a full run over the shipped tape trades and stays solvent", async () => {
  const config = testConfig({ tickSeconds: 0 });
  const source = await createFixtureSource("fixtures/runners.sample.json");
  const journal = createMemoryJournal();
  const agent = createAgent({
    source,
    executor: createPaperExecutor(config),
    config,
    journal,
  });
  for (let i = 0; i < source.length; i += 1) await agent.runTick();
  await agent.closeAll();

  const fills = journal.events.filter((e) => e.event === "fill");
  const symbols = new Set(fills.map((e) => e.fill.symbol));
  assert.ok(fills.length >= 4, `expected real activity, saw ${fills.length} fills`);
  assert.ok(symbols.has("WIFHAT"), "the clean trend should have been traded");
  assert.equal(symbols.has("CATNIP"), false, "a cat must never be bought");
  assert.equal(symbols.has("PUPPY"), false, "an illiquid pool must never be bought");
  assert.equal(agent.stats.openPositions, 0);
  assert.ok(agent.stats.cashUsd > 0, "the agent must never end insolvent");
  assert.ok(agent.stats.feesPaidUsd > 0, "fees have to be paid on real fills");
});
