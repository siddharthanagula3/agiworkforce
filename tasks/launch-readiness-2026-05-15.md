# Launch-Readiness Wave — 2026-05-15

**Mandate (from user 2026-05-15):**

> "main priority now is fully working 6 surfaces for the launch i want every part of agiworkforce to be completely optimized reviewed without any dead code everything should be completed their should be no incomplete or half done work… i also want my users to feel the same way when they use the product, they should not get any onboarding suggestions, they should directly dig in to work… similar Design present in the ~Desktop/reference/ my main aim is to get as much similarities from images as possible, especially the inline tool calling and the icons i like them so much"

**Non-negotiables:**

1. **Zero dead code / zero half-done features** across all 6 surfaces.
2. **No onboarding friction.** Users land directly in the working interface — no wizards, no welcome screens, no empty-state prompts that block work.
3. **Design parity with `~/Desktop/reference/`** — emphasis on **inline tool-calling UI** and **iconography**.
4. **All 6 surfaces fully wired** end-to-end. No mocks. No placeholders.
5. **Live web research** — WebSearch / WebFetch / context7 wherever a fact is asserted about a library or competitor.

---

## §1 — Surfaces in scope

| Surface     | Path                     | Stack               |
| ----------- | ------------------------ | ------------------- |
| CLI / TUI   | `apps/cli/`              | Rust + Ratatui      |
| Desktop     | `apps/desktop/`          | Tauri v2 + React    |
| Web         | `apps/web/`              | Next.js 14          |
| Mobile      | `apps/mobile/`           | Expo 55 + RN 0.83.6 |
| Chrome ext  | `apps/extension/`        | MV3                 |
| VS Code ext | `apps/extension-vscode/` | TypeScript          |

---

## §2 — Reference inventory

`~/Desktop/reference/ui/` (the design-relevant subset):

| Competitor            | Image count | Purpose                           |
| --------------------- | ----------- | --------------------------------- |
| `ui/claude/`          | 101         | Anthropic Claude.ai web + Desktop |
| `ui/perplexity/`      | 30          | Perplexity desktop + mobile       |
| `ui/codex-desktop/`   | 21          | OpenAI Codex desktop              |
| `ui/chatgpt-desktop/` | 18          | ChatGPT desktop                   |
| `ui/gemini-cli/`      | 16          | Gemini CLI                        |
| `ui/codex-cli/`       | 15          | Codex CLI                         |
| `ui/gemini-chat/`     | 13          | Gemini chat web                   |
| `ui/claude-code/`     | 5           | Claude Code CLI                   |

Plus `~/Desktop/reference/{codex-cli,gemini-cli,opencode,openclaw,claw-code}/` source mirrors for code-level reference.

Total images: **662** (across all subdirs; `ui/` ≈ 219).

---

## §3 — Phase 1: Recon (parallel)

### Recon-1 — Design Spec Extraction

Read every PNG in `~/Desktop/reference/ui/`. Produce `docs/design/design-spec-2026-05-15.md` documenting:

- Color palette (light + dark) — extract hex from chrome/sidebar/message bubbles.
- Typography scale — font families, weights, sizes, line-heights.
- Spacing system — paddings, gaps, sidebar widths, message-list rhythm.
- **Inline tool-calling UI** — exact pattern: how each competitor renders a tool invocation inline (icon + name + status + collapsible body), border styles, badge treatment, syntax highlighting.
- **Iconography** — stroke weight, fill style, size grid, source library (Phosphor / Lucide / Heroicons / custom?).
- Empty states + composer states — placeholder text, focus rings.
- Sidebar / conversation list / top bar treatment.

Output: design-spec doc + a 1-screen distilled palette + a 1-page inline-tool-call spec.

### Recon-2 — Onboarding-Friction Audit

Find every "welcome", "onboarding", "getting started", "first run" surface across all 6 apps. Catalog into `tasks/onboarding-audit.md`:

- File path + lines.
- Whether it blocks user from chat.
- Whether it survives multi-launch (or is shown only first time).
- Whether it can be deleted outright or just suppressed-by-default.

### Recon-3 — Dead Code & Half-Done Features

Sweep TODO/FIXME/HACK/XXX/@deprecated/placeholder + commented-out blocks > 5 lines + `unimplemented!()` / `todo!()` in Rust. Catalog to `tasks/dead-code-audit.md` per surface with categories: DELETE / COMPLETE / FLAG.

### Recon-4 — Inline-Tool-Call UI Audit

For each of the 6 surfaces, map existing tool-call rendering against the design spec from Recon-1. Output `tasks/tool-call-ui-audit.md` with surface × component matrix.

### Recon-5 — Icon System Audit

Survey current icon use across surfaces. Identify the library (or libraries — mismatch is a finding). Output `tasks/icon-audit.md`.

### Recon-6 — Cross-Surface Data-Flow Audit

Verify every API/data path: web/api/llm/v1/chat/completions, desktop bridge :8787, mobile dispatch, chrome ext native-messaging, vscode bridge, CLI provider clients. Output `tasks/integration-audit.md` with PASS/FAIL per route.

---

## §4 — Phase 2: Execution (parallel per surface)

Each surface engineer receives the design spec, the onboarding-audit, the dead-code-audit, and the integration-audit. Each must:

1. Implement design tokens / inline-tool-call UI / icon system parity per Recon-1.
2. Remove or suppress all blocking onboarding flows.
3. Delete categorized dead code.
4. Complete any half-built feature flagged in Recon-3 (or remove if not shippable).
5. Wire every remaining mock to a real backend.
6. Ship 1 commit per logical change. Verify tests/lint/typecheck green after each commit.

| Agent         | Surface               | Engineer type       |
| ------------- | --------------------- | ------------------- |
| `desk-launch` | apps/desktop          | desktop-engineer    |
| `web-launch`  | apps/web              | web-engineer        |
| `mob-launch`  | apps/mobile           | mobile-engineer     |
| `cli-launch`  | apps/cli              | cli-engineer        |
| `chr-launch`  | apps/extension        | chrome-ext-engineer |
| `vsc-launch`  | apps/extension-vscode | vscode-ext-engineer |

---

## §5 — Phase 3: System-wide hardening (parallel)

| Agent         | Scope                                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `perf-launch` | Bundle sizes, lazy loading, render perf, unused deps, source-map stripping. Run `pnpm build` per surface; if bundle regresses, fix. |
| `sec-launch`  | Exposed keys, insecure endpoints, missing auth guards, RLS bypass review (continue P1-1 from prior audit: 56 web API routes).       |
| `a11y-launch` | ARIA labels, keyboard nav, focus management across desktop/web. Run axe via Playwright where possible.                              |

---

## §6 — Phase 4: Verification

Run after all execution agents complete:

- `cargo test --workspace --lib` — target green.
- `pnpm typecheck:all` — target green.
- `pnpm lint` — target green.
- `pnpm test` — vitest across workspaces.
- `pnpm --filter web build` — production web build.
- `cargo build --release -p agiworkforce-cli`.
- `pnpm build:desktop` — Tauri bundle.
- Chrome ext `pnpm package` — extension.zip.
- VS Code ext `pnpm --filter agi-workforce build` — .vsix.
- Mobile `pnpm --filter @agiworkforce/mobile start` smoke.

Sign-off in `tasks/launch-readiness-2026-05-15.md` §7.

---

## §7 — Status

(updated as agents complete)

- [ ] Recon-1 Design spec
- [ ] Recon-2 Onboarding audit
- [ ] Recon-3 Dead-code audit
- [ ] Recon-4 Inline-tool-call audit
- [ ] Recon-5 Icon audit
- [ ] Recon-6 Integration audit
- [ ] Phase 2 desk-launch
- [ ] Phase 2 web-launch
- [ ] Phase 2 mob-launch
- [ ] Phase 2 cli-launch
- [ ] Phase 2 chr-launch
- [ ] Phase 2 vsc-launch
- [ ] Phase 3 perf-launch
- [ ] Phase 3 sec-launch
- [ ] Phase 3 a11y-launch
- [ ] Phase 4 verification

---

## §8 — Operating constraints (reiterated)

- **Commit message style**: lowercase, ≤100 chars, Conventional Commits, `Co-Authored-By:` footer. commitlint enforces.
- **Push policy**: push to `origin/main` after each wave per user authorization.
- **No emojis in code or commits** unless user explicitly asks.
- **No new docs (.md) without explicit ask**, EXCEPT design-spec / audit outputs which the user implicitly requested (per "write it down" + "complete exploration report" deliverables).
- **Web tools mandate**: every fact asserted about competitors or library APIs must be web-verified.
