---
title: Install Laman
description: Install Laman on your agency's server with Docker Compose. Requirements, installation steps, backups, restore and upgrades.
path: /en/install
alternate: /pasang
---

<!-- block: page intro -->

# Install Laman

Laman runs as one Docker container: the builder, the admin at `/admin` and the published website at `/`, from one port. This page is for the ICT team who will install it.

<!-- block: prose -->

## What you need

- A Linux server with Docker Engine 24 or later and the Compose plugin (`docker compose version`).
- A host name for the website (for example `www.agensi.gov.my`) pointing at the server, if Caddy is to get the HTTPS certificate. Otherwise, your own HTTPS proxy, such as nginx or a load balancer.
- A folder for backups, ideally on another disk or one that's copied off the machine.

We recommend keeping the builder on an internal network or behind a VPN. The published website can be served to the public separately.

<!-- block: steps -->

## Installation steps

1. **Get the code.** There's no published image yet; the image is built from the repository.

   ```sh
   git clone https://github.com/mof-malaysia/laman.git
   cd laman
   ```

2. **Fill in the settings.**

   ```sh
   cp .env.example .env
   chmod 600 .env
   ```

   In `.env`, fill in the first account (`SUPER_ADMIN_USERNAME` and `SUPER_ADMIN_PASSWORD`, at least 12 characters), the website's address (`SITE_URL`), and the backup folder on the host (`BACKUP_PATH`). The file explains every line.

3. **Start it.** With Caddy, which gets and renews the HTTPS certificate itself (ports 80 and 443 must be open):

   ```sh
   docker compose --profile https up -d --build
   ```

   Or behind your own proxy, listening on `127.0.0.1:8080`:

   ```sh
   docker compose up -d --build
   ```

   The first build takes a few minutes. `docker compose ps` shows `healthy` when it's ready.

4. **Sign in.** Open `https://<your site>/admin`, sign in with the first account, and choose a new password. Then remove `SUPER_ADMIN_PASSWORD` from `.env`.

5. **Require two-factor.** As the super admin, turn on **Require two-factor sign-in for everyone** in Settings, so every account sets up an authenticator app at its next sign-in.

6. **Invite your team.** Choose **Invite someone**, pick the right role (Editor, Content Manager or Admin), and hand the one-time link to that person directly. No mail server needed.

<!-- block: prose -->

## Serving the public website

The simplest way: let Laman serve it. If the agency wants its existing nginx or Caddy to serve the static files directly, the published folder can be served with three rules: pre-compressed files, addresses without a trailing slash, and the 404 page. Only `/_v` (analytics) needs to be passed on to the builder.

An example nginx configuration is in the [documentation on GitHub](https://github.com/mof-malaysia/laman/blob/main/docs/site-builder.md).

<!-- block: prose -->

## Backups

Laman backs itself up every day at 2:00 a.m. Malaysian time, before every upgrade, and when an Admin presses **Back up now** in Settings. Archives are kept in `BACKUP_PATH` on the host.

```sh
docker compose exec site-builder site-builder backup                       # make one now
docker compose exec site-builder site-builder backups                      # list them
docker compose exec site-builder site-builder backup --verify <archive>    # test a restore
```

A backup on the same disk doesn't survive losing that disk. Copy `BACKUP_PATH` off the machine with the tool your agency already uses. Never copy the data volume while the container is running; use the archives.

<!-- block: prose -->

## Restore

Stop the builder first; restore refuses to run otherwise.

```sh
docker compose stop site-builder
docker compose run --rm --no-deps site-builder site-builder restore <archive>
docker compose start site-builder
```

Accounts and passwords go back to how they were in the backup, everyone is signed out, and the website is published again. Whatever was replaced is kept, not deleted.

<!-- block: prose -->

## Upgrades

```sh
git pull
docker compose up -d --build
```

The new version backs up the database, then updates it as it starts. If anything fails, the database is put back as it was and the reason is written to the log.

<!-- block: cta band -->

## Ready to start?

- [Open on GitHub](https://github.com/mof-malaysia/laman) (primary)
- [Need help? Contact the team](/en/contact)
