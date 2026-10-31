import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/env.js";

const env = loadEnv({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
});
let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  app = await buildApp({ env });
});
afterAll(() => app.close());

describe("api", () => {
  it("answers the ready check", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("validates and transforms the query with Valibot", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/hello?name=%20Aisyah%20",
    });
    expect(res.json()).toEqual({ data: { message: "Hello, Aisyah!" } });
  });

  it("rejects an invalid query with the standard error shape", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/hello?name=${"x".repeat(101)}`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("validation_error");
  });

  it("returns the standard error shape for unknown routes", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: { code: "not_found", message: "No route for GET /v1/nope" },
    });
  });

  it("publishes an OpenAPI document built from the Valibot schemas", async () => {
    const res = await app.inject({ method: "GET", url: "/openapi.json" });
    const doc = res.json();
    expect(doc.paths["/v1/hello"].get.parameters[0].name).toBe("name");
  });
});
