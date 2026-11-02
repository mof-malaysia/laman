# Admin: interfaces for the builder

The next phase after the vertical slice. It covers the admin and the site-building experience in `apps/admin`, plus the server and block work those screens need. Sign-in, users and roles come later. Every screen below assumes one officer working alone, with no session.

## Decisions

- **Frame: FTDS `DeskShell`.** It's always compact (`data-density="compact"`), keyboard-first, and has an icon rail, a top bar, ⌘K search and a status bar. The officers who run an agency site live in this tool. They aren't visitors.
- **The editor lives inside the shell.** The rail and the status bar stay put. The top bar's tabs are the **open pages**, like documents in an editor, so an officer can keep _Utama_ and _Hubungi_ open and switch between them with `mod+1…9`.
- **Pages form a tree.** A page has a parent, and its path follows the tree (`/perkhidmatan/zakat`). The tree is the main navigation of the Pages screen.
- **All content is a page.** There is one place to edit content. Navigation is separate because it does a different job.
  - **Listing pages:** some pages, such as Berita or Tender, collect dated **entries** (articles, notices).
  - **Entries are pages too:** each is a child of its listing page, with its own URL, revisions, draft and publish.
  - **Same editor:** the listing page and every entry use the block editor. Each kind gets the blocks that suit it (screen 4).
- **BM only in the UI.** The model keeps its `en` slot, but no screen shows it yet.
- **Templates and four new blocks:** image, contact, link list and FAQ. They exist so the templates (Utama, Perkhidmatan, Hubungi, Berita) can be real starting pages.
- **Admin text is English** through `t()`, as it is now. Site content and the FTDS Astro labels stay in BM.

## The shell

| Part                 | What's in it                                                                                                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rail (top to bottom) | Brand (site initial), Dashboard `g d`, Pages `g p`, Media `g m`, Navigation `g n`, Publishing `g u`, then a spacer, Settings `g s` and Keyboard shortcuts `?`                                                                                                                   |
| Top bar              | `DeskRailTrigger`, then a breadcrumb of the section (or the page path in the editor), then the open-page tabs, then a spacer and `DeskSearchTrigger`                                                                                                                            |
| Status bar           | Save state of the active page ("Saved 10:42", "Saving…", "Couldn't save: retrying"), unpublished-change count (a button that goes to Dashboard), the running publish job with progress, the renderer's health, then a spacer, `SITE_URL` (or "No site address") and the version |

**Open-page tabs.** Opening a page from anywhere (the tree, the palette or the dashboard) adds a tab, or focuses its tab if it's already open. Tabs are kept per browser in `localStorage`. A tab's dot shows unsaved or unpublished changes. Closing a tab flushes its autosave first. FTDS `DeskTab` is a link with no close button, so a small `EditorTab` wrapper puts an icon button beside it, built from FTDS tokens. That is the one custom part of the shell. See the open questions.

**Command palette (⌘K).** It holds every rail destination and these commands:

- New page, `c`
- Open page…, `o`: lists every page by title and path
- Publish site, `shift+p`
- Upload media, `u`
- In the editor:
  - Insert a block of each type
  - Undo, `mod+z`, and redo, `mod+shift+z`
  - Duplicate block, `mod+d`, and delete block, `backspace` on a selected block
  - Canvas width: desktop, tablet or mobile (`1`, `2`, `3`)
  - Preview the page

## Screens

### 1. Dashboard (`/admin`)

Where an officer lands. It answers "what's waiting to go live, and did the last publish work?"

- **`StatGroup`:** pages (with how many are drafts that have never been published), unpublished changes, last publish (time and result) and media (count and the size on disk).
- **Unpublished changes:** a compact table with page, path, changed, and a "Review" link to open the page. The screen's one primary action, "Publish site", sits above it.
- **Recent edits:** the last ten saved drafts, each with the page and time. In time it becomes the activity log when the audit log exists.
- **Last publishes:** the last five jobs, each with time, pages written, duration and result (a `Tag`), linking to Publishing.
- **Empty states:** a new install shows one page and one hint, "Publish your first page".

### 2. Pages (`/admin/pages`, `/admin/pages/$id`)

A `SplitPane`. The **page tree** is on the left and the **page detail** on the right.

**Tree**

- Rows show the title, the last path segment, and a status `Tag`: Draft (never published), Changed (published, with newer draft) or Published.
- Expand and collapse with arrows. `j`/`k` move, `o`/Enter open in the editor, `n` adds a child page, `f` filters by title or path.
- Drag a row onto another row to re-parent it, or between rows to reorder. Keyboard moves are `alt+↑/↓` to reorder and `alt+←/→` to outdent or indent. Moving a page changes the paths of its subtree, so a confirm dialog lists the paths that will change before it saves.
- The home page is the root and can't be moved or deleted.
- A listing page shows a list icon and its entry count ("Berita · 214") instead of an expand arrow. Its entries are never rows in the tree. Selecting it opens the listing detail (screen 4).

**Detail.** The `PageHeader` holds the title, the path and the status, plus these actions:

- Open in editor, the primary action
- Preview, which opens the draft at `/render/pages/:id?mode=preview` in a new tab
- A More menu with shortcuts to the Settings tab's actions: Duplicate, Move to…, Unpublish, Delete

Below it are four tabs:

- **Details**
  - `SummaryList`: template, created, last saved, last published, children
  - Title and slug, edited here as well as in the editor; changing a slug shows the paths that change
- **SEO**
  - Meta description, with a 160-character `CharacterCount`
  - Social image, picked from Media
  - "Hide from search engines" (`noindex`)
  - "Leave out of the sitemap"
  - A preview of the search result
- **History:** the page's revisions. See screen 8.
- **Settings:** what happens to the page as a whole. The sections run from least to most destructive:
  - **Redirect**
    - A `ToggleGroup` with three choices: Off, To a page (a combobox of the tree, so it follows renames and moves), or To another website (a web address starting with `https://`).
    - **Kind:** Permanent (301), the default, for a page that has moved for good. Temporary (302), for a page that is away for a while, such as a service closed for maintenance.
    - **While a redirect is on:**
      - The page's blocks are kept, but they aren't published.
      - Visitors who open its path are sent to the target.
      - The tree row shows an arrow icon and "→ /target" in place of the status tag.
      - The editor opens with a callout saying the page redirects, plus a "Turn off redirect" button.
    - **Checks:** a page can't redirect to itself, to a page that redirects to it, or to one of its own redirect chain. The field shows the loop and blocks the save.
    - Like other changes, a redirect goes live at the next publish.
  - **Duplicate**
    - Makes a draft copy beside the page, titled "… (salinan)" with a free slug, and opens it in a tab.
    - A checkbox, "Include child pages", copies the subtree too. It's off by default.
    - For a listing page, the checkbox reads "Include its 214 articles" and is off by default, so the copy starts with no entries.
    - The copy is never published until someone publishes it.
  - **Move:** choose a new parent page. It shows the paths that will change, and offers "Redirect the old addresses here" (on by default for a published page).
  - **Unpublish:** takes the page off the site at the next publish and keeps it as a draft. For a published page it offers the same redirect option, so visitors aren't sent to a missing page.
  - **Delete**, last and in danger styling:
    - A danger `Button`, "Delete page", opens an `AlertDialog` that names the consequences.
      - A page with children asks whether to delete them too or move them up a level.
      - A listing page names its entry count, and deletes its entries with it.
      - A published page warns that it will disappear from the site at the next publish, and offers to redirect its address to another page first.
      - Pages that link to this one or keep it in the navbar are listed, so nothing is left broken by surprise.
    - The confirm button repeats the verb: "Delete Perkhidmatan and 2 child pages".
    - The page is soft-deleted and stays in History for 30 days.
  - **The home page:** it can't be redirected, moved, unpublished or deleted. Those sections show why, and only Duplicate is available.
  - **Entries:** an entry has the same Settings, in its row menu in the entries table and in the entry editor's More menu. Its Move section is replaced by "Move to another listing", which isn't available at first (see the open questions).

**New page dialog** (`c` or the "New page" button):

- Template: a radio list with a one-line description and a small outline of its blocks
- Parent page: a combobox, defaulting to the selected page
- Title
- Slug, filled in from the title and editable, with the full path shown underneath

The dialog creates a draft and opens it in a tab.

### 3. Editor (`/admin/pages/$id/edit`, one tab per page)

`DeskPage className="p-0"` holds three columns plus a toolbar row.

- **Toolbar** (one 40px row above the canvas):
  - Undo and redo
  - Canvas width as a `ToggleGroup`: Desktop, Tablet, Mobile
  - Zoom: fit or 100%
  - Draft or published state, as a `Tag` and text ("Changed since published 28 Oct")
  - Preview
  - "Publish page", the primary action. It publishes this page's draft and starts a site publish.
- **Left column**, with two tabs:
  - **Layers:** the block list as it is now (drag to reorder, select, duplicate, delete), denser, with the block icon and a one-line excerpt of its main text.
  - **Insert:** the palette grouped by kind (Opening, Content, Call to action, Contact). Each item has an icon and a one-line description. Click to add after the selected block, or drag onto the canvas between blocks. The palette only offers the blocks allowed for this kind of page (screen 4).
- **Canvas:** the iframe, as it is now, centred on the Well at the chosen width. The selection outline carries a small floating toolbar with these actions:
  - Move up and down
  - Duplicate
  - Delete
  - Open in the panel

  An "insert here" line appears between blocks on hover.

- **Right column: Properties.** The selected block's fields come from its schema, as now, grouped (Content, Actions, Appearance) and laid out densely: label above the control, compact controls, and lists that collapse. With nothing selected, it shows the page settings (title, slug and the SEO fields from the Pages screen).
- **Media fields:** an image field opens the media picker (screen 5) in a dialog. Alt text is required and is copied with the image, but it can be overridden per use.
- **Keyboard:**
  - `mod+s` saves now.
  - `esc` clears the selection.
  - `↑`/`↓` move the selection between blocks when the canvas isn't editing text.
  - Shortcuts don't fire while a field has focus, as `useShortcut` already handles.

### 4. Listing pages and entries

News, tenders and notices live in the page tree like everything else. A **listing page** collects dated **entries** under it.

- **How a listing page starts:**
  - Any ordinary page becomes one with "Make this a listing page".
  - The Berita template creates one already set up.
- **What the admin sees:** for a new admin there is one idea to learn. Everything is a page, and some pages hold a list of dated posts.

**Kinds of page, and the blocks each may use.** Each block in the registry declares the kinds it is allowed in. The Insert palette shows only those blocks, and the API rejects a block in the wrong kind.

| Kind             | What it is                                     | Blocks                                                                                                       | Fixed fields (properties panel, nothing selected)                                                     |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| **Page**         | Ordinary page                                  | All page blocks: hero, text, feature grid, image, callout, CTA band, link list, FAQ, contact, latest entries | Title, slug, SEO                                                                                      |
| **Listing page** | A page that collects entries (`/berita`)       | All page blocks, plus **Entry list**, which is required and appears once                                     | Title, slug, SEO, and the listing settings below                                                      |
| **Entry**        | One article or notice (`/berita/tajuk-berita`) | The article set: text, image, callout, link list (attachments and related links), FAQ, contact               | Title, publish date and time, category, summary, cover image, slug, "Pin to the top of the list", SEO |

- **What an entry leaves out:** blocks that make an article look like a landing page, namely hero, feature grid, CTA band, entry list and latest entries.
- **The entry's header:**
  - The renderer's article layout draws the header from the fixed fields: breadcrumb, category, title, date and cover image.
  - The officer never places or styles it, so every article looks consistent.
  - The canvas shows it so the page reads as the visitor will see it, and clicking the header selects the fixed fields.
- **The kinds are code, like the blocks.** Agencies choose blocks within a kind; they don't define new kinds.

**Listing detail** (selecting a listing page in the tree)

- **`PageHeader`:** the title, the path, the entry count, and a status summary ("1 scheduled · 1 draft · 1 changed").
- **Actions:**
  - "New entry", the primary action. Collections don't name their entries: the admin calls them entries everywhere.
  - Open in editor
  - Preview
- **Entries tab:**
  - A dense table: title, category, status, publish date and last saved, newest first, with pinned entries on top.
  - Search, plus status and category filters, and paging.
  - Keys: `j`/`k` move, `o` opens, `c` writes a new entry.
  - Status adds **Scheduled** to Draft, Changed and Published. A scheduled entry has a publish date in the future.
- **Settings tab, the listing settings:**
  - Categories, each with its own filtered page.
  - Entry address pattern: `/berita/tajuk` or `/berita/2026/tajuk`. A change applies to new entries only, and existing addresses never change.
  - The blocks a new entry starts with.
  - RSS on or off.
- **SEO and History tabs:** the same as for any page.

**Listing page editor.** The normal editor, with the listing page's own blocks: an introduction, a callout, a contact block, whatever the agency wants. Among them is the **Entry list** block, which renders this listing's entries.

- **Can't be removed.** It can be moved, but not deleted. The Layers list marks it as required.
- **Fields:**
  - Style: cards with a cover image, or a compact list
  - Entries per page: 6, 12 or 24
  - Show the category filter
  - Show the summary
  - Show the date
  - Text for when there are no entries yet
- **On the canvas** it renders the real latest entries, so the page looks as it will when published.
- **The publisher writes:**
  - `/berita` and its paged pages (`/berita/halaman/2`)
  - One page per category (`/berita/kategori/siaran-media`)
  - `/berita/rss.xml`, if RSS is on
  - Every entry, in the sitemap

**Entry editor.** It opens as an editor tab like any page, with the breadcrumb Pages › Berita.

- **Canvas:** the article layout, then the body blocks.
- **Properties panel, with nothing selected:** the fixed fields.
  - The summary has a 200-character count; it's used on the listing, in search results and in RSS.
  - The cover image comes from the media picker.
- **The primary button follows the publish date:**
  - "Publish article" when the date is now or past.
  - "Schedule" when it's in the future. A scheduled publish job is queued for that time.
  - "Update schedule" for a scheduled entry.
- **New entries** start from the listing's starting blocks, with today's date.

**Latest entries block** (ordinary pages only)

- Shows the newest few entries of any listing page, typically "Berita terkini" on Utama.
- Fields: which listing, how many (3 to 6), the style, an optional category, and a "See all" link to the listing page.
- Publishing an entry republishes every page that has this block.

### 5. Media (`/admin/media`)

- **Toolbar:**
  - Upload, the primary action. You can also drop files anywhere on the screen.
  - Search
  - Type filter (Images, Documents)
  - "Unused" filter
  - Grid or list view toggle
- **Grid:** thumbnails with a filename and a warning `Tag` when alt text is missing. **List:** a `DataTable` with name, type, size, dimensions, used on (count), and uploaded.
- **Detail drawer:**
  - A preview
  - Alt text (required for images; a missing alt is a warning everywhere the image is used)
  - Caption and credit
  - The generated variants (widths) and the original size
  - **Used on:** links to the pages
  - Replace file, which keeps the id so every use updates
  - Delete, which is blocked while the file is in use and lists where
- **Upload:**
  - The checks are type (JPEG, PNG, WebP, SVG sanitised, and PDF) and size (`MEDIA_MAX_MB`, default 10).
  - `FileUpload` shows progress.
  - sharp variants are made by a job, so the status bar shows "Processing 3 images".
- **Media picker dialog** (from an image field): the same grid with search, an Upload button and the alt text field for the chosen file.

### 6. Navigation (`/admin/navigation`)

The site chrome around every page, kept apart from the page tree on purpose. The tree is where content lives and sets its URL. The navbar is a short, curated selection with its own grouping, labels and links to other websites.

The screen is a `SplitPane`: the editor on the left, and on the right a live preview of the draft rendered by `/render`. Three `DeskTabs` in the top bar switch between the parts.

**Navbar**

- **Tree:** the top-level items, either links or dropdowns, each dropdown tagged with its style. Below each dropdown are its links, or its columns and their links. A feature card or footer link that is on shows as a one-line summary.
- **Add menu:** a link to a page, a link to another website, a dropdown, or a column in the selected grouped dropdown.
- **Reorder:** move up and down, or `alt+arrows`.
- **Editor, below the tree, follows the selection:**
  - **A dropdown:** the menu title, then its style as a `ToggleGroup`:
    - **List:** plain links in 1, 2 or 3 columns. For up to about 8 links.
    - **Described:** each link has an icon tile and a one-line description. For 3 to 6 tasks.
    - **Grouped:** titled columns side by side. For 10 or more links.
  - **A dropdown also has two switches:**
    - **Feature card:** eyebrow, title, description, target and link text. Text only, one per dropdown.
    - **Footer link:** text and target, such as "Semua perkhidmatan →" to the section's index page.
  - **A link:** label and target, which is a page picked from the tree (so it follows renames and moves) or a web address. In a Described dropdown it also has a description and an icon picked from a short list of FTDS icons.
  - **A column:** its heading.
  - **A top-level link:** "Turn into a dropdown".
- **Switching style never loses links.** Grouped flattens to one list, and a list becomes a single column.
- **The preview** opens the selected dropdown in its real style.
- **The styles map one to one onto FTDS `Navbar`:**
  - List and Described both use `NavbarMenuDropdown`. List sets `columns`; Described puts `icon` and `description` on each `NavbarMenuItem`.
  - Grouped uses `NavbarMenuGroup`.
  - The feature card is `NavbarMenuFeature`, and the footer link is `NavbarMenuFooterLink`.

**Announcement**

- An on/off switch, which is also shown as a dot on the tab and as the bar's end date in the status bar.
- A tag word and a tag colour, labelled by meaning: information, warning or deadline, disruption, new or resolved, general.
- A one-sentence message with a 120-character counter, plus one optional link.
- Show-from and hide-after dates. Both queue a scheduled publish, so the bar appears and disappears without anyone pressing Publish.
- Every page, or the home page only.
- It renders as FTDS `AnnounceBar` directly under the navbar.

**Footer**

- Up to four `SiteFooter` link columns, each with a heading and links as in the navbar.
- The address, phone, email and social links come from Settings.

**Saving and checks**

- Navigation is one drafted document. It goes live at the next publish, like pages, and Discard changes returns to the published copy.
- A Changed `Tag` shows here and on the dashboard.
- A link to a page that's been deleted or never published shows a warning on its row. That link is left out of the published navbar until the page goes live.

### 7. Settings (`/admin/settings`, FTDS `SettingsLayout`)

- **Identity:**
  - Site name
  - Agency name, which is the masthead and footer owner
  - Logo, favicon and the default social image, all picked from Media
- **Contact:** address, phone, email and office hours, used by the footer and the contact block.
- **Social:** a list of platform and URL pairs (Facebook, X, Instagram, YouTube, TikTok, LinkedIn).
- **Phase banner:** off, Alpha or Beta, with a feedback link. The announcement bar is in Navigation.
- **Search engines:**
  - The site address (from `SITE_URL`, read-only, with what to set)
  - "Hide the whole site from search engines"
  - Sitemap on or off
- **Publishing:** the scheduled publish default, and the number of revisions to keep per page.
- **About:** version, data folder, database size, last backup ("Not set up yet" until backups arrive).

Like navigation, site settings are drafted and go live at the next publish, so the preview and the published site never disagree mid-edit.

### 8. Publishing and history

**Publishing** (`/admin/publishing`)

- **Publish now:** the primary action, with a summary of what will change: pages with new content, pages removed, navigation or settings changed.
- **Scheduled:** a list of upcoming publishes, each with a time and either "everything" or the pages it covers. Add one with a `DatePicker` and time. Cancel one.
- **Log:** a `DataTable` of jobs with started, trigger (manual, scheduled, or page publish), pages written, duration and result. A row opens a drawer showing every page's outcome, any errors with the page and block that failed, and "Retry".
- While a job runs, its progress shows in the status bar on every screen, and a toast reports the result.

**History** (on a page's History tab, and in the editor's More menu)

- An `ActivityTimeline` of revisions, each with the time, "Published" or "Draft saved", and the number of blocks changed. The time becomes "who" once auth exists.
- **Compare:** two revisions rendered side by side through `/render` (preview mode, with the revision's content), plus a block-level summary: added, removed, changed (with the field names).
- **Restore:** "Restore as draft" copies the revision into the draft. It never publishes by itself, and the current draft becomes a revision first, so a restore can be undone.

## Server and model work these screens need

- **Pages:**
  - `parent_id`, `position` and `deleted_at` columns
  - Paths computed from the tree, unique among siblings
  - A move endpoint that returns the paths it changed
  - Duplicate (optionally with its subtree or its entries), unpublish, soft delete and restore-from-trash
  - **Delete preview:** an endpoint that returns what a delete would touch: child pages, entries, pages that link to this one, and navbar items.
- **Redirects:**
  - A `redirects` table holding a source path, a target (a page id or a URL), a kind (301 or 302), and the page that created it, if any.
  - A page's own redirect is part of its draft, so it publishes, rolls back and shows in History like any other change.
  - Moving or unpublishing a page can add a row for its old paths.
  - **The API rejects loops and chains longer than one step.** A move turns old A → B → C into A → C.
  - **The publisher writes each redirect two ways:**
    - **A small HTML page** at the source path, with `<meta http-equiv="refresh">`, a canonical link and a plain "Halaman ini telah berpindah" link, so the redirect works on any static host.
    - **A `redirects.json` map.** The public server reads it to send a real 301 or 302 before the HTML is served, and it can be turned into an nginx map for a reverse proxy.
  - Redirect sources are left out of the sitemap.
- **Listing pages and entries:**
  - **Columns:**
    - A `kind` column on pages: `page`, `listing` or `entry`.
    - A `listing` JSON column on listing pages, validated by Zod: the categories, address pattern, starting blocks and RSS.
    - An `entry` JSON column on entries: publish date, category, summary, cover media id and pinned.
    - `publish_at` is indexed for the listing table and for scheduling.
  - **Entries are pages whose parent is the listing page:** they share revisions, drafts, publish and soft delete with every other page.
  - **The tree endpoint leaves entries out.** A separate endpoint, `GET /api/pages/:id/entries`, returns them with paging and filters on search, status and category.
  - **Validation:**
    - Each block in the registry declares `kinds` (`page`, `listing`, `entry`), and the draft validator rejects a block in the wrong kind.
    - A listing page must hold exactly one `entry-list` block.
  - **Publishing:**
    - Publishing an entry with a future date queues a scheduled publish job instead of going live.
    - The publisher renders the listing's paged pages, category pages and RSS, and the pages that use `latest-entries`.
  - **Renderer:** the article layout draws the entry header from the entry fields, and the `entry-list` and `latest-entries` wrappers render with the FTDS Astro components.
- **Templates:** `packages/blocks/src/templates.ts`, where each template has a name, a description and its starting blocks (validated by the registry test). `POST /api/pages` takes `template`.
- **New blocks:**
  - `image`: a media id, alt override, caption and width
  - `contact`: drawn from Settings, with optional overrides
  - `link-list`: heading and links, for service listings
  - `faq`: questions and rich-text answers, rendered with the FTDS FAQ block
  - `entry-list` (listing pages only): style, entries per page, category filter, summary, date, empty-state text
  - `latest-entries` (ordinary pages only): the listing, a count, the style, an optional category, a "See all" link
- **Media:**
  - A `media` table and files under `DATA_DIR/media`
  - Upload with type and size checks, plus a sharp job for variants
  - A usage index, updated on every draft save, that powers "Used on" and blocked delete
  - The publisher copies the media that is used
- **Navigation and settings:** each has a draft and a published copy, like pages (`settings.draft` and `settings.published`), validated by Zod schemas in `packages/contracts`.
  - The navigation schema has three parts:
    - **navbar:** links and dropdowns, each dropdown with `layout`, `columns`, links or groups, an optional feature and an optional footer link
    - **announcement:** on/off, tag, variant, message, link, `from`, `until` and where it shows
    - **footer:** link columns
  - The renderer passes them to the FTDS Astro `Navbar`, `AnnounceBar` and `SiteFooter`.
  - Saving an announcement with dates queues scheduled publish jobs at `from` and the day after `until`.
- **Revisions:**
  - Listing per page
  - Get one revision
  - Restore as draft
  - Pruning to the kept count
  - `POST /render/pages/:id` already renders any content, so it can be used to compare two revisions
- **Jobs:**
  - A `run_at` column for scheduled publishes
  - A per-page result log on publish jobs
  - `GET /api/jobs` with paging
- **Dashboard:** `GET /api/summary` returns counts, unpublished changes, recent drafts and the last publishes.

## Build order

Each milestone runs end to end and is checked in the browser before the next one starts.

1. **Shell and pages tree.**
   - DeskShell, rail, status bar, palette
   - The tree model (migration) and the Pages screen with its detail and the new page dialog (templates come later, with a blank template for now)
   - The Settings tab: redirects (the table, the HTML stubs, `redirects.json` and the public server's 301/302), duplicate, move, unpublish and delete with its preview
   - The dashboard with the data that already exists
2. **Editor in the shell.**
   - Open-page tabs
   - The three-column layout
   - Toolbar, canvas widths, insert tab, floating block toolbar
   - Grouped dense properties
   - Shortcuts
3. **Media.** The table, upload, variants job, the library screen and picker, the image block, and the publisher copying media.
4. **Settings and navigation.**
   - Drafted site settings and navigation, and the two screens.
   - The navbar with all three dropdown styles, the feature card and the footer link.
   - The announcement bar, including its dates.
   - The renderer reading all of it. `astro-announce-bar` is added with `scripts/ftds-add.mjs`.
5. **Templates and blocks.** Contact, link list and FAQ, then the four templates.
6. **Listing pages and entries.**
   - Page kinds and the per-kind block rules
   - The listing detail, with its entries table and settings
   - The entry editor with its fixed fields and article layout
   - The `entry-list` and `latest-entries` blocks
   - Paged and category pages, and RSS
   - Scheduled entries, which rely on the scheduled jobs from milestone 7 (build that part first or together)
7. **Publishing and history.**
   - The publish screen and log
   - Scheduled publishes
   - Revisions, compare and restore
   - Soft-deleted pages in History

## Open questions

- **Closable tabs.** `DeskTab` has no close button, so this needs a wrapper or a change upstream in FTDS (a `DeskTab` `onClose` prop or `DeskDocumentTabs`). Upstream is better, since other desks will want the same thing.
- **Publish scope.** Is "Publish page" in the editor right, or should every publish be the whole site, with the page's draft marked ready? The slice publishes the draft and rebuilds the site. Keeping that is simplest.
- **Fields that differ per listing.** Every entry has the same fixed fields (date, category, summary, cover). A tender wants a reference number, a closing date and documents. Should a listing be able to choose from a few extra field types, or should Tender become its own entry kind in code? A kind in code is simpler and fits "kinds are code, like blocks".
- **Entries that move.** Can an entry move to another listing page? That would change its URL, so it would need a redirect, as moving a page does. Suggested answer: not at first.
