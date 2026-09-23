/**
 * Devnet executor: prices the fill exactly like the paper executor, then
 * anchors it on Solana **devnet** as a real transaction — a small SOL transfer
 * to the settlement account carrying an SPL Memo with the fill record.
 *
 * Be precise about what this is: devnet has no real liquidity for mainnet dog
 * runners, so the *price* comes from live mainnet market data while the
 * *settlement* is a genuine on-chain devnet transaction you can open in an
 * explorer. Nothing here can touch mainnet: config.js allowlists the RPC host
 * (devnet, testnet or a local validator) in every venue, so any other endpoint
 * — including a custom mainnet provider — fails validation before startup.
 *
 * @module exec/devnetExecutor
 */

import { readFile } from "node:fs/promises";
import { priceFill } from "./paperExecutor.js";

/** SPL Memo program, same address on every cluster. */
export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

/** Memo payloads above this are truncated to keep the transaction small. */
const MAX_MEMO_BYTES = 480;

/**
 * Lazily loaded so the rest of the agent runs without the Solana dependency.
 * `deps` exists purely so tests can inject a stubbed module and a stubbed
 * connection — there is no runtime switch, no env var and no way for an
 * operator to swap the real chain out from under the agent.
 *
 * @typedef {{ web3?: object, connection?: object }} Deps
 * @param {Deps} [deps]
 */
async function web3(deps) {
  return deps?.web3 ?? import("@solana/web3.js");
}

/**
 * @param {object} lib
 * @param {{ rpcUrl: string }} config
 * @param {Deps} [deps]
 */
function openConnection(lib, config, deps) {
  return deps?.connection ?? new lib.Connection(config.rpcUrl, "confirmed");
}

/**
 * Load a Solana CLI style keypair file (a JSON array of 64 byte values).
 * @param {string} path
 */
export async function loadKeypair(path, deps) {
  const raw = await readFile(path, "utf8");
  let bytes;
  try {
    bytes = Uint8Array.from(JSON.parse(raw));
  } catch (cause) {
    throw new Error(`keypair at ${path} is not a JSON byte array`, { cause });
  }
  if (bytes.length !== 64) {
    throw new Error(`keypair at ${path} must hold 64 bytes, found ${bytes.length}`);
  }
  const { Keypair } = await web3(deps);
  return Keypair.fromSecretKey(bytes);
}

/**
 * Compact, explorer-readable record of a fill.
 * @param {import("../types.js").Fill} fill
 * @returns {string}
 */
export function buildMemo(fill) {
  const payload = JSON.stringify({
    a: "hdog-agent",
    v: 1,
    s: fill.side,
    sym: fill.symbol,
    mint: fill.mint,
    qty: Number(fill.qty.toPrecision(8)),
    px: Number(fill.priceUsd.toPrecision(8)),
    usd: Number(fill.notionalUsd.toFixed(4)),
    slip: Math.round(fill.slippageBps),
    ts: fill.ts,
    why: fill.reason,
  });
  return payload.length > MAX_MEMO_BYTES ? `${payload.slice(0, MAX_MEMO_BYTES - 1)}}` : payload;
}

/**
 * Ask devnet whether it is reachable and whether the agent account is funded.
 * @param {ReturnType<import("../config.js").loadConfig>} config
 * @param {Deps} [deps]
 */
export async function devnetHealth(config, deps) {
  const lib = await web3(deps);
  const { PublicKey } = lib;
  const connection = openConnection(lib, config, deps);
  const version = await connection.getVersion();
  const slot = await connection.getSlot();
  const result = {
    rpcUrl: config.rpcUrl,
    coreVersion: version["solana-core"],
    slot,
    genesisHash: await connection.getGenesisHash(),
    agent: null,
    fundedForTrading: false,
  };
  if (!config.keypairPath) return result;
  const keypair = await loadKeypair(config.keypairPath, deps);
  const lamports = await connection.getBalance(new PublicKey(keypair.publicKey));
  result.agent = { pubkey: keypair.publicKey.toBase58(), lamports, sol: lamports / 1e9 };
  result.fundedForTrading = lamports > config.settlementLamports * 4;
  return result;
}

/**
 * Build a devnet executor.
 * @param {ReturnType<import("../config.js").loadConfig>} config
 * @param {() => Date} [clock]
 * @param {Deps} [deps]
 * @returns {Promise<import("../types.js").Executor>}
 */
export async function createDevnetExecutor(config, clock = () => new Date(), deps) {
  if (!config.keypairPath) throw new Error("HDOG_KEYPAIR_PATH is required for venue=devnet");
  if (!config.settlementPubkey) {
    throw new Error("HDOG_SETTLEMENT_PUBKEY is required for venue=devnet");
  }
  const lib = await web3(deps);
  const { PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } = lib;
  const connection = openConnection(lib, config, deps);
  const payer = await loadKeypair(config.keypairPath, deps);
  const settlement = new PublicKey(config.settlementPubkey);

  return {
    venue: "devnet",
    async execute(decision, quote, now) {
      const fill = priceFill(decision, quote, config, now ?? clock(), "devnet");
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: settlement,
          lamports: config.settlementLamports,
        }),
        new TransactionInstruction({
          keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: false }],
          programId: new PublicKey(MEMO_PROGRAM_ID),
          data: Buffer.from(buildMemo(fill), "utf8"),
        }),
      );
      const signature = await sendAndConfirmTransaction(connection, transaction, [payer], {
        commitment: "confirmed",
      });
      return Object.freeze({ ...fill, signature });
    },
  };
}
