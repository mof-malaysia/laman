# Brief: the publish outcome, the publish log and room in the editor

2 Nov 2026. Step 2 of the admin's character work (step 1 was the Dashboard). Follows the critique in this session and the publish model in `docs/journeys/publish-model.md`. Same direction as the Dashboard: calm and trustworthy, restrained colour, light theme.

## Why

Publishing is the moment an officer's work reaches the public, and today it ends as one more row in a log. The log itself is ten identical rows ("Publish changes · – · 0 s · Published"). The scheduling form, which few officers need, takes half the screen. In the editor, the admin's sidebar stays open, so "Fit" shrinks the page to about a third of its size.

## What changes

### 1. The outcome, where Publish was pressed

- **Success:** after "Publish N changes", the waiting list gives way to an FTDS **Panel** (success). Its title is "Your changes are live", it names exactly what went out (taken from the rows that were ticked, such as "Site settings, Soalan Lazim"), and it has **View on site**. Anything still waiting stays listed below it, so the officer can carry on.
- **Failure:** a danger Panel: "Your changes didn't go live. Your site hasn't changed." It gives the reason from the publish job, a **Try again** button, and a link to the log entry.
- **Where:** the waiting list on Publishing and in the header's drawer, which share one component.
- **Heading level:** Panel's title is meant to be a page's `h1`. Publishing already has one, so here the title renders as an `h2`.
- **Dismissal:** the Panel stays until the officer publishes again or leaves. It has no close button, because there's nothing to close.

### 2. The log, as a list grouped by day

- Publishes are grouped under **Today** and **Earlier**. Each line says what happened in words ("Site settings published", "Page moved or removed", "3 changes published"), the time, and a result Tag.
- A failed line links to its details (the existing drawer, with the page and block that broke, and Retry).
- The "Took" column goes. It is always "0 s" at this site's size.
- **Not FTDS ActivityTimeline, yet:** it is built around who did something, with an avatar and a name. The admin has no sign-in, so every line would need an invented actor. Switch to it once sign-in exists and a publish has a person behind it.

### 3. Scheduling behind a disclosure

- "Schedule a publish for later" becomes an FTDS **Details** toggle, closed by default.
- Publishes already scheduled stay visible, above it, whenever there are any.

### 4. Room in the editor

- Opening the editor collapses the admin's sidebar to its icon rail. Leaving puts it back as the officer had it.
- When there's nothing to publish, the disabled Publish button explains why with an FTDS **Tooltip** ("Everything here is live"), not the browser's plain `title` text, which doesn't appear for keyboard users.

## States

| State                      | What the officer sees                                                        |
| -------------------------- | ---------------------------------------------------------------------------- |
| Nothing waiting            | "Everything is live." No button                                              |
| Publishing                 | The button reads "Publishing…"                                               |
| Published                  | Success Panel naming what went out, View on site, the rest of the list below |
| Failed                     | Danger Panel with the reason, Try again and a link to the log entry          |
| Log empty                  | "Nothing has been published yet."                                            |
| Log with a running publish | That line reads "Publishing…" with a neutral Tag                             |

## Build notes

- Install FTDS Panel with `pnpm dlx shadcn@latest add @ftds/panel` from `apps/admin`. The installer rewrites catalog entries in `package.json`, so restore that file and the lockfile afterwards (it happened with Task List).
- `usePublish` keeps the job's error message on a failed outcome, so the Panel can say why.
- All copy goes through `t()`.

## Known limit

In development only, "View on site" opens the admin's dev server rather than the site, because the dev proxy doesn't pass the site's root through. It works in production, where the server serves both.

## Decided while building

- **The officer's ticks survive a publish.** After publishing only Site settings, Navigation came back ticked, so the next click would have sent it live. What they leave out now stays left out.
- **The sidebar's own memory is protected.** The shell saves the sidebar per browser, so folding it in the editor would stick after a reload or a closed tab. The editor puts the saved value back when the page unloads, as well as when the officer leaves the editor.
- **The disabled button's tooltip sits on a wrapper,** because a disabled button gets no pointer events. Keyboard and screen reader users get the same reason from the status line beside it ("Saved · Live"), which is announced as it changes.
