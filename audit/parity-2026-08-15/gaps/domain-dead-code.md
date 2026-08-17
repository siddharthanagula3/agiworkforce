# Dead + Disconnected Code and Reliability — Domain Audit

Audited at commit `e15df56e3`, working tree clean, branch `compliance/dpdp`.
Method: read every brief-supplied lead's source inventory doc, then opened the
actual files to confirm or refute each claim; ran `knip` (already configured
for `apps/web`, `apps/desktop`, `packages/*`, `packages/ui/*` via `knip.json`)
and cross-verified its highest-signal findings by hand; grepped repo-wide for
every "zero callers" claim rather than trusting inventory prose; checked
`docs/agent-context/known-flaws.md` and `audit/ui-gaps.csv` for prior art
before filing anything new.

This domain has no prior-art coverage — `prior-art-reconciliation.md` states
directly that the existing 341-row tracker has "no dead/disconnected-code
category... nothing mocked, orphaned, unreachable, or half-wired can be
filed." Every finding below is therefore new to the tracked ledger, with the
exception of items explicitly marked as re-verifications of already-known
leads.

## Headline

The brief's list of "leads already verified by earlier phases" holds up
well — 8 of 9 lead clusters confirmed as described. **One does not**: the
`/qa-artifacts` and `/dev/inline-toolcall-demo` finding is corrected below —
these are not a live production defect, they are a well-engineered, tested
kill-switch. Beyond the supplied leads, this pass found a **second, larger
body of dead desktop UI** (roughly 180 files across ~30 feature directories,
distinct from and additional to the already-known 204-file `archive/`), a
**legacy `apps/web/shared/` tree** (~100+ files) carrying vocabulary from an
earlier "AI employee marketplace" product framing, and — the single most
consequential single finding — a **`known-flaws.md` ledger entry that is
itself stale**, incorrectly telling future maintainers a dead desktop feature
is "kept" because it's consumed by a file that was deleted two days after the
note was written.

23 gaps filed. 3 P1, 17 P2, 3 P3 — no P0s: nothing found here breaks a
primary workflow or blocks a demo. That is itself worth stating plainly: this
codebase's dead code is mostly _inert_, not _actively harmful_ — with one
functional exception (the unscheduled seat-expiry cron, DEAD-CODE-005).

---

## 1. The supplied leads, verified

| #   | Lead                                                                                                                                                  | Verdict                                                     | Where                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| 1   | Desktop: `hooks_*` (12), `background_agent_*` control (11), ~1,777 lines of Discord/Signal/Telegram/WhatsApp messaging, full `gmail_oauth_*` flow     | **CONFIRMED**, all dead as described                        | DEAD-CODE-012, DEAD-CODE-013                              |
| 2   | Desktop: `settings_v2_*` and conversation `checkpoint_*` — two superseded-but-undeleted parallel systems                                              | **CONFIRMED**                                               | DEAD-CODE-014                                             |
| 3   | Electron: shortcut customization built but `saveSettings()`/`refreshTrayMenu()` never called; 9 IPC channels inert by default; stale tsconfig exclude | **CONFIRMED**                                               | DEAD-CODE-015                                             |
| 4   | Mobile: `edge-cases/components/` (9/10 dead), no sensor trigger                                                                                       | **CONFIRMED**                                               | DEAD-CODE-016                                             |
| 5   | Mobile: `features/sidebar/**` superseded by `features/drawer/`                                                                                        | **CONFIRMED**                                               | DEAD-CODE-017                                             |
| 6   | Mobile: `widget-setup.tsx` no nav entry                                                                                                               | **CONFIRMED**                                               | DEAD-CODE-018                                             |
| 7   | Web: `/qa-artifacts` + `/dev/inline-toolcall-demo` ship in the route tree                                                                             | **PARTIALLY WRONG — corrected below**                       | DEAD-CODE-011                                             |
| 8   | Web: 3 duplicate sign-in + 3 duplicate sign-up routes                                                                                                 | **NOT A DEFECT — see §3**                                   | (not filed)                                               |
| 9   | Web: 3 orphaned legacy-alias usage/billing routes                                                                                                     | **CONFIRMED**                                               | DEAD-CODE-010                                             |
| 10  | Web: 13 retired-410 route families                                                                                                                    | **CONFIRMED, and it's good design — see §3**                | (not filed as a defect; DB tables filed as DEAD-CODE-006) |
| 11  | Backend: 9 legacy DB tables (GDPR erasure sweep only), 2 fully dead tables, unapplied founder-gated migration                                         | **CONFIRMED**                                               | DEAD-CODE-006                                             |
| 12  | Backend: cron route with no `vercel.json` entry                                                                                                       | **CONFIRMED, and it's a real bug** — not just orphaned code | DEAD-CODE-005                                             |
| 13  | `apps/desktop/archive/` (204 files)                                                                                                                   | **CONFIRMED dead, correctly isolated**                      | DEAD-CODE-022                                             |
| 14  | `wiring-allowlist.json` (~58 self-admitted commands)                                                                                                  | **CONFIRMED, sound self-governing mechanism**               | DEAD-CODE-023                                             |

### Correction — `/qa-artifacts` and `/dev/inline-toolcall-demo` (lead #7)

The brief frames these as shipping, reachable, unauthenticated harnesses.
Reading the actual guard code shows a materially different picture:

- `apps/web/app/qa-artifacts/layout.tsx` and `apps/web/app/dev/layout.tsx`
  both call Next.js `notFound()` whenever `process.env.NODE_ENV ===
'production'`. `next build` always sets `NODE_ENV=production`, so this
  holds on **every** Vercel deployment tier (preview included), not just the
  production domain.
- Both paths are additionally listed in `DISALLOW_APP`
  (`apps/web/lib/seo/site.ts:68-82`), so they're never crawlable even in the
  window before the env guard would apply.
- `apps/web/app/qa-artifacts/` is listed in the repo root `.gitignore:252`
  and `git ls-files` confirms it is **completely untracked** — it cannot
  reach a git-based deploy at all. It exists in this working tree only as
  local scratch.
- `apps/web/app/dev/inline-toolcall-demo/page.tsx` **is** git-tracked, and
  does contain the literal string `~/Desktop/reference/ui/desktop/
claude-artifacts/...` cited by the brief — but that string only ever
  renders when `NODE_ENV !== 'production'`, i.e. never in a real deployment.

`web-route-sweep-findings.md`'s 200-status observations for these routes came
from a local `next dev` server, where `NODE_ENV=development` and the guard is
intentionally inactive by design — that is not evidence of a production leak.

**Verdict:** DOCUMENT-AS-INTENTIONAL for the guard itself (do not remove it —
it is a genuinely well-engineered, three-layer kill-switch: env check +
gitignore + robots disallow). The only real residual item is cosmetic: a
tracked source file permanently embeds one person's local directory path,
which is unnecessary even in dev-only code. Filed at P3 (DEAD-CODE-011).

---

## 2. New findings beyond the supplied leads

### 2.1 A `known-flaws.md` entry is itself stale, and is actively blocking cleanup (DEAD-CODE-001, P1)

The most interesting finding in this pass. `known-flaws.md:533-535`, dated
2026-08-05, reads:

> "NOT orphans (verifier flag corrected by main-loop check):
> `features/teams/{TeamActivityLog,TeamInvitation,TeamMemberList,TeamSettings}`
> are consumed by the quarantined `experimental/TeamDashboard.tsx` — kept."

`git log --diff-filter=D --summary` shows `apps/desktop/src/features/
experimental/TeamDashboard.tsx` was deleted in commit `4354d3d8b` ("feat:
land the in-flight web, desktop and packages work") on **2026-08-07 —
two days after the ledger entry was written** — and that commit is an
ancestor of HEAD. At current HEAD:

```
$ find . -iname "TeamDashboard*"
(nothing)
$ grep -rn "TeamActivityLog" --include="*.tsx" --include="*.ts" .
apps/desktop/src/features/teams/TeamActivityLog.tsx:5   ← only its own definition
apps/desktop/src/features/teams/TeamActivityLog.tsx:9
```

All four components, plus `features/settings/TeamAccountSettings.tsx`
(confirmed never referenced by the real `SettingsPanel.tsx`, only by a test's
own `vi.mock`), plus `stores/teamStore.ts` and `api/teamsApi.ts`, are fully
orphaned today. `desktop-electron.md` independently found the corroborating
half of this: `tsconfig.json` still excludes `src/features/experimental`,
which "does not exist" — the same directory this ledger entry cites as the
live consumer.

This matters beyond the 8 dead files themselves: CLAUDE.md mandates reading
`known-flaws.md` before touching a surface, specifically so agents don't
re-litigate settled decisions. Here the ledger's "settled decision" is wrong
as of two days after it was written, and nothing caught the drift. It is the
same failure class as the `done-claim-verification.md` findings on
`ui-gaps.csv` — a tracking artifact that removes an item from the queue by
asserting something false — just in a different ledger.

The cross-surface correlation strengthens the case for deletion: the
backend's own `teams`/`team_members` tables are independently confirmed dead
(DEAD-CODE-006) and sit behind a written-but-founder-gated drop migration
(`0058_drop_legacy_teams.sql`, superseded by `organizations`/
`organization_members`). Both the backend concept and its desktop UI are
dead for the same reason, on the same timeline.

### 2.2 A second, larger dead-code body inside `apps/desktop/src/features/` (DEAD-CODE-002, P1)

`apps/desktop/archive/` (204 files) is already well-documented and correctly
isolated — excluded from `tsconfig`/Vite, zero live imports. This pass found
a **second, larger** body that is _not_ archived — it still compiles into
the live `src/` tree:

`knip` (configured for this exact workspace, entry point `src/main.tsx`)
reports 748 unused files repo-wide; 183 of them sit under
`apps/desktop/src/features/`. This is not directory-level noise — knip
correctly leaves live files (`SettingsPanel.tsx`, `ArtifactPanel.tsx`)
unflagged inside otherwise-mixed directories, which was verified by spot
check before trusting the aggregate number. Grouped by top-level directory,
the largest dead trees are:

| Directory                | Files | What it is                                                |
| ------------------------ | ----: | --------------------------------------------------------- |
| `roi-dashboard/`         |    11 | Full ROI/cost-savings dashboard, charts, milestone toasts |
| `canvas/`                |     7 | Canvas workspace, code editor panel                       |
| `file-upload/`           |     7 | Drop zone, preview modal, download button                 |
| `editing/`               |     5 | Diff viewer, conflict resolver, change summary            |
| `memory/` (UI)           |     5 | Memory browser modal, viewer, importance indicator        |
| `reminders/`             |     4 | Reminder card/dialog/list                                 |
| `analytics/`             |     4 | Cost dashboard, usage dashboard                           |
| `messaging/` (UI)        |     4 | Message composer                                          |
| `teams/`                 |     4 | See §2.1                                                  |
| `workflows/`             |     3 | `AutomationBuilder.tsx`, workflow panel/builder           |
| `background-tasks/` (UI) |     3 | Background task indicator/panel                           |
| `outcomes/`              |     3 | Goal outcomes, outcomes dashboard                         |
| `notifications/`         |     2 | `NotificationCenter.tsx`                                  |

Cross-checked against the real mount surface (`App.tsx`'s actual
`lazy(() => import(...))` list): it lazy-loads exactly 16 feature paths
(overlay, floating-chat, RecorderHud, the v3 shell, SearchModal,
CommandPalette, quick-query, VoiceInputOverlay, onboarding, AuthPage,
SettingsPanel + 2 settings dialogs, updates, TimeoutWarningDialog,
status-banner, offline-indicator, ErrorToast) — none of the ~30 directories
above appear in it.

Several of these map directly onto real parity gaps other domains in this
audit already flag as missing (an in-app notification center, a usage/cost
dashboard) — meaning the desktop surface has already built the feature and
simply never wired it in, which is a materially different — and cheaper to
close — situation than "not built."

### 2.3 A superseded parallel MCP management UI, same directory as the live one (DEAD-CODE-003, P2)

`apps/desktop/src/features/mcp/MCPWorkspace.tsx` is the live MCP settings
surface, lazy-imported by exact file path from `Connectors/index.tsx:23`,
and itself imports `MCPServerCard`, `MCPToolBrowser`, `MCPCredentialManager`,
`MCPConfigEditor`, `MCPBundleBrowser`. In the same directory,
`MCPServerManager.tsx` (598 lines), `MCPServerBrowser.tsx` (318),
`MCPToolExplorer.tsx` (435), `MCPLogsViewer.tsx` (132), and
`MCPConnectionStatus.tsx` (508) — ~1,991 lines total — form a second,
disjoint management UI, exported from a barrel (`index.tsx`) that nothing
outside the directory imports either. Confirmed by reading `MCPWorkspace.tsx`'s
import list directly and grepping for each superseded component name.

### 2.4 The typed `api/*.ts` wrapper layer is largely bypassed (DEAD-CODE-004, P2)

`desktop-tauri.md` cites `apps/desktop/src/api/undo.ts:174,184` as evidence
the `coding_checkpoint_*` Tauri commands are live. Reading the actual caller,
`codingCheckpointStore.ts`, shows it imports `invoke` directly from
`lib/tauri-mock` (line 21) and calls the command by string literal — it never
imports `api/undo.ts` at all. The command is genuinely live; the typed
wrapper module built to front it is not. `knip` confirms this pattern
repeats across ~20 files in `apps/desktop/src/api/` (`chat.ts`, `terminal.ts`,
`workflow.ts`, `automation.ts`, and more) — an architectural fork where some
call sites go through the typed layer and others bypass it with raw
`invoke()` calls, leaving the typed layer's own files unreachable by static
analysis.

### 2.5 A legacy `apps/web/shared/` tree, ~100+ files, carrying an earlier product's vocabulary (DEAD-CODE-007, P2)

`knip` flags ~130 files under `apps/web/shared/` and `apps/web/features/` as
unused. Spot-verified zero importers for `shared/ui/sidebar.tsx`,
`shared/ui/chat-bubble.tsx`, `shared/lib/api.ts`, `shared/types/index.ts`,
`shared/stores/index.ts` across every plausible consumer directory. Only 6
files anywhere in the live app import anything from `@/shared/`, and those 6
are themselves either part of the already-dead v3/`UnifiedChatPage` cascade
(§2.6) or pull one narrow utility from an otherwise-live file.

Worth flagging beyond the raw dead-file count: `shared/types/store-types.ts`
and `shared/types/index.ts` define types like `AIEmployee`,
`MarketplaceEmployee`, `AIEmployeePerformance` — vocabulary from what reads
as an earlier "AI employee marketplace" product framing this repo has since
moved to a unified-chat-workspace positioning. That's independent evidence
this tree predates the current architecture, not just unused code. The last
commit to touch `shared/types/index.ts` is titled "refactor(web): close
unmounted surface sweep" (2026-07-29) — a prior cleanup pass already worked
this area and didn't finish it.

### 2.6 The chat-export feature and its wider dead cascade (DEAD-CODE-009, P2)

`web-frontend.md` already found `EnhancedExportDialog.tsx` — a complete
multi-format (Markdown/PDF/DOCX) export dialog — built, barrel-exported, and
totally unreachable (its own barrel has zero importers). `knip` widens the
confirmed blast radius to ~30 files: the same `features/chat/v3` /
`UnifiedChatPage` cascade that web-frontend.md already flagged as "parked
convergence work" turns out to include `Main/ChatHeader.tsx`,
`Main/ChatTopBar.tsx`, the entire `Sidebar/` and `Tools/` and `workflows/`
subdirectories, `use-export-conversation.ts`, `use-unified-adapter.ts`,
`useHelpTour.ts`, `conversation-export.ts`, and `document-export.ts` — this
is the same dead-code island web-frontend.md already identified, now
quantified rather than newly discovered. The practical upshot doesn't
change: a materially complete conversation-export feature (a real parity
item against ChatGPT web's export action) exists and reaches no user.

---

## 3. What NOT to copy / not filed as gaps

- **3 sign-in routes (`/login`, `/sign-in`, `/auth/login`) and 3 sign-up
  routes (`/signup`, `/sign-up`, `/register`)** — the brief's lead framed
  this as duplication. Reading each file directly shows `/login` and
  `/signup` are the only real Clerk-backed implementations; `/sign-in`,
  `/sign-up`, `/register`, `/auth/login` are all one-line `redirect()`
  aliases with documented reasons (`/sign-in`'s comment explains the desktop
  app's cloud-auth handoff and Clerk's own `/sign-in` path convention
  specifically target this URL). This is **not** dead or duplicated code —
  it's a legitimate, working alias pattern serving real external callers.
  Not filed. (The _IA_ question of whether 3 URLs answering "sign in" is
  good UX is a separate, valid concern for a navigation/IA domain — but it
  is not a dead-code defect.)
- **The 13 retired-410 route families** (`/api/agents/*` and siblings) —
  these correctly return `410 Gone` with a `completion_url` pointer to the
  canonical endpoint, via a single shared handler
  (`retired-managed-execution.ts`). This is _good_ API design for a
  deliberately retired subsystem, not something to delete or "fix." Only the
  DB tables they left behind (DEAD-CODE-006) are filed.
- **The Local/BYOK/Managed-Cloud trust boundary, the Electron IPC bridge's
  security posture, the Chrome extension's message-policy layer, and the
  MCP slopsquatting allowlist's _intended_ design** — all independently
  re-confirmed as sound by the source inventory docs during this pass. Not
  re-litigated here; see §5 for what's genuinely strong.

---

## 4. `knip` reconciliation

`knip.json` scopes `apps/web`, `apps/desktop`, `packages/*`, and
`packages/ui/*` with real entry points (`src/main.tsx`,
`app/**/{page,layout,...}.tsx`, `src/index.ts`). It does **not** configure
`apps/mobile`, `apps/extension`, or `apps/extension-vscode` — running it
anyway threw config errors for two of those (`playwright.config.ts` loaded
twice, `metro.config.js` missing `tailwind.config`), and its "unused file"
hits for those three surfaces (`apps/extension/src/background.ts` flagged as
unused, for instance — a Chrome extension background script that is
obviously loaded via `manifest.json`, which knip has no visibility into) are
**not trustworthy** and were excluded from this report entirely. This
matches `prior-art-reconciliation.md`'s independent finding that the Chrome
extension is one of the strongest surfaces in the repo (1,549/1,549 tests,
zero `TODO`s) — the raw knip noise for that surface would have suggested
otherwise if taken at face value.

For the three properly-configured workspaces, knip's "Unused files" output
was the primary lead for DEAD-CODE-002, 003, 004, and 007 above — each
cross-verified by hand (grep for every import path, and for DEAD-CODE-004,
reading the actual caller to see it bypasses the flagged file). knip's
"Unused dependencies" section independently corroborated the already-known
`@agiworkforce/browser-tool` finding (DEAD-CODE-019): it lists exactly that
package as unused in `apps/extension/package.json`, matching
`shared-packages.md`'s finding verbatim. "Duplicate exports" (117 hits,
mostly `ComponentName` + `default` re-exports) and most of "Unused exports"
(288 hits) were reviewed and are not filed — they're a normal React
named+default export pattern, not evidence of dead code.

---

## 5. What's genuinely strong here (report honestly)

- **The desktop Tauri IPC registry has almost no drift.** 1,268 registered
  commands, a self-enforcing two-layer check (`check-wiring.mjs` + a second
  independent TS allowlist test), zero calls to nonexistent commands. The
  ~154 unreachable commands this audit (and the brief) discuss are a
  _classification_ problem (dead vs. wire), not a _correctness_ problem —
  nothing calls a command that doesn't exist.
- **`wiring-allowlist.json` is a real, working self-governance mechanism**,
  not a bypass hatch — it fails CI if a waived entry becomes reachable again
  without being removed, and every entry carries a non-generic, load-bearing
  reason string. This is the right way to track intentional debt.
- **The `/qa-artifacts` and `/dev/*` kill-switches are genuinely
  well-engineered** — three independent layers (env guard, gitignore, robots
  disallow) rather than one, which is why the brief's framing of them as a
  live defect didn't hold up under verification.
- **`apps/desktop/archive/`'s isolation is correct and complete** — this is
  what "intentionally archived, not silently dead" should look like, and it
  is a useful template for what DEAD-CODE-002's ~180 still-live-tree files
  should be moved to if they're not going to be wired.
- **Mobile's engineering discipline around gating is unusually high** —
  every one of the honestly-gated feature flags (`agents`, `computerUse`,
  `crossDeviceSync`, etc.) renders a real `<FeatureUnavailable/>` fallback
  rather than a blank screen or a fake success, and the permissions registry
  explicitly documents _removing_ a half-wired `location` permission rather
  than leaving it half-built — exactly the discipline CLAUDE.md's
  "finish what you start" rule asks for.
- **The 13 retired-410 routes are a model for how to sunset an API surface**
  — typed error code, a pointer to the replacement, one shared handler, zero
  ambiguity for a client hitting the old path.

---

## 6. Severity distribution

| Severity | Count | Notes                                                                                                                  |
| -------- | ----: | ---------------------------------------------------------------------------------------------------------------------- |
| P0       |     0 | Nothing here blocks a primary workflow or a demo                                                                       |
| P1       |     3 | Stale ledger blocking cleanup (001), large unmounted UI investment (002), real seat-expiry billing-integrity bug (005) |
| P2       |    17 | The bulk — duplicated/dead subsystems, unwired backend capability, architecture drift                                  |
| P3       |     3 | Low-risk cleanup items, one cosmetic hygiene fix                                                                       |

Full evidence, file:line citations, and DELETE/WIRE/DOCUMENT-AS-INTENTIONAL
recommendations for each of the 23 filed items are in
`domain-dead-code.json`.
