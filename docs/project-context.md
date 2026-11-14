# Project context: Laman

Status: draft, written 1 Nov 2026 from the brief, `docs/laman.md`, `docs/admin.md` and the code as of `c6fc1fa`. Nothing here comes from user research yet. Lines marked **Assumption** need checking with real officers before they shape a decision.

## The one-sentence intent

Give a Malaysian government agency a website that is accessible and well designed by default, and give the officers who run it an admin where the accessible way of doing something is also the easiest way.

The second half matters as much as the first. Locking the design down only protects visitors if officers don't route around it. The guardrails fail the moment it's easier to upload a poster of the text than to type the text.

## Users

There are three groups. The admin serves the first, the published site serves the third, and the second decides whether the first is allowed to act.

### 1. The officer who runs the site (primary user of the admin)

Usually someone in the agency's corporate communications unit or ICT unit, sometimes a clerk given "the website" on top of their main job.

- **Web work is part of the job, not all of it.** **Assumption:** most officers open the admin a few times a week, for a few minutes, between other duties. They don't build up muscle memory, so each visit starts half-cold.
- **They rotate.** Civil servants get transferred. **Assumption:** the person who set the site up is often gone within two or three years, and the next person learns it from whatever the last one left behind. Whatever the admin teaches has to be learnable without a handover.
- **Content arrives from elsewhere.** Other divisions send announcements, tenders and circulars as Word files, PDFs, posters and WhatsApp messages. The officer's real task is often "turn this file into a page, quickly". That's where most accessibility is lost today: the PDF or the poster image gets uploaded as is.
- **Some work is urgent.** Office closures, flood notices, deadline extensions, a minister's statement. These are written under pressure, sometimes outside office hours, sometimes on a phone.
- **Varied digital confidence.** Some officers are fluent with WordPress. Others mostly use Word, email and WhatsApp. **Assumption:** BM is the working language for many, and English UI text costs them effort (see Tensions).
- **They carry accountability.** Something wrong on a government site can turn into a complaint or a news story. Officers are careful, and they want to see exactly what visitors will see before it goes out.

### 2. The approver (not in the product yet)

The head of unit, the director, or the corporate communications head who signs off on what goes public. **Assumption:** in most agencies nothing is published without someone above the officer agreeing to it, even if that agreement happens over WhatsApp with a screenshot. The RFC deliberately has no approval layer, so today this person lives outside the system.

### 3. The public visitor (whom the guardrails protect)

The rakyat looking for a form, an office address, opening hours, a tender, or whether a service is affected today.

- Mostly on mobile, often on a mid-range or older Android phone, sometimes on a slow or metered connection.
- BM first for most; English, Chinese and Tamil speakers also use the sites.
- Includes elderly visitors, people with low literacy, people with disabilities (screen reader users, low vision, motor and cognitive impairments), and people in a stressful situation (a disaster, a deadline, a benefit they depend on).
- They didn't come to browse. They came to finish a task and leave.

### The ICT administrator (supporting)

Installs and upgrades the Docker image, manages backups, resets passwords from the CLI. Cares about it running quietly on the agency's own infrastructure with little to look after.

## What they do today

**Assumption, based on how agency sites usually look:** a WordPress or Joomla site with a bought theme and plugins, or a site built by a vendor who also takes content changes as tickets. Common results: image carousels, text in images, PDFs instead of pages, "klik sini" links, low-contrast colours, deep menus that mirror the org chart rather than what people come for, and pages nobody has updated since the person who made them was transferred.

Laman replaces the theme and plugins (FTDS blocks, fixed layouts) and the vendor ticket (officers edit and publish themselves).

## The product today

Built (on `feat/site-builder-slice`):

- Fastify server, SQLite, a static publisher, a renderer on FTDS Astro components.
- An admin on FTDS `AppShell`: dashboard, page tree with Recently deleted, a full-screen new page flow (page or collection, then a template), page detail with live preview, the block editor (canvas, layers, property panel generated from block schemas, inline text), media library with required alt text, navigation (navbar, announcement, footer), site settings, publishing with schedules and history with restore.
- Eleven blocks: hero, prose, feature grid, image, callout, CTA band, link list, FAQ, contact, entry list, latest entries. Pages have kinds (page, listing, entry) that limit which blocks fit.

Kept in view, not planned: BM/EN side by side (a site has one language). Built since: sign-in, users and roles and an audit log (`docs/auth.md`), site search (Pagefind), and backups (`docs/laman.md` § Backup and restore).

## Hard constraints

| Area           | Constraint                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosting        | Single tenant, self-hosted by each agency. No cloud we operate. The builder should sit on an internal network or behind a VPN.                                                  |
| Design freedom | Officers arrange approved FTDS blocks and choose preset variants. No free styling, no custom HTML, no new blocks or kinds from the admin.                                       |
| Design system  | FTDS v0.2.6 via the shadcn registry. Gaps are built from FTDS tokens, never raw colours.                                                                                        |
| Output         | Static HTML that keeps working when the builder is off.                                                                                                                         |
| Languages      | Site content in one language, BM by default; a second content language is kept in view. Admin UI in English today.                                                              |
| Workflow       | No approval layer in the first version, to keep it simple. Not a permanent decision. Draft, published, history.                                                                 |
| Standards      | WCAG 2.2 AA is the only standard we design to. Government web guidelines and assessments (SPLaSK and the like) are out of scope, even where an agency is measured against them. |
| Pilot          | The first site is our own project, not an agency. Agencies come later, and each runs its own copy with no central support team.                                                 |

## Ethical stance

This is a public service. There's no revenue model, no engagement target and no reason for any pattern in the Intent anti-pattern catalog to exist here. Every one of them is rejected. Specifically:

- **Visitors' attention and data are not the product.** No tracking beyond what the agency's policy requires and states. No pop-ups, interstitials, autoplaying carousels or newsletter gates. The published site is static, with no JavaScript beyond what FTDS components need.
- **Vulnerable visitors are the design target, not an edge case.** Elderly, low-literacy, disabled and stressed visitors decide what "good enough" means.
- **The guardrails are protective, not controlling.** When the admin refuses something, it says why in plain words and offers the accessible way to do it. A refusal with no way forward pushes officers to a workaround, and the workaround is less accessible than the thing refused.
- **Officers are trusted with consequences they can see.** Destructive and public actions show what will change before they happen, and can be undone (soft delete, restore as draft, redirects on move). This is already a strong point of the admin.
- **Honesty about what the system checks.** If the builder can't check something (whether alt text is meaningful, whether a PDF is tagged), it says so rather than showing a green tick that implies it did.

## What success looks like

User value and agency value, together. Every metric here can be gamed, so each has a counter-metric.

| Outcome                                           | Signal                                                                                   | Counter-metric (watch for harm)                                                  |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| A new officer can run the site without a handover | A first-time officer publishes an edited page unassisted in a usability test             | Help requests and "how do I…" questions per agency in the first month            |
| Urgent notices go out fast and right              | Time from "I have the text" to the announcement live, on desktop and phone               | Corrections or unpublishes within an hour of an urgent publish                   |
| Content is accessible, not just the template      | Share of published content as HTML pages rather than PDFs or images of text              | Alt text that is empty, a filename or "gambar" passing the required-field check  |
| Published sites meet WCAG 2.2 AA                  | Automated checks (axe) on every published page: zero serious or critical issues          | Manual audit with screen reader users, since automated checks find about a third |
| Agencies stop needing a vendor for content        | Content changes made in the admin vs. raised as tickets                                  | Pages left stale: no edits in 12 months on pages visitors still reach            |
| Visitors finish their task                        | Task completion in visitor testing (find opening hours, download a form, check a notice) | Bounce-to-phone: calls to the agency asking what the site should have answered   |

## Tensions to resolve

These came out of reading the docs against the code. Each one changes what gets designed next.

1. **Power tool or occasional tool?** `docs/admin.md` frames officers as people who "live in this tool": keyboard-first, ⌘K, `j`/`k`, open-page tabs. The latest commit moved to `AppShell` with a labelled sidebar and removed the tabs and status bar, which suits an occasional user much better. The docs should be updated to say which user the admin is for. **Recommendation:** design for the occasional, rotating officer first; keep keyboard shortcuts as an accelerator, never the only path.

2. **No approval layer, but government publishing needs sign-off.** If approval isn't in the product, it happens in WhatsApp with screenshots, which loses the record and invites a mismatch between what was approved and what was published. A full workflow engine isn't the only answer. **Lighter option:** a shareable, expiring preview link for a draft, so the approver sees the real page on their phone, and a note on publish ("Approved by …") that lands in history. That keeps the RFC's "no approval layer" while meeting the real process.

3. **The guardrails cover the template, not the content.** FTDS and the fixed blocks handle contrast, focus, layout, headings in the block structure and responsive behaviour. They don't stop the commonest failures on government sites: a poster image with the notice as text, a scanned PDF, "klik sini" links, a missing or meaningless alt text, a wall of legal jargon. These are content guardrails, and they need their own design: checks at save and at publish, plain explanations, and an easy accessible path (for example, "This image looks like it contains text. Put the text in the page so everyone can read it.").

4. **Admin language.** Admin text is English while site content is BM. **Assumption:** many officers would work faster and make fewer mistakes in BM. `t()` already makes a BM admin cheap to add; whether it's the default is a question for research.

5. **Who did it.** Auth and the audit log are later phases, but in a government agency "who published this, and when" is often the first question after a mistake. History shows when, not who. This should move up the build order before any agency uses the builder in production.

6. **Files are content.** Agencies publish a lot of documents (forms, circulars, tender documents, annual reports). Media accepts PDF, but nothing yet says whether a PDF is accessible, gives its size and language next to the link, or offers an HTML alternative. For many visitors the document is the whole reason they came.

## Gaps in this context

- No research with officers or visitors. Everything about their behaviour above is an assumption.
- **The pilot is our own project.** It proves the builder works, but the people running it know the product, so it won't show how a cold, rotating agency officer copes. Test that separately, with officers who've never seen it.
- **No central support.** Each agency is on its own after install, and probably won't want to join a programme. The admin has to teach itself: plain labels, explanations at the point of need, empty states that say what to do, errors that say how to recover. No manual or trainer is coming.
- Unknown: whether an agency's network lets officers reach the builder from a phone, which matters for urgent notices.

## Suggested next steps

1. **Talk to five officers who run an agency site today** (`/investigate`). Watch one real update from "file arrives" to "live". This tests most of the assumptions above in a week.
2. **Design the urgent-notice flow end to end** (`/journey`), on a phone as well as desktop. It's the highest-stakes task and the one most likely to break the guardrails.
3. **Design the content guardrails** (`/include`, then `/articulate` for the wording): which checks run at save and at publish, how they explain themselves, and what the accessible path is for each.
4. **Evaluate the current admin with a first-time user lens** (`/evaluate`): a cognitive walkthrough of "you've just been given the website; change the opening hours and publish".
