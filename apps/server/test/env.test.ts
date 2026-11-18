import { describe, expect, it } from "@rstest/core";
import { loadEnv } from "../src/env.js";

const storeKeys = {
  MEDIA_STORE_ACCESS_KEY_ID: "laman",
  MEDIA_STORE_SECRET_ACCESS_KEY: "a-long-secret",
};

describe("SITE_URL", () => {
  it("defaults to this server's address in development", () => {
    expect(loadEnv({}).SITE_URL).toBe("http://localhost:3000");
    expect(loadEnv({ PORT: "4000" }).SITE_URL).toBe("http://localhost:4000");
  });

  it("stays unset elsewhere, and a set one is kept", () => {
    expect(loadEnv({ NODE_ENV: "production", ...storeKeys }).SITE_URL).toBeUndefined();
    expect(loadEnv({ NODE_ENV: "test" }).SITE_URL).toBeUndefined();
    expect(loadEnv({ SITE_URL: "https://www.agensi.gov.my" }).SITE_URL).toBe(
      "https://www.agensi.gov.my",
    );
  });
});

describe("the bundled media store", () => {
  it("is compose.yaml's rustfs in production, and needs its keys", () => {
    expect(() => loadEnv({ NODE_ENV: "production" })).toThrow(/MEDIA_STORE_SECRET_ACCESS_KEY/);
    expect(loadEnv({ NODE_ENV: "production", ...storeKeys })).toMatchObject({
      MEDIA_STORE_ENDPOINT: "http://rustfs:9000",
      MEDIA_STORE_ACCESS_KEY_ID: "laman",
    });
  });

  it("is the dev container in development and tests", () => {
    expect(loadEnv({}).MEDIA_STORE_ENDPOINT).toBe("http://127.0.0.1:9900");
    expect(loadEnv({ NODE_ENV: "test" }).MEDIA_STORE_ACCESS_KEY_ID).toBe("laman-dev");
  });
});
