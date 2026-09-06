# Plugin directory

Status: Current
Owner: Repository maintainers
Last updated: 2026-09-06

How the plugin directory behind `GET /api/plugins` is built, refreshed and
installed from, and what each source contributes. The code lives under
`apps/web/features/plugins/server/directory/`.

## Sources and facets

| facet         | where it comes from                                                                                          | verified when                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `builtin`     | `public.plugin_registry_entries`, read live on every request                                                 | the publisher is first-party                                              |
| `marketplace` | the official Claude Code marketplace manifest, plus public listings that carry a Claude Code install command | listed in the official manifest, or the public "Anthropic verified" badge |
| `partner`     | public directory listings with no Claude Code install command (Cowork-only packs)                            | the public "Anthropic verified" badge                                     |

The official manifest is
`https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json`.
The public listing is `https://claude.com/plugins`, paged through the
`<token>_page` query parameter the first page advertises. The listing supplies
install counts, the verified badge, the works-with labels and the cards for
plugins that are not in any manifest. Merge order is built-in, official
marketplace, further marketplaces named in `DIRECTORY_MARKETPLACES`, then
public-only listings; an entry is dropped when its id or its source repository
plus path was already taken by an earlier layer.

`createdAt` on a non-builtin entry is the time the directory first saw it, kept
across runs in the sync state, not a publish date the sources do not expose.

The publisher of a non-builtin entry is the manifest author when one is named
(`kind: "partner"`, or `third-party` when the author is the marketplace owner),
else the GitHub organisation that hosts the plugin, else `Partner` for plugins
under the marketplace's `external_plugins` folder and for public-only listings.
Descriptions and runtime notes pass through the same copy substitution the
connector vendor directory uses: assistant brand names become "the assistant"
and dashes become commas. No user-facing field names the source directory, and
`homepageUrl` is only ever a vendor or repository link.

## Inspection

Every manifest plugin resolves to a GitHub repository, ref or sha, and path.
The ingest fetches the repository tree once per repository and classifies it:
`skills/<name>/SKILL.md` files, `commands/*.md`, `agents/*.md`,
`hooks/hooks.json`, `.mcp.json` and `.claude-plugin/plugin.json`. The result is
cached for thirty days under the repository, ref or sha, and path, so a run
only inspects plugins that are new or re-pinned.

A plugin is web-installable when it was inspected, ships at least one skill,
and declares no hooks, no language server and no stdio MCP server. Anything
else carries a one-sentence `runtime.note` naming the reason and pointing at
the desktop app or the CLI, and the response includes `installCommand`.

Unauthenticated GitHub API calls are capped at 40 per run; set `GITHUB_TOKEN`
on the deployment to inspect the whole manifest in one run. A token GitHub
rejects is dropped for the rest of the run with a warning, and the run
continues at the unauthenticated cap. Plugins that live inside the marketplace
repository share one tree fetch and are inspected first, so they never count
against the cap individually. Without a token the directory fills over
successive daily runs and `inspectionsPending` in the summary says how many
are left.

## Refresh

- Cron: `/api/cron/refresh-plugin-directory`, scheduled in `vercel.json`,
  eight hundred second budget split across the manifests, the public listing
  and the inspections. `?mode=rebuild` discards the sync state and the
  inspection cache first.
- Operator: `POST /api/operator` with `{ "action": "refresh-plugin-directory" }`
  and an optional `"mode": "rebuild"`, platform admins only.

Both return the ingest summary: plugins per source, cards matched to manifest
entries, inspections run, cached, failed and pending, duplicates dropped,
counts of verified, installable and install-counted entries, and the total.

The snapshot, the sync state, the inspection cache and the ingest lease live in
`public.mcp_response_cache` under `plugins.directory.*` keys, the same store
the connector directory uses with its own keys. A per-process memory cache
keyed on the snapshot stamp serves reads.

## Query

`GET /api/plugins` accepts `search`, `verified`, `worksWith`
(`claude-code`, `cowork`, `web`), `source` (`builtin`, `partner`,
`marketplace`), `category`, `status`, `sort` (`installs` by default, or
`name`), `limit` (at most 100) and `cursor`. It returns
`{ entries, total, nextCursor, stats }` where `stats` carries
`totalPlugins`, `verified`, `bySource` and `byWorksWith` for the whole
directory, not the filtered page. Every registry entry field is still present
on each entry; the directory adds `slug`, `sourceFacet`, `verified`,
`installs`, `worksWith`, `repositoryUrl`, `marketplace`, `installCommand`,
`runtime` and `sourceLocation`.

`GET /api/plugins/<id>` answers from the registry first and then from the
directory snapshot, with a null manifest for directory entries.

## Install

`POST /api/plugins/marketplace-installations` with `{ "pluginId": "<id>" }`
installs a web-installable directory plugin for the signed-in account:

1. The plugin's `SKILL.md` files are fetched from GitHub at the pinned sha, at
   most fifty, and stored under `plugins.directory.installed-skills` keyed by
   marketplace repository, plugin key and sha.
2. A per-user row in `plugin_marketplace_sources` shadows the marketplace, a
   `plugin_marketplace_entries` row shadows the plugin with the sha in its
   version build metadata, and a `plugin_marketplace_installations` row records
   the install with every fetched skill enabled.
3. The response is `{ installation, skills }`; `installation.pluginKey` is the
   directory id.

Shadow sources and entries are hidden from `GET /api/plugins/marketplaces` and
its `entries` route so the account's own registered marketplaces stay separate.
`DELETE /api/plugins/marketplace-installations/<installationId>` removes the
installation and prunes the shadow entry and source when nothing else uses
them.

Installed skills reach the composer through the same points the built-in
packs use: `GET /api/skills` lists them with `source: "extra"`, an explicit
`skill_name` on a chat request resolves them after the managed catalog and the
account's own skills, and the skill tool loads them on `skill_not_found`.

Blocked installs answer 409 with the runtime note and the CLI install command.
While migration 0159 is not applied the routes answer 503 with
"Plugin installs are not enabled on this deployment yet".
