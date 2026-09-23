import { test } from "node:test";
import assert from "node:assert/strict";
import { createAgent } from "../src/agent.js";
import { createMemoryJournal } from "../src/journal.js";
import { quote, stubExecutor, stubSource, testConfig } from "./helpers.js";

const FROZEN = () => new Date("2026-09-24T12:00:00.000Z");

const RUNNER = quote({ mint: "a", symbol: "DOGA", priceUsd: 1, change: { m5: 9, h1: 16, h6: 22 } });
const CRASH = quote({ mint: "a", symbol: "DOGA", priceUsd: 0.5, change: { m5: -40, h1: -20, h6: -10 } });
const RECOVER = quote({ mint: "a", symbol: "DOGA", priceUsd: 0.9, change: { m5: 12, h1: 18, h6: 24 } });

/** @param {number} clockStepMinutes */
function replay(clockStepMinutes) {
  const config = testConfig({ clockStepMinutes, maxPositions: 1, maxPositionPct: 1 });
  return createAgent({
    source: stubSource([[RUNNER], [CRASH], [RECOVER], [RECOVER], [RECOVER], [RECOVER], [RECOVER], [RECOVER]]),
    executor: stubExecutor(),
    config,
    journal: createMemoryJournal(),
    clock: FROZEN,
  });
}

test("with a frozen wall clock a replay can never re-enter after a stop out", async () => {
  const agent = replay(0);
  for (let i = 0; i < 8; i += 1) await agent.runTick();
  // every tick happened at the same instant, so the 30 minute cooldown never expires
  assert.equal(agent.stats.openPositions, 0);
});

test("a tape clock advances one candle per tick so the cooldown actually expires", async () => {
  const agent = replay(5); // 5 minute candles: 30 minute cooldown clears after 6 ticks
  for (let i = 0; i < 8; i += 1) await agent.runTick();
  assert.equal(agent.stats.openPositions, 1, "the agent should be allowed back in once the cooldown lapses");
});

test("fills are stamped with the agent's clock, not the wall clock", async () => {
  const agent = replay(5);
  const first = await agent.runTick();
  await agent.runTick();
  const third = await agent.runTick();
  assert.equal(first.fills[0].ts, "2026-09-24T12:00:00.000Z");
  assert.equal(third.fills.length, 0, "still inside the cooldown at tick 3");
});
