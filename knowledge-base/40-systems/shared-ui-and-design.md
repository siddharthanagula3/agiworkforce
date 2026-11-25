---
id: "SYS-shared-ui-and-design"
type: "system"
title: "Shared interface code and design system"
basis: "code inspection and project documents"
second_reader: "not challenged"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Shared interface code and design system

Five workspace packages under packages/ui hold shared interface code: unified-chat (chat components, stores and headless helpers), ui (primitives), design-tokens (colour, type, motion, z-index), i18n (12 catalogues, only English and Spanish selectable) and icons. Desktop mounts the full chat; web, Chrome, VS Code and mobile use parts. Surface differences enter through injected seams, and guards enforce tokens and imports. One web-only assumption remains in the chat memory store.

## What it is and why it exists

Five pnpm packages live under `packages/ui`. Together they are the interface code that more than one app shares. [code] (packages/ui/design-tokens/package.json, packages/ui/i18n/package.json, packages/ui/icons/package.json, packages/ui/ui/package.json, packages/ui/unified-chat/package.json)

| Package | Name | One-line job (from its package.json description) |
|---|---|---|
| file:packages/ui/unified-chat | `@agiworkforce/unified-chat` | Surface-neutral chat UI, stores and hooks |
| file:packages/ui/ui | `@agiworkforce/ui` | Shared presentation primitives with no business logic |
| file:packages/ui/design-tokens | `@agiworkforce/design-tokens` | The only sanctioned source of colour, spacing and type values |
| file:packages/ui/i18n | `@agiworkforce/i18n` | Locale catalogues and message resolution; parity enforced by `check:i18n-parity` |
| file:packages/ui/icons | `@agiworkforce/icons` | Hand-authored icon family with a lucide-compatible API |

Why it exists: AGI Workforce must feel like one product on every app. The product rule is "the ChatGPT and Claude apps, feature for feel, with two differences only, any model and any API provider". [requirement] (.agents/skills/agiworkforce-design/SKILL.md, step 1). So chat rendering, tokens, copy and primitives have one owner each. AGENTS.md section 3 says every mutable concept has one canonical owner, and section 5 says `packages/ui/unified-chat` is shared by desktop, web, Chrome and VS Code, so "nothing in it may assume one surface's routing, billing, or account model". [requirement] (AGENTS.md section 5)

Both statements need two corrections from the code, covered below. Mobile also depends on unified-chat (apps/mobile/package.json:73), and Chrome and VS Code use only its non-React helper modules, not the chat screen.

The design contract adds the layering rule: `surface composition -> presentation adapter -> headless/contracts`, never reversed. Mobile, CLI, VS Code and Chrome content scripts may use native presentation. [requirement] (docs/product/experience-contract.md, sections 2 and 3.2)

## How it works today

### 1. unified-chat: one package, three kinds of export

The package has about 525 source files. [code] (find over packages/ui/unified-chat/src). Its `exports` map in file:packages/ui/unified-chat/package.json exposes the root barrel (`src/index.ts`) plus dozens of subpaths. Most subpaths are plain TypeScript with no React: `assistant-fence`, `tabular`, `message-sources`, `citation-markers`, `math-markup`, `deck-model`, `study-set`, `model-picker`, `ime-composition` and others.

1. **Full React chat.** `ChatInterface` takes a `runtime` (a `ChatRuntime` object) and an optional `hostBridge`, and renders the composer, message list, model selector, artifact panel and so on. [code] (packages/ui/unified-chat/src/components/ChatInterface.tsx:111 RuntimeContext, :1040 provider)
2. **Stores.** Zustand stores are re-exported with a `Chat` prefix (`useChatStore`, `useChatModelStore`, `useChatUIStore`, `useChatProjectStore`, `useChatSettingsStore`, `useChatArtifactStore`, `useChatAgentControlStore`). [code] (packages/ui/unified-chat/src/index.ts)
3. **Headless helpers.** Pure functions that any surface can call: fence classification, sanitising, continuation repair, regenerate replay, model admission, slash commands. Chrome, VS Code and mobile use only these.

### 2. How a surface plugs in

The package does not know which app hosts it. Four injected seams carry the differences:

| Seam | What the host supplies | Where defined |
|---|---|---|
| `ChatRuntime` | send, stop, load, create, delete, rename conversations; optional stream, supersede, upload | file:packages/ui/unified-chat/src/lib/runtime.ts |
| `ChatHostBridge` (React context `HostBridgeContext`) | conversation snapshot, `openUpgrade(requiredTier)`, `requestByokConversation`, `fetchPlanUsage`, `fetchCloudFile`, coding checkpoints, `compactConversation`, `fetchContextUsage`. Every member except `getSnapshot` is optional | file:packages/ui/unified-chat/src/lib/hostBridge.ts (lines 33-55) |
| `CapabilityProvider` | `platform` (a `SyncedAppSurface`) and an optional server capability document | file:packages/ui/unified-chat/src/lib/Capabilities.tsx |
| Sinks and origins | `setClientFailureSink`, `configureArtifactSandboxOrigin` | file:packages/ui/unified-chat/src/index.ts |

Capability logic: `useCapability(c)` first asks `resolveCapabilityDocumentDecision` on the server document. If the document has no decision, it falls back to the static matrix `isCapabilityEnabled(platform, c)` from `@agiworkforce/types/capabilities`. [code] (Capabilities.tsx, `decideCapability`). The default context is `platform: 'web'` with no document. [code] (Capabilities.tsx, `DEFAULT_CAPABILITY_CONTEXT`)

Billing and plan UI follows the same pattern. A message that carries `metadata.paywall` renders a limit card. The Upgrade button appears only when the host gave `openUpgrade`. [code] (packages/ui/unified-chat/src/components/MessageBubble.tsx:938-943). The context-usage meter fetches plan usage only if the host supplies `fetchPlanUsage` and the conversation is cloud-managed. [code] (packages/ui/unified-chat/src/components/ContextUsageMeter.tsx:69-77). The "use my own key" row in the model picker shows only if the host supplies `requestByokConversation`. [code] (packages/ui/unified-chat/src/components/ModelSelector.tsx:591-594). Price and plan wording come from `@agiworkforce/types` helpers (`getBillingPlanPricing`, `paywallLimitHeadline`), not literals. [code] (packages/ui/unified-chat/src/components/MessageLimitCard.tsx:1-8)

Execution mode is admitted by one pure function. `local_only` admits local models. `byok` admits non-local models that carry a user key. `cloud_managed` admits non-local, non-key models. [code] (packages/ui/unified-chat/src/lib/modelAdmission.ts). Mapping to this knowledge base: local_only = mode:local, byok = mode:own-key, cloud_managed = mode:cloud. [inferred] (names match; the type is ChatExecutionMode at packages/contracts/types/src/suite-contracts.ts:24)

### 3. Primitives (`@agiworkforce/ui`)

The `src/primitives` folder holds about 45 components, including Button, Dialog, Sheet, Select, Tooltip, Tabs, Switch, Spinner, ConfirmAction, ConfirmDialog, PromptDialog, TrustBadge, ModelBadge, plus the keyboard hooks `useMenuKeyboard`, `useDialogKeyboard`, `useTablistKeyboard` and `useCombobox`. It also holds larger shared areas: `sidebar`, `settings-modal`, `directory` (connector, plugin and skill browser), and `auth-scene`. [code] (directory listing of packages/ui/ui/src). The index header states the boundary rule: only pure presentation and plain config live here, and anything that imports a store, calls `invoke()` or `fetch()`, or reads Next stays per-surface. [code] (packages/ui/ui/src/index.ts, header comment)

### 4. Design tokens

Three CSS files plus one TypeScript module own every design value.

- file:packages/ui/design-tokens/src/foundation.css has three layers: primitives (`--n-*`, `--hue-*`), semantic roles, and consumption. Components touch only layer 3. It also holds the corner scale (`--corner-detail` 2px to `--corner-hero` 32px and `--corner-pill`), the z-index scale (`--z-behind-far` up to `--z-skip-link`), and durations (`--duration-instant` 90ms, `--duration-quick` 160ms, `--duration-moved` 260ms, `--duration-reveal` 700ms). [code] (foundation.css:1-15, 270-352)
- file:packages/ui/design-tokens/src/chat.css is the `--chat-*` contract, light and dark, loaded by both web and desktop. Fonts are declared there with literal fallbacks, because a `var()` inside a custom property resolves on `:root`, where next/font variables do not exist. [code] (chat.css:1-40)
- file:packages/ui/design-tokens/src/tailwind.css maps Tailwind names (`--radius-*`, `--text-*`, motion) to the semantic tokens.
- file:packages/ui/design-tokens/src/index.ts (1111 lines) mirrors the same values in TypeScript for hosts that cannot import a stylesheet: terminal palette, brand scale, chat variables, `agiExtensionCssVars` (Chrome), `agiVsCodeCssVars` (VS Code), `agiMobileColors` and high-contrast mobile colours. [code] (index.ts exports; consumers: apps/extension/src/tokens.ts, apps/mobile/src/ui/theme/tokens.ts, apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts)

A token names a role (fill, text, on-fill), not a hue. Do not dilute a text token with an opacity modifier. [requirement] (.claude/rules/ui-colour-and-interaction.md)

### 5. Translations

There are 12 language folders (`ar de en es fr hi it ja ko pt ru zh`), each with 8 namespaces (`common chat settings auth errors models pricing v3`) plus a `vscode.json`. [code] (packages/ui/i18n/locales; packages/ui/i18n/src/languages.ts). Only `en` and `es` are selectable by users. The others stay loaded for the strings they carry but are never offered, per decision D-2026-09-15-03. [code] (languages.ts, `SELECTABLE_LANGUAGE_CODES`). In shared components, `useUiTranslation(namespace)` returns `t(key, englishDefault, values)` and `plural`. English is passed in the call and used verbatim when the key or the i18next instance is missing. [code] (packages/ui/ui/src/i18n.ts)

### 6. Icons

Icons come from `lucide-react` or `@agiworkforce/icons` only. [code] (scripts/check-ui-icons.mjs, `ICON_SOURCES`). In practice `packages/ui` has 89 non-test files importing lucide-react and 3 importing the in-house package. [code] (grep count, this session). The in-house package has 9 glyph groups (Navigation, Actions, RowActions, Indicators, Composer, Media, Files, Account, Knowledge). [code] (packages/ui/icons/src/index.ts)

## Implementation map

| Concern | Owner file or folder | Basis |
|---|---|---|
| Chat screen | file:packages/ui/unified-chat/src/components/ChatInterface.tsx | [code] |
| Runtime contract | file:packages/ui/unified-chat/src/lib/runtime.ts | [code] |
| Host bridge | file:packages/ui/unified-chat/src/lib/hostBridge.ts, hook file:packages/ui/unified-chat/src/hooks/useHostBridgeSync.ts | [code] |
| Capability context | file:packages/ui/unified-chat/src/lib/Capabilities.tsx | [code] |
| Plan gate in the shared store | file:packages/ui/unified-chat/src/stores/tierStore.ts (default tier `byok`; moves a stored Auto selection to the plan default when the plan cannot use Auto) | [code] |
| Mode admission | file:packages/ui/unified-chat/src/lib/modelAdmission.ts | [code] |
| Paywall card | file:packages/ui/unified-chat/src/components/MessageLimitCard.tsx, `UsageWarningBanner.tsx`, `LocalByokHandoffDialog.tsx` | [code] |
| Artifact sandbox | file:packages/ui/unified-chat/src/lib/artifact-sandbox.ts (origin set by each host) | [code] |
| Markdown, fences, rich blocks | folder packages/ui/unified-chat/src/components/markdown | [code] |
| Composer editor | folder packages/ui/unified-chat/src/composer-editor | [code] |
| Voice state machine | file:packages/ui/unified-chat/src/voice/voice-session-machine.ts | [code] |
| Send and follow-up queues | folder packages/ui/unified-chat/src/queue | [code] |
| Primitives | folder packages/ui/ui/src/primitives, barrel file:packages/ui/ui/src/index.ts | [code] |
| Tokens | foundation.css, chat.css, tailwind.css, index.ts in packages/ui/design-tokens/src | [code] |
| Web theme blocks | `[data-design='agi']` blocks in file:apps/web/app/globals.css; fonts in file:apps/web/app/layout.tsx | [requirement] (agiworkforce-design SKILL step 4) |
| Locale loading | file:packages/ui/i18n/src/lazy.ts (lazy backend), `resources.ts` (all bundled), `en.ts`, `vscode.ts` | [code] |
| Contrast tests | file:apps/web/shared/components/__tests__/theme-contrast.test.ts | [code] (exists) |

**Who imports what.** Package dependency lines: web (apps/web/package.json:56), desktop (apps/desktop/package.json:81), Chrome (apps/extension/package.json:54), VS Code (apps/extension-vscode/package.json:1599), mobile (apps/mobile/package.json:73). [code]

| App | Source files importing unified-chat | What it takes |
|---|---|---|
| surface:web | 301 | Barrel pieces and subpaths: stores, `CapabilityProvider`, `MarkdownContent`, shortcuts, `MessageBubble` and others. Web has its own `MessageBubble` at apps/web/features/chat/components/messages/MessageBubble.tsx:4296 and does not mount `ChatInterface` in non-test code. [code] |
| surface:desktop | 76 | Mounts `ChatInterface` with a `runtime` and `hostBridge` (apps/desktop/src/features/v3/DesktopShellV3.tsx:710-717) inside `<CapabilityProvider platform="desktop">` (:676). [code] |
| surface:chrome | 15 | Headless subpaths only (assistant-fence, tabular, markdown-it-math, shiki-highlighter, model-picker, ime-composition, artifact-sandbox...). [code] |
| surface:vscode | 2 files | `markdown-it-math`, `markdown-it-task-lists`, `math-markup`, `assistant-fence` in the webview renderer (apps/extension-vscode/src/webview/render.ts). [code] |
| surface:mobile | 91 | About 60 headless subpaths, no `ChatInterface`. [code] |

The import counts are from this session's grep and will drift.

**Guards that cover this area** (all wired into `check:llm-operability`, package.json:397):

| Guard | What it enforces | Basis |
|---|---|---|
| `check:css-tokens` (scripts/check-css-tokens.mjs) | Every `var(--x)` in desktop, web, Chrome and VS Code sources must be declared by a stylesheet that surface loads, or be externally provided (`--vscode-*`, `--tw-*`, `--radix-*`, `--shiki-*`). Raw HSL-triplet tokens must be used inside `hsl()`. Six portal overlays (AlertDialog, Dialog, DropdownMenu, Popover, Select, Tooltip) may not use raw z-index. Web may not give a token a literal colour fallback. Unused `@theme` colours in web globals fail. A token may not reference itself. The radius, motion and marketing ladders must map to the `--corner-*`, `--duration-*` and `--curve-*` tokens. Tailwind arbitrary-value candidates containing `<...>` or an ellipsis fail. | [code] |
| `check:boundaries` (scripts/check-boundaries.mjs:33, :418) | A file under `services/` may not import `@agiworkforce/unified-chat` or `@agiworkforce/design-tokens`. Packages may not import app code. | [code] |
| `check:ui-buttons`, `check:ui-icons`, `check:ui-motion`, `check:ui-theme-tokens`, `check:ui-typography` | Button variants, icon sources and labelled icon-only controls, reduced-motion handling, light/dark token completeness, a closed set of legible type sizes. | [code] (script header comments) |
| `check:theme-text-colours`, `check:em-dash` | Text colours come from the theme only. No em dash in copy. | [code] (package.json:425-426; implementation not read) |
| `check:i18n-parity` | Every locale has every namespace and key of `en`; plural suffixes are checked per locale. | [code] (scripts/check-i18n-parity.mjs) |
| `check:raw-html-sinks`, `check:embedded-frame-sandbox` | Model, tool or user text reaches the DOM only through a sanitiser, a literal or a sandboxed document. | [code] (header of check-raw-html-sinks.mjs; the sandbox script header not read) |
| `check:web-ui-invariants` | Scans apps/web plus `packages/ui/ui/src` and `packages/ui/unified-chat/src` against a baseline. | [code] (scripts/check-web-ui-invariants.mjs:13-20) |
| `check:capability-consumption` | Names Capabilities.tsx as a consumption point. | [code] (scripts/check-capability-consumption.mjs:31, :101; rule not read in full) |

## Data and state

Shared state in unified-chat is held in Zustand stores in memory. A store persists only if its own code does so, and this was not checked store by store. [unknown]

| Store | Holds | Notes |
|---|---|---|
| chatStore | conversations, active id, messages; `replaceHostSnapshot` takes the host's list | The host owns the real conversation list and pushes a snapshot through `useHostBridgeSync`. [code] (hooks/useHostBridgeSync.ts) |
| modelStore | selected model id, catalog | Keeps the last verified same-boundary catalog during refresh. [code] (stores/modelStore.ts:158 comment) |
| tierStore | plan tier, current conversation provider | Default tier is `byok`. Selectors give `canSwitchProvider`, `isFreePlan`, and a provider-switch gate (`allow` or `upgrade-required`). [code] |
| budgetStore | budget snapshot, alerts, action trail | [code] |
| memoryStore | memories, synced to the server only on web | See Rules and Gaps. [code] |
| uiStore, settingsStore, projectStore, artifactStore, agentControlStore, checkpointStore, planModeStore, mediaModeStore | UI and feature state | [code] (file names only) |

Stores are exported under Chat-prefixed names so a host app can keep its own stores of the same name without clashing. [code] (index.ts)

Device or browser storage used for shared UI code:

- Web stores the language in a cookie and in `localStorage` under the key `agiworkforce-language`. [code] (apps/web/app/i18n/index.ts)
- The memory store caches a CSRF token and its expiry in module variables. [code] (stores/memoryStore.ts:114-125)

No database table is read or written by these packages directly. The one network path in the stores is `/api/memory` and `/api/csrf`. [code] (memoryStore.ts:94, :114). The server side of those routes was not read here, so table names are [unknown].

Configuration names: the unified-chat `exports` map; `SELECTABLE_LANGUAGE_CODES`; `NAMESPACES`; the `AGI_GUARD_CONCURRENCY` setting for the guard chain (AGENTS.md section 12).

## Rules: access, plans, modes

**What the shared code must not assume.** Per AGENTS.md section 5, unified-chat is shared by desktop, web, Chrome and VS Code, "so nothing in it may assume one surface's routing, billing, or account model". [requirement] (AGENTS.md section 5). The repo-wide dependency direction is surface composition, then adapter, then headless contracts. [requirement] (docs/product/experience-contract.md section 3.2). `packages/ui/ui` must not own account stores, runtime clients or navigation, and unified-chat must not own React Native, Rust TUI, Chrome content-script DOM or provider SDK logic. [requirement] (experience-contract.md section 3.1)

**How the code meets it.**

1. **Routing** goes through callbacks (`onNavigateView`, `hostBridge.openUpgrade`, `selectConversation`). `ChatInterface` takes `onNavigateView` as a prop. [code] (DesktopShellV3.tsx:169 passes `ChatInterfaceProps['onNavigateView']`)
2. **Billing**: plan facts come from `@agiworkforce/types`. The UI shows an Upgrade action only if the host supplies it. Free-plan wording is the owner's rule: Free usage screens show only Upgrade, never meters. [requirement] (owner memory note, free-usage-upgrade-only; test named there is UsageSection, not read here)
3. **Plan gates** are tier predicates from types (`canSwitchProviderInThread`, `canAccessAutoRoutingProfileForTier`, `isFreePlan`). The UI never encodes a price or a quota. [code] (stores/tierStore.ts). `check:plan-tier-predicates` exists for this. [code] (package.json:220; rule not read)
4. **Modes**: `isModelAdmittedForExecutionMode` filters the picker by mode. A model chosen for one mode is never silently valid in another. The Local to own-key move uses `LocalByokHandoffDialog` and `requestByokConversation`, the visible, explicit fork that AGENTS.md section 6 requires. [code] (modelAdmission.ts; ModelSelector.tsx:591-594) and [requirement] (AGENTS.md section 6)
5. **Provider names**: capabilities from the model registry decide controls, never a provider name. [requirement] (agiworkforce-design SKILL step 2). `LOCAL_PROVIDER_IDS` in modelAdmission.ts names local runtimes (`ollama`, `local`, `lmstudio`, `llamacpp`, `vllm`) as a literal set. That is a classification of local engines, not a cloud provider, but it is a hardcoded list. [code]
6. **Local inference needs no paid plan.** The shared chat code has no plan check in `isModelAdmittedForExecutionMode` for `local_only`. [code] (modelAdmission.ts). Whether sign-in is required is a host decision and was not established here. [unknown]

**Design rules enforced by guards and the design skill:**

- Use `useConfirmAction` for anything irreversible, `useMenuKeyboard` for any `role=menu` panel, `Spinner` for loading. [requirement] (.claude/rules/ui-colour-and-interaction.md; AGENTS.md section 9)
- A new token needs a case in theme-contrast.test.ts. [requirement] (same rule file)
- Never edit `models.json` by hand, and no model ID literal in UI code. [requirement] (AGENTS.md section 4; enforced by `check:model-id-literals`)
- Product names come from `packages/contracts/types/src/product-names.ts`. [requirement] (AGENTS.md section 4)
- No explanatory comments in product code. [requirement] (AGENTS.md section 9). The shared tree has many long explanatory comments (for example foundation.css, chat.css, runtime.ts). See Gaps.

**Skills lock.** `.agents/skills` is product content, and skill edits need `node scripts/verify-skills-lock.mjs --regenerate`. [requirement] (CLAUDE.md, AGENTS.md section 5). This applies to the design skill file as well.

## Differences between apps

| Topic | surface:web | surface:desktop | surface:chrome | surface:vscode | surface:mobile | surface:cli |
|---|---|---|---|---|---|---|
| Uses `@agiworkforce/ui` | yes (package.json:55) | yes (:80) | no | no | no | no |
| Uses unified-chat | yes, parts | yes, mounts `ChatInterface` | headless subpaths | headless subpaths | headless subpaths | no |
| Uses design-tokens | package + globals.css | package | `agiExtensionCssVars` via apps/extension/src/tokens.ts | `agiVsCodeCssVars` in webview content | `agiMobileColors` in apps/mobile/src/ui/theme/tokens.ts | not found [unknown] |
| Translations | `@agiworkforce/i18n` with lazy loading and cookie detection | `@agiworkforce/i18n` (apps/desktop/src/i18n/index.ts) | own `_locales/en/messages.json` through `chrome.i18n` (apps/extension/src/i18n.ts); English only on disk | `@agiworkforce/i18n/vscode` catalogues (apps/extension-vscode/src/l10n) | `@agiworkforce/i18n` (apps/mobile/src/i18n/index.ts) | not found [unknown] |
| Capability provider | `platform="web"` (apps/web/app/ProductRuntimeProviders.tsx:13) | `platform="desktop"` (DesktopShellV3.tsx:676) | not found [unknown] | not found [unknown] | not found [unknown] | n/a |
| Artifact sandbox origin | `configureArtifactSandboxOrigin(getSandboxOrigin())` (apps/web/app/Providers.tsx:20) | not found [unknown] | `configureArtifactSandboxOrigin(deps.sandboxOrigin)` (apps/extension/src/features/side-panel/artifactPanel.ts:476) | not found [unknown] | not applicable | n/a |
| Failure sink | `setClientFailureSink` (apps/web/lib/observability/client-failure-transport.ts:77) | same call (apps/desktop/src/services/clientFailureReporting.ts:45) | not found | not found | not found | n/a |

The public Desktop is Electron and shows the hosted web app, so a change in `apps/desktop/src` reaches only the retained Tauri build. [requirement] (AGENTS.md section 5). That affects what "desktop mounts ChatInterface" means for a user. The mount point DesktopShellV3 is in `apps/desktop/src`. Whether the public Electron window runs that code is not established here. [unknown]

The CLI is a Rust TUI and takes no part in these packages. [requirement] (experience-contract.md section 3.1 lists Rust TUI as out of scope for unified-chat)

Only web and desktop carry the full chat shell. The package description says desktop, web, Chrome and VS Code, and AGENTS.md says the same. The code shows the last two use helpers only, and mobile also uses them. [code] (import counts above)

## Failure handling

- **Render crash in chat.** `ChatInterface` wraps its tree in an error boundary class. It shows "Something went wrong in the chat." and a Try again button, and logs the error outside production. [code] (ChatInterface.tsx:80-110). These strings are plain English, not routed through `useUiTranslation`. See Gaps.
- **Missing translation.** `useUiTranslation` returns the English passed at the call site when the key or the i18next instance is absent. [code] (packages/ui/ui/src/i18n.ts)
- **Unknown locale resource.** `loadLocaleNamespace` throws for an unsupported language or namespace, and the lazy backend passes the error to i18next. [code] (packages/ui/i18n/src/lazy.ts)
- **Network errors.** `toUserMessage`, `toUserMessageWithStatus`, `httpStatusMessage` and `networkErrorMessage` turn failures into user text, and exist in both ui and unified-chat. [code] (both index.ts files). Duplicate definitions exist: `network-error.ts` appears under both packages. Whether one re-exports the other was not checked. [unknown]
- **Client failures** are classified and sent to a host-supplied sink: `reportClientFailure`, `setClientFailureSink`, `CLIENT_FAILURE_CLASSES`. With no sink set, behaviour is [unknown].
- **Optional host methods** (`openUpgrade`, `fetchPlanUsage`, `requestByokConversation`) are optional, and the UI hides the control instead of showing a dead one. [code] (MessageBubble.tsx:942, ContextUsageMeter.tsx:77, ModelSelector.tsx:594). This matches the product rule that a hidden control beats an enabled no-op. [requirement] (experience-contract.md section 2, rule 4)
- **Memory sync** gives up quietly in a non-web host: `canSyncToServer()` is false in Tauri and React Native. [code] (memoryStore.ts:77-84). Failure text: "Could not reach your memory. Nothing changed." [code] (memoryStore.ts:96). Switching accounts aborts in-flight requests through an account generation counter. [code] (memoryStore.ts:98-111)
- **Artifact preview when scripts are blocked** uses `getSameDocumentScriptSupport` and shows `SCRIPTS_BLOCKED_NOTICE`. [code] (index.ts exports)
- **Token or CSS drift** fails the guard chain and does not fail at runtime. A `var()` with no declaration "is dropped and the element renders unstyled". [code] (check-css-tokens.mjs, error text)

## How it should work

These are the stated targets, not claims about the code.

1. **One owner for every visual and shared behaviour value**, with the dependency direction surface composition, then adapter, then headless contracts. [requirement] (experience-contract.md section 3)
2. **The product UI feels like ChatGPT and Claude**: sidebar 260 wide, 34px rows, one 768 column, 48px header, one-row composer, hover-gated action row, Stop in the send slot. [requirement] (agiworkforce-design SKILL step 2, citing docs/research/leader-ui-measurements-2026-09-04.md section 9)
3. **Public pages are black, white and neutral grey with the logo accents**, Geist for text, no decorative amber. [requirement] (SKILL step 3). The public pages live in apps/web and are only touched here through the token files.
4. **Browser comparison is the acceptance test**: screenshot at 1440, 1024, 390 and 320 in both themes, and run the web specs. [requirement] (SKILL step 8)
5. **Guards before commit**: css-tokens, em-dash, hardcoded model IDs, theme-only text colours, web typecheck, eslint and prettier. [requirement] (SKILL step 9)
6. **Capability honesty**: a hidden or disabled control is better than an enabled no-op. [requirement] (experience-contract.md section 2)
7. **Languages are offered only when a catalogue is complete and reviewed.** [code] (languages.ts comment citing D-2026-09-15-03)
8. **[proposed]** Move the memory store's web-origin fetch (`/api/memory`, `/api/csrf`) behind a host-supplied client, like `fetchPlanUsage`, so the package has no URL knowledge. Keep the existing runtime checks until then.

## Gaps

Implementation status means the code exists and is connected. Verification status means someone ran it. No run is recorded in this review, so every verification status below is [unknown] unless a test file exists. A test file existing does not mean it passed.

| # | Gap | Basis | Implementation | Verification |
|---|---|---|---|---|
| 1 | `memoryStore` in unified-chat calls relative URLs `/api/memory` and `/api/csrf` and decides by environment sniffing (Tauri, React Native, `window`, `document`). This is the one place in the package that assumes a web origin with those routes, against the AGENTS.md section 5 rule. It is not a hole for mobile and Tauri because `canSyncToServer()` blocks them. Chrome and VS Code do not use the store. | [code] (memoryStore.ts:60-94, :114) | Present, gated | [unknown] |
| 2 | `ConnectorConnectCard` reads `window.location.pathname` and `search` as its return path. That is a browser URL assumption inside shared code. | [code] (ConnectorConnectCard.tsx:47) | Present | [unknown] |
| 3 | `tierStore` defaults to tier `byok` before any host sets the plan, and the shared package holds plan logic (`reconcileSelectionWithTier` rewrites the model selection). The behaviour is derived from `@agiworkforce/types`, but the store is a billing-aware shared store. Whether every host sets the tier before first render was not checked. | [code] (stores/tierStore.ts) | Present | [unknown] |
| 4 | Docs say unified-chat consumers are desktop and web only, but five apps declare the dependency. | [code] vs docs/agent-context/repo-map.json:1138-1150 | n/a | n/a |
| 5 | The error boundary text in `ChatInterface` and the memory failure text are not translated, even though the package otherwise uses `useUiTranslation`. Many assistant sentences in ConnectorConnectCard are English literals too. | [code] (ChatInterface.tsx:80-110; memoryStore.ts:96; ConnectorConnectCard.tsx:30-40) | Present | [unknown] |
| 6 | Only English and Spanish are selectable. Ten catalogues are kept but hidden. Chrome ships only English `_locales`. | [code] (languages.ts; ls apps/extension/_locales) | Present | Parity guard exists (`check:i18n-parity`), its last result is [unknown] |
| 7 | The design skill says the landing logo has no shine overlay, yet foundation.css defines `.agi-mark-shine` and `AgiMark.tsx` uses it. The skill rule is scoped to landing logo motion, so whether the shine is used there was not checked. | [code] (foundation.css:~560-590; packages/ui/ui/src/AgiMark.tsx) vs [requirement] (SKILL step 3) | Present | [unknown] |
| 8 | AGENTS.md section 9 asks for no explanatory comments. The shared tree has many. | [code] (e.g. runtime.ts, foundation.css) vs [requirement] | n/a | n/a |
| 9 | Chrome and VS Code do not read the shared token CSS files. They read TypeScript mirrors with literal hex values, kept equal by a test. `check:css-tokens` lists `index.ts` as their token source, but is only a reference check. | [code] (check-css-tokens.mjs SURFACES; design-tokens/src/index.ts header) | Present | The equality test is theme-contrast.test.ts, result [unknown] |
| 10 | Both ui and unified-chat define `network-error` modules. Possible duplication. | [code] (package.json exports of both) | Present | [unknown] |

## How to verify

Nothing was run for this page. The project was read only. The commands below come from the repo and are what a person would run. Heavy jobs must go through `scripts/dev/heavy-job.sh` and scoped tests through `scripts/dev/light-job.sh`. [requirement] (CLAUDE.md, Delegation)

| Check | Command or test | Source |
|---|---|---|
| Tokens resolve on all four surfaces | `node scripts/check-css-tokens.mjs` (or `pnpm check:css-tokens`) | package.json:424 |
| Colour contrast in both themes | test:apps/web/shared/components/__tests__/theme-contrast.test.ts (run inside apps/web with its own Vitest) | .claude/rules/ui-colour-and-interaction.md; AGENTS.md section 12 |
| Theme completeness | `pnpm check:ui-theme-tokens`, `check:ui-motion`, `check:ui-typography`, `check:ui-buttons`, `check:ui-icons` | package.json:297-301 |
| Translation parity | `pnpm check:i18n-parity` | package.json:145 |
| Import boundaries | `pnpm check:boundaries` | package.json:168 |
| Raw HTML sinks and frame sandbox | `pnpm check:raw-html-sinks`, `pnpm check:embedded-frame-sandbox` | package.json:356-357 |
| Chat package tests | `pnpm --filter @agiworkforce/unified-chat test` (about 274 test files) | docs/agent-context/lanes.json:290; file count from this session |
| Primitive tests | `pnpm --filter @agiworkforce/ui test` (about 78 test files) | package.json of ui |
| Icon tests | `pnpm --filter @agiworkforce/icons test` (1 test file) | package.json of icons |
| Guard chain | `pnpm check:llm-operability` | AGENTS.md section 12 |
| Mock factories match real exports | `pnpm check:mock-exports` | AGENTS.md section 12 |
| Look in a real browser | Screenshot at 1440, 1024, 390 and 320, both themes; run chat-layout specs | SKILL step 8 |

To check the neutrality claim by hand: search `packages/ui/unified-chat/src` for `fetch(`, `window.location`, `__TAURI`, and relative `/api/` strings. At the time of reading this gave `memoryStore.ts`, `ConnectorConnectCard.tsx`, and same-origin file fetches in `MessageBubble.tsx:508` and `MessageGeneratedFiles.tsx:231`. [code]

## Key facts

| Fact | Basis | Source |
|---|---|---|
| packages/ui contains five workspace packages: unified-chat, ui, design-tokens, i18n and icons, all private, version 0.0.1. | read in the code | `packages/ui/unified-chat/package.json`; `packages/ui/ui/package.json`; `packages/ui/design-tokens/package.json`; `packages/ui/i18n/package.json`; `packages/ui/icons/package.json` |
| Five apps declare a dependency on @agiworkforce/unified-chat: web, desktop, Chrome extension, VS Code extension and mobile. The docs list only desktop and web. | read in the code | `apps/web/package.json:56`; `apps/desktop/package.json:81`; `apps/extension/package.json:54`; `apps/extension-vscode/package.json:1599`; `apps/mobile/package.json:73`; `docs/agent-context/repo-map.json:1138-1150` |
| Only desktop mounts the ChatInterface component in non-test code. Web builds its own MessageBubble and composer and takes stores, capabilities and markdown pieces from unified-chat. | read in the code | `apps/desktop/src/features/v3/DesktopShellV3.tsx:710`; `apps/web/features/chat/components/messages/MessageBubble.tsx:4296` |
| Chrome and VS Code import only headless (non-React) subpaths of unified-chat, such as assistant-fence, markdown-it-math and tabular. | read in the code | `apps/extension/src/features/side-panel/artifactPanel.ts:476`; `apps/extension-vscode/src/webview/render.ts` |
| A surface plugs into unified-chat through ChatRuntime, ChatHostBridge, CapabilityProvider, setClientFailureSink and configureArtifactSandboxOrigin. | read in the code | `packages/ui/unified-chat/src/lib/runtime.ts`; `packages/ui/unified-chat/src/lib/hostBridge.ts:33-55`; `packages/ui/unified-chat/src/lib/Capabilities.tsx`; `packages/ui/unified-chat/src/index.ts` |
| Every ChatHostBridge member except getSnapshot is optional. The UI hides the Upgrade button, BYOK row and plan-usage fetch when the host does not supply them. | read in the code | `packages/ui/unified-chat/src/lib/hostBridge.ts:40-42`; `packages/ui/unified-chat/src/components/MessageBubble.tsx:942-943`; `packages/ui/unified-chat/src/components/ModelSelector.tsx:591-594`; `packages/ui/unified-chat/src/components/ContextUsageMeter.tsx:69-77` |
| useCapability prefers the server capability document and falls back to the static platform matrix. The default platform is web with no document. | read in the code | `packages/ui/unified-chat/src/lib/Capabilities.tsx` |
| Model admission by execution mode is a pure function: local_only admits local models, byok admits non-local key models, cloud_managed admits non-local non-key models. | read in the code | `packages/ui/unified-chat/src/lib/modelAdmission.ts` |
| unified-chat has one web-origin assumption in a store: memoryStore calls relative /api/memory and /api/csrf, gated off in Tauri and React Native. | read in the code | `packages/ui/unified-chat/src/stores/memoryStore.ts:77-94`; `packages/ui/unified-chat/src/stores/memoryStore.ts:114` |
| ConnectorConnectCard reads window.location for its return path, a browser URL assumption in shared code. | read in the code | `packages/ui/unified-chat/src/components/ConnectorConnectCard.tsx:47` |
| The tier store defaults to tier byok and rewrites a stored Auto model selection to the plan default when the plan cannot use Auto. | read in the code | `packages/ui/unified-chat/src/stores/tierStore.ts` |
| Token ownership: foundation.css (primitives, semantic roles, corner, z-index, duration scales), chat.css (--chat-* contract), tailwind.css (Tailwind mapping), index.ts (TypeScript mirror for extension, VS Code and mobile). | read in the code | `packages/ui/design-tokens/src/foundation.css:1-15`; `packages/ui/design-tokens/src/chat.css:1-40`; `packages/ui/design-tokens/src/tailwind.css:1-45`; `packages/ui/design-tokens/src/index.ts` |
| check-css-tokens.mjs checks four surfaces (desktop, web, chrome, vscode), blocks raw z-index in six portal overlays, blocks literal colour fallbacks on web, and checks radius, motion and marketing ladders map to --corner-*, --duration-*, --curve-*. | read in the code | `scripts/check-css-tokens.mjs` |
| A colour token names a role (fill, text, on-fill), not a hue, and text tokens must not take opacity modifiers. | stated requirement | `.claude/rules/ui-colour-and-interaction.md` |
| Twelve locale folders exist with eight namespaces each plus vscode.json, but only en and es are selectable by users. | read in the code | `packages/ui/i18n/src/languages.ts`; `packages/ui/i18n/locales` |
| useUiTranslation takes the English text at the call site and uses it when the key or i18next instance is missing. | read in the code | `packages/ui/ui/src/i18n.ts` |
| Chrome uses its own chrome.i18n catalogue with only an en folder on disk, not @agiworkforce/i18n. VS Code uses the i18n package's vscode catalogues. | read in the code | `apps/extension/src/i18n.ts`; `apps/extension/_locales`; `packages/ui/i18n/src/vscode.ts`; `apps/extension-vscode/src/l10n/index.ts` |
| Icons may come only from lucide-react or @agiworkforce/icons; in packages/ui the great majority of files still import lucide-react (89 vs 3 files). | read in the code | `scripts/check-ui-icons.mjs`; `grep counts over packages/ui` (not found) |
| check:boundaries forbids services/ from importing unified-chat or design-tokens and forbids packages importing app code. | read in the code | `scripts/check-boundaries.mjs:33`; `scripts/check-boundaries.mjs:418` |
| Dependency direction required by design: surface composition to presentation adapter to headless contracts, never reversed. ui must not own account stores or runtime clients. | stated requirement | `docs/product/experience-contract.md` |
| ChatInterface's error boundary text and its Try again button are plain English literals, not translated. | read in the code | `packages/ui/unified-chat/src/components/ChatInterface.tsx:80-110` |
| Paywall cards read metadata.paywall and take plan wording and prices from @agiworkforce/types, not literals. | read in the code | `packages/ui/unified-chat/src/components/MessageLimitCard.tsx:1-30` |
| Test file counts: about 274 in unified-chat, 78 in ui, 1 in icons. Existence only, no run result recorded. | read in the code | `find over packages/ui/*` (not found) |
| Web sets artifact sandbox origin in Providers.tsx and both web and desktop install a client-failure sink; Chrome sets the sandbox origin in its side panel. | read in the code | `apps/web/app/Providers.tsx:20`; `apps/web/lib/observability/client-failure-transport.ts:77`; `apps/desktop/src/services/clientFailureReporting.ts:45`; `apps/extension/src/features/side-panel/artifactPanel.ts:476` |
| The CLI (Rust TUI) is outside the shared UI packages by design. | stated requirement | `docs/product/experience-contract.md` |
| No test, guard or build was run for this page. Verification status of everything is unknown. | unknown | `read-only review of the project folder` (not found) |

## Open questions

- Does the public Electron desktop run the apps/desktop/src shell that mounts ChatInterface, or does it show the hosted web app only? AGENTS.md says the latter, DesktopShellV3 says the former exists in the Tauri build.
- Do Chrome, VS Code and mobile install a CapabilityProvider, a client-failure sink and an artifact sandbox origin? Only web, desktop and Chrome (sandbox origin only) were found.
- Is the web-origin memory store meant to stay in unified-chat, or move behind a host-supplied client? The code gates it by environment sniffing, and the repo has no recorded decision.
- Does local inference on mobile and desktop need sign-in? The shared admission code has no plan check, but account requirements are set by each host and were not read.
- Which stores persist to device storage (store:* names), and under what keys? Not established per store.
- What does the client-failure reporter do when no sink is set?
- Is the AgiMark shine animation used on the landing logo, which the design skill forbids?
- Are network-error modules in ui and unified-chat duplicates or re-exports?
- What did the last run of check:css-tokens, check:i18n-parity and theme-contrast.test.ts report? No run record was found.
- Whether and when more than English and Spanish become selectable (decision D-2026-09-15-03 is cited in code; the decision record was not opened).
- Whether the CLI or any other surface shares tokens through a Rust or generated path; none was found.

## Project documents found out of date

- `docs/agent-context/repo-map.json (packages/ui/unified-chat entry, line 1138-1150)`: Lists consumers of packages/ui/unified-chat as apps/desktop and apps/web only, with trust boundary 'cloud consumer chat presentation and state'. The code says: Chrome, VS Code and mobile also declare and import it (headless subpaths). The tierStore and BYOK or local handoff pieces show it also carries non-cloud modes. (apps/extension/package.json:54; apps/extension-vscode/package.json:1599; apps/mobile/package.json:73)
- `packages/ui/ui/src/index.ts header comment`: Says the package is shared by web and desktop only. The code says: Still true for package.json dependencies (web and desktop, plus unified-chat), but the ui package also exports auth-scene, sidebar and directory areas that are not 'plain config'. The header understates the scope. (packages/ui/ui/package.json exports; directory listing of packages/ui/ui/src)
- `AGENTS.md section 5 and packages/ui/unified-chat/package.json description`: Say unified-chat is shared by desktop, web, Chrome and VS Code. This is incomplete: it omits mobile, and Chrome and VS Code use only helper modules, not the chat UI. The code says: Full chat UI mount found only in desktop. Web uses selected pieces, mobile uses about 60 helper subpaths, Chrome and VS Code use a few. (apps/desktop/src/features/v3/DesktopShellV3.tsx:710; apps/mobile/package.json:73; apps/extension/src and apps/extension-vscode/src/webview/render.ts imports)
- `.agents/skills/agiworkforce-design/SKILL.md step 3 (logo motion: no shine overlay)`: Possible mismatch: states no shine overlay on the landing logo. The code says: foundation.css still defines .agi-mark-shine with an offset-path animation. Whether the landing uses it was not checked. (packages/ui/design-tokens/src/foundation.css (agi-mark-shine rules near the end of file))
