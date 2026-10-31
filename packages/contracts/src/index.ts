/**
 * The wire contract shared by the api and the web app. Each schema is both a
 * runtime validator (Valibot) and a type; the api also turns them into its
 * OpenAPI document.
 */
import * as v from "valibot";

/** Query string of `GET /v1/hello`. */
export const HelloQuery = v.object({
  name: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100))),
});
export type HelloQuery = v.InferOutput<typeof HelloQuery>;

export const Greeting = v.object({
  message: v.string(),
});
export type Greeting = v.InferOutput<typeof Greeting>;

/** Every successful response wraps its payload in `data`. */
export const envelope = <T extends v.GenericSchema>(data: T) => v.object({ data });
