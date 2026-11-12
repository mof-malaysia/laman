#!/usr/bin/env node
/**
 * site-builder <command>. The same code the server runs.
 *
 *   migrate   create or upgrade data/site.db (and add the starter home page)
 *   publish   rebuild data/public from the published revisions: only what
 *             changed since the last publish, or everything with --full
 *   check     parse every stored document against this version's schemas,
 *             without changing anything
 *   users     list the accounts
 *   reset-password <username>
 *             print a one-time link to choose a new password (24 hours)
 *   clear-2fa <username>
 *             clear two-factor, for a lost phone; signs them out everywhere
 *   backup [--db-only] [--with-analytics]
 *             write an archive to BACKUP_DIR now (safe while the server runs)
 *   backup --verify <archive>
 *             check an archive restores, without touching the site
 *   backups [--remote]
 *             list the archives in BACKUP_DIR, or the copies off-site
 *   fetch <archive>
 *             download an off-site copy into BACKUP_DIR, decrypted, ready
 *             to restore (needs site.db's off-site settings and
 *             BACKUP_SECRET_KEY, or BACKUP_PASSPHRASE for encrypted copies)
 *   decrypt <file.tar.gz.enc>
 *             decrypt a copy downloaded some other way into BACKUP_DIR, with
 *             BACKUP_PASSPHRASE
 *   restore <archive>
 *             put an archive back, with the server stopped; what it replaces
 *             is kept in DATA_DIR/before-restore-<time>/
 */
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { seedIfEmpty } from "./content/seed.js";
import { audit } from "./auth/audit.js";
import { people, userByUsername } from "./auth/users.js";
import {
  backupDirOf,
  listBackups,
  makeBackup,
  restoreBackup,
  retentionOf,
  verifyBackup,
} from "./backup.js";
import { checkStoredDocuments, describeProblems } from "./db/documents.js";
import { type Db, migrationState, openDatabase, openSqlite } from "./db/index.js";
import type { Database } from "./db/schema.js";
import { loadEnv } from "./env.js";
import { publishSite } from "./publisher.js";
import { ENCRYPTED, decryptFile, isEncrypted } from "./offsite/crypt.js";
import {
  fetchRemote,
  listRemote,
  passphraseOf,
  readOffsite,
  storeConfig,
  storeFor,
} from "./offsite/index.js";
import { clearTwoFactor, makeLink } from "./routes/users.js";

if (existsSync(".env")) process.loadEnvFile(".env");
const env = loadEnv();
const dataDir = resolve(env.DATA_DIR);
const [command, ...flags] = process.argv.slice(2);

if (command === "check") process.exit(await check(join(dataDir, "site.db")));
// Without opening the database here: backups read it as it is, and a restore replaces it.
const backupDir = backupDirOf(env);
const backupCommands: Record<string, () => Promise<void>> = {
  backup: () => (flags.includes("--verify") ? verify() : backUp()),
  backups: () => (flags.includes("--remote") ? listRemoteArchives() : listArchives()),
  fetch,
  decrypt,
  restore,
};
if (command && command in backupCommands)
  process.exit(
    await backupCommands[command]!().then(
      () => 0,
      (error: unknown) => {
        console.error((error as Error).message);
        return 1;
      },
    ),
  );

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
    case "users":
      for (const user of await people(db).orderBy("username").execute())
        console.warn(
          `${user.username.padEnd(32)} ${user.role.padEnd(15)} ${user.totp_enrolled_at ? "2FA" : "   "} ${user.disabled_at ? "disabled" : ""}`,
        );
      break;
    case "reset-password":
    case "clear-2fa": {
      const user = flags[0] ? await userByUsername(db, flags[0].toLowerCase()) : undefined;
      if (!user) {
        console.error(
          `No account named ${flags[0] ?? "(none given)"}. "site-builder users" lists them.`,
        );
        process.exitCode = 1;
        break;
      }
      if (command === "clear-2fa") {
        await clearTwoFactor(db, user.id);
        await audit(db, {
          userId: null,
          action: "twoFactorCleared",
          target: user.id,
          detail: { cli: true },
        });
        console.warn(`Cleared two-factor for ${user.username}, and signed them out everywhere.`);
      } else {
        const link = await makeLink(db, { kind: "reset", userId: user.id, by: null });
        await audit(db, {
          userId: null,
          action: "resetLinkMade",
          target: user.id,
          detail: { cli: true },
        });
        console.warn(
          `Reset link for ${user.username}, good until ${link.expiresAt}. Open it on the builder's address:\n\n  ${link.path}\n`,
        );
      }
      break;
    }
    default:
      console.error(
        "Usage: site-builder <migrate|publish [--full]|check|users|reset-password <username>|clear-2fa <username>|backup [--db-only] [--with-analytics]|backup --verify <archive>|backups [--remote]|fetch <archive>|decrypt <file>|restore <archive>>",
      );
      process.exitCode = 2;
  }
} finally {
  await db.destroy();
}

/** Read-only: opens the database without migrating it. */
async function check(path: string) {
  if (!existsSync(path)) {
    console.error(`No database at ${path}`);
    return 1;
  }
  const { db: site } = openSqlite<unknown>(path);
  try {
    const { pending } = await migrationState(site);
    if (pending.length) {
      console.error(
        `${path} has ${pending.length} migrations to run: start the server or run "site-builder migrate"`,
      );
      return 1;
    }
    const result = await checkStoredDocuments(site);
    if (!result.failed) {
      console.warn(`All ${result.checked} stored documents match this version's schemas`);
      return 0;
    }
    console.error(
      `${result.failed} of ${result.checked} stored documents don't match this version's schemas:`,
    );
    console.error(describeProblems(result));
    return 1;
  } finally {
    await site.destroy();
  }
}

function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function backUp() {
  const made = await makeBackup({
    dataDir,
    backupDir,
    keep: retentionOf(env),
    dbOnly: flags.includes("--db-only"),
    withAnalytics: flags.includes("--with-analytics"),
  });
  console.warn(`Backed up to ${made.file} (${mb(made.bytes)})`);
  for (const folder of made.manifest.missing)
    console.warn(`  Not on disk, so not backed up: ${folder}`);
  if (made.deleted.length) console.warn(`Deleted ${made.deleted.length} older backups`);
}

async function listArchives() {
  const list = await listBackups(backupDir);
  if (!list.length) console.warn(`No backups in ${backupDir}`);
  for (const backup of list)
    console.warn(
      `${backup.file.padEnd(52)} ${mb(backup.bytes).padStart(10)}${backup.dbOnly ? "  database only" : ""}`,
    );
}

/** The archive named on the command line: a path, or the name of one in BACKUP_DIR. */
function archiveArg() {
  const archive = flags.find((flag) => !flag.startsWith("--"));
  if (!archive) throw new Error(`Name the archive: "site-builder backups" lists them.`);
  return existsSync(archive) ? archive : join(backupDir, basename(archive));
}

async function verify() {
  const file = archiveArg();
  const manifest = await verifyBackup(file, dataDir);
  console.warn(
    `${file} is good: made ${manifest.createdAt} by ${manifest.version}, ${manifest.counts.pages} pages, ${manifest.counts.media} files, ${manifest.counts.users} accounts${manifest.dbOnly ? " (database only)" : ""}`,
  );
}

async function restore() {
  const archive = archiveArg();
  if (existsSync(archive) && (await isEncrypted(archive)))
    throw new Error(
      `${archive} is encrypted. Decrypt it first: BACKUP_PASSPHRASE=… site-builder decrypt ${basename(archive)}`,
    );
  const { manifest, aside } = await restoreBackup(archive, dataDir);
  console.warn(
    `Restored the backup from ${manifest.createdAt}. Everyone is signed out, and a full publish runs when the server starts.\nWhat it replaced is in ${aside}: delete it once you're happy.`,
  );
}

/** The off-site settings in site.db, read without migrating it, and a store made from them. */
async function offsite() {
  const path = join(dataDir, "site.db");
  if (!existsSync(path))
    throw new Error(
      `No database at ${path}, so no off-site settings to read. Download the copy with the provider's own tools, then "site-builder decrypt" it if it ends in ${ENCRYPTED}.`,
    );
  const { db: site } = openSqlite<Database>(path);
  try {
    const stored = await readOffsite(site as Db);
    if (!stored.enabled) throw new Error("Off-site copies aren't set up (Settings → Backups).");
    return { stored, store: storeFor(storeConfig(stored, env.BACKUP_SECRET_KEY)) };
  } finally {
    await site.destroy();
  }
}

async function listRemoteArchives() {
  const { stored, store } = await offsite();
  const list = await listRemote(store, stored.prefix);
  if (!list.length) console.warn(`No copies in ${stored.bucket}`);
  for (const copy of list)
    console.warn(
      `${copy.file.padEnd(52)} ${mb(copy.bytes).padStart(10)}  ${copy.folder.padEnd(8)}${copy.encrypted ? "  encrypted" : ""}${copy.dbOnly ? "  database only" : ""}`,
    );
}

async function fetch() {
  const name = flags.find((flag) => !flag.startsWith("--"));
  if (!name) throw new Error(`Name the copy: "site-builder backups --remote" lists them.`);
  const { stored, store } = await offsite();
  const wanted = basename(name).replace(/\.enc$/, "");
  const copy = (await listRemote(store, stored.prefix)).find((c) => c.file === wanted);
  if (!copy)
    throw new Error(
      `No copy named ${wanted} off-site: "site-builder backups --remote" lists them.`,
    );
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  // The archive is checked in a scratch folder there: on a new server it may not exist yet.
  await mkdir(dataDir, { recursive: true });
  const file = await fetchRemote(store, copy, backupDir, () =>
    passphraseOf(stored, env.BACKUP_SECRET_KEY, env.BACKUP_PASSPHRASE),
  );
  const manifest = await verifyBackup(file, dataDir);
  console.warn(
    `Fetched ${file}, made ${manifest.createdAt}, and checked it. Restore it with the server stopped:\n\n  site-builder restore ${basename(file)}\n`,
  );
}

async function decrypt() {
  const from = flags.find((flag) => !flag.startsWith("--"));
  if (!from || !existsSync(from)) throw new Error("Name the encrypted file to decrypt.");
  if (!env.BACKUP_PASSPHRASE)
    throw new Error("Set BACKUP_PASSPHRASE to the passphrase it was encrypted with.");
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  // The archive is checked in a scratch folder there: on a new server it may not exist yet.
  await mkdir(dataDir, { recursive: true });
  const to = join(backupDir, basename(from).replace(/\.enc$/, ""));
  if (to === resolve(from)) throw new Error(`${from} doesn't end in ${ENCRYPTED}`);
  await decryptFile(from, to, env.BACKUP_PASSPHRASE);
  const manifest = await verifyBackup(to, dataDir);
  console.warn(`Decrypted to ${to}, made ${manifest.createdAt}, and checked it.`);
}
