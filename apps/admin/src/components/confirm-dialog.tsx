/**
 * "Here is what will happen; go ahead?" before a public action such as
 * publishing or putting back an earlier version. Cancel closes it; the
 * confirm button closes it and runs `onConfirm`.
 */
import type { ReactNode } from "react";
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

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirm,
  cancel = t("common.cancel"),
  onConfirm,
  blocked,
  destructive,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** What will change. */
  children?: ReactNode;
  /** The confirm button's label: it names the action. */
  confirm: string;
  /** The cancel button's label, such as "Keep editing" when the confirm throws work away. */
  cancel?: string;
  onConfirm: () => void;
  /** Something is wrong: the body says what, and it can't be confirmed. */
  blocked?: boolean | undefined;
  /** It throws work away, such as discarding edits: the confirm button is red. */
  destructive?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:w-lg">
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        {children && <div className="text-body-sm pt-3">{children}</div>}
        <AlertDialogAction>
          <AlertDialogClose render={<Button variant="default-outline" />}>
            {cancel}
          </AlertDialogClose>
          <Button
            variant={destructive ? "danger-fill" : "primary-fill"}
            disabled={blocked}
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            {confirm}
          </Button>
        </AlertDialogAction>
      </AlertDialogContent>
    </AlertDialog>
  );
}
