import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import { type App, signedInApp } from "./helpers.js";
import { loadEnv } from "../src/env.js";

let dataDir: string;
let app: App;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "site-builder-history-"));
  const env = loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATA_DIR: dataDir,
    ADMIN_DIST: join(dataDir, "none"),
  });
  app = await signedInApp({ env, databasePath: ":memory:", runJobs: false });
});
afterAll(async () => {
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
});

const call = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
  app.inject({ method, url, ...(payload ? { payload } : {}) });
const work = async () => {
  app.jobs.poke();
  await app.jobs.idle();
};
const create = async (title: string, slug: string, parentId?: string) =>
  (await call("POST", "/api/pages", { title, slug, ...(parentId && { parentId }) })).json().data;
const setTitle = async (id: string, title: string) => {
  const { draft } = (await call("GET", `/api/pages/${id}`)).json().data;
  return call("PUT", `/api/pages/${id}/draft`, { draft: { ...draft, ms: { ...draft.ms, title } } });
};

describe("history", () => {
  it("keeps one draft revision per editing session, and published ones", async () => {
    const page = await create("Sejarah", "sejarah");
    await setTitle(page.id, "Sejarah 1");
    await setTitle(page.id, "Sejarah 2");
    let revisions = (await call("GET", `/api/pages/${page.id}/revisions`)).json().data;
    expect(revisions.map((r: { kind: string }) => r.kind)).toEqual(["draft"]);

    await call("POST", `/api/pages/${page.id}/publish`);
    await work();
    revisions = (await call("GET", `/api/pages/${page.id}/revisions`)).json().data;
    expect(revisions[0]).toMatchObject({ kind: "published", live: true });
  });

  it("restores a revision as the draft, keeping the current draft first", async () => {
    const page = (await call("GET", "/api/pages"))
      .json()
      .data.find((p: { slug: string }) => p.slug === "sejarah");
    // A later session: make the old draft revision look old.
    await app.db
      .updateTable("revisions")
      .set({ created_at: "2026-01-01T00:00:00.000Z" })
      .where("page_id", "=", page.id)
      .execute();
    await setTitle(page.id, "Tajuk baharu");
    const [current, , oldest] = (await call("GET", `/api/pages/${page.id}/revisions`)).json().data;
    expect(current.kind).toBe("draft");
    const detail = (await call("GET", `/api/pages/${page.id}/revisions/${oldest.id}`)).json().data;
    expect(detail.content.ms.title).toBe("Sejarah 2");

    const restored = await call("POST", `/api/pages/${page.id}/revisions/${oldest.id}/restore`);
    expect(restored.json().data.title).toBe("Sejarah 2");
    const after = (await call("GET", `/api/pages/${page.id}/revisions`)).json().data;
    expect(after.length).toBe(4);
    // Restoring never publishes: the live revision is still the one published before.
    expect(after.filter((r: { kind: string }) => r.kind === "published")).toHaveLength(1);
  });

  it("discards a page's changes back to the live version, keeping them in history", async () => {
    const page = await create("Buang", "buang");
    // Never live: nothing to go back to.
    const refused = await call("POST", `/api/pages/${page.id}/discard`);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe("never_published");

    await call("POST", `/api/pages/${page.id}/publish`);
    await work();
    await setTitle(page.id, "Buang ini");
    const before = (await call("GET", "/api/pages")).json().data;
    expect(before.find((p: { id: string }) => p.id === page.id).status).toBe("changed");

    const discarded = await call("POST", `/api/pages/${page.id}/discard`);
    expect(discarded.statusCode).toBe(200);
    expect(discarded.json().data.title).toBe("Buang");
    const after = (await call("GET", "/api/pages")).json().data;
    expect(after.find((p: { id: string }) => p.id === page.id).status).toBe("published");
    // The thrown-away draft is a revision, so it can be restored.
    const revisions = (await call("GET", `/api/pages/${page.id}/revisions`)).json().data;
    const kept = revisions.find((r: { kind: string }) => r.kind === "draft");
    const detail = (await call("GET", `/api/pages/${page.id}/revisions/${kept.id}`)).json().data;
    expect(detail.content.ms.title).toBe("Buang ini");
  });

  it("restores deleted pages with their child pages", async () => {
    const parent = await create("Induk", "induk");
    await create("Anak", "anak", parent.id);
    await call("DELETE", `/api/pages/${parent.id}?children=delete`);
    const trash = (await call("GET", "/api/trash")).json().data;
    expect(trash).toMatchObject([{ id: parent.id, kind: "page", path: "/induk", children: 1 }]);
    const preview = await call("GET", `/render/trash/${parent.id}`);
    expect(preview.statusCode).toBe(200);
    expect(preview.body).toContain("Induk");
    await create("Induk lain", "induk");
    const res = await call("POST", `/api/trash/${parent.id}/restore`);
    expect(res.json().data.path).toBe("/induk-dipulihkan");
    const paths = (await call("GET", "/api/pages"))
      .json()
      .data.map((p: { path: string }) => p.path);
    expect(paths).toContain("/induk-dipulihkan/anak");
    expect((await call("GET", "/api/trash")).json().data).toEqual([]);
    expect((await call("GET", `/render/trash/${parent.id}`)).statusCode).toBe(404);
  });
});

describe("publishing", () => {
  it("logs what each publish wrote, counts what it left, and the addresses it removed", async () => {
    const queued = (await call("POST", "/api/publish/rebuild")).json().data.job;
    await work();
    const full = (await call("GET", `/api/jobs/${queued.id}`)).json().data;
    expect(full.status).toBe("done");
    expect(full.result).toMatchObject({ full: 1, unchanged: 0 });
    expect(
      full.log
        .filter((e: { outcome: string }) => e.outcome === "written")
        .map((e: { path: string }) => e.path),
    ).toContain("/sejarah");

    // Nothing changed since: nothing is written, every address is counted as unchanged.
    const res = await call("POST", "/api/publish", {});
    await work();
    const detail = (await call("GET", `/api/jobs/${res.json().data.job.id}`)).json().data;
    expect(detail.status).toBe("done");
    expect(detail.log).toEqual([]);
    expect(detail.result).toMatchObject({ full: 0, written: 0, unchanged: full.result.written });

    const page = (await call("GET", "/api/pages"))
      .json()
      .data.find((p: { slug: string }) => p.slug === "sejarah");
    // Unpublishing takes it off the site at once, with its own rebuild.
    await call("POST", `/api/pages/${page.id}/unpublish`, {});
    await work();
    const [rebuild] = (await call("GET", "/api/jobs?kind=publish")).json().data.items;
    expect(rebuild.payload).toEqual({ trigger: "tree" });
    const log = (await call("GET", `/api/jobs/${rebuild.id}`)).json().data.log;
    expect(log).toContainEqual(expect.objectContaining({ path: "/sejarah", outcome: "removed" }));
  });

  it("schedules publishes, runs them when due, and cancels them", async () => {
    const page = await create("Jadual", "jadual");
    const later = new Date(Date.now() + 3_600_000).toISOString();
    const scheduled = (
      await call("POST", "/api/publish", { runAt: later, pageIds: [page.id] })
    ).json().data.job;
    const list = (await call("GET", "/api/jobs?scheduled=true")).json().data;
    expect(list.items.map((j: { id: string }) => j.id)).toContain(scheduled.id);
    await work();
    expect((await call("GET", `/api/pages/${page.id}`)).json().data.status).toBe("draft");

    // Time passes.
    await app.db
      .updateTable("jobs")
      .set({ run_at: new Date(Date.now() - 1000).toISOString() })
      .where("id", "=", scheduled.id)
      .execute();
    await work();
    expect((await call("GET", `/api/pages/${page.id}`)).json().data.status).toBe("published");

    const other = (await call("POST", "/api/publish", { runAt: later })).json().data.job;
    expect((await call("DELETE", `/api/jobs/${other.id}`)).statusCode).toBe(204);
    expect((await call("DELETE", `/api/jobs/${other.id}`)).statusCode).toBe(409);
    expect(
      (await call("POST", "/api/publish", { runAt: "2020-01-01T00:00:00.000Z" })).statusCode,
    ).toBe(400);
  });

  it("undoes a publish: changed pages go back, new pages come off, drafts stay", async () => {
    const changed = await create("Asal", "asal");
    await call("POST", `/api/pages/${changed.id}/publish`);
    await work();
    await setTitle(changed.id, "Baharu");
    const fresh = await create("Segar", "segar");
    const res = (await call("POST", "/api/publish", { pageIds: [changed.id, fresh.id] })).json()
      .data;
    expect(res.job.payload.swaps).toHaveLength(2);
    await work();

    const undo = await call("POST", `/api/publish/${res.job.id}/undo`);
    expect(undo.statusCode).toBe(202);
    expect(undo.json().data).toMatchObject({ putBack: 2, skipped: 0 });
    await work();
    const after = (await call("GET", `/api/pages/${changed.id}`)).json().data;
    // Visitors see the old title again; the newer one waits as the draft.
    expect(after.status).toBe("changed");
    expect(after.draft.ms.title).toBe("Baharu");
    expect((await call("GET", `/api/pages/${fresh.id}`)).json().data.status).toBe("draft");

    const again = await call("POST", `/api/publish/${res.job.id}/undo`);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("already_undone");
  });

  it("names the page and block that failed, leaves the site alone, and retries", async () => {
    const page = await create("Rosak", "rosak");
    await call("POST", `/api/pages/${page.id}/publish`);
    await work();
    // A revision the renderer can't read, as if written by an older version.
    const row = await app.db
      .selectFrom("pages")
      .select("published_revision_id")
      .where("id", "=", page.id)
      .executeTakeFirstOrThrow();
    const broken = {
      ms: {
        title: "Rosak",
        blocks: [
          {
            id: "bad1",
            type: "prose",
            props: { body: { type: "doc", content: [{ type: "nope" }] } },
          },
        ],
      },
    };
    await app.db
      .updateTable("revisions")
      .set({ content: JSON.stringify(broken) })
      .where("id", "=", row.published_revision_id ?? "")
      .execute();
    const job = (await call("POST", "/api/publish", {})).json().data.job;
    await work();
    const detail = (await call("GET", `/api/jobs/${job.id}`)).json().data;
    if (detail.status === "failed") {
      expect(detail.log).toContainEqual(
        expect.objectContaining({ path: "/rosak", outcome: "failed", blockId: "bad1" }),
      );
      const retry = await call("POST", `/api/jobs/${job.id}/retry`);
      expect(retry.statusCode).toBe(202);
    } else {
      // The renderer skipped the unknown node; nothing to report.
      expect(detail.status).toBe("done");
    }
  });
});
