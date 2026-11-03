/**
 * Reading audit entries: what an entry says, which agent made it and what
 * kind of call it was. The Audit log and the Agents screen read them alike.
 */
import type { AuditEntry, SiteDocName } from "@fiscal-sb/contracts";
import { Tag } from "@/components/ui/tag";
import { type MessageKey, t } from "@/i18n";
import { roleLabels } from "@/lib/auth";
import { formatDateTime } from "@/lib/pages";
import { docName } from "@/lib/publish";
import { isLookup, refusedBecause, toolSaid } from "./agent-tools";

/** The next page starts before the last entry, unless this one wasn't full. */
export const nextBefore = (page: AuditEntry[], size: number) =>
  page.length === size ? page.at(-1)?.id : undefined;

/** The agent the person worked through, when it was one (docs/mcp.md). */
export const agentOf = (entry: AuditEntry) =>
  typeof entry.detail.agent === "string" ? entry.detail.agent : "";

const text = (value: unknown) => (typeof value === "string" ? value : "");
const role = (value: unknown) =>
  typeof value === "string" && value in roleLabels
    ? t(roleLabels[value as keyof typeof roleLabels])
    : "";

/** The action, what it was about by name, and what changed when the log kept it. */
export function describe(entry: AuditEntry) {
  const { action, target, detail, names } = entry;
  const label = t(`audit.action.${action}` satisfies MessageKey);
  const labelled = (about: string | null | undefined) => (about ? `${label}: ${about}` : label);
  const name = (target && names[target]) || "";
  /** A site document's name, or a page's title. */
  const about = (id: string) =>
    id in docName ? t(docName[id as SiteDocName]) : names[id] || t("audit.detail.aPage");

  switch (action) {
    case "userChanged": {
      if (detail.seeded) return t("audit.detail.seeded");
      const subject = name || t("audit.detail.anAccount");
      const changes = [
        detail.role !== undefined &&
          (detail.roleBefore
            ? t("audit.detail.roleFrom", {
                name: subject,
                from: role(detail.roleBefore),
                to: role(detail.role),
              })
            : t("audit.detail.role", { name: subject, to: role(detail.role) })),
        typeof detail.disabled === "boolean" &&
          t(detail.disabled ? "audit.detail.disabled" : "audit.detail.enabled", { name: subject }),
        typeof detail.displayName === "string" &&
          t("audit.detail.renamed", { to: detail.displayName }),
        typeof detail.mcpEnabled === "boolean" &&
          t(detail.mcpEnabled ? "audit.detail.mcpOn" : "audit.detail.mcpOff", { name: subject }),
      ].filter(Boolean);
      return changes.length ? changes.join(". ") : label;
    }
    case "inviteMade":
    case "inviteRevoked":
      return labelled(`${text(detail.note) || t("users.noNote")} (${role(detail.role)})`);
    case "inviteUsed":
      return detail.role ? t("audit.detail.joined", { role: role(detail.role) }) : label;
    case "securityChanged":
      return detail.requireTwoFactor ? t("audit.detail.require2fa") : t("audit.detail.allow2fa");
    case "signInFailed":
      return labelled(target);
    case "published": {
      const chosen = [
        ...(Array.isArray(detail.pageIds) ? detail.pageIds : []),
        ...(Array.isArray(detail.docs) ? detail.docs : []),
      ].filter((id): id is string => typeof id === "string");
      const what = (target ? [target] : chosen).map(about);
      const list = what.length ? what.join(", ") : t("audit.detail.everything");
      return detail.runAt
        ? t("audit.detail.scheduled", { when: formatDateTime(text(detail.runAt)), what: list })
        : labelled(list);
    }
    case "backupStarted":
      return label;
    case "backupRestored":
      return t("audit.detail.restoredBackup", {
        when: formatDateTime(text(detail.createdAt)),
      });
    case "agentConnected":
      return labelled(text(detail.client));
    case "agentRevoked":
      return detail.reason === "refreshReused"
        ? t("audit.detail.agentReused")
        : detail.reason === "accessRemoved"
          ? t("audit.detail.agentAccessRemoved")
          : labelled(name);
    case "agentToolCall": {
      const said = toolSaid(text(detail.tool));
      const what = name ? `${said}: ${name}` : said;
      return detail.outcome === "ok"
        ? what
        : t("audit.detail.toolRefused", { what, why: refusedBecause(text(detail.outcome)) });
    }
    case "unpublished":
    case "publishUndone":
    case "pageDeleted":
    case "pageRestored":
      return labelled(name);
    default:
      // About someone else: an account action on a person.
      return labelled(target !== entry.user?.id ? name : "");
  }
}

/** An agent only looking, not changing anything: shown quieter than changes. */
export const lookedOnly = (entry: AuditEntry) =>
  entry.action === "agentToolCall" && isLookup(text(entry.detail.tool));

/** A call the builder didn't carry out. */
export const failed = (entry: AuditEntry) => entry.detail.outcome !== "ok";

/** The agent as a tag, or a dash when the person acted themselves. */
export function AgentTag({ agent }: { agent: string }) {
  return agent ? (
    <Tag size="small" className="whitespace-nowrap">
      {agent}
    </Tag>
  ) : (
    <span className="text-txt-black-500">—</span>
  );
}
