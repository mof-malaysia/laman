# Installing with Docker Compose

The site builder runs as one container: the API, the admin at `/admin` and the published site at `/`, from one port. Its state is a Docker volume (`/data`); its backups go to a folder on the host (`/backups`). This guide takes a server from nothing to a running site with HTTPS, then covers backups, restore and upgrades.

## What you need

- A Linux server with Docker Engine 24 or later and the Compose plugin (`docker compose version`).
- A host name for the site (`www.agensi.gov.my`) pointing at the server, if Caddy is to get the certificate. Otherwise, your own HTTPS proxy (nginx, a load balancer).
- This repository on the server (`git clone`). The image is built from it; there's no published image yet.
- For backups: a folder on another disk, or one that's copied off the machine.

## 1. Settings

```sh
cp .env.example .env
chmod 600 .env
```

Fill in `.env`: the first account (`SUPER_ADMIN_USERNAME`, `SUPER_ADMIN_PASSWORD`, at least 12 characters; it must be changed at first sign-in, and both can be removed after), the site's address (`SITE_URL`), and the host folder for backups (`BACKUP_PATH`, writable by uid 1000: `sudo chown 1000:1000 <folder>`). The file says what each line is for; every other server setting is in `apps/server/.env.example`.

The builder trusts `X-Forwarded-For` from Docker's private addresses (`TRUST_PROXY=uniquelocal`), which is only ever the proxy: Caddy, or one on this machine through the loopback port. That's what makes sign-in cookies `Secure` and puts visitors' addresses in the audit log. Keep the port on `127.0.0.1` (`BIND_ADDRESS`), or anyone who can reach it can fake their address.

## 2. Start it

**With Caddy**, which gets and renews the certificate for `SITE_URL`'s host itself. The host name must point at this server, and ports 80 and 443 must be free and reachable from the internet:

```sh
docker compose --profile https up -d --build
```

**Behind your own proxy**: the builder listens on `127.0.0.1:8080` (`BIND_ADDRESS` and `HTTP_PORT` change it). Point the proxy there, passing `X-Forwarded-For` and `X-Forwarded-Proto`:

```sh
docker compose up -d --build
```

The first build takes a few minutes. `docker compose ps` shows `healthy` once it's ready; `docker compose logs -f site-builder` shows what it's doing. Then open `https://<your site>/admin`, sign in with the first account and choose a new password. Until something is published, the site's address goes to the admin.

## 3. The command line

The CLI runs inside the container:

```sh
docker compose exec site-builder site-builder users
docker compose exec site-builder site-builder reset-password <username>
docker compose exec site-builder site-builder clear-2fa <username>
docker compose exec site-builder site-builder publish --full
docker compose exec site-builder site-builder check
```

## 4. Backups

The builder backs itself up every day at 02:00 Malaysian time, before every upgrade, and when an Admin presses **Back up now** in Settings → About. Archives land in `BACKUP_PATH` on the host:

```sh
docker compose exec site-builder site-builder backup          # one now
docker compose exec site-builder site-builder backups         # list them
docker compose exec site-builder site-builder backup --verify <archive>
```

A backup on the same disk doesn't survive losing the disk: copy `BACKUP_PATH` off the machine with the tool your infrastructure already uses. restic, to S3-compatible storage or another server, encrypts on the way. Archives hold password hashes and two-factor secrets, so keep them as private as the server.

Never copy the data volume while the container runs (`docker cp`, a `tar` of `/var/lib/docker/volumes`): the database may be caught mid-write. Use the archives, or an atomic snapshot of the whole disk. Details: [site-builder.md](site-builder.md) § Backup and restore.

## 5. Restore

The builder has to be stopped first; restore refuses otherwise.

```sh
docker compose stop site-builder
docker compose run --rm --no-deps site-builder site-builder restore <archive>
docker compose start site-builder
```

`<archive>` is a file name from `site-builder backups`. Accounts and passwords go back to how they were in the backup, everyone is signed out, and the site is published again when the builder starts. What the restore replaced is kept in the volume under `before-restore-<time>/`; remove it once you're happy:

```sh
docker compose exec site-builder sh -c 'rm -r /data/before-restore-*'
```

## 6. Upgrades

```sh
git pull
docker compose up -d --build
```

The new version backs up the database, then migrates it as it starts. If a migration or the content check fails, it puts the database back as it was and exits with the reason in `docker compose logs site-builder` (Docker keeps trying to start it); going back to the previous version (`git checkout <previous tag>`, then `docker compose up -d --build`) brings the site back. A version can't open a database a newer one has upgraded: restore a backup made before the upgrade instead.

## Where things are

| What                  | Where                                                       |
| --------------------- | ----------------------------------------------------------- |
| Database, media, site | The `site-builder_data` volume, at `/data` in the container |
| Backups               | `BACKUP_PATH` on the host, `/backups` in the container      |
| Certificates (Caddy)  | The `site-builder_caddy` volume                             |
| Settings              | `.env` beside `compose.yaml`                                |
| Logs                  | `docker compose logs`: JSON lines, one per request          |

`docker compose down` stops and removes the containers but keeps the volumes. `docker compose down -v` also deletes the data volume: the site and everything in it.
