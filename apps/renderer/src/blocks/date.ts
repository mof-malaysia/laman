/** A date as BM readers write it: 1 November 2026. */
export const longDate = (iso: string) =>
  new Intl.DateTimeFormat("ms-MY", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date(iso));

/** The YYYY-MM-DD a news item's <time> wants, in Malaysia's time zone. */
export const isoDay = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date(iso));
