/**
 * Who's signed in, and what they may do. The shell only renders for a
 * finished sign-in (router.tsx); `useMe` and `useCan` read the same `me`
 * query everywhere inside it. The server's check is what counts: this only
 * hides what someone can't use.
 */
import type {
  AssignableRole,
  AuditEntry,
  AuditQuery,
  Invite,
  LinkInfo,
  Me,
  OneTimeLink,
  Permission,
  Role,
  SecuritySettings,
  SessionStage,
  SessionSummary,
  UserPatch,
  UserSummary,
} from "@fiscal-sb/contracts";
import { useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import type { MessageKey } from "@/i18n";
import { api, data, queryParams } from "./api";
import { localDrafts } from "./local-drafts";

export const authApi = {
  me: () => data<Me>(api.get("api/auth/me")),
  signIn: (username: string, password: string) =>
    data<Me>(api.post("api/auth/sign-in", { json: { username, password } })),
  signOut: async () => {
    await api.post("api/auth/sign-out");
  },
  code: (code: string) => data<Me>(api.post("api/auth/totp", { json: { code } })),
  password: (password: string, current?: string) =>
    data<Me>(api.post("api/auth/password", { json: { password, ...(current && { current }) } })),
  setup: () => data<{ secret: string; uri: string }>(api.post("api/auth/totp/setup")),
  enrol: (code: string) =>
    data<{ me: Me; codes: string[] }>(api.post("api/auth/totp/enrol", { json: { code } })),
  recoveryCodes: (code: string) =>
    data<{ codes: string[] }>(api.post("api/auth/recovery-codes", { json: { code } })),
  rename: (displayName: string) => data<Me>(api.patch("api/auth/me", { json: { displayName } })),
  link: (token: string) => data<LinkInfo>(api.post("api/auth/link", { json: { token } })),
  join: (body: { token: string; username: string; displayName: string; password: string }) =>
    data<Me>(api.post("api/auth/join", { json: body })),
  reset: async (token: string, password: string) => {
    await api.post("api/auth/reset", { json: { token, password } });
  },
  sessions: () => data<SessionSummary[]>(api.get("api/auth/sessions")),
  endSession: async (id: string) => {
    await api.delete(`api/auth/sessions/${id}`);
  },
};

export const usersApi = {
  list: () => data<UserSummary[]>(api.get("api/users")),
  update: (id: string, patch: UserPatch) =>
    data<UserSummary>(api.patch(`api/users/${id}`, { json: patch })),
  resetLink: (id: string) => data<OneTimeLink>(api.post(`api/users/${id}/reset-link`)),
  clearTwoFactor: (id: string) => data<UserSummary>(api.post(`api/users/${id}/clear-2fa`)),
  signOut: async (id: string) => {
    await api.post(`api/users/${id}/sign-out`);
  },
  invites: () => data<Invite[]>(api.get("api/users/invites")),
  invite: (role: AssignableRole, note: string) =>
    data<OneTimeLink>(api.post("api/users/invites", { json: { role, note } })),
  revoke: async (id: string) => {
    await api.delete(`api/users/invites/${id}`);
  },
  audit: (query: z.input<typeof AuditQuery>) =>
    data<AuditEntry[]>(api.get("api/audit", { searchParams: queryParams(query) })),
};

/** Builder security: whether everyone must use two-factor. */
export const securityApi = {
  get: () => data<SecuritySettings>(api.get("api/security")),
  save: (settings: SecuritySettings) =>
    data<SecuritySettings>(api.put("api/security", { json: settings })),
};

export const meQuery = { queryKey: ["me"], queryFn: authApi.me, staleTime: 60_000, retry: false };

export const usersQuery = { queryKey: ["users"], queryFn: usersApi.list };

/** Signs out and leaves for Sign in. */
export const signOut = () => {
  localDrafts.clearAll();
  void authApi.signOut().finally(() => window.location.assign("/admin/sign-in"));
};

/** The signed-in person. Inside the shell it's always there: the router waits for it. */
export function useMe(): Me {
  const { data: me } = useQuery(meQuery);
  if (!me) throw new Error("useMe outside a signed-in screen");
  return me;
}

/** Whether the signed-in person may do this: the server's list, so the two never disagree. */
export const useCan = (permission: Permission) => useMe().permissions.includes(permission);

/** The screen for each unfinished stage of signing in. */
export const stagePaths: Record<Exclude<SessionStage, "full">, string> = {
  password: "/sign-in/password",
  totp: "/sign-in/code",
  enrol: "/sign-in/two-factor",
};

export const roleLabels: Record<Role, MessageKey> = {
  editor: "role.editor",
  contentManager: "role.contentManager",
  admin: "role.admin",
  superAdmin: "role.superAdmin",
};

/** Where to go after signing in: back to where they were headed, inside the admin only. */
export function nextPath(search: string) {
  const next = new URLSearchParams(search).get("next");
  return next?.startsWith("/admin/") && !next.startsWith("/admin/sign-in") ? next : "/admin/";
}

/** Leaves for the next step of signing in, or into the admin. A full load picks up the language. */
export function continueSignIn(me: Me) {
  const next = nextPath(window.location.search);
  if (me.stage === "full") window.location.assign(next);
  else window.location.assign(`/admin${stagePaths[me.stage]}?next=${encodeURIComponent(next)}`);
}
