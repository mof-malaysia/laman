/**
 * A secret shown once: a one-time link, an API token. The whole value to copy,
 * and how long it works. Copying is the main action; closing before copying
 * asks first, since it can't be shown again.
 */
import { useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Callout, CalloutContent, CalloutTitle } from "@/components/ui/callout";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { clx } from "@/lib/ftds/utils";

/** What the dialog says about this kind of secret. */
export type OnceWords = {
  label: string;
  copy: string;
  copied: string;
  copyFailed: string;
  onceTitle: string;
  onceBody: string;
  leaveTitle: string;
  leaveBody: string;
};

export function OnceDialog({
  title,
  description,
  value,
  expires,
  words,
  mono = false,
  onClose,
}: {
  title: string;
  description: string;
  value: string;
  /** How long it works, under the label. */
  expires: string;
  words: OnceWords;
  /** A code rather than an address: set in a monospaced face. */
  mono?: boolean;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<"copied" | "failed">();
  const [leaving, setLeaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const close = () => (status === "copied" ? onClose() : setLeaving(true));
  const copy = () =>
    navigator.clipboard.writeText(value).then(
      () => setStatus("copied"),
      () => {
        // No clipboard (an older browser, or permission refused): select it to copy by hand.
        setStatus("failed");
        input.current?.focus();
        input.current?.select();
      },
    );

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogBody className="sm:w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogContent className="gap-stack-md flex flex-col">
          <Field name="secret">
            <FieldLabel htmlFor={inputId}>{words.label}</FieldLabel>
            <FieldDescription>{expires}</FieldDescription>
            <Input
              ref={input}
              id={inputId}
              readOnly
              className={clx(mono && "font-mono")}
              value={value}
              onFocus={(event) => event.target.select()}
              onCopy={() => setStatus("copied")}
            />
          </Field>
          <output className="text-body-sm text-txt-black-700 empty:hidden">
            {status === "copied" && words.copied}
            {status === "failed" && words.copyFailed}
          </output>
          <Callout variant="warning">
            <CalloutTitle>{words.onceTitle}</CalloutTitle>
            <CalloutContent>{words.onceBody}</CalloutContent>
          </Callout>
        </DialogContent>
        <DialogFooter>
          {status === "copied" ? (
            <>
              <Button variant="default-outline" onClick={() => void copy()}>
                {t("users.link.copyAgain")}
              </Button>
              <Button variant="primary-fill" onClick={onClose}>
                {t("users.link.done")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="default-outline" onClick={close}>
                {t("users.link.close")}
              </Button>
              <Button variant="primary-fill" onClick={() => void copy()}>
                {words.copy}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogBody>
      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title={words.leaveTitle}
        description={words.leaveBody}
        confirm={t("users.link.leave.confirm")}
        cancel={t("users.link.leave.cancel")}
        destructive
        onConfirm={onClose}
      />
    </Dialog>
  );
}
