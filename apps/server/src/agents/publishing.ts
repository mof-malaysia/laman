/**
 * The publishing tools (docs/mcp.md § Publishing and § Site machinery): what
 * makes drafts live, takes pages off the site, and runs the publishing
 * machinery. Each needs the permission its route does, so only roles that
 * may publish see them; the routes' own checks (the page checks before
 * publishing, live pages needing content.publish to move or delete) still
 * apply. Anything that takes content off the site is marked destructive, so
 * clients ask the officer first.
 */
import {
  JobsQuery,
  PublishSiteBody,
  type SiteDocName,
  UnpublishPageBody,
} from "@fiscal-sb/contracts";
import { z } from "zod";
import { none, reading, type Tool, ToolError, tool } from "./tool.js";

const Id = z.uuid();

/** A site document's publish tool: one each, so the audit log and permissions read plainly. */
const publishDoc = (document: SiteDocName, what: string) =>
  tool({
    name: `publish_${document}`,
    title: `Publish ${what}`,
    description: `Makes the ${what} draft live and rebuilds the site. Other drafts stay as they are.${
      document === "navigation"
        ? " Links to pages that aren't live are left out: check_navigation lists them first."
        : document === "theme"
          ? " The colours were checked for contrast when they were saved."
          : ""
    }`,
    access: "content.publish",
    input: none,
    run: ({ api }) => api.post(`/api/${document}/publish`),
  });

export const publishingTools: Tool[] = [
  reading({
    name: "list_waiting",
    title: "List what isn't live",
    description:
      "Everything with saved changes that aren't on the site yet: pages (and whether they've never been published), site documents and replaced files. The same list as Publishing in the admin.",
    input: none,
    run: ({ api }) => api.get("/api/publish/preview"),
  }),
  tool({
    name: "publish_page",
    title: "Publish a page",
    description:
      "Makes a page's draft live and rebuilds the site; only this page goes live. The checks before publishing must pass (check_pages): a blocking problem refuses it. An entry dated in the future is scheduled for its date instead.",
    access: "content.publish",
    input: z.object({ id: Id }),
    target: ({ id }) => id,
    run: ({ api }, { id }) => api.post(`/api/pages/${id}/publish`),
  }),
  tool({
    name: "schedule_publish",
    title: "Schedule a publish",
    description:
      "Publishes chosen pages' drafts and site documents at a time to come (an ISO date-time with its offset, such as 2026-12-01T08:00:00+08:00). Without pageIds or docs, everything waiting then. cancel_scheduled_publish takes it back.",
    access: "content.publish",
    input: z.object({
      runAt: PublishSiteBody.shape.runAt.unwrap(),
      pageIds: PublishSiteBody.shape.pageIds,
      docs: PublishSiteBody.shape.docs,
    }),
    run: ({ api }, body) => api.post("/api/publish", body),
  }),
  tool({
    name: "cancel_scheduled_publish",
    title: "Cancel a scheduled publish",
    description:
      "Takes back a publish that hasn't run yet, by its job id (list_jobs with scheduled).",
    access: "content.publish",
    input: z.object({ jobId: Id }),
    run: async ({ api }, { jobId }) => {
      await api.delete(`/api/jobs/${jobId}`);
      return { cancelled: jobId };
    },
  }),
  tool({
    name: "unpublish_page",
    title: "Take a page off the site",
    description:
      "Removes a page from the published site; its draft stays, to publish again later. `redirectTo` sends its visitors to another page instead of a 404.",
    access: "content.publish",
    input: z.object({ id: Id, ...UnpublishPageBody.shape }),
    destructive: true,
    target: ({ id }) => id,
    run: ({ api }, { id, redirectTo }) =>
      api.post(`/api/pages/${id}/unpublish`, redirectTo ? { redirectTo } : {}),
  }),
  tool({
    name: "delete_page",
    title: "Delete a page",
    description:
      "Moves a page to Recently deleted, off the site. Without `confirmed`, only says what would go with it: pages under it, pages that link to it, a navbar place. Then call again with `confirmed: true`. Pages under it need `children`: delete them too, or lift them a level. Deleting a page that's live needs a role that can publish.",
    access: "content.edit",
    input: z.object({
      id: Id,
      children: z.enum(["delete", "lift"]).optional(),
      redirectTo: Id.optional().describe("Send visitors of its address to this page."),
      confirmed: z.boolean().default(false),
    }),
    destructive: true,
    target: ({ id }) => id,
    run: async ({ api }, { id, children, redirectTo, confirmed }) => {
      const preview = (await api.get(`/api/pages/${id}/delete-preview`)) as {
        descendants: unknown[];
      };
      if (!confirmed)
        return {
          deleted: false,
          wouldTouch: preview,
          next: "Tell the officer what this touches, then call again with confirmed: true.",
        };
      if (preview.descendants.length && !children)
        throw new ToolError(
          "children_needed",
          "This page has pages under it: say whether to delete them too or lift them a level (children).",
        );
      await api.delete(`/api/pages/${id}`, { children, redirectTo });
      return { deleted: true, id };
    },
  }),
  tool({
    name: "restore_page",
    title: "Restore a deleted page",
    description:
      "Brings a page back from Recently deleted (list_deleted_pages), with the pages deleted along with it, under its old parent (or the home page if that's gone too). A taken address gets a suffix. A page that was live goes back on the site, which needs a role that can publish.",
    access: "content.edit",
    input: z.object({ id: Id }),
    target: ({ id }) => id,
    run: ({ api }, { id }) => api.post(`/api/trash/${id}/restore`),
  }),
  publishDoc("settings", "site settings"),
  publishDoc("navigation", "navigation (navbar and footer)"),
  publishDoc("announcement", "announcement"),
  publishDoc("search", "site search"),
  publishDoc("theme", "site colours"),
  tool({
    name: "replace_media",
    title: "Replace a file",
    description:
      "Puts a new file (from the officer's machine, base64) in place of one in the library, keeping its id: every page that uses it shows the new file, the live site from the next publish. The old file is kept: revert_media_file puts it back.",
    access: "content.publish",
    input: z.object({
      id: Id,
      filename: z.string().trim().min(1).max(200),
      data: z.string().min(1).describe("The file's bytes, base64-encoded."),
    }),
    target: ({ id }) => id,
    run: async ({ api }, { id, filename, data }) => {
      const bytes = Buffer.from(data, "base64");
      if (!bytes.length) throw new ToolError("invalid_input", "`data` isn't base64.");
      return api.upload(`/api/media/${id}/file`, filename, bytes, "PUT");
    },
  }),
  tool({
    name: "revert_media_file",
    title: "Put back a replaced file",
    description: "Swaps a file with the one it replaced, so calling it again undoes it.",
    access: "content.publish",
    input: z.object({ id: Id }),
    target: ({ id }) => id,
    run: ({ api }, { id }) => api.post(`/api/media/${id}/previous`),
  }),
  tool({
    name: "delete_media",
    title: "Delete a file",
    description:
      "Moves a file to Recently deleted. A file that pages use can't be deleted; restore_media brings it back.",
    access: "content.edit",
    input: z.object({ id: Id }),
    destructive: true,
    target: ({ id }) => id,
    run: ({ api }, { id }) => api.delete(`/api/media/${id}`),
  }),
  tool({
    name: "restore_media",
    title: "Restore a deleted file",
    description: "Brings a file back from Recently deleted.",
    access: "content.edit",
    input: z.object({ id: Id }),
    target: ({ id }) => id,
    run: ({ api }, { id }) => api.post(`/api/media/${id}/restore`),
  }),

  // Calendars: ICS feeds that sync into a listing's events
  tool({
    name: "list_calendar_sources",
    title: "List a listing's calendar sources",
    description:
      "The ICS calendars that sync into a listing's events: each one's name, when it last synced, how many events it brought, and whether a sync is held because it found far fewer events than before (accept_calendar_drop lets it go ahead). Adding or changing sources is for an admin in the builder.",
    access: "content.publish",
    readOnly: true,
    input: z.object({ listingId: Id }),
    target: ({ listingId }) => listingId,
    run: ({ api }, { listingId }) => api.get(`/api/pages/${listingId}/calendar-sources`),
  }),
  tool({
    name: "accept_calendar_drop",
    title: "Let a held calendar sync go ahead",
    description:
      "A calendar's last read found far fewer events than before, so they were kept on the site. This queues a sync that takes the missing ones off. Check with the officer first: it removes events from the live site.",
    access: "content.publish",
    destructive: true,
    input: z.object({ sourceId: Id }),
    run: ({ api }, { sourceId }) => api.post(`/api/calendar-sources/${sourceId}/accept`),
  }),
  tool({
    name: "sync_calendars",
    title: "Sync calendars now",
    description:
      "Reads every listing's calendar sources now instead of waiting for the next one (every 30 minutes); a sync that changed events publishes. Returns the job (list_jobs follows it).",
    access: "content.publish",
    input: none,
    run: ({ api }) => api.post("/api/calendar-sources/sync"),
  }),

  // The publishing machinery
  reading({
    name: "list_jobs",
    title: "List publishes and jobs",
    description:
      "Recent publishes, backups and other jobs, newest first, or (scheduled) the publishes still to come.",
    input: z.object({
      scheduled: z.boolean().optional(),
      kind: JobsQuery.shape.kind,
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }),
    run: ({ api }, query) => api.get("/api/jobs", query),
  }),
  reading({
    name: "get_job",
    title: "Get a job",
    description:
      "One job, and for a publish what happened to each address (written, redirect, removed, failed).",
    input: z.object({ id: Id }),
    run: ({ api }, { id }) => api.get(`/api/jobs/${id}`),
  }),
  tool({
    name: "retry_job",
    title: "Retry a failed job",
    description: "Runs a failed job again.",
    access: "site.manage",
    input: z.object({ id: Id }),
    run: ({ api }, { id }) => api.post(`/api/jobs/${id}/retry`),
  }),
  tool({
    name: "undo_publish",
    title: "Undo a publish",
    description:
      "Puts back the pages a publish made live, as they were before it, and rebuilds. Pages published again since are skipped.",
    access: "site.manage",
    input: z.object({ jobId: Id }),
    destructive: true,
    run: ({ api }, { jobId }) => api.post(`/api/publish/${jobId}/undo`),
  }),
  tool({
    name: "rebuild_site",
    title: "Rebuild the whole site",
    description:
      "Writes every page of the published site again from what's live. Nothing new goes live.",
    access: "site.manage",
    input: none,
    run: ({ api }) => api.post("/api/publish/rebuild"),
  }),
];
