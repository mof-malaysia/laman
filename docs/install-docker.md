# Installing with Docker Compose

Laman runs as one container, from the published image `ghcr.io/mof-malaysia/laman`: the API, the admin at `/admin` and the published site at `/`, from one port. Its state is a Docker volume (`/data`); the media library is in a second container beside it, RustFS (S3-compatible storage), with a volume of its own; its backups go to a folder on the host (`/backups`). This guide takes a server from nothing to a running site with HTTPS, then covers media storage, backups, restore and upgrades.

## What you need

- A Linux server with Docker Engine 24 or later and the Compose plugin (`docker compose version`).
- A host name for the site (`www.agensi.gov.my`) pointing at the server, if Caddy is to get the certificate. Otherwise, your own HTTPS proxy (nginx, a load balancer).
- For backups: a folder on another disk, or one that's copied off the machine.

Nothing else: no copy of the repository and no `git`. Two files come with each [release](https://github.com/mof-malaysia/laman/releases), `compose.yaml` and `.env.example`. Download them for the version you're installing (an exact version, such as `1.0.0`; the release page has the list) into a folder of their own:

```sh
mkdir laman && cd laman
VERSION=1.0.0
curl -fLO https://github.com/mof-malaysia/laman/releases/download/v$VERSION/compose.yaml
curl -fLO https://github.com/mof-malaysia/laman/releases/download/v$VERSION/.env.example
```

Run every command in this guide from that folder.

## 1. Settings

```sh
cp .env.example .env
chmod 600 .env
```

Fill in `.env`: the version to run (`LAMAN_VERSION`, the same `1.0.0` as above), the first account (`SUPER_ADMIN_USERNAME`, `SUPER_ADMIN_PASSWORD`, at least 12 characters; it must be changed at first sign-in, and both can be removed after), the site's address (`SITE_URL`), the bundled media store's secret (`MEDIA_STORE_SECRET_ACCESS_KEY`: `openssl rand -hex 24`), and the host folder for backups (`BACKUP_PATH`, writable by uid 1000: `sudo chown 1000:1000 <folder>`). The file says what each line is for; every other server setting is in [`apps/server/.env.example`](https://github.com/mof-malaysia/laman/blob/main/apps/server/.env.example). Pin an exact version in `LAMAN_VERSION`, never `latest`: it's what an upgrade changes, and a pre-release (`1.0.0-beta.1`) is only ever under its own exact tag.

`BACKUP_SECRET_KEY` (`openssl rand -base64 48`) is optional at first, but needed for off-site backups and for your own media storage: set it now, and keep a copy somewhere other than this server. A restored site needs the same one.

The builder trusts `X-Forwarded-For` from Docker's private addresses (`TRUST_PROXY=uniquelocal`), which is only ever the proxy: Caddy, or one on this machine through the loopback port. That's what makes sign-in cookies `Secure` and puts visitors' addresses in the audit log. Keep the port on `127.0.0.1` (`BIND_ADDRESS`), or anyone who can reach it can fake their address.

## 2. Start it

**With Caddy**, which gets and renews the certificate for `SITE_URL`'s host itself. The host name must point at this server, and ports 80 and 443 must be free and reachable from the internet:

```sh
docker compose --profile https pull
docker compose --profile https up -d
```

**Behind your own proxy**: the builder listens on `127.0.0.1:8080` (`BIND_ADDRESS` and `HTTP_PORT` change it). Point the proxy there, passing `X-Forwarded-For` and `X-Forwarded-Proto`:

```sh
docker compose pull
docker compose up -d
```

`pull` downloads the images (Laman's, RustFS's and Caddy's); Compose stops with "Set LAMAN_VERSION in .env" if the version is missing. RustFS starts first, and Laman makes its two buckets on its first start. `docker compose ps` shows `healthy` once it's ready; `docker compose logs -f laman` shows what it's doing. Then open `https://<your site>/admin`, sign in with the first account and choose a new password. Until something is published, the site's address goes to the admin.

## 3. The command line

The CLI runs inside the container:

```sh
docker compose exec laman laman users
docker compose exec laman laman reset-password <username>
docker compose exec laman laman clear-2fa <username>
docker compose exec laman laman publish --full
docker compose exec laman laman check
```

## 4. Media storage

Uploads, their smaller copies and replaced files are kept in S3-compatible object storage, never on the server's disk. Every bucket is private: officers open files through links that last 30 minutes, and visitors get only the files live pages use.

**The bundled store** needs nothing set up. RustFS runs on the Compose network only, with its volume `laman_media`; neither of its buckets (`laman-media` for the library, `laman-published` for what live pages use) is reachable from outside, and the builder serves published files at `/media/*`. It shares the server's disk, so turn on off-site backups (section 5): after each backup, the media is copied to the same bucket under `media/`, sending only new files. Until then, Settings → Media storage warns that media has no copy off the server.

**Your own storage.** An agency with its own S3-compatible storage (AWS S3, Google Cloud Storage, Cloudflare R2, Wasabi, DigitalOcean Spaces, MinIO, any other) can keep the library there instead. It can only be set up, or changed, while the media library has no files: Laman never copies files between stores, so choose before the first upload.

1. Set `BACKUP_SECRET_KEY` in `.env` and `docker compose up -d`. It seals the storage's secret key in the database.
2. Make two private buckets, one for the library and one for published files, and keys that can read, write, list and delete in both (on AWS: `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket`).
3. Give visitors an address for the published bucket, best a CDN with origin access (below).
4. As the super admin, fill in **Settings → Media storage → Use your own storage**, press **Test connection**, and save. It saves only once the test passes.

**A CDN with origin access (CloudFront).** Keep the published bucket private and let only the CDN read it:

1. In CloudFront, create a distribution with the published bucket as its origin, and **Origin access control** (not the legacy origin access identity). CloudFront shows a bucket policy allowing `s3:GetObject` to that distribution: add it to the bucket.
2. Under the cache behaviour, use a cache policy that **includes the query string** `v` in the cache key: a replaced file keeps its name and changes `?v=`.
3. Give the distribution a name (`media.agensi.gov.my`, with its ACM certificate) and enter `https://media.agensi.gov.my` as the published files' address.

Other CDNs work the same way: the origin is the published bucket, read with credentials or a signed origin request, and the query string is part of the cache key.

**The public-read fallback.** Without a CDN, make only the published bucket public-read (on AWS, a bucket policy allowing `s3:GetObject` to everyone on that bucket, with Block Public Access off for it alone) and enter the bucket's own address (`https://<bucket>.s3.ap-southeast-5.amazonaws.com`). The library bucket stays private either way.

**Versioning and the lifecycle rule.** Your own buckets aren't in Laman's backups: turn on versioning for both, so a deleted or replaced file can be got back, and add a lifecycle rule that deletes noncurrent versions after at least as long as your oldest backup: about 35 days for local archives, or 365 days if you keep off-site monthly copies. The copy of the media into the off-site backup bucket is then optional; Laman makes it only for the bundled store.

**The sealing key.** The storage's secret key is in the database, sealed with `BACKUP_SECRET_KEY`. A site restored without the same key can't reach its media: the admin says so. Keep the key with your other recovery secrets.

## 5. Backups

The builder backs itself up every day at 02:00 Malaysian time, before every upgrade, and when an Admin presses **Back up now** in Settings → Backups. Archives land in `BACKUP_PATH` on the host:

```sh
docker compose exec laman laman backup          # one now
docker compose exec laman laman backups         # list them
docker compose exec laman laman backup --verify <archive>
```

An archive holds the database: the media library is in the media storage (section 4). A backup on the same disk doesn't survive losing the disk. The builder can copy every archive to S3-compatible storage (AWS S3, Google Cloud Storage, Cloudflare R2, Wasabi, DigitalOcean Spaces, MinIO, or any other), encrypted first if asked:

1. Add `BACKUP_SECRET_KEY` to `.env` (`openssl rand -base64 48`), keep a copy somewhere other than this server, and `docker compose up -d`.
2. As the super admin, fill in **Settings → Backups → Off-site copies**, press **Test connection**, and save.
3. In the storage, add lifecycle rules for `daily/`, `monthly/`, `manual/` and `upgrade/`: [laman.md](laman.md) § Off-site copies has the ages and least-privilege keys for each provider. On the bundled media store, the media is copied to `media/` in the same bucket after each backup: don't expire it, or keep its old versions as long as your backups.

```sh
docker compose exec laman laman backups --remote    # the copies off-site
```

Or copy `BACKUP_PATH` off the machine with the tool your infrastructure already uses (restic encrypts on the way). Archives hold password hashes and two-factor secrets, so keep them as private as the server.

Never copy the data volume while the container runs (`docker cp`, a `tar` of `/var/lib/docker/volumes`): the database may be caught mid-write. Use the archives, or an atomic snapshot of the whole disk. Details: [laman.md](laman.md) § Backup and restore.

## 6. Restore

The builder has to be stopped first; restore refuses otherwise.

```sh
docker compose stop laman
docker compose run --rm --no-deps laman laman restore <archive>
docker compose start laman
```

`<archive>` is a file name from `laman backups`. For an off-site copy, fetch it into `/backups` first (it's decrypted and checked on the way), then restore it as above:

```sh
docker compose exec laman laman fetch <archive>
```

On a new server with nothing restored yet, download the copy with the provider's tools into `BACKUP_PATH`, and if it ends in `.enc`, decrypt it: `docker compose run --rm --no-deps -e BACKUP_PASSPHRASE laman laman decrypt /backups/<archive>.enc`.

The restore checks the restored database against its media storage and lists any file it names that the storage doesn't have. On the bundled store, put those back from the off-site copy: run `rclone` (or `aws s3 sync`) in a container on the Compose network (`--network laman_default`), copying `<folder>/media/` from the off-site bucket into the `laman-media` bucket at `http://rustfs:9000` with the `MEDIA_STORE_*` keys. On your own storage, put back the old versions in the bucket. Your own storage is reached again only with the same `BACKUP_SECRET_KEY`.

Accounts and passwords go back to how they were in the backup, everyone is signed out, and the site is published again when the builder starts. What the restore replaced is kept in the volume under `before-restore-<time>/`; remove it once you're happy:

```sh
docker compose exec laman sh -c 'rm -r /data/before-restore-*'
```

## 7. Upgrades

Read the release notes for the new version first: they say what changed and whether `compose.yaml` or `.env.example` did (if so, download the new ones as in [What you need](#what-you-need), keeping your `.env`). Which versions get fixes, and what a patch, minor or major version may change, is in [releases.md](releases.md). Then change `LAMAN_VERSION` in `.env` to the new version, and:

```sh
docker compose pull
docker compose up -d
```

Add `--profile https` to both if you use Caddy. The new version backs up the database, then migrates it as it starts. If a migration or the content check fails, it puts the database back as it was and exits with the reason in `docker compose logs laman` (Docker keeps trying to start it); setting `LAMAN_VERSION` back to the previous version and running `docker compose up -d` again brings the site back. A version can't open a database a newer one has upgraded: restore a backup made before the upgrade instead ([§ 6](#6-restore)).

### From a version called `site-builder`

Earlier versions were built from a `git clone` and named the Compose project, the service and the command `site-builder`. In the clone's folder, so your `.env` and `BACKUP_PATH` stay where they are, put the release's `compose.yaml` and `.env.example` in place of the clone's (the `curl` lines in [What you need](#what-you-need)) and add the lines the new `.env.example` has and your `.env` doesn't: `LAMAN_VERSION`, `MEDIA_STORE_ACCESS_KEY_ID` and `MEDIA_STORE_SECRET_ACCESS_KEY` ([§ 1](#1-settings)). Docker keeps state in volumes named after the project, so move the data to the new `laman_data` volume once, with the site stopped:

```sh
docker compose -p site-builder down --remove-orphans
docker volume create laman_data
docker run --rm -v site-builder_data:/from -v laman_data:/to alpine cp -a /from/. /to/
docker compose pull
docker compose up -d
```

Caddy gets a new certificate on its own, so `site-builder_caddy` needs no copy. Commands are now `docker compose exec laman laman <command>`. Archives already in `BACKUP_PATH` keep their `site-builder-` names and are still listed, pruned and restorable. Remove the old volume (`docker volume rm site-builder_data`) once the site is back.

## Where things are

| What                 | Where                                                  |
| -------------------- | ------------------------------------------------------ |
| Database, site       | The `laman_data` volume, at `/data` in the container   |
| Media (bundled)      | The `laman_media` volume, in the `rustfs` container    |
| Backups              | `BACKUP_PATH` on the host, `/backups` in the container |
| Certificates (Caddy) | The `laman_caddy` volume                               |
| Settings             | `.env` beside `compose.yaml`                           |
| Logs                 | `docker compose logs`: JSON lines, one per request     |

`docker compose down` stops and removes the containers but keeps the volumes. `docker compose down -v` also deletes the data and media volumes: the site and everything in it.

## Building from source

For contributors testing a change in the container, not for installs. `compose.build.yaml` builds the image from a checkout instead of pulling it:

```sh
git clone https://github.com/mof-malaysia/laman.git && cd laman
cp .env.example .env     # fill it in, with LAMAN_VERSION=dev
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

The build takes a few minutes; `docker compose ps` shows `healthy` once it's ready. The image is tagged `ghcr.io/mof-malaysia/laman:$LAMAN_VERSION`, so keep `LAMAN_VERSION` to a name no release uses, such as `dev`, or the local build stands in for that release. To leave out the `-f` options, add `COMPOSE_FILE=compose.yaml:compose.build.yaml` to `.env`.
