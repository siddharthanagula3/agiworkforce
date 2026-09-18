---
id: mcp-connections
title: Connect a custom MCP server
path: /connectors/mcp-directory
category: connectors
tags: mcp, model context protocol, custom mcp, mcp server, remote mcp, mcp url, auth token, tool discovery, mcp directory, mcp-server, scopes
updated: 2026-09-17
scope: public
---

## What MCP is here

MCP (Model Context Protocol) is how AGI talks to a tool server that is not one
of the built-in connectors. A server exposes tools; AGI discovers them and can
call them on your behalf, under the same approval rules as any other connector.

## Adding one

A custom MCP connection needs three things: a name to show it under, the
server's URL, and an auth token if the server requires one. AGI then queries the
server for its tools, showing "Discovering live MCP capabilities…" while it
does.

Where a server offers an API key instead, AGI checks how that server accepts a
key before asking you for it, and offers **Test and save** so a bad key fails at
the point you paste it rather than mid-conversation.

## What the discovery results mean

- A list of tools: discovery succeeded and those are what the server offers.
- "The server answered but lists no tools yet." The server is reachable but
  exposes nothing, which is the server's state, not a connection failure.
- "Live tool discovery failed; showing known tools." AGI could not reach the
  server this time and is listing what it saw before. Treat that list as stale.
- "Unavailable during discovery": a tool the server declared but that could not
  be resolved.

## Finding servers

The MCP connector directory is a searchable index of servers. While indexing is
still running it says so, because an incomplete search result would otherwise
read as "no such server".

## Permissions

Connecting is not the same as granting scopes. A connector's scope list shows
what it is allowed to reach, its tools see the context you send them, and you
can disconnect at any time. Per-tool approval works the same way as for built-in
connectors.

## Limits

How many custom MCP connections you can keep depends on your plan; the pricing
page carries the current figures. A workspace administrator can restrict which
connectors a managed workspace permits.

## AGI as an MCP server

The CLI also runs the other way round: `agi mcp-server` exposes AGI to another
MCP client, so the protocol works in both directions.
