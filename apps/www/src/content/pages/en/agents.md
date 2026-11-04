---
title: AI agents in Laman
description: Officers can ask an AI agent to build and change the website with Laman's own tools, as that officer, with that officer's permissions, and every action is recorded.
path: /en/agents
alternate: /ejen-ai
heading: "AI agents, as the officer, not as a vendor"
lead: "Officers can ask an AI agent to build and change the website with Laman's own tools. The agent can do only what that officer can, and every action is recorded."
---

## What it can do

Laman has a built-in Model Context Protocol (MCP) server. Clients such as Claude Desktop or Codex connect to it and get about 80 tools: read pages, arrange blocks, update navigation and the announcement, upload media and, if the officer's role allows, publish.

An example request:

> Add an announcement to every page: the office is closed tomorrow because of flooding, and counter services move to the Seksyen 9 branch.

The agent drafts the announcement. An Editor checks it and a Content Manager publishes it, as with work done by hand.

## Why it's safe

- **Off for everyone** until an Admin turns on MCP access for a person.
- **Signs in as the officer,** with OAuth, and gets only the tools their role allows, checked on every call. An Editor's agent never sees the publishing tools.
- **Same path as the admin.** Every tool goes through Laman's own API, with the same permission checks, validation, draft protection and audit log.
- **Every call is recorded:** the tool, the target, the outcome and how long it took.
- **Can be cut off at any time.** Admins see and revoke connections, and each one ends by itself after 7 days.
- **No downloads.** Laman never fetches a file from an address an agent gives it. Files come only from the officer's computer.

## Not tied to one AI vendor

MCP is an open protocol, so the agency picks the client that fits its policy, or uses no agents at all. Nothing in Laman depends on an AI service.
