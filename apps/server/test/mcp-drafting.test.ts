import { afterAll, beforeAll, describe, expect, it } from "@rstest/core";
import sharp from "sharp";
import { agentApp, agentHelpers } from "./agents.js";
import { type App } from "./helpers.js";

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
