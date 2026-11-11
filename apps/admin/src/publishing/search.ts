/** The Publishing screen's place in the URL: which tab, and which waiting change is open. */
export type PublishingSearch = { tab?: "history"; item?: string };

export const publishingSearch = (search: Record<string, unknown>): PublishingSearch => ({
  ...(search.tab === "history" && { tab: "history" }),
  ...(typeof search.item === "string" && search.item && { item: search.item }),
});
