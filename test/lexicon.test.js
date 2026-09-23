import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, isDogRunner, matchDogWords, normalize } from "../src/lexicon.js";

test("normalize strips punctuation and lowercases", () => {
  assert.equal(normalize("$WIF-hat!"), "wif hat");
  assert.equal(normalize(null), "");
});

test("matches obvious dog tokens by symbol or name", () => {
  assert.ok(isDogRunner({ symbol: "HDOG", name: "Hacka Dog" }));
  assert.ok(isDogRunner({ symbol: "SHIBX", name: "Shiba Xtreme" }));
  assert.ok(isDogRunner({ symbol: "XYZ", name: "Golden Retriever Coin" }));
  assert.ok(isDogRunner({ symbol: "BONK", name: "" }));
});

test("rejects tokens with no dog in them", () => {
  assert.equal(isDogRunner({ symbol: "CATNIP", name: "Catnip Finance" }), false);
  assert.equal(isDogRunner({ symbol: "SOL", name: "Wrapped SOL" }), false);
  assert.equal(isDogRunner({}), false);
});

test("loose words only count as standalone tokens", () => {
  // "bone" inside "Carbone" must not make a dog token
  assert.equal(isDogRunner({ symbol: "CRBN", name: "Carbone Protocol" }), false);
  assert.ok(isDogRunner({ symbol: "BONE", name: "Bone Token" }));
  // "wif" inside "swift" must not match either
  assert.equal(isDogRunner({ symbol: "SWIFT", name: "Swift Pay" }), false);
});

test("classify reports which words matched", () => {
  const { isDog, matched } = classify({ symbol: "DOGEINU", name: "Doge Inu" });
  assert.ok(isDog);
  assert.deepEqual(matched.sort(), ["doge", "dog", "inu"].sort());
});

test("matchDogWords is empty for blank input", () => {
  assert.deepEqual(matchDogWords("   "), []);
});
