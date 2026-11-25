---
id: "F028-06"
type: "feature"
title: "App dependencies, network and secrets"
aliases: ["App dependencies, network and secrets", "Dependency installation panel", "Network permission controls", "Secret and config placeholders", "S28.17", "S28.20", "S28.21", "artifact content policy"]
area: "28 Code Canvas and application preview"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S28.17", "S28.20", "S28.21"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:local", "mode:cloud", "file:packages/contracts/types/src/artifact-csp.ts", "file:infrastructure/sandbox/index.html", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-authentication-and-identity", "F028-03"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F028-06 App dependencies, network and secrets

The brief asks for a panel of an app's packages, user control of network destinations, and secret or config placeholders. None exists as a user feature. Previews run under one fixed policy: no network calls from the artifact, and scripts only from a short list of pinned public hosts. Nothing is configurable by the person.

Area: [28. Code Canvas and application preview](README.md). Requirement items: [S28.17](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2817), [S28.20](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2820), [S28.21](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2821).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Today it only describes the fixed safety envelope around a preview: no network from the artifact and a pinned list of runtime scripts. As a feature the brief wants a package list, a network allow-list the user sees and edits, and placeholders for secrets.

**Why it exists.** Real apps call APIs and need keys. The brief (S28.17, S28.20, S28.21) asks for those controls without exposing secrets in the preview or the chat.

**Who uses it.** Developers building apps with the assistant; reviewers who must know what an app can reach.

**Problems it solves**

- Knowing what a generated app installs
- Limiting where an app can connect
- Giving an app a key without pasting it in code

**Use cases**

- See that an app needs a charting package (not built).
- Allow one API host for a preview (not built).
- Fill in an API key placeholder privately (not built).

## 2. User experience

**Where to find it**

- No control found on Web, Desktop, Mobile, Chrome, VS Code or CLI. The only related behaviour is invisible: the fixed content policy and, on web, the rule text 'Only React and ReactDOM are available' shown in an error.

**Before you start**

- Not applicable: no feature to reach.

**Screens and controls**

- None found.

**Journey**

1. Not applicable. A person who asks for an app that calls the network sees the call blocked; the preview may show a script error (F028-05).

**What the person sees and gets**

- React import error text: 'The preview cannot load "<name>". Only React and ReactDOM are available.' (infrastructure/sandbox/index.html:760-775).

**Settings**

- None found. The policy is a code constant (packages/contracts/types/src/artifact-csp.ts).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- One policy applies to every renderer: default-src none, scripts from self, inline, eval and four public script hosts, connect-src none, no child frames beyond the nested one, base-uri none, form-action none (packages/contracts/types/src/artifact-csp.ts:17-45; infrastructure/sandbox/index.html:54-57).
- React preview loads only pinned React, ReactDOM and a compiler with integrity hashes and refuses other imports (index.html:208-226, 760-775; apps/web/__tests__/security/sandbox-runtime-sri.test.ts).
- Mobile preview uses the same content policy constant (sandboxedArtifactHtml.ts:193-215).

**Incomplete**

- Published apps can ask the platform for AI and saved data through a brokered request channel, which is a different path from user-configured network access (apps/web/features/chat/components/artifacts/artifactRuntimeClient.ts; infrastructure/sandbox/index.html runtime shim line 255). That belongs to publishing features in this area, not read in depth here.

**Present but disconnected or switched off**

- In an unpublished preview the runtime channel answers 'AI and saved data are available once this app is published and opened by a signed-in viewer.' (SandboxedIframe.tsx:48-49).

**Not available**

- Dependency panel (S28.17), network permission controls (S28.20) and secret or config placeholders (S28.21) on every app. No component, store or route found.

## 4. Required behaviour

**Established requirements**

- A panel shows and manages the dependencies the app installs (S28.17). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.17)
- The user can see and control which network destinations an app may reach (S28.20). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.20)
- Apps can declare secrets or config values as placeholders the user fills in without exposing them (S28.21). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.21)
- Security behaviour fails closed; collect the minimum data; never commit a secret. (source: doc: AGENTS.md section 6)
- Local, own-key and Cloud are separate trust boundaries; nothing silently crosses them. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. A generated app's package list is shown in a panel with name and version.
2. The network list shows blocked by default and each allowed host the person added.
3. Adding a host asks first and names what the app can then reach.
4. A secret placeholder shows as masked, is never printed in the chat or in the preview source, and is not sent to the model.
5. An app that uses an unlisted host is blocked and the person is told which host.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Any allow-list change must pass through the same policy module for all surfaces, since three surfaces enforce it from one source [inferred from artifact-csp.ts header comment].
- Secrets must not enter the model context [inferred from AGENTS.md section 6].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Treat a network allow-list as an explicit consent step with a visible host list.
- [proposed] Store placeholder values in the account's secret store, never in artifact text.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | artifact-csp | `packages/contracts/types/src/artifact-csp.ts` | The only network and script policy for previews |
| component | Sandbox renderer | `infrastructure/sandbox/index.html` | Meta policy (54-57), pinned script list (208-226), React import guard (760-775) |
| config | Sandbox host headers | `infrastructure/sandbox/vercel.json` | Response headers for the renderer host |
| test | artifact-csp test | `packages/contracts/types/src/__tests__/artifact-csp.test.ts` | Keeps the renderer meta tag byte-identical to the module (per the header comment in index.html) |
| test | sandbox-runtime-sri.test | `apps/web/__tests__/security/sandbox-runtime-sri.test.ts` | Pinned versions and integrity hashes |
| service | sandboxedArtifactHtml | `apps/mobile/src/features/chat/components/sandboxedArtifactHtml.ts` | Applies the same policy in the mobile WebView |
| service | previewNavigationPolicy | `apps/mobile/src/features/chat/components/previewNavigationPolicy.ts` | Decides which navigations the mobile preview may start |
| service | react-preview-document | `packages/ui/unified-chat/src/lib/react-preview-document.ts` | Pinned scripts for React previews outside the renderer page |
| service | artifactRuntimeClient | `apps/web/features/chat/components/artifacts/artifactRuntimeClient.ts` | Brokered AI and storage requests from a published app (callArtifactRuntime) |
| endpoint | artifact runtime storage route | `apps/web/app/api/artifacts/runtime/[token]/storage/route.ts` | Saved data for a published app |
| endpoint | artifact runtime complete route | `apps/web/app/api/artifacts/runtime/[token]/complete/route.ts` | Brokered AI call for a published app |
| test | artifact-sandbox.test | `apps/web/lib/__tests__/artifact-sandbox.test.ts` | Runtime request parsing and limits |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The renderer page carries the fixed policy in its meta tag and response headers. | our servers | infrastructure/sandbox/index.html:54-57; infrastructure/sandbox/vercel.json |
| The browser enforces it: artifact network calls are refused; scripts load only from the listed hosts. | device | artifact-csp.ts:30-45 |
| React runtime scripts are fetched from a public script host and checked against pinned hashes. | outside service | index.html:208-226 |
| A published app's AI or storage requests travel by message to the parent, then to our routes. | our servers | SandboxedIframe.tsx:272-296; apps/web/app/api/artifacts/runtime/[token]/complete/route.ts |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Dependency lists, allowed hosts, secret values | Nowhere: not built | Not applicable | Not applicable |

**Models and providers.** No model chooses packages today. The brokered AI route for published apps uses managed routing on our servers (apps/web/lib/services/artifact-runtime-service.ts, not read in detail).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The brokered runtime needs a signed-in viewer of a published app (SandboxedIframe.tsx:48-49). The fixed policy needs none. |
| Permissions | none found in the code for user control; the policy is fixed. |
| Subscription | none found in the code for the fixed policy. Brokered AI usage rules were not read. |
| Limits and metering | Runtime request text up to 5,000,000 characters and key length 200 (apps/web/lib/artifact-sandbox.ts runtime parsers). Metering of brokered calls: unknown. |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable to the fixed policy. |
| Provider restrictions | Not applicable. |
| Local mode | The policy is the same on the device. Local mode previews cannot reach any network from the artifact; script hosts still need the network for React and Mermaid. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Artifact tries a network call | Blocked by policy; surfaces as a script error if unhandled. | artifact-csp.ts connect-src none; wdio spec artifact-sandbox-origin.spec.ts probes this (no result recorded) |
| React imports another package | Error 'Only React and ReactDOM are available.' | index.html:760-775 |
| Script host unreachable | Renderer reports 'The React runtime could not be loaded from <url>'. | index.html:710-716 |
| Unpublished app asks for AI or data | Request fails with the message about publishing first. | SandboxedIframe.tsx:48-49, 285-296 |
| Dependency, network or secret controls | not handled in the code; no UI exists. | searched apps and packages for allow-list, dependency and secret placeholder code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/types/src/__tests__/artifact-csp.test.ts`: Renderer meta tag matches the policy module (named in the header comment of infrastructure/sandbox/index.html; contents not opened)
- `apps/web/__tests__/security/sandbox-runtime-sri.test.ts`: Exact versions and integrity hashes for renderer scripts
- `apps/web/__tests__/security/iframe-sandbox-regression.test.ts`: Frame sandbox attributes do not regress
- `apps/desktop/wdio/specs/artifact-sandbox-origin.spec.ts`: Packaged Tauri app: a fetch from the artifact is blocked (spec exists; result not recorded)

**Test scenarios**

- **Network blocked**
  1. Preview an HTML artifact that calls fetch to an outside host
  - Expected: The call fails; no request leaves the frame.
- **Unlisted import**
  1. Preview a React artifact importing a chart package
  - Expected: Error says only React and ReactDOM are available.
- **Controls absent**
  1. Open an app artifact on every surface
  2. Look for dependencies, network or secrets controls
  - Expected: None exist, confirming the gap.
- **Hash tamper**
  1. Run the SRI test after changing a hash
  - Expected: Test fails.

**Where to look when it fails**

- Browser console CSP violation lines in the renderer frame.
- Renderer error text 'The React runtime could not be loaded from'.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No dependency panel** Affects: All apps. Evidence: No component found; S28.17. Work needed: Parse imports and show them; decide how to install.
- **No user-visible or user-editable network permissions** Affects: All apps. Evidence: artifact-csp.ts is a fixed constant; S28.20. Work needed: Add per-app allow-list with consent, policy built per app, and trust-boundary tests.
- **No secret or config placeholders** Affects: All apps. Evidence: No code found; S28.21. Work needed: Design a secret store path and masked input; keep values out of model context.
- **Known risks around frame navigation and WebRTC or DNS hints weaken the fixed policy** Affects: Web, Chrome. Evidence: audit/registers/known-flaws.md:57-58. Work needed: Close both before relying on the policy as a network control.
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:local
- mode:cloud
- file:packages/contracts/types/src/artifact-csp.ts
- file:infrastructure/sandbox/index.html
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-authentication-and-identity
- F028-03

## Unknown

- Whether artifact-csp.test.ts passes: only its name is known from a comment, not read.
- Metering and entitlement of brokered AI calls from published apps (artifact-runtime-service.ts not opened).
- How mobile loads the Mermaid runtime and whether it needs the network.
- The exact HTTP methods of the two runtime routes (inferred, not opened).
