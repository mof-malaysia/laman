/**
 * Every setting the server reads, validated once at boot. A bad value stops
 * the process with a message naming the variable, instead of failing later.
 */
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  CORS_ORIGIN: z.string().optional(),
  /** Holds all state: site.db, media/ and the published site in public/. */
  DATA_DIR: z.string().default("./data"),
  /**
   * Where backup archives go. Defaults to DATA_DIR/backups, on the site's own
   * disk: set it to a separate mount, and copy it off the machine.
   */
  BACKUP_DIR: z.string().optional(),
  /** The daily backup's Malaysian time, `HH:MM`, or `off`. */
  BACKUP_SCHEDULE: z
    .string()
    .regex(/^(off|([01]\d|2[0-3]):[0-5]\d)$/, "Use a time like 02:00, or off")
    .default("02:00"),
  /** Archives kept: the newest of each of this many days, and of this many weeks. */
  BACKUP_KEEP_DAILY: z.coerce.number().int().min(1).max(366).default(7),
  BACKUP_KEEP_WEEKLY: z.coerce.number().int().min(0).max(520).default(4),
  /**
   * Seals the off-site storage's secret key and the encryption passphrase in
   * site.db (Settings → Backups). Without it, off-site copies can't be set
   * up. Keep it outside the server's backups: a restored site needs the same
   * one, or the secrets are entered again.
   */
  BACKUP_SECRET_KEY: z.string().min(32, "Use at least 32 characters").optional(),
  /** For the CLI: the passphrase that opens encrypted off-site copies, when site.db doesn't have it. */
  BACKUP_PASSPHRASE: z.string().optional(),
  /** Folder with the built admin app, served at /admin. */
  ADMIN_DIST: z.string().default("../admin/dist"),
  /**
   * The builder's own public address ("https://builder.agensi.gov.my"), which
   * agents sign in against (docs/mcp.md). Without it, each request's own
   * address is used, which behind a proxy needs TRUST_PROXY to be right.
   */
  BUILDER_URL: z
    .url()
    .optional()
    .transform((url) => url?.replace(/\/+$/, "")),
  /** Public address of the published site, for the sitemap. Without it no sitemap is written. */
  SITE_URL: z.url().optional(),
  /** Largest file the media library accepts, in megabytes. */
  MEDIA_MAX_MB: z.coerce.number().positive().max(200).default(10),
  /**
   * The reverse proxies to believe about the visitor's address (X-Forwarded-For):
   * "true", a hop count, or addresses and CIDRs separated by commas.
   */
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((value): boolean | number | string[] => {
      const v = value?.trim();
      if (!v || v === "false") return false;
      if (v === "true") return true;
      if (/^\d+$/.test(v)) return Number(v);
      return v.split(",").map((s) => s.trim());
    }),
  /** A MaxMind-format country database (DB-IP Lite Country, GeoLite2 Country) for analytics. */
  GEOIP_DB: z.string().optional(),
  /**
   * The first account, created on a boot where there's no super admin yet,
   * then ignored: its password must be changed at first sign-in.
   */
  SUPER_ADMIN_USERNAME: z.string().optional(),
  SUPER_ADMIN_PASSWORD: z.string().min(12, "Use at least 12 characters").optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (result.success) return result.data;
  const lines = result.error.issues.map(
    (issue) => `  ${issue.path.join(".") || "env"}: ${issue.message}`,
  );
  throw new Error(`Invalid environment variables:\n${lines.join("\n")}`);
}
