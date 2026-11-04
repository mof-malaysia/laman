---
name: FTDS Site Builder
description: FTDS, as an agency's website and the admin that runs it; and, with its own expression, Laman's marketing site.
colors:
  ftds-blue: "#2563EB"
  ftds-blue-deep: "#1D4ED8"
  ftds-blue-wash: "#EFF6FF"
  focus-blue: "#3A75F6"
  paper: "#FAFAFA"
  sheet: "#FFFFFF"
  well: "#F4F4F5"
  hairline: "#E4E4E7"
  control-edge: "#898990"
  ink: "#18181B"
  ink-secondary: "#3F3F46"
  ink-tertiary: "#6B6B74"
  on-ftds-blue: "#FFFFFF"
  danger: "#B91C1C"
  danger-fill: "#DC2626"
  danger-wash: "#FEF2F2"
  success: "#15803D"
  success-wash: "#F0FDF4"
  warning: "#A16207"
  warning-wash: "#FEFCE8"
  field: "#1D4ED8"
  stage: "#172554"
  on-field-text: "#DBEAFE"
  on-field-edge: "#96B7FF"
  refused: "#FCA5A5"
  node-off: "#C2D5FF"
typography:
  display:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body-compact:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.43
  label-compact:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.38
  marketing-display:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 1.5rem + 3.4vw, 4rem)"
    fontWeight: 600
    lineHeight: 1.03
    letterSpacing: "-0.035em"
  long-form-display:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 1.7rem + 2vw, 3.25rem)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  section-heading:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.22
    letterSpacing: "-0.02em"
  lead:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.44
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "14px"
  2xl: "16px"
  full: "9999px"
spacing:
  stack-sm-compact: "8px"
  stack-md-compact: "12px"
  stack-lg-compact: "16px"
  surface-compact: "16px"
  stack-sm: "12px"
  stack-md: "16px"
  stack-lg: "24px"
  surface: "24px"
  marketing-gutter-phone: "18px"
  marketing-gutter: "24px"
  marketing-section-phone: "64px"
  marketing-section: "96px"
components:
  button-primary:
    backgroundColor: "{colors.ftds-blue}"
    textColor: "{colors.on-ftds-blue}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 20px"
  button-primary-hover:
    backgroundColor: "{colors.ftds-blue-deep}"
  button-primary-compact:
    backgroundColor: "{colors.ftds-blue}"
    textColor: "{colors.on-ftds-blue}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "0 12px"
  button-secondary:
    backgroundColor: "{colors.well}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
  button-danger:
    backgroundColor: "{colors.danger-fill}"
    textColor: "{colors.on-ftds-blue}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
  input:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "44px"
  input-compact:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "32px"
  tag-neutral:
    backgroundColor: "{colors.well}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.label-compact}"
    rounded: "{rounded.full}"
  tag-success:
    backgroundColor: "{colors.success-wash}"
    textColor: "{colors.success}"
    typography: "{typography.label-compact}"
    rounded: "{rounded.full}"
  tag-warning:
    backgroundColor: "{colors.warning-wash}"
    textColor: "{colors.warning}"
    typography: "{typography.label-compact}"
    rounded: "{rounded.full}"
  tag-primary:
    backgroundColor: "{colors.ftds-blue-wash}"
    textColor: "{colors.ftds-blue}"
    typography: "{typography.label-compact}"
    rounded: "{rounded.full}"
  summary-block:
    backgroundColor: "{colors.well}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
  page-frame:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.lg}"
  field-band:
    backgroundColor: "{colors.field}"
    textColor: "{colors.on-ftds-blue}"
  button-field-solid:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ftds-blue}"
    rounded: "{rounded.md}"
    height: "56px"
    padding: "0 24px"
  button-field-solid-hover:
    backgroundColor: "{colors.ftds-blue-wash}"
  button-field-quiet:
    backgroundColor: "rgb(255 255 255 / 0.12)"
    textColor: "{colors.on-ftds-blue}"
    rounded: "{rounded.md}"
    height: "56px"
    padding: "0 24px"
  button-field-quiet-hover:
    backgroundColor: "rgb(255 255 255 / 0.2)"
  stage-panel:
    backgroundColor: "{colors.stage}"
    textColor: "{colors.on-ftds-blue}"
    rounded: "{rounded.2xl}"
  agent-step:
    backgroundColor: "rgb(255 255 255 / 0.1)"
    textColor: "{colors.on-ftds-blue}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  agent-step-end:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  boundary-node:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
  boundary-node-site:
    backgroundColor: "{colors.ftds-blue-wash}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
  boundary-node-off:
    backgroundColor: "{colors.node-off}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
  screenshot-frame:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.xl}"
  command-block:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.xl}"
    padding: "24px"
---

# Design System: FTDS Site Builder

## Overview

**Creative North Star: "The Steady Hand"**

This project does not have its own visual world. It is FTDS v0.2.0, the Ministry of Finance's design system, applied twice: to the agency websites the builder publishes, and to the admin officers use to run them. The North Star, palette, type, elevation and component rules come from the [FTDS DESIGN.md](https://raw.githubusercontent.com/mof-malaysia/ftds/v0.2.0/DESIGN.md), which is the authority for anything this file doesn't say. The tokens above are FTDS's light theme, copied so tools can read them; `styles/ftds.css` in each app is the source they come from.

What this file adds is how FTDS is used here. The two surfaces share every token and differ only in density: published sites are FTDS at its comfortable default, built for visitors on older phones; the admin is compact, for officers at a desk. Both are quiet on purpose. Structure comes from spacing and tone, one blue marks the way forward, and nothing is decorated. On the published sites that calm is enforced: officers arrange approved blocks and pick preset variants, so no page can drift from the system.

There is a third surface, Laman's own marketing site (`apps/www`), and it alone has an expression of its own: "FTDS as a base, own expression", approved by its owner for that site only. It is FTDS on white, Paper and Well, like any Laman site, with two deep blues from FTDS's own ramp: the Field (Primary 700), a full-bleed band that carries white text and field buttons, and the Stage (Primary 950), a rounded panel that holds white objects. The home page opens on white, with the H1 and FTDS's own filled button, over a Stage showing a WhatsApp poster turning into a page through Laman's real checks; the Field returns for the AI-agent section and the closing band. Long-form pages open on a Field title band and close on the same band. The boundary diagram (the agency's data centre as a dashed line, with only the published HTML crossing out) sits on a Stage panel in the home page's sovereignty section. Everything on the Field and the Stage is built from FTDS primitives (`apps/www/src/styles/global.css`); neither is a new hue, font or shadow. Both stay on the marketing site: published agency sites and the admin never use them.

**Key Characteristics:**

- FTDS as installed, with no project palette, font or radius of its own, on published sites and in the admin.
- Comfortable density on published sites, compact density in the admin, from the same tokens.
- Light theme only, on every surface, for now.
- Inter, self-hosted, so no surface makes a third-party font request.
- Pages in the admin are shown as they really render, never as a mock-up; the marketing site shows the product only in real screenshots.
- The marketing site alone uses two deep blues from FTDS's ramp: the Primary 700 Field for bands with white text, the Primary 950 Stage for panels that hold white objects.

## Colors

FTDS's palette as shipped: FTDS Blue on zinc neutrals, with status colours as washes. See FTDS DESIGN.md, Colors, for every role and contrast ratio.

### Primary

- **FTDS Blue**: the one primary action on a screen, links, the current sidebar item, checked controls.
- **Focus Blue**: the focus ring, through the `focus-ring` utility, on every interactive element.

### Neutral

- **Paper, Sheet and Well**: the page, raised content and grouped areas. In the admin, Well carries summary blocks such as the dashboard's site status.
- **Ink and Ink Secondary**: all text a user must read. Ink Tertiary is for meta text only, such as a page's path and "8h ago" in a list.
- **Hairline**: list dividers, and the edge of a page preview.

### Semantic

Page and publish states map to wash tags, always with words: Draft is neutral, Scheduled is FTDS Blue, Changed (published, with a newer draft) is Warning, and Published or Live is Success. Errors use Danger; setup tasks still to do use Warning.

### Named Rules

**The Tokens-Only Rule.** Every colour comes from an FTDS token (`bg-bg-*`, `text-txt-*`, `border-otl-*`). No raw Tailwind colours, no hex values in components, no `dark:` overrides. If FTDS lacks a piece, build it from these tokens.

**The Light-Only Rule.** Both surfaces are light only for now: the admin sets `color-scheme: light` and ignores the OS preference, and published sites never switch. The dark tokens in the vendored CSS stay unused until dark mode is decided as a whole. The marketing site follows the same rule.

### Marketing site only: the Field and the Stage

These tokens exist only in `apps/www/src/styles/global.css`, each an alias of an FTDS primitive. They never appear in the renderer, the published sites or the admin.

- **Field** (`bg-bg-field`, Primary 700): a full-bleed band with white text. On the home page, the AI-agent section and the closing band; on long-form pages, the title band and the closing band.
- **Stage** (`bg-bg-stage`, Primary 950): a rounded panel, deeper than the Field, so the white objects on it carry. It holds the home page's opening stage (poster, check card and published page in a row) and the boundary diagram in the sovereignty section. It holds objects and captions, never buttons.
- **On-Field Text** (`text-txt-on-field`, Primary 100): leads, captions, fact descriptions and notes on the Field and the Stage. Headings, labels and links there stay white.
- **On-Field Edge** (`border-otl-on-field`, Primary 300): the dashed boundary line, and the rule above the AI-agent section's data note: the only outlines drawn on the deep blues.
- **Refused** (`text-otl-refused` / `decoration-otl-refused`, Danger 300): the strike and the cross-circle on the services Laman doesn't contact (vendor cloud, third-party CDN, trackers). It marks a refusal, not an error, and lives only in the boundary diagram.
- **Node Off** (Primary 200): a boundary node when the builder is switched off.

**The Field-Stays-Home Rule.** The Field, the Stage and their tokens belong to the marketing site. Never add them to the renderer, a block, a published agency site or the admin; there, FTDS Blue is still a button, a link or a wash, never a band.

**The Band-or-Panel Rule.** The Field is a full-bleed band for text and field buttons; the Stage is a contained, rounded panel for white objects. The Stage never goes full-bleed and never carries a button; a section of text and actions on deep blue is a Field band. Sections between them are Sheet, Paper (`bg-bg-gray-50`) or Well (`bg-bg-washed`), alternating.

**The White Focus Rule.** Anything on the Field or the Stage sits inside `.on-field`, which turns the focus ring white (`--fr-primary: 255 255 255`): Focus Blue doesn't show on Primary 700 or 950.

## Typography

**Display Font:** Inter Variable (with `Inter, ui-sans-serif, system-ui, sans-serif`)
**Body Font:** Inter Variable (same stack)

**Character:** One family, as FTDS prescribes. Self-hosted through `@fontsource-variable/inter` in both the admin and the renderer.

### Hierarchy

- **Display** (600, 32px, 1.25): page titles on published sites.
- **Headline** (600, 24px, 1.33): the admin's screen title, such as the site name on the dashboard.
- **Title** (600, 18px, 1.45): section headings inside an admin screen ("Finish setting up your site", "Recent edits").
- **Body** (400, 16px, 1.5): reading text on published sites. Prose capped at 70ch.
- **Body Compact** (400, 14px, 1.43): reading text in the admin.
- **Label** (500, 14px): buttons, form labels, sidebar items, links.
- **Label Compact** (500, 13px): tags, captions and meta lines in the admin. The smallest size anywhere.

### Named Rules

**The Floor Rule.** Nothing below 13px, and 13px only in the compact admin. Visitor-facing text starts at 16px. Weights are 400, 500 and 600 only.

### Marketing site

The marketing site uses FTDS's larger steps, which agency pages don't reach:

- **Marketing Display** (600, fluid 40–64px, 1.03, -0.035em, balanced): the home page H1, in Ink on white across seven columns.
- **Long-form Display** (600, fluid 36–52px, 1.08, -0.03em, balanced): a long-form page's H1, white on the Field title band.
- **Section Heading** (600, FTDS heading-sm 30px on phones, heading-md 36px from `md`, -0.02em, balanced): every section title, on white, Paper, Well or the Field, and the closing band's heading.
- **Lead** (400, FTDS body-lg 18px, body-xl 20px on long-form pages from `md`): the line under a heading, in On-Field Text on the Field and Ink Secondary elsewhere.
- Item titles use FTDS heading-2xs (20px) and heading-xs (24px); prose is body-md (16px) capped at 52–60ch. Captions, supporting lines in the diagram, facts and the comparison are body-sm (14px), the marketing site's floor for its own text.
- Real tool names, commands and file names are monospace (`font-mono`), never a second family for prose.

**The Tight Display Rule.** Only a page's H1 tracks tighter than -0.02em. Section headings stay at -0.02em, so the opening line is the one loud type moment on a page.

## Layout

- **Published sites:** comfortable density on `:root` (44px controls, 24px surface padding, 12/16/24px stack gaps). Page structure comes from the block sequence; officers can't change spacing or widths.
- **Admin:** FTDS `AppShell` with `data-density="compact"` (32px controls, 16px surface padding, 8/12/16px stack gaps). Screen content sits in a centred column up to 72rem (`max-w-6xl`) with `p-surface` padding.
- **Spacing:** use the density-aware tokens (`p-surface`, `gap-stack-sm|md|lg`) rather than fixed values, so a block reads correctly in either density.
- **Responsive:** admin screens are written phone-first. On wide screens a two-column grid (3fr and 2fr at `lg`) places each block; source order is the phone's order, so the most urgent information (site status) comes first on a phone.

### Named Rules

**The Phone-Order Rule.** Write an admin screen in the order a phone should read it, then place blocks on wide screens with grid placement. Never reorder content with CSS so that the visual order and the reading order differ on a phone.

### Marketing site

- **Container:** 1280px wide, 18px gutters on phones and 24px from `md`. Long-form pages narrow to an 808px column (1080px for wide pages such as the comparison), shared by the Field title and the prose.
- **Sections:** full-bleed bands, 64px top and bottom on phones and 96px from `md`, the AI-agent Field section included. The long-form title band is shorter (48–64px top, 56–80px bottom), and the closing band is 64–80px. Sections alternate Sheet, Paper and Well; there are no cards around a section.
- **Grid:** a 12-column grid from `lg` (from `xl` in the sovereignty section), usually 4–5 columns of heading against 7–8 of content.
- **Home opening:** white under the navbar. The H1 spans seven columns, with the lead and both actions in the other five, bottom-aligned. Below it the Stage runs the full container width (edge to edge on phones, 16px radius from `md`) with three objects in a row from `lg` (poster, check card, published page, with arrows between) and a one-line caption under each. On phones the headline and actions come first, then the Stage stacks poster, checks, page, with the arrows turned down. The Phone-Order Rule holds here too.
- **Comparison on phones:** below `md`, the home page's built-in table becomes one row per need: the need, with Laman's answer and a check beside it in FTDS Blue, and the other three in a single body-sm line under it ("WordPress: Pemalam · Joomla: …"). In Markdown prose (the full comparison page) the table stacks instead: the question, then Laman's answer on the Blue Wash, then the others', each under its column's name through `data-label` (set at build). Nothing scrolls sideways.

## Elevation & Depth

Flat, as in FTDS: depth comes from Paper, Sheet and Well. Shadows exist only for things that float and close (menus, popovers, select lists, toasts, dialogs), using FTDS's Float and Lift shadows. Cards, tags, buttons, list rows and page previews never cast a shadow.

The marketing site is flat too. On the Field and the Stage, depth is white on blue: white cards, nodes and buttons sit on Primary 700 or 950 with no shadow, and the quiet layer is a translucent white fill (the quiet button at 12%, 20% on hover; agent log steps at 10%).

The poster on the opening Stage is the one deliberate exception, because it depicts something that isn't Laman: an image someone uploaded. It is tilted 3° with a soft drop shadow (`0 18px 36px -12px` black at 50%) so it reads as a picture lying on the Stage. That shadow belongs to the depicted poster only; it is not a Laman elevation and doesn't transfer to cards, frames or screenshots.

## Shapes

FTDS's gently rounded language: 8px on buttons and inputs, 12px on summary blocks, page previews and dialogs, pills (9999px) for tags. Inline links get a 4px radius so their focus ring has soft corners.

On the marketing site, content containers (boundary nodes, screenshot frames, the comparison table, command blocks, the check card and page on the Stage, the agent request card) use FTDS's 14px radius; agent log rows use 12px; buttons and the check items keep 8px. The Stage panel is 16px, square on phones where it runs edge to edge. The boundary line is the one larger shape: a 2px dashed On-Field Edge at 20px radius, wider than anything it holds. The poster is square-cornered: it is a picture, not a Laman container.

## Components

Every component comes from the FTDS registry (`pnpm dlx shadcn@latest add @ftds/<name>` in the admin, `pnpm ftds:add astro-<name>` in the renderer and the marketing site). Files under `components/ui`, `components/blocks`, `lib/ftds` and `styles/ftds.css` stay as the registry ships them. The rules below are this project's additions; FTDS DESIGN.md, Components, covers the rest.

### Buttons

- **One primary per screen.** On the dashboard it appears only when there is something to publish ("Review and publish").
- **Secondary:** the `default-outline` variant, which FTDS draws as a Well fill with no border, for actions such as "Post an announcement".

### Links

- **Inline links:** FTDS Blue, Label weight (500), underlined 3px below the text, with the focus ring (`linkClass` in `components/text-link.ts`). Links that open the published site say so to screen readers.

### Tags

- **Page status:** `PageStatusTag` is the only way to show a page's state; don't style a status by hand.

### Summary block

- **Style:** Well background, 12px radius, no border or shadow. For a short status that needs to stand apart, such as whether the site is up to date. Never nested, never a container for a list of cards.

### Page frame (signature component)

- **What it is:** a page as visitors see it, drawn by the real renderer at 1280px and scaled to fit, in a browser frame showing its address. Nothing in it runs, scrolls or takes focus. Used on the dashboard and on page detail.
- **Style:** Sheet, a 1px Hairline edge and 12px radius. The edge is a deliberate exception to "no borders": a white page on a white panel has no other way to show where it ends.
- **Rule:** never replace it with a screenshot, an illustration or a mock-up; the point is that it is the real page.

### Task list

- FTDS `TaskList` for setup steps: title (a link when the officer can do it in the admin), a one-line hint, and a status tag (To do, Saved, not live, Done). It disappears once every task is done.

### Marketing site components

These live in `apps/www/src/components` (outside `ui` and `blocks`) and are used only there.

Their copy lives in structured content (`src/content/home/<lang>.yaml` and the Markdown pages), validated in `src/content.config.ts` with strict objects (`z.strictObject`), so a misspelt or stray key fails the build instead of silently not rendering.

#### Home opening

- **What it is:** the first viewport, on white under FTDS's navbar: the Marketing Display H1, a Lead in Ink Secondary, and two FTDS large buttons, `primary-fill` ("Pasang Laman") and `default-outline`. Then the opening Stage.
- **Navbar:** FTDS's white navbar, as the registry ships it, on every page. Its filled "Pasang Laman" is turned off on the home page (`navAction={false}` on `Base.astro`) because the opening carries the filled button; everywhere else it stays on. Never tint or overlay the navbar.

#### Opening Stage (signature component)

- **What it is:** a `figure.on-field` on the Stage, the job Laman does in three objects: the WhatsApp poster as uploaded, a white check card listing Laman's real check wording, and the same notice as a published page in a browser frame. FTDS arrow icons in On-Field Text sit between them, and each object has a one-line body-sm caption in On-Field Text. A label-sm "Contoh rekaan" tag in the top corner says it is a made-up example.
- **Poster:** a depiction of something that isn't Laman, so it is allowed to look unlike Laman: a 3:4 sheet on the Warning 200 wash with Danger text, bold, a 28px (1.75rem) title, a Danger 700 date strip, tilted -3° with a soft drop shadow (see Elevation & Depth). It is `aria-hidden`; the figure's label and the captions carry its meaning. These values describe the poster only and are not marketing tokens.
- **Check card:** Sheet, 14px radius, 20px padding; a label-md title and each check as a Warning Wash row (8px radius) with a Warning icon.
- **Published page:** Sheet, 14px radius, a Well address bar in Ink Tertiary, the announcement bar on Warning Wash with a Warning 600 "Notis" pill, then breadcrumb, a heading-2xs title and body-sm text.
- **Rule:** this is the only place the site draws a page in HTML rather than a capture, and it is labelled as an example. Don't put a product screenshot or a generic illustration beside the headline instead.

#### Field band

- **What it is:** a full-bleed `section.on-field` in the Field with white text. Long-form pages open on it with their H1 and lead, the home page's AI-agent section sits on it, and `CtaBand` closes every page with it: a Section Heading, one On-Field Text line and two field buttons.

#### Field buttons

- **Why:** FTDS's filled primary vanishes on Primary 700, so on the Field the way forward is a white button with FTDS Blue text (`FieldButton`, solid), hover Blue Wash.
- **Quiet:** the second action on the Field is white text on a 12% white fill (20% on hover), no border.
- **Shape:** FTDS's large control (56px high, 24px sides, 16px label), 8px radius, white focus ring.
- **Use:** only in Field bands, at most one solid and one quiet per band. The AI-agent section has none, only a white text link. Off the Field, buttons are FTDS's own.

#### AI-agent log

- **What it is:** on the Field, an example run (labelled "Contoh, bukan rakaman sebenar" in label-sm On-Field Text): the officer's request as a white card (14px radius, a label-sm "who" line in Ink Tertiary, the request in body-lg/xl medium), then numbered steps, then an end row.
- **Steps:** each a 10% white row, 12px radius, 12px by 16px padding: a 28px white circle with an FTDS Blue number, the step in body-md, and the real MCP tool name (`list_entries`, `create_entry`) in monospace On-Field Text, right-aligned from `sm` and under the step on phones.
- **End row:** a white row with an FTDS Blue check-circle in place of the number, the outcome in plain semibold text ("Menunggu Pengurus Kandungan menerbitkan") and a body-sm note. It is not a tool call, so it has no monospace name.
- **Beside it:** the heading, lead, safety points with a white check icon, and the data note in body-sm On-Field Text above an On-Field Edge rule.
- **Rule:** tool names are the real ones from `apps/server/src/agents/tools.ts`; never invent one for the example.

#### Customer columns

- Three columns from `md` on white, each topped by a 2px Hairline rule with 24px above the title: a heading-2xs title, a body-md paragraph in Ink Secondary, and three features each with an FTDS Blue check icon. No card, no fill.

#### Boundary diagram (signature component)

- **What it is:** the architecture, literally, on a Stage panel (16px radius, 20–32px padding) beside the sovereignty section's heading and facts, which sit on white. A 2px dashed On-Field Edge line (20px radius) labelled as the agency's data centre holds white nodes for the builder, `site.db`, daily backups and the audit log, and a Blue Wash node for the static site across both columns. A 3px white connector labelled "HTML sahaja" leaves the boundary for a white Orang awam node (on phones the label sits on a Stage-coloured patch over the vertical line). Under it, the services Laman doesn't contact, in On-Field Text, struck through in Refused with a Refused cross-circle.
- **Nodes:** 14px radius, 12–16px padding, a 20px FTDS Blue icon, a label-md title and a body-sm Ink Secondary line.
- **Off state:** a "Matikan pembina" switch on the boundary (white track at 25%, white knob; pressed: white track, Field-coloured knob) turns the builder, database, backups and audit nodes to Node Off with Ink Tertiary icons and a "Dimatikan" neutral tag on the builder. Their text stays full contrast. The static site and the public node don't change, and a polite live note under the figure says the site is still up.
- **Motion:** the connector draws once on load from a visible 30% stub (900ms); node and knob changes take 200ms; reduced motion skips all of it. Without JavaScript the switch stays hidden and the figure still reads.
- **Rule:** keep it on a Stage panel, never full-bleed, and never redraw it as a generic illustration.

#### Product screenshots

- **Style:** real captures from a local builder seeded with the made-up agency Jabatan Contoh, as WebP with width and height set, lazy loaded. Sheet behind them, a 1px Hairline edge, 14px radius, no shadow.
- **Published page:** shown in a browser frame: a 36px Well bar with the address in Ink Tertiary over a Hairline rule, the page under it.
- **Provenance:** every shipping raster in `public/shots/` has a `.json` beside it saying it is a screenshot, not generated, and how it was captured (`scripts/screenshots.mjs`).
- **Rule:** the admin and editor appear only as real captures, never as an illustration or mock-up. The admin's page frame rule is the same idea; the marketing site has no live renderer, so it uses captures. The opening Stage is the one labelled exception.

#### Built-in comparison

- **What it is:** the home page's table of what an agency needs against Laman, WordPress, Joomla and Drupal, on a Sheet panel with a Hairline edge and 14px radius, inside a Paper section. Each cell is a status code in the content (`built`, `plugin`, `extension`, `module`, `partial`, `yes`, `no`, …) rendered as a word from the page's labels ("Terbina dalam", "Pemalam"), so the table stays the same in both languages.
- **Laman's column is lit:** an FTDS Blue header cell with white text, and Blue Wash cells in semibold Ink.
- **Positives:** a built-in or good answer gets a 16px check-circle, FTDS Blue in Laman's column and Success elsewhere, with Ink text; the rest is Ink Tertiary with no icon. Never a cross or red for the others: the table states what they need, it doesn't put them down.
- **Under it:** the notes in body-sm Ink Secondary, a dated "checked on" line in Ink Tertiary, and a text link to the full, sourced comparison page. On phones it becomes one line per need (see Layout).
- **Comparison page:** in Markdown prose, Laman's column is marked the same way, and the other column is Ink Secondary.

#### Command block

- Install commands are an Ink block with white monospace body-sm text, 14px radius and 20–24px padding, scrolling sideways inside itself. Used on the home page and the install page instead of FTDS's inline code wash.

#### Numbered steps

- Each step has a 36px FTDS Blue circle with a white number, a heading-xs title and a 38ch line, beside its screenshot on wide screens.

## Do's and Don'ts

### Do:

- **Do** read the FTDS DESIGN.md before building anything new; it governs everything this file doesn't mention.
- **Do** use FTDS components before writing your own, and build anything missing from FTDS tokens.
- **Do** keep published sites in comfortable density and the admin in compact density.
- **Do** show a page in the admin with the page frame, from the real renderer.
- **Do** carry every page and publish state as a wash tag with words.
- **Do** write every admin string through `t()`; site content and FTDS Astro labels are BM by default.
- **Do** close every marketing page on the Field band, open long-form pages on a Field title band, and keep everything else in FTDS on Sheet, Paper and Well.
- **Do** use the Field for full-bleed bands of text and field buttons, and the Stage for contained panels of white objects.
- **Do** put anything on the Field or the Stage inside `.on-field`, so its focus ring is white, and use field buttons on the Field instead of FTDS's filled primary.
- **Do** turn the navbar's filled "Pasang Laman" off (`navAction={false}`) on any page whose opening carries FTDS's filled primary itself.
- **Do** keep marketing copy in the content collections, validated with strict objects.
- **Do** show the product on the marketing site only in real screenshots, each with its provenance file.

### Don't:

- **Don't** add a project palette, typeface, radius or shadow to published sites or the admin; they have none of their own. The marketing site's Field and Stage tokens are aliases of FTDS primitives, not a palette.
- **Don't** use the Field, the Stage, field buttons or the boundary diagram anywhere but the marketing site.
- **Don't** make the Stage full-bleed or put a button on it.
- **Don't** borrow the poster's tilt, drop shadow, warning and danger washes or 28px title for anything Laman draws; they depict someone else's picture.
- **Don't** use raw Tailwind colours, hex values or `dark:` overrides.
- **Don't** edit files under `components/ui`, `components/blocks`, `lib/ftds` or `styles/ftds.css`.
- **Don't** give officers a way to style content on published sites: no colour pickers, font choices, free spacing or custom HTML. Variants are presets.
- **Don't** turn on the dark theme on either surface until it is decided for both.
- **Don't** put two filled blue buttons on one screen. On the marketing site the home opening's "Pasang Laman" is that one (the navbar's is off there); on other pages it is the navbar's. The Field's buttons are white.
