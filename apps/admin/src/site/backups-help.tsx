/**
 * Help for Backups, in a drawer like Users' Help: how to restore, then the
 * questions an ICT administrator asks most.
 */
import { HelpDrawer, type HelpQuestions } from "@/components/help-drawer";
import { t } from "@/i18n";

/** In the order they tend to come up. */
const questions = [
  ["settings.backups.help.sameDisk.q", "settings.backups.help.sameDisk.a"],
  ["settings.backups.help.failed.q", "settings.backups.help.failed.a"],
  ["settings.backups.help.types.q", "settings.backups.help.types.a"],
  ["settings.backups.help.space.q", "settings.backups.help.space.a"],
  ["settings.backups.help.schedule.q", "settings.backups.help.schedule.a"],
  ["settings.backups.help.excluded.q", "settings.backups.help.excluded.a"],
  ["settings.backups.help.passphrase.q", "settings.backups.help.passphrase.a"],
  ["settings.backups.help.private.q", "settings.backups.help.private.a"],
] as const satisfies HelpQuestions;

export function BackupsHelp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <HelpDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={t("settings.backups.help.title")}
      questions={questions}
      questionsTitle={t("settings.backups.help.faq")}
    >
      <section className="flex flex-col gap-3">
        <h3 className="text-body-md text-txt-black-900 m-0 font-semibold">
          {t("settings.backups.help.restore")}
        </h3>
        <p className="text-body-sm text-txt-black-700 m-0">{t("settings.backups.restore")}</p>
        <Command text={t("settings.backups.details.restore")} lines={["laman restore <file>"]} />
        <Command
          text={t("settings.backups.details.fetch")}
          lines={["laman backups --remote", "laman fetch <file>"]}
        />
      </section>
    </HelpDrawer>
  );
}

/** A step and the commands it runs, each on its own line so it can be copied. */
function Command({ text, lines }: { text: string; lines: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-body-sm text-txt-black-700 m-0">{text}</p>
      {lines.map((line) => (
        <code key={line} className="break-all">
          {line}
        </code>
      ))}
    </div>
  );
}
