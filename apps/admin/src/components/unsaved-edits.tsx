/**
 * The pieces a drafted document's editor shares: asking before unsaved edits
 * are lost (leaving, or discarding them), and putting back what was live
 * before the last publish.
 */
import { useBlocker } from "@tanstack/react-router";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { linkClass } from "@/components/text-link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

/**
 * Leaving with unsaved edits asks first, in the app and when the tab closes. Render what it
 * returns. With `search`, moving to the same screen with other search params (another settings
 * section) counts as leaving too.
 */
export function useLeaveGuard(dirty: boolean, body: string, options: { search?: boolean } = {}) {
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) =>
      dirty &&
      (current.pathname !== next.pathname ||
        (options.search === true &&
          JSON.stringify(current.search) !== JSON.stringify(next.search))),
    enableBeforeUnload: () => dirty,
    withResolver: true,
  });
  return (
    <AlertDialog
      open={blocker.status === "blocked"}
      onOpenChange={(open) => !open && blocker.reset?.()}
    >
      <AlertDialogContent className="sm:w-md">
        <AlertDialogTitle>{t("navigation.leave.title")}</AlertDialogTitle>
        <AlertDialogDescription>{body}</AlertDialogDescription>
        <AlertDialogAction>
          <AlertDialogClose render={<Button variant="default-outline" />}>
            {t("media.discard.keep")}
          </AlertDialogClose>
          <Button variant="danger-fill" onClick={() => blocker.proceed?.()}>
            {t("navigation.leave.confirm")}
          </Button>
        </AlertDialogAction>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DiscardEditsDialog({
  open,
  onOpenChange,
  body,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  body: string;
  onDiscard: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("navigation.discardEdits.title")}
      description={body}
      confirm={t("navigation.discardEdits")}
      cancel={t("media.discard.keep")}
      destructive
      onConfirm={onDiscard}
    />
  );
}

/**
 * Putting back what was live before the last publish is hidden for now. The
 * screens still pass what it needs, and the server keeps the previous version;
 * set this to true to bring the link back.
 */
const PUT_BACK_ENABLED = false;

/** "Published something by mistake?", at the foot of an editor with nothing unpublished. */
export function PutBackPrevious({ label, onPutBack }: { label: string; onPutBack: () => void }) {
  if (!PUT_BACK_ENABLED) return null;
  return (
    <p className="text-body-sm text-txt-black-700 border-otl-gray-200 mt-auto border-t pt-3">
      {t("navigation.previous.hint")}{" "}
      <button type="button" className={`${linkClass} cursor-pointer`} onClick={onPutBack}>
        {label}
      </button>
    </p>
  );
}
