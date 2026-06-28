# Volume 23 — UI System

Status: Canonical (expands `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 23)
Authority: `docs/current/source-of-truth.md` (UX Lock), `packages/types/src/suite-contracts.ts`, Vol 24 (Streaming), Vol 32 (Testing/a11y)

## Philosophy & Cloud/Local stance

The UI is a thin skin over one shared chat shell. We build the headless chat logic once (`packages/unified-chat`) and theme it per surface — never re-implement composer, model selection, or trust labelling per app. The user must always be able to see, at a glance, _where their words are going_: Local, BYOK, or Managed. That visibility is not decoration; it is the product. Trust mode changes the UI in exactly one direction — it surfaces more provenance, never hides it. Local chats render a Local label and never silently show a Managed badge; a BYOK continuation renders its provider label from `suite-contracts.ts`. The empty-chat state is identical in structure across surfaces so muscle memory transfers; only spacing, gestures, and platform chrome differ (web pointer + keyboard, mobile touch + bottom bar, desktop window + menu bar).

## Binding rules

1. The empty chat state MUST render the UX-Lock controls: central input, plus/add, file attach, model selector, microphone, send/stop, and a visible Local/BYOK/Managed label where routing matters. A missing control is a launch blocker, not a polish item.
2. Trust/provider labels come from `suite-contracts.ts` (`getPrivacyModeDisplay`, `getProviderModeDisplay`, `formatPrivacyModeLabel`). Never hardcode "Local"/"BYOK"/"Managed" wording in a component.
3. `send` and `stop` are one control in two states; `stop` MUST cancel the stream and any in-flight tool call (Vol 24), and the UI must reflect `interrupted` immediately.
4. WCAG 2.1 AA is the baseline: contrast ≥ 4.5:1 (3:1 large text), visible focus rings, full keyboard operability, and `aria-live` for streaming output.
5. One headless chat shell. Surface code may theme and re-layout but may not fork composer/model/trust logic.
6. Dead controls are banned (Operating Law 5). A rendered button must do something or not render.
7. Respect `prefers-reduced-motion`; all animation has a no-motion fallback.
8. Theme tokens (light/dark/system) are centralized; no per-component color literals.

## Repository map (real paths)

- Shared shell: `packages/unified-chat/src/components/` — `ActionBar.tsx`, `ConversationHeader.tsx`, `SettingsModal.tsx`, `Disclaimer.tsx`, `CitationPill.tsx`, `ImageGenCard.tsx`, `DownloadCard.tsx`; `ui/` (`Button.tsx`, `Badge.tsx`, `Tooltip.tsx`, `ScrollArea.tsx`).
- Shared hooks/stores: `packages/unified-chat/src/hooks/` (`useTheme.ts`, `useKeyboard.ts`, `useVoiceInput.ts`, `useSidebar.ts`); `src/stores/` (`uiStore.ts`, `settingsStore.ts`).
- Web composer/dialogs: `apps/web/features/chat/components/Composer/` (`VoiceInputButton.tsx`, `GhostTextOverlay.tsx`, `DragDropOverlay.tsx`, `StyleSelector.tsx`), `components/dialogs/KeyboardShortcutsDialog.tsx`, `components/messages/ChatInput.tsx`, `components/Sidebar/`; theme via `apps/web/providers/ThemeProvider.tsx`.
- Web shell + sidebar: `apps/web/features/chat/v3/WebSidebar.tsx`.
- Desktop shell: `apps/desktop/src/features/v3/DesktopShellV3.tsx` (chat + Projects/Artifacts/Scheduled/Dispatch subpanels), model popover, artifact workbench.
- Mobile: `apps/mobile/app/(app)/(tabs)/index.tsx` (chat tab), `app/(app)/settings/`, NativeWind theme in `apps/mobile/tailwind.config.js` + `global.css`.
- Trust labels (source of truth): `packages/types/src/suite-contracts.ts`.

## Competitor notes (`docs/strategy/01`, `02`)

Both incumbents ship one chat shell over many clients (Claude's desktop is Electron; ChatGPT mac is native; ChatGPT web is Remix not Next). Their composers do _not_ show a trust/provider boundary because they are single-lab — there is nothing to disclose. AGI's deliberate divergence (`02` §4): a first-class, code-sourced trust label in the composer and on every message. ChatGPT's free web now shows "Sponsored Tips" ads; AGI's empty state stays clean. Our wedge is the Tauri/Rust desktop shell (`01` §2.1) and the visible privacy boundary — match their interaction polish, diverge on provenance.

## Checklists

### Empty-chat UX Lock (per surface)

- [ ] Central input renders and is the default focus target on load.
- [ ] Plus/add control present and opens the add menu.
- [ ] File attach present; accepts drag-drop (desktop/web) and picker.
- [ ] Model selector present, populated from the catalog (Vol 8), never hardcoded.
- [ ] Microphone control present (or explicitly hidden where unsupported, not faked — Vol 16).
- [ ] Send/stop control present; toggles state on stream start/stop.
- [ ] Trust/provider label visible and sourced from `suite-contracts.ts`.
- [ ] Label updates live when the user switches Local/BYOK/Managed.

### Navigation & layout

- [ ] Sidebar exposes search, collapse/expand, new chat, projects, artifacts, recent chats, account area (source-of-truth Desktop sidebar spec).
- [ ] Account menu has settings, language, get help, learn more, logout.
- [ ] Tabs/bottom bar (mobile) reachable by keyboard/screen reader and by gesture.
- [ ] Responsive: usable at 320px (mobile), tablet, and desktop widths; no horizontal scroll traps.

### Overlays (sheets, dialogs, toasts, context menus)

- [ ] Dialogs trap focus, restore focus on close, and close on Esc.
- [ ] Sheets (mobile) are dismissible by gesture and by an explicit close affordance.
- [ ] Toasts use `aria-live="polite"`; errors use `assertive`; toasts never the only error channel.
- [ ] Context menus reachable via keyboard (context-menu key / long-press) and expose the same actions as pointer.

### Keyboard, gestures, shortcuts

- [ ] Shortcut registry centralized; KeyboardShortcutsDialog lists current bindings.
- [ ] Enter sends, Shift+Enter newlines (configurable); Esc cancels stream when streaming.
- [ ] All pointer actions have a keyboard equivalent; no pointer-only flows.

### Theming & motion

- [ ] Light/dark/system themes switch without reload and persist per user.
- [ ] No hardcoded colors; all from theme tokens.
- [ ] `prefers-reduced-motion` honored; streaming caret/skeletons degrade gracefully.

### Accessibility (WCAG 2.1 AA)

- [ ] Contrast ≥ 4.5:1 (3:1 large/icons); verified, not assumed.
- [ ] Visible focus indicator on every interactive element.
- [ ] Streaming assistant output announced via `aria-live`; tool-call state changes announced.
- [ ] Form controls labelled; icon-only buttons have `aria-label`.
- [ ] Hit targets ≥ 44px on touch surfaces.

### Trust-label integrity

- [ ] Every message bubble carries provider + privacy label (Vol 9).
- [ ] A Local thread never renders a BYOK/Managed badge.
- [ ] Boundary-crossing fork shows the consent + payload-preview UI before any send (Vol 27/30).

## Definition of Done

Empty-chat UX-Lock controls verified present and wired on web, desktop, and mobile; trust labels render from `suite-contracts.ts` (no literals — grep clean); axe/a11y audit passes with zero AA violations on the chat and settings routes (`apps/desktop/e2e/accessibility-audit.spec.ts`, `apps/web/scripts/a11y-audit.mjs`); keyboard-only walkthrough of new-chat → send → stop succeeds; reduced-motion verified; e2e/visual checks green for the launch-critical chat flow (Vol 32).

## Anti-patterns

- Hardcoding trust wording instead of reading `suite-contracts.ts`.
- Forking the composer or model selector per surface.
- Rendering a control that does nothing ("demo" buttons).
- Color/spacing literals scattered in components instead of theme tokens.
- Toast-only error reporting with no inline/`aria-live` fallback.
- Animations with no `prefers-reduced-motion` path.
- Showing a stale or optimistic provider label that does not match the actual route.
