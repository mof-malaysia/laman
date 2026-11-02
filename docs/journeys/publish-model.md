# Journey: how changes go live

1 Nov 2026. Fixes findings #3 and #4 in `docs/admin-evaluation.md`, and covers the urgent announcement (walkthrough B) and the phone. Users and constraints are in `docs/project-context.md`. The flow diagrams are in `publish-model.html` next to this file.

## The problem

An officer has to answer two questions before leaving the admin: **is what I did live?** and **will this publish anything I didn't mean to?** Today the admin can't answer either reliably.

**What happens today** (read from the code at `c6fc1fa`):

| The officer does                               | What actually happens                                                                                                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edits a page, presses **Publish page**         | That page goes live, **and** the navigation and settings drafts, **and** every pending move, unpublish and delete (`promoteDrafts` in `POST /pages/:id/publish`) |
| Edits Settings or Navigation, presses **Save** | A draft. Nothing on the screen says it isn't live, and there's no way to publish from there                                                                      |
| Moves, unpublishes or deletes a page           | Gone from the tree now, still on the site until **any** publish of anything                                                                                      |
| Creates a page and never publishes it          | It appears in no "waiting" count; the dashboard's "Unpublished changes" says 0                                                                                   |
| Looks at what's waiting                        | Header: "2 unpublished". Dashboard stat: 0. Dashboard section: "Navigation has unpublished changes" and "Every published page is up to date"                     |

The second row is the walkthrough A failure. The first row is worse because it's silent: the button says "page" but its scope is "nearly everything". That's the opposite of the project context's stance that officers are "trusted with consequences they can see".

**Success looks like:** any officer, on any screen, can say in one glance whether their change is live, and every Publish button does exactly what its label says, no more.

## Who and when

- **The occasional officer**, half-cold each visit, on a desktop at work. Most edits are one page or one setting, then leave.
- **The urgent officer**, after hours, on a phone, with one message to get out now. Can't afford ambiguity or a crash.
- **Later, two officers on one site.** Not in the pilot, but the model must not make it unsafe: one officer's Publish must never ship the other's half-done work. Scoped publishing gives us that for free.

## The model

Four rules, used on every screen.

1. **Saving never changes the site.** Pages autosave; Settings and Navigation keep an explicit Save (forms with several fields need one), but say beside it that the change isn't live yet.
2. **Every Publish button publishes exactly what its label names.** "Publish page" publishes this page. "Publish navigation" publishes the navigation. "Publish announcement" publishes the announcement. Nothing rides along.
3. **Changes to the page tree go live when you confirm them.** Move, Unpublish, Delete and Restore already have a confirm step that names the consequences and offers redirects. The confirm button becomes "Move and publish", "Unpublish now", "Delete from the site". There is no longer a page that's gone from the tree but still on the site.
4. **One list of what's waiting, used everywhere.** The header count, the dashboard, and the Publishing screen all read the same list, and Publish all ships exactly that list.

**Why rule 3 rather than tree changes waiting for the next publish:** a pending move or delete is the hardest state to explain ("removed from the tree, still on the site") and the one most likely to be shipped by accident. These actions already ask for a deliberate confirmation with consequences shown, so the confirmation is the right moment for them to take effect. Undo stays: move it back, Restore from Recently deleted, Publish again.

**Alternative ruled out: one site-wide Publish only** (no per-item buttons). Simple to explain, but it makes rule 2 impossible: the urgent announcement would also ship whatever else is half-done. It also turns the second officer's arrival into a hazard.

### One vocabulary

Every item shows one of three states, in words, with the same `Tag` everywhere (tree, dashboard, editors, Settings, Navigation):

| State                   | Means                                           | Tag tone |
| ----------------------- | ----------------------------------------------- | -------- |
| **Live**                | What visitors see is what's here                | success  |
| **Changes not live**    | It's on the site, and newer changes are waiting | warning  |
| **Not on the site yet** | It has never been published                     | neutral  |

These replace "Published", "Changed" and "Draft", which describe our model rather than what the officer worries about: the site.

## Screens and states

### 1. The waiting list (one component, three places)

**Why it exists:** it is the single answer to "what isn't live yet". The same component renders in the header's popover, on the dashboard, and on the Publishing screen.

- **Header:** "3 not live" as a button (not "2 unpublished"). It opens a popover with the list. With nothing waiting it reads "Everything is live", and still opens, so the officer can confirm it.
- **Rows**, grouped and in this order:
  - **Changes not live:** pages with newer drafts, Navigation, Settings, Announcement. Each row: name, what kind of thing it is, when it was last changed, a "Review" link to its screen, and a checkbox.
  - **Not on the site yet:** new pages. Listed but unchecked by default, because a new page being drafted is normal, and publishing it by accident is a visible mistake.
- **Primary action:** "Publish 3 changes", counting the ticked rows. It never says "Publish site".
- **Count rule:** the header count is the "Changes not live" group only. New pages are listed but don't count toward the warning, so the count doesn't nag while someone drafts a page over a week.

### 2. Every editor: the status bar beside Publish

The editor's "Saved · Live" indicator is the best status in the admin today. It becomes the pattern for Page, Navigation, Settings and Announcement:

- **Left:** save state. "Saving…", "Saved 10:42", "Couldn't save. Trying again".
- **Middle:** the state Tag. "Live", "Changes not live", "Not on the site yet".
- **Right:** the scoped Publish button: "Publish page", "Publish navigation", "Publish settings", "Publish announcement". Disabled with "Everything here is live" as its tooltip when there's nothing to publish.

On Settings and Navigation the explicit Save stays, and the bar shows "Saved. Not live yet" after it. That message is the fix for walkthrough A.

### 3. Publishing something

**Publish, never a modal for the common case.** The button turns into progress in place, then confirmation:

1. "Publishing…" with a spinner (the job usually takes under a second).
2. **"Live · 10:42 · View on site ↗"**, linking to the public page. The link proves it, instead of asking the officer to trust a green tick.
3. On failure: "Couldn't publish. Your changes are saved. **Try again** · What went wrong", the second opening the job's log entry. The site stays as it was (the publisher already swaps atomically), and the message says so.

**When a publish has consequences**, it asks first, in a dialog that names them, only in these cases:

- Publishing a page that the navigation links to while the navigation is also not live: "The navigation also has changes that aren't live. Publish them too?" with **Publish page only** as the default.
- Publishing navigation that links to pages not on the site yet: the existing "Some links can't go live yet" list, with "Publish anyway" (those links are left out until the page goes live, as now).

### 4. Tree changes (move, unpublish, delete, restore)

The existing confirmations stay, with three changes:

- The confirm button names the effect on the site: **"Move and publish"**, **"Unpublish now"**, **"Delete from the site"**, **"Restore and publish"**.
- The dialog body leads with the site: "Visitors at /perkhidmatan/zakat will be sent to /zakat from now on."
- Afterwards, the same in-place confirmation: "Live · View on site".

### 5. The urgent announcement

**Why it gets its own path:** it's the most time-critical thing an officer does, and today it hides under Navigation and is published together with the navbar.

- **Where:** "Announcement" becomes its own sidebar item (not under Navigation), and the dashboard gets a "Post an announcement" action. (`/organize` to confirm placement.)
- **Its own document:** the announcement is split out of the navigation draft, so publishing it never ships a half-done navbar. (Contract change: see Pending questions.)
- **The form, top to bottom:** message (120 characters, counter), what kind (information, warning or deadline, disruption, new or resolved, general), an optional link, show until (defaults to the end of tomorrow, never "forever" by default), every page or home only.
- **Primary action:** **"Publish announcement"**. Show-from is folded under "Schedule for later", because the urgent case is "now".
- **After:** "Live on every page · until 2 Nov, 11:59 pm · View on site ↗", plus "**End now**", which takes it down with one confirmation. Ending is as easy as posting.

### 6. On a phone

What must work at 375 px, and nothing more for now. The full canvas editor stays desktop-only; `/transpose` owns the detail.

| Must work on a phone                | How                                                                                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| See what isn't live                 | The waiting list as a full-screen sheet from the header                                                                                      |
| Post, edit and end the announcement | The announcement form is one column already; it's the phone's primary task                                                                   |
| Fix text on an existing page        | The editor at phone width shows a form view: the layers list, then one block's fields full-screen, with Preview. No canvas, no drag and drop |
| Publish a page, unpublish a page    | The scoped Publish in the status bar; Unpublish from the page's Settings tab                                                                 |

**Not on a phone:** building a page, rearranging blocks, media upload (beyond picking from the library), navigation, settings. When an officer opens one of those, say so and offer the desktop link by email or copy, instead of a cramped screen that half works.

## The three walkthroughs, redone

**A. Change the office hours.** Settings → Contact → change → **Save** → the bar says "Saved. Not live yet" → **Publish settings** → "Live · View on site". Four steps, no hidden second step.

**B. Flood closure, after hours, on a phone.** Dashboard → **Post an announcement** → message, "disruption", until tomorrow → **Publish announcement** → "Live on every page · View on site". Next day: **End now**. Nothing else on the site changes.

**D. "What's waiting?"** Header: "3 not live" → the list, by name. Same list on the dashboard. One number everywhere.

## Copy (direction; `/articulate` owns the final words, in `en.ts`)

| Where                   | Text                                                                    |
| ----------------------- | ----------------------------------------------------------------------- |
| Header, things waiting  | "3 not live"                                                            |
| Header, nothing waiting | "Everything is live"                                                    |
| Waiting list, primary   | "Publish 3 changes"                                                     |
| After Save on a form    | "Saved. Not live yet"                                                   |
| Publishing              | "Publishing…"                                                           |
| Published               | "Live · 10:42 · View on site"                                           |
| Failed                  | "Couldn't publish. Your changes are saved and the site hasn't changed." |
| Move confirm            | "Move and publish"                                                      |
| Delete confirm          | "Delete from the site"                                                  |
| Announcement, live      | "Live on every page until 2 Nov, 11:59 pm"                              |

Avoid "draft", "promote", "revision" and "unpublished" in the UI. They describe the system, not the site.

## Interaction and accessibility notes

- Publish progress and results are announced in a polite live region; failures in an assertive one.
- After an in-place publish, focus stays on the button (now showing the result); "View on site" is the next tab stop.
- The waiting list popover is a dialog with a heading, labelled checkboxes and Escape to close; on a phone it's a full-screen sheet.
- State Tags carry text, not only colour (also fixes evaluation #10).
- Keyboard: `shift+p` opens the waiting list rather than publishing everything straight away, since Publish all is no longer a one-key action.

## Engineering changes this needs

For `/specify` and `/blueprint` to detail:

- **Page publish:** `POST /pages/:id/publish` stops calling `promoteDrafts`; it publishes that page only.
- **Scoped publishes:** `POST /site/settings/publish`, `POST /site/navigation/publish`, `POST /site/announcement/publish`.
- **Announcement:** its own drafted document, split from navigation (`packages/contracts/src/site.ts`), with a migration that copies the current one across.
- **Tree changes:** move, unpublish, delete and restore queue a rebuild when confirmed.
- **The waiting list:** `GET /publish/preview` becomes the single source: changed pages, new pages, settings, navigation and announcement, as one list of items with a kind, title, changed time and a link. The header, dashboard and Publishing screen all read it. `structureChanged` and `removed` go away, because tree changes no longer wait.
- **Publish all:** `POST /publish` takes the list of item ids that were ticked.
- **Editor at phone width:** a form view below the tablet breakpoint (the crash itself is fixed).

## How we'll know it works

| Signal                                                                                   | Target                |
| ---------------------------------------------------------------------------------------- | --------------------- |
| Walkthroughs A, B and D in a usability test with officers new to the admin               | All pass without help |
| Officers asked "is your change live?" after a task answer correctly                      | Every time            |
| Time to post an urgent announcement on a phone, from opening the admin                   | Under 2 minutes       |
| Publishes that shipped something the officer didn't mean to (asked after each test task) | None                  |

## Pending questions

1. **Decided, 1 Nov 2026: tree changes go live on confirm** (rule 3). Moves, unpublishes, deletes and restores no longer wait for the next publish.
2. **Decided, 1 Nov 2026: the announcement becomes its own drafted document**, split from navigation, with a migration that copies the current one across.
3. **Scheduled publishes** (Publishing screen) keep working on the new list of items. "Everything waiting at that time" stays the default.
4. **Second officer.** Scoped publishing makes this safe, but "who changed this" is still missing (project context, tension 5).
5. **Evidence.** All of this rests on expert review, not observation. The walkthroughs above are the usability test script.
