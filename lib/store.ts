import fs from "fs/promises";
import path from "path";
import { ComparisonStore } from "./schema";

/**
 * A JSON file on disk stands in for a real database for this demo. This is
 * a named, deliberate scope cut (see README) -- swapping this module for a
 * Postgres/Mongo-backed implementation would not require touching any
 * extractor, the normalizer, the questionnaire logic, or the agent tools,
 * since all of them only ever import { getStore, saveStore } from here.
 *
 * NOTE for Vercel: serverless functions have an ephemeral, ready-only-ish
 * ./data path in production (writes may not persist across invocations).
 * This works for local dev and for a single request/response demo flow;
 * see README for the swap-in path to Vercel KV / a real DB for production.
 */

const STORE_PATH = path.join(process.cwd(), "data", "store", "comparison-store.json");

export async function getStore(): Promise<ComparisonStore | null> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    return JSON.parse(raw) as ComparisonStore;
  } catch (err: any) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

export async function saveStore(store: ComparisonStore): Promise<void> {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}
