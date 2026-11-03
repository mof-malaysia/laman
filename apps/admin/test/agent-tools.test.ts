import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "@rstest/core";
import { isLookup, refusedBecause, toolSaid } from "../src/users/agent-tools";

const serverAgents = new URL("../../server/src/agents/", import.meta.url);

/** Every tool the server defines, by the `name: "…"` its definitions carry. */
const serverTools = readdirSync(serverAgents)
  .filter((file) => file.endsWith(".ts"))
  .flatMap((file) => [
    ...readFileSync(new URL(file, serverAgents), "utf8").matchAll(/\bname: "([a-z_]+)"/g),
  ])
  .map((match) => match[1] ?? "");

describe("agent tools", () => {
  it("says every server tool in words", () => {
    expect(serverTools.length).toBeGreaterThan(50);
    for (const tool of serverTools) expect(toolSaid(tool), tool).not.toContain(tool);
  });

  it("falls back to the tool's name for one it doesn't know", () => {
    expect(toolSaid("future_tool")).toBe("Used future_tool");
  });

  it("tells looking from changing", () => {
    expect(isLookup("get_page")).toBe(true);
    expect(isLookup("whoami")).toBe(true);
    expect(isLookup("publish_page")).toBe(false);
    expect(isLookup("update_settings")).toBe(false);
  });

  it("explains a refusal without its code", () => {
    expect(refusedBecause("forbidden")).toBe("their role doesn't allow it");
    expect(refusedBecause("draft_conflict")).toBe("someone else changed it first");
    expect(refusedBecause("page_not_found")).toBe("it couldn't be found");
    expect(refusedBecause("internal_error")).toBe("something went wrong on the builder's side");
    expect(refusedBecause("slug_taken")).toBe("the builder didn't accept what the agent sent");
  });
});
