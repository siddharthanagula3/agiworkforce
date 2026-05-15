# Wave 2 Plan — Implementing the Design Spec

**Wave 1 outputs to consume:**

- `docs/design/design-spec-2026-05-15.md` (committed at `9e1190bc3`) — the locked design spec
- `packages/design-tokens/` — already shipped tokens (consumed by desktop, web, mobile, vscode, chrome via earlier wave)
- Each wave-1 surface engineer's commits (onboarding suppression + dead-code purge + initial token sweeps)

**Wave 2 goal:** **Implement** the design spec across all 6 surfaces. Wave 1 audited and removed friction; wave 2 builds the user-visible parity.

---

## §1 — Per-surface inline tool-call implementation

Each surface engineer ships:

1. **`InlineToolCall` component** matching design-spec §4 anatomy (borderless bar, vertical guideline for stacks, recessed `--bg-code` panel on expand).
2. **Per-tool icon mapping** — exact Lucide names from design-spec §4.6.
3. **State machine** — pending/running/success/error/partial per §4.4.
4. **Body renderer** per tool type per §4.5.

### Surface ownership

| Surface     | Existing rendering                                              | New target                                                   |
| ----------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| Desktop     | `packages/chat` or inline                                       | Use shared `packages/chat/src/components/InlineToolCall.tsx` |
| Web         | `apps/web/features/chat/components/messages/MessageBubble.tsx`  | Same shared component                                        |
| Mobile      | `apps/mobile/components/chat/*`                                 | RN port — `apps/mobile/components/chat/InlineToolCall.tsx`   |
| CLI         | `apps/cli/src/tui/chatwidget*.rs`                               | Ratatui adaptation per §4.2 + §5.3                           |
| Chrome ext  | `apps/extension/src/side_panel.ts`                              | Vanilla TS port                                              |
| VS Code ext | `apps/extension-vscode/src/providers/sidebar/webviewContent.ts` | Webview HTML/CSS port                                        |

---

## §2 — Icon library migration to Lucide React

Locked in design-spec §5: **Lucide React** is the single icon library.

| Surface     | Current                                                              | Target                                                               |
| ----------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Desktop     | Mixed (lucide-react + react-icons + some custom SVG)                 | Lucide only                                                          |
| Web         | Mixed (lucide-react + heroicons via @heroicons/react + some lucide?) | Lucide only                                                          |
| Mobile      | `lucide-react-native` per design-tokens                              | Confirm coverage, fill gaps                                          |
| CLI         | n/a — Unicode mapping per §5.3                                       | Add `icons.rs` table                                                 |
| Chrome ext  | Inline SVG (CSP-friendly)                                            | Lucide raw SVG sprites                                               |
| VS Code ext | VS Code Codicons                                                     | Hybrid: Codicons in tree views (native feel), Lucide in webview chat |

---

## §3 — Composer parity per design-spec §7

Each surface implements:

- Soft-pill composer (16px border-radius)
- Plus-menu opening attachment/tool sheet
- Bottom-row controls: model picker pill (inside composer), mode toggle, mic, send
- Auto-grow up to 240px then internal scroll
- Cmd/Ctrl+Enter shortcut shown as helper text on focus

---

## §4 — Sidebar parity per design-spec §6

- Default = 48px icon-only rail
- Hover/click expand to 260px
- No inline timestamps on conversation items
- Active item background `--bg-hover`
- Free-plan upgrade pill at bottom of expanded sidebar

---

## §5 — Empty-state parity per design-spec §8

Already partially handled by wave 1 (onboarding suppression). Wave 2 polish:

- Centered hero "Let's build agiworkforce" (or similar, single line, serif display)
- Composer below
- 3–5 horizontal sample-prompt chips
- No multi-step wizards

---

## §6 — Phase 2 verification + push

After all 6 surfaces ship parity work:

1. `bash scripts/launch-verify.sh` — parallel green check.
2. `bash scripts/launch-verify.sh --with-builds` — production builds.
3. Visual smoke screenshots per surface (if time).
4. `git push origin main` — push the wave.

---

## §7 — Agent dispatch matrix (single parallel wave)

| Agent name     | Type                | Scope                                                                                                 |
| -------------- | ------------------- | ----------------------------------------------------------------------------------------------------- |
| `desk-launch2` | desktop-engineer    | Desktop: implement InlineToolCall + Lucide migration + composer + sidebar                             |
| `web-launch2`  | web-engineer        | Web: same scope, web-side                                                                             |
| `mob-launch2`  | mobile-engineer     | Mobile: RN ports of InlineToolCall + composer + sidebar                                               |
| `cli-launch2`  | cli-engineer        | CLI: icons.rs Unicode mapping + tool-call render parity in TUI                                        |
| `chr-launch2`  | chrome-ext-engineer | Chrome ext: side-panel inline tool-call + Lucide SVG sprites                                          |
| `vsc-launch2`  | vscode-ext-engineer | VS Code ext: webview inline tool-call + composer + sidebar polish                                     |
| `pkg-launch2`  | general-purpose     | Create `packages/chat/src/components/InlineToolCall.tsx` shared component for desktop+web consumption |
| `docs-launch2` | general-purpose     | Update README, CHANGELOG, AUDIT_LOG with launch-readiness wave totals                                 |

8 parallel agents.

---

## §8 — Out of scope for wave 2 (defer to wave 3 or post-launch)

- Marketing site copy refresh
- New onboarding tutorial videos (if any)
- Stripe end-to-end test in production
- E2E test recordings
- Performance benchmarks beyond bundle size
