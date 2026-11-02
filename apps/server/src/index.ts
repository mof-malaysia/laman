import { existsSync } from "node:fs";
import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";

// Local development reads .env; deployments set real environment variables.
if (existsSync(".env")) process.loadEnvFile(".env");

const env = loadEnv();
const app = await buildApp({ env });

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
