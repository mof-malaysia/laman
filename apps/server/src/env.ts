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
  /** Folder with the built admin app, served at /admin. */
  ADMIN_DIST: z.string().default("../admin/dist"),
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
