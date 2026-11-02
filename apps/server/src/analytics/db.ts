/**
 * analytics.db: views, downloads and outbound clicks, and the day's salt. A
 * file of its own beside site.db, so it grows, backs up and locks apart from
 * the content. See docs/analytics.md.
 */
import type { Kysely } from "kysely";
import type { Migration } from "kysely/migration";
import { openSqlite } from "../db/index.js";
import { migrate } from "../db/migrations.js";

export type ViewsTable = {
  /** The beacon's random id for this page load. */
  id: string;
  /** sha256 of the day's salt, IP, user agent and host: one visitor for one day. */
  visitor: string;
  /** Views by one visitor with gaps under 30 minutes. */
  visit: string;
  /** Epoch ms. */
  at: number;
  /** Local date, "2026-11-02", and hour 0–23, in the server's time zone. */
  day: string;
  hour: number;
  page_id: string | null;
  path: string;
  /** Host of the other site the visitor came from. */
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  browser: string;
  os: string;
  /** desktop, mobile or tablet. */
  device: string;
  /** Width bucket: s (< 640), m (< 1024), l (< 1440), xl. "" when unknown. */
  screen: string;
  /** Primary language subtag, "ms". */
  language: string;
  /** ISO 3166 alpha-2, "" without a country database. */
  country: string;
  /** Ms the page was visible, summed over its leave beacons. */
  visible: number;
};

export type EventsTable = {
  id: number | undefined;
  at: number;
  day: string;
  visitor: string;
  kind: "download" | "outbound";
  page_id: string | null;
  path: string;
  /** The file's path, or the other site's host. */
  target: string;
};

export type SaltsTable = { day: string; salt: string };

export type AnalyticsDatabase = {
  views: ViewsTable;
  events: EventsTable;
  salts: SaltsTable;
};

export type AnalyticsDb = Kysely<AnalyticsDatabase>;

/** Never edit one that has shipped: add a new one. */
const migrations: Record<string, Migration> = {
  "0001_analytics": {
    async up(db: Kysely<unknown>) {
      await db.schema
        .createTable("views")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("visitor", "text", (c) => c.notNull())
        .addColumn("visit", "text", (c) => c.notNull())
        .addColumn("at", "integer", (c) => c.notNull())
        .addColumn("day", "text", (c) => c.notNull())
        .addColumn("hour", "integer", (c) => c.notNull())
        .addColumn("page_id", "text")
        .addColumn("path", "text", (c) => c.notNull())
        .addColumn("referrer", "text")
        .addColumn("utm_source", "text")
        .addColumn("utm_medium", "text")
        .addColumn("utm_campaign", "text")
        .addColumn("browser", "text", (c) => c.notNull())
        .addColumn("os", "text", (c) => c.notNull())
        .addColumn("device", "text", (c) => c.notNull())
        .addColumn("screen", "text", (c) => c.notNull())
        .addColumn("language", "text", (c) => c.notNull())
        .addColumn("country", "text", (c) => c.notNull())
        .addColumn("visible", "integer", (c) => c.notNull().defaultTo(0))
        .execute();
      await db.schema.createIndex("views_day").on("views").column("day").execute();
      await db.schema
        .createIndex("views_page_day")
        .on("views")
        .columns(["page_id", "day"])
        .execute();
      await db.schema
        .createIndex("views_visitor_at")
        .on("views")
        .columns(["visitor", "at"])
        .execute();
      await db.schema
        .createTable("events")
        .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
        .addColumn("at", "integer", (c) => c.notNull())
        .addColumn("day", "text", (c) => c.notNull())
        .addColumn("visitor", "text", (c) => c.notNull())
        .addColumn("kind", "text", (c) => c.notNull())
        .addColumn("page_id", "text")
        .addColumn("path", "text", (c) => c.notNull())
        .addColumn("target", "text", (c) => c.notNull())
        .execute();
      await db.schema
        .createIndex("events_kind_day")
        .on("events")
        .columns(["kind", "day"])
        .execute();
      await db.schema
        .createTable("salts")
        .addColumn("day", "text", (c) => c.primaryKey())
        .addColumn("salt", "text", (c) => c.notNull())
        .execute();
    },
  },

  // Entry and exit pages order each visit's views; pruning deletes events by day.
  "0002_report_indexes": {
    async up(db: Kysely<unknown>) {
      await db.schema.createIndex("views_visit_at").on("views").columns(["visit", "at"]).execute();
      await db.schema.createIndex("events_day").on("events").column("day").execute();
    },
  },
};

/** Opens (creating if needed) analytics.db at `path` and migrates it. ":memory:" for tests. */
export async function openAnalyticsDatabase(path: string): Promise<AnalyticsDb> {
  const { db } = openSqlite<AnalyticsDatabase>(path);
  await migrate(db as Kysely<unknown>, migrations);
  return db;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The local date and hour of an instant, in the server's time zone. */
export function localDay(at: number) {
  const d = new Date(at);
  return {
    day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hour: d.getHours(),
  };
}

/** Epoch ms of local midnight at the start of `day`. */
export const startOfDay = (day: string) => new Date(`${day}T00:00:00`).getTime();

/** `day` moved by `days`, as a local date. */
export const addDays = (day: string, days: number) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDay(d.getTime()).day;
};
