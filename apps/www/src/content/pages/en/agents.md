---
title: AI agents in Laman
description: Officers can ask an AI agent to build and change the website with Laman's own tools, as that officer, with that officer's permissions, and every action is recorded.
path: /en/agents
alternate: /ejen-ai
heading: "AI agents, as the officer, not as a vendor"
lead: "An officer can ask an AI agent to build and change the website with Laman's own tools. The agent can only do what that officer can do, and every action it takes is recorded."
---

## What it can do

Laman has a built-in Model Context Protocol (MCP) server. An MCP client such as Claude Desktop or Codex can connect to it, and the agent gets about 80 tools: reading pages, arranging blocks, updating navigation and the announcement, uploading media, and, when the officer's role allows it, publishing.

An example request (illustrative):

> Add an announcement to every page: the office is closed tomorrow because of flooding, and counter services move to the Seksyen 9 branch.

The agent writes a draft announcement through Laman's API. An Editor checks it and asks a Content Manager to publish it, just as with work done by hand.

## Why it's safe

- **Off for everyone** until an Admin turns on MCP access for a person.
- **Signs in as that officer**, with OAuth. The agent only gets the tools the officer's role allows, checked again on every call. An Editor's agent never sees the publishing tools.
- **Goes the same way.** Every tool calls Laman's own API, so the same permission checks, validation, draft protection and audit log apply.
- **Every call is recorded** in the audit log: the tool, the target, the outcome and how long it took.
- **Can be cut off at any time.** Admins see every connection and can revoke it. A connection ends by itself 7 days after it was allowed.
- **No downloads for an agent.** Laman's server never fetches a file from an address an agent gives it. Files come from the officer's computer only.

## Not tied to one AI vendor

Laman uses an open protocol, so an agency can choose the MCP client that fits its own policy, or not use agents at all. Nothing in Laman depends on any AI service.
