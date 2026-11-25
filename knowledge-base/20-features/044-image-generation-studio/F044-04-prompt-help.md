---
id: "F044-04"
type: "feature"
title: "Prompt help"
aliases: ["Prompt suggestions", "Prompt enhancement", "Prompt rewrite", "Example prompts", "Prompt help"]
area: "44 Image-generation studio"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S44.05", "S44.06"]
depends_on: ["F044-01", "SYS-model-catalog-and-routing", "SYS-chat-turn-pipeline", "SYS-execution-boundaries", "surface:web", "surface:mobile", "surface:cli"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F044-04 Prompt help

Not built. Image mode does not suggest example prompts and does not rewrite a prompt for the person to accept or reject. The person types the prompt by hand on every app. Existing onboarding starter prompts are not tied to image mode.

Area: [44. Image-generation studio](README.md). Requirement items: [S44.05](../../10-requirements/capabilities/044-image-generation-studio.md#s4405), [S44.06](../../10-requirements/capabilities/044-image-generation-studio.md#s4406).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would give a person a starting prompt to pick, and would offer an improved version of their prompt to accept or reject before any image is made. Nothing in the code does this today. (brief S44.05, S44.06)

**Why it exists.** Describing a picture well is hard for new users, and leading apps help with this. The brief records it as a wanted capability with every app missing. (brief S44.05, S44.06)

**Who uses it.** Would be: people new to image generation.

**Problems it solves**

- Blank-page problem in image mode.
- Weak prompts that give poor images (would need user control, so a rewrite never changes the prompt without consent).

**Use cases**

- Tap a suggestion chip and see it fill the composer.
- Press 'Improve prompt', read the rewrite, and choose Use or Keep mine.

## 2. User experience

**Where to find it**

- Not available on Web, Desktop, Mobile, CLI or Chrome. The only related text is the image-mode placeholder 'Describe the image you want' or 'Describe or edit an image' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5883-5887).

**Before you start**

- Not applicable: no control exists.

**Screens and controls**

- None. The web Style menu appends a phrase to the prompt but is a style tool, not prompt help (ChatComposerNew.tsx:6344-6350).

**Journey**

1. 1. Person opens image mode.
2. 2. Person types the prompt by hand.
3. 3. Person sends. No suggestion or rewrite step occurs (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3705-3770).

**What the person sees and gets**

- None for this feature.

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for this feature. Adjacent: the Style menu on Web adds style words to the prompt (ChatComposerNew.tsx:6344-6350); the chat model may write its own prompt when it calls the image tool (apps/web/app/api/media/image/lib/image-chat-tools.ts:64-451), but the person does not review it [inferred].

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- A revisedPrompt field is carried on some Mobile messages and shown as the prompt in settings captions, but no code was found that produces a rewritten prompt before generation (apps/mobile/src/features/chat/components/MessageBubble.tsx:1103) [inferred from grep].

**Not available**

- Prompt suggestions: Web, Desktop, Mobile, CLI, Chrome.
- Prompt enhancement with review: Web, Desktop, CLI, Chrome (brief S44.06 lists no Mobile status); Mobile also found none.
- A search of the Web composer, Mobile source and CLI source for enhance, rewrite and example-prompt features found only onboarding starter prompts, which do not mention images (apps/web/features/onboarding/components/StarterPrompts.tsx).

## 4. Required behaviour

**Established requirements**

- Image mode offers example or suggested prompts the user can pick. (source: S44.05 (brief))
- User can have the product rewrite or enhance the image prompt and review or reject the rewrite before generating. (source: S44.06 (brief))

**Acceptance criteria**

1. In image mode a short list of example prompts is visible and tapping one fills the composer without sending.
2. An 'improve prompt' action shows the original and the rewrite side by side and sends nothing until the person accepts one.
3. Rejecting the rewrite leaves the original prompt unchanged.
4. The rewrite step states which model made it and what it costs, if anything, and follows the same plan and trust-boundary rules as chat.
5. The feature works on every app that has image mode, or the brief records why not.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A rewrite uses a text model call, so it must obey the mode rules: Local stays on device, own key uses the person's key, Cloud uses managed usage; it must not silently move a Local prompt to a cloud provider (doc: AGENTS.md section 6) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add static suggestion chips from a shared list in packages/ui so all apps share them.
- [proposed] Implement rewrite as an explicit button with a diff view; no auto-rewrite.
- [proposed] Meter the rewrite under the existing chat usage, not under image quota.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ChatComposerNew placeholder and send path | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Where image-mode text is entered and sent; the place a suggestion or rewrite step would hook (lines 3705-3770,5883-5887). |
| config | IMAGE_STYLE_PRESETS | `apps/web/features/chat/lib/imageGenerationOptions.ts` | Nearest existing prompt-text helper (lines 95-104). |
| service | image-chat-tools | `apps/web/app/api/media/image/lib/image-chat-tools.ts` | Model-written prompts for the chat image tool (not reviewed by the person). |
| component | AddToChatSheet | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Mobile image mode entry; no suggestions (lines 927-978). |
| service | resolveMobileImageGenerationRequest | `apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts` | Sends the typed prompt unchanged (lines 250-291). |
| command | agi image prompt argument | `apps/cli/src/lib.rs` | CLI takes the prompt as typed (line 1113). |
| service | CLI prepare | `apps/cli/src/cloud/image.rs` | Uses the typed or remembered prompt (lines 796-821). |
| component | StarterPrompts (onboarding) | `apps/web/features/onboarding/components/StarterPrompts.tsx` | Generic starter prompts; no image content found. |
| schema | prompt field | `packages/contracts/cloud-contracts/src/managed-media.ts` | Prompt 1 to 4000 characters (line 90). |
| test | ChatComposerNew image tests | `apps/web/features/chat/components/Composer/ChatComposerNew.test.tsx` | Existing image-mode tests; none for suggestions or rewrite. |
| service | moderateManagedPrompt | `apps/web/app/api/media/image/lib/managed-image-generation.ts` | Any rewritten prompt would still pass this safety floor (lines 279-314). |
| config | Chat model routing | `packages/contracts/types/src/model-catalog.ts` | Source of any text model a rewrite would use. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Today the typed prompt is sent unchanged to the generate route. | device and our servers | useMediaGeneration.ts:507-509; apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:299-301 |
| No suggestion or rewrite step exists. | device | Search of apps/web/features/chat, apps/mobile/src and apps/cli/src found no such code |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Prompt text | Job row prompt column and the chat message | Server held for Cloud | Unknown |

**Models and providers.** No model is used for prompt help because the feature does not exist. [proposed] A future rewrite should use the chat model of the current mode.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code (feature does not exist). |
| Permissions | none found in the code. |
| Subscription | none found in the code; image mode itself needs the image_generation capability (billing-catalog.ts:356). |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | none found in the code. Image mode itself is not available in Local mode (F044-01). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty prompt | Mobile blocks with 'Add an image prompt'; Web sends nothing; CLI says 'An image needs a prompt.' | resolveMobileImageGenerationRequest.ts:110-113,251; ChatComposerNew.tsx:3744; apps/cli/src/cloud/image.rs:817 |
| Suggestions, rewrite review, rejection, loading, errors | not handled in the code | Feature absent; no suggestion or rewrite code found in the searched folders |
| Accessibility, offline, timeout | not handled in the code | Feature absent; nothing to handle |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/ChatComposerNew.test.tsx`: Image mode behaviour; no test for suggestions or rewrite was found by name.
- `apps/mobile/__tests__/image-generation-admission.test.ts`: Empty-prompt block (line 153); nothing about suggestions.

**Test scenarios**

- **Confirm absence on Web**
  1. Enter image mode on Web.
  2. Look for suggestion chips and an improve-prompt control.
  - Expected: None are present today (a future build should show them).
- **Confirm absence on Mobile**
  1. Open Add to chat, choose Create image.
  2. Look for suggestions.
  - Expected: None today.
- **Acceptance for a future rewrite**
  1. Type a short prompt, press improve.
  2. Read the rewrite, press reject, send.
  - Expected: The original prompt is sent; no usage for the rewrite is charged to image quota.
- **Safety on rewrite**
  1. Submit a rewrite that includes blocked content.
  - Expected: The server still returns 422 content_policy_violation.

**Where to look when it fails**

- No log lines or tables exist for this feature.
- Search the source for the words enhance, rewrite and suggested prompts to confirm it is still absent.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No prompt suggestions in image mode.** Affects: Web, Desktop, Mobile, CLI, Chrome. Evidence: brief S44.05 status all missing. Work needed: Design, build and test a suggestion list per app.
- **No prompt enhancement with user control.** Affects: Web, Desktop, CLI, Chrome (and Mobile by code search). Evidence: brief S44.06. Work needed: Design a review step, choose the model route per mode, and enforce consent.
- **Brief lists no Mobile status for S44.06.** Affects: Mobile. Evidence: brief S44.06 line has web, desktop, cli, chrome only. Work needed: Record the Mobile status.
- Not built on: Web, Desktop, Mobile, CLI, Chrome (from the capability ledger).

**Depends on**

- F044-01
- SYS-model-catalog-and-routing
- SYS-chat-turn-pipeline
- SYS-execution-boundaries
- surface:web
- surface:mobile
- surface:cli

## Unknown

- Whether the Web and Mobile composers hide a 'revised prompt' returned by a provider; none was found being displayed before generation.
- Whether the competitor-guidance document requires prompt help (docs/product/competitive-guidance.md was not read).
- Brief status of S44.06 on Mobile.
