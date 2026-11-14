# Agents over MCP

Status: built. Phases 1 to 5: sign-in and consent, `/mcp` and its 80 tools, managing agents, and the limits below.

An officer can ask an AI agent (Claude Desktop, Codex and the like) to build and change the site with the builder's own tools. The agent connects to an MCP server inside the builder, signs in as the officer, and can do exactly what the officer's role can, no more. Admins choose who may connect, see what agents did, and can cut any of them off.

## Decisions

| Question             | Decision                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Clients              | Remote MCP clients first: Claude Desktop, Codex and similar. Streamable HTTP at `/mcp`, in the same process. No stdio mode                                                     |
| Sign-in              | OAuth 2.1 with PKCE and dynamic client registration, as the MCP authorization spec asks. The builder is its own authorization server. No two-factor needed to connect          |
| What an agent can do | Whatever its officer's role can, checked on every call against the role as it is then. A Content Manager's agent may publish; an Editor's agent never sees publish tools       |
| Who may connect      | Off for everyone until an Admin turns on "MCP access" for that person. Turning it off, or disabling the account, ends all their connections                                    |
| Writing              | Tools call the builder's own `/api` routes in-process, as the officer: the same permission checks, validation, draft conflicts and audit entries as the admin                  |
| Expiry               | Access tokens last an hour and refresh tokens rotate. A connection ends 7 days after consent; the officer then connects again                                                  |
| Logging              | One audit entry per tool call: tool, target, outcome or error code, duration, connection. No arguments. Kept as long as the audit log (365 days)                               |
| Management           | Admins see every connection and revoke one or all of a person's. Everyone sees and revokes their own                                                                           |
| Media                | Only files from the officer's machine: base64 in the tool call, or posted to a one-time upload link (below). Up to `MEDIA_MAX_MB`. The server never fetches a URL for an agent |
| Previews             | Text and HTML of the rendered draft. No screenshots                                                                                                                            |
| Two editors at once  | As today: a save from an old version is refused (409 `draft_conflict`); the tool tells the agent to read the page again                                                        |

## Signing in

1. The client finds the builder's metadata at `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`, and registers itself (`POST /oauth/register`).
2. It opens `/admin/connect?…` in the officer's browser. The officer signs in if they aren't already, and sees the client's name and what it will be able to do (their role's permissions). They allow or deny.
3. Allowing makes an **agent connection** and sends the client back with a one-time code, which it trades at `POST /oauth/token` for an access token and a refresh token.
4. Every call to `/mcp` carries the access token. The server finds the connection, checks it isn't revoked or expired, that the officer still has MCP access and isn't disabled, and runs the tool as them.

Only SHA-256 hashes of codes and tokens are stored, as with browser sessions. A refresh token used twice ends the connection (it was copied).

## Tools

Each tool declares a permission, like routes do; `tools/list` shows only the ones the officer's role has. Tools that change a drafted document read the draft, apply one change and save it with the draft's `version` as `base`. Paths into a document use the style `NavWarning` already uses, e.g. `navbar.1.links.0`.

### Discovery (signed in)

`whoami`, `get_site_summary`, `list_block_types`, `get_block_schema(type)`, `list_templates(kind)`, `list_pages`, `get_page(id)`, `list_entries(listingId)`, `list_revisions(pageId)`, `check_pages`, `preview_page(id)`, `get_settings`, `get_announcement`, `list_media`, `get_media(id)`, `get_analytics` (summary or breakdown), `get_navigation`, `check_navigation`, `get_search`, `get_theme`, `list_theme_presets`, `preview_theme` (a preset or a colour).

### Drafting (`content.edit`)

| Area       | Tools                                                                                                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pages      | `create_page`, `update_page_details`, `replace_page_blocks`, `add_block`, `update_block`, `move_block`, `remove_block`, `move_page`, `duplicate_page`, `restore_revision_to_draft`, `discard_page_changes` |
| Listings   | `make_listing`, `update_listing`, `create_entry`                                                                                                                                                           |
| Navbar     | `add_navbar_link`, `add_navbar_dropdown`, `update_navbar_item`, `add_dropdown_link`, `add_dropdown_group`, `set_dropdown_feature`, `set_dropdown_footer_link`                                              |
| Footer     | `add_footer_column`, `update_footer_column`, `add_footer_link`                                                                                                                                             |
| Navigation | `update_navigation_item`, `move_navigation_item`, `remove_navigation_item`, `replace_navigation`                                                                                                           |
| Search     | `set_search_options(on?, filters?)`, `add_search_pin(terms, pageId)`, `update_search_pin`, `remove_search_pin`                                                                                             |
| Colours    | `set_theme` with a preset or the agency's colour (the server makes the ramp, as the admin does)                                                                                                            |
| Site       | `update_settings` (section by section), `update_announcement`, `discard_draft` (settings, navigation, announcement, search or colours)                                                                     |
| Media      | `start_upload(alt…)` for a one-time upload link, `upload_media(filename, data, alt…)` with the file base64-encoded, `update_media(id, alt, caption, credit)`                                               |

### Media: upload links

A file sent base64 inside a tool call costs the agent a third more than the file, all of it through its context, so agents tend to shrink images before sending them and the site gets a blurred copy. `start_upload` gives the agent a link to post the original to instead, from a shell:

```sh
curl -sS -F "file=@/path/to/photo.jpg" https://builder.agensi.gov.my/mcp/uploads/<token>
```

- The link is random, works once and lasts 15 minutes. Only its hash is kept, in memory, so a restart ends every link; a connection holds at most 20 at a time.
- `POST /mcp/uploads/:token` spends the link before reading the body, refuses a browser page from another origin, and checks the connection is still open and its officer may still use agents. It then uploads through `POST /api/media` as the officer, like `upload_media`, and applies the alt text and other details given to `start_upload`. It answers with the media file (`201`) or `{ "error": … }`.
- It is audited like a tool call (tool `upload_link`) and counts against the connection's call limit.
- Both tools' descriptions tell agents to send the original, never a resized or recompressed copy: the builder makes the narrower copies pages use.

`upload_media` stays for agents without a shell and for small files.

### Publishing (`content.publish`)

`list_waiting` (signed in), `publish_page`, `schedule_publish(runAt, pageIds?, docs?)`, `cancel_scheduled_publish`, `unpublish_page`, `publish_settings`, `publish_navigation`, `publish_announcement`, `publish_search`, `publish_theme`, `replace_media`, `revert_media_file`.

`delete_page`, `delete_media` and `restore_media` take `content.edit` like their routes, which ask for `content.publish` themselves when the page or file is live. `delete_page` only reports what a delete would touch until it's called again with `confirmed: true`.

Tools that take something off the site or out of reach (`unpublish_page`, `delete_page`, `delete_media`, `undo_publish`, `discard_draft`, `discard_page_changes`) carry MCP's `destructiveHint`, so clients ask the officer before running them.

### Site machinery (`site.manage`)

`retry_job`, `undo_publish`, `rebuild_site`; and, for anyone signed in, `list_jobs` and `get_job`.

### Never

Sign-in, passwords, two-factor, invites, roles, reset links, anything under `users.manage` or `security.manage`, backups, preferences.

### Resources and prompts

Resources: the block catalogue, an FTDS content guide (tone, BM by default, heading order) and the page tree. Prompts: "build a page from a brief", "audit the site for accessibility". Content an agent reads back is data; the content guide says so.

## Connecting an agent

The MCP server is at `<builder address>/mcp`. Add it to the agent as a remote (Streamable HTTP) server; the agent finds the sign-in endpoints itself, registers, and opens the consent screen in a browser. The officer needs MCP access: an Admin turns it on in Users (the MCP access column), and the super admin turns on their own in Account. Account then shows the address to add.

**Claude Desktop (and claude.ai).** Settings › Connectors › Add custom connector, with the address above as the remote MCP server URL; leave the OAuth client ID and secret empty (Claude registers itself). Connect, sign in to the builder if asked, and Allow. Claude connects from Anthropic's servers, not the officer's machine, so the builder must be on a public HTTPS address with a valid certificate; its sign-in returns to `https://claude.ai/api/mcp/auth_callback`, which the redirect rules accept. The menu names move between releases: Anthropic's custom connector guide has the current ones.

**Codex.** On the officer's machine:

```sh
codex mcp add laman --url https://builder.agensi.gov.my/mcp
codex mcp login laman
```

`login` opens the consent screen and takes the answer on a localhost port, which the redirect rules allow on any port. Codex runs on the officer's machine, so a builder on the agency's network (or localhost, in development) works. Older Codex releases needed `experimental_use_rmcp_client = true` in `~/.codex/config.toml` for OAuth.

**Other clients** that speak Streamable HTTP with OAuth 2.1, PKCE and dynamic client registration work the same way. Clients that only speak stdio can use a bridge such as `mcp-remote`.

**In development**, use `http://localhost:3001/mcp`: the admin's dev server, which proxies the agent paths keeping its own Host, so the consent screen is on the same origin. Codex works against it; Claude Desktop needs a tunnel to a public HTTPS address.

**If it doesn't connect**: `GET /.well-known/oauth-protected-resource` should name `<address>/mcp`. Set `BUILDER_URL` to the builder's public address so it always does; without it the address comes from each request, which behind a proxy needs `TRUST_PROXY` (or agents are sent to http:// addresses and refused); a consent screen saying "This agent can't connect" means the agent asked to return somewhere it didn't register, so remove and add it again; "You can't connect … yet" means MCP access is off.

## Limits

| What                     | Limit                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Tool calls               | 60 at once per connection, then one a second; over that the tool answers `rate_limited` with the wait. Not logged               |
| Registrations            | 100 per hour per address before they slow down; clients nobody allows are forgotten after a day                                 |
| Codes and refresh tokens | 10 wrong ones per address, then each try waits longer                                                                           |
| Request size             | `MEDIA_MAX_MB` as base64, plus 64 KB; an upload link takes `MEDIA_MAX_MB`. The token or link is checked before the body is read |
| Upload links             | One use, 15 minutes, 20 open per connection                                                                                     |
| Connections              | An hour per access token; 7 days per consent; ended ones stay on Agents for 30 days                                             |

## How it's built

| Piece                                 | Where                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Metadata, registration, token, revoke | `apps/server/src/routes/oauth.ts`; clients and redirect checks in `src/agents/clients.ts`                                             |
| Consent                               | `GET`/`POST /api/agents/consent` (`src/routes/agents.ts`); the screen is `apps/admin/src/auth/connect-screen.tsx` at `/admin/connect` |
| Connections and tokens                | `src/agents/connections.ts`: codes in memory (10 minutes), hashed tokens in `agent_connections`                                       |
| `/mcp`                                | `src/routes/mcp.ts`: stateless JSON-RPC (`initialize`, `ping`, `tools/list`, `tools/call`), JSON answers, no event stream             |
| Tools                                 | `src/agents/tools.ts`: each declares `access`, its input as Zod (the JSON Schema clients see), and runs through `ctx.api`             |
| Acting as the officer                 | `src/agents/tickets.ts`: `ctx.api` calls `/api` in-process with a one-time ticket the guard takes in place of a session               |

The protocol is a few hundred lines of our own rather than the MCP SDK, which would bring Express, Hono and more into the image; the SDK's client is a dev dependency, and `test/mcp.test.ts` connects with it.

## Admin

- **Consent**: an agent that sends its answer to a website other than a known agent's (claude.ai) gets a warning in place of "only allow an agent you started", since anyone can register a client named "Claude".
- **Users**: an "MCP access" switch on each person (`users.manage`, `PATCH /users/:id` with `mcpEnabled`). Turning it off asks first, then ends their connections; so does disabling the account. "End agent connections" in the person's menu ends them but leaves access on (`POST /users/:id/end-agents`).
- **Users › Agents** (`/admin/users/agents`, `users.manage`): who is connected now, through which agent, since when, last used, when it ends and from where; the last 10 tool calls, linked to the audit log filtered to agents; and connections that ended in the last 30 days, with how. Admins end any connection except the super admin's (`GET /agents/connections`, `DELETE /agents/connections/:id`).
- **Account › Agents**: your MCP access, the address to add to your agent, and your live connections, each with End. The super admin, whose account nobody else changes, has the switch for their own access here (`PATCH /auth/me` with `mcpEnabled`, which only `security.manage` may send).
- Revisions and the audit log show "Aisyah through Claude": the guard records the agent beside the officer (`actingAgent()`), revisions keep it in `created_via`, and `audit()` adds it to the detail of any entry written during such a request; the admin shows it with the person, in Who. Ending a connection is logged against the person whose agent it was.

## Storage

A migration adds `users.mcp_enabled` (off), `oauth_clients` (registered clients), `oauth_codes` (one-time, 10 minutes) and `agent_connections` (person, client, created, last used, IP, user agent, expires, revoked, and the hashes of the current access and refresh tokens). Revoking clears the hashes and sets `revoked_at`.

## Phases

1. **Foundation**: the migration, OAuth metadata, registration, consent and tokens, the consent page, `/mcp` with permission-declared tools that run through `/api` as the officer, and the discovery tools.
2. **Drafting**: drafting tools including the block, navigation, search and colour helpers; `upload_media`; "via agent" in the audit log and revisions.
3. **Management**: the per-person switch, the Agents page, Connected agents, revoking.
4. **Publishing and machinery**: the publish and `site.manage` tools.
5. **Hardening**: a rate limit per connection; tests per tool and role, for revoking, a role lowered mid-connection, the switch turned off, expiry, and path and limit errors; setup steps for Claude Desktop and Codex here; the schema snapshot and upgrade fixture.
