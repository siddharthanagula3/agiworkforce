---
id: "F047-10"
type: "feature"
title: "Likeness: avatar or cameo"
aliases: ["Reusable avatar or cameo (S47.21)", "Likeness consent controls (S47.22)", "Likeness reuse permissions (S47.23)", "Likeness revocation (S47.24)", "Likeness settings", "Create cameo", "Revoke"]
area: "47 Video editing and media continuity"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S47.21", "S47.22", "S47.23", "S47.24"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "plan:max_15x", "plan:enterprise", "SYS-security-and-privacy", "SYS-authorization-and-workspaces", "SYS-voice-and-media", "SYS-execution-boundaries", "SYS-data-model-and-migrations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F047-10 Likeness: avatar or cameo

Planned: a person makes a reusable avatar or cameo of themselves, gives explicit consent, sets who may reuse it, and can revoke it. None of this exists. The only related code is a moderation rule that refuses requests to impersonate real people, and a Local-free rule is not relevant. No consent or likeness storage exists.

Area: [47. Video editing and media continuity](README.md). Requirement items: [S47.21](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4721), [S47.22](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4722), [S47.23](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4723), [S47.24](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4724).

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

**What it does.** Planned: Likeness settings lets a person create a cameo from a recording or upload, read consent text and tick a box, choose who may reuse it, and revoke it. Revoke stops new use and says which past clips keep the old copy.

**Why it exists.** Briefs S47.21 to S47.24. The guidance says media safety must enforce consent (doc: docs/product/competitive-guidance.md:418 item 136). Putting a real person in video without consent is a safety and legal risk.

**Who uses it.** People who want to appear in generated video, and others who might be asked to allow reuse of their likeness.

**Problems it solves**

- Today a person has no consent-based way to appear in a video; reference pictures are checked only for known-bad content and by prompt text rules.
- Nobody can withdraw a likeness once used, because none is stored.

**Use cases**

- Record a short clip once and reuse it in many videos.
- Let a teammate use my cameo but not the public.
- Revoke my cameo after leaving a company.

## 2. User experience

**Where to find it**

- Web, Desktop, Mobile, Chrome extension: no Likeness settings, Create cameo, consent box or Revoke exists (brief S47.21-S47.24 missing; searched apps and packages for cameo, likeness, remix: only moderation and Library hits).
- CLI and VS Code: not applicable.

**Before you start**

- Planned: signed-in adult account. Adult-only rule exists: all surfaces are 18 and over with a server-held decision (project memory, not a code citation); exact code location unknown.
- Cloud mode; plan limits not defined.

**Screens and controls**

- Not built. Planned labels from the brief: Likeness settings, Create cameo, consent box, who may reuse it, Revoke [proposed].
- Related built control: reference or first-frame picture upload in the web composer for a video (apps/web/features/chat/components/Composer/video-input-images.ts:14-40).

**Journey**

1. Planned: open Likeness settings, choose Create cameo, record or upload.
2. Planned: read the consent text, tick the consent box.
3. Planned: set who may reuse it.
4. Planned: choose Revoke to stop use.
5. Today: a person can attach a reference picture to a video request; no consent step exists.

**What the person sees and gets**

- Planned: Revoke tells which past clips keep the old copy (brief).
- Today: a prompt that asks to impersonate a real person is refused with HTTP 422 and code content_policy_violation (apps/web/app/api/media/video/generate/route.ts:1137-1155).

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Text rule 'likeness.impersonation-request' blocks prompts like deepfake, face swap, voice clone or likeness of a real person unless an exemption word appears (consent, with permission, my own face, fictional, parody and others) (apps/web/lib/moderation/text-classifier.ts:161-165,268-273).
- Rule 'likeness.photoreal-depiction' covers photoreal depictions of real people with the same exemptions (apps/web/lib/moderation/text-classifier.ts:276-281).
- Managed video runs prompt moderation before billing (apps/web/app/api/media/video/generate/route.ts:1135-1160) and checks input pictures against a hash denylist and structure rules (apps/web/app/api/media/video/generate/route.ts:787-860).
- Output moderation lists 'likeness' as a category (apps/web/lib/moderation/output-moderation.ts:65-69).

**Incomplete**

- The exemption is by words in the prompt, such as 'consent' or 'myself'. A person can claim consent by typing the word; no consent is recorded [inferred from the regex at apps/web/lib/moderation/text-classifier.ts:164].

**Present but disconnected or switched off**

- none found.

**Not available**

- Cameo creation, consent text and box, reuse permissions per person or group, revoke, and the stored consent record: not available on web, desktop, mobile, Chrome. Searched apps, packages, crates and docs for cameo and likeness; no feature code. No table for it in the migration list (searched apps/web/db/neon file names).

## 4. Required behaviour

**Established requirements**

- User manages a reusable avatar or cameo of themselves. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S47.21)
- User gives explicit consent before their likeness can be used. (source: S47.22 (same brief))
- User sets who may reuse their likeness. (source: S47.23 (same brief))
- User revokes use of their likeness. (source: S47.24 (same brief))
- Media safety enforces content policy, consent, size limits and moderation. (source: doc: docs/product/competitive-guidance.md:418)
- Anything an agent removes from a user goes through a recoverable path; an action a user cannot undo asks first and names the consequence. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. No likeness is used in a video before explicit consent is stored.
2. Reuse permission is set per person or group by the owner only.
3. Revoke stops new use immediately and lists past clips that keep the old copy.
4. An unclear or refused consent leaves the likeness unused.
5. Revoke asks first and names its consequence.
6. Another account cannot read or use a cameo it was not given.
7. The consent record shows who, when and which text version.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Revoke cannot unmake a clip already made; the brief says the screen must say so.
- Cameos are sensitive biometric-like data, so storage needs the security rules of section 6 of AGENTS.md [inferred].
- Local-only cameos would stay on the device and need no server record [inferred]. unknown whether wanted.

**Proposed improvements** (suggestions, not requirements)

- Store consent as an append-only record with the consent text version.
- Check the cameo permission in the video generate route before any provider call.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | text moderation classifier | `apps/web/lib/moderation/text-classifier.ts` | Likeness rules and exemptions on prompts |
| service | output moderation | `apps/web/lib/moderation/output-moderation.ts` | Likeness category for model output checks |
| endpoint | POST /api/media/video/generate | `apps/web/app/api/media/video/generate/route.ts` | Runs prompt moderation and input picture checks before billing |
| service | hash denylist | `apps/web/lib/moderation/hash-denylist.ts` | Blocks known bad input pictures |
| service | image structure checks | `apps/web/lib/moderation/image-structure.ts` | Structural checks on input pictures |
| service | moderation reporting | `apps/web/lib/moderation/reporting.ts` | Reporting of blocked content |
| component | video input images | `apps/web/features/chat/components/Composer/video-input-images.ts` | Web: first frame or reference pictures for a video |
| endpoint | POST /api/mobile/content-report | `apps/web/app/api/mobile/content-report/route.ts` | Lets a person report generated media |
| endpoint | copyright report | `apps/web/app/copyright/report/CopyrightNoticeForm.tsx` | Notice form for copyright, mentions likeness text |
| test | published safety claims test | `apps/web/app/__tests__/published-safety-claims.test.ts` | Checks published safety categories include likeness |
| test | text-classifier tests | `apps/web/lib/moderation/__tests__/text-classifier.test.ts` | Covers likeness rules |
| service | managed image generation guard | `apps/web/app/api/media/image/lib/managed-image-generation.ts` | Image route applies the likeness category |
| config | AI-generated provenance | `apps/web/lib/compliance/ai-act.ts` | Marks generated video with provenance headers |
| config | BILLING_PLAN_CAPABILITY_TIERS | `packages/contracts/types/src/billing-catalog.ts` | Plans for video generation |
| service | mediaGenerationConsent (mobile) | `apps/mobile/src/features/chat/actions/mediaGenerationConsent.ts` | Consent to send media to Cloud; not likeness consent |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person sends a video request with a prompt and optional pictures. | device and our servers | apps/web/features/chat/components/Composer/video-input-images.ts:14-40 |
| Server moderates the prompt for likeness and other categories; blocked requests get 422 before billing. | our servers | apps/web/app/api/media/video/generate/route.ts:1135-1160 |
| Input pictures are checked against a hash denylist and structure rules. | our servers | apps/web/app/api/media/video/generate/route.ts:787-860 |
| Allowed requests go to a video provider, which sees the pictures. | outside service | apps/web/app/api/media/video/generate/route.ts:600-615 |
| Cameo, consent record, permission check and revoke: no step exists. | our servers | Not built (briefs S47.21-S47.24) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Reference or first-frame pictures | Sent with the request; whether kept by the job: unknown | unknown | unknown |
| Cameo, consent record, reuse grants | Not implemented | not applicable | not applicable |

**Models and providers.** The video provider receives the pictures; a model-based likeness check is part of output moderation (apps/web/lib/moderation/output-moderation.ts:65-69). A cameo would send a person's image to an outside provider, so it crosses a trust boundary and needs consent first (doc: AGENTS.md section 6) [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account for video routes (apps/web/app/api/media/video/status/route.ts:56). |
| Permissions | Owner-only grant model is planned; none found in the code. |
| Subscription | Video generation needs plan max_15x or enterprise (packages/contracts/types/src/billing-catalog.ts:357). Plan limits for cameos: not defined in the code yet (brief). |
| Limits and metering | none found in the code for cameos. |
| Feature flags | none found in the code. |
| Model compatibility | Which video models accept reference pictures depends on admission and provider (apps/web/features/chat/components/Composer/video-input-images.ts:21-27). |
| Provider restrictions | Reference input limits are set per provider (apps/web/app/api/media/video/generate/route.ts:793). |
| Local mode | No local video generation found. A local cameo would never leave the device; nothing built. Local sign-in vs payment: unknown for this feature. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Prompt asks to impersonate a person | 422 content_policy_violation with a refusal text | apps/web/app/api/media/video/generate/route.ts:1142-1155 |
| Input picture matches the denylist | Request refused with an invalid_input_image style error | apps/web/app/api/media/video/generate/route.ts:816,831,851 |
| Consent unclear or refused | not handled in the code (no consent flow) | none |
| Revoke with past clips | not handled in the code | none |
| Offline, retry, cancel of cameo creation | not handled in the code | none |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/moderation/__tests__/text-classifier.test.ts`: Text rules including likeness
- `apps/web/lib/moderation/__tests__/output-moderation.test.ts`: Output moderation categories
- `apps/web/app/__tests__/published-safety-claims.test.ts`: Published safety categories list includes likeness
- `apps/web/__tests__/api/media-video-generate.test.ts`: Video generation route including refusals

**Test scenarios**

- **Impersonation prompt refused**
  1. Ask for a video that uses a named public figure's face as a deepfake
  2. Read the response
  - Expected: 422 content_policy_violation, no charge
- **Exempt wording passes the text rule**
  1. Ask for a video of myself as a cartoon
  - Expected: Not blocked by the likeness rule (shows consent is not recorded)
- **No cameo control**
  1. Search each app's settings for Likeness
  - Expected: No such section
- **Consent gate (after built)**
  1. Create a cameo without ticking consent
  2. Try to use it in a video
  - Expected: Refused; likeness unused
- **Revoke (after built)**
  1. Revoke a cameo
  2. Start a new video using it
  3. Open the revoke summary
  - Expected: New use blocked; past clips listed as keeping the old copy

**Where to look when it fails**

- Metric or log from recordMediaSafety with decision 'blocked' and reason 'prompt_moderation' (apps/web/app/api/media/video/generate/route.ts:1144).
- Moderation rule ids 'likeness.*' in refusals.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No cameo, consent, reuse permission or revoke** Affects: All users on web, desktop, mobile, Chrome. Evidence: Briefs S47.21-S47.24 missing; no code. Work needed: Design consent text and legal review, storage with row security, permission check in generation, revoke flow and screens
- **Consent is claimed by a word in the prompt** Affects: Safety of real people. Evidence: apps/web/lib/moderation/text-classifier.ts:164. Work needed: Replace with stored consent for any real-person likeness
- **Legal and policy text must be written by Opus only (repo rule)** Affects: Consent text. Evidence: doc: CLAUDE.md Delegation section. Work needed: Route consent copy accordingly
- **Plan limits undefined** Affects: Subscription design. Evidence: Task brief; no entry in billing-catalog.ts. Work needed: Owner decides
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- plan:max_15x
- plan:enterprise
- SYS-security-and-privacy
- SYS-authorization-and-workspaces
- SYS-voice-and-media
- SYS-execution-boundaries
- SYS-data-model-and-migrations

## Unknown

- Where an adult-only age decision is enforced in code for this feature.
- Whether input pictures are kept after a job.
- Whether Local mode would ever hold cameos.
- Plan limits and who counts as 'person or group' for reuse.
- Required consent text (owner and legal).
