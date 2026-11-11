import { z } from "zod";
import { field, panel } from "../fields.js";
import { defineBlock } from "../define.js";

type EmbedSource = {
  host: string;
  /** The paths the service gives for embedding: one ending in "/" matches all under it, any other exactly. */
  paths: readonly string[];
};

/**
 * Services a site can switch on in Settings, Embeds. Only each one's embed
 * addresses are framed, never the rest of its site: switching on Google Maps
 * allows www.google.com/maps/embed, not www.google.com. Stored settings name
 * these ids, so taking one away needs a migration (docs/upgrades.md).
 */
export const embedServices = [
  {
    id: "powerBi",
    name: "Power BI",
    // The secure embed link, which signs the viewer in. Not /view (Publish to web), open to anyone.
    sources: [{ host: "app.powerbi.com", paths: ["/reportEmbed"] }],
  },
  {
    id: "lookerStudio",
    name: "Looker Studio",
    sources: [{ host: "lookerstudio.google.com", paths: ["/embed/"] }],
  },
  {
    id: "tableauPublic",
    name: "Tableau Public",
    sources: [{ host: "public.tableau.com", paths: ["/views/"] }],
  },
  {
    id: "youtube",
    name: "YouTube",
    sources: [
      { host: "www.youtube.com", paths: ["/embed/"] },
      { host: "www.youtube-nocookie.com", paths: ["/embed/"] },
    ],
  },
  {
    id: "vimeo",
    name: "Vimeo",
    sources: [{ host: "player.vimeo.com", paths: ["/video/"] }],
  },
  {
    id: "googleMaps",
    name: "Google Maps",
    sources: [{ host: "www.google.com", paths: ["/maps/embed", "/maps/d/embed"] }],
  },
  {
    id: "openStreetMap",
    name: "OpenStreetMap",
    sources: [{ host: "www.openstreetmap.org", paths: ["/export/embed.html"] }],
  },
  {
    id: "microsoftForms",
    name: "Microsoft Forms",
    sources: [{ host: "forms.office.com", paths: ["/"] }],
  },
  {
    id: "googleForms",
    name: "Google Forms",
    sources: [{ host: "docs.google.com", paths: ["/forms/"] }],
  },
] as const satisfies readonly {
  id: string;
  name: string;
  sources: readonly EmbedSource[];
}[];

export type EmbedService = (typeof embedServices)[number];
export type EmbedServiceId = EmbedService["id"];
export const embedServiceIds = embedServices.map((s) => s.id) as [
  EmbedServiceId,
  ...EmbedServiceId[],
];

/** The addresses a service is allowed at, as an officer reads them: "www.google.com/maps/embed". */
export const embedAddresses = (service: EmbedService): string[] =>
  service.sources.flatMap((source) =>
    source.paths.map((path) => source.host + (path === "/" ? "" : path)),
  );

/** What a site lets its pages frame: built-in services switched on, and hosts of its own. */
export type EmbedRules = { services: readonly string[]; hosts: readonly string[] };

/** A host name: dot-separated labels of letters, digits and inner hyphens. */
const hostName = String.raw`[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+`;

/** A host name as the site's list of embeddable sites holds it: lower case, no scheme, port or path. */
export const embedHostPattern = new RegExp(`^${hostName}$`);

/** An https address with a plain host name: no sign-in details, no spaces or markup. Host, port, path. */
const embedAddress = new RegExp(
  // \x60 is a backtick, which can't be written as itself in this template.
  String.raw`^https://(${hostName})(:\d{1,5})?(/[^\s<>"'\x60\\?#]*)?(?:[?#][^\s<>"'\x60\\]*)?$`,
  "i",
);

/** The host an address would frame, in lower case; undefined when it isn't an https address. */
export const embedHost = (address: string): string | undefined =>
  embedAddress.exec(address)?.[1]?.toLowerCase();

/**
 * Whether a path is one of a service's embed paths. A browser reads "/embed/../x"
 * as "/x", so a path with dot segments, doubled or encoded slashes never matches.
 */
function onPath(path: string, paths: readonly string[]) {
  if (/(^|\/)\.{1,2}(\/|$)|\/\/|%2e|%2f|%5c/i.test(path)) return false;
  return paths.some((allowed) =>
    allowed.endsWith("/") ? path.startsWith(allowed) : path === allowed,
  );
}

/**
 * Why an address is or isn't framed, for the page and for what the editor tells the officer.
 * `address`: not an https address. `serviceOff`: a built-in service that isn't switched on.
 * `serviceAddress`: the service is on, but this isn't one of its embed addresses.
 * `notListed`: no service, and not among the site's own hosts.
 */
type EmbedDecision =
  | { allowed: true; host: string }
  | { allowed: false; reason: "address" }
  | { allowed: false; reason: "serviceOff" | "serviceAddress"; host: string; service: EmbedService }
  | { allowed: false; reason: "notListed"; host: string };

/**
 * Whether a page may frame an address under the site's rules (Settings,
 * Embeds): one of its own hosts, by the exact name (the whole host, not its
 * subdomains), or an embed address of a built-in service it has switched on.
 */
export function embedDecision(address: string, rules: EmbedRules): EmbedDecision {
  const match = embedAddress.exec(address);
  if (!match) return { allowed: false, reason: "address" };
  const host = match[1]!.toLowerCase();
  if (rules.hosts.includes(host)) return { allowed: true, host };
  const sources = embedServices.flatMap((service) =>
    service.sources.filter((s) => s.host === host).map((source) => ({ service, source })),
  );
  const first = sources[0];
  if (!first) return { allowed: false, reason: "notListed", host };
  const on = sources.filter(({ service }) => rules.services.includes(service.id));
  const path = match[3] ?? "/";
  // A service's embed addresses are on the default port.
  if (!match[2] && on.some(({ source }) => onPath(path, source.paths)))
    return { allowed: true, host };
  return on[0]
    ? { allowed: false, reason: "serviceAddress", host, service: on[0].service }
    : { allowed: false, reason: "serviceOff", host, service: first.service };
}

const EmbedLink = z
  .string()
  .max(1000)
  .refine((value) => value === "" || embedHost(value) !== undefined, {
    error:
      "Enter a web address starting with https://, as the other service gives it for embedding. Paste the address alone, not the iframe code.",
  })
  // Its own widget: the editor shows what the site allows beside it.
  .meta({ title: "Address to embed", widget: "embed" });

const Detail = z.object({
  label: field.text("Label", { max: 40 }),
  value: field.text("Value", { max: 120 }),
});

/** A page from another site, framed in this one: a dashboard, a map, a form. */
export const embed = defineBlock({
  type: "embed",
  label: "Embed",
  description:
    "A page from another website shown in a frame, such as a dashboard, a map or a form. Only what's allowed in Settings, Embeds can be shown.",
  group: "content",
  icon: "desktop",
  kinds: ["page", "entry"],
  props: z.object({
    title: field.text("Title", { max: 120, inline: true }),
    url: EmbedLink.optional(),
    caption: field.textarea("Text under the frame", { max: 300, inline: true }).optional(),
    details: panel(field.list("Details", Detail, { max: 6 }), {
      help: "Facts shown under the frame, such as who owns it or when it was last updated.",
    }).optional(),
    ratio: field
      .select("Shape", ["wide", "standard", "tall"], {
        wide: "Wide (16:9)",
        standard: "Standard (4:3)",
        tall: "Tall",
      })
      .default("wide"),
    width: field.column(),
  }),
  defaults: { title: "Tajuk benaman", ratio: "wide" },
});
