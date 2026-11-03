/**
 * What an agent's tool call did, in the officer's words: the audit log keeps
 * the tool's name (apps/server/src/agents), and these say it as a sentence.
 * A tool missing here, from a newer server, shows as "Used <name>".
 */
import { type MessageKey, t } from "@/i18n";

const tools = [
  "whoami",
  "get_site_summary",
  "list_block_types",
  "get_block_schema",
  "list_templates",
  "list_pages",
  "get_page",
  "list_entries",
  "list_revisions",
  "check_pages",
  "preview_page",
  "get_settings",
  "get_announcement",
  "get_navigation",
  "check_navigation",
  "get_search",
  "get_theme",
  "list_theme_presets",
  "preview_theme",
  "list_media",
  "get_media",
  "get_analytics",
  "list_waiting",
  "list_jobs",
  "get_job",
  "create_page",
  "update_page_details",
  "replace_page_blocks",
  "add_block",
  "update_block",
  "move_block",
  "remove_block",
  "move_page",
  "duplicate_page",
  "restore_revision_to_draft",
  "discard_page_changes",
  "make_listing",
  "update_listing",
  "create_entry",
  "add_navbar_link",
  "add_navbar_dropdown",
  "update_navbar_item",
  "add_dropdown_link",
  "add_dropdown_group",
  "set_dropdown_feature",
  "set_dropdown_footer_link",
  "add_footer_column",
  "update_footer_column",
  "add_footer_link",
  "update_navigation_item",
  "move_navigation_item",
  "remove_navigation_item",
  "replace_navigation",
  "set_search_options",
  "add_search_pin",
  "update_search_pin",
  "remove_search_pin",
  "set_theme",
  "update_settings",
  "update_announcement",
  "discard_draft",
  "upload_media",
  "update_media",
  "publish_page",
  "schedule_publish",
  "cancel_scheduled_publish",
  "unpublish_page",
  "delete_page",
  "replace_media",
  "revert_media_file",
  "delete_media",
  "restore_media",
  "retry_job",
  "undo_publish",
  "rebuild_site",
] as const;
type ToolName = (typeof tools)[number];

const known = new Set<string>(tools);

/** Looking, not changing: the tables show these quieter than changes to the site. */
export const isLookup = (tool: string) => /^(get|list|check|preview)_|^whoami$/.test(tool);

/** "Published a page", or "Used <name>" for a tool this admin doesn't know. */
export const toolSaid = (tool: string) =>
  known.has(tool)
    ? t(`agents.tool.${tool as ToolName}` satisfies MessageKey)
    : t("audit.detail.tool", { tool });

/** Why a call wasn't done, from its outcome code. */
export function refusedBecause(outcome: string) {
  if (outcome === "forbidden") return t("audit.detail.refused.forbidden");
  if (outcome === "draft_conflict") return t("audit.detail.refused.conflict");
  if (outcome.endsWith("_not_found")) return t("audit.detail.refused.notFound");
  if (outcome === "internal_error") return t("audit.detail.refused.failed");
  return t("audit.detail.refused.rejected");
}
