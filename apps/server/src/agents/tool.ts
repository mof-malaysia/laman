/**
 * What a tool is (docs/mcp.md § Tools): its name and description for the
 * agent, the permission it needs, its input as Zod (the JSON Schema clients
 * see), and its work, done through the API as the officer.
 */
import { z } from "zod";
import type { Access } from "../auth/guard.js";
import type { User } from "../auth/users.js";
import type { Connection } from "./connections.js";

/** The API as the officer: JSON in, the response's `data` out, a refusal thrown as a ToolError. */
export type Api = {
  get: (path: string, query?: Record<string, unknown>) => Promise<unknown>;
  post: (path: string, body?: unknown) => Promise<unknown>;
  put: (path: string, body: unknown) => Promise<unknown>;
  patch: (path: string, body: unknown) => Promise<unknown>;
  delete: (path: string, query?: Record<string, unknown>) => Promise<unknown>;
  /** One file, as the media library's upload (POST) and replace (PUT) take it. */
  upload: (
    path: string,
    filename: string,
    bytes: Buffer,
    method?: "POST" | "PUT",
  ) => Promise<unknown>;
  /** A page from /render, as HTML. */
  html: (path: string, query?: Record<string, unknown>) => Promise<string>;
};

/** `origin`: the builder's address as the agent reaches it, for links it's given. */
export type ToolContext = { user: User; connection: Connection; api: Api; origin: string };

/** A refusal the agent sees: the API's code and message, so it can correct itself. */
export class ToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export type Tool<I extends z.ZodObject = z.ZodObject> = {
  name: string;
  title: string;
  description: string;
  access: Access;
  input: I;
  /** Reads only: clients may run it without asking. */
  readOnly: boolean;
  /** Takes something off the site or out of reach: clients ask the officer first. */
  destructive?: boolean;
  /** What the call was about, for the audit log: a page, a file. */
  target?: (input: z.output<I>) => string | undefined;
  run: (ctx: ToolContext, input: z.output<I>) => Promise<unknown>;
};

type Definition<I extends z.ZodObject> = Omit<Tool<I>, "readOnly"> & { readOnly?: boolean };

/** A tool; it changes something unless it says `readOnly`. */
export const tool = <I extends z.ZodObject>({ readOnly = false, ...definition }: Definition<I>) =>
  ({ ...definition, readOnly }) as unknown as Tool;

/** A tool that only reads, open to anyone signed in. */
export const reading = <I extends z.ZodObject>(definition: Omit<Tool<I>, "access" | "readOnly">) =>
  tool({ ...definition, access: "signedIn", readOnly: true });

/** A tool that changes drafts: content.edit, like the routes it calls. */
export const drafting = <I extends z.ZodObject>(definition: Omit<Tool<I>, "access" | "readOnly">) =>
  tool({ ...definition, access: "content.edit" });

/** The input of a tool that takes none. */
export const none = z.object({});
