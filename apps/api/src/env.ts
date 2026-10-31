/**
 * Every setting the api reads, validated once at boot. A bad value stops the
 * process with a message naming the variable, instead of failing later.
 */
import * as v from "valibot";

const Port = v.pipe(v.string(), v.toNumber(), v.integer(), v.minValue(1), v.maxValue(65535));

const EnvSchema = v.object({
  NODE_ENV: v.optional(v.picklist(["development", "production", "test"]), "development"),
  HOST: v.optional(v.string(), "127.0.0.1"),
  PORT: v.optional(Port, "3000"),
  LOG_LEVEL: v.optional(
    v.picklist(["fatal", "error", "warn", "info", "debug", "trace", "silent"]),
    "info",
  ),
  CORS_ORIGIN: v.optional(v.string()),
  /** Folder with the built SPA; the Docker image sets it. */
  WEB_DIST: v.optional(v.string()),
});

export type Env = v.InferOutput<typeof EnvSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = v.safeParse(EnvSchema, source);
  if (result.success) return result.output;
  const lines = result.issues.map((issue) => `  ${v.getDotPath(issue) ?? "env"}: ${issue.message}`);
  throw new Error(`Invalid environment variables:\n${lines.join("\n")}`);
}
