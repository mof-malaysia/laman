import { describe, expect, it } from "@rstest/core";
import {
  Block,
  blockFields,
  blocks,
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
