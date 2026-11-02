/**
 * One error shape for every failure:
 *   { "error": { "code": "snake_case", "message": "…", "details"?: … } }
 */
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ValidationError } from "./validation.js";

/** Throw from a handler: `throw new HttpError(404, "note_not_found", "No note with that id")`. */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const body = (code: string, message: string, details?: unknown) => ({
  error: details === undefined ? { code, message } : { code, message, details },
});

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof HttpError)
    return reply.status(error.statusCode).send(body(error.code, error.message, error.details));

  if (error instanceof ValidationError)
    return reply.status(400).send(body("validation_error", `Invalid ${error.part}`, error.issues));

  const status = error.statusCode ?? 500;
  if (status >= 500) {
    request.log.error({ err: error }, "request failed");
    return reply
      .status(500)
      .send(body("internal_error", "Something went wrong on our side. Try again later."));
  }
  const code = (error.code ?? "bad_request").toLowerCase().replace(/^fst_err_/, "");
  return reply.status(status).send(body(code, error.message));
}

export function notFoundHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply
    .status(404)
    .send(body("not_found", `No route for ${request.method} ${request.url.split("?")[0]}`));
}
