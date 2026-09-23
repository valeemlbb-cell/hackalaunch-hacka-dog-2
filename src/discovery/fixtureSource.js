/**
 * Fixture source: replays a recorded set of dog-runner quotes.
 *
 * This is what the tests and the demo run on, so a run is deterministic and
 * reproducible by anyone reviewing the submission — no live API, no API key.
 * Each tick advances one step through the recorded tape and loops at the end.
 *
 * @module discovery/fixtureSource
 */

import { readFile } from "node:fs/promises";

/**
 * Normalize one raw record into a RunnerQuote.
 * @param {any} raw
 * @param {string} fetchedAt
 * @returns {import("../types.js").RunnerQuote}
 */
export function toQuote(raw, fetchedAt) {
  return Object.freeze({
    mint: String(raw.mint),
    symbol: String(raw.symbol),
    name: String(raw.name ?? raw.symbol),
    priceUsd: Number(raw.priceUsd),
    liquidityUsd: Number(raw.liquidityUsd),
    volume24hUsd: Number(raw.volume24hUsd),
    change: Object.freeze({
      m5: Number(raw.change?.m5 ?? 0),
      h1: Number(raw.change?.h1 ?? 0),
      h6: Number(raw.change?.h6 ?? 0),
      h24: Number(raw.change?.h24 ?? 0),
    }),
    ageHours: Number(raw.ageHours ?? 0),
    source: "fixture",
    fetchedAt,
  });
}

/**
 * Validate the shape of a loaded tape and explain exactly what is wrong.
 * @param {any} tape
 * @returns {string[]}
 */
export function validateTape(tape) {
  const problems = [];
  if (!tape || !Array.isArray(tape.ticks)) return ["fixture must be { ticks: [...] }"];
  if (tape.ticks.length === 0) problems.push("fixture has no ticks");
  tape.ticks.forEach((tick, index) => {
    if (!Array.isArray(tick)) {
      problems.push(`tick ${index} must be an array of quotes`);
      return;
    }
    tick.forEach((raw, position) => {
      const where = `tick ${index} quote ${position}`;
      if (!raw?.mint) problems.push(`${where}: missing mint`);
      if (!raw?.symbol) problems.push(`${where}: missing symbol`);
      if (!(Number(raw?.priceUsd) > 0)) problems.push(`${where}: priceUsd must be > 0`);
    });
  });
  return problems;
}

/**
 * @param {string} path
 * @param {() => Date} [clock]
 * @returns {Promise<import("../types.js").RunnerSource & {length: number}>}
 */
export async function createFixtureSource(path, clock = () => new Date()) {
  const tape = JSON.parse(await readFile(path, "utf8"));
  const problems = validateTape(tape);
  if (problems.length > 0) {
    throw new Error(`invalid fixture ${path}:\n  - ${problems.join("\n  - ")}`);
  }
  let cursor = 0;
  return {
    id: "fixture",
    length: tape.ticks.length,
    tickMinutes: Number(tape.tickMinutes ?? 5),
    async fetchRunners() {
      const tick = tape.ticks[cursor % tape.ticks.length];
      cursor += 1;
      const fetchedAt = clock().toISOString();
      return tick.map((raw) => toQuote(raw, fetchedAt));
    },
  };
}
