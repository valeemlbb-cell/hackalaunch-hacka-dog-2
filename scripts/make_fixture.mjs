/**
 * Regenerates fixtures/runners.sample.json.
 *
 * The tape is written from explicit price paths rather than random numbers so
 * the recorded run is byte-for-byte reproducible by a reviewer:
 *   node scripts/make_fixture.mjs
 *
 * Each price path carries WARMUP leading values that exist only so the first
 * emitted tick already has real 5m/1h/6h changes instead of zeros.
 */

import { writeFile } from "node:fs/promises";

const WARMUP = 3;
// The tape is a ~55 minute recording, so the three momentum windows are
// compressed to 1 / 3 / 6 ticks rather than a literal 5m / 1h / 6h. The field
// names stay the same because that is what a live source returns.
const LOOKBACK = Object.freeze({ m5: 1, h1: 3, h6: 6 });

/** @type {{mint: string, symbol: string, name: string, liquidityUsd: number, volume24hUsd: number, ageHours: number, path: number[], note: string}[]} */
const TOKENS = [
  {
    mint: "HDoG1Ru4Wn7xk8ZzQmVt5Yb3Ac6Df9Gh2Jk4Lm7Np1Qr",
    symbol: "HDOG",
    name: "Hacka Dog",
    liquidityUsd: 85_000,
    volume24hUsd: 212_000,
    ageHours: 62,
    note: "the hackathon token: runs, then rolls over — exercises the momentum exit",
    path: [0.00037, 0.00039, 0.00041, 0.00042, 0.00046, 0.00051, 0.00055, 0.00058, 0.00057, 0.00054, 0.00051],
  },
  {
    mint: "WiFH4tRunner9Zx2Cv5Bn8Mk1Qw4Er7Ty0Ui3Op6As9D",
    symbol: "WIFHAT",
    name: "dog wif hat runner",
    liquidityUsd: 450_000,
    volume24hUsd: 1_310_000,
    ageHours: 340,
    note: "clean trend — should hit the take-profit",
    path: [1.55, 1.64, 1.74, 1.85, 2.02, 2.28, 2.61, 2.95, 3.18, 3.05, 2.9],
  },
  {
    mint: "BoNKy5Jr3Hg6Kl9Zx2Cv5Bn8Mk1Qw4Er7Ty0Ui3Op6A",
    symbol: "BONKY",
    name: "Bonk Junior",
    liquidityUsd: 160_000,
    volume24hUsd: 300_000,
    ageHours: 900,
    note: "slow grinder — stays open to the end of the run",
    path: [0.0000086, 0.0000088, 0.000009, 0.0000091, 0.0000094, 0.0000098, 0.0000101, 0.0000099, 0.0000103, 0.0000108, 0.0000112],
  },
  {
    mint: "ShiBx7Tr4p2Wq5Er8Ty1Ui4Op7As0Df3Gh6Jk9Lz2Xc",
    symbol: "SHIBX",
    name: "Shiba Xtreme",
    liquidityUsd: 96_000,
    volume24hUsd: 240_000,
    ageHours: 48,
    note: "pumps then knifes — exercises the stop loss",
    path: [0.0119, 0.0125, 0.013, 0.0135, 0.0149, 0.0161, 0.013, 0.0108, 0.0095, 0.0101, 0.0098],
  },
  {
    mint: "PuPPy2Th1n3Li4q5Ui6Dt7Yp8Oo9Ll0Aa1Bb2Cc3Dd4",
    symbol: "PUPPY",
    name: "Puppy Coin",
    liquidityUsd: 1_240,
    volume24hUsd: 9_800,
    ageHours: 120,
    note: "blocked: pool too thin to exit without eating the spread",
    path: [0.0021, 0.0023, 0.0026, 0.0031, 0.0037, 0.0042, 0.0046, 0.0048, 0.0045, 0.0041, 0.0039],
  },
  {
    mint: "VerT1c4lDog5Ee6Ff7Gg8Hh9Ii0Jj1Kk2Ll3Mm4Nn5O",
    symbol: "VERTDOG",
    name: "Vertical Dog",
    liquidityUsd: 78_000,
    volume24hUsd: 410_000,
    ageHours: 30,
    note: "blocked: already vertical when the tape starts — this is the top, not the entry",
    path: [0.0004, 0.00042, 0.00045, 0.0011, 0.0031, 0.0072, 0.0061, 0.0044, 0.0033, 0.0029, 0.0026],
  },
  {
    mint: "C4tNip9Pp0Qq1Rr2Ss3Tt4Uu5Vv6Ww7Xx8Yy9Zz0Ab1",
    symbol: "CATNIP",
    name: "Catnip Finance",
    liquidityUsd: 520_000,
    volume24hUsd: 1_900_000,
    ageHours: 700,
    note: "blocked: not a dog — proves the universe filter actually filters",
    path: [0.82, 0.86, 0.9, 0.97, 1.08, 1.21, 1.36, 1.44, 1.51, 1.58, 1.66],
  },
  {
    mint: "W4shDog2Cd3Ef4Gh5Ij6Kl7Mn8Op9Qr0St1Uv2Wx3Yz",
    symbol: "WASHDOG",
    name: "Wash Dog",
    liquidityUsd: 22_000,
    volume24hUsd: 3_300_000,
    ageHours: 14,
    note: "blocked: 150x volume on a 22k pool is wash trading, not demand",
    path: [0.00011, 0.00013, 0.00012, 0.00015, 0.00014, 0.00017, 0.00016, 0.00019, 0.00018, 0.00021, 0.0002],
  },
  {
    mint: "NewPup8Ab9Cd0Ef1Gh2Ij3Kl4Mn5Op6Qr7St8Uv9Wx0",
    symbol: "NEWPUP",
    name: "Brand New Pup",
    liquidityUsd: 31_000,
    volume24hUsd: 88_000,
    ageHours: 0.2,
    note: "blocked: 12 minutes old, no history to trade against",
    path: [0.0009, 0.00097, 0.00105, 0.00118, 0.00129, 0.00141, 0.00152, 0.00147, 0.00139, 0.00131, 0.00126],
  },
];

/**
 * Percent change between the price `back` ticks ago and the current price.
 * @param {number[]} path @param {number} index @param {number} back
 */
function pctChange(path, index, back) {
  const previous = path[Math.max(0, index - back)];
  return Number((((path[index] - previous) / previous) * 100).toFixed(2));
}

function buildTape() {
  const ticks = [];
  for (let index = WARMUP; index < TOKENS[0].path.length; index += 1) {
    ticks.push(
      TOKENS.map((token) => ({
        mint: token.mint,
        symbol: token.symbol,
        name: token.name,
        priceUsd: token.path[index],
        liquidityUsd: token.liquidityUsd,
        volume24hUsd: token.volume24hUsd,
        ageHours: token.ageHours,
        change: {
          m5: pctChange(token.path, index, LOOKBACK.m5),
          h1: pctChange(token.path, index, LOOKBACK.h1),
          h6: pctChange(token.path, index, LOOKBACK.h6),
          h24: pctChange(token.path, index, index),
        },
      })),
    );
  }
  return {
    description:
      "Recorded dog-runner tape for the Hacka Dog agent. Synthetic but internally consistent: every change field is computed from the price path in scripts/make_fixture.mjs. Regenerate with: node scripts/make_fixture.mjs",
    generatedBy: "scripts/make_fixture.mjs",
    tickMinutes: 5,
    notes: Object.fromEntries(TOKENS.map((token) => [token.symbol, token.note])),
    ticks,
  };
}

const out = new URL("../fixtures/runners.sample.json", import.meta.url);
await writeFile(out, `${JSON.stringify(buildTape(), null, 2)}\n`, "utf8");
console.log(`wrote ${out.pathname} (${buildTape().ticks.length} ticks x ${TOKENS.length} tokens)`);
