# Batch 02 — Model Selector Variants

Audited: 2026-05-24
Reference: Claude desktop (May 2026)
Surface: apps/web (Next.js)

---

## IMG: 101_claude-max20x_model-selector_opus-enabled.png

- Feature: Model selector dropdown on Max 20x plan with Opus 4.7 selected, showing curated model list (Opus 4.7 / Sonnet 4.6 / Haiku 4.5), in-dropdown "Adaptive thinking" toggle, and "More models >" submenu link
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/101_claude-max20x_model-selector_opus-enabled.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/Composer/ComposerFooter.tsx (model selector popover)
  - apps/web/shared/stores/model-store.ts (model state + available models)
  - apps/web/constants/llm.ts (model metadata, tier logic, presets)
  - packages/types/src/models.json (canonical model catalog)
- API endpoints: GET /api/models (serves catalog; not consumed by client-side selector)
- Data flow:
  - models.json defines all model metadata; re-exported via @agiworkforce/types
  - constants/llm.ts imports catalog, builds MODEL_PRESETS and MODEL_METADATA maps
  - model-store.ts buildAvailableModels() iterates MODEL_PRESETS, groups managed_cloud auto-modes first then all provider models, filtering to chat/code/reasoning/multimodal types
  - ComposerFooter.tsx imports AVAILABLE_MODELS, groups by providerKey, renders a Command/search popover with provider group headings
  - useModelStore persists selectedModelId + thinkingEnabled + thinkingBudget to localStorage
  - ComposerFooter effort selector is a separate Popover sibling (Brain icon) outside the model dropdown
- Flaws:
  - [critical] Model dropdown renders all models grouped by provider with search input, instead of 3 curated tier-appropriate models (Opus/Sonnet/Haiku). No tier-based filtering in the selector UI despite tier logic existing in constants/llm.ts (getAllowedModelsForTier, isModelAllowedForTier). The functions canAccessManualModelSelection() and getAllowedAutoModesForTier() are defined but never called by ComposerFooter. @ ComposerFooter.tsx:106-113, ComposerFooter.tsx:226-281
  - [critical] "Adaptive thinking" toggle is rendered outside the model dropdown as a separate Brain icon button (ComposerFooter.tsx:148-198), not as an in-dropdown row between models and "More models" as shown in the reference. In Claude's UI the toggle row is always visible inside the dropdown regardless of provider. In AGI's UI the Brain button is hidden entirely when the provider does not support effort (providerSupportsEffort check at line 148/188); when an Anthropic model is selected the button does appear (supportsEffort=true in PROVIDER_DISPLAY) but in two states outside the dropdown: a popover trigger when on (line 148-185) or a single-icon enable button when off (line 188-198).
  - [major] Trigger button displays provider logo + model name + chevron (ComposerFooter.tsx:210-215). Reference shows "Opus 4.7 Adaptive" with no provider logo — the active thinking-mode label ("Adaptive") is appended to the model name in the trigger text.
  - [major] No "More models >" submenu concept. Claude shows a "More models" row at bottom of dropdown that expands to show legacy/older variants (Opus 4.6, Sonnet 4.5). AGI flattens everything into one searchable list. No code path for nested submenu of additional models.
  - [minor] Model descriptions differ. Claude shows "Most capable for ambitious work" / "Responsive everyday work" / "Fastest, most efficient". AGI's describeModel() in model-store.ts:56-68 generates from bestFor array ("Frontier Coding . Agentic Workflows") or falls back to qualityTier labels.
  - [minor] Selected model indicator is a small dot (1.5x1.5 bg-primary circle, ComposerFooter.tsx:274), not a checkmark as in the reference.
- Visual gaps:
  - Claude's dropdown has no search input; AGI's has a CommandInput search bar
  - Claude's dropdown has a clean separator between model items and the Adaptive thinking row; AGI places thinking outside the dropdown entirely
  - Claude shows a thin checkmark icon for selected model; AGI shows a tiny filled dot
  - No equalizer/settings icon next to model name in trigger (Claude shows an audio-bars icon right of the trigger)

---

## IMG: 102_claude-max20x_model-selector_more-models.png

- Feature: "More models" submenu expanded from main model selector, showing additional models (Opus 4.6, Opus 3, Sonnet 4.5) with usage warning tooltip "Opus consumes usage limits faster than other models"
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/102_claude-max20x_model-selector_more-models.png
- Implementation status: missing
- Primary files:
  - apps/web/features/chat/components/Composer/ComposerFooter.tsx
  - apps/web/shared/stores/model-store.ts
- API endpoints: none
- Data flow:
  - Same as IMG 101 — no secondary submenu in the data flow
  - model-store.ts buildAvailableModels() returns a flat list; no concept of "primary" vs "more" model groupings
  - No tier or model-family partitioning in the UI layer
- Flaws:
  - [critical] "More models" submenu does not exist. No code in ComposerFooter.tsx implements a nested dropdown or expandable section to show legacy/additional model variants. All models are dumped into a single flat searchable list.
  - [major] Usage warning tooltip ("Opus consumes usage limits faster than other models") is completely absent. No tooltip or warning text anywhere in ComposerFooter.tsx or model-store.ts. No per-model usage multiplier or warning metadata exposed in the UI despite models.json containing inputCost/outputCost data.
  - [major] Adaptive thinking toggle and "More models" are rendered together in the same dropdown in the reference, with "More models" appearing after the toggle. AGI has neither in-dropdown placement.
- Visual gaps:
  - No nested submenu animation or expand/collapse behavior
  - No usage-warning tooltip on hover over Opus model entries
  - "More models" in reference shows a right-arrow chevron indicating submenu; no equivalent affordance

---

## IMG: 042_claude-free_model-selector_opus-upgrade.png

- Feature: Model selector on Free plan showing Opus 4.7 with "Upgrade" badge, Sonnet 4.6 selected (checkmark), Haiku 4.5 available, Adaptive thinking toggle, "More models" link, and upgrade tooltip: "Upgrade to Claude Pro to use our best and latest models"
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-free/2026-05-15/042_claude-free_model-selector_opus-upgrade.png
- Implementation status: missing
- Primary files:
  - apps/web/features/chat/components/Composer/ComposerFooter.tsx
  - apps/web/constants/llm.ts (tier logic: isModelAllowedForTier, canAccessManualModelSelection)
  - apps/web/lib/model-tiers.ts (server-side tier gating: canAccessModel, MODEL_TIER_REQUIREMENTS)
- API endpoints: none directly (tier enforcement is server-side in model-tiers.ts, not wired to selector UI)
- Data flow:
  - Tier logic exists in two places: constants/llm.ts (client-side: TIER_ALLOWED_MODELS, getAllowedModelsForTier) and lib/model-tiers.ts (server-only: canAccessModel)
  - Neither is imported or used by ComposerFooter.tsx
  - ComposerFooter.tsx:106 calls groupByProvider(AVAILABLE_MODELS) with no tier filtering
  - No subscription/auth context consumed by the model selector
- Flaws:
  - [critical] No tier-gating in the model selector UI. ComposerFooter shows all models to all users regardless of subscription tier. The functions isModelAllowedForTier() and getAllowedModelsForTier() exist in constants/llm.ts but are never imported by ComposerFooter. No "Upgrade" badge or disabled state for tier-locked models.
  - [critical] No upgrade CTA or tooltip. Claude shows "Upgrade to Claude Pro to use our best and latest models" tooltip when hovering the Upgrade badge. No equivalent in the codebase — no upgrade prompt, no plan awareness, no redirect to billing/pricing page from the model selector.
  - [major] Free plan trigger shows "Sonnet 4.6 Adaptive" in reference. AGI has no concept of defaulting free-tier users to a specific model in the selector UI.
  - [minor] "Free plan . Upgrade" banner shown above the model dropdown in the reference (in the page header). No equivalent plan-status indicator on the web chat page.
- Visual gaps:
  - No "Upgrade" badge (teal/green pill) next to locked model names
  - No tooltip appearing on hover explaining upgrade benefits
  - No visual distinction between accessible and locked models (greyed out, lock icon, etc.)

---

## IMG: 003-cowork-model-menu-adaptive-thinking.png

- Feature: Model selector in Cowork tab context showing Opus 4.7 selected, same 3-model curated list, Adaptive thinking toggle (on), "More models" link, with "Work in a project" and "Ask" mode toggles, and usage warning tooltip
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude/2026-05-13/003-cowork-model-menu-adaptive-thinking.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/Composer/ComposerFooter.tsx
  - apps/web/shared/stores/model-store.ts
- API endpoints: none
- Data flow:
  - Same as IMG 101 — ComposerFooter is reused across chat pages
  - ChatComposerNew.tsx:1024 renders <ComposerFooter hint={footerHint} showModelSelector />
  - The Cowork tab concept ("Work in a project" / "Ask" mode toggle) maps loosely to the AgentModeSwitcher in ChatComposerNew but not to the model selector specifically
- Flaws:
  - [critical] Same curated-vs-flat-list structural mismatch as IMG 101 (ComposerFooter.tsx:226-281)
  - [critical] Adaptive thinking toggle placement: outside dropdown, not inside. Same as IMG 101 (ComposerFooter.tsx:148-198)
  - [major] Usage warning tooltip "Opus consumes usage limits faster than other models" absent. No tooltip text or hover behavior in ComposerFooter.tsx.
  - [major] "More models" submenu link absent. Same as IMG 101.
  - [major] "Work in a project" / "Ask" mode selector is visible in reference adjacent to the model trigger. AGI has AgentModeSwitcher but it is buried inside the "+" overflow menu (ChatComposerNew.tsx:731-742), not visible at the same level as the model selector.
  - [minor] Trigger text format mismatch: reference shows "Opus 4.7" with status label, AGI shows provider logo + model name.
- Visual gaps:
  - No "Active" task list shown alongside model selector in Cowork context
  - No "Get to know Cowork" cards in AGI's web — no Cowork surface equivalent

---

## IMG: 166_claude-max20x_project-model-selector.png

- Feature: Model selector inside a project detail page (project "How to use Claude"), showing same curated 3-model list, Adaptive thinking toggle (on), and "More models >" link. Right sidebar shows project context (Files, Memory).
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/166_claude-max20x_project-model-selector.png
- Implementation status: partial
- Primary files:
  - apps/web/features/chat/components/Composer/ComposerFooter.tsx
  - apps/web/app/projects/[id]/page.tsx (project detail page)
  - apps/web/features/projects/components/KnowledgeFilesPanel.tsx
- API endpoints: none
- Data flow:
  - apps/web/app/projects/[id]/page.tsx renders project detail but does NOT embed a ChatComposerNew or ComposerFooter. It shows chats/sources tabs. No model selector is rendered in the project page.
  - The model selector only appears in the chat page via ChatComposerNew -> ComposerFooter
  - Project context (Memory, Files sidebar) has no equivalent on the web project detail page
- Flaws:
  - [critical] No model selector on the project detail page. The project page (apps/web/app/projects/[id]/page.tsx) does not render a composer or model selector. In Claude's reference, the project page includes a full composer with model selector directly embedded.
  - [critical] Same curated-vs-flat mismatch applies if/when the model selector is added — ComposerFooter would need the same tier/curation fixes documented in IMG 101.
  - [major] No "Memory" panel ("Only you" privacy indicator, "Project memory will show here after a few chats") on the project detail page. No project memory feature implemented.
  - [major] No "Files" panel with file cards (showing "Claude prompting guide.md, 414 lines") on the project detail page. KnowledgeFilesPanel exists but is not connected to the same visual layout as the reference.
  - [minor] No "Add relevant context for your project" instructional card at top of right sidebar.
- Visual gaps:
  - Project page lacks the embedded composer with model selector entirely
  - No right sidebar with Files + Memory sections
  - No "Example project" badge next to project title
  - No breadcrumb "All projects" link

---

## IMG: 111_claude-max20x_code_model-effort-menu.png

- Feature: Code-surface (Claude Code tab in desktop) compound model+effort popover showing: Models section (Opus 4.7, Opus 4.7 1M, Sonnet 4.6, Haiku 4.5, Opus 4.6 Legacy) with keyboard-shortcut numbers (1-5); Effort section (Low, Medium, High, Extra high, Max) with keyboard shortcuts; and a "Fast mode" toggle at bottom.
- Image path: /Users/siddhartha/Desktop/reference/ui/desktop/claude-max20x/2026-05-15/111_claude-max20x_code_model-effort-menu.png
- Implementation status: N/A (desktop Code tab; no web equivalent surface)
- Primary files:
  - apps/web/features/chat/components/Composer/ComposerFooter.tsx (closest web analog)
- API endpoints: none
- Data flow:
  - This screenshot is from the desktop app's Code tab, which has no direct web surface equivalent
  - The closest web analog is ComposerFooter's effort selector (separate Brain popover)
  - Web effort levels: low/medium/high/max (4 levels). Reference shows: Low/Medium/High/Extra high/Max (5 levels)
- Flaws:
  - [major] Web effort selector has 4 levels (low/medium/high/max at ComposerFooter.tsx:83) vs reference's 5 levels (Low/Medium/High/Extra high/Max). "Extra high" tier is missing from EFFORT_ORDER.
  - [major] No keyboard shortcuts for model or effort selection. Reference shows numeric shortcuts 1-5 for models and per-effort shortcuts. No keybinding support in ComposerFooter.
  - [major] No combined model+effort compound popover. Web separates model selection (Command popover) from effort selection (Brain button popover). Reference shows them in a single unified panel.
  - [major] No "Fast mode" toggle ("Enable fast mode") at bottom of popover. No equivalent feature in the web app.
  - [minor] No context-window variant display (e.g., "Opus 4.7 1M" as separate entry). models.json has context window data but ComposerFooter does not display context-window variants as separate selectable entries.
  - [minor] No model usage statistics (sessions, messages, tokens, streaks) dashboard visible alongside. The Code tab shows an overview dashboard above the selector.
- Visual gaps:
  - Desktop Code tab layout has heatmap activity grid, session stats — no web equivalent
  - Compound popover has distinct "Models" and "Effort" sections with dividers and keyboard-shortcut badges
  - "Fast mode" toggle row at bottom with description "Enable fast mode"
  - Model entries show selected checkmark with count badges (e.g., "2" next to Opus 4.7 1M)

---

## Cross-Cutting Summary

### Recurring Critical Issues (affect images 1-5)

1. **Flat all-provider model list vs curated tier list** — ComposerFooter.tsx:106-281 dumps every model from AVAILABLE_MODELS into a searchable Command popover grouped by provider. Claude shows 3 curated models (Opus/Sonnet/Haiku) appropriate to the user's plan tier. Tier logic exists (constants/llm.ts) but is not wired to the selector UI.

2. **Adaptive thinking toggle placement** — ComposerFooter.tsx:148-198 renders the thinking toggle outside the model dropdown. Claude places it inside the dropdown, between model entries and "More models". The toggle is also conditionally hidden when off in AGI; Claude always shows it.

3. **"More models" submenu absent** — No nested submenu or expandable section for legacy/additional variants. All models are shown in the flat list.

4. **No tier-gating or upgrade prompts** — ComposerFooter does not import or use any tier-checking functions. No "Upgrade" badges, no disabled states for locked models, no upgrade tooltips.

5. **Usage warning absent** — No "Opus consumes usage limits faster" tooltip or any model-specific usage cost warning in the selector.

6. **"Adaptive" vs "Auto" semantic mismatch** — Claude's "Adaptive" label in the trigger (e.g., "Opus 4.7 Adaptive") denotes per-model extended thinking budget (the model thinks harder when the task is complex). AGI's auto-modes (auto-economy / auto-balanced / auto-premium) in model-store.ts:50-54 denote managed-cloud routing across different models. These look similar in the trigger area but are fundamentally different concepts. A developer implementing "make ours match" could confuse the two: Claude's Adaptive is a thinking toggle on a fixed model; AGI's Auto is a model-routing strategy. The trigger label should append the thinking-mode state (e.g., "Adaptive" when thinkingEnabled=true) to the selected model name, not conflate it with auto-routing.

### Architecture Note

ModeSelector.tsx (apps/web/features/chat/components/Tools/ModeSelector.tsx) is NOT the model selector despite its name — it is a chat-mode selector (team/engineer/research/race/solo). The actual model selector lives in ComposerFooter.tsx.
