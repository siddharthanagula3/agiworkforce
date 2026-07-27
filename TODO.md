# TODO

Status: Current
Owner: Founder + platform lead
Last updated: 2026-07-26

The executable work queue. Strategy lives in `PLAN.md`, durable defects in
`docs/agent-context/known-flaws.md`, verified completed slices in `CHANGELOG.md`.

Rewritten 2026-07-26. The previous queue was the 2026-07-15 restructure list and
every item in it was marked DONE; it has been replaced rather than appended to.

## Baseline (2026-07-26)

Green and re-verifiable: `pnpm typecheck:all`, `pnpm lint`,
`pnpm check:llm-operability` (27 checks), `cargo test --workspace --lib`, and
**10,272 passing tests** — web 4,453 · desktop 1,894 · mobile 2,121 · Chrome
1,168 · VS Code 644. Do not open work on a red baseline; re-run first.

## Closed since this queue was written (2026-07-27 re-verification)

This queue was committed at `5f29fcdde`, **07-26 16:05**. Two of its top items
were fixed within hours and are removed from the sections below:

- **EXT-10** — closed at `8801412ff`, **16:07** (two minutes later).
- **DCL-01** — closed at `3cf7761f7`, **19:55**, and closed _better than
  specified_: instead of patching the one call site it added
  `scripts/check-css-tokens.mjs`, which resolves every `var()` reference against
  the stylesheets each surface actually loads.

The other ~28 items have **not** been re-verified individually — commit messages
do not carry the `DCL-*`/`VSCX-*`/`EXT-*` IDs. Open the cited file before
starting any of them. Full re-verification of the parity claims is in
`docs/plans/chatgpt-claude-parity-gap-ledger-2026-07-27.md`.

## Active queue — surface production quality

Founder directive 2026-07-26: **Desktop Cloud and Mobile Cloud to the production
quality of Web; VS Code and Chrome to the frontend UI/UX quality of ChatGPT's
extensions.** A live demo and social-format recordings (YouTube / Instagram /
X) are the acceptance context, so a defect a viewer _sees_ outranks one they do
not. Vertical crops magnify typography and layout seams — weight those higher
than pure demo-risk would suggest.

Every item below was confirmed by opening the cited file. Benchmarks are the
founder's per-surface specs in `~/Downloads/0*-benchmark-spec.md` (01 mobile,
03 desktop, 05 chrome, 06 vscode, 07 shared).

### 1. Trust and safety — before anything cosmetic

- _(EXT-10 closed — see the section above.)_

### 2. Default-on breakages — fire without anyone opting in

- ~~**VSCX-01**~~ — CLOSED 2026-07-27 (range + default). The lens range was
  computed then dropped: the commands took no arguments, so `runInlineCommand`
  fell back to `editor.selection`, and `getText(undefined)` on an empty
  selection returns the whole document — so a lens click silently sent the
  entire file and the "Select some code first" guard never fired. Lenses now
  pass a `declarationSpan()` range (brace-counting / indentation, erring toward
  the declaration line when unsure) and the commands accept it. Default flipped
  to `false`; the same actions remain in the context menu and sidebar.
  `src/__tests__/codeLensTargetRange.test.ts` (9). **Still open:** the answer
  opens in an untitled scratch tab rather than the panel.
- ~~**VSCX-03**~~ (toast half) — CLOSED 2026-07-27. Every failure offered one
  button, "Set API Key", so a dropped connection or a rate limit told the user
  to change working credentials. The key dialog is now offered only for
  failures `isCredentialFailure()` recognises; everything else offers Retry.
  `src/__tests__/inlineCommandFailure.test.ts` (14). **Still open:** whether
  these paths should require cloud sign-in at all when sidebar chat does not.
- ~~**VSCX-06**~~ — CLOSED 2026-07-27. The pill was hardcoded in the markup, so
  it claimed a workspace-local runtime on BYOK and Managed Cloud too. Now driven
  by the live `usageMeter.source` via `updateRuntimePill()`: Local (green) /
  BYOK (blue) / Cloud (amber), hidden until a real source arrives, and an
  unrecognised source falls back to Cloud rather than claiming Local. Verified
  in a real browser across all three states;
  `apps/extension-vscode/src/__tests__/runtimePill.webview.test.ts` (7 tests).
  Two older tests asserted the hardcoded string and were pinning the defect —
  both rewritten to their actual intent.
- ~~**EXT-03**~~ — CLOSED 2026-07-27. The banner headline was set once at build
  time, so a completed autofill announced itself as a stall under a lightning
  bolt. `showHandoffBanner` now takes an outcome (escalation / success / error)
  that picks headline, icon and tint; the banner ships with no headline at all
  until an outcome exists. `__tests__/autofill-outcome-banner.test.ts` (5).

### 3. Visible on screen

- **DCL-03** — Cmd+K in Cloud matches conversation titles only; cloud message
  bodies are unreachable, so searching a remembered phrase returns nothing.
- ~~**EXT-04**~~ — CLOSED 2026-07-27. Slash autocomplete ships: 6 commands with
  hints, arrow/Enter/Tab/Escape handling, verified in the e2e smoke
  (`[slash-menu]` block).
- ~~**EXT-08**~~ — CLOSED 2026-07-27. `getExtensionTokensCssAuto()` emits both
  ramps under `prefers-color-scheme`; verified rendering light and dark.
- ~~**VSCX-14 / VSCX-15**~~ — CLOSED 2026-07-27. Both popovers declare
  `role="menu"` but had no keydown handler at all. Arrow/Home/End roving focus,
  Escape-to-close with focus returned to the opener, and a roving tabindex so
  Tab leaves the menu; the model popover opens on the current model. Body now
  inherits `--vscode-font-family` / `--vscode-font-size` (a size the user set
  for accessibility, not decoration). Verified in a real browser.
  `src/__tests__/popoverKeyboard.webview.test.ts` (5).
- ~~**EXT-09**~~ — CLOSED 2026-07-27. The provider error was concatenated into
  message content as "Error: <string>" and rendered as assistant prose. It now
  lives in `errorText`, renders as a failure footer with the reason and a Retry
  that re-sends the preceding user turn, on both the plain and tool-activity
  paths. `__tests__/stream-error-retry.test.ts` (5).
- ~~**EXT-05**~~ — CLOSED 2026-07-27. Replay discarded its callback outright,
  delete acted only on success, and Save had three silent returns (including
  pressing Save with nothing recorded). All now report into a status line.
  `__tests__/shortcuts-failure-feedback.test.ts` (7).
- ~~**EXT-12**~~ — CLOSED 2026-07-27. The Chrome-internal tab id ("#1873492")
  is gone from the drawer footer, and the URL line no longer renders a raw
  extension id on browser-internal pages.
- ~~**EXT-06 / EXT-07**~~ — CLOSED 2026-07-27. Emoji ("✕", "▶", "▾", "✓", "🎤")
  sat beside stroke-only Lucide SVGs; emoji ignore `currentColor` and render in
  the system emoji font, so a single row showed two vocabularies. Replaced with
  X / Play / ChevronDown / Check / Mic / Trash2, guarded by a lint-style test.
  The options page was declared in the manifest but never opened from the
  product — a Settings entry now sits in the drawer's Tools row.
  `__tests__/icon-vocabulary.test.ts` (6). Also fixed the Site allowlist
  offering to allowlist `chrome-extension://<id>` — an entry that could never
  match, since automation needs a content script.

### 4. Cloud parity gaps — web ships these, Desktop/Mobile Cloud do not

Founder rule: Cloud is a complete UI copy of web.

- ~~**DCL-02** usage/quota invisible in Cloud~~ — **disproven 2026-07-27.**
  `DesktopCloudSettingsModal.tsx:23-24,61-62` ships `DesktopBillingSection` +
  `DesktopUsageSection` (wrapping `UsageDashboard`) with `getCloudUsage`,
  `openBillingPortal`, `PlansModal`, and a `CapModal` top-up. ·
  ~~**DCL-05** no Library~~ — CLOSED 2026-07-27: `LibraryView` lifted into
  `@agiworkforce/unified-chat` behind a `LibraryTransport`; web became an
  adapter, desktop gained the surface. Same for **Tasks**. ·
  ~~**DCL-06** cloud artifact edits lost on reload~~ — **re-scoped 2026-07-27.**
  Not a desktop parity gap: web's only artifact endpoint is
  `POST /api/artifacts/publish`, and no web feature calls `/api/artifacts` at
  all, so cloud artifact _edit_ persistence does not exist on any surface.
  Desktop's `artifactUpdate` writes to local SQLite via the `artifact_update`
  Tauri command, which is correct for Local and simply has no cloud
  counterpart. Building one means a new table + migration + endpoints + two
  clients — founder-scale, not an unattended fix. ·
  **DCL-08** bare chat header (no title menu, artifacts or
  research toggle) · **DCL-07** no conversation share · **DCL-09** no
  Notifications section ·
  **DCL-04** scheduled tasks say "Local mode only" — which inverts the pitch,
  since cloud schedules are the ones that should run with the laptop closed.
- ~~**MOBCLOUD-01**~~ — **disproven 2026-07-27.** The sheet has no dead CTA.
  `PaywallBottomSheet.tsx:187` resolves the required tier to a purchasable IAP
  product and renders three distinct branches: a native IAP button when
  `FEATURES.iap` is on, a Contact Sales handoff for team/enterprise (exact
  match, so an unrecognised future tier fails closed rather than becoming an
  external-navigation CTA), and otherwise informational copy with no button at
  all. `models.tsx:73` is likewise public-alpha aware — unlocking Cloud routes
  to sign-in, not to a waitlist. The "Upgrades aren't available in the app yet"
  copy is deliberate: Apple Guideline 3.1.1 forbids steering to an external
  purchase for digital goods, so pointing at web billing would risk rejection.
  Do not "fix" it that way.
- ~~**MOBCLOUD-04**~~ — CLOSED 2026-07-27, and **the ledger entry was wrong**:
  sharing is not "a feature no surface has". Web ships `/share/[token]`,
  `/shared/[id]`, `POST /api/share` and `DELETE /api/share/:token`. The only
  missing piece was a way to list your own links, so `GET /api/share` was added
  (owner-scoped, never selects message bodies, marks expired rows rather than
  hiding them so they stay revocable). The mobile screen now lists real shares
  with share/revoke. `apps/web/app/api/share/route.test.ts` (6),
  `apps/mobile/__tests__/shared-links{,-honesty}.test.tsx` (11).
- ~~**MOBCLOUD-03**~~ — CLOSED 2026-07-27. `app/(app)/skills/` had no inbound
  route reference anywhere and its whole content was the waitlist + invite-code
  gate removed on 2026-06-27. Deleted. A real mobile Skills surface is unbuilt —
  the Managed Cloud Skill tool itself ships.
- **MOBCLOUD-02** — Code sessions is a mock with no data source anywhere in the
  repo (delete, do not graft).

**Skills is not a gap** (checked 2026-07-27): web's `/skills` is
`SettingsModalRedirect section="skills"`, i.e. it opens the settings modal —
exactly where desktop already has `SkillsPluginsSettings` (832 lines, live in
the Plugins tab). **Shared links is not a parity gap either**: web ships
`/shared/[id]` for _viewing_ a shared conversation but has no page listing your
own links. Mobile got one today because `GET /api/share` was added for it.

### 5. Larger, scope before starting

- **DCL-10** — **corrected 2026-07-27, it is worse than recorded.** An import-graph
  BFS from `main.tsx` finds **444 of 576 feature files orphaned (77%)**, ~50 fully
  dead directories — not "230 files". The live shell
  (`App.tsx:1698 → features/v3/DesktopShellV3.tsx`) mounts only
  chat/projects/artifacts/scheduled/record-skill, so Desktop Local has **no
  terminal, git, MCP-tools, notifications, computer-use observability, or
  workflows UI** — all of it hangs off `AppLayout`/`DynamicSidecar`, which have
  zero importers. A 175-file legacy `features/chat/` tree _shadows_ the live v3
  components (two Sidebars, two settings shells). This is why grepping before a
  demo concludes features ship when they don't — and it is the repo's biggest
  wrong-edit risk.
- **VSCX-02** Open Chat in Editor forks the session · **VSCX-11** no in-IDE MCP
  surface · ~~**EXT-11**~~ — autonomy chip CLOSED 2026-07-27 (per-site prompt still open).

## Standing constraints

- Long-term axes the founder is optimising for: **scalability, flexibility,
  model-neutral, cloud-neutral, domain-neutral, fallback behind every model.**
  Prefer the change that removes a hardcoded assumption over the one that adds a
  surface-specific branch.
- Build once in a shared package; do not fork per surface. Desktop/Mobile Cloud
  gaps above should reuse the `apps/web` implementation, not reimplement it.
- Audit documents are triage queues, not remediation. Open the cited file and
  confirm before fixing — the 2026-07-26 surface pass overturned four of six
  items a prior ledger listed as open for Desktop Cloud.

## Founder-gated

Tracked in `founder_work.md`. Nothing in the active queue is blocked on them.
