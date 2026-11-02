#!/usr/bin/env node
/**
 * site-builder <command>. The same code the server runs.
 *
 *   migrate   create or upgrade data/site.db (and add the starter home page)
 *   publish   rebuild data/public from the published revisions: only what
 *             changed since the last publish, or everything with --full
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { seedIfEmpty } from "./content/seed.js";
import { openDatabase } from "./db/index.js";
import { loadEnv } from "./env.js";
import { publishSite } from "./publisher.js";

if (existsSync(".env")) process.loadEnvFile(".env");
const env = loadEnv();
const dataDir = resolve(env.DATA_DIR);
const [command, ...flags] = process.argv.slice(2);

const db = await openDatabase(join(dataDir, "site.db"));
try {
  switch (command) {
    case "migrate":
      await seedIfEmpty(db);
      console.warn(`Database ready at ${join(dataDir, "site.db")}`);
      break;
    case "publish": {
      const full = flags.includes("--full");
      const { counts } = await publishSite({ db, dataDir, siteUrl: env.SITE_URL, full });
      console.warn(
        `Published ${counts.pages} pages to ${join(dataDir, "public")}: ${counts.written} addresses written, ${counts.unchanged} unchanged`,
      );
      break;
    }
    default:
      console.error("Usage: site-builder <migrate|publish [--full]>");
      process.exitCode = 2;
  }
} finally {
  await db.destroy();
}
