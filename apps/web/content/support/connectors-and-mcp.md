---
id: connectors-and-mcp
title: Connectors and MCP
path: /connectors
category: connectors
tags: connector, connectors, mcp, integration, github, tools, revoke, disconnect, permissions, always allow
updated: 2026-10-12
scope: public
---

## What connectors do

{{AVAILABILITY.connectors}}

Connectors let AGI call an external system on your behalf, reading a repository,
querying a service, or running a tool exposed over MCP (Model Context Protocol).
Every connector is scoped to your own account.

## Adding a connector

Adding a connector requires connectors to be open. On the connectors page,
choose the connector and complete its authorization flow. A custom MCP endpoint
is added there too, with its own URL.

## Tool permissions

When a connector's tool runs for the first time, AGI asks for approval. Choosing
"Always allow" saves that verdict so the same tool can run without prompting again.

## Removing a connector

Removing a connector deactivates it and clears the saved "Always allow" tool
permissions at the same time, so a later reconnect starts from a clean approval
state. AGI asks the provider to revoke every account you connected through it,
not only the one AGI treated as the default, and deletes the credentials it held
for them.

## Custom MCP connections and plans

The number of custom MCP connections available depends on your plan. The pricing
page lists that limit once connectors are open.
