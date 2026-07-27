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

- **VSCX-01** — CodeLens is ungated and `codeLensEnabled` defaults true, so
  lenses sit above every function in every open file; clicking one sends the
  whole file (the lens range is computed then discarded) and the answer opens in
  an untitled scratch tab instead of the panel.
- **VSCX-03** — every right-click / lightbulb / inline action demands AGI Cloud
  sign-in that sidebar chat never needed; the error toast's only button says
  "Set API Key", contradicting its own message.
- ~~**VSCX-06**~~ — CLOSED 2026-07-27. The pill was hardcoded in the markup, so
  it claimed a workspace-local runtime on BYOK and Managed Cloud too. Now driven
  by the live `usageMeter.source` via `updateRuntimePill()`: Local (green) /
  BYOK (blue) / Cloud (amber), hidden until a real source arrives, and an
  unrecognised source falls back to Cloud rather than claiming Local. Verified
  in a real browser across all three states;
  `apps/extension-vscode/src/__tests__/runtimePill.webview.test.ts` (7 tests).
  Two older tests asserted the hardcoded string and were pinning the defect —
  both rewritten to their actual intent.
- **EXT-03** — success and error outcomes both render under the build-time
  headline "Autofill stalled", so the primary flow contradicts itself on screen.

### 3. Visible on screen

- **DCL-03** — Cmd+K in Cloud matches conversation titles only; cloud message
  bodies are unreachable, so searching a remembered phrase returns nothing.
- **EXT-04** — typing `/` does nothing while three separate strings promise a
  command menu; the claimed chip fallback is also absent.
- **EXT-08** — panel is hardcoded dark-only although a light token set already
  ships in the same package; on a light-mode machine it is a dark slab.
- **VSCX-14 / VSCX-15** — composer popovers expose `role="menu"` without Escape
  or arrow-key roving focus (a keyboard trap that also lies to screen readers),
  and the webview body bypasses `--vscode-font-family` / `--vscode-font-size`.
- **EXT-06 / EXT-09 / EXT-05 / EXT-07 / EXT-12** — mixed icon vocabulary
  (lucide SVG beside emoji), stream errors as plain `Error:` text with no retry,
  a Shortcuts row with three silent-failure paths, an unreachable options page,
  and debug telemetry in a user-facing drawer footer.

### 4. Cloud parity gaps — web ships these, Desktop/Mobile Cloud do not

Founder rule: Cloud is a complete UI copy of web.

- ~~**DCL-02** usage/quota invisible in Cloud~~ — **disproven 2026-07-27.**
  `DesktopCloudSettingsModal.tsx:23-24,61-62` ships `DesktopBillingSection` +
  `DesktopUsageSection` (wrapping `UsageDashboard`) with `getCloudUsage`,
  `openBillingPortal`, `PlansModal`, and a `CapModal` top-up. ·
  **DCL-05** no Library · **DCL-08** bare chat header (no title menu, artifacts or
  research toggle) · **DCL-06** cloud artifact edits lost on reload ·
  **DCL-07** no conversation share · **DCL-09** no Notifications section ·
  **DCL-04** scheduled tasks say "Local mode only" — which inverts the pitch,
  since cloud schedules are the ones that should run with the laptop closed.
- **MOBCLOUD-01** tier-locked model row exits chat into a Billing screen whose
  only CTA is a dead upgrade sheet.
- **MOBCLOUD-02 / 03 / 04** — Code sessions is a mock with no data source
  anywhere in the repo (delete, do not graft), an orphaned Skills route still
  renders the invite gate the 2026-06-27 public-alpha decision removed, and an
  unreachable Shared Links screen ships a "Coming soon" card for a feature no
  surface has.

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
  surface · **EXT-11** no autonomy-mode picker or per-site permission prompt.

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
