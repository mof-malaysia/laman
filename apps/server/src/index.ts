import { existsSync } from "node:fs";
import { buildApp } from "./app.js";
import { holdServerLock } from "./backup.js";
import { loadEnv } from "./env.js";

// Local development reads .env; deployments set real environment variables.
if (existsSync(".env")) process.loadEnvFile(".env");

const env = loadEnv();
// Before the database opens, so a restore can't start under a server that's booting.
const releaseLock = await holdServerLock(env.DATA_DIR);
const app = await buildApp({ env });
app.addHook("onClose", releaseLock);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, "shutting down");
    app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error({ err: error }, "shutdown failed");
        process.exit(1);
      },
    );
  });
}

await app.listen({ host: env.HOST, port: env.PORT });
