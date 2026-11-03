# Brief: hero variants, and HTML-in-Canvas as a block

> **Status, 3 Nov 2026:** FTDS v0.2.2 shipped the hero's layouts as `stacked`/`split`/`image` with `align` and `mediaPosition` (not `centred` and `mediaSide`), and the builder now offers them with conditional fields (`panel` in `fields.ts`). No `focus` (shipped without), and the search, tasks and figures add-ons wait for a later FTDS release. Part B is untouched.

2 Nov 2026. Plan only, no code yet. Two parts: (A) enough hero variants that "can you customise our hero" stops being a custom job, and (B) whether and how HTML-in-Canvas becomes a block. Follows `docs/site-builder.md`, `PRODUCT.md` (no free styling, no custom HTML, WCAG 2.2 AA, static output, old Android phones) and `docs/briefs/theming.md`.

## Where things stand

- **One hero, one shape.** `packages/blocks/src/blocks/hero.ts` has eyebrow, title, description and two actions. Nothing to choose: no image, no layout, no background.
- **The FTDS hero already does more than the builder exposes.** `components/blocks/hero.astro` has `media` (image beside the text on desktop), `footnote` and a default slot under the actions. `apps/renderer/src/blocks/Hero.astro` passes none of them.
- **The property panel can't hide fields.** `fieldsOf()` and `property-panel.tsx` show every field all the time. A hero with a `layout` choice needs fields that appear only for some layouts (image fields only for image layouts), or the panel fills with fields that do nothing.
- **The hero component belongs to FTDS.** The renderer's copy is a registry file and "stays as the registry ships it", so new layouts are built in the FTDS repo (`packages/astro/src/components/marketing/hero.astro`, with its React twin) and pulled in with `node scripts/ftds-add.mjs astro-hero`.

## Part A: hero variants

### What agencies ask for

No research exists (`PRODUCT.md` § Evidence). This list is from the custom requests the team has had and from common Malaysian agency home pages, and needs checking against the request log before it decides scope.

| Request                                | Answer                                                     |
| -------------------------------------- | ---------------------------------------------------------- |
| "Put our photo / building in the hero" | **Split** and **Image** layouts                            |
| "Make it our colour"                   | **Primary** tone: the theme ramp's wash                    |
| "A big search box like JPJ / MyGov"    | **Search** add-on, on the site's Pagefind                  |
| "Our top services up front"            | **Top tasks** add-on, up to 6 links                        |
| "Show our numbers"                     | **Figures** add-on, up to 4                                |
| "Centre it"                            | **Centred** layout                                         |
| "Minister's / DG's message"            | Its own block later (**Message**), not a hero              |
| "A slider with five banners"           | **Refused**: autoplaying carousels are rejected outright   |
| "A background video"                   | **Refused** autoplay; a poster image with a play link only |
| "Our own fonts / colours per section"  | **Refused**: no free styling                               |
| "Text straight on top of a photo"      | Only on a solid panel; see § Text over images              |

### The model: one hero block, three choices

One `hero` block with three preset axes, not a block per variant. Switching layout keeps the officer's text, templates keep working, there is still exactly one hero to look for in the palette, and the one-h1 rule stays in one component.

| Field    | Options                                                  | Notes                                                                                                                                                                            |
| -------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout` | `standard` (today, default), `centred`, `split`, `image` | `split`: text and picture side by side, `mediaSide` left or right. `image`: full-width picture with the text on a panel over it.                                                 |
| `tone`   | `paper` (today, default), `well`, `primary`              | `primary` is the primary **wash** (`bg-primary-50`) with Ink text, as on CtaBand: a solid primary band breaks FTDS's One Blue Rule. On `image`, the tone colours the text panel. |
| `extra`  | `none` (default), `search`, `tasks`, `figures`           | One add-on under the actions. `search` posts to `/carian` and is offered only when site search is on.                                                                            |

New fields, each shown only where it applies:

- `media` (`field.media`, image) and `mediaSide`: `split` and `image`.
- `focus` (`center`, `top`, `bottom`, `left`, `right`): `image`, for `object-position`, so faces aren't cropped on phones.
- `searchPlaceholder` (text, max 60): `search`.
- `tasks` (`field.list`, max 6, each a label, link and FTDS icon): `tasks`.
- `figures` (`field.list`, max 4, each value max 12 and label max 60): `figures`.
- `footnote` (text, max 120): every layout. FTDS already renders it.

Every new field is optional or defaulted, so stored heroes parse unchanged and need no migration.

### Text over images

An image hero is the request most likely to fail AA, because the builder can't check text against a photo it hasn't seen. So the text never sits on the photo: it sits on a solid `bg-white` panel (or the primary wash) over it, on desktop, and **under** the photo on phones, where a panel would cover most of it. No gradient scrims: their contrast depends on the photo. The panel says, in the property panel, "Text sits on a panel so it stays readable on any photo" (principle 5: say what is and isn't checked).

The image is the hero's LCP element, so it's `loading="eager"`, `fetchpriority="high"`, with the media library's srcset. Alt text follows the Image block (library alt, overridable); an empty alt is allowed here because a hero photo is often decorative, and the panel says so.

### Panel infrastructure: conditional fields

Add `when` to the field meta in `fields.ts`, e.g. `field.media("Picture", { when: { layout: ["split", "image"] } })`. `specsOf` copies it into `FieldSpec`, `property-panel.tsx` hides fields whose condition fails, and `when` may also read site context (`search` needs `site.search.enabled`). Hidden fields keep their values, so switching layout and back loses nothing; the renderer ignores fields its layout doesn't use. Small, but every block with variants after this benefits.

### Work, in order

1. **FTDS (this repo, `ftds`)**: hero gains `layout`, `tone`, `mediaSide`, `focus` and an `extra` slot in Astro and React, with Storybook stories for every layout × tone and no a11y panel violations. Add small `HeroSearch`, `HeroTasks`, `HeroFigures` parts (or reuse `link-list`/`stats-band` pieces where they fit). Release.
2. **Builder, quick win first**: pass `media` and `footnote` through `Hero.astro`. Ships before step 1 lands, since the FTDS component already supports them.
3. **Conditional fields**: `when` in `fields.ts`, `FieldSpec`, the property panel; tests in `packages/blocks/test`.
4. **Schema and wrapper**: the fields above in `hero.ts`; `Hero.astro` maps them, with `Field` for inline text and the media lookup from `Image.astro`. `ftds-add.mjs astro-hero` to take the new component.
5. **Templates**: Utama uses `split`; add a "Portal" template with `search` + `tasks`. The registry test already renders every template and block default; extend it to render every layout × tone × extra.
6. **Editor polish**: the palette shows one Hero; the layout select gets small thumbnails (`optionLabels` today are words only).
7. **Docs**: § Hero in `docs/site-builder.md`.

Later, as their own blocks: **Message** (leader portrait, name, post, short message, link to the full text) and **Video** (poster, play link, transcript link).

## Part B: HTML-in-Canvas

### What it is

A WICG proposal, shipped in **Chrome 157** after an origin trial (148–151); full Stable rolls out from 3 Nov 2026, so Edge follows on the same engine. The shape as of 157:

- `<canvas content="drawable">`, and each child to be drawn marked `drawable`. Children are real, laid-out DOM: in the accessibility tree, focusable, selectable, translatable, found by find-in-page.
- `ctx.drawElementImage(el, x, y)` in 2D (DOM and pixels kept in sync for hit testing); `texElementSubImage2D` in WebGL and `GPUQueue.drawElementImageToTexture` in WebGPU, with `canvas.updateElementGeometry(el, { canvasTransform })` to keep hit testing in line with a 3D transform.
- A `paint` event (with `changedElements`) and `canvas.requestPaint()` to redraw when the HTML changes.
- Privacy limits: cross-origin images and iframes, visited-link colours, system colours, autofill and spelling marks aren't painted. Our media is same-origin, so this doesn't bite.
- Detection: set `content="drawable"` on a new canvas and check `canvas.content === "drawable"`.
- **Firefox and Safari have no stated position.** WebKit has landed at least one related fix; Mozilla nothing public. Plan for Chromium-only for a long time.

The names changed twice during the trial (`layoutsubtree` became `content="drawable"` in 155; `texElementImage2D` became `texElementSubImage2D`), so pin to the 157 shape and expect more churn.

### What it's good for, honestly

Almost everything a government hero needs (layouts, images, colour, gentle entrance motion) is plain HTML and CSS, works in every browser and costs no script. HTML-in-Canvas adds one thing CSS can't do: **pixel effects (shaders, distortion, lighting, 3D surfaces) on live, accessible HTML**. That's real, but it's decoration, in one engine, against a product whose visitors are on old phones and whose rule is "no JavaScript beyond what FTDS components need".

So: **don't make the hero depend on it.** Offer it as one opt-in, clearly experimental block whose plain HTML is the product and whose canvas is an enhancement. Separately, its biggest value to us may be in the admin, not the published site (§ In the admin).

### The block: "Sorotan" (Showcase)

Not "Canvas": the editor already calls its iframe the canvas.

- **What the officer edits**: the same content as a split hero card (title, text, picture, one action), plus `effect`, a select of **presets we write**: `none`, `lift` (pointer tilt and light on the picture card), `reveal` (a one-time wipe in as it scrolls into view), `depth` (the picture on a gently curved surface that follows the pointer). No custom shaders, code or parameters: same rule as styles.
- **What's published**: the plain HTML card, exactly as without the effect, plus one inline script (an FTDS component's, so it fits the JS rule) that runs only when all of these hold:
  - the API is detected;
  - `prefers-reduced-motion` is not `reduce` and `forced-colors` is not `active`;
  - the device isn't constrained (`navigator.connection.saveData` off, `deviceMemory` ≥ 4 where reported);
  - the block is in view (IntersectionObserver), and the page has loaded, so the effect never touches LCP.

  It then wraps the card in a canvas sized to the card's own box (ResizeObserver, so zoom to 400% and reflow keep working), marks it `drawable` and draws it. Anywhere it doesn't run, visitors get the card as it is today. Nothing is lost, only the decoration.

- **Rules every preset must pass**, checked in review and a Playwright test on Chrome 157:
  - **At rest, the text is untouched**: identity transform, no filter on text, so the contrast FTDS guarantees still holds. Effects move or light the picture, or run briefly and end at identity.
  - **No motion longer than 5 s without the visitor causing it** (WCAG 2.2.2), nothing that flashes (2.3.1), pointer-driven effects only on hover-capable pointers.
  - **Focus rings and the action link** draw and hit-test correctly (`updateElementGeometry` for 3D presets).
  - **Budget**: under 4 KB of script per preset, 2D context where possible, WebGL only for `depth`; no three.js. Pause drawing when off-screen or the tab is hidden.
- **In the editor**: edit mode renders the plain card, so inline editing and the overlay work as for every block. Preview runs the effect. The panel states the support honestly: "The effect shows in Chrome and Edge 157 or later; other browsers and visitors who turn off motion see the card without it."
- **Behind a site setting** at first ("Experimental blocks", off by default), so it isn't in the palette until an agency asks for it and we have used it on our pilot site.

### In the admin

The admin runs in the officer's browser, which on agency PCs is very likely Chrome or Edge (an **Assumption** to check). Two uses there carry no visitor risk:

1. **Social share images**: draw the page's hero with `drawElementImage` and `toBlob()` it into the `og:image`, so every page gets a real share card from the real renderer. The server-side alternative (sharp plus a separate HTML-to-image library, or a headless browser) is heavier and duplicates rendering. A fallback is needed for officers on other browsers (the site's default share image).
2. **Thumbnails** for the template picker, the page tree and the layout select in Part A, from the real renderer rather than hand-made screenshots that drift.

### Work, in order

1. **Spike (2–3 days)**: one preset (`lift`) in a plain page on Chrome 157 and an older Android Chrome. Measure script size, frame cost, memory, and check focus, zoom to 400%, find-in-page, translation, screen readers (TalkBack, NVDA) and Windows high contrast. Decide go or no-go from the numbers.
2. **FTDS component**: `showcase.astro` with the inline enhancer and presets, Storybook story.
3. **Builder block**: schema with `effect`, wrapper, the experimental-blocks setting, registry test.
4. **Admin share images**, independently of 2 and 3.

## Not in this plan

- Custom shaders, effect parameters, or any per-site code.
- Effects on the hero itself. Revisit only if the Showcase block is used and the spike numbers are good on old phones.
- Carousels, autoplay video, free colours or fonts.

## Questions for the team

1. **The request log**: which hero requests actually came in, and how often? That decides whether `figures` and `tasks` make the first cut.
2. **FTDS ownership**: does the FTDS team want `layout`/`tone` on the hero, or would they rather ship separate `HeroSplit`/`HeroImage` components? The builder model above works either way.
3. **Browsers on agency PCs**: is Chrome or Edge the norm? That decides whether admin-side canvas features are worth it.
4. **Is HTML-in-Canvas wanted, or wanted for a demo?** If no agency has asked for motion, the spike may be the whole of Part B for now.

## Sources

- [WICG html-in-canvas explainer](https://github.com/WICG/html-in-canvas)
- [Chrome blog: HTML-in-Canvas in Chrome 157](https://developer.chrome.com/blog/html-in-canvas)
- [Chrome blog: origin trial API changes](https://developer.chrome.com/blog/html-in-canvas-ot-changes)
- [Intent to Experiment: HTML-in-canvas (blink-dev)](https://groups.google.com/a/chromium.org/g/blink-dev/c/t_nGEmJ_v4s)
- [html-in-canvas.dev: browser support](https://html-in-canvas.dev/docs/browser-support/)
- [WebKit bug 327282](https://bugs.webkit.org/show_bug.cgi?id=327282)
