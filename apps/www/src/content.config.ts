// The site's copy: one Markdown file per page per language, so wording
// changes never touch components. `path` is the page's address; `alternate`
// is the same page in the other language.
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const pages = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/pages" }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(200),
    path: z.string().startsWith("/"),
    alternate: z.string().startsWith("/"),
    lastChecked: z.coerce.date().optional(),
  }),
});

export const collections = { pages };
