/** The dashboard and the status bar: what's waiting to go live, and how publishing went. */
import { stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { ftdsPrimary } from "@fiscal-sb/blocks";
import type { FastifyPluginAsync } from "fastify";
import { Summary, envelope } from "../contract.js";
import { mediaTotals } from "../content/media.js";
import { listPages } from "../content/pages.js";
import { waitingItems } from "../content/publishing.js";
import { toJob } from "../jobs.js";
import { type BackupOptions, backupStatus } from "./backups.js";
import { renderHtml } from "../render.js";

// src/routes and dist/routes are both two levels below package.json.
const { version } = createRequire(import.meta.url)("../../package.json") as { version: string };

const RENDERER_CHECK_MS = 30_000;

async function databaseBytes(dataDir: string) {
  const sizes = await Promise.all(
    ["site.db", "site.db-wal"].map((file) =>
      stat(join(dataDir, file)).then(
        (s) => s.size,
        () => 0,
      ),
    ),
  );
  return sizes.reduce((a, b) => a + b, 0);
}

export const summaryRoutes: FastifyPluginAsync<{
  siteUrl: string | undefined;
  maxUploadBytes: number;
  dataDir: string;
  backup: BackupOptions;
}> = async (app, { siteUrl, maxUploadBytes, dataDir, backup }) => {
  const { db } = app;
  let renderer = { ok: true, checkedAt: 0 };

  /** Renders an empty page now and then, so a broken renderer shows before a publish fails. */
  async function rendererOk() {
    if (Date.now() - renderer.checkedAt < RENDERER_CHECK_MS) return renderer.ok;
    const ok = await renderHtml({
      mode: "preview",
      locale: "ms",
      path: "/",
      page: { title: "", blocks: [] },
      site: {
        name: "",
        agency: "",
        nav: [],
        footer: [],
        contact: { address: "", phone: "", email: "", hours: "" },
        social: [],
        theme: { primary: ftdsPrimary },
      },
    }).then(
      () => true,
      (error: unknown) => {
        app.log.error({ err: error }, "renderer check failed");
        return false;
      },
    );
    renderer = { ok, checkedAt: Date.now() };
    return ok;
  }

  app.get(
    "/summary",
    {
      config: { access: "signedIn" },
      schema: {
        summary: "Dashboard summary",
        description:
          "Page counts, what isn't live yet (as `GET /publish/preview`), the latest saved drafts, the last five publishes, the renderer's health and how the last backup went.",
        tags: ["summary"],
        response: { 200: envelope(Summary) },
      },
    },
    async () => {
      const pages = await listPages(db);
      const [jobs, waiting, ok, media, backups] = await Promise.all([
        db
          .selectFrom("jobs")
          .selectAll()
          .where("kind", "=", "publish")
          .where("run_at", "is", null)
          .orderBy("created_at", "desc")
          .limit(5)
          .execute(),
        waitingItems(db, pages),
        rendererOk(),
        mediaTotals(db),
        backupStatus(db, backup),
      ]);
      const publishes = jobs.map(toJob);
      return {
        data: {
          pages: { total: pages.length, drafts: pages.filter((p) => p.status === "draft").length },
          waiting,
          media: { ...media, maxBytes: maxUploadBytes },
          recentEdits: pages
            .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, 10),
          publishes,
          renderer: { ok },
          site: {
            url: siteUrl ?? null,
            version,
            dataDir,
            databaseBytes: await databaseBytes(dataDir),
          },
          backup: backups,
        },
      };
    },
  );
};
