---
title: Sovereign technology for government websites
description: Who holds the data, who holds the code, who can keep it running, and who decides how it looks. Here's how Laman answers each of those questions.
path: /en/sovereignty
alternate: /kedaulatan
---

<!-- block: page intro -->

# Sovereign technology for government websites

An agency's website is the front door of a public service. Sovereignty means the agency itself holds four things: the data behind it, the code that runs it, the ability to keep it running, and the say over how it looks. Laman is built so all four stay with the agency.

<!-- block: prose -->

## Data: it stays in your data centre

One Laman install is one website, on the agency's own servers. There's no cloud we operate, no account to sign up for, and no data sent to us.

- **Nothing calls out.** Laman loads no scripts from a CDN and makes no lookups to outside services. It can be installed on an internal network with no internet access.
- **Analytics in your own database.** Visitor figures are kept in a separate database file on the same server. No cookies, no IP addresses stored, and no identifier that lasts longer than a day.
- **Visitor countries only if you want them.** Laman doesn't ship an IP location database. If the agency wants to see visitors' countries, its ICT team installs that file itself.

<!-- block: prose -->

## Code: open source

Laman is open-source software under the MIT licence. Your agency can read every line, audit it itself or through a third party, run it, and change it to suit its needs.

No licence fees, no limit on the number of users, and no features locked behind a subscription.

<!-- block: prose -->

## Operations: simple to run yourself

Laman is deliberately small, so an agency's ICT team can run it without a vendor.

- **One process, one file.** The builder is one Node process, with one SQLite file for all content and one media folder. Analytics, when it's on, goes in a second SQLite file. No database server, no external queue, no microservices.
- **One Docker image.** Installed with Docker Compose, with optional Caddy for HTTPS.
- **A static website.** What the public reaches is plain HTML, CSS and image files. The builder can serve them itself, or nginx, Caddy or any web server the agency already uses.
- **Backups you can restore.** Laman backs itself up every day, before every upgrade, and on request. Every backup is checked when it's made, and a restore can be tested without touching the website.
- **Safe upgrades.** Before an upgrade changes the database, Laman keeps a copy. If anything fails, the copy is put back and the website stays as it was.

<!-- block: callout -->

## If the Laman team disappeared tomorrow

It's the question to ask of any government software. Laman's answer:

- **Your website keeps running.** It's static files. Any web server can keep serving them, even with the builder switched off.
- **The code stays with you.** It's open source. Your agency, or any vendor it appoints, can keep maintaining and improving it.
- **Your data isn't locked in.** All content is in one SQLite file and one media folder, formats that are open and documented.
- **Backups are ordinary files.** `.tar.gz` archives in a folder you choose, which the backup tools your agency already uses can copy.

No licence to expire, no server of ours to reach, and no account that can be closed.

<!-- block: prose -->

## Design: built on FTDS

Laman is built on FTDS, a Malaysian design system. Every block is an FTDS component, so every Laman website inherits the same typography, colours, keyboard focus and layout, designed for accessibility.

- **Bahasa Melayu first.** Website content is in Bahasa Melayu by default, with English as a second language.
- **The agency's identity, not a free-for-all theme.** The agency chooses its own name, logo and primary colour. Laman generates the shades of that colour and makes sure their contrast meets WCAG AA, so the agency's colour never makes text hard to read.

<!-- block: prose -->

## Control: with the officers

Sovereignty also means an agency doesn't depend on an outside party to update its own website.

- **Officers publish themselves.** No vendor ticket to change opening hours or put out a notice.
- **Clear roles.** Editors prepare drafts. Content Managers publish. Admins manage accounts. The line is simple: does this change the live website straight away?
- **Who did what, on record.** An audit log records sign-ins, account changes and every publish. Accounts are disabled, never deleted, so history always knows who did it.
- **No mail server needed.** Invitation and password reset links are handed over directly by an Admin.

<!-- block: prose -->

## AI, on your terms

An officer can ask an AI agent to build and change the website with Laman's own tools, through the Model Context Protocol (MCP). The agent isn't a vendor's service account:

- It's **off** for everyone until an Admin allows it for a person.
- It signs in **as that officer**, and can only do what that officer's role allows.
- **Every tool call is recorded** in the audit log, and a connection can be cut off at any time.
- Laman's server **never fetches an address** on an agent's behalf. Files come from the officer's computer only.
- It works with **any MCP client**, not one AI vendor.

[Learn about AI agents](/en/agents)

<!-- block: cta band -->

## Your agency's website, on your servers

- [Install Laman](/en/install) (primary)
- [Contact the team](/en/contact)
