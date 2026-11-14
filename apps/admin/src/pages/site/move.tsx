/** The addresses a move or a new address would change, listed before anything is saved. */
import type { PathChange } from "@laman/contracts";
import { t } from "@/i18n";

/** Old address → new address, one row per page. */
export function PathChanges({ changes }: { changes: PathChange[] }) {
  return (
    <ul className="bg-bg-washed m-0 flex max-h-56 list-none flex-col gap-1 overflow-y-auto rounded-md p-3">
      {changes.map((change) => (
        <li key={change.id} className="text-body-sm flex flex-wrap items-center gap-x-2">
          <span className="text-txt-black-700">{change.from}</span>
          <span aria-hidden>→</span>
          <span className="sr-only">{t("move.becomes")}</span>
          <span className="font-medium">{change.to}</span>
        </li>
      ))}
    </ul>
  );
}
