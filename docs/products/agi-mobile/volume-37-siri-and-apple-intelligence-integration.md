# AGI Mobile — Volume 37 — Siri & Apple Intelligence Integration

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01
Authority: AGENTS.md, docs/current/source-of-truth.md, docs/products/README.md, apps/mobile/AGENTS.md, apps/mobile/**tests**/app-intents-deeplink.test.ts, apps/mobile/app.config.js, Apple App Review Guidelines (curl-verified 2026-07-01: 5.1.2(i), SiriKit and Shortcuts), Apple App Intents documentation (developer.apple.com/documentation/appintents, doc-JSON verified 2026-07-01), WWDC26 Apple Intelligence guide (developer.apple.com/wwdc26/guides/apple-intelligence/).

## Overview & stance

This volume specifies how AGI Mobile integrates with Siri, Apple Intelligence, Spotlight, Shortcuts, and widgets through the **App Intents** framework — and the Android analog via **App Functions**. The trust rule shapes everything: an intent invocation runs in the user's currently selected mode. A Siri-triggered chat in Local mode stays on-device; Siri never becomes a side door that routes Local content to Managed Cloud. Mobile has no BYOK, so intents resolve only to Local (on-device LLM) or Cloud (signed-in, entitled) execution.

Platform facts verified from official sources (2026-07-01): App Intents is Apple's single path — "Make content and actions discoverable by Apple Intelligence and support system experiences like Siri, Spotlight, Shortcuts, and widgets" (framework abstract). SiriKit was formally deprecated at WWDC26 with a multi-year migration window (reported; the App Intents doc carries a Deprecated section). The June 8, 2026 App Review Guidelines update added explicit third-party-AI consent (5.1.2(i)) and retained the SiriKit/Shortcuts conduct rules.

## App Intents adoption (schemas, not phrases)

🟡 Partial — the JS deep-link contract exists and is tested: `apps/mobile/__tests__/app-intents-deeplink.test.ts` locks the `agiworkforce://intent/<verb>?<params>` URL shape (verbs `chat`, `ask` with `prompt` param) that a Swift dispatcher must honor. The Swift App Intents extension itself (`AGIIntentDispatch` named by the test) is 🔭 — `ios/agiworkforce` contains only `AppDelegate.swift` today.

Requirements:

- Adopt **App Intents schemas** (system-defined structures) rather than custom phrases: per WWDC26, "no specific phrases to define, and no code changes needed as Siri's language understanding evolves." Start with the assistant/communication-adjacent schemas that map to our verbs.
- v1 intent set (each must run without opening a companion app, per guideline 5.1.2 SiriKit/Shortcuts rule (i)): Start New Chat; Ask AGI (one-shot prompt→answer); Continue Last Chat; New Voice Chat 🔭; Search Chats 🔭.
- Each intent resolves through the existing deep-link contract into `apps/mobile/app/_layout.tsx` handling (Linking.parse path), so JS behavior stays testable in Jest while the Swift layer stays thin.

## Entity schemas & Spotlight semantic index

🔭 Planned. Per WWDC26: "Entity schemas contribute your app's content to the Spotlight semantic index, enabling personal context understanding with attribution back to your app." For AGI Mobile this is trust-partitioned:

- **Cloud conversations** (titles + metadata only, never message bodies in v1) may be donated as entities so Siri can find/resume them, gated behind a Settings toggle (default OFF until reviewed).
- **Local conversations are never donated.** Donating Local titles to a system index that syncs or leaves the app's sandbox would breach the Local boundary; Local content stays out of the semantic index entirely until Apple's on-device-only indexing guarantees are verified.

## View Annotations (on-screen awareness)

🔭 Planned. The WWDC26 View Annotations API "lets you map your views to entities so people can reference and act on what's right in front of them conversationally." Candidate surfaces: the chat screen (current conversation entity) and message bubbles (copyable answer entity). Same trust gate: annotations attach only in Cloud mode; Local screens are not annotated in v1.

## Siri-triggered execution & trust modes

Binding behavior:

1. Intent fires → app resolves the user's current app mode (Local vs Cloud) exactly as the composer would.
2. Local mode: run on the on-device model (Volume 38); no network call; if the on-device runtime is unavailable, the intent returns an honest "open the app to finish setup" result — never a silent Cloud fallback.
3. Cloud mode: `remoteChatGate` applies unchanged (fails closed when Cloud is disabled ✅ `apps/mobile/services/remoteChatGate.ts`); an unauthenticated invocation routes to sign-in, mirroring PA-2 behavior.
4. Siri results render answer text via the intent result dialog/snippet; long answers deep-link into the app.

## Guideline compliance (June 8, 2026 update)

Verified live from the guidelines page:

- **5.1.2(i)**: "You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so." AGI Cloud routes prompts to third-party model providers via our gateway — the Cloud consent surface (onboarding + Settings → Privacy) must name this explicitly. 🟡 — Cloud consent exists in onboarding; the third-party-AI wording needs an explicit pass.
- **SiriKit and Shortcuts (i–iii)**: register only intents we can fulfill without another app; plist vocabulary must pertain to AGI (aliases only our app/company name, no third-party names); resolve requests directly with no ads/marketing between request and fulfillment.
- Do not present Apple model access inaccurately (agentic-AI review posture): the intent UI must label which engine answered (on-device vs AGI Cloud) — consistent with our visible-trust-label UX Lock.

## Shortcuts, widgets & Apple Watch

🟡 Partial — `apps/mobile/src/features/widget-setup/index.tsx` ships a widget/shortcut setup screen today. Requirements: expose the v1 intents as Shortcuts actions (automatable, parameterized); a lock-screen/home widget "Ask AGI" entry 🔭; watchOS complication 🔭 (watchOS FoundationModels is 27.0 beta — do not claim watch support before it ships).

## App Intents Testing framework

🔭 Planned. WWDC26 ships an App Intents Testing framework to "validate your entire integration — Siri, Shortcuts, and Spotlight — through real system pathways, without UI automation." Adopt it in the iOS test plan alongside the existing Jest deep-link contract tests; the JS/Swift contract stays the seam.

## Android parity — App Functions

🔭 Planned. Android's **App Functions** framework is the App Intents analog: "third-party apps can register as data sources through the App Functions framework" (official ML Kit GenAI docs). Mirror the same v1 verbs (Start Chat, Ask AGI) as app functions for Gemini/Assistant surfaces, with identical trust-mode resolution. ML Kit GenAI features themselves run on-device and need no App Functions registration.

## Repository map

- `apps/mobile/__tests__/app-intents-deeplink.test.ts` — intent URL contract (✅ tested).
- `apps/mobile/app/_layout.tsx` — deep-link intake (Linking.parse path).
- `apps/mobile/src/features/widget-setup/` — widget/shortcut setup UI (🟡).
- `ios/agiworkforce/` — native project; App Intents extension target 🔭.
- `apps/mobile/services/remoteChatGate.ts` — Cloud gate applied to intent-triggered sends (✅).
- `apps/mobile/native/ios/` — native module home for the Swift intents bridge (pattern: AGIFoundationModels).

## Competitor notes

ChatGPT and Claude mobile both expose basic Siri Shortcuts entry points, and Apple's WWDC26 launch-partner list (Uber, WhatsApp, YouTube, etc.) shows schema adoption is the new baseline. AGI's divergence: intents are **trust-mode-aware** — neither competitor distinguishes an on-device-private invocation from a cloud one, while AGI labels and enforces it. On Android, wiring the same verbs through App Functions while ChatGPT/Claude remain iOS-Shortcuts-first is a parity edge.

## Acceptance / Definition of Done

Siri integration is done when: the v1 intents (Start Chat, Ask AGI, Continue Last Chat) work through real Siri invocation on an iOS 26 device; each resolves in the correct trust mode with a visible engine label; Local invocations make zero network calls (verified by network capture); the App Intents Testing framework suite passes in CI; and the 5.1.2(i) consent wording ships in the Cloud consent flow.

- [ ] Trust: Local intent → no network egress; Cloud intent → remoteChatGate + Clerk session enforced; no silent fallback between modes.
- [ ] Guidelines: only fulfillable intents registered; vocabulary is AGI-only; no interstitial marketing; third-party-AI consent language present.
- [ ] Build: Swift intents extension + deep-link contract tests + App Intents Testing framework all green; Jest contract test still locks the URL shape.

## Anti-patterns

- Routing a Local-mode Siri request to Cloud because "Siri needs a server answer" — the mode is the user's, not the invocation's.
- Donating Local conversation entities (titles or bodies) to Spotlight's semantic index.
- Registering intents the app cannot fulfill directly, or padding intent vocabulary with competitor names ("ChatGPT", "Claude") — an explicit guideline violation.
- Building on deprecated SiriKit instead of App Intents schemas.
- Claiming Siri/watch support in App Store copy before the extension ships (🔭 means not in marketing).
- Referencing Supabase, removed tiers (Plus/pro_plus/Hobby), or inventing INR prices in any intent-adjacent upsell.
