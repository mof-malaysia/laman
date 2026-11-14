import { describe, expect, it } from "@rstest/core";
import { loadEnv } from "../src/env.js";

describe("SITE_URL", () => {
  it("defaults to this server's address in development", () => {
    expect(loadEnv({}).SITE_URL).toBe("http://localhost:3000");
    expect(loadEnv({ PORT: "4000" }).SITE_URL).toBe("http://localhost:4000");
  });

  it("stays unset elsewhere, and a set one is kept", () => {
    expect(loadEnv({ NODE_ENV: "production" }).SITE_URL).toBeUndefined();
    expect(loadEnv({ NODE_ENV: "test" }).SITE_URL).toBeUndefined();
    expect(loadEnv({ SITE_URL: "https://www.agensi.gov.my" }).SITE_URL).toBe(
      "https://www.agensi.gov.my",
    );
  });
});
