---
title: "Laman: the agency website builder that runs on your own servers"
description: Laman is an open-source website builder for government agencies. Officers arrange FTDS blocks, check, and publish a fast, accessible static website from the agency's own servers.
path: /en
alternate: /
---

<!-- block: hero -->

# Your agency's website, on your servers, under your control.

Laman is an open-source website builder for government agencies. Officers arrange FTDS blocks, check, and press Publish. A fast, accessible website goes live, served from the agency's own servers.

- [Install Laman](/en/install) (primary)
- [See how it works](/en/features)

Image: the editor canvas, with an officer editing a page title directly on the page.

<!-- block: problem (feature grid, 3) -->

## A government website shouldn't be this hard

### Patches every month

Every plugin and theme is one more piece of software to update, and one more way in for an attacker. Your ICT team ends up maintaining the website instead of improving it.

### A ticket for every change

Opening hours change, but the website waits for the vendor. Urgent notices go out late, or as a poster not everyone can read.

### Every page looks different

When anyone can style anything, a website slowly becomes hard to read, hard to search and hard to use on a phone.

<!-- block: steps -->

## Three steps, no code

1. **Arrange.** Start from a template or a blank page, then arrange FTDS blocks on the canvas. Type text straight onto the page, as visitors will see it.
2. **Check.** Before anything goes live, Laman checks the page: the main heading, image alt text, broken links, "click here" links, and example text left behind.
3. **Publish.** Press Publish, or schedule it. Laman writes a static website and swaps out the old version in one step. If something's wrong, the publish can be undone.

The published website is static HTML files. It keeps working even when the builder is switched off.

<!-- block: sovereignty (feature grid, 5) -->

## Sovereign technology, not just a slogan

### Your data stays in your data centre

Content, accounts, history and visitor figures live on the agency's servers. Laman calls no outside service, and works without internet access.

### Code you can read

Laman is open-source software. Your agency can read it, audit it, run it and change it.

### Simple to run yourself

One process, one database file, one Docker image. Your ICT team can run it without a vendor.

### Malaysian design

Built on FTDS, a Malaysian design system, with Bahasa Melayu as the default content language. The admin works in Bahasa Melayu or English.

### Officers stay in control

Officers publish themselves. AI agents can help, but only as that officer, with that officer's permissions, and every action is recorded.

[Read about sovereign technology](/en/sovereignty)

<!-- block: guardrails (split, screenshot) -->

## The accessible way is the easy way

Officers arrange approved blocks. There's no free styling, no custom HTML and no plugins, so FTDS's accessibility can't be bypassed by accident.

Before a page goes live, Laman says what would make it hard for visitors, and how to fix it. A page with no main heading can't be published at all.

Laman is also honest about what it can't check, such as whether alt text is meaningful or what a PDF contains. Those stay with the officer, and Laman says so.

Image: the checks before publishing, with the warnings "This image has no alt text" and "Link text like 'click here' doesn't say where the link goes".

<!-- block: officer (feature grid, 4) -->

## For officers who have other work to do

### What you see is what visitors get

The canvas, the preview and the published website are drawn by the same renderer.

### Publish now, or tomorrow morning

Schedule a publish, and use the site announcement for urgent notices such as office closures.

### Every mistake can be fixed

History for every page, restore an old version, undo a publish, and deleted pages can be brought back.

### No work lost

Unsaved changes survive a closed window or an expired session. If someone else saved the same page first, Laman asks you, rather than quietly overwriting your work.

<!-- block: compare teaser (table, 4 rows) -->

## Laman compared with WordPress, Joomla and Drupal

|                                            | Laman                 | WordPress, Joomla, Drupal        |
| ------------------------------------------ | --------------------- | -------------------------------- |
| What the public reaches                    | Static HTML files     | A PHP application and a database |
| Extending it                               | No plugins, by design | Plugins, extensions or modules   |
| Website keeps working if the admin is down | Yes                   | No                               |
| Visitor analytics without cookies          | Built in              | Plugin or third party            |

[See the full comparison](/en/compare)

<!-- block: runs on (code) -->

## One Node process. One SQLite file. One Docker image.

```sh
cp .env.example .env    # fill in the settings
docker compose --profile https up -d --build
```

After cloning the repository, these two commands run the builder with HTTPS. Backups run every day by themselves.

[Installation guide](/en/install)

<!-- block: cta band -->

## Try Laman at your agency

Install it on your own server from GitHub, or contact our team for a briefing.

- [Install Laman](/en/install) (primary)
- [Contact the team](/en/contact)
