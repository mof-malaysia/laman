/**
 * One server action behind a form or button: whether it's running, and the
 * server's reason when it failed, ready to show beside the button.
 */
import { useState } from "react";
import { t } from "@/i18n";
import { apiError } from "./api";

export function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  /** Runs `work`, then `onDone` with its result; a failure sets `error` instead. */
  const run = async <T>(work: () => Promise<T>, onDone?: (result: T) => void) => {
    setPending(true);
    setError(undefined);
    try {
      onDone?.(await work());
    } catch (caught) {
      setError((await apiError(caught))?.message ?? t("common.tryAgain"));
    } finally {
      setPending(false);
    }
  };
  return { pending, error, run };
}
