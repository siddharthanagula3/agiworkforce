# AGI Mobile — XcodeBuildMCP UI/Feature Test Plan (agent prompt)

Status: Active QA runbook · grounded in `apps/mobile` (expo-router; iOS workspace is the prebuild-generated `apps/mobile/ios/AGIWorkforce.xcworkspace` — run `expo prebuild --platform ios` from `apps/mobile/` first; the former root `ios/agiworkforce.xcworkspace` was deleted 2026-07-16)
Owner: Mobile lead
Parity bar: ChatGPT + Claude iOS apps (especially tool-calling UI, streaming, model switching). Parity = capability/workflow, never copied assets/branding.

You are a QA agent driving the AGI Mobile app on the iOS Simulator with XcodeBuildMCP (44 tools). Goal: exercise every screen, control, feature, and tool-call UI, and verify each looks/behaves like a polished Claude/ChatGPT-class mobile app. Log PASS/FAIL with evidence for every step.

## Conventions (apply to every step)

- **Locate before you act:** call `snapshot_ui` first to get the live element tree, find the target by `testID` (preferred) or `accessibilityLabel`/visible text, then `tap`/`type_text`/`swipe` at its frame center. Never tap blind coordinates.
- **Wait, don't guess:** `wait_for_ui` for the expected element/testID before asserting; then `screenshot`.
- **Evidence per screen:** `screenshot` after each meaningful state; `record_sim_video` around each critical flow (send→stream→tool-call, mode switch, model switch).
- **Assert expected vs actual:** compare the `snapshot_ui` tree + screenshot to the "Expect" list. Any mismatch = FAIL with the testID, expected, actual, screenshot.
- **Batch same-screen taps** with `batch`. Use `key_press`/`button` for Return/Home.
- **On failure,** capture `snapshot_ui` + `screenshot`, then if it's a crash/hang use Phase D (LLDB) before moving on.

---

## Phase A — Setup (discovery, build, boot, install, launch)

1. `discover_projs` → confirm `ios/agiworkforce.xcworkspace` (and the Expo-generated scheme).
2. `list_schemes` → pick the app scheme (e.g., `agiworkforce`). `show_build_settings` → confirm Debug config + bundle id target.
3. `list_sims` → choose an iPhone 16 Pro (iOS latest). `boot_sim` then `open_sim`.
4. `session_set_defaults` → set { workspace, scheme, simulator } so later tools omit them. `session_show_defaults` to confirm.
5. `build_run_sim` (build + install + launch). If it fails: `build_sim`, read errors, then Phase D. On success, `get_app_bundle_id` and `get_sim_app_path` for reference.
6. `wait_for_ui` for the first screen (age-gate or onboarding root). `screenshot` = baseline.

---

## Phase B — Screen-by-screen UI/feature tests

Format per screen — **Expect / Do / Verify / Checklist**.

### B1 — Age gate (`app/(public)/age-gate.tsx`)

- **Expect:** title/subtitle, a birthdate/age input (`age-gate-input`), Continue (`age-gate-continue-btn`), policy note; minor path shows `age-gate-minor-notice` + `age-gate-minor-continue-btn`.
- **Do:** `snapshot_ui` → `type_text` a valid adult age into `age-gate-input` → `tap` `age-gate-continue-btn`. Re-run with an under-18 value to confirm the minor branch.
- **Verify:** adult → proceeds to onboarding; minor → `age-gate-minor-notice` shown, age-appropriate path; invalid → `age-gate-error`. Screenshot each.
- **Checklist:** [ ] adult proceeds [ ] minor gated [ ] invalid shows error [ ] no overclaim copy.

### B2 — Onboarding (`app/(public)/onboarding.tsx`)

- **Expect:** a few swipeable value slides (local-first/privacy/multi-provider), pagination dots, a Get-Started CTA. Parity: ChatGPT/Claude first-run carousels.
- **Do:** `swipe` left through all slides; tap the final CTA.
- **Verify:** each slide renders (screenshot), dots advance, CTA lands on chat or login.
- **Checklist:** [ ] all slides [ ] swipe works [ ] CTA routes correctly.

### B3 — Auth / login (`app/(auth)/login.tsx`) — Cloud only

- **Expect:** email/OAuth/passkey options (Clerk); reset-password link. Local Mode must be reachable WITHOUT login.
- **Do:** confirm you can skip to Local chat without auth; then exercise login fields (don't submit real creds unless test account provided).
- **Verify:** Local works logged-out; login UI renders; trust copy honest. Screenshot.
- **Checklist:** [ ] local works logged-out [ ] login renders [ ] reset link present.

### B4 — Chat empty state + composer (`features/chat/components/ChatEmptyState.tsx`, `Composer/Composer.tsx`)

- **Expect (parity-critical):** centered empty state with suggestions; bottom composer with input (`chat.composer.input`), mic (`chat.composer.mic`), send (`chat.composer.send`), an add/plus affordance (`add-to-chat-sheet` opener), the model selector (`ModelSelectorButton`), and the Local/Cloud mode toggle (`chat.mode-toggle` / `.local` / `.cloud`). A visible trust/provider label. This is the ChatGPT/Claude home screen analog.
- **Do:** `snapshot_ui`; confirm every control exists by testID. `screenshot`.
- **Verify:** all controls present, tappable, labeled; mode toggle shows current mode; model button shows current model from `models.json`.
- **Checklist:** [ ] input [ ] mic [ ] send [ ] add/plus [ ] model selector [ ] mode toggle [ ] trust label [ ] suggestions.

### B5 — Local chat: send + streaming (`MessageList.tsx`, `MessageBubble.tsx`, `MessageContentRenderer.tsx`)

- **Expect:** ensure mode = Local (`tap` `chat.mode-toggle.local`). Type a prompt, send; assistant bubble streams tokens; Markdown/code render; a Stop control appears during streaming then returns to Send. Parity: token streaming + stop, like Claude/ChatGPT.
- **Do:** `type_text` into `chat.composer.input` → `tap` `chat.composer.send` → `record_sim_video` the stream → mid-stream `tap` the stop control once → resend and let it finish.
- **Verify:** user bubble + streaming assistant bubble; stop interrupts and records interrupted state; Markdown/code blocks render with copy; first-token latency reasonable. Screenshot start/mid/end.
- **Checklist:** [ ] send [ ] streaming [ ] stop/cancel [ ] markdown [ ] code block + copy [ ] on-device runs offline.

### B6 — Tool-calling UI (PARITY-CRITICAL) (`InlineToolCall.tsx`, `ToolTimeline.tsx`, `toolIconRN.ts`, `toolCallAccumulator.ts`)

- **Expect:** send a prompt that forces a tool (per active mode + Volume 18 — e.g., web search / calculator). The assistant turn must render an **inline collapsible tool card**: tool icon + human tool name; a live status (pending → running spinner → success/error); a short input preview; an expandable section for full args + result; multiple calls stack in order; failures show a clear error state. It must NOT dump raw JSON by default. Agentic runs show `ToolTimeline` (ordered steps). This is the Claude/ChatGPT mobile tool-call presentation — the single most important parity item.
- **Do:** `record_sim_video`. Send the tool-triggering prompt. `wait_for_ui` for the tool card. `snapshot_ui` → confirm name/status/icon. `tap` the card to expand → confirm args+result. Trigger a failing tool (e.g., bad query) to see the error state. For an agent prompt, confirm `ToolTimeline` renders steps.
- **Verify:** card appears before result; status transitions visible; expand/collapse works; error state distinct; order preserved; no raw-JSON dump. Screenshot collapsed + expanded + error.
- **Checklist:** [ ] tool card renders [ ] icon+name [ ] status spinner→done [ ] expand args+result [ ] error state [ ] multiple calls ordered [ ] ToolTimeline for agents [ ] no raw JSON.

### B7 — Model picker (`ModelPickerSheet.tsx`, `ModelSelectorButton.tsx`)

- **Expect:** tapping the model button opens a bottom sheet (`bottom-sheet`) listing models from `models.json` with capability badges (vision/reasoning/context), provider labels, and the current selection marked. Parity: ChatGPT/Claude model switchers.
- **Do:** `tap` model selector → `snapshot_ui` the sheet → `swipe` to scroll the list → `tap` a different model → reopen to confirm persistence.
- **Verify:** list populated from catalog (no invented IDs), badges correct, selection persists across sheet reopen + app relaunch (`stop_app_sim`/`launch_app_sim`). Screenshot.
- **Checklist:** [ ] sheet opens [ ] catalog-driven list [ ] capability badges [ ] provider labels [ ] select persists.

### B8 — Mode toggle Local ↔ Cloud + trust boundary (`chat.mode-toggle.*`, `remoteChatGate`, `cloud-waitlist-*`)

- **Expect:** toggling to Cloud (`chat.mode-toggle.cloud`) requires sign-in/entitlement; if unentitled, an honest gate appears (public-alpha sign-in, NOT a broken send). Local (`chat.mode-toggle.local`) never sends off-device. Trust label updates per mode.
- **Do:** toggle Cloud while signed-out → confirm gate (sign-in/`cloud-waitlist-*` per current copy). Sign in (if test account) → confirm cloud send works. Toggle back to Local → confirm label + no network on send.
- **Verify:** trust label matches mode; Local never egresses (cross-check with B16/no network); Cloud gated honestly. Screenshot both states.
- **Checklist:** [ ] toggle works [ ] cloud gated when unentitled [ ] local fail-closed [ ] trust label correct [ ] no overclaim.

### B9 — Attachments + capture (`AddToChatSheet.tsx` `add-to-chat-sheet`; `camera.tsx`, `image.tsx`, `scan.tsx`)

- **Expect:** the add/plus opens `add-to-chat-sheet` with options (photo/camera/file/scan). Camera/scan route to capture screens; selecting a file attaches a chip to the composer with type/size; oversized files show `FileTooLargeModal`/`ImageTooLargeModal`.
- **Do:** open the sheet → tap each option → attach a sample image → confirm chip → send with attachment. Trigger the too-large modal.
- **Verify:** sheet options present; attachment chip shows metadata; oversize handled; vision is honestly OCR-scoped (no image-understanding overclaim). Screenshot.
- **Checklist:** [ ] add sheet [ ] photo/camera/file/scan [ ] attachment chip [ ] too-large modal [ ] OCR scope honest.

### B10 — Artifacts (`artifact-*` testIDs)

- **Expect:** generated artifacts open a viewer (`artifact-preview-content`) with copy (`artifact-copy`) and share (`artifact-share`); a grid/drawer (`artifacts-grid`, `artifacts-open-drawer`) with empty (`artifacts-empty-state`) and skeleton (`artifacts-skeleton-grid`) states. Parity: Claude artifacts panel, mobile-adapted.
- **Do:** generate an artifact (e.g., "make a small HTML page") → open preview → copy → share → close (`artifact-preview-close`) → open the drawer.
- **Verify:** preview renders; copy/share work; grid lists artifacts; empty/skeleton states correct. Screenshot.
- **Checklist:** [ ] preview [ ] copy [ ] share [ ] grid/drawer [ ] empty + skeleton states.

### B11 — Temporary chat (`TemporaryChatToggle.tsx`)

- **Expect:** toggle marks the chat temporary; it must NOT persist to history and must not update memory. Parity: ChatGPT temporary chat.
- **Do:** enable toggle → send a message → relaunch app → confirm it's absent from history.
- **Verify:** no persisted row; visible temp label. Screenshot.
- **Checklist:** [ ] toggle [ ] not persisted [ ] no memory update [ ] temp label.

### B12 — Voice (`voice.tsx`, `chat.composer.mic`)

- **Expect:** mic opens dictation/voice; permission prompt; transcript appears. Parity: ChatGPT voice (scope to what's shipped — no overclaim).
- **Do:** tap `chat.composer.mic` → handle the permission alert (`button`/system dialog) → confirm voice UI.
- **Verify:** permission handled; UI matches shipped scope. Screenshot.
- **Checklist:** [ ] mic opens [ ] permission [ ] honest scope.

### B13–B15 — Translate / Compare / Image (`translate.tsx`, `compare.tsx`, `image.tsx`)

- **Expect:** Translate honestly scoped (en↔hi per current build — no "60+ languages" overclaim); Compare = side-by-side model comparison; Image = OCR/vision per shipped scope.
- **Do:** open each from nav; run one operation each.
- **Verify:** features work within shipped scope; copy matches reality. Screenshot each.
- **Checklist:** [ ] translate honest [ ] compare works [ ] image/OCR honest.

### B16 — Account / Usage / Settings (`account.tsx`, `usage.tsx`)

- **Expect:** account info, sign-in/out, plan/usage, settings sections. KNOWN ISSUE to confirm fixed: Skills/Plugins must NOT dead-end (either work or be hidden).
- **Do:** open account → scroll all sections (`swipe`) → tap each settings row, especially Skills/Plugins → open usage.
- **Verify:** no dead-end rows; usage renders; sign-out works. Screenshot each section.
- **Checklist:** [ ] account [ ] usage [ ] no dead-ends [ ] sign-out.

### B17 — Message actions (`MessageBubble.tsx`, `MessageEditModal.tsx`)

- **Expect:** long-press / action affordance on a message → copy, edit, regenerate; edit opens `MessageEditModal`; regenerate preserves turn metadata. Parity: Claude/ChatGPT message actions.
- **Do:** `long_press` an assistant message → tap copy, then edit (modal) → save → regenerate.
- **Verify:** actions present; edit modal works; regenerate keeps attachments/metadata. Screenshot.
- **Checklist:** [ ] copy [ ] edit modal [ ] regenerate [ ] metadata preserved.

### B18 — Edge cases (`features/edge-cases/`)

- **Expect:** offline behavior, message error screen (`MessageErrorScreen`), too-large modals, interrupted/airplane states handled gracefully.
- **Do:** toggle airplane mode (simulator), send → confirm graceful error + retry; restore.
- **Verify:** no crash; clear error + recovery. Screenshot.
- **Checklist:** [ ] offline graceful [ ] error screen [ ] retry [ ] no crash.

---

## Phase C — Automated tests + coverage

- `test_sim` → run the in-repo suite on the booted sim. Then `get_coverage_report` and `get_file_coverage` for chat/tool-call/model files (`features/chat/*`). Record overall % and weak files.
- **Checklist:** [ ] test_sim green [ ] coverage captured [ ] gaps noted.

## Phase D — Debug failures (only when a step crashes/hangs)

- `debug_attach_sim` → `debug_breakpoint_add` at the failing area (e.g., tool-call accumulator, stream handler) → reproduce → `debug_stack` + `debug_variables` → `debug_lldb_command` for ad-hoc inspection → `debug_continue` → `debug_detach`. Log root cause; file a bug with reproduction.

## Phase E — Evidence & report

For every screen produce: PASS/FAIL, the testIDs checked, expected vs actual, a screenshot, and (for B5/B6/B7/B8) a `record_sim_video`. Roll up into a report: per-screen status, parity gaps vs Claude/ChatGPT (esp. tool-calling), crashes, and a prioritized fix list.

---

## Parity rubric — "looks like Claude/ChatGPT mobile" (judge each screen against this)

1. **Composer:** persistent bottom bar; input + mic + send + add/plus + model + mode + trust label; send↔stop swap during streaming.
2. **Streaming:** smooth token streaming, visible stop, graceful interrupt.
3. **Tool calls:** inline collapsible cards with icon + name + live status + expandable args/result; ordered; error state; no raw JSON. (Highest weight.)
4. **Model switching:** bottom-sheet picker, capability badges, persists.
5. **Messages:** Markdown/code/tables, copy, long-press actions, edit/regenerate.
6. **Navigation:** clear screens, no dead-ends, honest empty/skeleton/error states.
7. **Trust:** mode + provider always visible; Local never egresses; Cloud gated honestly.
8. **Polish:** no overclaim copy, no broken controls, no jank, accessible labels.

Any screen failing rubric item 3 (tool calls) or 7 (trust) is a release blocker.
