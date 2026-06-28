# Desktop Production Plan (Surface 3 of 3)

Status: Planned (execute after Mobile ships)
Owner: Founder + desktop lead
Last updated: 2026-06-28
Sequence: Website → Mobile → **Desktop (this doc)**
Companion: `11-execution-playbook.md`, `09-reference-codebases.md` (odysseus), `03-code-reality-and-tech-debt.md`

Detailed plan to take **`apps/desktop` (Tauri v2 + React + Rust) to production**, using **odysseus** as the workspace-feature reference (learn/adapt, MIT — not copy). This is your strongest surface and your clearest technical differentiator (Rust/Tauri vs. the Electron incumbents). Follows the loop + IP rules in `11`.

---

## 0. How we test desktop

The repo already has: **Tauri v2** (`src-tauri/` with `Cargo.toml`, `tauri.conf.json`), **Playwright e2e + smoke** (`playwright.config.ts`, `e2e/`, `test:smoke`), **Vitest** (`test: vitest run`), a large **Rust test suite** (cargo), and release CI (`release-desktop.yml`, `build-windows-release.yml`).

**Toolchain:**

- **Vitest** — frontend unit/behavior.
- **Playwright** (`test:e2e`, `test:smoke`) — frontend flows against the web-rendered Tauri UI.
- **cargo test** — the Rust backend (commands, tools, policy, SSE parser).
- **computer-use MCP** — drive the _installed native app_ to verify Local/BYOK/Managed flows, MCP/connectors, and capture screenshots (the native-app equivalent of Chrome MCP for web).
- **Per-increment gate:** `pnpm --filter @agiworkforce/desktop typecheck` + Vitest + targeted `cargo test` + a Playwright/`test:smoke` flow + a computer-use-MCP screenshot.

---

## 1. Current state (audit-grounded)

~88–92% real — the **strongest surface**. ~1,500 Tauri commands, ~90 real tool executors, a real agentic streaming loop, artifact workbench, MCP direction, local generated files, and a 70KB battle-tested SSE parser. This is the local-private compute host incumbents don't offer.

**Gaps:**

- Settings IA vs. the locked spec.
- **R12:** AGI Code mode exists (`src/features/.../CodeModeHome.tsx`) but is **unmounted** in the V3 shell.
- **R4:** office-doc _editing_ ~50% stubbed (`edit_excel.rs`, `edit_word.rs`); creation works.
- **R8:** research email/calendar agents stubbed (`core/research/agents.rs`).
- **R9:** cross-platform speech gaps (local Whisper STT; non-mac TTS).
- **R3 (watch forever):** dormant Rust cloud-sync path must stay privacy-mode-gated.

**Production-ready (desktop):** signed/notarized macOS DMG + Windows installer; in-app updater; Local + BYOK + Managed modes visible and working; MCP/connectors with per-tool permissions; settings IA to spec; no unmounted/dead modes; office-doc editing finished or scoped; trust boundary provably gated; crash-free; e2e + smoke green.

---

## 2. Increment backlog (run in order after mobile ships)

| ID          | Goal                                                                                                                                                             | Source/learn                                                                           | Acceptance & test                                |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **DESK-0**  | Readiness baseline: Vitest + Playwright/smoke + cargo test; computer-use-MCP walk of Local/BYOK/Managed; green/red inventory                                     | —                                                                                      | inventory produced; suites run                   |
| **DESK-1**  | Settings IA to locked spec (General/Account/Privacy/Billing/Usage/Capabilities/Connectors/AGI Code/AGI in Chrome/Extensions/Developer)                           | `source-of-truth.md`                                                                   | all sections present + wired; e2e nav            |
| **DESK-2**  | Mount AGI Code into V3 shell **or** cleanly gate it (no orphaned mode)                                                                                           | `03` R12                                                                               | Code mode reachable or hidden; no dead entry     |
| **DESK-3**  | Finish office-doc editing **or** scope the claim to create + limited edit                                                                                        | `03` R4                                                                                | edit ops work or claim matches; `cargo test`     |
| **DESK-4**  | Research email/calendar agents: wire to connectors **or** hide                                                                                                   | `03` R8                                                                                | real results or hidden; no empty-stub UI         |
| **DESK-5**  | Cross-platform speech: local Whisper STT + non-mac TTS, or document support honestly                                                                             | `03` R9                                                                                | works on target OSes or scoped                   |
| **DESK-6**  | Trust boundary: keep dormant Rust cloud-sync gated; add egress contract tests                                                                                    | `03` R3; `11` INC-0.3                                                                  | Local never emits non-local calls (tests)        |
| **DESK-7**  | Workspace breadth (adapt from odysseus, MIT): pick highest-value for desktop v1 — deep research, documents, memory, "what-fits-this-machine" local-model serving | learn: odysseus `src/deep_research.py`, `services/hwfit` (`llmfit`), `src/llm_core.py` | chosen features work end-to-end; per-feature e2e |
| **DESK-8**  | macOS agent sandbox via Apple `container` (Apache) behind an abstraction; study codex/gemini sandbox profiles                                                    | `10` §7                                                                                | untrusted tool code runs isolated on macOS 26    |
| **DESK-9**  | MCP/connectors directory + per-tool permissions + SkillSpector vetting gate (shared w/ web)                                                                      | `10` §5                                                                                | install/permission flow; poisoned skill blocked  |
| **DESK-10** | Production hardening: in-app updater, error handling, crash reporting, performance, computer/browser-use approval gates                                          | —                                                                                      | updater works; approvals gate native actions     |
| **DESK-11** | Signed/notarized builds: macOS DMG (sign + notarize) + Windows installer (code-signed)                                                                           | `release-desktop.yml`, `build-windows-release.yml`                                     | signed artifacts; Gatekeeper/SmartScreen pass    |
| **DESK-12** | Release + smoke on installed build; rollback plan                                                                                                                | `release-desktop.yml`                                                                  | installed-app smoke green on macOS + Windows     |

---

## 3. Why odysseus is the right desktop reference

odysseus is the closest _product_ analog (local-first, privacy-first AI workspace) and is MIT, so we **learn and adapt its workspace concepts** — chat + agent + deep research + documents + memory + the hardware-aware "cookbook" model serving — into the Tauri/Rust desktop. Note the architectural translation: odysseus is a Python/web monolith for one trusted LAN user; AGI desktop is native Tauri/Rust with enforced Local/BYOK/Managed boundaries. So we take its _feature set and "make-local-actually-work" engineering_ (provider detection, tool parsing, model-fit scoring), not its code structure, and we never relax the trust boundaries that are the moat.

---

## 4. Sequencing & exit criteria

Run DESK-0 → DESK-12. **Desktop is "done" when:** signed/notarized builds install cleanly on macOS + Windows, Local/BYOK/Managed all work with correct trust labels, settings IA matches spec, no orphaned/dead modes, the trust-boundary egress tests pass, and installed-app smoke tests are green via computer-use MCP. That completes the three priority surfaces.

Operating model identical to `12` §4: I implement + verify in the working tree; you commit.
