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
  /** Holds the databases and the published site's pages in public/. Media is in the media store. */
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
  /**
   * Public address of the published site, for the sitemap and the admin's
   * "View on site" links. Without it no sitemap is written. In development it
   * defaults to this server's own address (see `loadEnv`).
   */
  SITE_URL: z.url().optional(),
  /**
   * The bundled media store (RustFS in compose.yaml): its address and the keys
   * compose.yaml gives it too. Its buckets are fixed, `laman-media` and
   * `laman-published`, and made on boot when missing. An agency's own
   * provider is set up in Settings → Media storage instead. In development
   * and tests they default to the container `pnpm dev` starts
   * (scripts/rustfs.ts); in production the keys are required.
   */
  MEDIA_STORE_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
  MEDIA_STORE_ACCESS_KEY_ID: z.string().min(3, "Use at least 3 characters").optional(),
  MEDIA_STORE_SECRET_ACCESS_KEY: z.string().min(8, "Use at least 8 characters").optional(),
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

export type Env = z.infer<typeof EnvSchema> & {
  MEDIA_STORE_ENDPOINT: string;
  MEDIA_STORE_ACCESS_KEY_ID: string;
  MEDIA_STORE_SECRET_ACCESS_KEY: string;
};

/** The container `pnpm dev` and the tests use (scripts/rustfs.ts): on this machine only. */
export const DEV_MEDIA_STORE = {
  MEDIA_STORE_ENDPOINT: "http://127.0.0.1:9900",
  MEDIA_STORE_ACCESS_KEY_ID: "laman-dev",
  MEDIA_STORE_SECRET_ACCESS_KEY: "laman-dev-secret",
} as const;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = EnvSchema.safeParse(source);
  const lines = result.success
    ? []
    : result.error.issues.map((issue) => `  ${issue.path.join(".") || "env"}: ${issue.message}`);
  if (result.success && result.data.NODE_ENV === "production")
    for (const name of ["MEDIA_STORE_ACCESS_KEY_ID", "MEDIA_STORE_SECRET_ACCESS_KEY"] as const)
      if (!result.data[name])
        lines.push(`  ${name}: Required: the bundled media store's key (compose.yaml)`);
  if (!result.success || lines.length)
    throw new Error(`Invalid environment variables:\n${lines.join("\n")}`);
  return withDevSiteUrl(withMediaStore(result.data));
}

/** The bundled store's address and keys: in production compose.yaml's, otherwise the dev container's. */
function withMediaStore(env: z.infer<typeof EnvSchema>): Env {
  const dev = env.NODE_ENV !== "production";
  return {
    ...env,
    MEDIA_STORE_ENDPOINT:
      env.MEDIA_STORE_ENDPOINT ??
      (dev ? DEV_MEDIA_STORE.MEDIA_STORE_ENDPOINT : "http://rustfs:9000"),
    MEDIA_STORE_ACCESS_KEY_ID:
      env.MEDIA_STORE_ACCESS_KEY_ID ?? DEV_MEDIA_STORE.MEDIA_STORE_ACCESS_KEY_ID,
    MEDIA_STORE_SECRET_ACCESS_KEY:
      env.MEDIA_STORE_SECRET_ACCESS_KEY ?? DEV_MEDIA_STORE.MEDIA_STORE_SECRET_ACCESS_KEY,
  };
}

/**
 * In development the admin (:3001) and the published site (this server) are
 * on different ports, so a site path alone would open the admin: point at this
 * server instead. Production serves both from one address and sets SITE_URL.
 */
function withDevSiteUrl(env: Env): Env {
  if (env.SITE_URL || env.NODE_ENV !== "development") return env;
  return { ...env, SITE_URL: `http://localhost:${env.PORT}` };
}
