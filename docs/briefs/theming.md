# Brief: site colours

2 Nov 2026. Lets an agency give its published site its own colours without leaving FTDS. First step of theming; type, radius and layout come later, if at all. Follows the drafted documents in `packages/contracts/src/site.ts` and the fingerprinted publish in `docs/briefs/incremental-publishing.md`.

## Why

Every site the builder makes is FTDS Blue. Agencies have brand colours (logo, letterhead, existing sites) and want their site to look like theirs. The risk is the other direction: free colour pickers give sites with unreadable links, white text on yellow buttons and a dozen clashing accents. The goal is a site that looks like the agency's and still passes WCAG 2.2 AA, with no way to choose a colour that doesn't.

## How FTDS colours work today

`apps/renderer/styles/ftds.css` has two layers:

1. **Primitive ramps**, RGB triplets: `--_primary-50` … `--_primary-950`, and the same for `danger`, `success`, `warning`, `gray`, `graphite`.
2. **Semantic tokens** that point at them: `--bg-primary-600: var(--_primary-600)`, `--txt-primary`, `--otl-primary-200`, `--fr-primary` (focus ring), and a `.dark` block that remaps the same primitives.

`@theme inline` makes the Tailwind utilities read the variables at run time (`rgb(var(--bg-primary-600))`). So **redefining the eleven `--_primary-*` primitives on `:root` re-colours every button, link, tag, focus ring and selected state on the site**, with no Tailwind rebuild and no edit to the registry files.

## Decisions

| Question                | Decision                                                                                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What can change         | The **primary ramp** only, from one brand colour. Danger, success and warning keep FTDS values: they carry meaning (error, done, caution) that must read the same on every government site.           |
| How an officer picks    | A preset (FTDS Blue, plus a short list of tested ramps) or **one hex colour**. The builder generates the 50–950 ramp from it. No per-step editing.                                                    |
| Contrast                | Enforced, not advised. A colour whose ramp can't meet AA is moved to the nearest one that can, and the screen says what changed and why. See § Contrast rules.                                        |
| Where it lives          | Its own drafted document, `theme`, like the announcement and search: saving writes the draft, publishing makes it live, the previous version can be put back. Publishing it never publishes settings. |
| What is stored          | The seed colour **and** the generated ramp. What the officer reviewed is what goes live; improving the generator later never silently re-colours a published site.                                    |
| How it reaches the page | An inline `<style>` in the page head from `RenderInput.site.theme`. No extra request, no flash of blue, and the page fingerprint changes so incremental publishing re-renders every page on its own.  |
| The admin               | Stays FTDS Blue. It's the officer's tool, not the agency's site. Only the canvas (`/render`) and the theme screen's preview show the agency's colours.                                                |
| Dark mode               | The published site is light only today. The ramp is checked for light; the `.dark` mapping already flips the primitives, so dark checks join when the site gets a dark mode.                          |

## Contrast rules

The ramp steps FTDS uses for text and controls must pass these, computed with WCAG 2.x relative luminance:

| Token use                                    | Step           | Against                                        | Minimum |
| -------------------------------------------- | -------------- | ---------------------------------------------- | ------- |
| Links, `text-txt-primary`                    | 600            | white, `bg-washed` (gray-100)                  | 4.5:1   |
| Primary button text (`text-txt-white` on it) | 600, hover 700 | white text                                     | 4.5:1   |
| Primary tag text on its wash                 | 700            | 50 and 100                                     | 4.5:1   |
| Focus ring `--fr-primary`, selected outlines | 500            | white                                          | 3:1     |
| Disabled, washes (`50`–`200`)                | —              | not checked (decorative, or disabled per WCAG) | —       |

The generator works in OKLCH: it keeps the seed's hue and chroma, makes the seed step 600 when it passes 600's rules (so a brand maroon or green is the button colour exactly), else 500, else the light step nearest its lightness, and stretches FTDS Blue's lightness curve to meet it, reducing chroma where sRGB can't hold it. 500, 600 and 700 are then darkened where needed until they pass. So a yellow stays at its own step (200, used for washes) and 600 becomes a darker shade of it. The screen says: "Your colour is used for backgrounds; a darker shade is used for links and buttons so they stay readable."

The same function runs in the admin (live preview) and on the server (on save, the source of truth); the server rejects a stored ramp that fails the table above.

## The model

In `packages/contracts/src/site.ts`, with the other drafted documents, with the generator and checks in `packages/blocks/src/theme.ts` so the renderer, server and admin share one copy:

```ts
const Rgb = z.tuple([byte, byte, byte]);
const rampSteps = [
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
  "950",
] as const;

export const SiteTheme = z.object({
  /** "ftds" or a preset key; "custom" when built from `seed`. */
  preset: z.enum(["ftds", ...presetKeys, "custom"]),
  /** The officer's colour, "#0b5d3b". Only for "custom". */
  seed: Hex.optional(),
  /** Generated from preset or seed on save; what the renderer writes out. */
  primary: z.record(z.enum(rampSteps), Rgb),
});

export const ThemeDoc = drafted(SiteTheme).extend({ previous: SiteTheme.nullable() });
```

A new database starts with `{ preset: "ftds" }` and FTDS's own ramp, so a site that never opens the screen looks as it does today.

## Work, in order

1. **Generator and checks** (`packages/blocks/src/theme.ts`): `rampFrom(seed)`, `rampPasses(ramp)`, `themeOf(choice)`, the presets. Unit tests: FTDS Blue's seed reproduces a passing ramp close to FTDS's; a yellow, a light green, a near-black and a grey seed each produce passing ramps; every preset passes.
2. **Contract and storage**: `SiteTheme`, `ThemeDoc` in contracts; a `theme` document in `content/site.ts` with the draft / published / previous pattern; `GET /api/theme`, `PUT /api/theme` (validates, regenerates the ramp server-side, rejects failures), `POST /api/theme/publish`, `POST /api/theme/restore`. Audit log entries. No migration beyond seeding the default doc.
3. **Renderer**: `RenderInput.site.theme`, always set; `Site.astro` writes `<style id="site-theme">html:root{--_primary-50:239 246 255;…}</style>`. The registry test renders a page with a custom theme.
4. **Publisher**: publish reads the published theme into `siteContext`; nothing else, since the fingerprint does the rest. The publish log shows a theme publish as "N pages re-coloured".
5. **Admin, a Colours screen** in the sidebar (`/theme`), its own screen rather than a Settings section since it publishes on its own (`t()` strings in `en.ts` and BM):
   - Preset swatches as a radio group, then "Custom colour" with a hex field and the native colour input.
   - Under it, the generated ramp as eleven swatches, each step's use named ("Links and buttons", "Focus ring"), and the adjustment note when the seed moved.
   - A preview of the home page from the real renderer with the unsaved choice (`POST /render/pages/:id/site` takes a `theme`), swapping in only its `#site-theme`.
   - Save, review and publish, with the same unsaved-changes guard and "put back previous" as Settings.
6. **Canvas**: the editor's `/render` uses the draft theme, so editing a page shows the colours it will publish with.
7. **Docs**: a § Theming in `docs/laman.md` and a line in `AGENTS.md` (the `--_primary-*` override is the one place site colours change; components keep using semantic tokens).

## Not in this step

- Changing danger, success, warning or the greys.
- A second brand colour. FTDS has no secondary ramp; adding one means new tokens and new places that use them, a design decision of its own. If agencies ask, the likely shape is one accent ramp used in a few named places (masthead strip, hero band, footer top border), in our block wrappers, never in the registry files.
- Fonts, corner radius, spacing.
- Per-page or per-section colours.
- Uploading a logo and extracting its colour (a nice "suggest from logo" later; the officer still confirms a hex).

## Questions for the team

1. **Presets**: which agencies' colours seed the list? A handful of real ones (Treasury green, a ministry maroon) makes the feature feel ready on day one.
2. **Who can publish it**: everyone who can publish settings, or a narrower role once roles exist?
3. **Masthead**: the Malaysian government masthead stays FTDS, unthemed. Confirm with the FTDS team that is the rule.
