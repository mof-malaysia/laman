/** How the site's backups stand, in one word: the settings panel, the dashboard and the status bar agree. */
import type { Summary } from "@fiscal-sb/contracts";

/**
 * `failed` beats the rest: a failure after the newest archive. `never` and
 * `stale` count full archives only, so an upgrade's database-only copy can't
 * hide that the media hasn't been backed up. `offsiteFailed`: the archives
 * are fine on the server, but the last copy off it, or the last check of
 * one, failed. `diskLow`: all is well so far, but the backup disk is
 * running out of room for the next ones.
 */
export type BackupHealth = "failed" | "never" | "stale" | "offsiteFailed" | "diskLow" | "ok";

export function backupHealth(backup: Summary["backup"]): BackupHealth {
  if (backup.failed) return "failed";
  if (!backup.last) return "never";
  if (backup.stale) return "stale";
  if (offsiteFailed(backup)) return "offsiteFailed";
  return backup.disk?.low ? "diskLow" : "ok";
}

/** The last upload failed, or the last check of the newest copy did. */
export function offsiteFailed(backup: Summary["backup"]) {
  const offsite = backup.offsite;
  return Boolean(offsite && (offsite.failed || offsite.verified?.ok === false));
}

/** How loud each state is, so the header, the dashboard and Settings colour it alike. */
export function backupTone(health: BackupHealth): "danger" | "warning" | "success" {
  if (health === "failed" || health === "offsiteFailed") return "danger";
  return health === "ok" ? "success" : "warning";
}
