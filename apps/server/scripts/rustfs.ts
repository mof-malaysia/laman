/**
 * The bundled media store for development and the tests: the same RustFS
 * image compose.yaml pins, run as one container (`laman-rustfs-dev`) on
 * 127.0.0.1:9900 with its own volume. `pnpm dev` and `pnpm test` start it
 * when it isn't running, and replace it when compose.yaml's pin changes.
 * Needs Docker. Skipped when MEDIA_STORE_ENDPOINT points somewhere else.
 *
 *   pnpm --filter @laman/server exec tsx scripts/rustfs.ts
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEV_MEDIA_STORE } from "../src/env.js";

const NAME = "laman-rustfs-dev";
const compose = fileURLToPath(new URL("../../../compose.yaml", import.meta.url));

/** The RustFS image compose.yaml pins: one pin, which Renovate keeps current. */
function pinnedImage() {
  const match = /image:\s*(rustfs\/rustfs:\S+)/.exec(readFileSync(compose, "utf8"));
  if (!match?.[1]) throw new Error(`No rustfs/rustfs image in ${compose}`);
  return match[1];
}

const docker = (...args: string[]) =>
  execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

async function healthy(endpoint: string) {
  try {
    return (await fetch(new URL("/health", endpoint), { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

export async function ensureRustfs() {
  const endpoint = process.env.MEDIA_STORE_ENDPOINT ?? DEV_MEDIA_STORE.MEDIA_STORE_ENDPOINT;
  if (endpoint !== DEV_MEDIA_STORE.MEDIA_STORE_ENDPOINT) return;
  const image = pinnedImage();
  let running: string | undefined;
  try {
    running = docker("inspect", "-f", "{{.Config.Image}} {{.State.Running}}", NAME);
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT")
      throw new Error(
        "Docker isn't installed or isn't on PATH. Laman's media store runs in it in development and the tests (scripts/rustfs.ts).",
        { cause: error },
      );
    // No such container yet.
  }
  if (running && !running.startsWith(`${image} `)) {
    docker("rm", "-f", NAME);
    running = undefined;
  }
  if (running?.endsWith(" true") && (await healthy(endpoint))) return;
  if (running) docker("start", NAME);
  else {
    const port = new URL(endpoint).port;
    docker(
      "run",
      "-d",
      "--name",
      NAME,
      "--restart",
      "unless-stopped",
      "-p",
      `127.0.0.1:${port}:9000`,
      "-v",
      `${NAME}:/data`,
      "-e",
      `RUSTFS_ACCESS_KEY=${DEV_MEDIA_STORE.MEDIA_STORE_ACCESS_KEY_ID}`,
      "-e",
      `RUSTFS_SECRET_KEY=${DEV_MEDIA_STORE.MEDIA_STORE_SECRET_ACCESS_KEY}`,
      image,
    );
  }
  for (let tries = 0; tries < 60; tries++) {
    if (await healthy(endpoint)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${NAME} didn't become healthy at ${endpoint}: see "docker logs ${NAME}"`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (existsSync(".env")) process.loadEnvFile(".env");
  await ensureRustfs().catch((error: unknown) => {
    console.error((error as Error).message);
    process.exit(1);
  });
}
