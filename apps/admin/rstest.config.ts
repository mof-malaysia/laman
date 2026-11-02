import { withRsbuildConfig } from "@rstest/adapter-rsbuild";
import { defineConfig } from "@rstest/core";

// Tests reuse rsbuild.config.ts, so the "@/" alias and React transform match the
// app. A browser target means tests run in happy-dom.
export default defineConfig({
  extends: withRsbuildConfig(),
});
