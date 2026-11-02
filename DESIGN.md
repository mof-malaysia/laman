---
name: FTDS Site Builder
description: FTDS, as an agency's website and the admin that runs it.
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
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "14px"
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
---

# Design System: FTDS Site Builder

## Overview

**Creative North Star: "The Steady Hand"**

This project does not have its own visual world. It is FTDS v0.2.0, the Ministry of Finance's design system, applied twice: to the agency websites the builder publishes, and to the admin officers use to run them. The North Star, palette, type, elevation and component rules come from the [FTDS DESIGN.md](https://raw.githubusercontent.com/mof-malaysia/ftds/v0.2.0/DESIGN.md), which is the authority for anything this file doesn't say. The tokens above are FTDS's light theme, copied so tools can read them; `styles/ftds.css` in each app is the source they come from.

What this file adds is how FTDS is used here. The two surfaces share every token and differ only in density: published sites are FTDS at its comfortable default, built for visitors on older phones; the admin is compact, for officers at a desk. Both are quiet on purpose. Structure comes from spacing and tone, one blue marks the way forward, and nothing is decorated. On the published sites that calm is enforced: officers arrange approved blocks and pick preset variants, so no page can drift from the system.

**Key Characteristics:**

- FTDS as installed, with no project palette, font or radius of its own.
- Comfortable density on published sites, compact density in the admin, from the same tokens.
- Light theme only, on both surfaces, for now.
- Inter, self-hosted, so neither surface makes a third-party font request.
- Pages in the admin are shown as they really render, never as a mock-up.

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

**The Light-Only Rule.** Both surfaces are light only for now: the admin sets `color-scheme: light` and ignores the OS preference, and published sites never switch. The dark tokens in the vendored CSS stay unused until dark mode is decided as a whole.

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

## Layout

- **Published sites:** comfortable density on `:root` (44px controls, 24px surface padding, 12/16/24px stack gaps). Page structure comes from the block sequence; officers can't change spacing or widths.
- **Admin:** FTDS `AppShell` with `data-density="compact"` (32px controls, 16px surface padding, 8/12/16px stack gaps). Screen content sits in a centred column up to 72rem (`max-w-6xl`) with `p-surface` padding.
- **Spacing:** use the density-aware tokens (`p-surface`, `gap-stack-sm|md|lg`) rather than fixed values, so a block reads correctly in either density.
- **Responsive:** admin screens are written phone-first. On wide screens a two-column grid (3fr and 2fr at `lg`) places each block; source order is the phone's order, so the most urgent information (site status) comes first on a phone.

### Named Rules

**The Phone-Order Rule.** Write an admin screen in the order a phone should read it, then place blocks on wide screens with grid placement. Never reorder content with CSS so that the visual order and the reading order differ on a phone.

## Elevation & Depth

Flat, as in FTDS: depth comes from Paper, Sheet and Well. Shadows exist only for things that float and close (menus, popovers, select lists, toasts, dialogs), using FTDS's Float and Lift shadows. Cards, tags, buttons, list rows and page previews never cast a shadow.

## Shapes

FTDS's gently rounded language: 8px on buttons and inputs, 12px on summary blocks, page previews and dialogs, pills (9999px) for tags. Inline links get a 4px radius so their focus ring has soft corners.

## Components

Every component comes from the FTDS registry (`pnpm dlx shadcn@latest add @ftds/<name>` in the admin, `node scripts/ftds-add.mjs astro-<name>` in the renderer). Files under `components/ui`, `components/blocks`, `lib/ftds` and `styles/ftds.css` stay as the registry ships them. The rules below are this project's additions; FTDS DESIGN.md, Components, covers the rest.

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

## Do's and Don'ts

### Do:

- **Do** read the FTDS DESIGN.md before building anything new; it governs everything this file doesn't mention.
- **Do** use FTDS components before writing your own, and build anything missing from FTDS tokens.
- **Do** keep published sites in comfortable density and the admin in compact density.
- **Do** show a page in the admin with the page frame, from the real renderer.
- **Do** carry every page and publish state as a wash tag with words.
- **Do** write every admin string through `t()`; site content and FTDS Astro labels are BM by default.

### Don't:

- **Don't** add a project palette, typeface, radius or shadow; this project has none of its own.
- **Don't** use raw Tailwind colours, hex values or `dark:` overrides.
- **Don't** edit files under `components/ui`, `components/blocks`, `lib/ftds` or `styles/ftds.css`.
- **Don't** give officers a way to style content on published sites: no colour pickers, font choices, free spacing or custom HTML. Variants are presets.
- **Don't** turn on the dark theme on either surface until it is decided for both.
- **Don't** put two filled blue buttons on one screen.
