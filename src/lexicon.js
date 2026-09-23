/**
 * Dog lexicon: decides whether a token counts as a "dog runner".
 *
 * The hackathon rule is "build a dog agent that trades all the dog runners",
 * so the universe filter is a first-class, tested part of the strategy rather
 * than a hardcoded token list.
 *
 * @module lexicon
 */

/** Words that make a token a dog token. Matched case-insensitively. */
export const DOG_WORDS = Object.freeze([
  "dog", "doggo", "doge", "dogi", "inu", "shib", "shiba", "akita", "husky",
  "corgi", "pup", "puppy", "woof", "bark", "hound", "bone", "kabosu", "wif",
  "bonk", "floki", "samoyed", "retriever", "beagle", "pitbull", "poodle",
  "terrier", "mutt", "snoop", "lassie", "paw", "fetch", "kennel", "leash",
  "shepherd", "chihuahua", "dachshund", "pomeranian", "greyhound", "labrador",
]);

/**
 * Words that look doggy but are common false positives, so they only count
 * when they appear as a standalone token rather than inside a longer word.
 */
const LOOSE_WORDS = Object.freeze(["bone", "paw", "fetch", "wif", "bark"]);

const NON_ALNUM = /[^a-z0-9]+/g;

/**
 * Normalize a name or symbol for matching.
 * @param {string} value
 * @returns {string}
 */
export function normalize(value) {
  return String(value ?? "").toLowerCase().replace(NON_ALNUM, " ").trim();
}

/**
 * Find the dog words present in a piece of text.
 * @param {string} text
 * @returns {string[]} matched dog words, deduped, in lexicon order.
 */
export function matchDogWords(text) {
  const haystack = normalize(text);
  if (!haystack) return [];
  const tokens = new Set(haystack.split(" "));
  const squashed = haystack.replace(/ /g, "");
  return DOG_WORDS.filter((word) =>
    LOOSE_WORDS.includes(word) ? tokens.has(word) : squashed.includes(word),
  );
}

/**
 * Is this token part of the dog-runner universe?
 * @param {{symbol?: string, name?: string}} token
 * @returns {{isDog: boolean, matched: string[]}}
 */
export function classify(token) {
  const matched = matchDogWords(`${token?.symbol ?? ""} ${token?.name ?? ""}`);
  return { isDog: matched.length > 0, matched };
}

/**
 * Convenience predicate.
 * @param {{symbol?: string, name?: string}} token
 * @returns {boolean}
 */
export function isDogRunner(token) {
  return classify(token).isDog;
}
