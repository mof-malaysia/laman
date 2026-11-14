import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import { type App, sessionCookie, signedInApp } from "./helpers.js";
import { loadEnv } from "../src/env.js";

let dataDir: string;
let app: App;
/** A second officer's cookie: Aminah, an editor. */
let aminah: string;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "laman-conflicts-"));
  const env = loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATA_DIR: dataDir,
    ADMIN_DIST: join(dataDir, "none"),
  });
  app = await signedInApp({ env, databasePath: ":memory:", runJobs: false });
  ({ cookie: aminah } = await sessionCookie(app, "editor", "aminah"));
  await app.db
    .updateTable("users")
    .set({ display_name: "Aminah" })
    .where("username", "=", "aminah")
    .execute();
});
afterAll(async () => {
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
});

const call = (method: "GET" | "POST" | "PUT", url: string, payload?: object, cookie?: string) =>
  app.inject({
    method,
    url,
    ...(payload ? { payload } : {}),
    ...(cookie ? { headers: { cookie } } : {}),
  });

const titled = (draft: { ms: { title: string } }, title: string) => ({
  ...draft,
  ms: { ...draft.ms, title },
});

describe("conflicts", () => {
  it("refuses a page save that would overwrite someone else's, and keeps it in the history", async () => {
    const page = (
      await call("POST", "/api/pages", { title: "Berkongsi", slug: "berkongsi" })
    ).json().data;
    // Both open the page at the same version.
    const opened = (await call("GET", `/api/pages/${page.id}`)).json().data;
    const base = opened.draftVersion;

    const theirs = await call(
      "PUT",
      `/api/pages/${page.id}/draft`,
      { draft: titled(opened.draft, "Versi Aminah"), base },
      aminah,
    );
    expect(theirs.statusCode).toBe(200);
    expect(theirs.json().data.draftVersion).not.toBe(base);

    const mine = await call("PUT", `/api/pages/${page.id}/draft`, {
      draft: titled(opened.draft, "Versi saya"),
      base,
    });
    expect(mine.statusCode).toBe(409);
    expect(mine.json().error).toMatchObject({
      code: "draft_conflict",
      details: { by: "Aminah", at: expect.any(String) },
    });
    const now = (await call("GET", `/api/pages/${page.id}`)).json().data;
    expect(now.draft.ms.title).toBe("Versi Aminah");

    // The refused copy is in the history, and stays there as the next saves go on.
    const titles = async () =>
      Promise.all(
        (
          (await call("GET", `/api/pages/${page.id}/revisions`)).json().data as { id: string }[]
        ).map(
          async (r) =>
            (await call("GET", `/api/pages/${page.id}/revisions/${r.id}`)).json().data.content.ms
              .title,
        ),
      );
    expect(await titles()).toContain("Versi saya");
    const next = await call("PUT", `/api/pages/${page.id}/draft`, {
      draft: titled(now.draft, "Versi saya, selepas"),
      base: now.draftVersion,
    });
    expect(next.statusCode).toBe(200);
    expect(await titles()).toEqual(expect.arrayContaining(["Versi saya", "Versi saya, selepas"]));

    // Without a base, the save wins: scripts and older clients keep working.
    expect(
      (await call("PUT", `/api/pages/${page.id}/draft`, { draft: titled(now.draft, "Tanpa asas") }))
        .statusCode,
    ).toBe(200);
  });

  it("refuses a site document save that would overwrite someone else's", async () => {
    const opened = (await call("GET", "/api/announcement")).json().data;
    const theirs = await call(
      "PUT",
      "/api/announcement",
      { draft: { ...opened.draft, message: "Daripada Aminah" }, base: opened.version },
      aminah,
    );
    expect(theirs.statusCode).toBe(200);
    const mine = await call("PUT", "/api/announcement", {
      draft: { ...opened.draft, message: "Daripada saya" },
      base: opened.version,
    });
    expect(mine.statusCode).toBe(409);
    expect(mine.json().error.details).toMatchObject({ by: "Aminah" });
    // Saving again from what's there now goes through.
    const current = (await call("GET", "/api/announcement")).json().data;
    expect(current.draft.message).toBe("Daripada Aminah");
    const again = await call("PUT", "/api/announcement", {
      draft: { ...current.draft, message: "Daripada saya" },
      base: current.version,
    });
    expect(again.statusCode).toBe(200);
  });
});
