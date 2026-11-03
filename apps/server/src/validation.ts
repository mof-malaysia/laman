/**
 * Routes declare Zod schemas directly (`schema: { params: PageParams }`).
 * Fastify validates with Zod, so transforms such as `.trim()` apply, and the
 * OpenAPI document gets the same schemas converted to JSON Schema.
 */
import type { FastifyInstance, FastifySchema } from "fastify";
import { z } from "zod";

const isZod = (schema: unknown): schema is z.ZodType =>
  typeof schema === "object" && schema !== null && "_zod" in schema;

export class ValidationError extends Error {
  readonly part: string;
  readonly issues: { path: string; message: string }[];

  constructor(part: string, issues: z.core.$ZodIssue[]) {
    super(`Invalid ${part}`);
    this.part = part;
    this.issues = issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
  }
}

export function useZod(app: FastifyInstance) {
  app.setValidatorCompiler(({ schema, httpPart }) => (data) => {
    if (!isZod(schema)) return { value: data };
    const result = schema.safeParse(data);
    return result.success
      ? { value: result.data }
      : { error: new ValidationError(httpPart ?? "request", result.error.issues) };
  });
  // Responses are plain JSON; the response schemas are for documentation.
  app.setSerializerCompiler(() => (data) => JSON.stringify(data));
}

/** A Zod schema as JSON Schema, as the OpenAPI document and agents' tools show it. */
export function jsonSchemaOf(schema: z.ZodType, io: "input" | "output" = "input") {
  const { $schema: _, ...json } = z.toJSONSchema(schema, { io, unrepresentable: "any" });
  return json;
}

const toOpenApi = (schema: unknown, io: "input" | "output"): unknown =>
  isZod(schema) ? jsonSchemaOf(schema, io) : schema;

/** `transform` for @fastify/swagger: Zod schemas in, JSON Schema out. */
export function openApiTransform({ schema, url }: { schema: FastifySchema; url: string }) {
  if (!schema) return { schema, url };
  const converted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    converted[key] =
      key === "response" && value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value).map(([code, s]) => [code, toOpenApi(s, "output")]),
          )
        : toOpenApi(value, "input");
  }
  return { schema: converted as FastifySchema, url };
}
