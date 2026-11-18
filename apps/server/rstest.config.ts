import { defineConfig } from "@rstest/core";

export default defineConfig({
  // The media store the tests run against: the dev RustFS container, started when it isn't running.
  globalSetup: ["./test/global-setup.ts"],
  // A site's first publish renders it cold while every file's tests run at once.
  testTimeout: 15_000,
});
