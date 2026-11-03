/** How the site's backups stand, in one word: the settings panel, the dashboard and the status bar agree. */
import type { Summary } from "@fiscal-sb/contracts";

/**
 * `failed` beats the rest: a failure after the newest archive. `never` and
 * `stale` count full archives only, so an upgrade's database-only copy can't
 * hide that the media hasn't been backed up.
 */
export type BackupHealth = "failed" | "never" | "stale" | "ok";

export function backupHealth(backup: Summary["backup"]): BackupHealth {
  if (backup.failed) return "failed";
  if (!backup.last) return "never";
  return backup.stale ? "stale" : "ok";
}
