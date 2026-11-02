import type { PageDocument } from "@fiscal-sb/blocks";
import type {
  AdminPreferences,
  AnalyticsQuery,
  AnalyticsStatus,
  AnalyticsSummary,
  Announcement,
  AnnouncementDoc,
  Breakdown,
  BreakdownList,
  CreatePageBody,
  DeletedPage,
  DeletePageQuery,
  DeletePreview,
  DocPublishResult,
  DuplicatePageBody,
  EntriesQuery,
  EntrySearchQuery,
  EntryList,
  ListingDetail,
  ListingSettings,
  Job,
  JobDetail,
  JobList,
  JobsQuery,
  MediaDetail,
  MediaList,
  MediaQuery,
  MovePageBody,
  Navigation,
  NavigationCheck,
  NavigationDoc,
  MoveResult,
  Page,
  PageSummary,
  PublishResult,
  PublishSiteBody,
  Revision,
  RevisionDetail,
  PrunePreview,
  PublishSiteResult,
  UndoPublishResult,
  SearchDoc,
  SettingsDoc,
  SiteDocName,
  SiteSearch,
  SiteSettings,
  ThemeChoice,
  ThemeDoc,
  Summary,
  UnpublishPageBody,
  UpdateMediaBody,
} from "@fiscal-sb/contracts";
import ky, { HTTPError } from "ky";

/**
 * The api client. Paths are relative ("api/pages"): in development Rsbuild
 * proxies them to the server, which serves this app in production.
 */
export const api = ky.create({ baseUrl: "/", timeout: 15_000 });

/** The server's error shape, `{ error: { code, message, details? } }`. */
export type ApiError = {
  code: string;
  message: string;
  details?: { path: string; message: string }[];
};

export async function apiError(error: unknown): Promise<ApiError | undefined> {
  if (!(error instanceof HTTPError)) return undefined;
  try {
    return ((await error.response.clone().json()) as { error: ApiError }).error;
  } catch {
    return undefined;
  }
}

type Data<T> = { data: T };
const data = <T>(response: { json: <J>() => Promise<J> }) =>
  response.json<Data<T>>().then((r) => r.data);

/** A query as search params, leaving out the values in `drop` (undefined by default). */
const queryParams = (query: object, drop: unknown[] = [undefined]) =>
  Object.fromEntries(
    Object.entries(query).flatMap(([k, v]) => (drop.includes(v) ? [] : [[k, String(v)]])),
  );

export const pagesApi = {
  list: () => data<PageSummary[]>(api.get("api/pages")),
  get: (id: string) => data<Page>(api.get(`api/pages/${id}`)),
  create: (body: CreatePageBody) => data<Page>(api.post("api/pages", { json: body })),
  saveDraft: (id: string, draft: PageDocument) =>
    data<Page>(api.put(`api/pages/${id}/draft`, { json: { draft } })),
  publish: (id: string) => data<PublishResult>(api.post(`api/pages/${id}/publish`)),
  move: (id: string, body: MovePageBody) =>
    data<MoveResult>(api.post(`api/pages/${id}/move`, { json: body })),
  duplicate: (id: string, body: DuplicatePageBody) =>
    data<Page>(api.post(`api/pages/${id}/duplicate`, { json: body })),
  unpublish: (id: string, body: UnpublishPageBody) =>
    data<Page>(api.post(`api/pages/${id}/unpublish`, { json: body })),
  deletePreview: (id: string) => data<DeletePreview>(api.get(`api/pages/${id}/delete-preview`)),
  delete: async (id: string, query: DeletePageQuery) => {
    await api.delete(`api/pages/${id}`, { searchParams: queryParams(query) });
  },
};

export const siteApi = {
  summary: () => data<Summary>(api.get("api/summary")),
  publish: (body: PublishSiteBody = {}) =>
    data<PublishSiteResult>(api.post("api/publish", { json: body })),
  /** Puts back what was live before a finished publish. */
  undo: (jobId: string) => data<UndoPublishResult>(api.post(`api/publish/${jobId}/undo`)),
  /** Writes every file of the live site again; it makes nothing new live. */
  rebuild: () => data<DocPublishResult>(api.post("api/publish/rebuild")),
  settings: () => data<SettingsDoc>(api.get("api/settings")),
  saveSettings: (draft: SiteSettings) =>
    data<SettingsDoc>(api.put("api/settings", { json: { draft } })),
  discardSettings: () => data<SettingsDoc>(api.post("api/settings/discard")),
  /** What keeping `keep` revisions per page would remove. */
  prunePreview: (keep: number) =>
    data<PrunePreview>(api.get("api/settings/prune-preview", { searchParams: { keep } })),
  navigation: () => data<NavigationDoc>(api.get("api/navigation")),
  saveNavigation: (draft: Navigation) =>
    data<NavigationDoc>(api.put("api/navigation", { json: { draft } })),
  discardNavigation: () => data<NavigationDoc>(api.post("api/navigation/discard")),
  /** The warnings an unsaved navigation would have. */
  checkNavigation: (draft: Navigation) =>
    data<NavigationCheck>(api.post("api/navigation/check", { json: { draft } })),
  /** A page with an unsaved navigation, announcement or theme around it, as the live site will show it. */
  renderWithSite: (
    pageId: string,
    unsaved: { navigation?: Navigation; announcement?: Announcement; theme?: ThemeChoice },
    signal?: AbortSignal,
  ) => api.post(`render/pages/${pageId}/site`, { json: unsaved, ...(signal && { signal }) }).text(),
  announcement: () => data<AnnouncementDoc>(api.get("api/announcement")),
  saveAnnouncement: (draft: Announcement) =>
    data<AnnouncementDoc>(api.put("api/announcement", { json: { draft } })),
  discardAnnouncement: () => data<AnnouncementDoc>(api.post("api/announcement/discard")),
  search: () => data<SearchDoc>(api.get("api/search")),
  saveSearch: (draft: SiteSearch) => data<SearchDoc>(api.put("api/search", { json: { draft } })),
  discardSearch: () => data<SearchDoc>(api.post("api/search/discard")),
  theme: () => data<ThemeDoc>(api.get("api/theme")),
  saveTheme: (draft: ThemeChoice) => data<ThemeDoc>(api.put("api/theme", { json: { draft } })),
  discardTheme: () => data<ThemeDoc>(api.post("api/theme/discard")),
  /** Makes one site document's draft live, and nothing else. */
  publishDoc: (name: SiteDocName) => data<DocPublishResult>(api.post(`api/${name}/publish`)),
};

/** The admin's preferences: one set for the whole site until there are users. */
export const preferencesApi = {
  get: () => data<AdminPreferences>(api.get("api/preferences")),
  save: (preferences: AdminPreferences) =>
    data<AdminPreferences>(api.put("api/preferences", { json: preferences })),
};

export const jobsApi = {
  get: (id: string) => data<Job>(api.get(`api/jobs/${id}`)),
  detail: (id: string) => data<JobDetail>(api.get(`api/jobs/${id}`)),
  list: (query: JobsQuery) =>
    data<JobList>(api.get("api/jobs", { searchParams: queryParams(query) })),
  cancel: async (id: string) => {
    await api.delete(`api/jobs/${id}`);
  },
  retry: (id: string) => data<Job>(api.post(`api/jobs/${id}/retry`)),
};

export const historyApi = {
  revisions: (pageId: string) => data<Revision[]>(api.get(`api/pages/${pageId}/revisions`)),
  revision: (pageId: string, revisionId: string) =>
    data<RevisionDetail>(api.get(`api/pages/${pageId}/revisions/${revisionId}`)),
  restore: (pageId: string, revisionId: string) =>
    data<Page>(api.post(`api/pages/${pageId}/revisions/${revisionId}/restore`)),
  trash: () => data<DeletedPage[]>(api.get("api/trash")),
  restoreDeleted: (id: string) => data<Page>(api.post(`api/trash/${id}/restore`)),
};

/** Polls a job until it has finished. */
/** Waiting to run or running: not finished yet. */
export const isActive = (job: Pick<Job, "status">) =>
  job.status === "queued" || job.status === "running";

export async function waitForJob(job: Job): Promise<Job> {
  let current = job;
  while (isActive(current)) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    current = await jobsApi.get(job.id);
  }
  return current;
}

/**
 * Sends one file as multipart/form-data with XMLHttpRequest, which (unlike
 * fetch) reports upload progress. Rejects with the server's error.
 */
function sendFile(
  method: "POST" | "PUT",
  url: string,
  file: File,
  onProgress?: (percent: number) => void,
) {
  return new Promise<MediaDetail>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `/${url}`);
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener("load", () => {
      try {
        const body = JSON.parse(xhr.responseText) as { data?: MediaDetail; error?: ApiError };
        if (xhr.status < 300 && body.data) resolve(body.data);
        else
          reject(new UploadError(body.error ?? { code: "upload_failed", message: xhr.statusText }));
      } catch {
        reject(new UploadError({ code: "upload_failed", message: xhr.statusText }));
      }
    });
    xhr.addEventListener("error", () =>
      reject(
        new UploadError({ code: "network_error", message: "The upload didn't reach the server" }),
      ),
    );
    const body = new FormData();
    body.append("file", file);
    xhr.send(body);
  });
}

export class UploadError extends Error {
  readonly error: ApiError;
  constructor(error: ApiError) {
    super(error.message);
    this.error = error;
  }
}

/** One file's details, shared by every screen that shows it. */
export const mediaQuery = (id: string | null | undefined) => ({
  queryKey: ["media", "one", id],
  queryFn: () => mediaApi.get(id ?? ""),
  enabled: Boolean(id),
});

export const mediaApi = {
  list: (query: MediaQuery) => {
    const searchParams = queryParams(query, [undefined, "", false]);
    return data<MediaList>(api.get("api/media", { searchParams }));
  },
  get: (id: string) => data<MediaDetail>(api.get(`api/media/${id}`)),
  update: (id: string, body: UpdateMediaBody) =>
    data<MediaDetail>(api.patch(`api/media/${id}`, { json: body })),
  /** Moves it to Recently deleted. */
  delete: (id: string) => data<MediaDetail>(api.delete(`api/media/${id}`)),
  restore: (id: string) => data<MediaDetail>(api.post(`api/media/${id}/restore`)),
  /** Puts back the file before the last replace. */
  restorePrevious: (id: string) => data<MediaDetail>(api.post(`api/media/${id}/previous`)),
  upload: (file: File, onProgress?: (percent: number) => void) =>
    sendFile("POST", "api/media", file, onProgress),
  replace: (id: string, file: File, onProgress?: (percent: number) => void) =>
    sendFile("PUT", `api/media/${id}/file`, file, onProgress),
};

export const listingApi = {
  get: (id: string) => data<ListingDetail>(api.get(`api/pages/${id}/listing`)),
  save: (id: string, settings: ListingSettings) =>
    data<ListingDetail>(api.put(`api/pages/${id}/listing`, { json: { settings } })),
  make: (id: string) => data<Page>(api.post(`api/pages/${id}/make-listing`)),
  entries: (id: string, query: EntriesQuery) =>
    data<EntryList>(
      api.get(`api/pages/${id}/entries`, { searchParams: queryParams(query, [undefined, ""]) }),
    ),
  write: (id: string, title: string) =>
    data<Page>(api.post(`api/pages/${id}/entries`, { json: { title } })),
  /** Entries in every listing whose title or address contains `search`. */
  search: ({ search, limit }: EntrySearchQuery) =>
    data<PageSummary[]>(
      api.get("api/entries", {
        searchParams: { search, ...(limit !== undefined && { limit: String(limit) }) },
      }),
    ),
};

export const analyticsApi = {
  summary: (query: AnalyticsQuery) =>
    data<AnalyticsSummary>(api.get("api/analytics/summary", { searchParams: queryParams(query) })),
  breakdown: (query: AnalyticsQuery & { by: Breakdown; limit?: number }) =>
    data<BreakdownList>(api.get("api/analytics/breakdown", { searchParams: queryParams(query) })),
  status: () => data<AnalyticsStatus>(api.get("api/analytics/status")),
};
