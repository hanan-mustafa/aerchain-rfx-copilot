import fs from "fs/promises";
import os from "os";
import path from "path";
import { ComparisonStore } from "./schema";

/**
 * A JSON file on disk stands in for a real database for this demo. This is
 * a named, deliberate scope cut (see README) -- swapping this module for a
 * Postgres/Mongo-backed implementation would not require touching any
 * extractor, the normalizer, the questionnaire logic, or the agent tools,
 * since all of them only ever import { getStore, saveStore } from here.
 *
 * Vercel: the deployment filesystem is read-only except os.tmpdir(), and
 * /tmp is per-instance and ephemeral -- a store written by the extract
 * request may not be visible to the next chat request if it lands on
 * another instance. So reads fall back to a committed snapshot of a
 * validated extraction run (data/seed/comparison-store.json): the demo
 * always has a store to show and chat over, and "Run extraction" still
 * runs the full pipeline live and serves its result wherever /tmp has it.
 */

const RUNTIME_STORE_PATH = process.env.VERCEL
  ? path.join(os.tmpdir(), "comparison-store.json")
  : path.join(process.cwd(), "data", "store", "comparison-store.json");

const SEED_STORE_PATH = path.join(process.cwd(), "data", "seed", "comparison-store.json");

async function readStoreFile(filePath: string): Promise<ComparisonStore | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as ComparisonStore;
  } catch (err: any) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

export async function getStore(): Promise<ComparisonStore | null> {
  return (await readStoreFile(RUNTIME_STORE_PATH)) ?? (await readStoreFile(SEED_STORE_PATH));
}

export async function saveStore(store: ComparisonStore): Promise<void> {
  await fs.mkdir(path.dirname(RUNTIME_STORE_PATH), { recursive: true });
  await fs.writeFile(RUNTIME_STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}
