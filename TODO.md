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

- **EXT-10** — Chrome "Ask before acting" never rehydrates from storage, so the
  panel can display human-in-the-loop while the agent loop runs unattended on a
  prompt-injectable page. A control that misreports the gate it governs is a
  trust-boundary defect, not a UI bug.

### 2. Default-on breakages — fire without anyone opting in

- **VSCX-01** — CodeLens is ungated and `codeLensEnabled` defaults true, so
  lenses sit above every function in every open file; clicking one sends the
  whole file (the lens range is computed then discarded) and the answer opens in
  an untitled scratch tab instead of the panel.
- **VSCX-03** — every right-click / lightbulb / inline action demands AGI Cloud
  sign-in that sidebar chat never needed; the error toast's only button says
  "Set API Key", contradicting its own message.
- **VSCX-06** — static green "Local host" pill renders above a
  runtime-unavailable banner. Fake availability badge; CLAUDE.md names this class.
- **EXT-03** — success and error outcomes both render under the build-time
  headline "Autofill stalled", so the primary flow contradicts itself on screen.

### 3. Visible on screen

- **DCL-01** — desktop account/plan popover uses CSS custom properties defined
  only in `apps/web`: dividers never draw, hover is a no-op (CSSOM discards the
  invalid `style.background` assignment), text colours fall back. Fix the token
  definitions once for desktop, not this one call site — grep the five property
  names first.
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

- **DCL-02** usage/quota invisible in Cloud and the hard-cap modal can never fire ·
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

- **DCL-10** — 50 of 76 desktop feature directories (230 files, ~62k lines) are
  unreachable from `main.tsx`, including `features/cloud`. This is why several
  items above read as "missing" while plausible code exists: grepping the repo
  before a demo concludes they ship.
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
