/**
 * Draft versions, so one person's save can't silently overwrite another's.
 * Every draft (a page's, a site document's) has a version that changes when
 * it does; a save says which version it started from (`base`), and is
 * refused when someone else has saved since. See SaveDraftBody.
 */
import type { DraftConflict } from "@fiscal-sb/contracts";
import { HttpError } from "../errors.js";
import { fingerprint } from "../manifest.js";

/** A short fingerprint of a draft as stored. */
export const versionOf = (stored: string) => fingerprint(stored).slice(0, 22);

/**
 * The conflict when `current` (a draft as stored) isn't the version a save
 * started from; undefined when it is, or when the save gave no `base`.
 */
export function conflictWith(
  base: string | undefined,
  current: string,
  saved: Omit<DraftConflict, "version">,
): DraftConflict | undefined {
  const version = versionOf(current);
  return base === undefined || version === base ? undefined : { ...saved, version };
}

/** 409 `draft_conflict`, saying who saved in between. */
export const conflictError = (conflict: DraftConflict) =>
  new HttpError(
    409,
    "draft_conflict",
    `${conflict.by ?? "Someone"} saved this since you started editing. Load their version, or save yours again to replace it.`,
    conflict,
  );
