# Extension marketplaces: duplication map (Plugins / Skills / Connectors / Marketplace / Apps / Integrations)

Date: 2026-08-15
Repo: `agiworkforce` @ `compliance/dpdp`
Scope: `apps/web` (primary), with `apps/desktop` traced where the same component is shared

## Headline

There are 12 top-level web routes plus 3 `/features/*` marketing spurs that all talk about the
same idea (plugins/skills/connectors), but they resolve into only **two real front doors**:

1. **`/apps`** — the only entry in the sitewide header, footer, and every cross-link from other
   marketing pages. For a signed-in user it silently opens the settings modal on the **Plugins**
   tab, then bounces to `/chat`. This is what "browsing the marketplace" actually means in the
   live product today.
2. **`/connectors`** and **`/skills`** — same pattern, open the modal on their own tab.

Everything else (`/plugins`, `/marketplace`, `/ai-skills`, `/features/plugins`,
`/features/ai-skills`, `/connectors/mcp-directory`, `/connectors/new`, `/connectors/permissions`,
`/integrations`, `/skills/[name]`) is either (a) a thin redirect into one of the two front doors,
(b) a legitimate public/SEO page that is not the product, or (c) an **orphaned standalone page
that duplicates part of the modal's UI with its own, independently-drifted logic**.

The founder's instinct is right, but the actual defect isn't "too many routes" — Next.js
route-per-marketing-page is normal. The real defect is **two independently-coded
implementations of the same interactive feature (browse/connect/add/remove a connector or
plugin) that are not the same component**, and today's uncommitted diff (`git status`) is caught
in the act of manually re-propagating a UX fix from one copy to the other, and adding a brand-new
competitive-parity feature (JSON-paste MCP import) to the copy almost nobody sees.

---

## 1. Route inventory — what each one actually is

| Route                           | Type                           | What renders                                                                                                                                                                               | Reachable from                                                                                                                                                                                   | Verdict                                                                                                                                                                                                                                                                               |
| ------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/apps`                         | Deep-link shim                 | Signed in → `SettingsModalRedirect(section="plugins")`, opens modal, replaces URL with `/chat`. Signed out → `router.replace('/login?redirectTo=/apps')`.                                  | Header nav ("Apps & Connectors"), `MarketingFooter`, ~10 other marketing pages (`/business`, `/teams`, `/desktop`, `/use-cases/*`, `/partners`, `/agi-code`, `/features/tools`, `/integrations`) | **Live front door #1**                                                                                                                                                                                                                                                                |
| `/marketplace`                  | Redirect                       | `redirect('/apps')`, 5 lines                                                                                                                                                               | Not linked from anywhere; exists for legacy/typed-URL landing                                                                                                                                    | DELIBERATE thin alias                                                                                                                                                                                                                                                                 |
| `/skills`                       | Deep-link shim                 | Signed in → `SettingsModalRedirect(section="skills")`. Signed out → login redirect.                                                                                                        | `/features/page.tsx`, `sitemap.ts`, `SUPPORT_APP_ROUTE_PREFIXES`                                                                                                                                 | **Live front door #2**                                                                                                                                                                                                                                                                |
| `/skills/[name]`                | Standalone detail page         | Full hand-built skill detail view: metadata grid, Preview/Code tabs, fetches `/api/skills` + `/api/skills/:name` directly                                                                  | **Nothing links to it** — no row in the modal's `SkillsPanel` table, no `Link` anywhere in the repo                                                                                              | **UNREACHABLE / orphaned duplicate** — see §2.3                                                                                                                                                                                                                                       |
| `/connectors`                   | Hybrid                         | Signed in → `SettingsModalRedirect(section="connectors")`. Signed out or Clerk still loading → renders `ConnectorsPage` (1,531-line standalone component)                                  | Header nav (indirectly via `/apps`), `/features/tools` ("Browse Connectors"), `/docs` ("MCP Tools"/"Connectors"), `SUPPORT_APP_ROUTE_PREFIXES`                                                   | **Live front door #3 (signed-in) + parallel standalone impl (signed-out)** — see §2.1                                                                                                                                                                                                 |
| `/connectors/mcp-directory`     | Static marketing page          | Hand-picked list of 6 stdio MCP reference servers (filesystem, git, github, postgres, slack, memory), links out to GitHub + the official MCP registry                                      | `/connectors` has no link to it in the read code path shown, but it's in `sitemap.ts`; only inbound app link is its own "Back to Connectors"                                                     | DELIBERATE, narrow, honestly scoped (comment explicitly says "not a browsable registry")                                                                                                                                                                                              |
| `/connectors/new`               | Redirect                       | `redirect('/connectors')`, 5 lines                                                                                                                                                         | none                                                                                                                                                                                             | DELIBERATE thin alias                                                                                                                                                                                                                                                                 |
| `/connectors/permissions`       | Redirect                       | `redirect('/settings/capabilities')`, 5 lines                                                                                                                                              | none                                                                                                                                                                                             | DELIBERATE thin alias                                                                                                                                                                                                                                                                 |
| `/plugins`                      | Public catalogue (real data)   | Server component, `loadPluginCatalog()` against the hosted `plugin_registry_entries` table, renders every entry + waitlist CTA                                                             | `sitemap.ts`; `/plugins/[id]` links back here                                                                                                                                                    | DELIBERATE (public SEO/catalogue page, distinct purpose from the modal) but **never checks auth** — a signed-in user who types `/plugins` gets the marketing/waitlist page, not the modal, unlike `/apps`, `/skills`, `/connectors` which all redirect signed-in users into the modal |
| `/plugins/[id]`                 | Public detail page (real data) | `loadPluginEntry(id)`, install-status copy, `ConnectorChecklist`                                                                                                                           | `/plugins` list, and `WebSettingsModal.tsx:640` sets `detailsHref: /plugins/${plugin.id}` from inside the modal                                                                                  | DELIBERATE — genuinely cross-linked from both the public page and the authenticated modal                                                                                                                                                                                             |
| `/apps` (marketing content)     | N/A                            | Old marketing page was deleted; comment in `apps/page.tsx` claims "unauthenticated visitors see a public marketing fallback" but the code just `return null` and redirects to login        | —                                                                                                                                                                                                | **Stale comment** (see §2.4) — minor, not a duplication risk                                                                                                                                                                                                                          |
| `/integrations`                 | Public marketing page          | Static SEO page, "three patterns" (MCP plugins, native bridge, BYOK keys), CTA → `/apps`                                                                                                   | `docs`, own nav                                                                                                                                                                                  | DELIBERATE — this is the actual "public fallback" the `/apps` comment meant to describe                                                                                                                                                                                               |
| `/ai-skills`                    | Redirect                       | `redirect('/skills?tab=agents')`                                                                                                                                                           | none found                                                                                                                                                                                       | DELIBERATE alias, but `tab=agents` is a **dead query param** — `/skills`'s route component never reads a `tab` search param, so the query string is silently dropped                                                                                                                  |
| `/features/ai-skills`           | Redirect                       | `redirect('/skills')` (no query string)                                                                                                                                                    | none found                                                                                                                                                                                       | Same idea, different destination shape than `/ai-skills` — two redirect stubs for the same source concept landing on slightly different URLs (harmless today, but two places to update if `/skills` ever needs a real `tab` param)                                                    |
| `/features/plugins`             | Marketing page                 | Part of the consistent `/features/*` family (agents, ai-chat, artifacts, deep-research, memory, plugins, projects, tools). Copy: "Previewed on the agi CLI today, ahead of a marketplace." | `/features` hub page (`CapabilityGrid` "Extend" section)                                                                                                                                         | DELIBERATE (matches the site's own pattern of one `/features/X` page per capability) but see §2.5 for the narrative mismatch with `/plugins`                                                                                                                                          |
| SettingsModal `DirectoryBrowse` | Shared component               | One component (`packages/ui/ui/src/settings-modal/SettingsModal.tsx`), tabs Skills/Connectors/Plugins, reached from 3 "Browse" buttons (ConnectorsPanel, SkillsPanel, PluginsPanel)        | Modal only                                                                                                                                                                                       | **This is the good pattern** — genuinely one component reused 3 ways, not a duplicate                                                                                                                                                                                                 |

---

## 2. Duplication findings, with evidence

### 2.1 Two independently-built "browse/connect/add a connector" implementations (DRIFT — proven)

**What exists twice:**

- `apps/web/features/connectors/pages/ConnectorsPage.tsx` (1,531 lines) — the standalone page
  mounted at `/connectors` for signed-out visitors / the brief Clerk-loading window
  (`apps/web/app/connectors/page.tsx:14-37`).
- `ConnectorsPanel` + `AddCustomConnectorForm` inside
  `packages/ui/ui/src/settings-modal/SettingsModal.tsx` (functions at lines 1028 and 1239) — what
  every signed-in user actually sees, wired through
  `apps/web/features/settings/components/WebSettingsModal.tsx`.

Both read the **same** underlying catalogue (`CONNECTORS`/`CATEGORIES` from
`@/features/connectors/data/connectors`, imported at `ConnectorsPage.tsx:60-66` and
`WebSettingsModal.tsx:45,232`) — so the data model is correctly centralized. The bug is that the
**UI/interaction code (search, filters, dialogs, connect/disconnect, custom-connector form) is
written twice**, independently.

**Proof this has already drifted, not just "could" drift:**

1. **A security fix landed in one copy only.** The modal's `AddCustomConnectorForm`
   (`SettingsModal.tsx` ~line 1130) carries a deliberate, well-documented fix
   (`CONNECTOR-FORM-PASSWORD-AUTOFILL-01`): the bearer-token `<input>` uses
   `autoComplete="new-password"` plus `data-1p-ignore` / `data-lpignore` / `data-bwignore`,
   because a bare text field followed by a password field is exactly the shape browsers and
   password managers treat as a login form — Chrome/Safari/1Password/LastPass/Bitwarden would
   otherwise autofill the signed-in user's **account password** into "Bearer token" and transmit
   it to an arbitrary third-party MCP server on submit.

   `ConnectorsPage.tsx`'s equivalent field — the "Auth token (optional)" `<Input type="password">`
   inside `InspectMcpServerDialog` (`ConnectorsPage.tsx:335-341`) — has **none of these
   attributes**: no `autoComplete`, no `data-1p-ignore`, no `data-lpignore`, no `data-bwignore`.
   The exact vulnerability the other copy was hardened against is still present here.

   **Why it isn't live today:** the "Inspect MCP server" button that opens this dialog is gated
   `{isSignedIn && (...)}` (`ConnectorsPage.tsx:328`), and the only route that mounts
   `ConnectorsPage` (`apps/web/app/connectors/page.tsx`) redirects every signed-in user away
   before this component renders. So `isSignedIn` is never `true` at the moment `ConnectorsPage`
   is on screen — the vulnerable field is currently unreachable by construction, not because it
   was fixed. Loosen that routing gate, or mount `ConnectorsPage` from a second place, and the
   password-autofill bug goes live immediately with no code change to the vulnerable dialog
   itself.

2. **A destructive-action safety fix was NOT propagated, in either direction, inconsistently.**
   `ConnectorsPage.tsx` gates "Disconnect" behind a confirm `Dialog` with consequence copy (per
   its own in-file comment at line ~946: "the catalog connector's Disconnect button already goes
   through a confirm Dialog"). The modal's `ConnectorsPanel` does not: `handleDisconnect` calls
   `adapter.disconnectConnector` directly with zero confirmation
   (`useConnectorMutations`, `SettingsModal.tsx:392-395`, and its only caller
   `onDisconnect={() => handleDisconnect(detailConnector.id)}` at line 1339). Same destructive
   action, same modal file, no confirm step — while 700 lines later in the _same file_, removing
   a plugin got a brand-new confirm dialog added today (see §2.2). The confirm-before-destroy
   policy is applied inconsistently across copies of what is conceptually the same interaction.

3. **A new feature is being built into the copy real users don't see.** The working tree has
   uncommitted changes (`git status`) to `ConnectorsPage.tsx` (+391/-quite a bit) adding a
   "paste a raw MCP server config as JSON" import option to `InspectMcpServerDialog`
   (`parseCustomMcpJsonConfig`/`describeCustomMcpJsonImportError`, new file
   `apps/web/features/connectors/lib/custom-mcp-json-import.ts`, comment: _"Manus's 'Import MCP by
   JSON' (audit agentic-modes-gap-14)"_). This is a real competitive-parity feature. It is being
   added exclusively to `ConnectorsPage.tsx` — the component signed-in users never see. The
   modal's `AddCustomConnectorForm`, which is what actually adds a connector for a real user
   today, has zero references to `parseCustomMcpJsonConfig` or any JSON-paste affordance. If this
   ships as-is, the feature exists in the product's git history and test suite but not in the
   product a logged-in user can reach.

**Drift risk:** any fix to connect/disconnect behavior, error copy, OAuth handling, or the
custom-connector form has to be remembered and re-applied in two places by hand. It already
hasn't been, three separate times, in three separate directions (security fix missed one way,
confirm-dialog policy missed the other way, new feature built into the wrong copy).

**Recommendation:** Decide which is canonical (the modal is — it's what >99% of real usage hits)
and make `ConnectorsPage.tsx` either (a) render the same `ConnectorsPanel`/`DirectoryBrowse`
component in a logged-out-safe mode, or (b) be reduced to a narrow, genuinely-marketing "here's
what connecting looks like" preview with the interactive/destructive machinery removed, so there
is only one place that can add, connect, disconnect, or inspect a connector. Do not delete
`ConnectorsPage.tsx` outright without first checking whether any test or a mobile/CLI web-view
depends on it (only `apps/web/app/connectors/page.tsx` imports it today per grep, so the blast
radius looks contained, but confirm before removing).

### 2.2 The plugin "remove" confirm dialog is copy-pasted twice inside one file, itself copied from a third file (DRIFT — caught live)

`packages/ui/ui/src/settings-modal/SettingsModal.tsx` has the **same** confirm-before-destructive
Dialog implemented **twice** in today's uncommitted diff:

- Inside `DirectoryBrowse`'s plugin tab (new `confirmingRemovePlugin` state at line ~482, Dialog
  JSX at lines ~974-1006).
- Inside `PluginsPanel`'s table view (new `confirmingRemovePlugin` state at line ~1749, near-
  identical Dialog JSX at lines ~2014-2046).

Both blocks carry the identical comment: _"CPS-03: confirm before the destructive removePlugin
call, mirroring apps/web ConnectorsPage's Disconnect/Remove-custom-connector Dialogs."_ — i.e.
this is a **third** hand-copy of a pattern whose original is `ConnectorsPage.tsx`. The dialog
title ("Remove plugin?"), description, and button markup are byte-for-byte the same between the
two in-file copies.

**Drift risk:** this is the mechanism, caught mid-flight, that produced finding 2.1(2) above — the
same safety policy has to be manually re-typed at every render site instead of living in one
place, and it visibly has NOT been applied to the connector-disconnect flow sitting in the same
file.

**Recommendation:** Extract one `ConfirmRemoveDialog` (or a generic `useConfirm()` pattern) inside
`settings-modal/`, use it from `DirectoryBrowse`, `PluginsPanel`, and `ConnectorsPanel`'s
disconnect action alike. Trivial refactor, removes the largest live drift source in this file.

### 2.3 `/skills/[name]` — an orphaned standalone detail page with a hand-copied, already-diverged label map (UNREACHABLE + DRIFT)

`apps/web/app/skills/[name]/page.tsx` is a full, independent implementation of a skill detail
view (metadata grid, Preview/Code tabs, `MarkdownContent` render) that fetches
`/api/skills` and `/api/skills/:name` directly with `useEffect`/`fetch`.

**It is unreachable in the live product.** Grepping the entire repo for any link that could reach
it (`` `/skills/${...}` ``, `router.push` to a skill name, a per-row `Link` in the modal's
`SkillsPanel` table) returns nothing. The modal's `SkillsPanel` (`SettingsModal.tsx:1589-1732`)
renders skills as plain `<tr>` rows with no navigation — clicking a skill does nothing, let alone
navigate here. `sitemap.ts` explicitly excludes it as a "dynamic detail route without published
content." The only inbound links in the file are its own "Back to Skills" buttons.

**It has already drifted from its stated source.** The page's own comment says its category-label
function `skillSourceLabel` (`page.tsx:19-25`) _"mirrors DirectoryModal helper"_ — but no
component named `DirectoryModal` exists anywhere in the repo (it was renamed to `DirectoryBrowse`;
confirmed by grep — the only two hits for the string `DirectoryModal` in the whole codebase are
this stale comment and one other stale comment in `use-connectors.ts`). Comparing the two label
functions on the identical `source` field:

| `source` value          | `SettingsModal.tsx` `skillAuthorLabel`   | `skills/[name]/page.tsx` `skillSourceLabel` |
| ----------------------- | ---------------------------------------- | ------------------------------------------- |
| `bundled`               | "AGI"                                    | "Built-in"                                  |
| `managed-local`         | "Managed"                                | "Built-in"                                  |
| `personal`              | "You"                                    | "Personal"                                  |
| `project` / `workspace` | "You"                                    | "Project"                                   |
| `plugin` / `mcp`        | _(falls through to raw `source` string)_ | "Plugin"                                    |

Four of five buckets disagree. The exact same skill, looked up by the exact same `source` field
from the exact same API, is labeled differently depending on which of the two duplicate UIs
happens to render it.

**Recommendation:** Since nothing links here, either (a) delete the route (it's dead weight and a
second place bugs can hide), or (b) if a skill detail page is wanted, wire it as the destination
of a click on a `SkillsPanel`/`DirectoryBrowse` row and delete the hand-copied label function in
favor of importing (or re-exporting) `skillAuthorLabel`. Don't leave it live and orphaned — it's
exactly the kind of "duplicate control nobody notices diverged" the repo's own failure-taxonomy
rules warn about.

### 2.4 `/apps` doc comment vs actual behavior (minor — not a duplication, but a false claim)

`apps/page.tsx`'s header comment says: _"Unauthenticated visitors see a public marketing
fallback."_ The code (`apps/page.tsx:24`, confirmed by `apps/page.test.tsx:67-74`) does no such
thing — it renders `null` while Clerk loads and then `router.replace('/login?redirectTo=/apps')`
for a confirmed signed-out visitor. The actual public fallback for the "Apps & Connectors" concept
is a _different_ route, `/integrations`, which the same test file's second test explicitly checks
`/apps` never redirects back into (to avoid a `/integrations → /apps → /integrations` loop). Not a
duplication risk, but worth a one-line comment fix so the next person doesn't go looking for
fallback markup that isn't there.

### 2.5 `/features/plugins` vs `/plugins` — same day, two different "is this real" claims (narrative risk, not code duplication)

Both pages are legitimate and serve different audiences (a `/features/*` conceptual marketing
page vs a real hosted-catalogue product page — the same pattern the site uses for every other
capability). But they are not cross-linked to each other at all, and their copy tells two
different stories about the same launch state on the same day:

- `/features/plugins`: _"Previewed on the agi CLI today, ahead of a marketplace"_ — frames plugins
  as CLI-only, marketplace not yet open.
- `/plugins`: renders a live, hosted **Web** registry (`loadPluginCatalog()`) with entries whose
  status can be `Available on Web`/`Installable`, and its lede says _"The catalogue below is the
  live hosted registry."_

A visitor who lands on `/features/plugins` from search or the `/features` hub is told plugins are
CLI-only; a visitor who lands on `/plugins` sees a Web-installable registry (if any entry reaches
that status). Neither page links to the other, so nothing forces them to be checked together.
**Recommendation:** cross-link them (`/features/plugins` → "browse the live catalogue" →
`/plugins`) so a status change in one is naturally discovered from the other, and make
`/features/plugins`'s framing conditional on (or simply defer to) the real catalogue state instead
of a hardcoded "CLI preview" claim.

### 2.6 `/ai-skills` vs `/features/ai-skills` — two redirect stubs, two destinations (trivial, but worth a note)

`apps/web/app/ai-skills/page.tsx` → `redirect('/skills?tab=agents')`.
`apps/web/app/features/ai-skills/page.tsx` → `redirect('/skills')`.

Both are meant to converge on the same canonical `/skills` destination (per the comment in each:
_"redirects to the unified Skills Library per D4 unification"_), but one carries a `tab=agents`
query string the other doesn't, and `/skills`'s route component
(`apps/web/app/skills/page.tsx:14-27`) never reads any `tab` search param — it always opens
`section="skills"` with no sub-tab. The query string is a dead parameter today, not a bug, but
it's a second place to remember if a "Skills vs Agent-Skills" sub-tab is ever actually built.

---

## 3. What a user actually encounters

- **From the marketing site nav (Header "Products" dropdown, footer):** one link — "Apps &
  Connectors" → `/apps`. Nothing in global nav points at `/plugins`, `/skills`, `/connectors`,
  `/marketplace`, `/integrations`, or `/ai-skills` directly.
- **Signed in, clicking that link:** the settings modal opens on Plugins, URL becomes `/chat`. Same
  destination whether they typed `/apps`, `/skills`, or `/connectors` — only the starting tab
  differs (`WebSettingsModal.tsx:272-274` maps `/connectors*` → connectors tab, `/skills*` →
  skills tab, `/apps*` → plugins tab; **note `/plugins*` is absent from that map**, consistent
  with `/plugins` never routing into the modal at all).
- **Signed out, typing `/connectors` directly:** gets the full 1,531-line standalone
  `ConnectorsPage` — a real, mostly-dead-for-its-actual-audience implementation with `isSignedIn`
  gates sprinkled throughout that can never be true while it's on screen (see §2.1).
- **Signed out, typing `/plugins`:** gets the honest "registry exists, nothing installable yet,
  join the waitlist" catalogue page — this one works as designed for both signed-in and signed-out
  visitors (it never redirects into the modal at all, by design, since installation there is a
  waitlist funnel, not a lifecycle UI).
- **Anyone typing `/skills/some-skill-name`:** gets a fully rendered, plausible-looking detail page
  that no button, link, or search result in the product will ever send them to, and whose labels
  for "who added this skill" disagree with the labels shown in the modal for the same skill.

## 4. What to collapse (priority order)

1. **Fix the connector-form drift now, before the JSON-import feature ships** (§2.1). At minimum:
   port `CONNECTOR-FORM-PASSWORD-AUTOFILL-01`'s `autoComplete`/`data-*` attributes onto
   `ConnectorsPage.tsx`'s `InspectMcpServerDialog` token field, and decide whether the new
   JSON-paste importer belongs in the modal's `AddCustomConnectorForm` instead of (or in addition
   to) `ConnectorsPage.tsx`. Whichever surface stays, make disconnect-confirmation consistent
   between `ConnectorsPanel` and `ConnectorsPage`.
2. **Extract the confirm-destructive-action dialog** used by plugin-remove (now duplicated twice
   in one file) and connector-disconnect (missing in the modal, present in the standalone page)
   into one shared piece (§2.2).
3. **Delete or wire up `/skills/[name]`** (§2.3) — it's unreachable, and its category-label logic
   has already silently diverged from the component it claims to mirror.
4. **Cross-link `/features/plugins` ↔ `/plugins`** so the "is this real yet" story can't
   contradict itself across two pages that never reference each other (§2.5).
5. Leave `/marketplace`, `/connectors/new`, `/connectors/permissions`, `/ai-skills` alone — they
   are correctly implemented as thin redirects with zero duplicated logic. Only fix the
   `tab=agents` dead query string in `/ai-skills` if a real sub-tab is ever built (§2.6).
6. Leave `/connectors/mcp-directory` and `/integrations` alone — narrowly scoped, honestly worded,
   genuinely different content from the product surfaces (§1).

## 5. What would settle the remaining UNCLEAR

- **Desktop's `apps/desktop/src/features/skill-marketplace/SkillMarketplace.tsx`** (imported by
  `apps/desktop/src/features/settings/tabs/Skills/index.tsx` and `.../Capabilities/index.tsx`) is
  a third, Desktop-only, independently-built skill-browsing UI, separate from the shared
  `SkillsPanel`/`DirectoryBrowse` that Desktop also uses via `DesktopCloudSettingsModal.tsx`
  (`@agiworkforce/ui`). This is plausibly DELIBERATE — Local, BYOK, and Managed Cloud are called
  out as separate trust boundaries in this repo's own `CLAUDE.md`, and `SkillMarketplace.tsx`
  reads local filesystem skills via Tauri commands while `DirectoryBrowse` reads the hosted
  Managed Cloud skill list — but I did not do a full line-by-line comparison of
  `SkillMarketplace.tsx` against `DirectoryBrowse`'s skills tab the way I did for the connector
  forms above, so I'm not asserting drift there, only flagging it as the same _shape_ of risk
  (two independently-coded browsers for conceptually the same feature) and out of scope for this
  web-focused pass. Settling it would mean diffing `SkillMarketplace.tsx`'s card/search/filter
  code against `DirectoryBrowse`'s skills tab the same way §2.1 diffs the two connector forms.
