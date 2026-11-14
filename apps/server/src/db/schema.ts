/** Table types for Kysely. JSON columns hold text; see the repositories for shapes. */
import type { AuditAction, Role, SessionStage } from "@laman/contracts";
import type { Generated, Selectable } from "kysely";

export type PagesTable = {
  id: string;
  /** null only for the home page, the root of the tree. */
  parent_id: string | null;
  /** One level of the address, unique among live siblings. "" is the home page. */
  slug: string;
  /** Order among siblings. */
  position: number;
  /** PageDocument as JSON. */
  draft: string;
  published_revision_id: string | null;
  created_at: string;
  updated_at: string;
  /** Soft delete: the page is off the site and out of the tree. */
  deleted_at: string | null;
  /** The template it started from; null for pages made before templates. */
  template: string | null;
  /** page, listing (collects dated entries) or entry (one article under a listing). */
  kind: Generated<"page" | "listing" | "entry">;
  /** Listing pages: ListingSettings as JSON. */
  listing: string | null;
  /** Entries: the draft's publish date, for sorting and scheduling. */
  publish_at: string | null;
  /** Who last saved the draft. */
  updated_by: Generated<string | null>;
};

export type RevisionsTable = {
  id: string;
  page_id: string;
  /** PageDocument as JSON, frozen when published or saved. */
  content: string;
  /** published: what went live. draft: a saved draft, kept for history. */
  kind: Generated<"published" | "draft">;
  created_at: string;
  created_by: Generated<string | null>;
  /** The agent it was made through (docs/mcp.md); null when made in the admin. */
  created_via: Generated<string | null>;
};

export type SettingsTable = {
  key: string;
  /** JSON. */
  value: string;
  /** Who last saved it, for drafted documents. */
  updated_by: Generated<string | null>;
};

export type JobsTable = {
  id: string;
  kind: string;
  payload: string;
  status: "queued" | "running" | "done" | "failed";
  error: string | null;
  /** JSON counts the handler returned, e.g. { pages: 12 }. */
  result: string | null;
  /** A scheduled job waits in the queue until this time. */
  run_at: string | null;
  /** JSON: what happened to each page in a publish. */
  log: string | null;
  attempts: Generated<number>;
  created_at: string;
  finished_at: string | null;
  /** Who queued it; null for the system's own jobs. */
  created_by: Generated<string | null>;
};

/** An ICS feed a listing reads (contracts' CalendarSource). */
export type CalendarSourcesTable = {
  id: string;
  listing_id: string;
  name: string;
  /** The full feed address: a secret, never sent to the admin or written to the site. */
  address: string;
  category: string | null;
  location: string | null;
  enabled: number;
  position: number;
  created_at: string;
  checked_at: string | null;
  synced_at: string | null;
  error: string | null;
  failures: Generated<number>;
  events: Generated<number>;
  /** Set when the last read found far fewer events than before: what it found. */
  held_found: number | null;
  /** 1 once an admin accepts a held drop, until the next sync applies it. */
  accept_drop: Generated<number>;
};

export type CalendarSourceRow = Selectable<CalendarSourcesTable>;

/** One synced occurrence and the entry it became. */
export type CalendarEventsTable = {
  listing_id: string;
  /** The event's UID, and which occurrence for a repeating one. */
  key: string;
  page_id: string;
  /** JSON: ids of the sources it was last found in. */
  sources: string;
  /** Of what was last written to the entry. */
  hash: string;
  starts_at: string;
  /** 0 once no source has it and its entry was taken off the site. */
  live: number;
};

export type RedirectsTable = {
  id: string;
  source_path: string;
  /** Either a page (followed through renames and moves) or a URL. */
  target_page_id: string | null;
  target_url: string | null;
  status: 301 | 302;
  /** The page whose move, unpublish or delete added the redirect. */
  page_id: string | null;
  created_at: string;
};

export type MediaTable = {
  id: string;
  /** The name it was uploaded with. */
  filename: string;
  type: string;
  /** The original's extension: jpg, png, webp, svg or pdf. */
  ext: string;
  size: number;
  width: number | null;
  height: number | null;
  alt: Generated<string>;
  caption: Generated<string>;
  credit: Generated<string>;
  /** JSON array of variant widths. */
  variants: Generated<string>;
  variants_size: Generated<number>;
  status: "processing" | "ready" | "failed";
  /** 1: the image adds nothing a screen reader should read, so it has no alt text. */
  decorative: Generated<number>;
  /** In Recently deleted since then; purged after TRASH_DAYS unless history still uses it. */
  deleted_at: string | null;
  /** When the file was last replaced, to say whether the live site has it yet. */
  replaced_at: string | null;
  /** JSON: the file before the last replace (its row fields), kept in DATA_DIR/media-previous/<id>/. */
  previous: string | null;
  created_at: string;
  updated_at: string;
  /** Who uploaded it. */
  created_by: Generated<string | null>;
};

/** One row: a count of writes to what a page's render reads (migration 0003_content_changes). */
export type ContentChangesTable = {
  id: number;
  n: number;
};

export type MediaUsageTable = {
  media_id: string;
  /** "page:<id>" or "settings". */
  owner: string;
};

export type UsersTable = {
  id: string;
  /** Lower case, unique. */
  username: string;
  display_name: string;
  role: Role;
  /** argon2id, PHC format. */
  password_hash: string;
  /** 1: must choose a new password before anything else. */
  must_change_password: Generated<number>;
  /** Base32, set once two-factor is enrolled (or while it's being set up). */
  totp_secret: string | null;
  /** The last 30-second step a code was accepted for, so a code works once. */
  totp_last_step: number | null;
  totp_enrolled_at: string | null;
  /** AdminPreferences as JSON. */
  preferences: Generated<string>;
  disabled_at: string | null;
  last_sign_in_at: string | null;
  created_at: string;
  created_by: string | null;
  /** 1: may connect agents over MCP. */
  mcp_enabled: Generated<number>;
  /** person: someone who signs in. token: an API token's account, which never does. */
  kind: Generated<"person" | "token">;
};

/** An API token: only its SHA-256 is stored. Its name and role are its account's. */
export type ApiTokensTable = {
  id: string;
  /** Its own account, `kind` "token". */
  user_id: string;
  token_hash: string;
  /** The token's opening characters, to tell tokens apart. */
  hint: string;
  created_at: string;
  created_by: string | null;
  /** Null: it never expires. */
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
};

/** What a token may change: ApiTokenArea. */
export type ApiTokenAreasTable = {
  token_id: string;
  area: "entries" | "pages" | "media" | "site";
};

/** The listings a token may write under. */
export type ApiTokenListingsTable = {
  token_id: string;
  listing_id: string;
};

/** A client that registered itself for OAuth (RFC 7591): Claude Desktop, Codex. */
export type OauthClientsTable = {
  id: string;
  /** As the client named itself; shown on the consent screen and the Agents list. */
  name: string;
  /** JSON array: the only addresses an authorization may return to. */
  redirect_uris: string;
  created_at: string;
  ip: Generated<string>;
};

/**
 * An agent an officer allowed: one consent, and the tokens it holds now. Only
 * their SHA-256 is stored. Revoking clears the hashes and sets `revoked_at`.
 */
export type AgentConnectionsTable = {
  id: string;
  user_id: string;
  client_id: string;
  access_hash: string | null;
  access_expires_at: string | null;
  refresh_hash: string | null;
  /** The refresh token before the last refresh: seen again, the connection was copied and ends. */
  previous_refresh_hash: string | null;
  created_at: string;
  last_used_at: string;
  /** A week after consent, however busy. */
  expires_at: string;
  revoked_at: string | null;
  /** Who revoked it; null when the builder did (a reused refresh token, MCP access turned off). */
  revoked_by: string | null;
  ip: Generated<string>;
  user_agent: Generated<string>;
};

export type SessionsTable = {
  id: string;
  /** SHA-256 of the cookie's token. */
  token_hash: string;
  user_id: string;
  stage: SessionStage;
  /** When this stage started: a sign-in rotates the session at every stage. */
  created_at: string;
  last_seen_at: string;
  ip: Generated<string>;
  user_agent: Generated<string>;
};

export type TokensTable = {
  id: string;
  /** SHA-256 of the link's token. */
  token_hash: string;
  kind: "invite" | "reset";
  /** Invites: the role it gives. */
  role: Role | null;
  /** Resets: whose password. */
  user_id: string | null;
  note: Generated<string>;
  created_by: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
};

export type RecoveryCodesTable = {
  user_id: string;
  /** SHA-256 of the code. */
  code_hash: string;
  used_at: string | null;
};

export type AuditLogTable = {
  id: Generated<number>;
  at: string;
  user_id: string | null;
  action: AuditAction;
  target: string | null;
  /** JSON object. */
  detail: Generated<string>;
  ip: string | null;
};

export type Database = {
  users: UsersTable;
  sessions: SessionsTable;
  tokens: TokensTable;
  recovery_codes: RecoveryCodesTable;
  audit_log: AuditLogTable;
  oauth_clients: OauthClientsTable;
  agent_connections: AgentConnectionsTable;
  api_tokens: ApiTokensTable;
  api_token_listings: ApiTokenListingsTable;
  api_token_areas: ApiTokenAreasTable;
  media: MediaTable;
  media_usage: MediaUsageTable;
  pages: PagesTable;
  redirects: RedirectsTable;
  revisions: RevisionsTable;
  settings: SettingsTable;
  content_changes: ContentChangesTable;
  jobs: JobsTable;
  calendar_sources: CalendarSourcesTable;
  calendar_events: CalendarEventsTable;
};
