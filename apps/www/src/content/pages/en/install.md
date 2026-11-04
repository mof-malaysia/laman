---
title: Install Laman
description: Install Laman on your agency's server with Docker Compose. Requirements, installation steps, backups, restore and upgrades.
path: /en/install
alternate: /pasang
heading: "Install Laman"
lead: "Laman runs as one Docker container, serving the admin at `/admin` and the website at `/` from one port. This guide is for the ICT team."
---

## What you need

- A Linux server with Docker Engine 24 or later and the Compose plugin (`docker compose version`).
- For HTTPS, either a host name (such as `www.agensi.gov.my`) pointing at the server, so Caddy can get a certificate, or your own proxy, such as nginx or a load balancer.
- A backup folder, ideally on another disk or copied off the machine.

Keep the builder on an internal network or behind a VPN. The published website can be served to the public separately.

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

   In `.env`, set the first account (`SUPER_ADMIN_USERNAME`, and a `SUPER_ADMIN_PASSWORD` of at least 12 characters), the website's address (`SITE_URL`) and the backup folder on the host (`BACKUP_PATH`). The file explains each line.

3. **Start it.** With Caddy, which handles the HTTPS certificate (ports 80 and 443 must be open):

   ```sh
   docker compose --profile https up -d --build
   ```

   Or behind your own proxy, on `127.0.0.1:8080`:

   ```sh
   docker compose up -d --build
   ```

   The first build takes a few minutes. It's ready when `docker compose ps` shows `healthy`.

4. **Sign in** at `https://<your site>/admin` with the first account, and choose a new password. Then remove `SUPER_ADMIN_PASSWORD` from `.env`.

5. **Require two-factor.** In Settings, turn on **Require two-factor sign-in for everyone**. Each account sets up an authenticator app at its next sign-in.

6. **Invite your team.** Choose **Invite someone**, pick a role (Editor, Content Manager or Admin), and give the one-time link to the person directly. No mail server needed.

## Serving the public website

Laman can serve it itself. To serve the static files from your own nginx or Caddy instead, you need three rules: pre-compressed files, addresses without a trailing slash, and the 404 page. Pass only `/_v` (analytics) to the builder. There's an example nginx configuration in the [documentation on GitHub](https://github.com/mof-malaysia/laman/blob/main/docs/site-builder.md).

## Backups

Laman backs up daily at 2:00 a.m. Malaysian time, before every upgrade, and when an Admin presses **Back up now** in Settings. Archives go to `BACKUP_PATH` on the host.

```sh
docker compose exec site-builder site-builder backup                       # make one now
docker compose exec site-builder site-builder backups                      # list them
docker compose exec site-builder site-builder backup --verify <archive>    # test a restore
```

A backup on the same disk is lost with that disk, so copy `BACKUP_PATH` off the machine with your usual tools. Never copy the data volume while the container runs; use the archives.

## Restore

Stop the builder first; restore won't run otherwise.

```sh
docker compose stop site-builder
docker compose run --rm --no-deps site-builder site-builder restore <archive>
docker compose start site-builder
```

Accounts and passwords return to their state in the backup, everyone is signed out, and the website is published again. Anything replaced is kept, not deleted.

## Upgrades

```sh
git pull
docker compose up -d --build
```

The new version backs up the database, then updates it as it starts. If that fails, the database is put back and the reason goes to the log.
