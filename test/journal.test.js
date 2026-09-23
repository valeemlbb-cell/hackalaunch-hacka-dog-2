import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJournal, createMemoryJournal } from "../src/journal.js";
import { loadKeypair } from "../src/exec/devnetExecutor.js";

test("the journal creates its directory and appends one JSON object per line", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hdog-journal-"));
  const path = join(dir, "nested", "journal.jsonl");
  const journal = createJournal(path);
  await journal.write("tick", { tick: 1 });
  await journal.write("fill", { tick: 1, fill: { symbol: "HDOG" } });

  const lines = (await readFile(path, "utf8")).trim().split("\n");
  assert.equal(lines.length, 2);
  const first = JSON.parse(lines[0]);
  assert.equal(first.event, "tick");
  assert.equal(first.tick, 1);
  assert.ok(Date.parse(first.ts) > 0, "every line carries a timestamp");
  assert.equal(JSON.parse(lines[1]).fill.symbol, "HDOG");
});

test("the memory journal keeps events for tests", async () => {
  const journal = createMemoryJournal();
  await journal.write("tick", { tick: 7 });
  assert.deepEqual(journal.events, [{ event: "tick", tick: 7 }]);
  assert.equal(journal.path, ":memory:");
});

test("a keypair file round-trips, and a wrong-sized one is rejected", async () => {
  const { Keypair } = await import("@solana/web3.js");
  const dir = await mkdtemp(join(tmpdir(), "hdog-key-"));
  const good = join(dir, "good.json");
  const generated = Keypair.generate();
  await writeFile(good, JSON.stringify([...generated.secretKey]), "utf8");
  const loaded = await loadKeypair(good);
  assert.equal(loaded.publicKey.toBase58(), generated.publicKey.toBase58());

  const short = join(dir, "short.json");
  await writeFile(short, JSON.stringify([1, 2, 3]), "utf8");
  await assert.rejects(() => loadKeypair(short), /must hold 64 bytes/);

  const junk = join(dir, "junk.json");
  await writeFile(junk, "not json at all", "utf8");
  await assert.rejects(() => loadKeypair(junk), /not a JSON byte array/);
});
