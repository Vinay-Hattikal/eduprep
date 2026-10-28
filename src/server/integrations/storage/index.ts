// File storage behind one interface (D-008). Local disk now; Cloudflare R2 in Phase 6.
// Callers never touch the filesystem or an SDK directly (rules.md: external services).

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface Storage {
  put(key: string, data: Uint8Array): Promise<void>;
  /** The file's bytes, or null when it doesn't exist. */
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

const VALID_KEY = /^[a-z0-9][a-z0-9/._-]*$/i;

export function assertValidKey(key: string): void {
  if (!VALID_KEY.test(key) || key.includes("..") || key.includes("//")) {
    throw new Error(`Invalid storage key: ${key}`);
  }
}

export function createLocalStorage(root: string): Storage {
  const resolve = (key: string) => {
    assertValidKey(key);
    return path.join(root, ...key.split("/"));
  };

  return {
    async put(key, data) {
      const file = resolve(key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, data);
    },
    async get(key) {
      try {
        return await readFile(resolve(key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async delete(key) {
      await rm(resolve(key), { force: true });
    },
  };
}

// Runtime data folder, not source: tell the bundler not to trace it into the server output.
const root = process.env.STORAGE_DIR
  ? path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR)
  : path.join(/*turbopackIgnore: true*/ process.cwd(), ".data", "storage");

export const storage: Storage = createLocalStorage(root);
