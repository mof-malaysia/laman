// The site's copy, so wording changes never touch components. Long-form pages
// are one Markdown file per page per language; the home page is laid out
// section by section, so its copy is structured data. `path` is a page's
// address; `alternate` is the same page in the other language.
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const meta = {
  title: z.string(),
  description: z.string().max(200),
  path: z.string().startsWith("/"),
  alternate: z.string().startsWith("/"),
};

const pages = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/pages" }),
  schema: z.strictObject({
    ...meta,
    /** The page's h1 and the paragraph under it, set on the primary field. */
    heading: z.string(),
    lead: z.string(),
    /** The comparison page: the wide column, and its table's Laman column lit. */
    comparison: z.boolean().default(false),
    /** The contact page: the team's address goes above the copy. */
    contact: z.boolean().default(false),
  }),
});

const link = z.strictObject({ label: z.string(), href: z.string() });
const titled = z.strictObject({ title: z.string(), text: z.string() });
const image = z.strictObject({
  image: z.string().startsWith("/"),
  alt: z.string().min(1),
  /** The capture's size in CSS pixels, for the img's width and height. */
  width: z.number().int().default(1440),
  height: z.number().int().default(900),
});

const status = z.enum([
  "built",
  "yes",
  "no",
  "plugin",
  "extension",
  "module",
  "theme",
  "template",
  "partial",
]);

const home = defineCollection({
  loader: glob({ pattern: "*.yaml", base: "./src/content/home" }),
  schema: z.strictObject({
    ...meta,
    hero: z.strictObject({ title: z.string(), lead: z.string(), primary: link, secondary: link }),
    customers: z.strictObject({
      title: z.string(),
      items: z.array(titled.extend({ features: z.array(z.string()).length(3) })).length(3),
    }),
    builtin: z.strictObject({
      id: z.string(),
      title: z.string(),
      lead: z.string(),
      need: z.string(),
      labels: z.record(status, z.string()),
      rows: z.array(
        z.strictObject({
          need: z.string(),
          laman: status,
          wordpress: status,
          joomla: status,
          drupal: status,
        }),
      ),
      notes: z.array(z.string()),
      checked: z.string(),
      more: link,
    }),
    agents: z.strictObject({
      title: z.string(),
      lead: z.string(),
      example: z.string(),
      request: z.strictObject({ who: z.string(), text: z.string() }),
      steps: z.array(z.strictObject({ text: z.string(), tool: z.string() })),
      end: z.strictObject({ text: z.string(), note: z.string() }),
      safety: z.array(z.string()),
      data: z.string(),
      more: link,
    }),
    steps: z.strictObject({
      title: z.string(),
      lead: z.string(),
      items: z.array(titled.extend(image.shape)).length(3),
      note: z.string(),
    }),
    visitors: z.strictObject({
      title: z.string(),
      lead: z.string(),
      desktop: image,
      phone: image,
      address: z.string(),
      figures: z.array(z.strictObject({ value: z.string(), label: z.string() })).length(3),
      figuresNote: z.string(),
    }),
    sovereignty: z.strictObject({
      title: z.string(),
      lead: z.string(),
      facts: z.array(titled).length(4),
      more: link,
    }),
    diagram: z.strictObject({
      label: z.string(),
      boundary: z.string(),
      builder: titled,
      database: titled,
      backups: titled,
      audit: titled,
      site: titled,
      connector: z.string(),
      public: titled,
      outsideLabel: z.string(),
      outside: z.array(z.string()).min(1),
      switchOff: z.string(),
      offState: z.string(),
      offNote: z.string(),
      onNote: z.string(),
    }),
    runs: z.strictObject({ title: z.string(), lead: z.string(), code: z.string(), more: link }),
  }),
});

export const collections = { pages, home };
