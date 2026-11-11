import { t } from "@/i18n";
import { apiError } from "@/lib/api";
import useToast from "@/lib/ftds/hooks/use-toast";

/** Toasts the server's message, or a generic one. */
export function useFailure() {
  const { toast } = useToast();
  return async (title: string, error: unknown) => {
    const body = await apiError(error);
    toast({ variant: "error", title, description: body?.message ?? t("common.tryAgain") });
  };
}
