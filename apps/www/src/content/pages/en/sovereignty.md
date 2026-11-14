---
title: Sovereign technology for government websites
description: Who holds the data, who holds the code, who can keep it running, and who decides how it looks. Here's how Laman answers each of those questions.
path: /en/sovereignty
alternate: /kedaulatan
heading: "Sovereign technology for government websites"
lead: "Sovereignty means the agency holds four things: its data, its code, the ability to keep the website running, and the say over how it looks. Laman keeps all four with the agency."
---

## Data: it stays in your data centre

One install is one website, on your own servers. No cloud of ours, no sign-up, and no data sent to us.

- **Nothing calls out.** No scripts from a CDN, no lookups to outside services. It runs on a network with no internet access.
- **Analytics stay with you,** in a separate database file on the same server. No cookies, no stored IP addresses, and no identifier that lasts past a day.
- **Visitor countries are opt-in.** Laman ships no IP location database; your ICT team adds one if you want it.

## Code: open source

MIT licence. Read, audit, run and change every line. No licence fees, no user limits, no features behind a subscription.

## Operations: simple to run yourself

Laman is small by design, so your ICT team can run it without a vendor.

- **One process, one file.** One Node process, one SQLite file for content and one media folder. Analytics, if on, is a second SQLite file. No database server, queue or microservices.
- **One Docker image,** installed with Docker Compose, with optional Caddy for HTTPS.
- **A static website.** The public gets plain HTML, CSS and images, served by the builder or any web server you already use.
- **Backups you can restore.** Daily, before every upgrade, and on request. Each is checked when made, and a restore can be tested without touching the website.
- **Safe upgrades.** Laman copies the database first. If anything fails, the copy goes back and the website stays as it was.

## If the Laman team disappeared tomorrow

Ask this of any government software. Laman's answer:

- **Your website keeps running.** It's static files any web server can serve.
- **The code stays with you.** Your agency, or any vendor it appoints, can keep maintaining it.
- **Your data isn't locked in.** Content is one SQLite file and one media folder, in open, documented formats.
- **Backups are ordinary files:** `.tar.gz` archives your existing backup tools can copy.

No licence to expire, no server of ours to reach, no account to close.

## Design: built on FTDS

Every block is a component of FTDS, a Malaysian design system, so every Laman website shares the same accessible typography, colours, keyboard focus and layout.

- **In Bahasa Melayu,** from the content to the built-in labels.
- **Your identity, not a free-for-all theme.** Choose your name, logo and primary colour. Laman generates its shades and checks that their contrast meets WCAG AA.

## Control: with the officers

- **Officers publish themselves.** No vendor ticket to change opening hours or post a notice.
- **Clear roles.** Editors draft, Content Managers publish, Admins manage accounts.
- **Who did what, on record.** The audit log records sign-ins, account changes and every publish. Accounts are disabled, never deleted, so the history stays complete.
- **No mail server needed.** Admins hand over invitation and password reset links directly.

## AI, on your terms

AI agents are off until an Admin allows them for a person. An agent signs in as that officer, can do only what their role allows, and every call is recorded. It works with any MCP client.

[Learn about AI agents](/en/agents)
