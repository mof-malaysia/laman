/**
 * Moving pages from the tree (drag, or alt+arrows): a dry run first, and when
 * addresses would change, a dialog that lists them before anything is saved.
 */
import type { MovePageBody, PathChange, PageSummary } from "@fiscal-sb/contracts";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldItem, FieldLabel } from "@/components/ui/field";
import { t } from "@/i18n";
import { apiError, pagesApi } from "@/lib/api";
import useToast from "@/lib/ftds/hooks/use-toast";
import { useRefreshPages } from "@/lib/pages";

type Pending = { page: PageSummary; body: MovePageBody; changes: PathChange[] };

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

export function useTreeMove() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [redirect, setRedirect] = useState(true);
  const [saving, setSaving] = useState(false);
  const refresh = useRefreshPages();
  const { toast } = useToast();

  const fail = async (error: unknown) => {
    const body = await apiError(error);
    toast({
      variant: "error",
      title: t("move.failed"),
      description: body?.message ?? t("common.tryAgain"),
    });
  };

  const save = async (page: PageSummary, body: MovePageBody) => {
    setSaving(true);
    try {
      await pagesApi.move(page.id, body);
      await refresh(page.id);
      setPending(null);
    } catch (error) {
      await fail(error);
    } finally {
      setSaving(false);
    }
  };

  /** Moves straight away when no address changes (a reorder); otherwise asks first. */
  const request = async (page: PageSummary, body: MovePageBody) => {
    try {
      const { changes } = await pagesApi.move(page.id, { ...body, dryRun: true });
      if (!changes.length) return await save(page, body);
      setRedirect(changes.some((c) => c.published));
      setPending({ page, body, changes });
    } catch (error) {
      await fail(error);
    }
  };

  const dialog = (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
      {pending && (
        <DialogBody className="sm:w-lg">
          <DialogHeader>
            <DialogTitle>{t("move.confirm.title", { title: pending.page.title })}</DialogTitle>
            <DialogDescription>
              {t("move.confirm.body", { count: pending.changes.length })}
            </DialogDescription>
          </DialogHeader>
          <DialogContent className="flex flex-col gap-4">
            <PathChanges changes={pending.changes} />
            {pending.changes.some((c) => c.published) && (
              <Field name="redirect">
                <FieldItem>
                  <Checkbox checked={redirect} onCheckedChange={setRedirect} />
                  <FieldLabel>{t("move.redirect")}</FieldLabel>
                </FieldItem>
              </Field>
            )}
          </DialogContent>
          <DialogFooter>
            <DialogClose render={<Button variant="default-outline" />}>
              {t("common.cancel")}
            </DialogClose>
            <Button
              variant="primary-fill"
              disabled={saving}
              onClick={() => void save(pending.page, { ...pending.body, redirect })}
            >
              {t("move.confirm.action")}
            </Button>
          </DialogFooter>
        </DialogBody>
      )}
    </Dialog>
  );

  return { request, dialog };
}
