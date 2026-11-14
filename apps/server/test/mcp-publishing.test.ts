import type { Role } from "@fiscal-sb/contracts";
import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import sharp from "sharp";
import { AGENT_IP, agentApp, agentHelpers } from "./agents.js";
import { type App, myt } from "./helpers.js";

let app: App;
let close: () => Promise<void>;

const tokens = new Map<Role, string>();
const helpers = agentHelpers(() => app);
const { officer, connect, mcp } = helpers;

beforeAll(async () => {
  ({ app, close } = await agentApp("mcp-publishing", { SITE_URL: "https://agensi.gov.my" }));
  for (const role of ["editor", "contentManager", "admin"] as const)
    tokens.set(role, (await connect((await officer(role)).cookie)).access_token);
});
afterAll(() => close());

const use = (role: Role, name: string, args?: object) => helpers.use(tokens.get(role)!, name, args);
const refusal = (role: Role, name: string, args?: object) =>
  helpers.refusal(tokens.get(role)!, name, args);
const build = async () => {
  app.jobs.poke();
  await app.jobs.idle();
};
const listed = async (role: Role) =>
  new Map(
    (
      (await mcp(tokens.get(role)!, "tools/list")).json().result.tools as {
        name: string;
        annotations: { destructiveHint?: boolean };
      }[]
    ).map((t) => [t.name, t]),
  );

describe("who sees the publishing tools", () => {
  it("shows each role only what it may do", async () => {
    const editor = await listed("editor");
    const manager = await listed("contentManager");
    const admin = await listed("admin");
    expect(editor.has("publish_page")).toBe(false);
    expect(editor.has("delete_page")).toBe(true);
    expect(manager.has("publish_page")).toBe(true);
    expect(manager.has("undo_publish")).toBe(false);
    expect(admin.has("undo_publish")).toBe(true);
    expect(admin.has("rebuild_site")).toBe(true);
    // Nothing about people or security, whatever the role.
    expect(
      [...admin.keys()].some((name) => /user|invite|password|security|backup/.test(name)),
    ).toBe(false);
    expect(manager.get("unpublish_page")?.annotations.destructiveHint).toBe(true);
    expect(manager.get("publish_page")?.annotations.destructiveHint).toBe(false);
  });

  it("refuses a tool the role can't see, as if it didn't exist", async () => {
    const res = await mcp(tokens.get("editor")!, "tools/call", {
      name: "publish_page",
      arguments: {},
    });
    expect(res.json().error.code).toBe(-32602);
  });
});

describe("publishing", () => {
  it("publishes a page, and takes it off the site again", async () => {
    const page = await use("contentManager", "create_page", { title: "Waktu Operasi" });
    expect((await use("contentManager", "list_waiting")).items).toContainEqual(
      expect.objectContaining({ id: page.id, new: true }),
    );
    const published = await use("contentManager", "publish_page", { id: page.id });
    expect(published.job.kind).toBe("publish");
    await build();
    expect((await use("contentManager", "get_page", { id: page.id })).status).toBe("published");
    // The route's own audit entry says which agent it came through.
    const logged = await app.db
      .selectFrom("audit_log")
      .select(["detail", "ip"])
      .where("action", "=", "published")
      .where("target", "=", page.id)
      .executeTakeFirstOrThrow();
    expect(JSON.parse(logged.detail)).toMatchObject({
      agent: "Claude",
      connection: expect.any(String),
    });
    expect(logged.ip).toBe(AGENT_IP);

    // Editors can't take a live page off the site, or delete it.
    expect(await refusal("editor", "delete_page", { id: page.id, confirmed: true })).toBe(
      "forbidden",
    );
    await use("contentManager", "unpublish_page", { id: page.id });
    expect((await use("contentManager", "get_page", { id: page.id })).status).toBe("draft");
  });

  it("publishes a site document on its own", async () => {
    await use("editor", "update_settings", { identity: { siteName: "Jabatan Ujian" } });
    const res = await use("contentManager", "publish_settings");
    expect(res.job.payload.trigger).toBe("settings");
    await build();
    expect((await use("editor", "get_settings")).published.identity.siteName).toBe("Jabatan Ujian");
  });

  it("schedules a publish and cancels it", async () => {
    const page = await use("contentManager", "create_page", { title: "Notis Cuti" });
    const scheduled = await use("contentManager", "schedule_publish", {
      runAt: myt(24),
      pageIds: [page.id],
    });
    const jobId = scheduled.job.id as string;
    const upcoming = await use("contentManager", "list_jobs", { scheduled: true });
    expect(upcoming.items.map((j: { id: string }) => j.id)).toContain(jobId);
    await use("contentManager", "cancel_scheduled_publish", { jobId });
    const after = await use("contentManager", "list_jobs", { scheduled: true });
    expect(after.items.map((j: { id: string }) => j.id)).not.toContain(jobId);
    expect(await refusal("contentManager", "schedule_publish", { runAt: myt(-1) })).toBe(
      "run_at_past",
    );
  });

  it("only says what a delete would touch until it's confirmed", async () => {
    const parent = await use("editor", "create_page", { title: "Arkib" });
    await use("editor", "create_page", { title: "Arkib 2020", parentId: parent.id });
    const preview = await use("editor", "delete_page", { id: parent.id });
    expect(preview).toMatchObject({
      deleted: false,
      wouldTouch: { descendants: [expect.anything()] },
    });
    expect((await use("editor", "get_page", { id: parent.id })).id).toBe(parent.id);
    expect(await refusal("editor", "delete_page", { id: parent.id, confirmed: true })).toBe(
      "children_needed",
    );
    expect(
      await use("editor", "delete_page", { id: parent.id, confirmed: true, children: "delete" }),
    ).toMatchObject({
      deleted: true,
    });
    expect(await refusal("editor", "get_page", { id: parent.id })).toBe("page_not_found");
  });
});

/** A tiny PNG of one colour. */
const png = (colour: string) =>
  sharp({ create: { width: 4, height: 4, channels: 3, background: colour } })
    .png()
    .toBuffer();

describe("media", () => {
  it("replaces a file, puts the old one back, deletes and restores it", async () => {
    const media = await use("editor", "upload_media", {
      filename: "banner.png",
      data: (await png("#ff0000")).toString("base64"),
      alt: "Sepanduk",
    });
    const replaced = await use("contentManager", "replace_media", {
      id: media.id,
      filename: "banner-baharu.png",
      data: (await png("#00ff00")).toString("base64"),
    });
    expect(replaced).toMatchObject({
      filename: "banner-baharu.png",
      previous: { filename: "banner.png" },
    });
    const reverted = await use("contentManager", "revert_media_file", { id: media.id });
    expect(reverted.filename).toBe("banner.png");
    expect((await use("editor", "delete_media", { id: media.id })).deletedAt).toBeTruthy();
    expect((await use("editor", "restore_media", { id: media.id })).deletedAt).toBeNull();
  });
});

describe("history, listings, calendars and embeds", () => {
  // Their own connections, so these calls don't use up the shared ones' rate limits.
  const own = new Map<Role, string>();
  const as = async (role: Role) => {
    if (!own.has(role)) own.set(role, (await connect((await officer(role)).cookie)).access_token);
    return own.get(role)!;
  };
  const call = async (role: Role, name: string, args?: object) =>
    helpers.use(await as(role), name, args);

  it("brings back a deleted page, and finds deleted files", async () => {
    const page = await call("editor", "create_page", { title: "Borang Lama" });
    await call("editor", "delete_page", { id: page.id, confirmed: true });
    const deleted = await call("editor", "list_deleted_pages");
    expect(deleted.map((p: { id: string }) => p.id)).toContain(page.id);
    expect((await call("editor", "restore_page", { id: page.id })).id).toBe(page.id);

    const media = await call("editor", "upload_media", {
      filename: "lama.png",
      data: (await png("#0000ff")).toString("base64"),
      alt: "Lama",
    });
    await call("editor", "delete_media", { id: media.id });
    const list = await call("editor", "list_media", { deleted: true });
    expect(list.items.map((m: { id: string }) => m.id)).toContain(media.id);
  });

  it("reads one revision", async () => {
    const page = await call("contentManager", "create_page", { title: "Sejarah" });
    await call("contentManager", "publish_page", { id: page.id });
    const revision = (await call("contentManager", "list_revisions", { pageId: page.id }))[0];
    const detail = await call("contentManager", "get_revision", {
      pageId: page.id,
      revisionId: revision.id,
    });
    expect(detail.id).toBe(revision.id);
  });

  it("changes one listing setting without resetting the others", async () => {
    const page = await call("editor", "create_page", { title: "Takwim" });
    await call("editor", "make_listing", { id: page.id });
    await call("editor", "update_listing", {
      id: page.id,
      locations: [{ slug: "putrajaya", name: "Putrajaya" }],
      sort: "eventStart",
    });
    await call("editor", "update_listing", { id: page.id, rss: false });
    expect((await call("editor", "get_listing", { id: page.id })).settings).toMatchObject({
      locations: [{ slug: "putrajaya" }],
      sort: "eventStart",
      rss: false,
    });
  });

  it("lists a listing's calendars and syncs them, for roles that publish", async () => {
    const page = await call("contentManager", "create_page", { title: "Acara" });
    await call("contentManager", "make_listing", { id: page.id });
    expect(await call("contentManager", "list_calendar_sources", { listingId: page.id })).toEqual(
      [],
    );
    expect((await call("contentManager", "sync_calendars")).kind).toBe("calendar.sync");
    expect((await listed("editor")).has("sync_calendars")).toBe(false);
  });

  it("lets only Admins change what pages may embed", async () => {
    const saved = await call("admin", "update_embeds", { hosts: ["peta.agensi.gov.my"] });
    expect(saved.draft.embeds).toEqual({ services: [], hosts: ["peta.agensi.gov.my"] });
    expect((await listed("editor")).has("update_embeds")).toBe(false);
    await call("admin", "discard_draft", { document: "settings" });
  });
});

describe("the publishing machinery", () => {
  it("undoes a publish and rebuilds the site, for Admins", async () => {
    const page = await use("admin", "create_page", { title: "Pengumuman" });
    const published = await use("admin", "publish_page", { id: page.id });
    await build();
    const job = await use("admin", "get_job", { id: published.job.id });
    expect(job.status).toBe("done");
    const undone = await use("admin", "undo_publish", { jobId: published.job.id });
    expect(undone.putBack).toBe(1);
    await build();
    expect((await use("admin", "get_page", { id: page.id })).status).toBe("draft");
    const rebuilt = await use("admin", "rebuild_site");
    expect(rebuilt.job.payload.trigger).toBe("rebuild");
  });
});
