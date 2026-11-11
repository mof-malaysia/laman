import { describe, expect, it } from "@rstest/core";
import {
  Block,
  blockFields,
  blocks,
  embedDecision,
  embedHost,
  embedHostPattern,
  embedServiceIds,
  embedServices,
  fieldShown,
  kindIssues,
  newBlock,
  PageContent,
  richTextToHtml,
  templates,
} from "../src/index.js";

describe("block registry", () => {
  it.each(blocks.map((b) => b.type))("%s defaults pass its schema", (type) => {
    const block = newBlock(type, "b1");
    expect(Block.safeParse(block).success).toBe(true);
  });

  it("describes fields for the property panel from the schema", () => {
    const fields = blockFields("hero");
    const title = fields.find((f) => f.name === "title");
    expect(title).toMatchObject({ widget: "text", required: true, inline: true, maxLength: 120 });
    const action = fields.find((f) => f.name === "primaryAction");
    expect(action?.fields?.map((f) => f.name)).toEqual(["label", "href"]);

    const grid = blockFields("featureGrid");
    expect(grid.find((f) => f.name === "columns")).toMatchObject({
      widget: "select",
      required: false,
      options: [
        { value: "2", label: "Two" },
        { value: "3", label: "Three" },
      ],
    });
    const features = grid.find((f) => f.name === "features");
    expect(features).toMatchObject({ widget: "list", minItems: 1, maxItems: 9 });
    expect(features?.fields?.map((f) => f.name)).toEqual(["icon", "title", "description", "href"]);

    expect(blockFields("prose")).toEqual([
      expect.objectContaining({ name: "body", widget: "richtext" }),
      expect.objectContaining({
        name: "width",
        widget: "select",
        defaultValue: "page",
        options: [
          { value: "page", label: "Follow page" },
          { value: "article", label: "Text column" },
          { value: "wide", label: "Wide" },
        ],
      }),
    ]);
  });

  it("shows a field only where its condition holds, reading defaults for unset siblings", () => {
    const fields = blockFields("hero");
    const spec = (name: string) => fields.find((f) => f.name === name)!;
    expect(spec("media").when).toEqual({ layout: ["split", "image"] });
    expect(spec("layout").defaultValue).toBe("stacked");
    expect(fieldShown(spec("media"), {}, fields)).toBe(false);
    expect(fieldShown(spec("media"), { layout: "image" }, fields)).toBe(true);
    expect(fieldShown(spec("align"), {}, fields)).toBe(true);
    expect(fieldShown(spec("mediaPosition"), { layout: "image" }, fields)).toBe(false);
    expect(fieldShown(spec("title"), {}, fields)).toBe(true);
  });

  it("parses heroes saved before layouts, as stacked on Paper", () => {
    const old = { id: "h1", type: "hero", props: { title: "Utama" } };
    expect(Block.parse(old).props).toMatchObject({ layout: "stacked", tone: "paper" });
  });

  const layouts = ["stacked", "split", "image"] as const;
  const tones = ["paper", "well", "primary"] as const;
  it.each(layouts.flatMap((layout) => tones.map((tone) => [layout, tone] as const)))(
    "a %s hero on %s passes its schema",
    (layout, tone) => {
      const block = newBlock("hero", "h1");
      const props = {
        ...block.props,
        layout,
        tone,
        media: { mediaId: "0b6e6c4e-8f4f-4b8e-9a39-2f1c3d5e7a90" },
      };
      expect(Block.safeParse({ ...block, props }).success).toBe(true);
    },
  );

  it("recommends one way at most", () => {
    const block = newBlock("ctaCards", "c1");
    const way = { title: "Dalam talian", action: { label: "Mohon", href: "/" }, recommended: true };
    const props = { ...block.props, options: [way, way] };
    expect(Block.safeParse({ ...block, props }).success).toBe(false);
  });

  it("allows one Hero or Page intro on a page", () => {
    const opening = [{ type: "hero" as const }, { type: "pageIntro" as const }];
    expect(kindIssues("page", opening)).toEqual([
      "A page has one Hero or Page intro: it holds the page's only h1",
    ]);
    expect(kindIssues("page", [{ type: "pageIntro" }, { type: "prose" }])).toEqual([]);
    expect(kindIssues("entry", [{ type: "pageIntro" }])).toEqual([
      "A entry page can't use the Page intro block",
    ]);
  });

  it.each(Object.entries(templates))(
    "the %s template's blocks pass their schemas",
    (_, template) => {
      const result = PageContent.safeParse({ title: "Ujian", blocks: template.blocks("Ujian") });
      expect(result.success).toBe(true);
    },
  );

  it("rejects unsafe links", () => {
    const block = newBlock("hero", "b1");
    const bad = {
      ...block,
      props: { ...block.props, primaryAction: { label: "x", href: "javascript:alert(1)" } },
    };
    expect(Block.safeParse(bad).success).toBe(false);
  });

  it("takes an https address to embed, and nothing else", () => {
    const block = newBlock("embed", "e1");
    const withUrl = (url: string) => Block.safeParse({ ...block, props: { ...block.props, url } });
    const address = "https://Peta.Agensi.gov.my/embed?id=42&zoom=7#pusat";
    expect(withUrl(address).success).toBe(true);
    // Cleared in the panel: the block then shows only on the canvas.
    expect(withUrl("").success).toBe(true);
    for (const refused of [
      "http://peta.agensi.gov.my/embed",
      "//peta.agensi.gov.my/embed",
      "https://pengguna:rahsia@peta.agensi.gov.my/embed",
      "https://localhost/embed",
      "https://peta.agensi.gov.my/embed?q=<script>",
      "javascript:alert(1)",
      '<iframe src="https://peta.agensi.gov.my/embed"></iframe>',
    ])
      expect(withUrl(refused).success, refused).toBe(false);
    expect(kindIssues("listing", [{ type: "embed" }, { type: "entryList" }])).toEqual([
      "A listing page can't use the Embed block",
    ]);
  });

  const none = { services: [], hosts: [] };

  it("frames a site's own hosts whole, by their exact name", () => {
    const rules = { services: [], hosts: ["peta.agensi.gov.my"] };
    const allowed = (address: string, r = rules) => embedDecision(address, r).allowed;
    expect(embedHost("https://Peta.Agensi.gov.my:8443/embed")).toBe("peta.agensi.gov.my");
    expect(allowed("https://peta.agensi.gov.my/embed?id=42")).toBe(true);
    expect(allowed("https://PETA.agensi.gov.my")).toBe(true);
    for (const refused of [
      "https://agensi.gov.my/embed",
      "https://lain.peta.agensi.gov.my/embed",
      "https://peta.agensi.gov.my.contoh.my/embed",
      "https://contoh.my/?next=https://peta.agensi.gov.my/embed",
      "https://contoh.my/peta.agensi.gov.my",
      "http://peta.agensi.gov.my/embed",
    ])
      expect(embedDecision(refused, rules), refused).toMatchObject({ allowed: false });
    expect(embedDecision("https://contoh.my/x", rules)).toMatchObject({ reason: "notListed" });
    expect(embedDecision("contoh.my/x", rules)).toMatchObject({ reason: "address" });
    expect(allowed("https://peta.agensi.gov.my/embed", none)).toBe(false);
  });

  it("frames a built-in service's embed addresses only, and only when it's switched on", () => {
    const video = "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0";
    expect(embedDecision(video, none)).toMatchObject({
      allowed: false,
      reason: "serviceOff",
      service: { name: "YouTube" },
    });
    expect(embedDecision(video, { services: ["vimeo"], hosts: [] })).toMatchObject({
      reason: "serviceOff",
    });
    const on = { services: ["youtube", "googleMaps", "powerBi", "openStreetMap"], hosts: [] };
    for (const allowed of [
      video,
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      "https://www.google.com/maps/embed?pb=!1m18",
      "https://www.google.com/maps/d/embed?mid=1abc",
      "https://app.powerbi.com/reportEmbed?reportId=0b6e6c4e&autoAuth=true",
      "https://www.openstreetmap.org/export/embed.html?bbox=101.68%2C2.90",
    ])
      expect(embedDecision(allowed, on), allowed).toMatchObject({ allowed: true });
    for (const refused of [
      // The rest of a service's site, which switching it on doesn't allow.
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.google.com/search?q=maps/embed",
      "https://www.google.com/maps/embedded",
      // Publish to web: open to anyone with the link.
      "https://app.powerbi.com/view?r=eyJrIjoiYWJjIn0",
      "https://app.powerbi.com/reportEmbed/more",
      // A browser would read these as another path.
      "https://www.youtube.com/embed/../watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/embed/%2e%2e/watch",
      "https://www.youtube.com/embed//x",
      "https://www.youtube.com:8443/embed/dQw4w9WgXcQ",
    ])
      expect(embedDecision(refused, on), refused).toMatchObject({
        allowed: false,
        reason: "serviceAddress",
      });
    // A site that lists a service's host itself allows all of it.
    expect(
      embedDecision("https://www.youtube.com/watch?v=x", {
        services: [],
        hosts: ["www.youtube.com"],
      }).allowed,
    ).toBe(true);
  });

  it("names each built-in service once, with hosts the settings would accept", () => {
    expect(new Set(embedServiceIds).size).toBe(embedServices.length);
    for (const service of embedServices)
      for (const source of service.sources) {
        expect(source.host, service.id).toMatch(embedHostPattern);
        for (const path of source.paths) expect(path.startsWith("/"), service.id).toBe(true);
      }
  });

  it("rejects unknown block types", () => {
    expect(
      PageContent.safeParse({ title: "", blocks: [{ id: "a", type: "script", props: {} }] })
        .success,
    ).toBe(false);
  });
});

describe("rich text", () => {
  it("writes allow-listed HTML and escapes text", () => {
    const html = richTextToHtml({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Siapa <layak>" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Baca ", marks: [{ type: "bold" }] },
            {
              type: "text",
              text: "panduan",
              marks: [{ type: "link", attrs: { href: '/panduan"x' } }],
            },
          ],
        },
      ],
    });
    expect(html).toBe(
      '<h2>Siapa &lt;layak&gt;</h2><p><strong>Baca </strong><a href="/panduan&quot;x">panduan</a></p>',
    );
  });
});
