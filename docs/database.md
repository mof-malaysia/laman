# Databases

Laman keeps two SQLite files in `DATA_DIR`: `site.db` (content, people and access) and `analytics.db` (visits, kept apart so it can be cleared without touching the site). Both are made by `0001_baseline` (docs/upgrades.md § The baseline). Table types for the server are in `apps/server/src/db/schema.ts`.

How to read the diagrams:

- **Solid lines** are foreign keys SQLite enforces.
- **Dashed lines** are references the code keeps but SQLite doesn't check: who made or last changed something, a page's live revision, and `analytics.db`'s pages, which live in the other file.
- `text` columns ending `_at` hold ISO times. Columns described as JSON hold a document whose schema is listed in `apps/server/src/db/documents.ts`.
- Kysely's own `kysely_migration` and `kysely_migration_lock` are left out of both files.

The diagrams are drawn from a freshly migrated database. Update them with any migration that adds or changes a table.

## site.db: content

Pages form one tree (the home page is the root). A listing collects entries, which are pages of kind `entry` under it. Drafts are saved on the page; publishing freezes one as a revision.

```mermaid
erDiagram
    pages ||--o{ pages : "parent of"
    pages ||--o{ revisions : "history"
    pages |o..o| revisions : "live as"
    pages ||--o{ redirects : "old address of"
    pages |o--o{ redirects : "target of"
    media ||--o{ media_usage : "used by"
    users ||..o{ pages : "last edited"
    users ||..o{ revisions : "made"
    users ||..o{ media : "uploaded"
    users ||..o{ settings : "last edited"
    users ||..o{ jobs : "queued"

    pages {
        text id PK
        text parent_id FK "null for the home page"
        text slug "one level of the address"
        integer position "among siblings"
        text draft "JSON: PageDocument"
        text published_revision_id "the live revision"
        text kind "page, listing or entry"
        text listing "JSON: listing settings"
        text publish_at "entries: when it goes live"
        text template
        text created_at
        text updated_at
        text updated_by
        text deleted_at "in Recently deleted"
    }
    revisions {
        text id PK
        text page_id FK
        text content "JSON: PageDocument"
        text kind "published or draft"
        text created_at
        text created_by
        text created_via "the agent, when one made it"
    }
    redirects {
        text id PK
        text source_path
        text target_page_id FK
        text target_url
        integer status
        text page_id FK "the page whose address it was"
        text created_at
    }
    media {
        text id PK
        text filename
        text type
        text ext
        integer size
        integer width
        integer height
        text alt
        text caption
        text credit
        integer decorative
        text variants "JSON: sizes made"
        integer variants_size
        text status
        text previous "the file it replaced"
        text replaced_at
        text created_at
        text created_by
        text updated_at
        text deleted_at
    }
    media_usage {
        text media_id PK, FK
        text owner PK "a page id or a site document"
    }
    settings {
        text key PK "e.g. navigation.draft, theme.published, security, offsite"
        text value "JSON: the site document"
        text updated_by
    }
    jobs {
        text id PK
        text kind "publish, media.variants, backup, backup.upload, backup.verify, calendar.sync"
        text payload "JSON"
        text status
        integer attempts
        text run_at "scheduled"
        text result "JSON"
        text log
        text error
        text created_at
        text created_by
        text finished_at
    }
    content_changes {
        integer id PK "always 1"
        integer n "counts writes to pages, settings, media, redirects"
    }
    users {
        text id PK
    }
```

## site.db: people and access

People sign in with a session. Agents connect over OAuth (docs/mcp.md). API tokens each have an account of their own (`users.kind` "token") that never signs in (docs/auth.md § API tokens).

```mermaid
erDiagram
    users ||--o{ sessions : "signs in with"
    users ||--o{ recovery_codes : "has"
    users |o--o{ tokens : "invited or reset by"
    users ||..o{ audit_log : "did"
    users ||--o{ agent_connections : "allowed"
    oauth_clients ||--o{ agent_connections : "connects as"
    users ||--o| api_tokens : "is the account of"
    users |o--o{ api_tokens : "made or revoked"
    api_tokens ||--|{ api_token_areas : "may change"
    api_tokens ||--o{ api_token_listings : "writes under"
    pages ||--o{ api_token_listings : "listing"

    users {
        text id PK
        text kind "person or token"
        text username
        text display_name
        text role "editor, contentManager, admin, superAdmin"
        text password_hash
        integer must_change_password
        text totp_secret
        integer totp_last_step
        text totp_enrolled_at
        text preferences "JSON"
        integer mcp_enabled
        text last_sign_in_at
        text disabled_at
        text created_at
        text created_by
    }
    sessions {
        text id PK
        text token_hash "SHA-256 of the cookie"
        text user_id FK
        text stage "password, totp, enrol or full"
        text ip
        text user_agent
        text created_at
        text last_seen_at
    }
    recovery_codes {
        text user_id PK, FK
        text code_hash PK
        text used_at
    }
    tokens {
        text id PK
        text token_hash "one-time link"
        text kind "invite or reset"
        text role "an invite's"
        text user_id FK "a reset's"
        text note
        text created_by
        text created_at
        text expires_at
        text used_at
    }
    audit_log {
        integer id PK
        text at
        text user_id "null for the server itself"
        text action
        text target
        text detail "JSON"
        text ip
    }
    oauth_clients {
        text id PK
        text name
        text redirect_uris "JSON"
        text ip
        text created_at
    }
    agent_connections {
        text id PK
        text user_id FK
        text client_id FK
        text access_hash
        text access_expires_at
        text refresh_hash
        text previous_refresh_hash
        text ip
        text user_agent
        text created_at
        text last_used_at
        text expires_at
        text revoked_at
        text revoked_by
    }
    api_tokens {
        text id PK
        text user_id FK "its own account"
        text token_hash "SHA-256"
        text hint "opening characters"
        text created_by FK
        text created_at
        text expires_at "null: never"
        text last_used_at
        text revoked_by FK
        text revoked_at
    }
    api_token_areas {
        text token_id PK, FK
        text area PK "entries, pages, media or site"
    }
    api_token_listings {
        text token_id PK, FK
        text listing_id PK, FK
    }
    pages {
        text id PK
    }
```

## site.db: Takwim

A listing reads ICS calendars. Each occurrence a sync finds is written to an entry under the listing; `calendar_events` remembers which entry, and a hash of what it last wrote (docs/site-builder.md).

```mermaid
erDiagram
    pages ||--o{ calendar_sources : "reads"
    pages ||--o{ calendar_events : "listing of"
    pages ||--o| calendar_events : "entry for"

    pages {
        text id PK
    }
    calendar_sources {
        text id PK
        text listing_id FK
        text name
        text address "ICS link"
        text category "listing category its events take"
        text location "fallback location"
        integer enabled
        integer position
        integer events "found last time"
        integer failures "in a row"
        text error
        integer held_found "a drop held for review"
        integer accept_drop
        text created_at
        text checked_at
        text synced_at
    }
    calendar_events {
        text listing_id PK, FK
        text key PK "UID, plus which occurrence"
        text page_id FK "its entry"
        text sources "JSON: calendars it was found in"
        text hash "of what was last written"
        text starts_at
        integer live
    }
```

## analytics.db

No visitor is identified across days: `visitor` is a hash made with that day's salt, which is replaced the next day (docs/analytics.md). `page_id` points at a page in `site.db`, which SQLite can't check across files.

```mermaid
erDiagram
    salts ||..o{ views : "hashes the day's visitors"
    salts ||..o{ events : "hashes the day's visitors"
    site_pages ||..o{ views : "page in site.db"
    site_pages ||..o{ events : "page in site.db"

    salts {
        text day PK
        text salt
    }
    views {
        text id PK
        text visitor "hash, for the day"
        text visit
        integer at
        text day
        integer hour
        text page_id
        text path
        text referrer
        text utm_source
        text utm_medium
        text utm_campaign
        text browser
        text os
        text device
        text screen
        text language
        text country
        integer visible
    }
    events {
        integer id PK
        integer at
        text day
        text visitor
        text kind
        text page_id
        text path
        text target
    }
    site_pages {
        text id PK "pages.id in site.db"
    }
```
