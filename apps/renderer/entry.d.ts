/** Types for the built entry (dist/server/entry.mjs) the server imports. */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RenderInput } from "@fiscal-sb/blocks";

export type RenderLocals = { render: RenderInput };

/** Astro's Node middleware: renders the request, or calls `next` when no route matches. */
export declare const handler: (
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void,
  locals: RenderLocals,
) => Promise<void>;
