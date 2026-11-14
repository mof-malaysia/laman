import { describe, expect, it } from "@rstest/core";
import { type Block, type PageDocument, blockFields, blocks, newBlock } from "@laman/blocks";
import { blockLabel } from "../src/i18n/registry";
import { pageChanges } from "../src/lib/page-diff";

/** A block type with a plain text field, and one with a select whose default is filled in on parse. */
const textual = blocks.find((b) => blockFields(b.type).some((f) => f.widget === "text"))!;
const textField = blockFields(textual.type).find((f) => f.widget === "text")!.name;
const selecting = blocks.find((b) =>
  blockFields(b.type).some((f) => f.widget === "select" && f.defaultValue !== undefined),
)!;

const doc = (blocksOf: Block[]): PageDocument => ({
  ms: { title: "Soalan Lazim", blocks: blocksOf },
});
const withText = (block: Block, text: string): Block =>
  ({ ...block, props: { ...block.props, [textField]: text } }) as Block;

describe("pageChanges", () => {
  const a = withText(newBlock(textual.type, "a"), "Belanjawan 2027 akan dibentangkan");
  const b = newBlock(selecting.type, "b");

  it("calls everything added on a page that was never live", () => {
    const changes = pageChanges(undefined, doc([a, b]));
    expect(changes.map((c) => c.kind)).toEqual(["added", "added", "added"]);
    expect(changes[0]!.id).toBe("title");
  });

  it("calls every block the same when nothing changed", () => {
    expect(pageChanges(doc([a, b]), doc([a, b])).map((c) => c.kind)).toEqual(["same", "same"]);
  });

  it("names the changed field, with what was live and what will be", () => {
    const edited = withText(a, "Belanjawan 2027 telah dibentangkan");
    const [change] = pageChanges(doc([a]), doc([edited]));
    expect(change).toMatchObject({ id: "a", kind: "changed", label: blockLabel(textual.type) });
    expect(change!.fields).toHaveLength(1);
    expect(change!.fields[0]).toMatchObject({
      before: "Belanjawan 2027 akan dibentangkan",
      after: "Belanjawan 2027 telah dibentangkan",
    });
  });

  it("lists a removed block after the draft's blocks", () => {
    expect(pageChanges(doc([a, b]), doc([b])).map((c) => [c.id, c.kind])).toEqual([
      ["b", "same"],
      ["a", "removed"],
    ]);
  });
});
