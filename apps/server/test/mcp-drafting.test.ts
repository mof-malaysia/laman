import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import sharp from "sharp";
import { agentApp, agentHelpers } from "./agents.js";
import { type App, multipartFile } from "./helpers.js";

let app: App;
let close: () => Promise<void>;

let token: string;
const helpers = agentHelpers(() => app);
const { officer, connect, callTool, mcp } = helpers;

beforeAll(async () => {
  ({ app, close } = await agentApp("mcp-drafting"));
  const { cookie } = await officer("editor");
  token = (await connect(cookie)).access_token;
});
afterAll(() => close());

const use = (name: string, args?: object) => helpers.use(token, name, args);
const refusal = (name: string, args?: object) => helpers.refusal(token, name, args);

describe("drafting pages", () => {
  it("creates a page and builds it block by block", async () => {
    const page = await use("create_page", { title: "Bayaran Zakat" });
    expect(page).toMatchObject({ path: "/bayaran-zakat", status: "draft" });
    const id = page.id as string;

    const added = await use("add_block", {
      pageId: id,
      type: "callout",
      props: { title: "Tarikh akhir 31 Disember" },
      position: 1,
    });
    const callout = added.blocks[1];
    expect(callout.type).toBe("callout");

    await use("update_block", {
      pageId: id,
      blockId: callout.id,
      props: { title: "Tarikh akhir 30 Disember" },
    });
    const moved = await use("move_block", { pageId: id, blockId: callout.id, position: 0 });
    expect(moved.blocks[0].id).toBe(callout.id);

    const draft = (
      await app.db
        .selectFrom("pages")
        .select("draft")
        .where("id", "=", id)
        .executeTakeFirstOrThrow()
    ).draft;
    expect(JSON.parse(draft).ms.blocks[0].props.title).toBe("Tarikh akhir 30 Disember");

    const removed = await use("remove_block", { pageId: id, blockId: callout.id });
    expect(removed.blocks.map((b: { id: string }) => b.id)).not.toContain(callout.id);
    expect(await refusal("remove_block", { pageId: id, blockId: callout.id })).toBe(
      "block_not_found",
    );
  });

  it("refuses blocks the page's kind can't use, with the API's reason", async () => {
    const page = await use("create_page", { title: "Hubungi Kami" });
    expect(await refusal("add_block", { pageId: page.id, type: "entryList" })).toBe(
      "blocks_not_allowed",
    );
  });

  it("sets details per language, and keeps the English version apart", async () => {
    const page = await use("create_page", { title: "Perkhidmatan" });
    await use("update_page_details", {
      id: page.id,
      title: "Perkhidmatan Kami",
      description: "Senarai perkhidmatan.",
    });
    const en = await use("update_page_details", {
      id: page.id,
      locale: "en",
      title: "Our Services",
    });
    expect(en).toMatchObject({ locale: "en", title: "Our Services" });
    const full = await use("get_page", { id: page.id });
    expect(full.draft.ms).toMatchObject({
      title: "Perkhidmatan Kami",
      description: "Senarai perkhidmatan.",
    });
    expect(await refusal("update_page_details", { id: page.id, entry: { pinned: true } })).toBe(
      "not_an_entry",
    );
  });

  it("records the agent on the page's history", async () => {
    const page = await use("create_page", { title: "Sejarah" });
    await use("add_block", { pageId: page.id, type: "prose" });
    const revisions = (await callTool(token, "list_revisions", { pageId: page.id })).content[0]!
      .text;
    expect(JSON.parse(revisions)[0]).toMatchObject({ by: "editor", via: "Claude" });
  });

  it("makes a listing and writes an entry's fixed fields", async () => {
    const page = await use("create_page", { title: "Berita" });
    await use("make_listing", { id: page.id });
    const listing = await use("update_listing", {
      id: page.id,
      categories: [{ slug: "kenyataan", name: "Kenyataan Media" }],
    });
    expect(listing.settings).toMatchObject({ categories: [{ slug: "kenyataan" }], rss: true });
    const entry = await use("create_entry", { listingId: page.id, title: "Majlis Pelancaran" });
    expect(entry.kind).toBe("entry");
    await use("update_page_details", {
      id: entry.id,
      entry: { category: "kenyataan", summary: "Ringkasan." },
    });
    const full = await use("get_page", { id: entry.id });
    expect(full.draft.entry).toMatchObject({ category: "kenyataan", summary: "Ringkasan." });
  });
});

describe("drafting the navigation", () => {
  it("builds a dropdown and a footer column, and points at them by path", async () => {
    const page = await use("create_page", { title: "Zakat Pendapatan" });
    await use("add_navbar_dropdown", { label: "Perkhidmatan", layout: "grouped" });
    const nav = (await use("get_navigation")).draft;
    const path = `navbar.${nav.navbar.length - 1}`;
    await use("add_dropdown_group", { path, heading: "Zakat" });
    await use("add_dropdown_link", {
      path: `${path}.groups.0`,
      label: "Zakat Pendapatan",
      target: { kind: "page", pageId: page.id },
    });
    await use("set_dropdown_footer_link", {
      path,
      link: {
        text: "Semua perkhidmatan",
        target: { kind: "url", url: "https://agensi.gov.my/perkhidmatan" },
      },
    });
    await use("add_footer_column", { heading: "Agensi" });
    const columns = (await use("get_navigation")).draft.footer.columns.length;
    const saved = await use("add_footer_link", {
      path: `footer.columns.${columns - 1}`,
      label: "Hubungi",
      target: { kind: "url", url: "mailto:aduan@agensi.gov.my" },
    });
    const dropdown = saved.draft.navbar.at(-1);
    expect(dropdown.groups[0].links[0]).toMatchObject({ label: "Zakat Pendapatan" });
    expect(dropdown.footerLink.text).toBe("Semua perkhidmatan");
    expect(saved.draft.footer.columns.at(-1).links[0].label).toBe("Hubungi");
    // Linking to a draft page can't go live yet.
    expect(saved.warnings.length).toBeGreaterThan(0);

    await use("update_navigation_item", { path: `${path}.groups.0.links.0`, label: "Zakat Gaji" });
    expect(await refusal("update_navigation_item", { path: `${path}.groups.0`, label: "x" })).toBe(
      "wrong_fields",
    );
    expect(await refusal("add_dropdown_group", { path: "navbar.99", heading: "x" })).toBe(
      "path_not_found",
    );
    expect(
      await refusal("add_footer_link", {
        path,
        label: "x",
        target: { kind: "url", url: "https://x.my" },
      }),
    ).toBe("not_a_footer_column");

    const removed = await use("remove_navigation_item", { path });
    expect(removed.draft.navbar.map((i: { label: string }) => i.label)).not.toContain(
      "Perkhidmatan",
    );
  });

  it("reorders top-level items", async () => {
    await use("add_navbar_link", {
      label: "Satu",
      target: { kind: "url", url: "https://satu.my" },
    });
    await use("add_navbar_link", { label: "Dua", target: { kind: "url", url: "https://dua.my" } });
    const nav = (await use("get_navigation")).draft.navbar as { label: string }[];
    const moved = await use("move_navigation_item", {
      path: `navbar.${nav.length - 1}`,
      position: 0,
    });
    expect(moved.draft.navbar[0].label).toBe("Dua");
  });
});

describe("drafting site documents", () => {
  it("pins search results and switches filters", async () => {
    const page = await use("create_page", { title: "Semak Status" });
    await use("set_search_options", { filters: false });
    await use("add_search_pin", { terms: ["Status", "semakan"], pageId: page.id });
    const updated = await use("update_search_pin", { index: 0, terms: ["status"] });
    expect(updated.draft).toMatchObject({
      filters: false,
      pins: [{ terms: ["status"], pageId: page.id }],
    });
    const removed = await use("remove_search_pin", { index: 0 });
    expect(removed.draft.pins).toEqual([]);
    expect(await refusal("remove_search_pin", { index: 0 })).toBe("pin_not_found");
  });

  it("sets the colours from the agency's colour", async () => {
    const theme = await use("set_theme", { colour: "#0B6B3A" });
    expect(theme.draft).toMatchObject({ preset: "custom", seed: "#0b6b3a" });
    expect(await refusal("set_theme", {})).toBe("invalid_input");
    await use("discard_draft", { document: "theme" });
    expect((await use("get_theme")).draft.preset).toBe("ftds");
  });

  it("changes only the settings given", async () => {
    const before = (await use("get_settings")).draft;
    const saved = await use("update_settings", { identity: { siteName: "Lembaga Zakat" } });
    expect(saved.draft.identity).toMatchObject({
      siteName: "Lembaga Zakat",
      agencyName: before.identity.agencyName,
    });
    expect(saved.draft.contact).toEqual(before.contact);
    const media = await use("upload_media", {
      filename: "logo.png",
      data: (
        await sharp({ create: { width: 2, height: 2, channels: 3, background: "#000" } })
          .png()
          .toBuffer()
      ).toString("base64"),
      alt: "Logo",
    });
    await use("update_settings", { identity: { logo: { mediaId: media.id } } });
    const cleared = await use("update_settings", { identity: { logo: null } });
    expect(cleared.draft.identity.logo).toBeUndefined();
    expect(cleared.draft.identity.siteName).toBe("Lembaga Zakat");
  });

  it("writes the announcement, and takes a link away with null", async () => {
    await use("update_announcement", {
      on: true,
      message: "Kaunter ditutup pada 1 Januari.",
      link: { label: "Butiran", target: { kind: "url", url: "https://agensi.gov.my/notis" } },
    });
    const saved = await use("update_announcement", { link: null });
    expect(saved.draft).toMatchObject({ on: true, message: "Kaunter ditutup pada 1 Januari." });
    expect(saved.draft.link).toBeUndefined();
  });
});

describe("media", () => {
  it("uploads a file from the agent with its alt text, then changes it", async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#0b6b3a" } })
      .png()
      .toBuffer();
    const media = await use("upload_media", {
      filename: "logo.png",
      data: png.toString("base64"),
      alt: "Logo agensi",
    });
    expect(media).toMatchObject({ kind: "image", alt: "Logo agensi" });
    const updated = await use("update_media", { id: media.id, caption: "Logo rasmi" });
    expect(updated).toMatchObject({ alt: "Logo agensi", caption: "Logo rasmi" });
    // The library takes images and PDFs only, whatever the file is called.
    expect(
      await refusal("upload_media", {
        filename: "x.png",
        data: Buffer.from("MZ").toString("base64"),
      }),
    ).toBe("file_type_not_allowed");
  });
});

/** An image big enough that an agent would have shrunk it. */
const bigPng = () =>
  sharp({ create: { width: 1200, height: 800, channels: 3, background: "#0b6b3a" } })
    .png()
    .toBuffer();

/** A file posted to an upload link, as curl -F sends it. */
const postToLink = (url: string, bytes: Buffer, headers: Record<string, string> = {}) => {
  const file = multipartFile("gambar.png", bytes);
  return app.inject({
    method: "POST",
    url: new URL(url).pathname,
    payload: file.payload,
    headers: { ...file.headers, ...headers },
  });
};

describe("on a connection of its own", () => {
  // Its own connection: the suite's has spent its burst of calls by now.
  let own: string;
  beforeAll(async () => {
    const { cookie } = await officer("editor");
    own = (await connect(cookie)).access_token;
  });
  const useOwn = (name: string, args?: object) => helpers.use(own, name, args);

  it("adds, keeps and takes away an accent", async () => {
    const preview = await useOwn("preview_theme", { preset: "teal", accent: "#CB2043" });
    expect(preview.accent).toMatchObject({
      colour: "#cb2043",
      passes: true,
      tooCloseToMain: false,
    });
    expect((await useOwn("preview_theme", { accent: "#3b82f6" })).accent.tooCloseToMain).toBe(true);

    const added = await useOwn("set_theme", { preset: "teal", accent: "#CB2043" });
    expect(added.draft).toMatchObject({ preset: "teal", accent: "#cb2043" });
    // A stored accent is a ramp; changing only the main colour keeps it.
    const kept = await useOwn("set_theme", { colour: "#044D79" });
    expect(kept.draft).toMatchObject({
      preset: "custom",
      seed: "#044d79",
      accent: "#cb2043",
    });
    // And the accent alone keeps the main colour.
    const accentOnly = await useOwn("set_theme", { accent: "#0B6B3A" });
    expect(accentOnly.draft).toMatchObject({ seed: "#044d79", accent: "#0b6b3a" });
    const removed = await useOwn("set_theme", { accent: null });
    expect(removed.draft.seed).toBe("#044d79");
    expect(removed.draft).not.toHaveProperty("accent");
    expect(await helpers.refusal(own, "set_theme", { preset: "teal", colour: "#044d79" })).toBe(
      "invalid_input",
    );
    await useOwn("discard_draft", { document: "theme" });
  });

  it("keeps the navbar-name switch when another identity field changes", async () => {
    const hidden = await useOwn("update_settings", { appearance: { navbarName: false } });
    expect(hidden.draft.appearance.navbarName).toBe(false);
    const renamed = await useOwn("update_settings", { identity: { agencyName: "Lembaga Zakat" } });
    expect(renamed.draft.appearance.navbarName).toBe(false);
    expect(renamed.draft.appearance.footerLogo).toBe(true);
  });

  it("takes the original file once, as the officer, with the details given up front", async () => {
    const link = await useOwn("start_upload", { alt: "Bangunan agensi", credit: "Unit Korporat" });
    expect(link.example).toContain(link.url);
    const bytes = await bigPng();
    const response = await postToLink(link.url, bytes);
    expect(response.statusCode).toBe(201);
    const media = response.json().data;
    expect(media).toMatchObject({
      kind: "image",
      alt: "Bangunan agensi",
      credit: "Unit Korporat",
      width: 1200,
      size: bytes.length,
    });
    // Once only.
    const again = await postToLink(link.url, bytes);
    expect(again.statusCode).toBe(404);
    expect(again.json().error.code).toBe("upload_link_invalid");
    const log = await app.db
      .selectFrom("audit_log")
      .select("detail")
      .where("action", "=", "agentToolCall")
      .execute();
    expect(log.some((row) => String(row.detail).includes('"upload_link"'))).toBe(true);
  });

  it("refuses an unknown link, another site's page, and what the library refuses", async () => {
    expect((await postToLink("http://localhost/mcp/uploads/nope", await bigPng())).statusCode).toBe(
      404,
    );
    const framed = await useOwn("start_upload", {});
    expect(
      (await postToLink(framed.url, await bigPng(), { origin: "https://evil.example" })).statusCode,
    ).toBe(403);
    const link = await useOwn("start_upload", {});
    const refused = await postToLink(link.url, Buffer.from("MZ"));
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error.code).toBe("file_type_not_allowed");
  });
});

describe("who sees the drafting tools", () => {
  it("lists them for an editor", async () => {
    const tools = (await mcp(token, "tools/list")).json().result.tools as {
      name: string;
      annotations: { readOnlyHint: boolean };
    }[];
    const byName = new Map(tools.map((t) => [t.name, t]));
    expect(byName.get("add_block")?.annotations.readOnlyHint).toBe(false);
    expect(byName.get("get_page")?.annotations.readOnlyHint).toBe(true);
  });
});
