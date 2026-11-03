/** Table types for Kysely. JSON columns hold text; see the repositories for shapes. */
import type { AuditAction, Role, SessionStage } from "@fiscal-sb/contracts";
import type { Generated } from "kysely";

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
  media: MediaTable;
  media_usage: MediaUsageTable;
  pages: PagesTable;
  redirects: RedirectsTable;
  revisions: RevisionsTable;
  settings: SettingsTable;
  jobs: JobsTable;
};
