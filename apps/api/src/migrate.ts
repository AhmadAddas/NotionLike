import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "./db.js";

const directory = fileURLToPath(new URL("../migrations", import.meta.url));
await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
for (const name of (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort()) {
  const applied = await sql`SELECT 1 FROM schema_migrations WHERE name = ${name}`;
  if (applied.length) continue;
  const contents = await readFile(join(directory, name), "utf8");
  await sql.begin(async (transaction) => {
    await transaction.unsafe(contents);
    await transaction`INSERT INTO schema_migrations (name) VALUES (${name}) ON CONFLICT DO NOTHING`;
  });
  console.log(`Applied ${name}`);
}
await sql.end();

