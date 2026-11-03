/**
 * Accounts, sign-in and roles. The admin and the server read the same
 * permission table: the admin to hide what someone can't do, the server to
 * refuse it. See docs/auth.md.
 */
import { z } from "zod";
import { AdminLanguage } from "./preferences.js";

/** Each role includes everything the ones before it can do. */
export const Role = z.enum(["editor", "contentManager", "admin", "superAdmin"]);
export type Role = z.infer<typeof Role>;

/** The roles an invite or a role change can give: there is only ever one super admin. */
export const AssignableRole = Role.exclude(["superAdmin"]);
export type AssignableRole = z.infer<typeof AssignableRole>;

export const Permission = z.enum([
  /** Drafts: pages, entries, site documents, media uploads and details. */
  "content.edit",
  /** Making changes live: publish, schedule, unpublish, delete, media replace and delete. */
  "content.publish",
  /** The publishing machinery: undo a publish, rebuild everything, retry jobs. */
  "site.manage",
  /** People: invites, roles, reset links, two-factor, the audit log. */
  "users.manage",
  /** Requiring two-factor. */
  "security.manage",
]);
export type Permission = z.infer<typeof Permission>;

/** The lowest role that has each permission. */
export const lowestRole: Record<Permission, Role> = {
  "content.edit": "editor",
  "content.publish": "contentManager",
  "site.manage": "admin",
  "users.manage": "admin",
  "security.manage": "superAdmin",
};

const rank = (role: Role) => Role.options.indexOf(role);

export const can = (role: Role, permission: Permission) =>
  rank(role) >= rank(lowestRole[permission]);

export const permissionsOf = (role: Role) => Permission.options.filter((p) => can(role, p));

export const Username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Use at least 3 characters")
  .max(32, "Use at most 32 characters")
  .regex(/^[a-z0-9._-]+$/, "Use only letters, numbers, dots, hyphens and underscores");

export const DisplayName = z.string().trim().min(1, "Enter a name").max(80);

/** NIST 800-63B: long, without composition rules. The server also refuses common ones. */
export const Password = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(128, "Use at most 128 characters");

/**
 * How far a sign-in has got. password: must choose a new password. totp:
 * must enter a code. enrol: must set up two-factor. full: signed in.
 */
export const SessionStage = z.enum(["password", "totp", "enrol", "full"]);
export type SessionStage = z.infer<typeof SessionStage>;

export const Me = z.object({
  id: z.uuid(),
  username: z.string(),
  displayName: z.string(),
  role: Role,
  permissions: z.array(Permission),
  twoFactor: z.boolean(),
  stage: SessionStage,
  /** Their admin language, so the admin starts in it without asking again. */
  language: AdminLanguage,
  /** May connect agents over MCP (docs/mcp.md). */
  mcpEnabled: z.boolean(),
});
export type Me = z.infer<typeof Me>;

/** Changes to your own account. MCP access is the super admin's to set here (docs/mcp.md). */
export const MePatch = z.object({
  displayName: DisplayName.optional(),
  mcpEnabled: z.boolean().optional(),
});
export type MePatch = z.infer<typeof MePatch>;

export const SignInBody = z.object({
  username: z.string().trim().toLowerCase(),
  password: z.string(),
});

/** A 6-digit code from the app, or a recovery code. */
export const CodeBody = z.object({ code: z.string().trim().min(6).max(20) });

export const PasswordBody = z.object({
  /** Not needed at the `password` stage, where the password was just entered. */
  current: z.string().optional(),
  password: Password,
});

export const TotpSetup = z.object({
  secret: z.string(),
  /** The otpauth:// address for the QR code. */
  uri: z.string(),
});

export const RecoveryCodes = z.object({ codes: z.array(z.string()) });

export const JoinBody = z.object({
  token: z.string().min(20),
  username: Username,
  displayName: DisplayName,
  password: Password,
});

export const ResetBody = z.object({ token: z.string().min(20), password: Password });

/** What a one-time link is for, before it's used, so the page can say so. */
export const LinkInfo = z.object({
  kind: z.enum(["invite", "reset"]),
  role: Role.optional(),
  username: z.string().optional(),
  expiresAt: z.string(),
});
export type LinkInfo = z.infer<typeof LinkInfo>;

export const UserSummary = z.object({
  id: z.uuid(),
  username: z.string(),
  displayName: z.string(),
  role: Role,
  twoFactor: z.boolean(),
  disabled: z.boolean(),
  lastSignInAt: z.string().nullable(),
  createdAt: z.string(),
  /** May connect AI agents over MCP (docs/mcp.md). */
  mcpEnabled: z.boolean(),
});
export type UserSummary = z.infer<typeof UserSummary>;

export const UserPatch = z.object({
  role: AssignableRole.optional(),
  displayName: DisplayName.optional(),
  disabled: z.boolean().optional(),
  /** Turning it off ends their agents' connections. */
  mcpEnabled: z.boolean().optional(),
});
export type UserPatch = z.infer<typeof UserPatch>;

export const InviteBody = z.object({
  role: AssignableRole,
  /** Who it's for, so the pending list makes sense. */
  note: z.string().trim().max(80).default(""),
});

export const Invite = z.object({
  id: z.uuid(),
  role: Role,
  note: z.string(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
});
export type Invite = z.infer<typeof Invite>;

/** A one-time link, shown once: its path under the builder, e.g. "/admin/join#…". */
export const OneTimeLink = z.object({ path: z.string(), expiresAt: z.string() });
export type OneTimeLink = z.infer<typeof OneTimeLink>;

export const SessionSummary = z.object({
  id: z.uuid(),
  current: z.boolean(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  ip: z.string(),
  /** From the user agent: "Chrome", "macOS"; "" when unknown. */
  browser: z.string(),
  os: z.string(),
});
export type SessionSummary = z.infer<typeof SessionSummary>;

export const AuditAction = z.enum([
  "signIn",
  "signInFailed",
  "signOut",
  "passwordChanged",
  "passwordReset",
  "resetLinkMade",
  "twoFactorEnrolled",
  "twoFactorCleared",
  "recoveryCodesMade",
  "inviteMade",
  "inviteRevoked",
  "inviteUsed",
  "userChanged",
  "userSignedOut",
  "securityChanged",
  "published",
  "unpublished",
  "publishUndone",
  "pageDeleted",
  "pageRestored",
  "backupStarted",
  "backupRestored",
  /** An officer allowed an agent (docs/mcp.md). */
  "agentConnected",
  /** A connection ended: revoked, or its refresh token was used twice. */
  "agentRevoked",
  /** One MCP tool call: the tool and its outcome, never its arguments. */
  "agentToolCall",
]);
export type AuditAction = z.infer<typeof AuditAction>;

export const AuditEntry = z.object({
  id: z.number().int(),
  at: z.string(),
  user: z.object({ id: z.uuid(), displayName: z.string() }).nullable(),
  action: AuditAction,
  target: z.string().nullable(),
  detail: z.record(z.string(), z.unknown()),
  ip: z.string().nullable(),
  /** Names for the ids it mentions (its target, published page ids): people and page titles. */
  names: z.record(z.string(), z.string()),
});
export type AuditEntry = z.infer<typeof AuditEntry>;

/** Entries in a page of the audit log, unless `limit` asks for more (a download). */
export const AUDIT_PAGE = 50;

export const AuditQuery = z.object({
  userId: z.uuid().optional(),
  action: AuditAction.optional(),
  /** From the start of this day, and up to the end of `to`, in the server's time zone (as Analytics). */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  /** Entries before this id, for the next page. */
  before: z.coerce.number().int().optional(),
  /** More than a page at once, for a download. */
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});
export type AuditQuery = z.infer<typeof AuditQuery>;

/** Builder settings that apply on save: not a drafted site document. */
export const SecuritySettings = z.object({ requireTwoFactor: z.boolean() });
export type SecuritySettings = z.infer<typeof SecuritySettings>;
