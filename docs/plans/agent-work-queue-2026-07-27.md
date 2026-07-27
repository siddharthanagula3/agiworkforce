# Agent Work Queue — 2026-07-27

Status: Current · Owner: Platform lead · Last updated: 2026-07-27

Derived from `chatgpt-claude-parity-gap-ledger-2026-07-27.md` (28 net-new gaps,
4 blockers) and `benchmark-block-inventory-2026-07-27.md` (395/395 mapped, 187
gaps). This file answers one question: **who unblocks what.**

Three lists: what I can do alone · what I don't know how to do · what only you
can supply. The benchmark questions are split out into
`benchmark-research-brief-2026-07-27.md`, which is self-contained and can be
handed to a researcher with no repo access.

---

## A. I can do these alone — no decisions, no credentials

Ordered by leverage, not size.

### A1. Highest leverage

| Item                                  | Why it's first                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B2 — expose checkpoints/worktrees** | `developer_host.rs:185-186` hardcodes both `false`. The capability already exists: `/rewind` (`tui_app.rs:2773`), `agent/history.rs`, `platform/runtime/worktree.rs` with enter/exit/list tools. VS Code parses both booleans and can never enable them. **One declaration gates the developer surface of three products.** Plumbing, not building. |

### A2. Cheap correctness — small diffs, real defects

| Item                                                  | Fix                                                                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **N5** CLI effort picker dead for non-Anthropic       | `models/streaming.rs:291` hardcodes `reasoning_effort: None`; `crates/agiworkforce-llm/src/stream.rs:930` already supports it. **One field.**                 |
| **N6** TUI `/voice` is a dead-end redirect            | 1,186-line dual-backend impl works in the REPL; TUI prints "run `agi --no-tui`" (`tui_app.rs:2929-2931`). UI wiring.                                          |
| **N9** Web voice settings                             | `settings/voice/page.tsx:15` hardcodes `hasVoice = false` → permanent "coming soon" banner beside a composer with working voice input.                        |
| **N21** Chrome slash menu                             | `expandSlashCommand` works at submit (`side_panel.ts:3269,3490`); the autocomplete menu is what's missing. Fix the menu, not the engine.                      |
| **N16** `/connect/<anything>` renders a pairing page  | Add an allowlist to `connect/[deviceType]`.                                                                                                                   |
| **N13** duplicate migration ordinal `0067`            | Add a duplicate-ordinal guard to `check-neon-migrations.mjs` (~3 lines).                                                                                      |
| **N3** stale waitlist/invite copy on mobile           | `EnvironmentOptionsSheet.tsx:130` (user-reachable via `/code`), `InviteCodeModal.tsx:444`, `/(app)/skills`. Contradicts the 2026-06-27 public-alpha decision. |
| **N12** mobile `settings/integrations.tsx`            | Dead duplicate of cloud-connectors with a fake "OAuth flow will open in your browser" alert. Delete.                                                          |
| **N15** dead desktop modules with user-facing strings | `api/googleBatch.ts` (zero importers, has an error toast); `ShareArtifactDialog.tsx:44` promises a gate concept that no longer exists.                        |

### A3. Bounded, judgment-light

- **N28 MCP version** — bump the advertised `2024-11-05` to `2025-11-25` and add
  real negotiation. **I will not jump to `2026-07-28` unread** — it is breaking
  and was finalising as this was written. See research brief §7.
- **N20** Chrome toolbar popup (no `default_popup` in the manifest today).
- **N26** Chrome downloads (`chrome.downloads` permission + action).
- **VS Code CSS token coverage** — the last surface outside the token guard.
- **Most of the 125 PARTIAL rows** — finishing work on code that already exists.

**Rough share: about two-thirds of the 187 gaps sit in section A.**

---

## B. I don't know how to do these

Not "haven't got to" — genuinely blocked on knowledge or judgment I don't have.

### B1. Blocked on benchmark knowledge (→ research brief)

| Gap                                                                    | What I'm missing                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Enterprise/admin console** (Shared = 36% built, our weakest surface) | I have **zero** benchmark evidence. `F-ADMN-01` is "admin console pane inventory" and I cannot tell you what panes ChatGPT Enterprise or Claude for Work have. I can't design toward a target I've never seen. → brief §1                                   |
| **H1/H2 autonomous skill creation** (the Hermes gap)                   | I know Claude's recorder captures screen+clicks+typing+voice and produces "a repeatable skill". I don't know **whether the model authors the name and description** — which is the entire architectural question. Ours makes the user type both. → brief §3 |
| **Work/Cowork surfaces**                                               | One screenshot each. I don't know the goal composer, plan approval, deliverable object, or steering model. Designing this from imagination would produce a plausible-looking wrong thing. → brief §2                                                        |
| **N17 ChatGPT Health**                                                 | 24 screenshots give me the UI. They tell me nothing about records ingestion, provider integrations, or data-handling posture. → brief §5                                                                                                                    |

### B2. Blocked on a product decision from you

1. **B1 SSO/SCIM — build or stop selling?** `/api/admin/sso` queries a table no
   migration creates, so it 500s, while `/enterprise` advertises "SAML 2.0 and
   OIDC. Okta, Azure AD, Google Workspace". The honest fix today is removing the
   claim. The real fix is schema + a WorkOS account.
2. **The orphaned desktop tree — delete or mount?** 444 of 576 feature files are
   unreachable. Five are _complete and unmounted_: `CodeWorkspace`,
   `TerminalWorkspace`, PR/diff review, `GovernanceDashboard`,
   `TeamAccountSettings`. Cheapest wins in the repo if you want them; a large
   deletion if you don't. **A 175-file legacy `features/chat/` tree shadows the
   live v3 components** (two Sidebars, two settings shells) — that part I'd
   delete regardless, it's the biggest wrong-edit risk we have.
3. **N4 messaging — one real channel, or delete the surface?** Today:
   `messaging_configs` + config/stats/test routes for WhatsApp/Telegram/Slack,
   **no sender anywhere, no UI**, and a "test connection" that only shape-checks
   credentials without contacting the platform.
4. **N24 mobile feature flags** — `iap`, `agents`, `dispatch`, `companion`,
   `messaging` are all `false` with complete UIs behind them. Which flip?
   Note `agents:false` sits beside a working cloud-task list; those two disagree.
5. **B4 vector retrieval on web** — desktop already ships the whole stack
   (`EmbeddingService`: generator, similarity, cache, incremental indexer). Port
   it, or use a hosted embeddings provider? This is a cost and dependency call.
6. **Skills format** — adopt `agentskills.io` for portability, or stay
   proprietary? Contingent on brief §3.1 confirming the standard is real.

### B3. I can do it, but I shouldn't decide it alone

- **H6 remote execution backends** (Hermes ships six: local, Docker, SSH,
  Singularity, Modal, Daytona). Which, in what order, and is serverless
  hibernation worth the dependency?
- **O3 live canvas** — an interaction-model change, not a component.

---

## C. Only you can supply these

Pure access. No amount of my effort substitutes.

| Blocked item                                                     | Needs                                                                                                                                                          |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SSO/SCIM end to end                                              | **WorkOS account** (already the chosen vendor)                                                                                                                 |
| Chrome extension distribution                                    | **Chrome Web Store** developer account + listing                                                                                                               |
| VS Code extension distribution                                   | **Marketplace / Open VSX** publisher account                                                                                                                   |
| Mobile IAP (**N24** — flow is built, every SKU is a placeholder) | **App Store Connect + Play Console** product IDs                                                                                                               |
| Desktop release maturity                                         | **macOS notarization** credentials, **Windows signing cert**                                                                                                   |
| Code-execution sandbox                                           | `E2B_API_KEY` + flipping `AGI_E2B_EXECUTION`                                                                                                                   |
| Provider coverage                                                | The keys already itemised in `founder_work.md` (DashScope, MiniMax, Moonshot, MuleRouter, Perplexity decision)                                                 |
| Live round-trip verification                                     | A signed-in session on a running build — Desktop Cloud create→reload→persist, Chrome store behaviour, VS Code production sign-in. **Not provable statically.** |

---

## D. Demo-blocking, flagged separately

**N23** — Chrome requires **Pro or higher** (`side_panel.ts:5973`: _"AGI in
Chrome requires Pro or higher."_ / _"Free chat remains available on Web, Mobile,
and Desktop."_). The copy is honest, but the Chrome segment of a live demo
**cannot be recorded on a free account.** Check the demo account's tier before
filming.

---

## E. Suggested sequencing

1. I start **A1 (B2 checkpoints/worktrees)** — highest leverage, zero blockers.
2. I sweep **A2** — nine small verified defects, each with a regression check.
3. You answer **B2's six decisions** and hand the research brief over.
4. Research answers land → I design **H1/H2** and the **admin console** against
   real targets instead of guesses.
5. **C** unblocks distribution and enterprise in parallel, on your timeline.
