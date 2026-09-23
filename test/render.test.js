import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtPct, fmtUsd, hr, paint, renderScores, renderStats } from "../src/render.js";
import { testConfig } from "./helpers.js";

process.env.HDOG_COLOR = "0";

test("usd formatting adapts precision to magnitude", () => {
  assert.equal(fmtUsd(1234.5), "$1,234.50");
  assert.equal(fmtUsd(-12.5), "-$12.500");
  assert.equal(fmtUsd(0.0004), "$0.0004");
});

test("percent formatting always carries a sign", () => {
  assert.equal(fmtPct(3.14), "+3.1%");
  assert.equal(fmtPct(-3.14), "-3.1%");
});

test("colour is dropped when disabled", () => {
  assert.equal(paint("green", "ok"), "ok");
  assert.ok(!hr().includes("\u001b"));
});

test("the scoreboard marks entries, watches and blockers", () => {
  const config = testConfig();
  const out = renderScores(
    [
      { symbol: "WIFHAT", score: 78, eligible: true, blockers: [], mint: "a", parts: {} },
      { symbol: "BONKY", score: 30, eligible: true, blockers: [], mint: "b", parts: {} },
      { symbol: "PUPPY", score: 60, eligible: false, blockers: ["thin-liquidity"], mint: "c", parts: {} },
    ],
    config,
  );
  assert.match(out, /WIFHAT.*ENTER/s);
  assert.match(out, /BONKY.*watch/s);
  assert.match(out, /PUPPY.*thin-liquidity/s);
});

test("an empty universe still renders a line", () => {
  assert.match(renderScores([], testConfig()), /universe empty/);
});

test("the stats line reports equity, cash and pnl", () => {
  const out = renderStats({
    cashUsd: 800,
    positionsValueUsd: 250,
    equityUsd: 1050,
    unrealizedPnlUsd: 30,
    realizedPnlUsd: 20,
    feesPaidUsd: 1,
    openPositions: 2,
  });
  assert.match(out, /equity \$1,050\.00/);
  assert.match(out, /open 2/);
  assert.match(out, /pnl \+\$50\.000/);
});
