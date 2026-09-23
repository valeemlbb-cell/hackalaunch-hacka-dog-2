/**
 * The on-chain settlement path, exercised end to end against a stubbed
 * @solana/web3.js. Nothing here touches a network: the stub records what the
 * executor *would* send, and the assertions pin the exact transaction shape —
 * one transfer to the settlement account, one memo, one signer.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createDevnetExecutor,
  devnetHealth,
  loadKeypair,
  MEMO_PROGRAM_ID,
} from "../src/exec/devnetExecutor.js";
import { quote, testConfig } from "./helpers.js";

const AGENT_PUBKEY = "AgentPubkey11111111111111111111111111111111";
const SETTLEMENT_PUBKEY = "SettlePubkey1111111111111111111111111111111";
const SIGNATURE = "5SigStub1111111111111111111111111111111111111111111111111111111111";

/** A throwaway 64 byte keypair file, the shape `solana-keygen` writes. */
function writeKeypairFile(bytes = new Array(64).fill(7)) {
  const dir = mkdtempSync(join(tmpdir(), "hdog-key-"));
  const path = join(dir, "devnet-agent.json");
  writeFileSync(path, JSON.stringify(bytes));
  return path;
}

class StubPublicKey {
  constructor(value) {
    this.value = typeof value === "string" ? value : value.value;
  }
  toBase58() {
    return this.value;
  }
}

class StubTransaction {
  constructor() {
    this.instructions = [];
  }
  add(...instructions) {
    this.instructions.push(...instructions);
    return this;
  }
}

class StubTransactionInstruction {
  constructor(options) {
    Object.assign(this, options);
  }
}

/**
 * @param {{ lamports?: number, health?: object, send?: Function }} [options]
 */
function stubWeb3(options = {}) {
  const sent = [];
  const stub = {
    sent,
    connections: [],
    PublicKey: StubPublicKey,
    Transaction: StubTransaction,
    TransactionInstruction: StubTransactionInstruction,
    SystemProgram: {
      transfer: (params) => ({ kind: "transfer", ...params }),
    },
    Keypair: {
      fromSecretKey(secretKey) {
        return { secretKey, publicKey: new StubPublicKey(AGENT_PUBKEY) };
      },
    },
    Connection: class {
      constructor(url, commitment) {
        this.url = url;
        this.commitment = commitment;
        stub.connections.push(this);
      }
      async getVersion() {
        return { "solana-core": "2.0.21" };
      }
      async getSlot() {
        return 404_040;
      }
      async getGenesisHash() {
        return "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
      }
      async getBalance() {
        return options.lamports ?? 1_000_000;
      }
    },
    async sendAndConfirmTransaction(connection, transaction, signers, opts) {
      sent.push({ connection, transaction, signers, opts });
      if (options.send) return options.send();
      return SIGNATURE;
    },
  };
  return stub;
}

const decision = Object.freeze({
  action: "BUY",
  mint: "MintDog1111111111111111111111111111111111",
  symbol: "HDOG",
  notionalUsd: 200,
  score: 71,
  reason: "runner score 71",
});

async function buildExecutor(patch = {}) {
  const web3 = stubWeb3(patch.stub);
  const config = testConfig({
    venue: "devnet",
    keypairPath: writeKeypairFile(),
    settlementPubkey: SETTLEMENT_PUBKEY,
    settlementLamports: 5_000,
    ...patch.config,
  });
  const executor = await createDevnetExecutor(config, () => new Date("2026-09-24T00:00:00.000Z"), { web3 });
  return { web3, config, executor };
}

test("the devnet executor opens a connection on the validated RPC url", async () => {
  const { web3, config } = await buildExecutor();
  assert.equal(web3.connections.length, 1);
  assert.equal(web3.connections[0].url, config.rpcUrl);
  assert.equal(web3.connections[0].commitment, "confirmed");
});

test("a devnet fill transfers exactly settlementLamports to the settlement account", async () => {
  const { web3, executor } = await buildExecutor();
  await executor.execute(decision, quote({ priceUsd: 2, liquidityUsd: 200_000 }));
  const transfer = web3.sent[0].transaction.instructions.find((ix) => ix.kind === "transfer");
  assert.ok(transfer, "a SOL transfer instruction is present");
  assert.equal(transfer.toPubkey.toBase58(), SETTLEMENT_PUBKEY);
  assert.equal(transfer.fromPubkey.toBase58(), AGENT_PUBKEY);
  assert.equal(transfer.lamports, 5_000);
});

test("the memo instruction carries the fill record to the canonical memo program", async () => {
  const { web3, executor } = await buildExecutor();
  const fill = await executor.execute(decision, quote({ priceUsd: 2, liquidityUsd: 200_000 }));
  const memo = web3.sent[0].transaction.instructions.find((ix) => ix instanceof StubTransactionInstruction);
  assert.equal(memo.programId.toBase58(), MEMO_PROGRAM_ID);
  const parsed = JSON.parse(memo.data.toString("utf8"));
  assert.equal(parsed.a, "hdog-agent");
  assert.equal(parsed.s, "BUY");
  assert.equal(parsed.sym, "HDOG");
  assert.equal(parsed.mint, decision.mint);
  assert.equal(parsed.px, Number(fill.priceUsd.toPrecision(8)));
  assert.equal(parsed.ts, "2026-09-24T00:00:00.000Z");
});

test("the payer is the only signer and the only writable memo key", async () => {
  const { web3, executor } = await buildExecutor();
  await executor.execute(decision, quote());
  const { signers, transaction, opts } = web3.sent[0];
  assert.equal(signers.length, 1);
  assert.equal(signers[0].publicKey.toBase58(), AGENT_PUBKEY);
  assert.equal(opts.commitment, "confirmed");
  const memo = transaction.instructions.find((ix) => ix instanceof StubTransactionInstruction);
  assert.deepEqual(
    memo.keys.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable]),
    [[AGENT_PUBKEY, true, false]],
  );
});

test("the returned fill carries the confirmed signature and is frozen", async () => {
  const { executor } = await buildExecutor();
  const fill = await executor.execute(decision, quote({ priceUsd: 2, liquidityUsd: 200_000 }));
  assert.equal(fill.signature, SIGNATURE);
  assert.equal(fill.venue, "devnet");
  assert.equal(fill.side, "BUY");
  assert.ok(Object.isFrozen(fill));
});

test("a send failure propagates instead of reporting a phantom fill", async () => {
  const { executor } = await buildExecutor({
    stub: {
      send: () => {
        throw new Error("blockhash not found");
      },
    },
  });
  await assert.rejects(() => executor.execute(decision, quote()), /blockhash not found/);
});

test("the executor refuses to exist without a keypair or a settlement account", async () => {
  const web3 = stubWeb3();
  await assert.rejects(
    () => createDevnetExecutor(testConfig({ keypairPath: "", settlementPubkey: "x" }), undefined, { web3 }),
    /HDOG_KEYPAIR_PATH/,
  );
  await assert.rejects(
    () =>
      createDevnetExecutor(testConfig({ keypairPath: writeKeypairFile(), settlementPubkey: "" }), undefined, {
        web3,
      }),
    /HDOG_SETTLEMENT_PUBKEY/,
  );
});

test("devnetHealth reports cluster identity without a keypair", async () => {
  const web3 = stubWeb3();
  const config = testConfig();
  const health = await devnetHealth(config, { web3 });
  assert.equal(health.rpcUrl, config.rpcUrl);
  assert.equal(health.coreVersion, "2.0.21");
  assert.equal(health.slot, 404_040);
  assert.equal(health.genesisHash, "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG");
  assert.equal(health.agent, null);
  assert.equal(health.fundedForTrading, false);
});

test("devnetHealth reports the agent balance and whether it can settle", async () => {
  const funded = await devnetHealth(testConfig({ keypairPath: writeKeypairFile(), settlementLamports: 5_000 }), {
    web3: stubWeb3({ lamports: 1_000_000_000 }),
  });
  assert.equal(funded.agent.pubkey, AGENT_PUBKEY);
  assert.equal(funded.agent.lamports, 1_000_000_000);
  assert.equal(funded.agent.sol, 1);
  assert.equal(funded.fundedForTrading, true);

  const broke = await devnetHealth(testConfig({ keypairPath: writeKeypairFile(), settlementLamports: 5_000 }), {
    web3: stubWeb3({ lamports: 10_000 }),
  });
  assert.equal(broke.fundedForTrading, false, "10k lamports cannot cover four 5k settlements");
});

test("a keypair file that is not 64 bytes is rejected before any transaction", async () => {
  const short = writeKeypairFile(new Array(32).fill(1));
  await assert.rejects(() => loadKeypair(short, { web3: stubWeb3() }), /must hold 64 bytes, found 32/);
});

test("a keypair file that is not a JSON byte array fails loudly", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hdog-key-"));
  const path = join(dir, "bad.json");
  writeFileSync(path, "not json at all");
  await assert.rejects(() => loadKeypair(path, { web3: stubWeb3() }), /is not a JSON byte array/);
});
