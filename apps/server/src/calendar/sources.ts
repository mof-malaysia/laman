/** A listing's calendar sources: adding, changing, removing, and how they look to the admin. */
import { randomUUID } from "node:crypto";
import {
  type CalendarSource,
  MAX_CALENDAR_SOURCES,
  type SaveCalendarSourceBody,
} from "@laman/contracts";
import { type Db, now } from "../db/index.js";
import type { CalendarSourceRow } from "../db/schema.js";
import { HttpError } from "../errors.js";
import { listingSettings } from "../content/entries.js";
import { feedAddress, maskAddress } from "./fetch.js";

const notFound = () => new HttpError(404, "source_not_found", "No calendar source with that id");

export const toSource = (row: CalendarSourceRow): CalendarSource => ({
  id: row.id,
  listingId: row.listing_id,
  name: row.name,
  address: maskAddress(row.address),
  category: row.category,
  location: row.location,
  enabled: row.enabled === 1,
  checkedAt: row.checked_at,
  syncedAt: row.synced_at,
  error: row.error,
  failures: row.failures,
  events: row.events,
  held: row.held_found,
});

export async function listSources(db: Db, listingId: string) {
  const rows = await db
    .selectFrom("calendar_sources")
    .selectAll()
    .where("listing_id", "=", listingId)
    .orderBy("position")
    .execute();
  return rows.map(toSource);
}

export async function getSource(db: Db, id: string) {
  const row = await db
    .selectFrom("calendar_sources")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  if (!row) throw notFound();
  return row;
}

/**
 * The columns a save writes, once its category and location are checked to
 * be the listing's own (`listingSettings` also refuses a page that isn't a
 * live listing).
 */
async function columnsOf(
  db: Db,
  listingId: string,
  input: SaveCalendarSourceBody,
  address: string,
) {
  const settings = await listingSettings(db, listingId);
  if (input.category && !settings.categories.some((c) => c.slug === input.category))
    throw new HttpError(400, "unknown_category", "Choose one of the listing's categories");
  if (input.location && !settings.locations.some((l) => l.slug === input.location))
    throw new HttpError(400, "unknown_location", "Choose one of the listing's locations");
  return {
    name: input.name,
    address,
    category: input.category ?? null,
    location: input.location ?? null,
    enabled: input.enabled === false ? 0 : 1,
  };
}

function addressOf(typed: string) {
  const address = feedAddress(typed);
  if (!address)
    throw new HttpError(
      400,
      "bad_address",
      "Use the calendar's https or webcal address, as its calendar app gives it",
    );
  return address;
}

export async function addSource(
  db: Db,
  listingId: string,
  input: SaveCalendarSourceBody,
): Promise<CalendarSource> {
  if (!input.address) throw new HttpError(400, "address_required", "Paste the calendar's address");
  const columns = await columnsOf(db, listingId, input, addressOf(input.address));
  const existing = await db
    .selectFrom("calendar_sources")
    .select(["position", "address"])
    .where("listing_id", "=", listingId)
    .execute();
  if (existing.length >= MAX_CALENDAR_SOURCES)
    throw new HttpError(
      409,
      "too_many_sources",
      `A listing reads at most ${MAX_CALENDAR_SOURCES} calendars`,
    );
  if (existing.some((s) => s.address === columns.address))
    throw new HttpError(409, "source_exists", "This listing already reads that calendar");
  const id = randomUUID();
  await db
    .insertInto("calendar_sources")
    .values({
      id,
      listing_id: listingId,
      ...columns,
      position: Math.max(-1, ...existing.map((s) => s.position)) + 1,
      created_at: now(),
      checked_at: null,
      synced_at: null,
      error: null,
      held_found: null,
    })
    .execute();
  return toSource(await getSource(db, id));
}

export async function saveSource(
  db: Db,
  id: string,
  input: SaveCalendarSourceBody,
): Promise<CalendarSource> {
  const row = await getSource(db, id);
  const address = input.address ? addressOf(input.address) : row.address;
  const moved = address !== row.address;
  await db
    .updateTable("calendar_sources")
    .set({
      ...(await columnsOf(db, row.listing_id, input, address)),
      // A new address starts afresh: its count and any held drop were the old one's.
      ...(moved && { events: 0, held_found: null, failures: 0, error: null }),
    })
    .where("id", "=", id)
    .execute();
  return toSource(await getSource(db, id));
}

/** Removes the source; the next sync takes off the events only it had. */
export async function deleteSource(db: Db, id: string) {
  const row = await getSource(db, id);
  await db.deleteFrom("calendar_sources").where("id", "=", id).execute();
  return row;
}

/** Lets the next sync remove the events a held read no longer has. */
export async function acceptDrop(db: Db, id: string) {
  const row = await getSource(db, id);
  if (row.held_found === null)
    throw new HttpError(409, "not_held", "This calendar's last read wasn't held back");
  await db.updateTable("calendar_sources").set({ accept_drop: 1 }).where("id", "=", id).execute();
}

/** Whether a calendar that's on hasn't been read for `ms`, so a sync has work. */
export async function sourcesDue(db: Db, ms: number) {
  const since = new Date(Date.now() - ms).toISOString();
  const row = await db
    .selectFrom("calendar_sources")
    .select("id")
    .where("enabled", "=", 1)
    .where((eb) => eb.or([eb("checked_at", "is", null), eb("checked_at", "<", since)]))
    .limit(1)
    .executeTakeFirst();
  return Boolean(row);
}
