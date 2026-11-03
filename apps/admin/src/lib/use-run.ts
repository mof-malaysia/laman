/**
 * An action from a menu, switch or row button: runs it, refreshes `queryKey`
 * and says `done`, or says the server's reason in a toast when it fails.
 * For a form, where the reason sits beside the button, see `useAction`.
 */
import { useQueryClient } from "@tanstack/react-query";
import { t } from "@/i18n";
import useToast from "@/lib/ftds/hooks/use-toast";
import { apiError } from "./api";

export function useRun(queryKey: readonly unknown[]) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return async (work: () => Promise<unknown>, done?: string) => {
    try {
      await work();
      void queryClient.invalidateQueries({ queryKey });
      if (done) toast({ variant: "success", title: done });
    } catch (caught) {
      toast({
        variant: "error",
        title: t("users.failed"),
        description: (await apiError(caught))?.message,
      });
    }
  };
}
