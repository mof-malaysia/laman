# Product

<!-- impeccable:product-schema 1 -->

Source: `docs/project-context.md` (1 Nov 2026), `docs/laman.md`, `docs/admin.md` and the code on `feat/site-builder-slice`, confirmed by the owner on 2 Nov 2026. No research with officers or visitors has been done yet: lines marked **Assumption** need checking with real users before they decide anything.

## Platform

web

## Users

- **The officer who runs the site (primary user of the admin).** Someone in an agency's corporate communications or ICT unit, or a clerk given "the website" on top of their main job. They carry accountability: a mistake on a government site can become a complaint or a news story, so they want to see exactly what visitors will see before it goes out.
  - **Assumption:** they open the admin a few times a week for a few minutes, so each visit starts half-cold.
  - **Assumption:** they rotate. The person who set the site up is often transferred within two or three years, and the next one learns it with no handover.
  - **Assumption:** content arrives from other divisions as Word files, PDFs, posters and WhatsApp messages; the real job is often "turn this file into a page, quickly".
  - **Assumption:** some work is urgent (office closures, flood notices, deadline changes), written under pressure, sometimes outside office hours, sometimes on a phone.
  - **Assumption:** digital confidence varies, from WordPress-fluent to mostly Word, email and WhatsApp.
- **The public visitor (whom the published site serves).** The rakyat looking for a form, an office address, opening hours, a tender, or whether a service is affected today. They come to finish a task and leave.
  - **Assumption:** mostly on mobile, often a mid-range or older Android phone, sometimes on a slow or metered connection. BM first for most; English, Chinese and Tamil speakers also visit.
  - They include elderly visitors, people with low literacy, people with disabilities, and people under stress (a disaster, a deadline, a benefit they depend on).
- **The approver.** A head of unit or director who signs off on what goes public. **Assumption:** sign-off happens today outside the system (often WhatsApp screenshots). Not in the product yet.
- **The ICT administrator (supporting).** Installs and upgrades the Docker image or systemd service, manages backups, resets passwords from the CLI. Wants it to run quietly on the agency's own infrastructure.

## Product Purpose

Give a Malaysian government agency a website that is accessible and well designed by default, and give the officers who run it an admin where the accessible way of doing something is also the easiest way.

Both halves matter. Locking the design down only protects visitors if officers don't route around it: the guardrails fail the moment it is easier to upload a poster of the text than to type the text.

Success means a new officer can run the site without a handover, urgent notices go out fast and right, content (not only the template) is accessible, published sites meet WCAG 2.2 AA, agencies stop needing a vendor for content changes, and visitors finish their task. Each signal has a counter-metric in `docs/project-context.md`.

## Positioning

A self-hosted, single-tenant website builder in the spirit of Isomer and WordPress, where officers can only arrange approved FTDS blocks and pick preset variants. There is no free styling, no custom HTML and no plugins, so the design system's accessibility can't be routed around. One renderer draws the editor canvas, the preview and the published static site, so what the officer sees is what visitors get.

## Operating Context

- Each agency installs and runs its own copy (Docker or Node with systemd), ideally on an internal network or behind a VPN. There is no cloud we operate and **no central support team**: the admin has to teach itself through plain labels, explanations at the point of need, empty states that say what to do, and errors that say how to recover.
- The published site is static HTML in `data/public`, served by the same process or any web server, and keeps working when the builder is off.
- The workflow is draft, publish, history and restore. Settings and navigation are drafted and published like pages.
- The pilot site is our own project, not an agency. It proves the builder works but won't show how a cold, rotating officer copes.
- Unknown: whether agency networks let officers reach the builder from a phone, which matters for urgent notices.

## Capabilities and Constraints

- **Built:** Fastify server, SQLite, a static publisher, an Astro renderer on FTDS components; an admin on FTDS `AppShell` with dashboard, page tree with Recently deleted, a new-page flow (page or collection, then a template), page detail with live preview, the block editor (canvas, layers, schema-generated property panel, inline text), a media library with required alt text, navigation (navbar, announcement, footer), site settings, and publishing with schedules and history with restore.
- **Blocks:** hero, prose, feature grid, image, callout, CTA band, link list, FAQ, contact, entry list, latest entries. Page kinds (`page`, `listing`, `entry`) limit which blocks fit. Agencies can't add blocks or kinds.
- **Not built yet:** sign-in, users and roles, an audit log of who did what, BM/EN side by side, Pagefind search, backups from the admin.
- **Languages:** site content is BM by default with EN as a second slot. **Decided:** the admin will support both BM and EN for its own text. Open: which is the default, and when it ships (today it is English only, through `t()`).
- **Terminology:** "page", "listing" (collects dated entries), "entry" (an article under a listing), "draft", "publish", "live", "announcement".
- **Open decisions:**
  - Approval: the RFC has no approval layer. A lighter option (a shareable expiring preview link and an "Approved by" note in history) is proposed, not decided.
  - Content guardrails: checks for text in images, scanned PDFs, "klik sini" links and meaningless alt text are wanted but not designed.
  - Who did it: when auth and the audit log move up the build order.
  - Documents: how PDFs show size, language and an HTML alternative.

## Brand Commitments

- **FTDS v0.2.0** is the design language for both the admin and the published sites, installed through the shadcn registry. Missing pieces are built from FTDS tokens, never raw colours. Registry files stay as shipped.
- Officers choose among approved blocks and preset variants only; each agency's identity comes through its site name, agency name and logo in site settings.
- Product name: "Laman", in the admin and the docs.

## Evidence on Hand

- Product docs: `docs/laman.md` (architecture RFC), `docs/admin.md` (admin design), `docs/project-context.md` (users and stance), `docs/admin-evaluation.md`, `docs/briefs/`, `docs/journeys/`.
- Templates with real starting content: Utama, Perkhidmatan, Hubungi, Berita (`packages/blocks/src/templates.ts`).
- **No user research, usability tests, agency testimonials or adoption figures exist.** Future work must not invent them.

## Product Principles

1. **The accessible way is the easy way.** When the admin refuses something, it says why in plain words and offers the accessible path; a refusal with no way forward pushes officers to a less accessible workaround.
2. **Design for the occasional, rotating officer first.** Labelled, self-explaining screens come first; keyboard shortcuts and ⌘K speed things up but are never the only path.
3. **Show consequences before they happen, and make them undoable.** Public and destructive actions show what will change, and can be reversed (soft delete, restore as draft, redirects on move).
4. **Vulnerable visitors set the bar.** Elderly, low-literacy, disabled and stressed visitors decide what "good enough" means, not the average visitor.
5. **Be honest about what the system checks.** Where the builder can't verify something (whether alt text is meaningful, whether a PDF is tagged), it says so rather than showing a tick that implies it did.

Rejected outright, because this is a public service with no revenue model: tracking beyond what the agency's policy requires, pop-ups, interstitials, autoplaying carousels, newsletter gates, and every manipulative pattern.

## Accessibility & Inclusion

- WCAG 2.2 AA is the only standard designed to, for both the admin and the published sites. Government web guidelines and assessments (SPLaSK and the like) are out of scope.
- Published sites: static, with no JavaScript beyond what FTDS components need; built for older phones and slow connections.
- The admin is light theme only.
