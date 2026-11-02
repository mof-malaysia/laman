# Admin UX evaluation

1 Nov 2026, at `c6fc1fa` on `feat/site-builder-slice`. Read with `docs/project-context.md`.

**The lens:** an officer who uses the admin a few times a week, inherited the site from someone who has been transferred, and has nobody to ask. It's an expert review: a heuristic evaluation, cognitive walkthroughs of four tasks, an anti-pattern scan, and a code check behind each finding. No officers took part, so every "will the user…" is a judgement until a usability test confirms it.

**What I covered:** Dashboard, Pages (tree, detail, Settings tab), the new page flow, the editor (canvas, layers, insert, properties), Media (empty), Navigation, Settings and Publishing, at 1280 px and at phone width (375 px). **Not covered:** uploading media, the entry editor and scheduling in depth, History compare, Recently deleted, screen reader testing, and the published site itself.

## UX health score: 62 / 100

The admin is a strong base, and on its happy path it's better than most CMSs. The undo and recovery model, the explanations under each control, and the new page flow are all good. The score is held down by four things: the admin gives different answers to "what isn't live yet", there are three ways to make something go live, its own accessibility guardrails have gaps, and it breaks on a phone.

| Part                | Score | Weight |
| ------------------- | ----- | ------ |
| Heuristics (H1–H10) | 58    | 50%    |
| Task walkthroughs   | 55    | 35%    |
| Anti-patterns       | 100   | 15%    |

## Anti-pattern verdict: clean

No deceptive, manipulative or attention-seeking patterns. Destructive actions are honest and in proportion ("Danger zone", consequences named, soft delete). The catalog issues that do show up are Category 9 failures (common UX failures, not manipulation): **Missing Feedback**, **Inconsistent Patterns**, **Dead Ends**, **Jargon Overload** and **Mobile Afterthought**. They're listed below.

## Priority issues

### P0: blocks a core task

**1. The editor crashes at phone width.**
At 375 px, `/admin/pages/:id/edit` shows "Sorry, there is a problem" every time, with `TypeError: Cannot read properties of null (reading 'style')` in `<Canvas>`. The likely cause is [canvas.tsx:332](apps/admin/src/editor/canvas.tsx:332): `doc()?.documentElement.style` guards `contentDocument` but not `documentElement`, which is null while the frame is still loading, and the narrow layout seems to hit that moment. The urgent notice written on a phone after hours, a case named in the project context, can't be written.
→ Fix the crash now (engineering). Then `/transpose`: decide what the admin should do on a phone. Probably not the full editor, but at least the announcement bar, a text edit, and Publish.

**2. Crashes are a dead end.**
The error screen replaces the whole admin. There's no sidebar and no link back. "Try again" re-runs the crash, and "contact your administrator" points at a person the project context says doesn't exist, since each agency is on its own. An officer in the middle of a task can only edit the URL by hand.
→ `/fortify`: catch errors inside the shell, offer "Back to Pages", keep the draft (autosave already does), and say what to tell whoever installed the site. `/articulate` for the wording.

### P1: significant friction or harm to visitors

**3. The admin gives three different answers to "what isn't live yet".**
The header says **2 unpublished**. On the dashboard, the Unpublished changes stat says **0**, and the section underneath says both "Navigation has unpublished changes" and "Every published page is up to date". The stat counts only published pages with newer drafts ([dashboard.tsx:108](apps/admin/src/pages/dashboard.tsx:108)); moves, deletes, navigation and settings are left out. An officer who reads the big number thinks there's nothing to publish.
→ `/articulate` and `/journey`: one count of everything that will change, used everywhere, listed item by item (pages, moves, deletes, navigation, settings).

**4. There are three ways to make something go live, and two of them are invisible.**
Pages have "Publish page" in the editor. Navigation has "Save draft" and Settings has "Save", and neither has any way to publish from where you are. Walkthrough A shows the result: an officer changes the opening hours, presses Save, and leaves thinking it's done.
→ `/journey`: every screen that saves a draft says it isn't live yet and offers Publish right there, or one Publish in the header that is always visible. Keep the draft model, but make the second step impossible to miss.

**5. The guardrails allow pages with no main heading, or two.**
The hero is described as "the page's opening section, with its only h1", but nothing makes it single or required. The Insert palette offers Hero on a page that already has one, and the Hero panel has "Remove Hero". The template blocks only accept h2–h4 ([rich-text.ts:39](packages/blocks/src/rich-text.ts:39)), so a page without a hero has no h1, and a page with two heroes has two. That fails WCAG 1.3.1 and 2.4.6 in exactly the way the fixed blocks were meant to prevent. Headings can also jump levels (h2 straight to h4).
→ `/include`: make one hero, first and only, part of the page kind's rules (the way a listing must have one entry list), and keep heading levels in order inside rich text.

**6. Content accessibility is warned about, not enforced.**
Missing alt text is "a warning everywhere" ([contracts index.ts:227](packages/contracts/src/index.ts:227)), so an image can be published without it. Nothing checks for alt text that is a filename or "gambar", link text like "klik sini", images of text, or PDFs. These are the commonest failures on government sites, and the template can't prevent them.
→ `/include` then `/articulate`: a pre-publish check that blocks publishing for missing alt text and warns, with a plain reason and a fix, about the rest. Be honest about what it can't check.

**7. The canvas is too small to read at Fit.**
At 1280 px the canvas shows a desktop page at about a third of its size. Body text comes out around 5 px, and the hero's "Eyebrow" and "Description" placeholders are barely visible. Officers who need reading glasses, and the project context assumes there will be some, will edit text they can't read.
→ `/include`: open at 100% or at the tablet width, or set a minimum scale so canvas text never drops below about 12 px.

### P2: friction you can get past

**8. The same idea has several names.**
"Collection" in the new page flow, "Listing page" in page Settings, "Listing" in the Insert palette, and "entries" everywhere. On Pages, the page title is "Shown in the navigation", but the navigation is curated separately on purpose. → `/articulate`: a short glossary in `en.ts`, then one term per idea.

**9. Jargon on the panels.** "Eyebrow", "h1", "RSS feed", "slug" in the docs and code (the UI says "Address", which is good), and "SEO" as a tab name. → `/articulate`: "Small heading above the title", "Main heading", "News feed for apps (RSS)".

**10. Status is shown only by a coloured dot.** The tree's Published, Changed and Draft dots differ only by colour, and the legend is at the bottom of a long column. Screen readers get the text, but sighted officers with colour blindness don't. → `/include`: add a shape or a short label (FTDS `Tag`, as `docs/admin.md` planned).

**11. The announcement is under Navigation.** An officer with an urgent notice is unlikely to look under "Navigation" for it. → `/organize`: give the announcement its own sidebar item, or a dashboard action ("Post an announcement").

**12. Unlabelled trash count.** The trash icon with "8" beside it in the Pages header doesn't say "Recently deleted" until you hover. → `/articulate`: a visible label, or a tooltip with the text in the name.

**13. Admin is English only.** For the reason in the project context. → `/investigate` with the first real officers; `t()` makes BM cheap.

### P3: polish

**14.** Recent edits on the dashboard shows a page by its slug when it has no title ("soalan-tak-lazim"). **15.** "Took 0 s" in every publish row adds nothing until a publish is slow. **16.** The collapsed sidebar is remembered per browser (`admin.sidebar`), so on a shared office PC the next officer finds icon-only navigation. Consider defaulting to expanded.

## Heuristic scores (0 = no issue, 4 = catastrophic)

| Heuristic                                 | Score | Main evidence                                                                                               |
| ----------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------- |
| H1 Visibility of system status            | 3     | Three different unpublished counts (#3); "Saved · Live" in the editor is excellent                          |
| H2 Match with the real world              | 2     | Eyebrow, h1, RSS (#9); the page/collection explanations are very good                                       |
| H3 User control and freedom               | 1     | Undo, discard, soft delete, restore as draft, redirects on move: strong. The crash dead end (#2)            |
| H4 Consistency and standards              | 2     | Collection, listing, entry (#8); three publish models (#4)                                                  |
| H5 Error prevention                       | 3     | Zero or two h1s (#5), alt text not enforced (#6); navigation's "can't go live yet" check is a model to copy |
| H6 Recognition rather than recall         | 2     | Colour-only status (#10), unlabelled trash count (#12), announcement hidden under Navigation (#11)          |
| H7 Flexibility and efficiency             | 0     | Shortcuts shown inline, ⌘K, and none required                                                               |
| H8 Aesthetic and minimalist design        | 2     | Calm and dense; the canvas at Fit is unreadable (#7)                                                        |
| H9 Recognising and recovering from errors | 3     | Generic crash screen with no way back and a non-existent administrator (#2)                                 |
| H10 Help and documentation                | 1     | One-line help under almost every control and example values. No task-level help ("How do I…")               |

## Cognitive walkthroughs

**A. "The office hours changed. Update the site."** Result: **fails at step 4.**

| Step                                          | Rating     | Why                                                                                                                                  |
| --------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Go to Pages, open the Contact page         | Pass       | The obvious place to look                                                                                                            |
| 2. Find the hours in the editor               | Hesitation | The contact block says its details come "from the site settings", but doesn't link there                                             |
| 3. Settings → Contact, change the hours, Save | Pass       |                                                                                                                                      |
| 4. Make it live                               | Failure    | Nothing on Settings says it isn't live, and there's no Publish there. Only the header's "2 unpublished" hints at it (Q1 and Q4 fail) |

**B. "The office is closed tomorrow because of floods. Tell the public now."** Result: **fails on a phone, hesitates on desktop.**

| Step                             | Rating     | Why                                                                                    |
| -------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| 1. Find where announcements live | Hesitation | Under Navigation (#11). An officer might make a new page instead                       |
| 2. Write it, set the dates       | Pass       | Tag by meaning, a 120-character counter, show-from and hide-after dates: well designed |
| 3. Make it live                  | Hesitation | Save draft, then find Publish elsewhere (#4)                                           |
| On a phone                       | Failure    | The editor crashes (#1); the rest of the admin is cramped but works                    |

**C. "Add a news article."** Result: **passes with hesitation.** "New page → A collection" explains entries well, but "collection" in this flow becomes "listing page" in Settings (#8), and the officer has to work out that the article goes inside Berita rather than being a new page.

**D. "You've just been given the website. What's waiting to go live?"** Result: **fails.** The dashboard's big number says 0 while the header says 2 (#3).

## What works: keep these

- **Recovery is excellent.** Soft delete with Recently deleted, restore as draft, Discard changes, redirects offered on move and unpublish, and confirmation that names the consequences ("Delete Perkhidmatan and 2 child pages"). This is user autonomy done properly.
- **Explanations at the point of need.** Almost every control has one plain sentence under it ("Lower-case letters, numbers and hyphens, for example soalan-lazim"). For an officer with no support team, this is the most valuable pattern in the admin. Extend it, don't trim it.
- **The new page flow.** "What are you making?" with examples ("news, announcements, tenders, circulars…") and a live preview, plus the warning that a collection can't become a page again.
- **Navigation's "Some links can't go live yet".** Specific, says what will happen ("left out until it is"), and doesn't block. It's the model for the pre-publish accessibility check in #6.
- **"Saved · Live" beside Publish** in the editor is the clearest status in the admin. Use it on Settings and Navigation too.
- **Block kinds limiting the palette.** The right kind of guardrail: unavailable blocks never appear, so the officer is never told no.

## Recommended actions, by Intent skill

1. **Engineering, now:** fix the canvas crash (#1).
2. **`/fortify`:** the error screen inside the shell with a way back (#2); then the phone states once `/transpose` has decided the scope.
3. **`/journey`:** one publish model and one source of truth for unpublished changes (#3, #4). This is the biggest change for officers and touches the header, dashboard, Settings and Navigation.
4. **`/include`:** one hero, ordered heading levels (#5); the pre-publish accessibility check (#6); canvas scale (#7); status beyond colour (#10). Then a real screen reader pass, which this review didn't do.
5. **`/articulate`:** the glossary and jargon (#8, #9, #12), the error copy (#2), and the check messages for #6.
6. **`/organize`:** where the announcement lives (#11).
7. **`/transpose`:** what the admin must do on a phone.
8. **`/investigate`:** a usability test with three to five officers who've never seen the admin, on walkthroughs A, B and D. That turns this review's judgements into evidence.
