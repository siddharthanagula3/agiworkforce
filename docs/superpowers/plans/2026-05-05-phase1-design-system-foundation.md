# Phase 1 — Design System Foundation + Mobile Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the `packages/types` design-system primitives that the next 4 phases consume on every surface, and fix the 3 mobile P0/P1 bugs surfaced by the 2026-05-05 cross-surface UI audit.

**Architecture:** Six new TypeScript modules in `packages/types` define a single contract for provider display, effort levels, agent mode, connector permissions, settings IA, and user identity. All 6 product surfaces (`apps/{desktop,web,mobile,cli,extension,extension-vscode}`) import from this contract starting in Phase 2. Mobile bug fixes are independent surface fixes that ship in the same PR for atomicity.

**Tech Stack:** TypeScript (packages/types). React Native + Expo (apps/mobile). Markdown (VSCode README).

**Source documents:**

- `docs/superpowers/specs/2026-05-05-ui-audit/MASTER.md` (synthesis)
- `docs/superpowers/specs/2026-05-05-ui-audit/DECISIONS.md` (locked product decisions D1–D5)
- `docs/superpowers/specs/2026-05-05-ui-audit/{desktop,web,mobile,cli,chrome-extension,vscode-extension}.md` (per-surface gap analysis)

**Locked working preference (from MEMORY):** No testing mid-stream — implement, smoke-verify, commit. Comprehensive test pass deferred to a separate test sprint.

**Locked commitlint:** lowercase, 100 char max, Conventional Commits with `Co-Authored-By:` footer.

---

## File structure

### Created

```
packages/types/src/design-system/
├── index.ts                  (Task 4)  Barrel export
├── provider-display.ts       (Task 4)  Provider icon URLs, brand colors, capability sub-labels
├── effort.ts                 (Task 5)  Effort enum + per-provider mapping
├── agent-mode.ts             (Task 6)  AgentMode enum + temp-chat + composer-state contract
├── connector-permission.ts   (Task 7)  ConnectorPermissionLevel enum + tool-permission schema
├── settings-ia.ts            (Task 8)  SettingsCategory enum + per-surface override hooks
└── user-identity.ts          (Task 9)  UserIdentity + PlanBadge + UsageMeter contract

apps/extension-vscode/README.md   (Task 10)  Marketplace listing
```

### Modified

```
apps/mobile/app/(app)/settings/index.tsx           (Task 1)
apps/mobile/app/(app)/about.tsx                    (Task 2)
apps/mobile/app/(app)/dispatch/index.tsx           (Task 3)
packages/types/src/index.ts                        (Task 4 — re-export design-system barrel)
apps/cli/src/cli_options.rs                        (Task 11 — `--effort` flag wording)
```

---

## Task 1 — Mobile settings redirect bug (P0)

**Why:** Per `mobile.md` C-rank 1 — `settings/index.tsx:6` redirects deep-links to app root instead of the settings tab. This is the only P0 bug in the audit.

**Files:**

- Modify: `apps/mobile/app/(app)/settings/index.tsx:6`

**Steps:**

- [ ] **Step 1: Read the current file**

```bash
cat apps/mobile/app/\(app\)/settings/index.tsx
```

Expected: a small file with `<Redirect href="/(app)" />` (or similar) on line 6.

- [ ] **Step 2: Change the redirect target to the settings tab**

Replace the redirect target with the canonical settings tab route. The Expo Router path for the settings tab is `/(app)/(tabs)/settings` based on the file layout in `apps/mobile/app/(app)/(tabs)/settings.tsx`.

```tsx
// apps/mobile/app/(app)/settings/index.tsx
import { Redirect } from 'expo-router';

export default function SettingsIndex() {
  return <Redirect href="/(app)/(tabs)/settings" />;
}
```

- [ ] **Step 3: Smoke verify**

Run the mobile app (`pnpm --filter mobile start`), open in simulator, hit any deep link to `/settings` (e.g., `npx uri-scheme open agiworkforce:///settings --ios`). Expected: lands on the Settings tab, not the home screen.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/\(app\)/settings/index.tsx
git commit -m "$(cat <<'EOF'
fix(mobile): correct settings redirect to tabs route

deep-links to /settings now land on the settings tab; fixes p0 audit gap from
docs/superpowers/specs/2026-05-05-ui-audit/mobile.md (c-rank 1)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Mobile About screen reads version from expo-constants (P1)

**Why:** Per `mobile.md` C-rank 2 — `about.tsx:14` hardcodes `APP_VERSION = '1.0.0'`; users see a permanently stale version. The pattern at `settings.tsx:195` (using `Constants.expoConfig?.version`) is the canonical mobile pattern.

**Files:**

- Modify: `apps/mobile/app/(app)/about.tsx:14`

**Steps:**

- [ ] **Step 1: Read the current file**

```bash
cat apps/mobile/app/\(app\)/about.tsx
```

Expected: lines 14–15 hardcode `APP_VERSION = '1.0.0'` and `APP_BUILD = '1.0.0 (1)'`.

- [ ] **Step 2: Read the canonical pattern from settings.tsx**

```bash
sed -n '193,200p' apps/mobile/app/\(app\)/\(tabs\)/settings.tsx
```

Expected: pattern using `Constants.expoConfig?.version` and a build number resolution.

- [ ] **Step 3: Replace the hardcoded literals**

Use `expo-constants` to read both version and build. The build number resolution differs by platform (`ios.buildNumber` vs `android.versionCode`).

```tsx
// apps/mobile/app/(app)/about.tsx — replace the existing hardcoded constants
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const APP_VERSION = Constants.expoConfig?.version ?? 'unknown';
const APP_BUILD = (() => {
  const cfg = Constants.expoConfig;
  if (!cfg) return 'unknown';
  if (Platform.OS === 'ios') return `${cfg.version} (${cfg.ios?.buildNumber ?? '?'})`;
  if (Platform.OS === 'android') return `${cfg.version} (${cfg.android?.versionCode ?? '?'})`;
  return cfg.version ?? 'unknown';
})();
```

- [ ] **Step 4: Verify TypeScript still compiles**

```bash
pnpm --filter mobile typecheck
```

Expected: no new TS errors.

- [ ] **Step 5: Smoke verify**

Reload the app, navigate to About. Expected: version matches `apps/mobile/app.json` `expo.version`. On iOS sim, build number matches `expo.ios.buildNumber`.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/\(app\)/about.tsx
git commit -m "$(cat <<'EOF'
fix(mobile): read about-screen version from expo-constants

removes hardcoded '1.0.0' literals at about.tsx:14-15; matches the canonical
pattern at settings.tsx:195. fixes p1 audit gap (mobile.md c-rank 2)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Mobile Dispatch attachment button removed pending Decision E5

**Why:** Per `mobile.md` C-rank 3 — Plus button at `dispatch/index.tsx:278` has no `onPress` handler, silently does nothing. The audit's Section E5 asks "what file types should this support" and that decision is not yet made. Removing the button now eliminates the silent failure; we re-add it in a follow-up plan once scope is locked.

**Files:**

- Modify: `apps/mobile/app/(app)/dispatch/index.tsx:278` (remove the broken button)

**Steps:**

- [ ] **Step 1: Read the surrounding context**

```bash
sed -n '270,295p' apps/mobile/app/\(app\)/dispatch/index.tsx
```

Expected: a `<Pressable>` or `<TouchableOpacity>` with a `+` icon and no `onPress` (or an empty handler).

- [ ] **Step 2: Remove the button JSX**

Delete the entire button element. Leave a one-line comment in its place pointing to the audit:

```tsx
// dispatch attachment button intentionally absent until decision E5 in
// docs/superpowers/specs/2026-05-05-ui-audit/mobile.md is resolved
```

- [ ] **Step 3: Verify the surrounding flex/layout still looks right**

Reload the app, open Dispatch. Expected: input row composes cleanly without a stranded gap where the button was.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/\(app\)/dispatch/index.tsx
git commit -m "$(cat <<'EOF'
fix(mobile): remove no-op dispatch attachment button

button at dispatch/index.tsx:278 had no onpress handler. removing pending
decision e5 (file-type scope) per audit mobile.md c-rank 3

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — `packages/types/src/design-system/provider-display.ts`

**Why:** Per MASTER §1.1 — every surface buries our 13-provider differentiator inside its model picker. A single source of truth for provider icons, brand colors, and capability sub-labels makes Phase 2 (unified model picker) implementable in parallel across 5 surfaces.

**Files:**

- Create: `packages/types/src/design-system/provider-display.ts`
- Create: `packages/types/src/design-system/index.ts` (barrel export — bootstrap here, extend in Tasks 5–9)
- Modify: `packages/types/src/index.ts` (re-export the barrel)

**Steps:**

- [ ] **Step 1: Create the barrel export file**

```bash
mkdir -p packages/types/src/design-system
```

```ts
// packages/types/src/design-system/index.ts
export * from './provider-display';
```

- [ ] **Step 2: Create provider-display.ts with the provider catalog**

The 13 providers come from the verified list in `apps/cli/src/models.rs:287-304` per MEMORY.md. Asset URLs are CDN-hosted neutral-brand SVGs; we own copies under `packages/types/assets/providers/` (created later in this task).

```ts
// packages/types/src/design-system/provider-display.ts

/**
 * Canonical provider identity used by all 6 surfaces.
 * Single source of truth — adding a provider here makes it appear in every model picker.
 */
export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'xai'
  | 'deepseek'
  | 'perplexity'
  | 'qwen'
  | 'moonshot'
  | 'zhipu'
  | 'ollama'
  | 'lmstudio'
  | 'custom-openai-compatible'
  | 'agi-cloud';

export interface ProviderDisplay {
  id: ProviderId;
  /** Human-readable name shown in pickers. Stable across surfaces. */
  label: string;
  /** Icon path resolved at build time per surface (web: /providers/, native: bundled, cli: ascii). */
  icon: string;
  /** Brand-neutral hex used as a sidebar dot when icons aren't available (e.g., narrow CLI). */
  brandColor: string;
  /** True when the provider is local (Ollama, LMStudio); affects "BYOK or Local" filter chips. */
  isLocal: boolean;
  /** True when provider supports an explicit thinking/reasoning effort axis. */
  supportsEffort: boolean;
}

export const PROVIDER_DISPLAY: Readonly<Record<ProviderId, ProviderDisplay>> = Object.freeze({
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    icon: 'providers/anthropic.svg',
    brandColor: '#D4A27F',
    isLocal: false,
    supportsEffort: true,
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    icon: 'providers/openai.svg',
    brandColor: '#10A37F',
    isLocal: false,
    supportsEffort: true,
  },
  google: {
    id: 'google',
    label: 'Google',
    icon: 'providers/google.svg',
    brandColor: '#4285F4',
    isLocal: false,
    supportsEffort: true,
  },
  xai: {
    id: 'xai',
    label: 'xAI',
    icon: 'providers/xai.svg',
    brandColor: '#000000',
    isLocal: false,
    supportsEffort: false,
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    icon: 'providers/deepseek.svg',
    brandColor: '#4D6BFE',
    isLocal: false,
    supportsEffort: false,
  },
  perplexity: {
    id: 'perplexity',
    label: 'Perplexity',
    icon: 'providers/perplexity.svg',
    brandColor: '#1FB8CD',
    isLocal: false,
    supportsEffort: false,
  },
  qwen: {
    id: 'qwen',
    label: 'Qwen',
    icon: 'providers/qwen.svg',
    brandColor: '#615CED',
    isLocal: false,
    supportsEffort: false,
  },
  moonshot: {
    id: 'moonshot',
    label: 'Moonshot',
    icon: 'providers/moonshot.svg',
    brandColor: '#16A34A',
    isLocal: false,
    supportsEffort: false,
  },
  zhipu: {
    id: 'zhipu',
    label: 'Zhipu',
    icon: 'providers/zhipu.svg',
    brandColor: '#3B82F6',
    isLocal: false,
    supportsEffort: false,
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama',
    icon: 'providers/ollama.svg',
    brandColor: '#000000',
    isLocal: true,
    supportsEffort: false,
  },
  lmstudio: {
    id: 'lmstudio',
    label: 'LM Studio',
    icon: 'providers/lmstudio.svg',
    brandColor: '#7C3AED',
    isLocal: true,
    supportsEffort: false,
  },
  'custom-openai-compatible': {
    id: 'custom-openai-compatible',
    label: 'Custom (OpenAI-compatible)',
    icon: 'providers/custom.svg',
    brandColor: '#71717A',
    isLocal: false,
    supportsEffort: false,
  },
  'agi-cloud': {
    id: 'agi-cloud',
    label: 'AGI Cloud',
    icon: 'providers/agi.svg',
    brandColor: '#F59E0B',
    isLocal: false,
    supportsEffort: true,
  },
});

/** Capability vocabulary for sub-labels in pickers. Locked from MASTER §1.1. */
export type CapabilityTier = 'fastest' | 'balanced' | 'most-capable';

export const CAPABILITY_LABEL: Readonly<Record<CapabilityTier, string>> = Object.freeze({
  fastest: 'Fastest',
  balanced: 'Balanced',
  'most-capable': 'Most capable',
});
```

- [ ] **Step 3: Re-export from `packages/types/src/index.ts`**

Append (don't replace):

```ts
// packages/types/src/index.ts — append at end
export * from './design-system';
```

- [ ] **Step 4: Create placeholder asset directory**

The actual SVG asset files are out-of-scope for this task — Phase 2 surface implementations will resolve them per surface (web: `/public/providers/`, native: bundled). For now, document the expected paths.

```bash
mkdir -p packages/types/assets/providers
```

```text
# packages/types/assets/providers/README.md
SVG icons for each ProviderId in src/design-system/provider-display.ts.
Filenames must match the icon path (e.g., anthropic.svg).
Each surface vendors these into its own asset pipeline at build time.
```

- [ ] **Step 5: Verify package builds**

```bash
pnpm --filter @agiworkforce/types build
```

Expected: clean build, no TS errors.

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/design-system/index.ts packages/types/src/design-system/provider-display.ts packages/types/src/index.ts packages/types/assets/providers/README.md
git commit -m "$(cat <<'EOF'
feat(types): add provider-display catalog for unified model picker

13-provider source of truth (label, icon path, brand color, isLocal,
supportsEffort). consumed by phase 2 surface specs per
docs/superpowers/specs/2026-05-05-ui-audit/master.md s1.1

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — `packages/types/src/design-system/effort.ts`

**Why:** Per DECISIONS.md D5 — vocabulary is `Effort` with levels `Low / Medium / High / Max`. Per-provider parameter mapping (Anthropic `thinking.budget_tokens`, OpenAI `reasoning.effort`, Gemini `thinkingConfig.thinkingBudget`) lives below the UX layer.

**Files:**

- Create: `packages/types/src/design-system/effort.ts`
- Modify: `packages/types/src/design-system/index.ts` (add export)

**Steps:**

- [ ] **Step 1: Create effort.ts**

```ts
// packages/types/src/design-system/effort.ts

/** UI-facing effort axis. Locked vocabulary per DECISIONS.md D5. */
export type Effort = 'low' | 'medium' | 'high' | 'max';

export const EFFORT_LABEL: Readonly<Record<Effort, string>> = Object.freeze({
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  max: 'Max',
});

/** Anthropic thinking.budget_tokens by effort level. */
export const ANTHROPIC_THINKING_BUDGET: Readonly<Record<Effort, number>> = Object.freeze({
  low: 4096,
  medium: 16384,
  high: 32768,
  max: 65536,
});

/** OpenAI reasoning.effort string by effort level (note: 'max' falls back to 'high' for o-series). */
export const OPENAI_REASONING_EFFORT: Readonly<Record<Effort, 'low' | 'medium' | 'high'>> =
  Object.freeze({
    low: 'low',
    medium: 'medium',
    high: 'high',
    max: 'high',
  });

/** Gemini thinkingConfig.thinkingBudget by effort level. */
export const GEMINI_THINKING_BUDGET: Readonly<Record<Effort, number>> = Object.freeze({
  low: 4096,
  medium: 16384,
  high: 32768,
  max: 65536,
});

/**
 * Map a UI effort level to a per-provider request parameter slice.
 * Local providers (Ollama, LMStudio) and providers without effort support
 * return `null` — caller should not include any effort-related field.
 */
export function effortToProviderParams(
  effort: Effort,
  providerId: string,
): Record<string, unknown> | null {
  switch (providerId) {
    case 'anthropic':
      return { thinking: { type: 'enabled', budget_tokens: ANTHROPIC_THINKING_BUDGET[effort] } };
    case 'openai':
      return { reasoning: { effort: OPENAI_REASONING_EFFORT[effort] } };
    case 'google':
      return {
        generationConfig: { thinkingConfig: { thinkingBudget: GEMINI_THINKING_BUDGET[effort] } },
      };
    default:
      return null;
  }
}
```

- [ ] **Step 2: Add to barrel**

```ts
// packages/types/src/design-system/index.ts — append
export * from './effort';
```

- [ ] **Step 3: Verify build**

```bash
pnpm --filter @agiworkforce/types build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/design-system/effort.ts packages/types/src/design-system/index.ts
git commit -m "$(cat <<'EOF'
feat(types): add effort axis with per-provider parameter mapping

low/medium/high/max effort levels mapped to anthropic thinking.budget_tokens,
openai reasoning.effort, gemini thinkingconfig.thinkingbudget. locked
vocabulary per decisions.md d5

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — `packages/types/src/design-system/agent-mode.ts`

**Why:** Per MASTER §1.2 — permissions/agent-control bar is fragmented across 5 surfaces. Single contract enables the unified design in Phase 3.

**Files:**

- Create: `packages/types/src/design-system/agent-mode.ts`
- Modify: `packages/types/src/design-system/index.ts`

**Steps:**

- [ ] **Step 1: Create agent-mode.ts**

```ts
// packages/types/src/design-system/agent-mode.ts
import type { Effort } from './effort';

/**
 * Agent operating mode — locked vocabulary across all 6 surfaces.
 * Maps to apps/cli/src/cli_options.rs:19 PermissionMode enum.
 */
export type AgentMode = 'ask' | 'auto' | 'plan' | 'bypass';

export const AGENT_MODE_LABEL: Readonly<Record<AgentMode, string>> = Object.freeze({
  ask: 'Ask before edits',
  auto: 'Edit automatically',
  plan: 'Plan mode',
  bypass: 'Bypass permissions',
});

export const AGENT_MODE_DESCRIPTION: Readonly<Record<AgentMode, string>> = Object.freeze({
  ask: 'Confirm every edit before it runs',
  auto: 'Edits run without confirmation',
  plan: 'Generate a plan; no edits until approved',
  bypass: 'Skip all approval prompts (dangerous)',
});

/**
 * Composer-state contract used by every interactive surface.
 * Per DECISIONS.md D3, scope is per-project with conversation override.
 */
export interface AgentControlState {
  /** Active mode for this conversation. May be project default or overridden. */
  mode: AgentMode;
  /** Active effort level. May be model-default if provider doesn't support effort. */
  effort: Effort;
  /** Temporary chat — does not persist to history. */
  temporaryChat: boolean;
  /** Source of truth — used by UI to show "overriding project default" hint. */
  source: 'project-default' | 'conversation-override';
}
```

- [ ] **Step 2: Add to barrel**

```ts
// packages/types/src/design-system/index.ts — append
export * from './agent-mode';
```

- [ ] **Step 3: Verify build**

```bash
pnpm --filter @agiworkforce/types build
```

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/design-system/agent-mode.ts packages/types/src/design-system/index.ts
git commit -m "$(cat <<'EOF'
feat(types): add agent-mode + agentcontrolstate contract

ask/auto/plan/bypass mode + effort + temporarychat + scope source
(project-default vs conversation-override) per decisions.md d3 and
master.md s1.2. consumed by phase 3 unified agent control bar

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7 — `packages/types/src/design-system/connector-permission.ts`

**Why:** Per DECISIONS.md D1 (hybrid storage) and MASTER §1.5 — desktop's P0 connector permission dropdown needs a typed enum. Mobile and web consume the same schema.

**Files:**

- Create: `packages/types/src/design-system/connector-permission.ts`
- Modify: `packages/types/src/design-system/index.ts`

**Steps:**

- [ ] **Step 1: Create connector-permission.ts**

```ts
// packages/types/src/design-system/connector-permission.ts

/**
 * Per-tool permission level for connectors (MCP servers, integrations).
 * Locked schema for desktop P0 (audit C-rank 5) and web P1 (C-rank 26).
 */
export type ConnectorPermissionLevel = 'always-allow' | 'needs-approval' | 'blocked';

export const CONNECTOR_PERMISSION_LABEL: Readonly<Record<ConnectorPermissionLevel, string>> =
  Object.freeze({
    'always-allow': 'Always allow',
    'needs-approval': 'Needs approval',
    blocked: 'Blocked',
  });

export const CONNECTOR_PERMISSION_DESCRIPTION: Readonly<Record<ConnectorPermissionLevel, string>> =
  Object.freeze({
    'always-allow': 'This tool runs without asking',
    'needs-approval': 'Confirm each invocation',
    blocked: 'Tool cannot be used',
  });

/** Per-connector tool config. Used by Settings → Connector detail view. */
export interface ConnectorToolPermission {
  toolName: string;
  level: ConnectorPermissionLevel;
  /** True for write/delete tools — UI shows a warning badge. */
  destructive: boolean;
}

/** Default permission for newly discovered tools. Destructive defaults to 'blocked'. */
export function defaultPermissionForTool(destructive: boolean): ConnectorPermissionLevel {
  return destructive ? 'blocked' : 'needs-approval';
}

/**
 * Storage location enum — per DECISIONS.md D1.
 * Resolved at runtime via packages/runtime/src/detect.ts.
 */
export type ConnectorPermissionStorage = 'local-vault' | 'cloud-supabase';
```

- [ ] **Step 2: Add to barrel**

```ts
// packages/types/src/design-system/index.ts — append
export * from './connector-permission';
```

- [ ] **Step 3: Verify build**

```bash
pnpm --filter @agiworkforce/types build
```

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/design-system/connector-permission.ts packages/types/src/design-system/index.ts
git commit -m "$(cat <<'EOF'
feat(types): add connector permission level enum + tool-permission schema

always-allow / needs-approval / blocked + destructive-tool default safety.
hybrid storage type (local-vault | cloud-supabase) per decisions.md d1.
unblocks desktop p0 (audit c-rank 5) and web p1 (c-rank 26)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8 — `packages/types/src/design-system/settings-ia.ts`

**Why:** Per MASTER §1.4 — six surfaces have six different settings layouts. Shared category enum + per-surface override hooks lets each surface render natively while keeping discoverability consistent.

**Files:**

- Create: `packages/types/src/design-system/settings-ia.ts`
- Modify: `packages/types/src/design-system/index.ts`

**Steps:**

- [ ] **Step 1: Create settings-ia.ts**

```ts
// packages/types/src/design-system/settings-ia.ts

/** Top-level settings categories. Locked across all surfaces per MASTER §1.4. */
export type SettingsCategory = 'account' | 'interface' | 'ai' | 'extensions';

export const SETTINGS_CATEGORY_LABEL: Readonly<Record<SettingsCategory, string>> = Object.freeze({
  account: 'Account',
  interface: 'Interface',
  ai: 'AI',
  extensions: 'Extensions',
});

export const SETTINGS_CATEGORY_DESCRIPTION: Readonly<Record<SettingsCategory, string>> =
  Object.freeze({
    account: 'Profile, billing, sessions, privacy',
    interface: 'Theme, appearance, notifications, keyboard',
    ai: 'Models, providers, effort, agent mode',
    extensions: 'Connectors, MCP servers, skills, plugins',
  });

/**
 * Sub-section within a category. Each surface picks which to render —
 * mobile may flatten, desktop may show a left rail, CLI a Ratatui overlay.
 */
export interface SettingsSection {
  id: string;
  category: SettingsCategory;
  label: string;
  description?: string;
  /** True if this section only applies to a specific surface (e.g. 'CLI sandbox'). */
  surfaceOnly?: 'desktop' | 'web' | 'mobile' | 'cli' | 'extension' | 'extension-vscode';
}

/** Canonical sections (registry — surfaces filter by `surfaceOnly`). */
export const SETTINGS_SECTIONS: ReadonlyArray<SettingsSection> = Object.freeze([
  // Account
  { id: 'profile', category: 'account', label: 'Profile' },
  { id: 'billing', category: 'account', label: 'Billing & subscription' },
  { id: 'sessions', category: 'account', label: 'Active sessions' },
  { id: 'privacy', category: 'account', label: 'Privacy & data' },
  // Interface
  { id: 'theme', category: 'interface', label: 'Theme & appearance' },
  { id: 'notifications', category: 'interface', label: 'Notifications' },
  { id: 'keyboard', category: 'interface', label: 'Keyboard shortcuts' },
  // AI
  { id: 'models', category: 'ai', label: 'Models & API keys' },
  { id: 'agent-mode', category: 'ai', label: 'Agent mode & permissions' },
  { id: 'effort', category: 'ai', label: 'Default effort' },
  { id: 'memory', category: 'ai', label: 'Memory & personalization' },
  // Extensions
  { id: 'connectors', category: 'extensions', label: 'Connectors' },
  { id: 'mcp', category: 'extensions', label: 'MCP servers' },
  { id: 'skills', category: 'extensions', label: 'Skills library' },
  { id: 'plugins', category: 'extensions', label: 'Plugins' },
  // Surface-only
  { id: 'sandbox', category: 'ai', label: 'Sandbox', surfaceOnly: 'cli' },
  { id: 'desktop-app', category: 'interface', label: 'Desktop app', surfaceOnly: 'desktop' },
]);
```

- [ ] **Step 2: Add to barrel**

```ts
// packages/types/src/design-system/index.ts — append
export * from './settings-ia';
```

- [ ] **Step 3: Verify build**

```bash
pnpm --filter @agiworkforce/types build
```

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/design-system/settings-ia.ts packages/types/src/design-system/index.ts
git commit -m "$(cat <<'EOF'
feat(types): add settings ia categories + section registry

4 top-level categories (account/interface/ai/extensions) + 17 canonical
sections with per-surface override hooks. consumed by future settings
unification work across all 6 surfaces (master.md s1.4)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9 — `packages/types/src/design-system/user-identity.ts`

**Why:** Per MASTER §1.3 — profile popover is missing on web chat (P0), missing usage meter on desktop (P1), no tier upsell on mobile (P1). Single contract makes Phase 4 implementable on every surface.

**Files:**

- Create: `packages/types/src/design-system/user-identity.ts`
- Modify: `packages/types/src/design-system/index.ts`

**Steps:**

- [ ] **Step 1: Create user-identity.ts**

```ts
// packages/types/src/design-system/user-identity.ts

/** Pricing tiers per MEMORY.md "Pricing Model (locked, per 2026-05-03 decision)". */
export type PlanTier = 'local' | 'byok' | 'hobby' | 'pro' | 'max';

export const PLAN_LABEL: Readonly<Record<PlanTier, string>> = Object.freeze({
  local: 'Local',
  byok: 'BYOK',
  hobby: 'Hobby',
  pro: 'Pro',
  max: 'Max',
});

export const PLAN_DESCRIPTION: Readonly<Record<PlanTier, string>> = Object.freeze({
  local: 'Local-only — Ollama / LMStudio',
  byok: 'Bring your own keys',
  hobby: 'Managed cloud, basic models',
  pro: 'Pro — coming soon',
  max: 'Max — coming soon',
});

/** True for tiers that are free forever — never gate the tool on these. */
export function isFreePlan(tier: PlanTier): boolean {
  return tier === 'local' || tier === 'byok';
}

/**
 * Usage meter shown in profile popover.
 * Hobby+ users see managed-plan limits; BYOK users see their own key's limits (when known);
 * Local users see no meter.
 */
export interface UsageMeter {
  /** 0–1, percentage of quota remaining. Null = no meter applies (Local mode). */
  remaining: number | null;
  /** ISO timestamp of next quota reset. Null when unbounded. */
  resetsAt: string | null;
  /** Whose limit this is — affects framing in the UI. */
  source: 'managed-plan' | 'user-api-key' | 'unbounded';
}

/** Identity surfaced everywhere user-context is shown. */
export interface UserIdentity {
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  plan: PlanTier;
  /** Optional — null for Local users not signed in. */
  usage: UsageMeter | null;
}
```

- [ ] **Step 2: Add to barrel**

```ts
// packages/types/src/design-system/index.ts — append
export * from './user-identity';
```

- [ ] **Step 3: Verify build**

```bash
pnpm --filter @agiworkforce/types build
```

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/design-system/user-identity.ts packages/types/src/design-system/index.ts
git commit -m "$(cat <<'EOF'
feat(types): add useridentity + plantier + usagemeter contract

5 plan tiers (local/byok/hobby/pro/max), isfreeplan helper, source-aware
usage meter (managed-plan vs user-api-key vs unbounded). consumed by
phase 4 monetization surfaces per master.md s1.3

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10 — VSCode marketplace README

**Why:** Per `vscode-extension.md` C-rank 7 — `package.json:4` description is a one-liner; marketplace listing is missing the rich detail page that converts installs.

**Files:**

- Create: `apps/extension-vscode/README.md`

**Steps:**

- [ ] **Step 1: Read package.json for accurate metadata**

```bash
sed -n '1,30p' apps/extension-vscode/package.json
```

Expected: name, version (0.3.0), description, publisher.

- [ ] **Step 2: Write README.md**

```markdown
# AGI Workforce for VS Code

Multi-provider AI coding assistant — 10+ providers (GPT, Claude, Gemini, and more) inside VS Code.

## Features

- **10+ providers, one extension.** Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, Ollama, LM Studio, and any OpenAI-compatible endpoint. Switch mid-conversation.
- **BYOK and Local — free forever.** Use your own API keys, or run Ollama / LM Studio locally without an account. No subscription required.
- **`@agi` chat participant** with `/explain`, `/fix`, `/refactor`, `/tests`, `/docs`, `/model` slash commands.
- **Sidebar chat** with model picker, conversation history, pinned context files.
- **Inline completions** (opt-in) for ghost-text suggestions.
- **CodeLens** above functions for "Ask AI / Tests / Docs" — one click to invoke.
- **Editor context menu** with 9 actions: Explain, Fix, Refactor, Tests, Docs, Code review, Ask about code, Explain error, Add to context.
- **Desktop bridge** (port 8787) — runs the LLM brain in the AGI Workforce desktop app for offline use.

## Setup

1. Install the extension.
2. Open the AGI Workforce sidebar (Activity Bar icon).
3. Pick a provider:
   - **BYOK:** paste your provider API key in Settings → AGI Workforce → Models.
   - **Local:** install Ollama or LM Studio; the extension auto-detects them.
   - **Cloud:** sign in with your AGI Workforce account in the sidebar header.

## Configuration

The extension declares 17+ settings under the `agiWorkforce` namespace. Open VS Code Settings and search "AGI Workforce" to browse.

Key settings:

- `agiWorkforce.model` — default model (`auto-balanced` recommended).
- `agiWorkforce.inlineCompletions.enabled` — ghost-text suggestions.
- `agiWorkforce.codeLensEnabled` — function-level lenses.
- `agiWorkforce.agent.planMode` — generate a plan before edits.
- `agiWorkforce.desktopBridge.enabled` — connect to the desktop app.

## Keyboard shortcuts

- `Cmd/Ctrl+Shift+A` — open chat (or accept diff when one is active).
- `Cmd/Ctrl+Shift+E` — explain selection.
- `Cmd/Ctrl+Shift+F` — fix selection.
- `Cmd/Ctrl+Shift+T` — generate tests.
- `Cmd/Ctrl+Shift+D` — generate docs.
- 9 more — see `Keyboard Shortcuts` editor.

## Differentiators

Most VS Code AI extensions lock you into one vendor. AGI Workforce lets you:

- Switch providers mid-conversation (Claude → GPT → Llama in the same thread).
- Use Local LLMs (Ollama, LM Studio) with zero cloud dependency.
- Bring your own API keys — no subscription, no rate-limit ceiling beyond your own key's.

## Links

- [AGI Workforce home](https://agiworkforce.com)
- [Source code](https://github.com/agiworkforce/agiworkforce)
- [Report issues](https://github.com/agiworkforce/agiworkforce/issues)

## License

See repository.
```

- [ ] **Step 3: Verify the README renders correctly**

Open `apps/extension-vscode/README.md` in VS Code with the Markdown preview side-by-side. Expected: clean rendering, no broken syntax.

- [ ] **Step 4: Commit**

```bash
git add apps/extension-vscode/README.md
git commit -m "$(cat <<'EOF'
docs(vscode): add marketplace readme

10+ provider differentiator, byok/local/cloud setup, settings + shortcuts
overview, links. addresses vscode-extension.md c-rank 7

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11 — CLI `--effort` flag canonicalization

**Why:** Per DECISIONS.md D5 — vocabulary is `Effort`. CLI's `--effort` flag is already correctly named; this task verifies the per-provider mapping aligns with `packages/types/src/design-system/effort.ts` from Task 5 and updates the help text to match.

**Files:**

- Modify: `apps/cli/src/cli_options.rs` (help text only — vocabulary verification)

**Steps:**

- [ ] **Step 1: Read the current `--effort` flag definition**

```bash
grep -n -A 5 "effort" apps/cli/src/cli_options.rs | head -30
```

Expected: a `--effort` flag with values `low|medium|high` (likely missing `max`).

- [ ] **Step 2: Add `max` as a value if absent and update help text**

The Rust enum should be:

```rust
// apps/cli/src/cli_options.rs — find the Effort enum
#[derive(Debug, Clone, Copy, ValueEnum)]
pub enum Effort {
    /// Fast — minimal reasoning budget
    Low,
    /// Default
    Medium,
    /// Deep reasoning
    High,
    /// Maximum reasoning budget (provider-cap)
    Max,
}
```

If `Max` is already present, this task is verification only — confirm the help text matches the labels in `packages/types` Task 5 (`Low / Medium / High / Max`).

- [ ] **Step 3: Build and run --help**

```bash
cargo build -p agiworkforce
./target/debug/agiworkforce exec --help | grep -A 2 effort
```

Expected: `--effort <EFFORT>` with values `low`, `medium`, `high`, `max`.

- [ ] **Step 4: Commit (only if changes made)**

```bash
git add apps/cli/src/cli_options.rs
git commit -m "$(cat <<'EOF'
feat(cli): canonicalize effort flag values to low/medium/high/max

aligns with locked vocabulary in packages/types/design-system/effort.ts and
decisions.md d5. unblocks /effort slash command in phase 3

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If no changes were needed (Max already present), skip the commit.

---

## Self-review

**Spec coverage check (against MASTER §5 Phase 1):**

- ✅ Mobile P0 redirect bug → Task 1
- ✅ Mobile P1 bugs → Tasks 2 + 3
- ✅ packages/types primitives — provider icons, capability vocab, connector permission enum, settings IA categories, agent-mode contract, effort enum → Tasks 4–9
- ✅ VSCode marketplace README → Task 10
- ✅ CLI vocabulary alignment → Task 11

**Placeholder scan:** No "TBD", no vague "add error handling," all code blocks are complete. Task 3 explicitly removes a feature pending Decision E5 — that's a deliberate scope decision, not a placeholder.

**Type consistency:** `Effort`, `AgentMode`, `ConnectorPermissionLevel`, `SettingsCategory`, `PlanTier`, `ProviderId` are defined once each and consumed by name. No drift.

**No spec-requirement gaps:** Every Phase 1 deliverable from MASTER §5 has at least one task. Phases 2+ are out of scope and will get separate plan docs.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-05-phase1-design-system-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
