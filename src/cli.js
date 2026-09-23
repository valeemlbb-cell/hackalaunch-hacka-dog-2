#!/usr/bin/env node
/**
 * Command line entry point.
 *
 *   node src/cli.js doctor        check config + devnet RPC reachability
 *   node src/cli.js run           run the trading loop for HDOG_TICKS ticks
 *   node src/cli.js once          run exactly one tick
 *
 * @module cli
 */

import { loadConfig } from "./config.js";
import { createAgent } from "./agent.js";
import { createJournal } from "./journal.js";
import { createFixtureSource } from "./discovery/fixtureSource.js";
import { createDexscreenerSource } from "./discovery/dexscreenerSource.js";
import { createPaperExecutor } from "./exec/paperExecutor.js";
import { createDevnetExecutor, devnetHealth } from "./exec/devnetExecutor.js";
import { fmtUsd, hr, paint, renderScores, renderStats } from "./render.js";

/** @param {string[]} argv */
function parseArgs(argv) {
  const command = argv[2] ?? "run";
  const flags = {};
  for (let i = 3; i < argv.length; i += 1) {
    const match = /^--([a-zA-Z0-9-]+)(?:=(.*))?$/.exec(argv[i]);
    if (!match) continue;
    flags[match[1]] = match[2] ?? argv[i + 1] ?? "true";
  }
  return { command, flags };
}

/** @param {ReturnType<typeof loadConfig>} config */
async function buildSource(config) {
  if (config.source === "dexscreener") return createDexscreenerSource(config);
  return createFixtureSource(config.fixturePath);
}

/** @param {ReturnType<typeof loadConfig>} config */
async function buildExecutor(config) {
  if (config.venue === "devnet") return createDevnetExecutor(config);
  return createPaperExecutor(config);
}

/** @param {ReturnType<typeof loadConfig>} config */
async function doctor(config) {
  console.log(paint("bold", "hdog-agent doctor"));
  console.log(`  source           ${config.source}`);
  console.log(`  venue            ${config.venue}`);
  console.log(`  starting cash    ${fmtUsd(config.startingCashUsd)}`);
  console.log(`  max positions    ${config.maxPositions} @ ${config.maxPositionPct * 100}% equity`);
  console.log(`  stop / target    -${config.stopLossPct}% / +${config.takeProfitPct}%`);
  console.log(hr());
  try {
    const health = await devnetHealth(config);
    console.log(paint("green", "  devnet RPC       reachable"));
    console.log(`  rpc              ${health.rpcUrl}`);
    console.log(`  solana-core      ${health.coreVersion}`);
    console.log(`  slot             ${health.slot}`);
    console.log(`  genesis          ${health.genesisHash}`);
    if (health.agent) {
      console.log(`  agent account    ${health.agent.pubkey} (${health.agent.sol} SOL)`);
      console.log(
        health.fundedForTrading
          ? paint("green", "  settlement       funded, devnet fills will be anchored on chain")
          : paint("yellow", "  settlement       NOT funded — airdrop devnet SOL before venue=devnet"),
      );
    } else {
      console.log(paint("yellow", "  agent account    no HDOG_KEYPAIR_PATH set (paper mode only)"));
    }
  } catch (error) {
    console.log(paint("red", `  devnet RPC       unreachable: ${error.message}`));
    return 1;
  }
  return 0;
}

/**
 * @param {ReturnType<typeof loadConfig>} config
 * @param {number} ticks
 */
async function run(baseConfig, ticks) {
  const source = await buildSource(baseConfig);
  // replaying a tape: advance the agent's clock one candle per tick
  const config =
    source.id === "fixture" && baseConfig.clockStepMinutes === 0
      ? Object.freeze({ ...baseConfig, clockStepMinutes: source.tickMinutes })
      : baseConfig;
  const executor = await buildExecutor(config);
  const journal = createJournal(config.journalPath);
  const agent = createAgent({ source, executor, config, journal });

  console.log(paint("bold", "  HACKA DOG AGENT  ·  dog runners only  ·  devnet / paper"));
  console.log(
    `  source=${source.id}  venue=${executor.venue}  bank=${fmtUsd(config.startingCashUsd)}  ticks=${ticks}`,
  );
  console.log(hr());

  for (let i = 0; i < ticks; i += 1) {
    const result = await agent.runTick();
    console.log(
      paint("bold", `\n  tick ${result.tick}/${ticks}`) +
        paint("dim", `   universe ${result.universeSize} dog runners`),
    );
    console.log(renderScores(result.scores, config));
    for (const decision of result.decisions) {
      const tag = decision.action === "BUY" ? paint("green", " BUY ") : paint("red", " SELL");
      const fill = result.fills.find((f) => f.mint === decision.mint && f.side === decision.action);
      const detail = fill
        ? `${fill.qty.toPrecision(6)} @ ${fill.priceUsd.toPrecision(6)} (${fill.slippageBps.toFixed(0)} bps${fill.signature ? `, ${fill.signature.slice(0, 12)}…` : ""})`
        : paint("yellow", result.skipped.find((s) => s.decision.mint === decision.mint)?.error ?? "skipped");
      console.log(`   ${tag} ${decision.symbol.padEnd(10)} ${fmtUsd(decision.notionalUsd).padStart(10)}  ${detail}`);
      console.log(paint("dim", `        ↳ ${decision.reason}`));
    }
    if (result.decisions.length === 0) {
      const open = result.portfolio ? Object.keys(result.portfolio.positions).length : 0;
      console.log(
        paint("dim", `   no action — holding ${open}/${config.maxPositions}, nothing new cleared the gates`),
      );
    }
    console.log(renderStats(agent.stats));
    if (config.tickSeconds > 0 && i < ticks - 1) {
      await new Promise((resolve) => setTimeout(resolve, config.tickSeconds * 1000));
    }
  }

  const closing = await agent.closeAll();
  if (closing.length > 0) {
    console.log(paint("bold", "\n  flatten at end of run"));
    for (const fill of closing) {
      console.log(`   ${paint("red", " SELL")} ${fill.symbol.padEnd(10)} ${fmtUsd(fill.notionalUsd).padStart(10)}`);
    }
  }
  console.log(hr());
  const final = agent.stats;
  const pnl = final.equityUsd - config.startingCashUsd;
  console.log(renderStats(final));
  console.log(
    `  ${paint("bold", "result")}  ${fmtUsd(config.startingCashUsd)} → ${fmtUsd(final.equityUsd)}  ` +
      paint(pnl >= 0 ? "green" : "red", `${pnl >= 0 ? "+" : ""}${fmtUsd(pnl)} (${((pnl / config.startingCashUsd) * 100).toFixed(2)}%)`) +
      paint("dim", `  fees ${fmtUsd(final.feesPaidUsd)}`),
  );
  console.log(paint("dim", `  journal → ${journal.path}`));
  return 0;
}

async function main() {
  const { command, flags } = parseArgs(process.argv);
  const overrides = {};
  if (flags.source) overrides.source = flags.source;
  if (flags.venue) overrides.venue = flags.venue;
  if (flags.ticks) overrides.ticks = Number(flags.ticks);
  if (flags["tick-seconds"]) overrides.tickSeconds = Number(flags["tick-seconds"]);
  const config = loadConfig(process.env, overrides);

  if (command === "doctor") return doctor(config);
  if (command === "once") return run(config, 1);
  if (command === "run") return run(config, config.ticks);
  console.error(`unknown command "${command}" — try: doctor | once | run`);
  return 2;
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((error) => {
    console.error(paint("red", `\n  ${error.message}`));
    process.exit(1);
  });
