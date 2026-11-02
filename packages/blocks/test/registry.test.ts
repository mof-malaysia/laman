import { describe, expect, it } from "@rstest/core";
import {
  Block,
  blockFields,
  blocks,
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
