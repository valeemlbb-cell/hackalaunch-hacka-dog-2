/**
 * Append-only JSONL run journal. Every tick, decision and fill lands here so a
 * run can be audited after the fact.
 *
 * @module journal
 */

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * @param {string} path
 * @returns {{path: string, write: (event: string, data: object) => Promise<void>}}
 */
export function createJournal(path) {
  let ready = null;
  return {
    path,
    async write(event, data) {
      ready ??= mkdir(dirname(path), { recursive: true });
      await ready;
      const line = JSON.stringify({ ts: new Date().toISOString(), event, ...data });
      await appendFile(path, `${line}\n`, "utf8");
    },
  };
}

/** A journal that keeps events in memory — used by the tests. */
export function createMemoryJournal() {
  const events = [];
  return {
    path: ":memory:",
    events,
    async write(event, data) {
      events.push({ event, ...data });
    },
  };
}
