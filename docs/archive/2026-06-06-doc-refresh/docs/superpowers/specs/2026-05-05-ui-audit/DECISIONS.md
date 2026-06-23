# Cross-Surface UI/UX Decisions — 2026-05-05

> Locks the 5 product decisions surfaced in `MASTER.md §4`. Locked by Claude on user delegation ("choose the best option yourself"). Each decision matches the recommendation in MASTER §4. User can override any of these by editing this file or replying with a change.

---

## D1. Connector permission storage — **HYBRID** (locked)

Where per-connector and per-tool permission config lives.

- **Local-mode users** (Desktop, runtime detected via `packages/runtime/src/detect.ts:isTauri && local`): config stored at `~/.agiworkforce/connectors.json` encrypted with the existing master password vault (`master_password.rs:1-769`).
- **Cloud-mode users** (Desktop / Web / Mobile signed into Supabase): config in the existing `connectorsStore` Supabase table with RLS.
- **Sync rule:** when a Local user signs in, their local config uploads on first sync; conflicts resolve by `updatedAt` last-write-wins.

**Why:** Aligns with the locked `Local mode (Desktop only)` vs `Cloud mode` architecture in MEMORY.md. Keeps BYOK/Local users fully usable without an account (a locked differentiator).

**Affects:** Desktop (#5 in punch list), Web (#26), Mobile, Chrome (defers to desktop bridge).

---

## D2. Billing tab destination — **INLINE on desktop + web, PORTAL on mobile + vscode** (locked)

How users manage their subscription.

- **Desktop + Web:** inline subscription summary card in Settings → Billing. Plan name, current period, usage %, next-charge date. "Manage in Stripe portal" as secondary link.
- **Mobile (iOS + Android):** "Manage Subscription" button only, opens Stripe customer portal in a system browser. No inline subscription display.
- **VSCode:** marketplace-required pattern — link to web app's billing page. No webview embed.

**Why:** Apple/Google App Store rules complicate inline subscription management on mobile. VSCode marketplace already requires external links for billing. Desktop and web have no such restrictions and benefit from in-context display.

**Affects:** Web (#6 — Billing tab now has clear scope), Desktop, Mobile, VSCode.

---

## D3. Plan-mode + agent-mode scope — **PER-PROJECT, conversations inherit** (locked)

Where mode state lives.

- **Project setting** (default): each project carries its own approval policy. Stored in the project record in Supabase (Cloud) or the project's `.agiworkforce/project.json` (Local).
- **Conversation override:** user can toggle mode per-conversation; the override does not propagate back to the project.
- **Global default:** workspace-level fallback for "Default" project — `~/.agiworkforce/config.toml` (CLI) / `settingsStore` (apps).

**Why:** Matches existing project model and aligns with `codex-desktop`'s `Settings → Configuration → approval policy` pattern. Per-conversation only would lose context across resumed sessions; global only would force uniform policy across mixed-trust projects.

**Affects:** Desktop (#4), VSCode (#8), CLI keyboard cycling, Mobile sheet.

---

## D4. Skills library scope — **UNIFIED page, Prompts + Agents tabs** (locked)

Where prompt shortcuts and AI Skills agents live.

- **One page** at `/skills` (web), `Skills` route (desktop), `Skills` drawer (mobile).
- **Two tabs:** `Prompts` (existing prompt-shortcut library) and `Agents` (the 150+ AI Skills specialist agents). Each tab has its own search.
- **Composer integration:** `$` trigger in composer opens a unified picker across both tabs.
- **AI Skills surface deprecated** as a separate page — its routes redirect to `/skills?tab=agents`.

**Why:** Two surfaces for "things you invoke from the composer" is exactly the kind of fragmentation users punish. Web audit flagged this independently (Web Q2). Unification reduces nav clutter and maps better to user mental model ("skills are things I can use").

**Affects:** Web (#22 in MASTER list — skills library page), Desktop, Mobile.

---

## D5. Reasoning effort vocabulary — **`Effort`** (locked)

Word used UI-wide.

- **UI label:** `Effort`
- **Slash command:** `/effort` (CLI + chat-thread slash menu)
- **Levels:** `Low` / `Medium` / `High` / `Max`
- **Per-provider mapping** (lives below the UX layer):
  - Anthropic: `thinking.budget_tokens` (4K / 16K / 32K / 64K)
  - OpenAI: `reasoning.effort` (low / medium / high / max)
  - Gemini: `generationConfig.thinkingConfig.thinkingBudget` (4K / 16K / 32K / 64K)
  - Local (Ollama / LMStudio): no-op (effort label still shown but not transmitted)

**Why:** Provider-neutral. Matches our 13-provider stance. Codex-style. Easy to localize. `Reasoning` is too long for a slash command and brand-loaded toward Claude Code; `Thinking` is brand-loaded toward Anthropic Extended Thinking and Gemini.

**Affects:** All 6 surfaces. Becomes the canonical vocabulary across docs, slash commands, model picker, and tool annotations.

---

## Reversal protocol

Any of these can be overridden. Edit this file (or tell me) and re-run the affected per-surface specs. If the override changes scope materially, the Phase 2+ implementation plans need re-baselining.

## Cross-references

- `MASTER.md §4` — decision menu with all options + reasoning
- `MEMORY.md` — Project SSOT, locked differentiators, mode architecture
- `~/Desktop/agiworkforce/AGI_WORKFORCE.md` — repo SSOT
