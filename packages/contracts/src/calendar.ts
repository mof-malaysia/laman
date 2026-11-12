/**
 * Calendar sources: ICS feeds a listing reads every half hour and turns into
 * event entries (docs/site-builder.md § Calendar sources).
 */
import { z } from "zod";

/** At most this many sources on one listing. */
export const MAX_CALENDAR_SOURCES = 50;

/** A source as the admin sees it: its address masked, with how its last reads went. */
export const CalendarSource = z.object({
  id: z.uuid(),
  listingId: z.uuid(),
  name: z.string(),
  /** Its host and last few characters: the full address is never sent back. */
  address: z.string(),
  /** The listing's category its events take. */
  category: z.string().nullable(),
  /** The listing's location for events whose place can't be matched. */
  location: z.string().nullable(),
  enabled: z.boolean(),
  /** The last read, successful or not. */
  checkedAt: z.string().nullable(),
  /** The last successful read. */
  syncedAt: z.string().nullable(),
  error: z.string().nullable(),
  /** Reads in a row that failed. */
  failures: z.number().int(),
  /** Occurrences in the window at the last successful read. */
  events: z.number().int(),
  /**
   * The last read found far fewer events than the one before (an unpublished
   * calendar answers with an empty file), so its `events` were kept: this is
   * how many it found. Accepting lets the next sync remove them.
   */
  held: z.number().int().nullable(),
});
export type CalendarSource = z.infer<typeof CalendarSource>;

export const CalendarSourceParams = z.object({ sourceId: z.uuid() });

const SlugOrNull = z
  .string()
  .max(80)
  .nullish()
  .transform((v) => v || null);

export const SaveCalendarSourceBody = z.object({
  name: z.string().trim().min(1, "Give the calendar a name").max(80),
  /** Required when adding; leave out to keep the stored address. `webcal://` is read as `https://`. */
  address: z.string().trim().max(2000).optional(),
  category: SlugOrNull,
  location: SlugOrNull,
  enabled: z.boolean().default(true),
});
export type SaveCalendarSourceBody = z.input<typeof SaveCalendarSourceBody>;
