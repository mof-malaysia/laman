# Brief: FTDS component coverage in the builder

> **Status, 3 Nov 2026:** with FTDS v0.2.2 the builder has the hero's layouts, tones, picture and footnote; Links (FTDS LinkList) and Downloads (DownloadList) in place of Link list, with stored blocks migrated (`0011_links_and_downloads`); Image through FTDS Figure; the P1 blocks (Page intro, Steps, Eligibility, Services, People); one Hero or Page intro per page, enforced by the API; and the 404 page. Templates other than Utama open with Page intro. Step 1 is done too (FAQ contact line, `multiple` and first answer open; Callout link; background on Entry list and Latest entries), and so is P2: Inset text, Details, Figures (StatsBand), Impact figures (ImpactStats) and Ways to do it (CtaCards, one way recommended at most). P3 is done as well: Call to action with picture (CtaSplit), Partners (PartnerGrid), Logos (LogoCloud), and Event details as a block on entries and pages, with an "Acara" collection template whose entries start with it. An event entry type (fixed event fields, a listing sorted by event date with upcoming and past) waits for an agency that needs it.

2 Nov 2026. How much of FTDS the builder lets officers use, what's missing, and in what order to add it. Read with `docs/briefs/hero-variants-and-html-in-canvas.md`, which covers the hero.

Compared: the FTDS registry (`registry/astro-core`, `registry/astro-marketing`: 51 Astro items) with what's installed in `apps/renderer/src/components` and what `packages/blocks/src/registry.ts` exposes as blocks.

## Summary

- **11 builder blocks** cover **9 FTDS components**. Image has no FTDS component. Link list draws its own markup and uses DownloadList only for PDFs.
- **12 FTDS content blocks an agency would use aren't offered**, including the ones a service page most needs: Steps, Eligibility, PeopleGrid and ServiceHighlights.
- **Most offered blocks expose only part of their component.** The hero has no image, the FAQ has no "still need help" line, and listings can't change background.
- **Installed copies match FTDS.** Every file in `components/` differs from its FTDS source only in the import path `ftds-add.mjs` rewrites, so there's no drift to fix first.
- **Two site-level gaps**: the published site has no 404 page (FTDS has StatusPage), and templates use Hero on inner pages where FTDS says to use PageIntro.

## Coverage

### Offered as blocks

| Builder block  | FTDS component                        | Exposed | Missing                                                                                                     |
| -------------- | ------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| Hero           | Hero                                  | Partly  | `media`, `footnote`, layouts (see the hero brief)                                                           |
| Prose          | Prose                                 | Fully   | None                                                                                                        |
| Image          | (none: builder markup)                | n/a     | FTDS has no figure component; fine as is                                                                    |
| Feature grid   | FeatureGrid                           | Fully   | None (`columns`, `surface`, `tone`)                                                                         |
| Link list      | DownloadList (PDFs only) + own markup | Partly  | `tone`; DownloadList's `layout: "cards"` and `width`. Links that aren't files are hand-drawn rows, not FTDS |
| FAQ            | Faq                                   | Partly  | `contact` ("Still need help?" with links), `multiple`, `defaultOpen`                                        |
| Callout        | Callout                               | Mostly  | The `actions` slot (a link under the message)                                                               |
| Contact        | ContactLocations                      | Fully   | None (channels and offices from Settings, overridable)                                                      |
| CTA band       | CtaBand                               | Fully   | None                                                                                                        |
| Entry list     | NewsList + Pager                      | Mostly  | `tone`                                                                                                      |
| Latest entries | NewsList                              | Mostly  | `tone`                                                                                                      |

### Used by the site, not as blocks

Masthead, Navbar and NavbarMenu, AnnounceBar, SiteFooter, Skiplink, PhaseBanner, Breadcrumb, Section and SectionHeading, Tag, Button, Link, Pager. PageIntro opens entry pages and the search page automatically.

### In FTDS, not in the builder

| FTDS component                 | What it's for                                         | Fit for agency sites                          | Recommendation                        |
| ------------------------------ | ----------------------------------------------------- | --------------------------------------------- | ------------------------------------- |
| **Steps**                      | How to apply, register or claim, numbered             | Core: most service pages are this             | **Add, P1**                           |
| **Eligibility**                | Who can apply, and who can't                          | Core for service pages                        | **Add, P1**                           |
| **PageIntro**                  | The quieter opening for inner pages                   | Every non-home page                           | **Add, P1**                           |
| **StatusPage**                 | 404, 500, maintenance                                 | Every site needs a 404                        | **Add, P1** (site-level, not a block) |
| **ServiceHighlights**          | Cards linking to services, with facts and a tag       | Home pages; top tasks                         | **Add, P1**                           |
| **PeopleGrid**                 | Leadership or team, photo, name and post              | Very common ("Pengurusan Tertinggi")          | **Add, P1**                           |
| **InsetText**                  | A deadline, requirement or quote set apart            | Common in service and policy text             | **Add, P2**                           |
| **Details**                    | Short help behind a link ("Help with your IC number") | Common on service pages                       | **Add, P2**                           |
| **StatsBand**                  | 2–4 headline figures                                  | Home and annual-report pages                  | **Add, P2**                           |
| **ImpactStats**                | Figures with period and source                        | Programme pages; more honest than StatsBand   | **Add, P2**                           |
| **CtaCards**                   | Two or three ways to do the same thing                | "Apply online, at a counter, by post"         | **Add, P2**                           |
| **CtaSplit**                   | Call to action with a picture and reasons             | Campaign pages                                | **Add, P3**                           |
| **PartnerGrid**                | Departments or partners behind a service, with links  | Ministry and programme pages                  | **Add, P3**                           |
| **LogoCloud**                  | A quiet row of partner logos                          | Some; logos need alt text                     | **Add, P3**                           |
| **EventDetails**               | Date, time, venue, fee, registration                  | Agencies run events; best on an entry         | **P3**, with an event entry type      |
| **Card**, **Tabs**             | Building pieces; Tabs needs script                    | Low as blocks                                 | Don't add as blocks                   |
| **Testimonial**                | What people say about a service                       | Rare and easy to misuse on government sites   | Don't add for now                     |
| **Carousel**                   | Slides                                                | Rejected in `PRODUCT.md` (autoplay carousels) | **Never**                             |
| **CookieBanner**               | Cookie consent                                        | Published sites set no cookies                | Not needed                            |
| **ThemeSwitch/Script**         | Dark mode                                             | Published sites are light only                | Not yet                               |
| **LanguageSwitcher**           | BM / EN                                               | A site has one language (BM/EN is KIV)        | Not needed                            |
| **Separator**, core **Footer** | Rule; minimal footer                                  | Covered by Section and SiteFooter             | Not needed                            |

## Ties to the hero plan

- The hero's `tasks` add-on and **ServiceHighlights** do the same job. Build the add-on from ServiceHighlights' card in FTDS rather than a third card style.
- The `figures` add-on should reuse **StatsBand**'s figure markup.
- **PageIntro** as a block takes pressure off the hero: inner pages ("Hubungi kami", "Perkhidmatan") get the quieter opening FTDS intends, and the hero's variants are for home and campaign pages. The `perkhidmatan` and `hubungi` templates in `templates.ts` switch to it.

## Work, in order

Each new block is a schema in `packages/blocks/src/blocks/`, a wrapper in `apps/renderer/src/blocks/` listed in `Block.astro`, and `node scripts/ftds-add.mjs astro-<name>` to install the component (`AGENTS.md`).

1. **Fill gaps in what exists** (no new blocks): FAQ `contact` line; Callout action; `tone` on Link list, Entry list and Latest entries; Link list draws every row with DownloadList, offering `layout`. Hero `media` and `footnote` are in the hero brief.
2. **A 404 page**: the publisher writes `404.html` from StatusPage `not-found` with the site layout; document the nginx/Caddy line for it.
3. **P1 blocks**: PageIntro (one h1: the API rejects a page with both a hero and a page intro, or two of either, through `kindIssues`), Steps, Eligibility, ServiceHighlights, PeopleGrid. Update the Perkhidmatan template to PageIntro, Eligibility, Steps, FAQ.
4. **P2 blocks**: InsetText, Details, StatsBand, ImpactStats, CtaCards.
5. **P3**: CtaSplit, PartnerGrid, LogoCloud; EventDetails with an event entry type.
6. **Registry test**: already renders every block's defaults and every template; nothing new to build, but each block adds its defaults.

## FTDS itself

The builder only uses Astro, but FTDS's definition of done expects each component in Astro and React. React has 14 marketing components to Astro's 31: ContactLocations, CtaCards, CtaSplit, DownloadList, Eligibility, EventDetails, ImpactStats, NewsList, PageIntro, Pager, PartnerGrid, PeopleGrid, Prose, Section, ServiceHighlights, StatusPage and Steps are Astro-only. That doesn't block the builder, but the hero work (Astro and React) should not widen the gap.

## Questions for the team

1. **Priorities**: does the P1 list match what agencies ask for? Steps and Eligibility are my guess at the most-needed, from what service pages contain, not from requests.
2. **One h1**: enforce one Hero-or-PageIntro per page in the API, or only warn in the editor?
3. **Events**: worth an event entry type now, or wait for an agency that runs events?
