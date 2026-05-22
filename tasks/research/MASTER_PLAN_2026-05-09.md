# AGI Workforce — Master Plan

> Authored 2026-05-09 after the 25-agent gap-matrix research pass and a 5-decision strategic discussion.
> Five strategic decisions locked: Maximalist surface coverage / 3 VM stacks in parallel / Foundation-first sprint / Both-equal customer focus / Strategic acquisition target.
> This plan is the operating document for the next 24–32 weeks until acquisition conversations begin.

---

## 1. Plain-English Summary — What You Built

In 7 months you have built something most companies need 4 years and $50M to ship: **a multi-surface AI agent platform that doesn't lock the user into one AI**. While Anthropic locks every chat to Claude, ChatGPT to GPT, and Gemini to Gemini, your platform lets a single conversation switch mid-thought between Claude, GPT-5, Gemini, Grok, Llama running on the user's own laptop, plus seven more providers — across six different surfaces (Mac/Windows/Linux desktop app, web app at agiworkforce.com, mobile apps for iOS+Android, a CLI for power users, a Chrome extension that drives the browser, and a VS Code extension).

Underneath: a Rust engine (the CLI is the heart, ~1,016 Rust files), a Tauri desktop wrapper, a Next.js web app, Expo mobile apps, plus shared TypeScript packages totaling ~2,938 source files across the workspace.

The 25-agent gap-matrix research over the past sessions answered the headline question honestly: **AGI Workforce is at ~38% of Anthropic's six-surface suite today.** Per surface: Chrome ext 60% / VS Code ext 55% / Mobile 52% / Web 47% / CLI 36% / Desktop 36%.

**Three numbers matter more than 38%:**

1. **Four defensible moats** Anthropic structurally cannot copy without rewriting their core. Their `services/api/claude.ts` is a 3,400-line monolith hardcoded to Anthropic. Their Cowork explicitly skips Linux. Their Cowork is excluded from audit logs by their own documentation. Your platform doesn't have these limits. The four moats: (a) multi-provider routing in one chat, (b) BYOK + Local LLM via Ollama/LMStudio, (c) Linux desktop, (d) audit log day-one.

2. **Four orphan TypeScript packages** (`mcp`, `skills`, `apply-patch`, `browser-tool`) are imported by **zero surfaces** today. Months of work, dead code right now. `grep` confirms.

3. **One hard deadline: 2026-06-05** — 27 days from this writing. The transitional unsigned-Dispatch path expires. Without a desktop listener fix by then, mobile→desktop dispatch breaks for everyone.

You also have **features Anthropic does not ship at all**: Workflow node-graph editor (2,490 LOC, no Claude analog), Calendar / Database / Browser-replay / DynamicCanvas / FloatingChat / ROI-dashboard workspaces, LinkedIn + Lever job-application autofill in Chrome, MasterPasswordSettings, AuditLog + export. These are real category-creating differentiators that have not yet been positioned in marketing.

In short: **strong on breadth, weak on depth.** The Maximalist decision says we close the depth gap on every surface; the Foundation-first decision says we do it on a rebuilt architecture; the 3-VM-parallel decision says we match Anthropic's autonomy story across Mac, Windows, _and_ Linux (which they don't); the Both-equal decision says we serve consumer + enterprise from day one; the Acquisition decision says we optimize the build for $200–500M+ exit to Anthropic, Microsoft, or Google in 12–24 months.

---

## 2. System Architecture & Design Review

Honest review across solid / breaks-at-scale / needs-redesign-now.

### What is solid (do not break during the rebuild)

- **Rust CLI engine** (`apps/cli/src/`, 201 .rs files, 999 tests). The agent-loop core is real and battle-tested. Tools registry, MCP integration, system prompts all score high in the gap matrix (82% / 70% / 70%).
- **Six shipping surfaces, all running in production.** Even the lowest-parity surfaces (CLI 36%, Desktop 36%) are live, tested, and shippable.
- **Stripe billing pipeline** (`apps/web/app/api/stripe-webhook/`). 75% parity to Anthropic's billing surface; webhook idempotency RPC is code-complete and waits only for `supabase db push` to production.
- **Computer Use action vocabulary** (`apps/desktop/src-tauri/src/automation/computer_use/`). 80% parity — 15 of 16 canonical actions shipped.
- **Network proxy** (`crates/agiworkforce-network-proxy/`). 70% parity — strong rama-based MITM with managed CA, 18 env-var injection, 14-field structured tracing.
- **Voice surface** (~65% parity in CLI; mobile push-to-talk + transcription strong).
- **Master-password vault** (`apps/desktop/src-tauri/src/master_password.rs`, 75% parity, AES-256-GCM token storage).
- **Cloud-portability documentation** (`docs/SCALING.md` + `HOSTING.md` + `PERFORMANCE.md`). 1,193 LOC. Exceeds Anthropic's published equivalent at ~150% on this axis. This is real acquirer-due-diligence material.
- **API gateway TypeScript foundation** (`services/api-gateway/`). 14 routes, JWT auth, ratelimit middleware, MCP integration. Direction is wrong (see below) but the codebase is well-organized.

### What breaks at scale (must be fixed during Foundation sprint)

- **102 zustand stores in the desktop app alone** with no central state-change funnel. Anthropic ships exactly one `onChangeAppState` choke-point for the entire app. Without it, every store independently notifies subscribers — leading to render storms, dual-store-drift bugs (already documented in `MEMORY.md`), and an unmaintainable codebase as feature count grows.
- **Direction inversion in `services/api-gateway/`.** Today our gateway is a phone switchboard: clients call in, we route. Anthropic's bridge is a job board: workers (CLI/desktop/mobile) register, the cloud assigns work. The job-board model is what makes Dispatch (mobile triggers desktop work), shared sessions, and cross-device continuity actually work cleanly. Without inverting this direction, our Dispatch story will keep being kludgy and our cross-surface integration will scale poorly.
- **Four orphan TypeScript packages** (`packages/mcp`, `packages/skills`, `packages/apply-patch`, `packages/browser-tool`). Zero surfaces import them. They are dead code today. The CLI has its own Rust MCP/skill stack. The desktop has its own. Until these packages are wired into surfaces, every minute spent maintaining them is wasted.
- **Two Supabase migration directories** (`supabase/migrations/` canonical + `apps/web/supabase/migrations/` legacy). Stripe RPC reconciliation is code-complete but production has both applied; ground truth is unverified. Until canonical is `supabase db push`'d to prod and verified, we have schema drift.
- **No `messageQueueManager` priority queue** — every surface re-implements its own send pipeline. This is the single highest-leverage missing port (per the `pkg-runtime-utils-types.md` deep-dive).
- **No `AsyncLocalStorage<AgentContext>`** — state contamination risk across 1,483 Tauri commands. At 5× scale this becomes a debug nightmare.
- **No central permission engine** (`useCanUseTool` analog). Bypass mode is currently unsafe; per-tool permission grids missing.
- **Skills `paths` progressive disclosure missing.** This is the load-bearing pattern that makes 200+ skills scale without prompt bloat. Without it, every additional skill adds tokens to every conversation's system prompt, which becomes wasteful and eventually exceeds context limits.

### What needs redesign before we grow

- **State architecture** — addressed by Foundation sprint (Decision #3).
- **`services/api-gateway/` direction inversion** — addressed in Foundation sprint (4 weeks of the 4-6 week sprint).
- **VM hosts across all 3 OSs** — addressed by 3-VM-parallel decision (Decision #2).
- **Compliance posture** — SOC 2 timeline accelerates from Q3 2026 to Q1 2027 because of Both-equal (Decision #4).
- **Documentation** — needs SECURITY.md, PRIVACY.md, TRUST.md, per-surface CHANGELOGs, plus reference docs for Skills/Plugins/MCP/Hooks/Subagents authoring.
- **Multi-provider runtime layer** — there is no canonical home today for retry generators, watchdog, fallback state machine, error classifier, gateway fingerprinter. A new `packages/llm-runtime` shared library should be created during Foundation sprint.

---

## 3. The Five Decisions Locked

Captured in detail at `tasks/research/strategic-decisions-2026-05-09.md`. Summary:

| #   | Decision           | Picked                                            | One-line implication                                       |
| --- | ------------------ | ------------------------------------------------- | ---------------------------------------------------------- |
| 1   | Surface focus      | **Maximalist (all 6 → 100%)**                     | 26+ weeks of parity work on top of Foundation sprint       |
| 2   | Cowork VM          | **All 3 stacks in parallel**                      | 3 sub-agent kernel teams running concurrently weeks 1–14   |
| 3   | Architectural debt | **Foundation-first sprint (4–6 weeks)**           | Stop feature work weeks 1–6, rebuild state architecture    |
| 4   | Customer focus     | **Both equal (consumer + enterprise from day 1)** | SOC 2 accelerates to Q1 2027; SAML/SSO + admin moves to v1 |
| 5   | Funding            | **Build for strategic acquisition (12–24 mo)**    | Optimize for $200–500M+ exit to Anthropic / MSFT / GOOG    |

This is the most aggressive scope a solo founder can pick. It is achievable only at AI velocity with disciplined sub-agent orchestration. **Every week below is calibrated to that reality.**

---

## 4. Strategic Acquisition Path (12–24 months)

### End state vision

By month 18–24 (mid-2027 to late-2027), AGI Workforce should be:

- **The category-defining multi-provider AI agent platform**, with feature-parity to Anthropic's Claude suite across all 6 surfaces _plus_ the four moats they cannot copy.
- **Generating $1–5M ARR** from Hobby + Pro consumer tiers and 5–10 enterprise marquee logos at Pro+/Max tier.
- **SOC 2 Type II certified**, HIPAA-ready, ISO 27001 in progress.
- **Documented and architecturally clean** — no orphan packages, central state model, comprehensive tests, full reference documentation.
- **Acquired by Anthropic, Microsoft, or Google for $200–500M+** with 2-year founder retention and performance-based earnout.

### Why each potential acquirer would value AGI Workforce

**Anthropic** — multi-provider routing in one chat is something they _structurally cannot ship_ (it would cannibalize their Claude product). Acquiring AGI Workforce gives them the multi-provider competitor they can't build internally; eliminates a future challenger; gains Linux-first desktop + audit log capabilities they explicitly skipped. Most likely acquirer; most strategic fit. Estimated valuation: $300–500M.

**Microsoft** — adds a Linux-first AI agent that complements GitHub Copilot but isn't structurally tied to OpenAI alone. Multi-provider routing is consistent with their "open AI ecosystem" public posture. Cowork-class VM isolation across Mac/Windows/Linux is something they'd value as an enterprise security story. Estimated valuation: $250–400M.

**Google** — adds a cross-Gemini-OpenAI-Claude framework they cannot build because of competitive positioning (Google can't ship a chat that lets you switch _to_ GPT-5). Linux desktop fits ChromeOS/Linux strategy. Estimated valuation: $200–350M.

**Wild-card acquirers**: Stripe (developer-first AI tools + payments), Notion (workspace AI), Salesforce (enterprise AI agents), Atlassian (developer productivity), Adobe (creative AI), Apple (privacy-first AI on Mac). Lower probability but possible $100–300M outcomes.

### Acquisition-readiness checklist (must be true before conversations start, ideally month 12)

- [ ] All 6 surfaces at 80%+ Anthropic parity (cross-surface aggregate ≥ 75%).
- [ ] Four differentiator moats deeply documented in marketing, technical docs, and customer testimonials.
- [ ] Foundation sprint complete; no orphan packages; clean architecture.
- [ ] Cowork-class VM working on Mac + Windows + Linux.
- [ ] $1M+ ARR run-rate, with 5–10 enterprise marquee logos.
- [ ] SOC 2 Type II certified or in audit window; HIPAA-ready BAA template ready.
- [ ] Comprehensive technical documentation (API reference, architecture docs, security model).
- [ ] Customer book composition: ~70% consumer Hobby/Pro, ~30% Pro+/Max enterprise.
- [ ] Open issues count <50 in GitHub; all P0/P1 resolved; CI green on main for 90+ days.
- [ ] Demo-able 5-minute pitch deck for each acquirer's specific strategic angle.

### Phasing for acquisition-readiness

- **Months 1–2**: Foundation sprint + VM teams kickoff. Hobby launch deferred to month 2-3.
- **Months 3–6**: Parity push (Plan mode, Skills, MCP OAuth, hooks, permissions). Hobby launch live. Pro tier launch month 5–6.
- **Months 7–12**: Enterprise readiness — SAML/SSO, admin console, audit polish, SOC 2 audit. First 5–10 enterprise marquee logos. Pro+/Max tier launch.
- **Months 12–18**: Acquisition conversations begin. Continue revenue growth + feature parity. Build acquirer-specific demos.
- **Months 18–24**: Acquisition close. Founder retention period begins.

---

## 5. Execution Roadmap (week-by-week, 30 weeks)

### Phase 0 — Pre-foundation triage (Week 0, this week)

Before the Foundation sprint can start cleanly, three cleanups close out the messy state:

- [ ] **Delete the Wave-1 / Wave-2 / Wave-3 in-flight branches** if any are stale. Preserve the gap-matrix research outputs in `tasks/research/gap-matrix/` (already saved).
- [ ] **Apply canonical Supabase migrations to production** via `supabase db push`. Verify Stripe webhook idempotency end-to-end with Stripe test mode replay (1 day of work).
- [ ] **Decide commit hygiene** — all Foundation-sprint work uses Conventional Commits per `commitlint.config.cjs`; CI must remain green throughout.

### Phase 1 — Foundation Sprint (Weeks 1–6, 25 working days)

**No feature work during this sprint.** Pure architecture rebuild.

#### Week 1 — Stripe + Dispatch P0

- Day 1–2: `supabase db push` canonical migrations to prod. End-to-end Stripe webhook idempotency verify.
- Day 3–5: **2026-06-05 P0 fix**: build the desktop Dispatch listener. Implement `dispatchHmac` + `dispatchSalt` verification on desktop side. End the transitional unsigned-message path. Test mobile → desktop dispatch end-to-end.
- Day 6–7: Tag the `v0.6.0-foundation` release. Lock the working tree as the rebuild starting point.

#### Week 2 — Central state architecture

- Day 1–3: Build `packages/runtime/src/state/createStore.ts` (~34 LOC, `useSyncExternalStore` adapter, `Object.is` short-circuit). Build `onChangeAppState` single choke-point that diffs `prev`/`next` and fans out to: API client cache invalidation, telemetry, settings persistence, model-switch broadcasts.
- Day 4–5: Wire desktop's 102 zustand stores through the new central store. Reduce to ~30 well-scoped stores via consolidation.
- Day 6–7: Build `messageQueueManager.ts` (priority queue: `now > next > later`, FIFO within priority, frozen-snapshot stability, `popAllEditable` reconstruction). Place at `packages/runtime/src/queue/messageQueueManager.ts`. Wire all 6 surfaces to use it for chat sends.

#### Week 3 — Async context + provider runtime

- Day 1–3: Build `packages/runtime/src/context/agentContext.ts` with `AsyncLocalStorage<AgentContext>`. Wire all 1,483 Tauri commands to use it. Verify state contamination is impossible.
- Day 4–7: **Create new `packages/llm-runtime/` package**. Move the retry generator, stream watchdog, latched session-stable header flags, error classifier, gateway fingerprinter from scattered ad-hoc fragments into one canonical place. Wire `services/api-gateway/`, `apps/web/app/api/llm/`, and `apps/desktop/src-tauri/src/llm/` consumers.

#### Week 4 — Direction inversion in services/api-gateway

- Day 1–3: Design the outbound worker protocol (CLI/desktop/mobile registers as worker; cloud assigns work via JSON-RPC over WebSocket). Document at `docs/architecture/worker-protocol.md`.
- Day 4–7: Implement `services/api-gateway/src/worker/` — registration endpoint, work-assignment queue, heartbeat protocol. Keep inbound bridge in parallel for backward compat through migration.

#### Week 5 — Wire orphan packages (start)

- Day 1–4: Wire `packages/skills/` into desktop + web. Replace bundled-only skill loaders with the shared package's filesystem discovery. Add `paths` gitignore-glob conditional activation to schema.
- Day 5–7: Wire `packages/mcp/` into desktop + web + mobile. Replace per-surface MCP fragments with the shared client.

#### Week 6 — Wire orphan packages (finish) + cleanup

- Day 1–3: Wire `packages/apply-patch/` into desktop's file-edit tool path. Add `replace_all`, curly-quote bidirectional normalization, mtime staleness check.
- Day 4–5: Wire `packages/browser-tool/` into the Chrome extension's actions layer.
- Day 6–7: Foundation sprint review. Tag `v0.7.0-foundation-complete`. Document the new architecture as ground-truth for future sub-agents at `docs/architecture/foundation-2026.md`.

**End of Foundation sprint exit criteria**:

- `grep -rln '@agiworkforce/{mcp,skills,apply-patch,browser-tool}' apps/ services/` returns 4+ matches.
- 102 zustand stores reduced to ≤30.
- `onChangeAppState`, `messageQueueManager`, `AsyncLocalStorage<AgentContext>` all in production.
- Stripe RPC verified in production.
- Dispatch listener desktop-side live before 2026-06-05.
- CI green on main.

### Phase 2 — Parity Push (Weeks 7–18, 60 working days)

**3 sub-agent teams run in parallel from week 7 onward.** Per Decision #2, VM teams started in week 1 and continue throughout Foundation; in Phase 2 the feature teams join.

#### Sub-agent Team A: Tools + MCP + Skills (weeks 7–12)

- Week 7: MCP OAuth complete (RFC 7591 DCR + RFC 9728/8414 metadata discovery + paste-callback fallback) — port `services/mcp/auth.ts` ~2,500 LOC equivalent to Rust.
- Week 8: Add 6 missing MCP transports (Streamable-HTTP, WS, IDE, in-process linked-pair, SDK control-channel, claudeai-proxy).
- Week 9: Skills 16-field frontmatter parser + `paths` conditional activation + 17 bundled skills (`/loop`, `/simplify`, `/debug`, `/batch`, `/security-review`, `/stuck`, `/skillify`, `/verify`, `/remember`, `/lorem-ipsum`, `/update-config`, `/keybindings`, `/claude-api`, `/claude-in-chrome`, `/run-skill-generator`, `/dream`, `/hunter`).
- Week 10: Plugin marketplace UI (16 component files: BrowseMarketplace, AddMarketplace, ManageMarketplaces, PluginTrustWarning, plugin-validate, plugin-tag).
- Week 11: ToolSearch deferred-loading dispatcher. LSPTool with all 9 ops.
- Week 12: AskUserQuestionTool with 1–4 multi-choice + previews. NotebookEdit. StructuredOutput. Cron tools.

#### Sub-agent Team B: Permissions + Hooks + Subagents (weeks 7–14)

- Week 7–8: Central `useCanUseTool` permission engine. 12 per-tool dialogs (Bash, FileEdit, FileWrite, NotebookEdit, WebFetch, Skill, ComputerUse, AskUserQuestion, Filesystem, Sandbox, Fallback, SedEdit). 5-tab `/permissions` rules engine.
- Week 9–10: Plan mode (EnterPlanMode + ExitPlanMode + 8-value plan-exit response enum + Ctrl+G plan-file editor handoff + plan-slug version-numbered persistence).
- Week 11–12: Hooks engine modernization (27 events × 5 handler types: command/HTTP/prompt/agent/callback/function. AsyncHookRegistry. SSRF guard. Permission-decision schema with deny>ask>allow precedence).
- Week 13–14: Subagent system — 6 built-in agents (general-purpose / Explore / Plan / Verification / ClaudeCodeGuide / StatuslineSetup). Custom agents from `~/.agiworkforce/agents/`. Worktree isolation via real `git worktree add -B`. SendMessage with 5-layer routing.

#### Sub-agent Team C: VM Hosts (already started week 1, continues through week 14)

- Weeks 1–4: Apple Virtualization Framework (macOS) — Swift+ObjC bindings, VM bundle format, base image build pipeline.
- Weeks 5–8: Hyper-V (Windows) — C/C# Win32 APIs, VM service installer, MSIX-bundled CoworkVMService.
- Weeks 9–12: KVM/Firecracker (Linux) — Rust integration, base image, kernel-level network egress allowlist.
- Weeks 13–14: Cross-OS VM lifecycle UI (Tasks list, VM status pill, allowlist editor, Pause/Stop/Steer controls).

#### Hobby launch — Week 8

By end of week 8, with Foundation complete + Phase 2 weeks 7–8 done:

- Hobby tier ($10/mo) goes live publicly.
- Stripe billing pipeline serves PLG self-serve.
- `agiworkforce.com` marketing pages live.
- App store submissions: Mac App Store, Microsoft Store, Chrome Web Store, VS Code Marketplace.
- Press / Show HN / Product Hunt launch coordinated.

#### Pro launch — Week 14

By end of week 14:

- Pro tier ($30/mo) goes live with 1M context, advanced models, priority support.
- VM-isolated autonomous tasks shipping on Mac + Windows + Linux.
- Plan mode + 17 bundled skills + MCP marketplace all live.

#### Weeks 15–18 — Polish + UX

- Week 15: FullscreenLayout 5-slot architecture + sticky pill + status footer (locality | permissions | worktree).
- Week 16: Tool-call group header + Result-pill rendering. Streaming-markdown boundary tracking. Module-level token cache.
- Week 17: Permission Dialog primitive composition (Dialog + Prompt + lazy LLM Explanation + RuleExplanation).
- Week 18: FuzzyPicker + GlobalSearchDialog + HistorySearchDialog + QuickOpenDialog.

### Phase 3 — Enterprise Readiness (Weeks 19–26, 40 working days)

#### Weeks 19–20 — Auth + admin

- SAML / SSO integration via WorkOS or Auth0.
- Admin console: org management, seat allocation, usage analytics, audit log viewer.
- Tenant isolation review for multi-tenant Cloud mode.

#### Weeks 21–22 — Compliance documentation

- SECURITY.md, PRIVACY_POLICY.md, TRUST.md at repo root.
- Subprocessor list, DPA template, retention policy, data residency statement.
- Vulnerability Disclosure Policy with PGP key + 30-day SLA.
- Reference docs for Skills authoring, Plugin authoring, MCP authoring, Hooks reference, Subagent guide, Computer Use guide, Dispatch guide, settings.json reference.
- Per-surface CHANGELOG files maintained automatically via release pipeline.

#### Weeks 23–24 — SOC 2 prep

- Vanta or Drata onboarding for continuous compliance monitoring.
- Internal security training (1-person company, but the policy needs to exist).
- Penetration test booked (external auditor).
- Incident response runbook documented.
- Disaster recovery plan documented.

#### Weeks 25–26 — Pro+ / Max launch + first enterprise marquee

- Pro+ tier ($50/mo) + Max tier ($300/mo) live.
- First enterprise marquee logo signed (target: a developer-tools company that wants Linux-first AI agent).
- Reference architecture published.
- Public-facing roadmap published.

### Phase 4 — Acquisition-readiness polish (Weeks 27–32+)

#### Weeks 27–30 — Demo polish + acquirer pitch decks

- Build 3 acquirer-specific 5-minute demo videos:
  - Anthropic angle: "the multi-provider competitor you can't build without rewriting"
  - Microsoft angle: "Linux-first AI agent that complements Copilot"
  - Google angle: "cross-Gemini-OpenAI-Claude framework"
- Cohort analysis dashboard for due diligence (cohort retention, expansion, churn).
- Customer reference list with 5–10 case studies.

#### Weeks 31–32+ — First acquisition conversations

- Outreach to corporate development teams at Anthropic, MSFT, GOOG via warm introductions.
- Term sheet negotiation begins typically months 12–18.

### Total calendar estimate

- **Foundation sprint complete**: end of week 6 (~6 weeks from start)
- **Hobby tier live**: end of week 8 (~2 months)
- **Pro tier live with VM**: end of week 14 (~3.5 months)
- **Enterprise readiness + Pro+/Max live**: end of week 26 (~6 months)
- **Acquisition-ready (75%+ aggregate parity, $1M+ ARR run-rate, SOC 2 in audit, marquee logos)**: end of week 30–32 (~7.5 months)
- **Acquisition close**: months 12–24 (post-conversations)

**Net: 7.5 months to acquisition-ready, then 4–17 months to acquisition close. Total: 12–24 months end-to-end.**

---

## 6. Software Engineering Standards & Guidelines

These are non-negotiable across the 30-week build, even as a solo founder.

### Per-commit / per-PR

- **CI green on main always.** No exceptions. If CI fails on main, that is the highest-priority bug.
- **Conventional Commits** per `commitlint.config.cjs` — lowercase, ≤100 chars, with `Co-Authored-By:` footer.
- **Lint zero-warnings** — `pnpm lint` must pass with `--max-warnings=0`. Same for `cargo clippy --workspace --lib -- -D warnings -D unsafe-code`.
- **Type strictness** — TypeScript pinned at 5.9.3 across workspace via `pnpm.overrides`. `tsc --noEmit` must pass for every PR.
- **Tests must increase, not decrease** — every PR adds tests for new behavior.

### Locked rules from `CLAUDE.md` (must remain locked)

- **Never hardcode model IDs.** Read from `models.json`. Provider matching uses `apps/cli/src/models.rs` (12 named providers + 1 user-defined Custom). Era: GPT-5.4, Claude 4.6, Gemini 3.1, Grok 4.
- **Web-search before stating facts** about competitors / libraries / current product features. Knowledge cutoff is January 2026; current date is 2026-05-09.
- **License remains PROPRIETARY.** Code lifted from open source carries an SPDX-style attribution header and an entry in `THIRD_PARTY_LICENSES.md`.

### Test coverage targets per phase

- **Foundation sprint exit (week 6)**: 70% line coverage on all new architecture code (`packages/runtime/`, `packages/llm-runtime/`, `services/api-gateway/src/worker/`).
- **Hobby launch (week 8)**: 60% line coverage on every code path that handles user money or user data (Stripe webhooks, OAuth, message persistence).
- **Pro launch (week 14)**: 80% line coverage on the critical-path agent loop, MCP transports, permission engine, subagent dispatcher.
- **Enterprise readiness (week 26)**: 85% line coverage on all auth/admin/audit paths.

### Documentation requirements

- **Every public API has a typed signature + 1-line docstring + at least 1 usage example.** Enforced via TypeDoc on `packages/*` and `cargo doc --no-deps` on Rust crates.
- **Architecture decisions** logged at `docs/decisions/YYYY-MM-DD-{title}.md` (ADR format). The 5 strategic decisions in `tasks/research/strategic-decisions-2026-05-09.md` should be promoted to formal ADRs.
- **Per-surface CHANGELOG.md** maintained automatically via the release pipeline.
- **Reference docs** for every authoring surface: `docs/skills-authoring.md`, `docs/plugin-authoring.md`, `docs/mcp-authoring.md`, `docs/hooks-reference.md`, `docs/subagent-guide.md`, `docs/computer-use-guide.md`, `docs/dispatch-guide.md`, `docs/settings-json-reference.md`.

### Security baseline

- **`SECURITY.md`** at repo root with PGP key + 30-day triage SLA + scope (in scope: production app, API, infrastructure; out of scope: theoretical attacks, social engineering).
- **`PRIVACY_POLICY.md`** at repo root + `apps/web/app/privacy/page.tsx`.
- **`TRUST.md`** at repo root summarizing compliance posture (SOC 2 in progress, GDPR ready, etc.).
- **All third-party dependencies** scanned via `cargo audit` (Rust) + `pnpm audit` (Node) on every PR. Ignore list lives in `.cargo/audit.toml` and `.npmrc` with per-entry justifications.
- **No secrets in repo, ever.** Husky `pre-commit` hook scans for AWS/Anthropic/OpenAI/Stripe/GitHub key prefixes. CI rejects commits that introduce them.
- **OS sandbox primitives** (Seatbelt + bwrap + Landlock + Job-Object) wrap every shell command before VM hosts ship.

### Sub-agent orchestration discipline (specific to your AI-velocity workflow)

- **Maximum 3 concurrent sub-agent teams.** More than that exceeds coordination capacity even with AI assistance.
- **Each sub-agent task scoped at ≤8 hours of work.** Larger tasks fragment into multiple sub-agents.
- **Foundation merges land before dependent feature work.** Architecture changes must merge first; feature work rebases.
- **Daily integration cadence.** At end of each working day, integrate sub-agent outputs into main. Long-lived branches lead to merge conflicts and architectural drift.
- **Agent reports verified before action.** Per `MEMORY.md`: "Audit-the-auditor. When teammates report findings, verify with file:line quotes before acting. Prior audit had 4-of-12 P0s reclassified during verification." Apply this rigorously.
- **Test coverage gate per agent task.** Sub-agent task-completion criteria must include: tests added or updated, lint clean, type-check clean.

### CI/CD pipeline standards

- **All 8+ GitHub workflows kept green.** `ci.yml`, `release.yml`, `release-desktop.yml`, `build-windows-release.yml`, `e2e-tests.yml`, `deploy-signaling-server.yml`, `codeql.yml`, plus the model-id regression check.
- **SHA-pinned third-party actions** per `actions-pinned-check.yml`. No mutable tags.
- **Per-surface release pipeline**:
  - CLI: `cargo build --release` → install.sh + npm + Homebrew + cargo install.
  - Desktop: Tauri bundle + Apple notarization (after APPLE\_\* secrets ship) + Microsoft Store MSIX + Linux .deb/.rpm/.AppImage signed.
  - Web: Vercel deploy on push to main.
  - Mobile: EAS build + iOS App Store + Google Play Store.
  - Chrome ext: Chrome Web Store auto-publish on tagged release.
  - VS Code ext: `vsce publish` on tagged release.
- **Auto-update** for desktop on Stable channel weekly.

### Operational standards

- **Status page** at `status.agiworkforce.com` from week 8 onward.
- **Telemetry / observability** via OpenTelemetry exporters from week 6 onward (Foundation sprint adds the infrastructure).
- **Error tracking** via Sentry from week 6 onward.
- **Customer support** via plain email until Pro launch; transition to a help desk (Plain or Linear support) at Pro launch.

---

## 7. Risks I'm Honor-Bound to Flag

You overrode my recommendation on every one of the 5 decisions. That is your prerogative as founder, and I executed your decisions in this plan. But honest risk flagging is part of the deliverable:

1. **Maximalist + Both-equal + 3-VM-parallel as a solo founder** is the most aggressive scope I have ever seen committed by a solo operator. AI velocity makes it _possible_; it does not make it _easy_. Burnout risk is real over 24 months. Watch for personal sustainability signals weekly.

2. **The 4-month feature freeze during Foundation sprint** delays Hobby launch from week 3 to week 8. Five weeks of "nothing visible to users" can be morale-hard. Trust that the foundation pays back 10× in the parity push.

3. **3-VM-parallel kernel-level work** does not always parallelize cleanly. Driver bugs, security boundary issues, and OS-specific quirks may force serialization mid-sprint. Have a fallback plan: if VM-parallel becomes serial, the Hobby launch slips to week ~10–12.

4. **Strategic acquisition is a market-conditional outcome.** If AI consolidation slows in 2027, acquirers may not be acquiring. Have a Plan B: if no acquisition by month 18, raise a Series A on the revenue + parity story and continue the bootstrap-then-scale path.

5. **Feature parity moves while you build.** Anthropic ships new features during your 24-month window. The gap-matrix percentage at acquisition time may be lower than 80% even if you ship perfectly to plan, because Anthropic adds features faster than you close. Build acquirer narrative around the four moats they cannot copy, not raw parity percentage.

These risks are flagged, not blocking. You have made the call. Execute.

---

## 8. Immediate Actions for the Next 7 Days

To start the Foundation sprint cleanly:

- **Day 1 (today)**: Commit this plan + the 5 decisions ADR. Tag `v0.6.0-pre-foundation`.
- **Day 1–2**: `supabase db push` canonical migrations to production. Verify Stripe webhook idempotency end-to-end with Stripe test-mode replay.
- **Day 2–3**: Spawn the 3 VM sub-agent teams (Apple VF on macOS, Hyper-V on Windows, KVM/Firecracker on Linux). Each team writes its own kickoff design doc to `docs/architecture/vm-{macos,windows,linux}.md`.
- **Day 4–5**: **Build the desktop Dispatch listener**. Implement `dispatchHmac` + `dispatchSalt` verification. End the transitional unsigned-message path. Test mobile → desktop dispatch end-to-end. _This must ship before 2026-06-05._
- **Day 5–7**: Begin Foundation sprint Week 2 work — `createStore` + `onChangeAppState` + `messageQueueManager` design docs and first implementations.

By end of day 7, you should have: VM teams kicked off, Dispatch listener live, Stripe verified in production, Foundation sprint week 1 deliverables shipped.

---

_This plan is the source-of-truth for AGI Workforce strategic execution from 2026-05-09 through acquisition close. Update via formal ADR in `docs/decisions/` if any of the 5 strategic decisions revisit. The 25-agent gap-matrix research and the May 2026 Anthropic suite inventory remain at `tasks/research/gap-matrix/` and `tasks/research/anthropic-claude-suite-may-2026.md` for reference._
