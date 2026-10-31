/**
 * Routes declare Valibot schemas directly (`schema: { querystring: HelloQuery }`).
 * Fastify validates with Valibot, so transforms such as `v.trim()` apply, and
 * the OpenAPI document gets the same schemas converted to JSON Schema.
 */
import { toJsonSchema } from "@valibot/to-json-schema";
import type { FastifyInstance, FastifySchema } from "fastify";
import * as v from "valibot";

const isValibot = (schema: unknown): schema is v.GenericSchema =>
  typeof schema === "object" && schema !== null && (schema as { kind?: unknown }).kind === "schema";

export class ValidationError extends Error {
  readonly part: string;
  readonly issues: { path: string; message: string }[];

  constructor(part: string, issues: v.BaseIssue<unknown>[]) {
    super(`Invalid ${part}`);
    this.part = part;
    this.issues = issues.map((issue) => ({
      path: v.getDotPath(issue) ?? "",
      message: issue.message,
    }));
  }
}

export function useValibot(app: FastifyInstance) {
  app.setValidatorCompiler(({ schema, httpPart }) => (data) => {
    if (!isValibot(schema)) return { value: data };
    const result = v.safeParse(schema, data);
    return result.success
      ? { value: result.output }
      : { error: new ValidationError(httpPart ?? "request", result.issues) };
  });
  // Responses are plain JSON; the response schemas are for documentation.
  app.setSerializerCompiler(() => (data) => JSON.stringify(data));
}

function toOpenApi(schema: unknown): unknown {
  if (!isValibot(schema)) return schema;
  const { $schema: _, ...json } = toJsonSchema(schema, { errorMode: "ignore" });
  return json;
}

/** `transform` for @fastify/swagger: Valibot schemas in, JSON Schema out. */
export function openApiTransform({ schema, url }: { schema: FastifySchema; url: string }) {
  if (!schema) return { schema, url };
  const converted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    converted[key] =
      key === "response" && value && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).map(([code, s]) => [code, toOpenApi(s)]))
        : toOpenApi(value);
  }
  return { schema: converted as FastifySchema, url };
}
