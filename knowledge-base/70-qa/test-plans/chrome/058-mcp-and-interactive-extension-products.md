---
id: "PLAN-chrome-058"
type: "test-plan"
title: "Chrome · 58. MCP and interactive extension products"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "58"
---
# Chrome · 58. MCP and interactive extension products

2 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S58.24 Site-provided tools such as WebMCP as a distinct category.

- **Expected:** Tools a website provides (e.g. WebMCP) appear to the assistant as their own category, distinct from connectors.
- **Code:** done. Evidence moved: apps/extension/src/background.ts:4325 (quoted code not found in the file now); apps/extension/src/features/computer-use/agentLoop.ts:527 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. Site tools reach the assistant as two model tools, discover_site_tools and call_site_tool (apps/extension/src/features/computer-use/browserToolDefinitions.ts), and are shown in the activity log only; there is no separate category label in the UI, and connectors are labelled "Coming soon" in the side panel. The cited lines (background.ts:4325, agentLoop.ts:527) no longer hold the quoted code; the current site-tool handling is agentLoop.ts around lines 383-400 and background.ts WEBMCP handlers around lines 5735-5825.
- **Needs:** A Free or paid account, and a site that declares WebMCP tools (for example through navigator.modelContext). The repo has no test site for this.
- **Steps:**
  1. Open the side panel and click the "Computer Use" tab.
  2. Start a browser task on a page that declares WebMCP tools (the repo contains no such test site, so one must be supplied).
  3. Let the assistant run its tool discovery. The activity log shows "Discover tools supplied by this website."
  4. Compare: the site's tools are listed as a separate step from connectors. Connectors are not used in the Computer Use flow.

## S58.25 Tool availability changing with site state.

- **Expected:** When the page state changes, the set of site-provided tools available to the assistant updates.
- **Code:** done. Evidence moved: apps/extension/src/features/computer-use/agentLoop.ts:636 (quoted code not found in the file now); apps/extension/src/background.ts:4326 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. Tool updates come from content.ts (WEBMCP_TOOLS_CHANGED, startToolChangeReporting) and background.ts clears the per-tab list on navigation (invalidateWebMCPToolsForNavigation). The assistant only sees the change when it calls discover_site_tools again, so the tester cannot force the update from a visible control. The cited lines (agentLoop.ts:636, background.ts:4326) no longer hold the quoted code; the current handling is in webmcp.ts (watchForToolChanges) and background.ts around lines 2279-2314.
- **Needs:** A Free or paid account, and a site whose WebMCP tool set changes with page state. The repo has no such test site.
- **Steps:**
  1. Open the side panel and click the "Computer Use" tab.
  2. Start a browser task on a page that declares WebMCP tools, then let the assistant run "Discover tools supplied by this website." and note the tool names listed.
  3. Change the page state (for example sign in, or open a different section) so the page declares a different set of tools, then start a new task or have the assistant discover again.
  4. Compare: the second discovery lists the tools present in the new page state, not the old ones.
