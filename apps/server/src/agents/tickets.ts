/**
 * How a tool call reaches the API as its officer. The MCP handler checks the
 * agent's token, then calls /api in-process (`app.inject`) with a ticket:
 * random, one use, a few seconds long, and only ever in this process's
 * memory, so nothing outside can present one. The guard redeems it in place
 * of a session cookie, and the route runs its usual checks.
 */
import type { FastifyRequest } from "fastify";
import { newToken } from "../auth/tokens.js";
import type { User } from "../auth/users.js";
import type { Connection } from "./connections.js";

export const TICKET_HEADER = "x-agent-ticket";
const TICKET_MS = 30 * 1000;

type Ticket = { user: User; connection: Connection; expiresAt: number };

const tickets = new Map<string, Ticket>();

export function issueTicket(user: User, connection: Connection) {
  const at = Date.now();
  for (const [key, old] of tickets) if (old.expiresAt < at) tickets.delete(key);
  const ticket = newToken();
  tickets.set(ticket, { user, connection, expiresAt: at + TICKET_MS });
  return ticket;
}

/** The officer and connection a request's ticket was issued for; the ticket is spent. */
export function redeemTicket(request: FastifyRequest) {
  const header = request.headers[TICKET_HEADER];
  if (typeof header !== "string") return undefined;
  const ticket = tickets.get(header);
  tickets.delete(header);
  if (!ticket || ticket.expiresAt < Date.now()) return undefined;
  return ticket;
}
