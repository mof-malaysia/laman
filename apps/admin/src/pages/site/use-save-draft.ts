import type { PageDocument } from "@fiscal-sb/blocks";
import type { Page } from "@fiscal-sb/contracts";
import { useMutation } from "@tanstack/react-query";
import { pagesApi } from "@/lib/api";
import { useRefreshPages } from "@/lib/pages";

/** Saves a change to the page's draft from the Pages screen. */
export function useSaveDraft(page: Page) {
  const refresh = useRefreshPages();
  return useMutation({
    mutationFn: (update: (draft: PageDocument) => PageDocument) =>
      pagesApi.saveDraft(page.id, update(page.draft)),
    onSuccess: () => refresh(page.id),
  });
}
