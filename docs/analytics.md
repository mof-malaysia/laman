# Analytics

Status: built. Companion to `docs/site-builder.md`.

## Summary

Simple visitor analytics for the published site, built into the builder: page views, visitors, visits, bounce rate, visit duration, top pages, referrers, campaigns, browsers, operating systems, devices, screen sizes, languages, countries, downloads and outbound links. That is roughly what Umami collects. Agencies see it in the admin, beside the pages it describes, with nothing to sign up for and nothing leaving their data centre.

## Why build it in

Third-party analytics is often blocked: blockers and browsers (uBlock Origin, Brave, Safari, the EasyPrivacy list) match on third-party domains (`google-analytics.com`), well-known script names (`gtag.js`, `plausible.js`) and well-known collection paths (`/collect`, `/track`). Our pages and our collector share one origin, there is no script file to match (the beacon is inline), and the collection path is our own.

We don't treat that as a way round anyone's choice. People block trackers to avoid being followed. This collects nothing that follows anyone, so there is nothing for a blocker to protect them from:

- **No cookies, no local storage, no fingerprinting.** Nothing is stored on the visitor's device.
- **No lasting identifier.** A visitor is `sha256(daily salt, IP, user agent, site host)`, cut to 16 bytes. The salt is random, made with the first beacon of each day, kept in memory and in `analytics.db`, and deleted when the next day's is made. The same person tomorrow is a new visitor; nobody can be followed from one day to the next, or across sites.
- **No IP addresses are stored**, only the hash and, when a country database is installed, the two-letter country.
- **Global Privacy Control is honoured.** A browser that sends `Sec-GPC: 1` (or sets `navigator.globalPrivacyControl`) is not counted.
- **Aggregate reporting only.** The admin shows totals and top lists, never a single visit.

This is the posture the site states on its privacy page (PDPA 2010). With no personal data stored and no cookies there is no consent banner.

Not doing: rotating endpoint names to stay ahead of filter lists, proxying a third-party tracker through our domain, or anything that identifies a visitor across days.

## Where it runs

The builder is packaged like WordPress and installed on-prem in agencies' own data centres, often with no internet access. So:

- **Nothing calls out.** No CDN scripts, no lookups to outside services.
- **Behind a reverse proxy**, the visitor's address is in `X-Forwarded-For`. `TRUST_PROXY` (env) tells Fastify which proxies to believe: `true`, a hop count, or a list of addresses or CIDRs. Without it every visitor looks like the proxy and visitor counts collapse.
- **The published site can be served by a web server other than the builder** (nginx serving `data/public`). The beacon posts to `/_v` on the same origin, so that server must pass `/_v` to the builder, as it does for nothing else:

  ```nginx
  location = /_v { proxy_pass http://127.0.0.1:3000; }
  ```

  It is the only builder path the public needs to reach. It accepts a small JSON body, answers `204`, and can't read anything.

- **Countries** need an IP-to-country database. None is bundled (it would go stale, and needs a licence notice). An operator who wants countries points `GEOIP_DB` at a MaxMind-format country file (DB-IP Lite Country, CC BY 4.0, or GeoLite2 Country). Without it the Countries list says so and nothing else changes.
- **Few dependencies, all permissive**: `isbot` (Unlicense) for bots and `maxmind` (MIT) for the optional country file. User agents are read by a small parser of our own (`apps/server/src/analytics/agent.ts`): browser, system and device type are all a report needs, and the usual library's current major is AGPL.

## What is collected

The beacon is about 1.5 KB, written inline at the end of every published page (`apps/renderer/src/layouts/Site.astro`) when analytics is on. It posts with `navigator.sendBeacon` as `text/plain`, so it never needs a CORS preflight. It sends nothing from a framed page (the admin's thumbnail of the live site), an automated browser (`navigator.webdriver`) or a GPC browser. It sends:

| Event      | When                                                          | Fields                                                                                                    |
| ---------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `view`     | the page loads                                                | page id, path, referrer (host only, other sites only), UTM source/medium/campaign, screen width, language |
| `leave`    | the page is hidden or closed (`visibilitychange`, `pagehide`) | the view's random id, time the page was visible                                                           |
| `download` | a click on a link to `/media/…` or a file with an extension   | path of the file                                                                                          |
| `outbound` | a click on a link to another site                             | host of the link                                                                                          |

The view id is random per page load and kept only in the page's memory, so a `leave` can be joined to its `view`.

On the server, from the request: the visitor hash (above), browser, OS and device type from the user agent, and country from `GEOIP_DB`. Requests are dropped when:

- the user agent is a bot (`isbot`), or the browser sends `Sec-GPC: 1`;
- the `Origin` (or `Referer`) host isn't the request's host, or `SITE_URL`'s;
- the body fails its Zod schema (`packages/contracts/src/analytics.ts`);
- the address has sent more than 60 events in a minute.

Whether to count at all is the published pages' call: the beacon is in them only while counting is on, and a settings publish rewrites every page. The collector doesn't check the switch again.

The canvas and preview (`/render`) never include the beacon, so editors don't count themselves.

## Derived figures

| Figure         | Definition                                                          |
| -------------- | ------------------------------------------------------------------- |
| Views          | `view` events                                                       |
| Visitors       | distinct visitor hashes per day, summed over the days in the range  |
| Visits         | runs of views by one visitor with gaps under 30 minutes             |
| Bounce rate    | visits with one view, over all visits                               |
| Visit duration | per visit, the sum of its views' visible time; averaged over visits |
| Entry, exit    | the first and last page of each visit                               |

Visitors over a range are a sum of daily visitors, since visitors can't be matched across days. The admin says so next to the figure.

## Storage

A separate SQLite file, `DATA_DIR/analytics.db` (WAL), with its own append-only migrations in `apps/server/src/analytics/migrations.ts`. Separate because:

- it grows on its own schedule, and content backups and restores shouldn't carry it;
- a busy site's writes don't contend with the editor's.

Tables:

- **`views`**: one row per view: id, visitor hash, visit id, time, page id, path, referrer host, UTM fields, browser, OS, device, screen bucket, language, country, visible milliseconds (filled in by `leave`).
- **`events`**: downloads and outbound clicks: time, visitor hash, kind, target, page path.
- **`salts`**: the day's salt, one row; replaced with the first beacon of a new day (server time zone).

Writes are buffered in memory and flushed every two seconds, or at 500 rows, in one transaction. Visits are assigned at flush: a view joins the visitor's open visit if it came within 30 minutes of that visit's last view.

**Retention**: rows older than the retention setting (default 395 days, 13 months, so a month can be compared with the same month a year before) are deleted by an hourly sweep in the collector, and on start. It's not a queued job, so it stays out of the publishing log. Reports read the raw tables; at government-site volumes (tens of thousands of views a day) SQLite answers a year's report in well under a second with the indexes on `time` and `(page_id, time)`.

**Backups** cover `site.db` and media. `analytics.db` goes in only with `site-builder backup --with-analytics`, through `VACUUM INTO` like the site database; the daily backup leaves it out. Losing it loses figures, not content.

## Settings

A new section in Site settings, **Analytics**:

- **Count visitors** (on by default). A site setting, published like the others: the beacon is in the published HTML, so turning it on or off takes effect when settings are published, which rebuilds every page.
- **Keep data for** (days, 30 to 1,095). Applies on save, like the publishing defaults.

## API

Read-only, under `/api/analytics`, schemas in `packages/contracts/src/analytics.ts`:

- `GET /api/analytics/summary?from&to&pageId` → views, visitors, visits, bounce rate, average duration, for the range and the one before it (and which days that was), plus a series by hour (one day), day (up to 92 days) or month, each point with the publishes that finished in it.
- `GET /api/analytics/breakdown?from&to&pageId&by=page|entry|exit|referrer|utm_source|utm_medium|utm_campaign|browser|os|device|screen|language|country|download|outbound&limit` → top values with views and visitors.
- `GET /api/analytics/status` → whether counting is on, whether a country database is loaded, the oldest day held and the server's time zone, so the screen can explain an empty chart and count days where the server does.

Each report flushes the collector's queue first, so it includes the last two seconds.

Collection is `POST /_v`, outside `/api` (the admin's API), answers `204` whatever happens, so a page learns nothing from it.

## Admin

- **Analytics** in the sidebar after Publishing (`g v`), at `/admin/analytics?range=7d`: a date range (today, 7 days, 30 days, 12 months, custom), five figures with the change on the period before, a chart of views (bars) and visitors (a line) on one axis, read by hover or arrow keys and also as a table, and top lists: pages, entry pages, exit pages, referrers, campaigns, browsers, OS, devices, screen sizes, languages, countries, downloads, outbound links. Each page in the pages list links to that page's detail.
- **Publish markers** on the chart: a tick where publishes finished, from the job log (bucketed on the server, in its time zone), so a change in traffic can be read against what went live.
- **A page's detail** gets an Analytics tab with the same figures and chart for that page alone, and its referrers.
- **The dashboard** shows visitors and views for the last 7 days, once anything has been counted.
- **Settings → Analytics**: the switch and the days kept.

Page stats follow the page id, not the path, so a renamed or moved page keeps its history.

## Where the code is

| Path                                     | What                                                          |
| ---------------------------------------- | ------------------------------------------------------------- |
| `packages/contracts/src/analytics.ts`    | The beacon and report schemas                                 |
| `apps/renderer/src/layouts/Site.astro`   | The inline beacon                                             |
| `apps/server/src/analytics/db.ts`        | `analytics.db`, its migrations and local-day helpers          |
| `apps/server/src/analytics/collector.ts` | Filtering, the visitor hash, visits, batched writes, pruning  |
| `apps/server/src/analytics/reports.ts`   | Totals, series and top lists                                  |
| `apps/server/src/routes/analytics.ts`    | `/_v` and `/api/analytics/*`                                  |
| `apps/admin/src/analytics/`              | The screen, the chart, the page tab and the dashboard figures |
| `apps/server/test/analytics.test.ts`     | Collection, filtering, figures and the settings switch        |
