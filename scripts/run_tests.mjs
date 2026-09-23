#!/usr/bin/env node
/**
 * Runs the unit suite with the built-in node:test runner.
 *
 * Why this exists instead of `node --test test/`:
 * how Node treats a positional argument after `--test` has changed across the
 * versions this package supports (`>=20.11`). Older releases expanded a
 * directory, newer ones treat the positional as a file path or a glob — so
 * `node --test test/` fails on Node >= 23 with MODULE_NOT_FOUND, and
 * `node --test "test/**\/*.test.js"` fails on Node 20, which has no glob
 * support. An explicit list of files is the one form every supported release
 * understands, so we resolve the list here and hand it over.
 *
 * Extra flags are forwarded, e.g. `node scripts/run_tests.mjs --experimental-test-coverage`.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TEST_DIR = join(ROOT, "test");
/** Helpers such as test/helpers.js hold no tests and are only imported. */
const TEST_FILE = /\.test\.(m|c)?js$/;

/**
 * @param {string} dir
 * @returns {string[]} absolute paths, sorted so runs are reproducible
 */
function collectTests(dir) {
  const found = readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return collectTests(path);
    return TEST_FILE.test(entry.name) ? [path] : [];
  });
  return found.sort();
}

let files;
try {
  files = collectTests(TEST_DIR);
} catch (err) {
  console.error(`cannot read ${TEST_DIR}: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

if (files.length === 0) {
  console.error(`no files matching ${TEST_FILE} under ${TEST_DIR}`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--test", ...process.argv.slice(2), ...files.map((file) => relative(ROOT, file))],
  { cwd: ROOT, stdio: "inherit" },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
// A run killed by a signal reports status null — treat that as a failure.
process.exit(result.status ?? 1);
