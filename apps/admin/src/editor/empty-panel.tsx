/**
 * The properties panel with no block selected: what to do next, not a blank. How
 * to pick a block, the two things worth starting from (add a block, the page's
 * details), the page at a glance with its checks, and the canvas's keys.
 */
import { Button } from "@/components/ui/button";
import { PlusIcon } from "@/components/ui/icons/plus";
import { SettingIcon } from "@/components/ui/icons/setting";
import { WarningCircleIcon } from "@/components/ui/icons/warning-circle";
import { Kbd } from "@/components/ui/kbd";
import { t } from "@/i18n";

export function EmptyPanel({
  blocks,
  checks,
  checksLabel,
  stopped,
  layers,
  onAddBlock,
  onPageDetails,
  onChecks,
}: {
  /** How many blocks the page has. */
  blocks: number;
  /** How many checks it has, and whether one stops publishing. */
  checks: number;
  /** The checks in words, for the Review link's name: "7 things to check". */
  checksLabel: string;
  stopped: boolean;
  /** Whether the layers column is showing, so the hint can point at it. */
  layers: boolean;
  onAddBlock: () => void;
  onPageDetails: () => void;
  onChecks: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col items-start gap-3 pt-2">
        <span className="bg-bg-washed text-txt-black-700 flex size-10 items-center justify-center rounded-lg">
          {/* A pointer on a block: what to do to see something here. */}
          <svg viewBox="0 0 20 20" fill="none" aria-hidden className="size-5">
            <path
              d="M8.5 3.75H5.25a1.5 1.5 0 0 0-1.5 1.5v3.25M3.75 11.5v3.25a1.5 1.5 0 0 0 1.5 1.5H8.5M16.25 8.5V5.25a1.5 1.5 0 0 0-1.5-1.5H11.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="m11 11 5.25 1.75-2.25 1.25-1.25 2.25L11 11Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-body-md text-txt-black-900 font-semibold">
            {t("editor.empty.title")}
          </h2>
          <p className="text-body-sm text-txt-black-700">
            {t(layers ? "editor.empty.bodyLayers" : "editor.empty.body")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="default-outline" size="small" onClick={onAddBlock}>
            <PlusIcon /> {t("editor.insert.here")}
          </Button>
          <Button variant="default-ghost" size="small" onClick={onPageDetails}>
            <SettingIcon /> {t("editor.panel.pageDetails")}
          </Button>
        </div>
      </div>

      <section
        aria-labelledby="empty-page"
        className="border-otl-gray-200 flex flex-col gap-2 border-t pt-4"
      >
        <h3 id="empty-page" className="text-label-compact text-txt-black-500 font-medium">
          {t("editor.empty.onPage")}
        </h3>
        <dl className="text-body-sm m-0 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-txt-black-700">{t("editor.empty.blocks")}</dt>
            <dd className="text-txt-black-900 m-0 tabular-nums">{blocks}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-txt-black-700">{t("editor.empty.checks")}</dt>
            <dd className="m-0">
              {checks > 0 ? (
                <button
                  type="button"
                  onClick={onChecks}
                  aria-label={`${checksLabel}, ${t("editor.empty.review")}`}
                  className="text-txt-black-900 hover:bg-bg-washed focus-ring -mr-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-0.5 tabular-nums"
                >
                  <WarningCircleIcon
                    aria-hidden
                    className={stopped ? "text-txt-danger size-4" : "text-txt-warning size-4"}
                  />
                  {checks}
                  <span className="text-txt-primary">{t("editor.empty.review")}</span>
                </button>
              ) : (
                <span className="text-txt-success">{t("editor.empty.noChecks")}</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {/* Keyboard help; it means nothing on a touch screen. */}
      <section
        aria-labelledby="empty-keys"
        className="border-otl-gray-200 flex flex-col gap-2 border-t pt-4 pointer-coarse:hidden"
      >
        <h3 id="empty-keys" className="text-label-compact text-txt-black-500 font-medium">
          {t("editor.empty.keys")}
        </h3>
        <dl className="text-body-sm m-0 flex flex-col gap-1.5">
          {(
            [
              ["arrowdown", "editor.empty.keyStep"],
              ["mod+z", "editor.undo"],
              ["mod+s", "editor.empty.keySave"],
            ] as const
          ).map(([combo, label]) => (
            <div key={combo} className="flex items-center justify-between gap-3">
              <dt className="text-txt-black-700">{t(label)}</dt>
              <dd className="m-0">
                <Kbd combo={combo} />
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
