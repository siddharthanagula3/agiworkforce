# src-5 Round-2 Self-QA — Chrome Extension Audit

Round 1: `audit/anthropic-apps-parity/team-2026-05-21/src-5-report.md`.

I re-read every row, then went back to source to verify the load-bearing claims (wire bugs, allowlist-UI absence, slash-chip list, dependency graph, line ranges). One previously-undocumented wire-level bug, one row whose severity needs to go up because of a contradictory error message, and one row in round 1 that was technically true but understated.

## Changes from round 1

### 1. Wire bug is bigger than I described — `extendedThinking` is also dropped

Round 1 called out that `pendingAttachments` is collected/previewed and never forwarded to the bridge. That's correct. What I missed: the side panel **also** sends `extendedThinking: _ctx.thinkingEnabled || undefined` at `side_panel.ts:2123` and `:2187`, but the wire type doesn't carry it either.

Verified at `apps/extension/src/types.ts:439-447`:

```ts
export interface ChatMessageMessage extends BaseMessage {
  type: 'CHAT_MESSAGE';
  id: string;
  text: string;
  pageContext?: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** API key forwarded from the side panel's chrome.storage.session agi_api_key. */
  apiKey?: string;
}
```

And the destructure at `background.ts:2690`:

```ts
const { id, text, pageContext, conversationHistory = [] } = message;
```

So `extendedThinking` is sent by the side panel and silently ignored. Same for `attachments` (which is never even sent — the side panel only stores them locally). The "Extended thinking" toggle in the model dropdown (`side_panel.ts:2613-2636`) **does nothing user-visible against the actual provider**, because no downstream code reads the field. The comment at `side_panel.ts:2119-2122` says "Phase 3 bridge: bridge must consume extendedThinking" — i.e. this is a known TODO that's been parked.

Net effect on the report: extend the existing P0 wire row to cover both fields.

### 2. Allowlist UI: severity up to P0 because of contradictory in-product copy

Round 1 logged "no allowlist UI" as P1 / 8h. While verifying I found that `background.ts:891-901` rejects content-script messages from non-allowlisted senders with the user-facing error:

```
This site is not on your AGI Workforce allowlist. Add it from the extension popup
to enable automation here.
```

But **the extension popup contains no UI to add a site to that allowlist**. I grep'd `popup.ts`, `popup.html`, and `side_panel.ts` for `agi_site_allowlist` and found one match — a code comment in `side_panel.ts:2900` referencing the validator name. No UI control. The user is sent on a wild goose chase.

Net effect: promote to P0, hold hours at 8h (work is small: a popup section with text input + add/remove + storage write). The bug is the false error string, not the implementation cost.

### 3. Cross-surface UI consistency — the "40h" estimate was loose

Round 1 logged "extension does not consume `packages/unified-chat`" as P0 / 40h, citing the work to migrate ~4250 lines of vanilla DOM to React components.

Re-reading my own row, the 40h estimate is **not** parity work — it's a refactor. The rubric says "include design, implementation, basic testing" for one mid-level engineer. A full React migration would burn more than 40h; what I costed was probably 4250 LOC × some factor I didn't justify.

Two options that round 1 didn't separate:

- (a) The actual parity gap: side-panel UX divergence from desktop. That's ~0h _if_ `img-5` says the side panel looks fine; otherwise it's the cost of cherry-picked design fixes.
- (b) The technical-debt clean-up: dropping vanilla DOM for `unified-chat`. Conservative estimate for one engineer who knows the codebase: 60-80h, not 40h. (Side panel alone is ~4250 lines, plus markdown wrapper, plus voice integration, plus workflows tab — at least two weeks even with the React seed in `packages/unified-chat` already factored.)

Net effect: I'll split this into two rows in the refined table — (a) "design parity" left at "needs cross-validation" and 0h, (b) "vanilla→shared-component refactor" reclassified P1 (engineering debt, not a P0 user-visible gap) and rebudgeted at 60h.

### 4. Two row severities were too soft

- **Markdown lacks tables/code-copy** — round 1: P1 / 8h. Tables matter when assistants emit comparison data; this is more common than code-copy. P1 is fine. **No change.**
- **In-page panel has no markdown, no streaming UI** — round 1: P1 / 4h. After re-reading `features/content/in-page-panel/panel.ts:170-185`, the response is rendered via `responseArea.textContent = response.text ?? ''`. That means **any** assistant output appears as a raw text wall — no code blocks, no lists, no links. For a user-facing surface this is a worse experience than "no tables". **Promote to P0 / 8h** (need: route in-page responses through the same `sanitizeHtml(renderMarkdown(...))` pipeline already used by side panel — adds streaming, markdown, links).

### 5. Slash-chip count: round 1 said 4 visible; verified — but missed that two more (`/translate`, `/tldr`) are dead UI

Verified: the chip list iterates `['/summarize', '/explain', '/extract', '/code']` (`side_panel.ts:3794`), and `expandSlashCommand` knows six (`:1991-2026`). Round 1 already flagged this. **No change**, but worth noting `/translate` and `/tldr` are functional only if the user types them — discoverability is zero.

### 6. Things I checked and confirmed are correct in round 1

- `pendingAttachments` is never serialized into the `CHAT_MESSAGE` wire payload — confirmed at `side_panel.ts:2175-2194` and `:2107-2130`.
- `packages/unified-chat` is **not** a dependency — confirmed at `apps/extension/package.json:34-41`. Only `browser-tool`, `design-tokens`, `runtime`, `types`, `utils`, plus `dompurify`.
- `validateBridgeUrl` + `ALLOWED_BRIDGE_HOSTS` live in `apps/extension/src/background/policy.ts:208,218`, reused in both side-panel settings save path and background URL accept path — confirmed.
- `voice.ts` hard-codes `'en-US'` at `:42`.
- Two parallel module trees (shim re-exports from `src/inPagePanel/*` etc. pointing at canonical `src/features/content/*`) — re-confirmed from explicit `@deprecated` banners.
- Recording / Workflows tab lives at `side_panel.ts:3086-3540` — confirmed.
- Native bridge pairing UI is popup-only — confirmed.
- Side panel CSS string ends at `side_panel.ts:1647`, not 1648 — round 1 said `:314-1647` which is right.

### 7. Things I didn't have time to verify in round 1, now verified

- `lastPointerTarget` (`content.ts:134`) is set on every captured pointer event by `attachRecordingListeners` (`:1755`) and read by `handleCaptureElement` (`:770`) and `handleGetElementInfo` (`:779`). This is the wiring that lets the side-panel "Capture element" feature work. Already-working — not a gap. (No row needed.)
- `ALLOWED_SCRIPT_OPERATIONS` (`content.ts:1105-1167`) is an allowlist-only map, not a sandbox bypass; the `EXECUTE_SCRIPT` handler only invokes operations from this map. Already hardened — not a gap.

## Refined gap table

Only the **changed** rows (everything else in round 1 stands).

| Feature area                  | Round-1 severity / hours                    | Round-2 severity / hours                 | Reason                                                                                                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wire bug: attachments dropped | P0 / 3                                      | P0 / 4                                   | Add `extendedThinking` to the same fix. The wire-type at `types.ts:439-447` is missing both fields; the destructure at `background.ts:2690` ignores both. Hours up by 1 to cover the type field, handler plumbing, and downstream provider-stream forwarding. |
| Allowlist UI                  | P1 / 8                                      | P0 / 8                                   | The error string `background.ts:898` directs users to a popup UI that doesn't exist. Either remove the misleading string or build the UI; the gap is a P0 because the product literally lies to the user.                                                     |
| In-page panel rendering       | P1 / 4 (composer row noted plain-text only) | **New row: P0 / 8**                      | `responseArea.textContent = response.text` at `features/content/in-page-panel/panel.ts:178` ignores all markdown. Side panel already has the pipeline (`features/side-panel/markdown.ts`); needs to be wired into the overlay path.                           |
| React vs vanilla DOM (split)  | P0 / 40 (combined)                          | (a) parity P? / 0 + (b) refactor P1 / 60 | The parity question depends on whether `img-5` shows visible divergence — leaving the parity row at 0h pending lead cross-validation. The refactor row goes to P1 (engineering debt, not user-visible) at a more honest 60h.                                  |
| Extended-thinking toggle      | (not called out)                            | **New row: P1 / 4**                      | `Extended thinking` checkbox at `side_panel.ts:2614-2636` toggles `_ctx.thinkingEnabled` and persists `agi_thinking_enabled`, but the field never reaches a provider (see #1 above). Either wire it through or remove the UI.                                 |

## Confidence in round-1 estimates

| Row                                             | Confidence           | Notes                                                                                                                                                                                                                                                       |
| ----------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Composer (side panel) — P2 / 0                  | High                 | Re-verified line ranges. Cross-validation rests with `img-5`.                                                                                                                                                                                               |
| Composer (popup) — P1 / 6                       | Medium               | Popup is launcher-only by design; whether parity demands a popup composer is an `img-5` call. The 6h cost assumes a small inline composer that opens the side panel, not a full chat.                                                                       |
| Composer (in-page panel) — P1 / 4               | **Low (revised up)** | See refined-table row — round 1 underweighted the lack of markdown. Promote to P0 / 8 per above.                                                                                                                                                            |
| Markdown + sanitization — P1 / 8                | High                 | Tables + copy-code button is realistic at 8h.                                                                                                                                                                                                               |
| Streaming + thinking — P2 / 3                   | Medium               | The 3h covers a retry button + partial-content marker on cancel. If a full agent step-list UI is required, the row is wrong (different work — see "Browser automation" below).                                                                              |
| Conversation history — P1 / 16                  | High                 | Search + rename + export is a real ~2-day feature.                                                                                                                                                                                                          |
| Projects / folders — P0 / 24                    | Medium-low           | 24h covers a flat folder layer with drag-drop; full multi-project semantics (sharing, sync) would be 80h+. Hours are right _if_ the goal is local-only folders, conservative _if_ full Claude-style projects.                                               |
| Model picker — P1 / 6                           | High                 | Search + recents + capability hints + dynamic provider count = ~6h.                                                                                                                                                                                         |
| Inline tool calls — P1 / 12                     | Medium               | Depends on whether the bridge emits a structured tool-call format. If we move to JSON tool calls instead of `[TOOL:…]` fences, this becomes a wire-format change shared with desktop/web and is closer to 24h.                                              |
| WebMCP tools panel — P1 / 8                     | High                 | Adding an in-side-panel invocation form with arg validation is ~8h.                                                                                                                                                                                         |
| Side-panel settings — P1 / 12                   | Medium               | "Add a settings drawer with N preferences" depends on N. Conservative — likely 12-20h for the minimum viable set.                                                                                                                                           |
| Popup settings — P2 / 4                         | High                 | Small additions to the existing card layout.                                                                                                                                                                                                                |
| Allowlist UI — was P1/8                         | **Now P0 / 8**       | See refined-table row.                                                                                                                                                                                                                                      |
| Image attachments — P0 / 10                     | High                 | UI hook-up + drag-drop + paste + multi-modal model auto-select all in 10h is **tight**; bumping to 14h would be safer but I'll hold the line at 10h since the wire fix is separate.                                                                         |
| Wire bug: attachments dropped                   | was P0/3             | **Now P0 / 4**                                                                                                                                                                                                                                              | See refined-table row. |
| Voice — P1 / 6                                  | High                 | Lang selector + interim results + TTS playback in 6h is realistic.                                                                                                                                                                                          |
| Slash chips — P2 / 3                            | High                 | Surfacing `/translate` + `/tldr` as chips + adding a `/`-trigger menu is small.                                                                                                                                                                             |
| Shortcuts — P1 / 5                              | High                 | A small `key → action` map; ~5h.                                                                                                                                                                                                                            |
| Onboarding — P1 / 16                            | Medium               | Depends on scope; 16h covers a welcome screen + permissions explainer + API-key onboarding only. Wizard with model-selection adds another 8h.                                                                                                               |
| Paywall card — P1 / 6                           | High                 | Mirroring into side panel + reason copy edits.                                                                                                                                                                                                              |
| Usage meter — P1 / 12                           | Medium               | Depends on whether the API exposes per-call usage on the response; if yes, ~12h. If we have to build server-side aggregation, 24h+.                                                                                                                         |
| Artifacts panel — P0 / 30                       | **Low**              | I costed 30h for a basic preview/run panel; a real Claude-like artifacts surface is 80-120h once you add the iframe sandbox + multi-artifact tabs + share/export. 30h is wishful. **Bump to 80h** if `img-5` shows Claude artifacts as in-scope for parity. |
| Browser automation (no agent-loop UI) — P1 / 20 | Medium               | 20h for an in-side-panel step list with approve/reject is the lower bound. With confirmation modals + run history it's 40h.                                                                                                                                 |
| Recording / workflows tab — P2 / 0              | High                 | Extension-unique; no parity expected.                                                                                                                                                                                                                       |
| Page-level WebMCP — P1 / 14                     | Medium               | If a global MCP server browser is required, 14h is light — probably 24-32h. Tag for the lead.                                                                                                                                                               |
| In-page panel overlay — P1 / 8                  | High                 | Allowlist add-from-launcher: small.                                                                                                                                                                                                                         |
| Page actions URL routing — P2 / 4               | High                 | User-configurable chips: ~4h.                                                                                                                                                                                                                               |
| Job autofill — P2 / 0                           | High                 | Extension-unique.                                                                                                                                                                                                                                           |
| Tab groups — P2 / 0                             | High                 | Extension-unique.                                                                                                                                                                                                                                           |
| Design tokens — P1 / 6                          | High                 | Pulling popup CSS through `getExtensionTokensCss` — small.                                                                                                                                                                                                  |
| React refactor — was P0 / 40                    | **Now P1 / 60**      | See refined-table row.                                                                                                                                                                                                                                      |

## Net delta (round-1 totals → round-2 totals)

If the lead is summing hours, the rough deltas are:

- +1 for the wire-bug row (3→4)
- +4 for new "Extended thinking dead toggle" row (0→4)
- +4 for new in-page-panel markdown row (4 was already booked under "Composer (in-page panel)"; moving it to its own row at 8 — net +4)
- +20 for re-budgeted React refactor (40→60)
- +50 for re-budgeted Artifacts panel (30→80) **only if** the lead decides artifacts are in scope; otherwise no change.

Severity delta:

- 1 row promoted P1 → P0 (Allowlist UI)
- 1 row promoted P1 → P0 (In-page panel rendering)
- 1 row demoted P0 → P1 (React refactor — was misclassified)

Round 1's headline numbers were directionally right but the React row and the Artifacts row were both costed by gut, not by component count. The allowlist row was misclassified because I didn't notice the lying error string. The in-page panel markdown was buried inside a composer row instead of being its own line.

Net: round 1 holds for ~90% of the rubric; the corrections above are real defects I'd want the lead to see before SYNTHESIS.md.
