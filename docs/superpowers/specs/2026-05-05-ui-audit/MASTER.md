# Master Cross-Surface UI/UX Audit — 2026-05-05

> Synthesizes 6 per-surface audits comparing `apps/{desktop,web,mobile,cli,extension,extension-vscode}` to 219 competitor reference screenshots in `~/Desktop/reference/ui/`. Source docs: see Appendix.

---

## Executive summary

Six surface engineers ran read-only audits in parallel. They opened ~100 of the 219 competitor screenshots, walked the corresponding code paths, and produced 1,185 lines of structured gap analysis. Three patterns dominate.

**Theme 1 — Multi-provider identity is invisible.** Our locked differentiator (10+ providers; CLI confirms 13 wired at `models.rs:287-304`) is buried by every surface's model picker. Web shows a colored dot + name, mobile shows a flat list, desktop has tier badges but no provider logos, CLI has no interactive picker at all, Chrome shows 13 unbadged options, VSCode is a flat QuickPick. Every audit flagged this independently. The competitive references — even single-vendor ones — out-design us on visual provider identity. This is the single highest-leverage cross-surface fix.

**Theme 2 — Permissions / mode UX is fragmented.** Plan mode, "Ask vs Act," reasoning effort, and bypass permissions are all wired in code (Rust `tools.rs:193, 2198`, mobile AutoApproveToggle, CLI 5-mode enum, VSCode boolean setting) but expressed as different UI primitives on each surface — composer pill, status bar chip, slash command, settings toggle, separate webview panel. A unified "agent control bar" pattern would replace 5 inconsistent designs. Desktop and VSCode rate this **P0**; CLI and mobile rate it **P1**.

**Theme 3 — Billing / usage / upgrade surfacing is inconsistent.** Web has no billing tab at all (P0). Desktop has no in-app pricing surface (P1). Mobile has Manage Subscription but no tier-comparison upsell (P1). CLI has no proactive quota warning (P1). VSCode has no usage meter despite tracking tokens (P1). Chrome correctly omits this (BYOK = free forever). Without a coherent strategy, we will lose Hobby-tier conversions and confuse BYOK users about what is and isn't billed.

**Worst-shape surface: VSCode extension.** Two P0 REBUILDs (modes dropdown, unified action sheet). The shipped UI lags the published "Multi-provider AI coding assistant — 10+ providers" marketing claim — the picker doesn't even group by provider.

**Best-shape surface: web chat thread layer.** ThinkingBlock + markdown + ToolTimeline + InlineSearchResults are wired and largely at parity. Web's gaps are settings-IA and connector-gallery polish, not chat fundamentals.

The implementation-order recommendation in §5 sequences fixes around the unified design-system opportunity in §1 rather than per-surface.

---

## 1. Cross-surface design system gaps

The 6 audits independently surfaced patterns that should be unified primitives but exist as 6 different implementations.

### 1.1 Model picker (highest-impact unification opportunity)

| Surface | Current state                                                                       | Verdict        |
| ------- | ----------------------------------------------------------------------------------- | -------------- |
| desktop | Radix Popover, provider-grouped, tier badges, no thinking-effort, no provider logos | ADJUST P1      |
| web     | Searchable popover, provider-colored dot + name, no logos, no thinking inline       | ADJUST P1      |
| mobile  | Bottom sheet, search, auto-mode cards, flat list, no provider badge per row         | ADJUST P1      |
| cli     | `/model <name>` only — no interactive selector                                      | REBUILD **P0** |
| chrome  | 13 models in dropdown, no icons, no descriptions, no thinking toggle                | ADJUST **P0**  |
| vscode  | Flat QuickPick, no provider grouping, no inline badge in chat header                | ADJUST P1      |

**Unification**: define one shared design pattern — provider logo (16 px) + model name + capability sub-label + thinking-toggle for supported models — then implement it natively on each surface (Tauri, Next, RN, Ratatui widget, Chrome side panel, VS Code QuickPick). The capability vocabulary (`Fastest / Balanced / Most capable`) and provider icon set need to live in `packages/types` so all 6 consume from one source.

### 1.2 Permissions / agent-control bar

References show this as a single "mode + effort" cluster bottom-left of composer. We've split it across 5 different UIs.

| Surface | Today                                                               | Reference pattern                                     |
| ------- | ------------------------------------------------------------------- | ----------------------------------------------------- |
| desktop | Web-search/research toggles only; plan_mode wired in Rust but no UI | `codex-desktop/04` permissions dropdown + plan toggle |
| web     | No mode picker                                                      | `claude-vscode/05` modes dropdown + effort slider     |
| mobile  | AutoApprove + TempChat as always-visible toggles                    | Move into AddToChatSheet                              |
| cli     | 5 modes via `cli_options.rs:19`, no shift+tab cycle                 | `claude-code/01` shift+tab cycle                      |
| chrome  | None (deferred — desktop is the brain)                              | `claude-chrome/02` ask vs act                         |
| vscode  | Boolean setting + separate webview panel                            | `claude-vscode/05` inline picker                      |

**Unification**: an "AgentControl" component with three columns — mode (Ask / Auto / Plan / Bypass) + effort (Low / Medium / High / Max) + temporary-chat toggle — surfaced in the composer footer on every surface that has one. Per-surface implementation differs but the data contract is shared.

### 1.3 Profile popover / user identity

Web has none in chat (`features/chat/components/Main/ChatHeader.tsx:50`). Desktop's lacks a usage meter. Mobile's is a full-screen profile screen with no tier upsell. VSCode has nothing. CLI has only `/cost` and `/status` on demand. Chrome has none.

**Unification**: one popover spec — avatar, email, plan badge, inline usage % with quota expiry, Settings link, Upgrade CTA, Logout. Web and desktop render as Radix popover; mobile renders as bottom sheet; VSCode renders inside the unified action sheet (gap §1.2 above also lives here); CLI renders as `/whoami` panel.

### 1.4 Settings information architecture

| Surface | Tabs/sections               | Gaps                                                           |
| ------- | --------------------------- | -------------------------------------------------------------- |
| desktop | 10 flat tabs                | no Billing, no Connectors landing page; flat list noisy        |
| web     | 6 tabs                      | no Billing, no Notifications                                   |
| mobile  | 5 SectionList groups        | settings redirect bug at `app/(app)/settings/index.tsx:6` (P0) |
| cli     | `/config key value` only    | no in-session interactive panel                                |
| chrome  | hidden in side panel toggle | functional, low-polish                                         |
| vscode  | native settings editor      | advanced settings surface at top, no grouping                  |

**Unification**: a shared settings IA spec with 4 top-level groups — **Account**, **Interface**, **AI**, **Extensions** — that maps to native idioms on each surface. The category names live in `packages/types`; surface implementations choose layout.

### 1.5 Connectors gallery

Two surfaces have galleries (desktop, web). Both lack the `All / Connected / Available` filter tab and a `Add custom connector` CTA. Desktop also lacks per-tool permission-level dropdowns (`Always allow / Needs approval / Blocked`) which is the single highest-impact P0 from the desktop audit. Mobile has no gallery; chrome funnels through desktop bridge.

**Unification**: shared connector schema (with permission-level enum per tool) consumed by desktop + web galleries. Cross-surface decision needed on storage (see §4 D-1).

### 1.6 Inline rendering primitives (thinking blocks, tool steps, artifacts)

Stacked tool steps render heavy on every surface — `claude/claude-chat-artifacts-and-tools/08` shows the compact pattern: "Ran 5 commands, created a file >". We expand all steps inline. Three audits flagged this (desktop P1, web P1, plus mobile's thinking-bottom-sheet variant).

**Unification**: collapse multi-step tool runs into a single summary line during streaming, expandable on click. Implement once in `packages/chat` (used by desktop + web), then port the pattern to mobile's `MessageBubble` and VSCode's webview.

---

## 2. Prioritized punch list (top 30 across all surfaces)

Sort: **P0 first, then by Impact ÷ Effort**. S=1, M=2, L=3, XL=4 for the divisor.

| #   | Pri | Surface | Title                                                                  | Ref                             | Our path                                                    | Effort | Impact |
| --- | --- | ------- | ---------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------- | ------ | ------ |
| 1   | P0  | mobile  | Settings redirect bug → fix to `/(app)/(tabs)/settings`                | (bug)                           | `app/(app)/settings/index.tsx:6`                            | S      | 3      |
| 2   | P0  | cli     | Interactive model picker with provider grouping                        | `codex-cli/13`                  | `apps/cli/src/repl.rs:505`                                  | M      | 5      |
| 3   | P0  | chrome  | Multi-provider model selector — icons + descriptions + thinking toggle | `claude-chrome/05` + `comet/03` | `src/side_panel.ts:905`                                     | M      | 5      |
| 4   | P0  | desktop | Plan-mode toggle + permissions dropdown in composer                    | `codex-desktop/02,04`           | `packages/chat/src/components/ChatInput.tsx:50`             | M      | 5      |
| 5   | P0  | desktop | Connector per-tool permission levels (Always/Approval/Blocked)         | `claude-desktop/23`             | `apps/desktop/src/components/Connectors/ConnectorCard.tsx`  | L      | 5      |
| 6   | P0  | web     | Settings: add Billing + Notifications tabs                             | `claude-desktop/11`             | `features/settings/pages/SettingsPage.tsx:5`                | M      | 4      |
| 7   | P0  | web     | Profile popover with plan badge + upgrade CTA in chat                  | `claude-desktop/20`             | `features/chat/components/Main/ChatHeader.tsx:50`           | M      | 4      |
| 8   | P0  | vscode  | Modes dropdown (Ask/Auto/Plan/Bypass) + effort slider in composer      | `claude-vscode/05`              | `package.json:585` (boolean only)                           | L      | 5      |
| 9   | P0  | vscode  | Unified action / settings sheet replacing 3 icon buttons               | `claude-vscode/06`              | `src/providers/sidebarProvider.ts:444`                      | L      | 5      |
| 10  | P1  | desktop | Profile popover: inline usage / quota meter + Upgrade CTA              | `codex-desktop/17`              | `packages/chat/src/components/UserProfile.tsx`              | S      | 4      |
| 11  | P1  | mobile  | Composer toolbar crowding — move AutoApprove/TempChat to sheet         | `chatgpt-desktop/18`            | `components/chat/ChatInput.tsx:296`                         | S      | 4      |
| 12  | P1  | cli     | Reasoning/effort `/effort` slash command + interactive picker          | `codex-cli/14`                  | (none)                                                      | S      | 4      |
| 13  | P1  | cli     | Sandbox indicator in TUI footer (red when off)                         | `gemini-cli/16`                 | `apps/cli/src/tui/bottom_pane/footer.rs`                    | S      | 3      |
| 14  | P1  | cli     | Rate-limit/quota warning at launch when <10%                           | `codex-cli/08`                  | (none)                                                      | S      | 3      |
| 15  | P1  | mobile  | Dispatch attachment button no-op                                       | (bug)                           | `app/(app)/dispatch/index.tsx:278`                          | S      | 3      |
| 16  | P1  | mobile  | About screen hardcoded version → read from `Constants.expoConfig`      | (bug)                           | `app/(app)/about.tsx:14`                                    | S      | 2      |
| 17  | P1  | web     | Empty state plan badge chip (Free/Hobby + Upgrade)                     | `claude-desktop/01`             | `features/chat/components/GreetingBanner/useGreeting.ts`    | S      | 3      |
| 18  | P1  | chrome  | Page-context chip in composer bar (persistent hostname)                | `comet/01`                      | `src/side_panel.ts:1504`                                    | S      | 3      |
| 19  | P1  | chrome  | Auth bar conditional on bridge disconnect + key absence                | (differentiator)                | `src/side_panel.ts:746`                                     | S      | 3      |
| 20  | P1  | chrome  | Model dropdown description sub-labels                                  | `claude-chrome/05`              | `src/side_panel.ts:44`                                      | S      | 3      |
| 21  | P1  | vscode  | Inline completions: flip default to `true` + first-run explainer       | (standard)                      | `package.json:567`                                          | S      | 4      |
| 22  | P1  | vscode  | Marketplace README with screenshots + provider list                    | `claude-vscode/01`              | (none — package.json desc only)                             | S      | 4      |
| 23  | P1  | desktop | Model selector: thinking-effort axis                                   | `chatgpt-desktop/09`            | `packages/chat/src/components/ModelSelector.tsx`            | M      | 4      |
| 24  | P1  | desktop | Stacked tool-step compact summary line                                 | `claude-artifacts/08`           | `packages/chat/src/components/ThinkingBlock.tsx`            | M      | 3      |
| 25  | P1  | desktop | In-app plans/pricing comparison surface                                | `claude-desktop/35`             | `apps/desktop/src/App.tsx`                                  | M      | 4      |
| 26  | P1  | web     | Connectors gallery: All/Connected/Available + custom connector CTA     | `perplexity/08`                 | `features/connectors/pages/ConnectorsPage.tsx:801`          | M      | 4      |
| 27  | P1  | web     | Compact stacked tool-use summary                                       | `claude-artifacts/08`           | `features/chat/components/messages/ToolTimeline.tsx`        | M      | 4      |
| 28  | P1  | web     | Composer plus-menu: cloud sources + connectors sub-menus               | `perplexity/02`                 | `features/chat/components/Composer/ChatComposerNew.tsx:75`  | M      | 4      |
| 29  | P1  | web     | Inline artifact thumbnail cards in message thread                      | `claude-artifacts/05,17`        | `features/chat/components/artifacts/ArtifactsPanel.tsx:169` | L      | 4      |
| 30  | P1  | mobile  | Profile lacks tier upsell CTA when free-plan                           | `claude-desktop/35`             | `app/(app)/profile/index.tsx:177`                           | M      | 4      |

Items 31+ deferred to per-surface specs.

---

## 3. Contradictions between surfaces

Where the 6 audits disagree on what the right pattern is.

**C1 — Artifact panel layout.** Desktop wants a docked persistent right pane (`claude-desktop/05` three-pane). Mobile correctly says the right-pane pattern doesn't translate (touch viewport too narrow) and proposes a full-screen modal. **Resolution:** `packages/chat` should treat the artifact surface as a slot with two implementations — `RightPane` (desktop/web ≥1024px) and `FullScreen` (mobile + desktop/web <1024px). Web should have both responsive.

**C2 — Settings layout.** Desktop audit suggests regrouping 10 tabs into sections. Mobile audit says the single-column SectionList is the correct mobile idiom and a Claude-style left-rail tab navigation is anti-pattern on touch. **Resolution:** shared IA categories in `packages/types`, but layout primitives are surface-native — desktop = grouped tabs, web = grouped tabs, mobile = SectionList, VSCode = native settings editor with grouping hints, CLI = Ratatui overlay.

**C3 — Provider identity treatment.** Chrome's audit says "show 13 models with neutral icons, no provider hierarchy". CLI's audit says "do not collapse provider list to feature one brand". Mobile's audit asks to highlight provider color/logo per row. Web wants logos _and_ a "Best (auto)" first option. **Resolution:** all four are compatible — provider logo neutral + auto-balanced surfaced first as a category, not as a brand. Locked into the unification spec in §1.1.

**C4 — Onboarding flow.** Mobile audit wants Local/BYOK mode picker in onboarding (Local mode is desktop-only per locked spec, but BYOK applies). Desktop already has this in OnboardingWizard. Web doesn't have onboarding at all (auth-first SaaS). CLI has 4-option `dialoguer::Select`. VSCode and Chrome use desktop bridge / extension config. **Resolution:** the mode picker is a _desktop-and-CLI_ concept; mobile + web get a "Cloud mode connecting to BYOK or Hobby" status chip, not a picker.

**C5 — Plan-mode persistence.** Desktop asks: per-conversation or global setting? CLI has it as a `PermissionMode` enum with cycle. VSCode has it as a boolean setting. Mobile doesn't surface it at all. **Resolution:** see Decision §4 D-3.

---

## 4. Cross-surface product decisions needed

Five decisions block per-surface specing. Each frames as "Question — A / B / C — recommendation."

**DECISION 1 — Connector permission storage.**
Where does per-connector and per-tool permission config live for BYOK/Local users who aren't authenticated to Supabase?

- A. Cloud-first — store in `connectorsStore` Supabase table; require login for any connector use.
- B. Local-first — store in `~/.agiworkforce/connectors.json` (encrypted) on desktop, AsyncStorage on mobile.
- C. Hybrid — local for BYOK/Local users, Supabase for Cloud users, sync on auth.
- **Recommendation: C.** Matches the `Local mode (Desktop only)` vs `Cloud mode` architecture already in the project memory. Detection via `packages/runtime/src/detect.ts` (`isTauri`, `isCloudWeb`).

**DECISION 2 — Billing-tab destination.**
Stripe portal redirect or inline subscription summary?

- A. Portal redirect from a "Manage Billing" button — simpler, official Stripe UX.
- B. Inline summary with plan, usage, next-charge date; "Manage in portal" as secondary.
- C. Surface-dependent — desktop/web inline (B), mobile/VSCode portal (A).
- **Recommendation: B for desktop + web; A for mobile + VSCode.** Mobile App Store rules complicate inline subscription management; VSCode marketplace already requires external links.

**DECISION 3 — Plan-mode + agent-mode scope.**
Per-conversation, global, or per-project?

- A. Per-conversation — each chat carries its own mode state. Highest fidelity, most state.
- B. Global setting — one mode at a time, persists in `settingsStore`.
- C. Per-project — projects override global; conversations inherit from project.
- **Recommendation: C.** Aligns with the existing project model and matches `codex-desktop`'s `Settings → Configuration → approval policy` per-project pattern.

**DECISION 4 — Skills library scope.**
Prompt shortcuts only or merge with AI Skills agents?

- A. Two surfaces — `Skills` for prompt shortcuts, `AI Skills` for the 150+ specialist agents.
- B. Unified — one Skills page with `Prompts` and `Agents` tabs. AI Skills become a sub-type.
- C. Drop AI Skills surface entirely — agents become invocable from connectors gallery.
- **Recommendation: B.** Two surfaces with overlapping vocabulary is the kind of fragmentation users punish. Web audit already flags this.

**DECISION 5 — Reasoning effort vocabulary.**
What word do we use UI-wide for the thinking/effort axis?

- A. `Effort` (matches Codex; concrete; not loaded with vendor brand).
- B. `Reasoning` (matches Claude Code; conceptually clear; longer).
- C. `Thinking` (matches Gemini and Anthropic-Extended-Thinking; one-word; vendor-loaded).
- **Recommendation: A `Effort`.** Provider-neutral, matches our 13-provider stance, easy to localize. Slash command becomes `/effort`. Per-provider mapping (Anthropic `thinking` budget, OpenAI `reasoning_effort`, Gemini `thinking_budget`) lives below the UX layer.

---

## 5. Recommended sequencing

The cross-surface unification work in §1 should drive the implementation order, not per-surface gap counts.

**Phase 0 — Decisions (this week, no code).**
Get user answers on D1–D5. They unblock everything downstream.

**Phase 1 — Bug fixes + design system primitives (week 1).**

- Mobile P0 redirect bug (#1) — 1 PR, S effort.
- Mobile P1 bugs (#15, #16) — 1 PR, S effort.
- Define `packages/types` additions: provider icon set, capability vocabulary, connector permission enum, settings IA categories, agent-mode contract. No surface-side code yet.
- VSCode marketplace README (#22) — independent, S effort.

**Phase 2 — Provider identity unification (weeks 2–3, 5 surfaces in parallel).**
The unified model picker (§1.1) lands on all 5 interactive surfaces in parallel: desktop, web, mobile, chrome, vscode. CLI gets the interactive picker (#2) as the most novel work — it's a REBUILD vs the others' ADJUST. This phase ships the highest-leverage cross-surface gap and validates that the `packages/types` contract holds.

**Phase 3 — Permission/agent-control bar (weeks 3–5, 4 surfaces).**
Desktop (#4), VSCode (#8), CLI keyboard cycling, mobile sheet refactor (#11). Web defers because composer is feature-complete enough to wait. Chrome defers per architecture (no local agentic actions).

**Phase 4 — Billing + profile + usage (weeks 4–6).**
Web Billing tab (#6), Web profile popover (#7), Desktop usage meter (#10), Mobile tier upsell (#30), CLI rate-limit warning (#14), VSCode usage meter. Phase 4 is the entire "monetization surface" punch list — should land before any Hobby tier launch announcement.

**Phase 5 — Connectors permission model (weeks 5–7, desktop + web).**
Desktop per-tool permission dropdown (#5), Web filter tabs + custom CTA (#26), shared connector schema. Gated on Decision 1.

**Phase 6 — Long-tail polish (weeks 6–10).**
Items 17–29, plus the 80 P2 items in the per-surface docs. Run by surface engineers as background work.

**Estimated weeks per surface (total spec → ship):**

- Desktop: 6 weeks
- Web: 5 weeks
- Mobile: 4 weeks (smaller surface area + bug-heavy)
- CLI: 5 weeks
- Chrome: 3 weeks
- VSCode: 4 weeks

Critical-path: Phase 0 → Phase 2 → Phase 3 → Phase 4. Phase 5 + 6 can run in parallel with each other from week 6.

---

## 6. Anti-pattern roundup (deduped)

Things competitors do that we should NOT copy. Curated from sections D of all 6 audits.

1. **Single-vendor model selectors.** Claude/Codex pickers feature only their own brand. We have 13 providers and BYOK; a mono-brand picker would erase our differentiator. Universal across all 6 surfaces.
2. **Paid-plan lock-out banners or modal upgrade CTAs.** Claude Chrome ext's "paid plan required" banner, Claude Code's "Max/Pro required" auth error, Codex's "Codex App with 2x rate limits" tip. BYOK + Local LLM is free forever — never gate the tool on a subscription.
3. **Vendor-branded "Anthropic-reviewed" trust badges on connectors.** Our connectors are MCP (user-controlled). Replicating "Anthropic reviewed" would be misleading.
4. **Rate limits framed as user fault.** Codex's "Rate limits remaining 6%" with blunt "Upgrade to Pro" treats the user's quota as a one-way street. For BYOK users, the quota is _their_ API key's, not ours — language must distinguish "your key's limits" from "our managed plan limits."
5. **Inline cloud-vendor rich embeds (Google Maps, YouTube, Flights).** Gemini's iframe-based vertical content embeds depend on Google's data pipelines. Our equivalent should be MCP-sourced structured cards, not iframe captures of competitors' UIs.
6. **Vertical-commerce surfaces.** Perplexity's Shopping/Travel/Finance settings are tied to its search-engine identity. Our differentiator is multi-provider agent work; verticalizing dilutes focus and pulls partner-negotiation overhead.
7. **"Gift Claude" / partner perks bundles.** Consumer-loyalty plays. Our revenue model is BYOK + Hobby + waitlisted Pro/Max — gifting and partner-bundles add complexity for negligible benefit pre-Pro GA.
8. **Multi-column connector/skill grids on phone.** Three- or four-column grids work on tablet/desktop; on 375pt phone they crush tap targets. Use single/two-column on phone, grid only ≥768pt.
9. **Hover-triggered popovers on mobile.** Touch equivalent is a bottom sheet or full-screen profile. Don't replicate desktop popovers anchored to bottom-left avatars.
10. **"Bypass permissions" persistent footer label.** Appropriate for Anthropic's developer-trust model; for our 10+ provider surface, surfacing a raw "bypass" label without contextual framing creates trust mismatch.
11. **Policy / ToS prompt every launch.** One-time at first-run is correct; repeating per session erodes trust. We already mark `~/.agiworkforce/.setup_complete` — keep it.
12. **Quick-mode experimental warning modal.** Adds friction to a common action. If we add speed framing, surface as a badge change in the dropdown, not a blocking modal.

---

## 7. Appendix: 6 surface docs

| Doc     | Path                              | Engineer            | Top-of-list P0                                                   |
| ------- | --------------------------------- | ------------------- | ---------------------------------------------------------------- |
| Desktop | `desktop.md` (194 lines)          | desktop-engineer    | Connector per-tool permissions; plan-mode + permissions dropdown |
| Web     | `web.md` (200 lines)              | web-engineer        | Settings Billing + Notifications tabs; profile popover in chat   |
| Mobile  | `mobile.md` (173 lines)           | mobile-engineer     | Settings redirect bug fix                                        |
| CLI     | `cli.md` (216 lines)              | cli-engineer        | Interactive model picker                                         |
| Chrome  | `chrome-extension.md` (200 lines) | chrome-ext-engineer | Multi-provider model selector w/ icons + thinking                |
| VSCode  | `vscode-extension.md` (202 lines) | vscode-ext-engineer | Modes dropdown; unified action sheet                             |

All files in `docs/superpowers/specs/2026-05-05-ui-audit/`.

---

_Audit complete 2026-05-05. Read-only research artifact. No source code modified._
