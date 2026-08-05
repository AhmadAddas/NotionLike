import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import type { Page } from "@notionlike/contracts";

const database = SQLite.openDatabaseSync("notionlike.db");
database.execSync(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS page_cache (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS mutation_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, method TEXT NOT NULL, path TEXT NOT NULL, body TEXT, created_at TEXT NOT NULL);
`);

export const credentials = {
  async load() { return { serverUrl: await SecureStore.getItemAsync("serverUrl"), token: await SecureStore.getItemAsync("token") }; },
  async save(serverUrl: string, token: string) { await SecureStore.setItemAsync("serverUrl", serverUrl); await SecureStore.setItemAsync("token", token); },
  async clear() { await Promise.all([SecureStore.deleteItemAsync("token"), SecureStore.deleteItemAsync("serverUrl")]); },
};

export function cachePages(workspaceId: string, pages: Page[]) {
  database.withTransactionSync(() => {
    for (const page of pages) database.runSync("INSERT OR REPLACE INTO page_cache (id, workspace_id, payload, updated_at) VALUES (?, ?, ?, ?)", page.id, workspaceId, JSON.stringify(page), new Date().toISOString());
  });
}
export function cachedPages(workspaceId: string): Page[] {
  return database.getAllSync<{ payload: string }>("SELECT payload FROM page_cache WHERE workspace_id = ? ORDER BY updated_at DESC", workspaceId).map((row) => JSON.parse(row.payload) as Page);
}
export function enqueue(method: string, path: string, body?: unknown) {
  database.runSync("INSERT INTO mutation_outbox (method, path, body, created_at) VALUES (?, ?, ?, ?)", method, path, body ? JSON.stringify(body) : null, new Date().toISOString());
}
export async function flushOutbox(api: (path: string, init?: RequestInit) => Promise<unknown>) {
  const rows = database.getAllSync<{ id: number; method: string; path: string; body: string | null }>("SELECT id, method, path, body FROM mutation_outbox ORDER BY id");
  for (const row of rows) { await api(row.path, { method: row.method, body: row.body ?? undefined }); database.runSync("DELETE FROM mutation_outbox WHERE id = ?", row.id); }
}

