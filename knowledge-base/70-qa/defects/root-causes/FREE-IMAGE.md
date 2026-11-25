---
id: "DOC-70-qa-defects-root-causes-free-image"
type: "root-cause"
title: "FREE-IMAGE: Free plan, ask for an image (basic W-7, Free)"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# FREE-IMAGE: Free plan, ask for an image (basic W-7, Free)

Code read: origin/main 22649ece43 at ~/.cache/agi-audit/worktrees/gap-read-main (paths below are relative to it). Nothing was run, built or edited. Test run: baseline-20261124.json W-7 free f1; evidence folder `.../runs/W-7/browser/free/20261124T1946Z-f1` (screens 04s, 07s, 17s viewed).

## 1. What the person sees today / what they should see

Today (Free, (model name), dark theme, 1280 wide):
1. + menu, Create image: the row carries a "Retry" badge; clicking it shows "Free image availability could not be checked. Please retry." (04s). Retry never changes the outcome. No Upgrade, no waitlist.
2. Typed request with the tester's label ("w-7-f1: Generate an image ...") returned a card "How would you like the simple graphic delivered? SVG markup / Image prompt" (06s). Choosing SVG drew the picture inside a 256 px frame: the yellow square is cut in half (07s).
3. Edit follow-up in that chat: Enter and Send do nothing visible, text stays, no message (tester notes, steps 08-14). Cause found (C5): the page's Free image gate asked `/api/models/free-quota`, got "unknown" (C1), and refused with a toast; no chat or image request followed.
4. Fresh chat "Draw as SVG ... Reply with just the SVG": the turn ends "Response complete", only the user's message is visible, also after reload (17s).

They should see (the standard):
- Create image on Free: if Free has no image path today, the row says Upgrade and a click opens the upgrade view; never "Retry" unless a request actually failed. If the check really failed, one honest line and a Retry that refetches.
- A typed image request: a picture, or a plain "images are on paid plans" with Upgrade. Never a question about SVG as a stand-in.
- Any SVG the model writes is fully visible (scaled to fit, nothing cut), or, if it cannot be drawn, the person is told so in one line and sees the source.
- A send that is refused always says why. No silent Enter.
- It survives reload (the SVG is stored in the message text, so a fixed renderer fixes the reloaded chat too).

## 2. Causes

| # | Symptom | Cause | Kind |
|---|---|---|---|
| C1 | Create image ends in Retry | Both live Free image rows are "unavailable: not_integrated"; the contract maps any "unavailable" row to availability "unknown"; the UI turns "unknown" into "could not be checked. Retry". | Product defect (shipped config + code). Not a test-machine limit. |
| C2 | Clarify card about SVG | The tester prefixed the prompt with "w-7-f1:". The router only strips an UPPERCASE label, so "Generate an image" was no longer recognised as an image request and went to the chat model, which has no image tool on Free and improvised a question. | Test artefact for the card itself; the underlying "model improvises on Free" is a gap, see C2b |
| C2b | What a plain request does on Free | Unlabelled, it is caught by WebChatPage's natural-language image interception and sent to the image endpoint, which refuses with 403 `plan_upgrade_required` and the page has a paywall recovery. Not run; I did not see the screen. | Unverified; check in section 5 |
| C3 | SVG cut off | The gallery iframe is a fixed 256 px and the SVG keeps its own 400 px size; the `max-height:100%` rule does not resolve inside the auto-sized grid row. | Product defect (shared UI) |
| C4 | SVG answer blank, "complete" | Two silent paths in the shared renderer: (a) a raw un-fenced `<svg>` is never extracted and the markdown sanitizer drops it; (b) a fenced SVG whose strict-XML parse fails is removed from the text and the gallery then renders nothing. Which one happened is not provable: the answer text is not in any log. | Product defect (shared UI) |
| C5 | Edit follow-up does nothing | Not established. `submitMessage` has several bare `return`s with no notice (listed below). | Product defect (silent refusal), exact branch unknown |

Evidence.
- C1 chain: `apps/web/config/free-pools.json` inventory entries qwen-quota-252 (qwen-mt-image-2.0, ends 2026-11-26, in approvedOfferingKeys) and qwen-quota-273 (qwen-image-2.1-pro, ends 2027-01-01, NOT approved). All other image rows ended by 2026-11-03 and are filtered out as "expired" (`apps/web/lib/server/free-quota-catalogue.ts:330`). In `packages/contracts/types/src/models.json` (the qwen-quota table, line 21411 for 252) neither 252 nor 273 has `quotaProbeProtocol`. `decideFreeQuotaOffering` returns `unavailable('not_integrated')` when `!offering.quotaProbeProtocol` (`apps/web/lib/free-quota-authorization.ts:400-404`). That check runs BEFORE the shared-state check (`:416`).
- The skeptic's reading (blanked key-value store, `server.sh:28`, `server.log:68`, decides the answer) is therefore wrong for images: the store is read after the not_integrated exit. The skeptic is right that the key-value store is missing on this machine and that chat quota rows would be affected; it is not what produced "unknown" for images. The skeptic's "row 252 can be ready in production" is also wrong: it fails at not_integrated. So production Free users get the same "unknown" today, on any key-value setup.
- Route: `apps/web/app/api/models/free-quota/route.ts:93-97` sets `mediaAvailability.image = freeMediaAvailability(catalogue,'image')`. `packages/contracts/cloud-contracts/src/free-quota.ts:454-465`: no ready row and an "unavailable" row gives "unknown". The existing test `packages/contracts/cloud-contracts/src/__tests__/free-media-availability.test.ts` ("keeps missing and temporarily unavailable inventory unknown") shows the intent: "unknown" was meant for a TEMPORARY gap, but not_integrated is permanent.
- `apps/web/features/models/lib/free-media.ts:60-61` maps "unknown" to label unknown. `ChatComposerNew.tsx:2591-2594` shows the notice and refetches; `ComposerPlusMenu.tsx:339` shows the Retry badge. The fetch itself succeeded (server.log shows 200s for `/api/models/free-quota`, e.g. line 225), so "could not be checked" is false.
- After 2026-11-26 only 273 remains; it also stays not_integrated and unreviewed, so the result does not change.
- Paid plans: `freeMediaAccess` returns "included" first (`free-media.ts:57`). Not affected.
- C3: `packages/ui/unified-chat/src/components/markdown/SvgConceptGallery.tsx:11-18`: iframe `h-64`, document `display:grid;height:100%`, `svg{max-width:100%;max-height:100%}`. The screenshot (07s) matches: white SVG 344x218 of a 400x400 art, square at y 220 cut at the frame edge. The dark side bars are the hard-coded `#111318` in the same template (also seen in Light). Not run in a browser; this is the likely mechanism, confirm in section 5.
- C4 (empty string ruled out): in the new-chat turns the provider returned text, not an empty answer or a tool call: lines 15772 and 16155 show `response.output_text.delta` 94 times, `emitted.text: true`, `functionCall: false`, `responseStatus: completed`; lines 15773 and 16156 record 98 output tokens for both turns (request ids 95a7d3c5..., e6ddd14f...). So the text reached the browser and was lost in the renderer. Which of the two renderer paths below it was stays unproven; the fix covers both.
- C4: `svgGallery.ts:25-41` only extracts fenced blocks; `MarkdownContent.tsx:912-941` removes extracted fences from the text and then `SvgConceptGallery.tsx:7` returns null when sanitising gives nothing (`sanitize-svg.ts:134` returns '' on any XML parse error). Raw `<svg>` in the text goes through `rehypeRaw` + `rehypeSanitize` (`MarkdownContent.tsx:820-821`) and is not in the allowed schema.
- C5 evidence (server.log, user_3KuZ..., conversation 94893a10). After the SVG answer was saved (line 13614, 14:01:59) the log has no `/api/chat/conversations/.../messages`, no `/api/llm/v1/chat/completions` and no `/api/media` call for this user until the tester opened a new chat (line 15750, 14:05:11). The only requests in that stretch are GET `/api/models/free-quota` at lines 13819 (14:02:40), 14311 (14:03:11), 14319 (14:03:22) and, after the reload at 14:03:55, 14807 (14:04:08): one per Enter or Send click, and the one after reload shows it is not in-memory state. `resolveLimitedFreeMedia` always fetches (`features/chat/lib/free-media-choice.ts:19-25`, `cache: 'no-store'`), so each attempt leaves exactly one such line. The tester's screenshots 09s and 11s show no toast: the toast is mounted (`apps/web/app/Providers.tsx:26`, top-center), so the likely reason is timing (sonner closes it); not proven. Screens 08s/10s/12s show an enabled Send button and the draft intact, which matches `return false`.
- Silent exits that remain (latent, not the cause here): `ChatComposerNew.tsx:3589-3593` (`disabled`, `hasAttachmentConflict`, `promotionalToolConflict`, `searchAllowanceBlocksSend`, `localAttachmentConflict`, `localProjectConflict`), `attachmentPreparing` (defers by design), `if (isTurnActive) return` in the image/video branches (3718, 3814); `WebChatPage.tsx` `handleSend` returns false for a stale session (4382) and `handleGenerateImage` exits bare at 3296 (no session), 3299 (guard key set) and 3329 (no conversation id or authority gone). The last group is reached only on paid plans or by callers that skip the Free gate (`handleSubmitPrompt` 6092, `sendAnswerUiFollowUp` 4633, 6099, 6127, 6203, 6210, 6660, 6795, 6804).
- Provider/model limits: none of these symptoms is a provider limit. The SVG fallback exists only because Free has no image path.

## 3. Change

Order of value: C1 (it also cures C5 and C2b), then C4+C3, then the latent silent exits. Files in the "other agent / web-lane" lists are in section 8.

### 3.1 `packages/contracts/cloud-contracts/src/free-quota.ts` (C1, shared by web, desktop-in-web, mobile)
Why: "unknown" must mean "may heal, retry later"; a permanently unusable row means Free is not offered, so the answer is "not_offered" and the UI shows Upgrade. One owner of the rule.
```ts
export const FREE_QUOTA_RETRYABLE_UNAVAILABLE_REASONS = [
  'shared_state_unavailable',
  'attestation_missing',
  'attestation_stale',
] as const;

function mayHeal(reason: string | undefined): boolean {
  return reason === undefined ||
    (FREE_QUOTA_RETRYABLE_UNAVAILABLE_REASONS as readonly string[]).includes(reason);
}
// in freeMediaAvailability, replacing the unavailable line:
if (models.some((m) => m.status === 'unavailable' && mayHeal(m.unavailableReason))) return 'unknown';
return 'not_offered';
```
A row with no reason stays "unknown" (older server or fixture), so the existing test still passes unchanged; add cases below. Export from the package index.
Reasons left permanent on purpose (shown as Upgrade): `not_integrated`, `quota_only_not_observed`, `terms_review_missing`, `media_not_served`, `allowance_unknown`, `credential_missing`, `account_billing_signal`, `attestation_other_credential`, `attestation_excludes_offering`, `managed_route_shares_allowance`, `provider_refused`. `provider_refused` and `credential_missing` heal only through an operator step (an attestation lifts the hold, `apps/web/lib/free-quota-authorization.ts:181`; a key is added), not by the person retrying, so "try again" would be a lie. This also applies to video (the route sets both at `apps/web/app/api/models/free-quota/route.ts:103-104`); section 3.4 and 3.3a cover the video rows.

### 3.2 `apps/web/lib/free-quota-authorization.ts` (C1, type guard only)
Keep the reason type here and tie the list to it so a rename cannot drift:
```ts
FREE_QUOTA_RETRYABLE_UNAVAILABLE_REASONS satisfies readonly FreeQuotaUnavailableReason[];
```

### 3.3 `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (C1 copy, latent silent refusals)
a) Lines 2591-2594 and 3228-3233 (image) and 2666-2669 (video, same words): split the "unknown" case by cause. After 3.1 the remaining "unknown" is either a failed fetch or a temporary server gap. `use-promotional-media-models.ts` already refetches on `retry` (an attempt counter re-runs the effect with `cache: 'no-store'`, lines 62-85); the server log confirms Retry did call `/api/models/free-quota` (lines 11814, 11823, 12138), so the tester's note "Retry does not re-request" is wrong and the person-check needs no extra work for it.
```ts
if (imageAccess.label === 'unknown') {
  if (freeMediaOfferChecking) { setLocalNotice('Checking image availability…'); return; }
  if (promotionalMediaStatus === 'error') {
    setLocalNotice("Couldn't check Free image availability.");
    retryPromotionalMedia();
    return;
  }
  setLocalNotice('Free image creation is unavailable right now. Try again in a few minutes, or upgrade.');
  retryPromotionalMedia();
  return;
}
```
Take the strings from one `freeMediaUnknownNotice(kind, status, checking)` helper in `features/models/lib/free-media.ts` (owner of Free media wording) so the image row, the slash-command twin, the video twin and the page toast in 3.6 cannot disagree.
b) Make the existing bare refusals in `submitMessage` (3589-3593) visible, and nothing else. Review round 1 showed the first design (`if (sendDisabledReason) return`) would swallow the `trialExhausted` and `usageBlock` recoveries at 3598-3604 (they sit after these returns and `sendDisabledReason` answers for them first, 4801-4812) and would add blockers `submitMessage` does not have (`selectedMediaModelUnavailable`, `mediaAttachmentConflict`, `imageEditConflict`). So: keep the order and keep 3594-3604 untouched, and replace only the five bare returns with their own reason, reusing the strings the Send button already shows:
```ts
if (disabled) { setLocalNotice(SEND_REASON.unavailable); return; }
if (hasAttachmentConflict || localAttachmentConflict) { setLocalNotice(SEND_REASON.attachmentConflict); return; }
if (promotionalToolConflict) { setLocalNotice(SEND_REASON.promotionalToolConflict); return; }
if (searchAllowanceBlocksSend) {
  setLocalNotice(searchAllowance.status === 'checking' ? SEND_REASON.searchAllowanceChecking : SEND_REASON.searchAllowanceExhausted);
  return;
}
if (localProjectConflict) { setLocalNotice(LOCAL_MODEL_PROJECT_REFUSAL); return; }
```
These refuse in exactly the cases they refuse today; only the explanation is new. `attachmentPreparing` keeps deferring. This is hardening, not the fix for the tester's dead Enter (that was 3.6/C1).

### 3.4 `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` (C1)
`MediaGate` gets `offerFailed: boolean` (from `promotionalMediaStatus === 'error'`), passed at 800 and 839. Lines 321-322 and 339:
```ts
if (gate.access.label === 'unknown') {
  return { label: gate.offerChecking ? BADGE_CHECKING : gate.offerFailed ? BADGE_RETRY : BADGE_UNAVAILABLE, upgrade: false };
}
// title:
gate.offerFailed ? `Free ${gate.noun} availability could not be checked. Click to retry.`
                 : `Free ${gate.noun} creation is unavailable right now.`
```
After 3.1 a Free person normally sees the "Upgrade" badge (line 350-354 already exists). BADGE_UNAVAILABLE already exists (used at 344). The video row uses the same `MediaGate` (noun "video"), so it gets the same split and the Upgrade badge when `mediaAvailability.video` is "not_offered".

### 3.5 `packages/ui/unified-chat/src/components/markdown/SvgConceptGallery.tsx` and `svgGallery.ts` (C3, C4; shared by web, desktop, Chrome, VS Code)
Why here: one renderer owns SVG-in-chat; fixing it fixes all four apps and reloaded chats.
a) Fit, do not crop. Give the sanitised SVG a viewBox when it only has a plain numeric width/height, then let it fill the frame:
```ts
const PLAIN_LENGTH = /^\s*(\d+(?:\.\d+)?)(?:px)?\s*$/;
function fitToFrame(svg: string): { markup: string; scaled: boolean } {
  const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  if (!root.getAttribute('viewBox')) {
    const w = PLAIN_LENGTH.exec(root.getAttribute('width') ?? '')?.[1];
    const h = PLAIN_LENGTH.exec(root.getAttribute('height') ?? '')?.[1];
    if (!w || !h) return { markup: svg, scaled: false };
    root.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }
  root.removeAttribute('width'); root.removeAttribute('height');
  root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return { markup: new XMLSerializer().serializeToString(root), scaled: true };
}
```
Review round 1: `parseFloat` would read `width="50%"` or `"10cm"` as 50 or 10 and give a wrong viewBox, hence the strict pattern. An SVG with `width="100%"`, a unit other than px, or no size and no viewBox cannot be scaled without layout (the iframe is `sandbox=""`, no script, and measuring `getBBox()` in the host page would put sanitised but untrusted markup, including any `<style>`, into the host document). For those, `scaled` is false: the srcDoc keeps `svg{max-width:100%}` and uses `body{overflow:auto}`, so the drawing can be scrolled to instead of cut off.
```ts
const css = scaled
  ? `html,body{margin:0;height:100%;background:${frameBackground}}svg{display:block;width:100%;height:100%}`
  : `html,body{margin:0;min-height:100%;background:${frameBackground};overflow:auto}svg{display:block;max-width:100%}`;
```
Frame height: replace `h-64` with `aspect-[4/3] max-h-[28rem] w-full` so it is not a 256 px slot at any width.
Background (review round 1): the first design relied on a transparent iframe document letting the element's `bg-[var(--chat-code-bg)]` show through. That is fragile: the srcDoc has no `color-scheme`, and a browser paints an opaque canvas behind an iframe whose document colour scheme differs from the page's (CSS Color Adjust; confirm in the person-check), and the iframe cannot read the host's CSS variable. So resolve the colour in the host and pass it by value: the component keeps a ref on its wrapper (which has `bg-[var(--chat-code-bg)]`), reads `getComputedStyle(wrapper).backgroundColor` in a layout effect, and re-reads when the theme changes using `useDocumentTheme()` (`packages/ui/unified-chat/src/components/artifact-components/chartTheme.ts:27-46`, a MutationObserver on `class` and the theme attribute plus the dark media query). This removes the hard-coded `#111318` (the dark bars in Light). Whether `useDocumentTheme` also sees VS Code's and Chrome's themes is not verified; the person-check lists each surface, and the fallback is observing the same attributes on `document.body`.

b) Never vanish. `SvgConceptGallery` must keep a slide that fails sanitising:
```tsx
const parsed = slides.map((s) => ({ source: s, safe: sanitizeSvg(s) }));
if (parsed.every((p) => p.safe === '')) return (
  <figure className="my-4"><figcaption className="text-sm">This drawing could not be displayed. Its source is below.</figcaption>
  <pre className="overflow-x-auto"><code>{parsed[0].source}</code></pre></figure>);
```
(a mix of good and bad slides: show the good ones and drop the bad ones with the same one-line note.)
c) `svgGallery.ts`: also take a raw answer. After the fence pass, treat a blank-line-delimited block whose trimmed text starts with `<svg` and ends with `</svg>` as a slide and remove it from the markdown. Use the existing `findSvgElements` (it is already linear; the ReDoS test in `__tests__/svgGallery.redos.test.ts` must stay green and get a raw-block case).
Not changed: `sanitize-svg.ts` (security allow-list stays as is).

### 3.6 `apps/web/features/chat/pages/WebChatPage.tsx` and `features/chat/lib/free-media-choice.ts` (C5, C2b)
The cure for the tester's dead edit is 3.1: after it, `resolveLimitedFreeMedia` returns "not_offered" for Free and `handleComposerSend` takes the existing branch at 4604-4605 (`handleOpenUpgradeDialog()`, draft kept). What this file still needs:
a) The "unknown" answer must say which kind it is. Today `free-media-choice.ts` returns the same `UNKNOWN` for a failed fetch (:23, :36) and for a server answer of "unknown" (:30), and the toast at `WebChatPage.tsx:4597-4602` says "could not be checked" for both, which is false when the fetch worked. Add `cause: 'fetch_failed' | 'server_unavailable'` to the unknown member of `LimitedFreeMediaLookup`; the toast keeps its text for `fetch_failed` and says "Free image creation is unavailable right now. Your draft is unchanged; try again in a few minutes." for `server_unavailable`. Tests: `free-media-choice.test.ts` gets one case per cause.
b) A toast is transient and the tester saw none, so for the case a person will see most (Free, no image model) the Upgrade dialog is the answer, not the toast. Nothing else changes in this gate.
c) What "Edit that image..." does on Free with no image model: it opens the Upgrade view and keeps the draft, the same as a typed "Generate an image". It does not fall back to editing the SVG in chat. A Free person who wants the SVG changed says so ("Change the circle in that SVG to red"), which the router does not treat as an image request: in the logs, the SVG request and its edit in the new chat (lines 15775, 16158) produced no `free-quota` fetch, so they went to the chat model. Whether "Edit that image" after an SVG answer should instead stay a chat turn is an owner product call; section 7 lists it, and the default stands until then.
d) Latent silent exits (not the cause here; paid plans and callers that skip the gate reach them): `handleSend` returns false for a stale session (4382) with no notice, and `handleGenerateImage` exits bare at 3296, 3299 and, with a current authority and no conversation id, 3329. Add `toast.error` at each: 'Your sign-in could not be verified. Your draft is unchanged; please retry.' (same text as the toast in `handleComposerSend`), 'Another image is still being created in this chat.' and 'This chat could not be started. Try again.'. Not at the `!authority.isCurrent()` exits: the person left on purpose. Do not touch `voiceOwner` sends, which report through the voice flow.
e) C2b, the paywall path for callers that skip the gate (`handleSubmitPrompt` 6092, answer-UI follow-ups 4633, 6099 and the others listed in section 2): a Free person reaching `handleGenerateImage` with `IMAGE_MODELS[0]` gets the route's 403, `applyImageError` (:3060-3098) turns it into `metadata.paywall` and an empty content, and `ChatMessageList` swaps that row for the inline paywall card (`lib/mediaPaywallRecovery.ts:153-162`, `recoveryAction: 'upgrade'`). The user's prompt bubble stays, by design (persisted before the call). It is a card, not a toast. No change.

### 3.7 Not changed, and why
- `apps/web/config/free-pools.json` / models.json: not edited by hand (models.json is generated). Giving Free a real image model means integrating a quota image model with a probe protocol: owner decision (section 7).
- Server turn notice for a Free image request that reaches the chat model (attachments present, local models): not added now. Add one only if section 5 step 4 shows a plain request does not end in Upgrade; the code trace in 3.6 says it will. If needed: a `turnSystemNotices` line in `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` near 6371, when `classifyImageToolIntent(lastUserText) !== null`, `imageTools.length === 0` and the plan lacks `image_generation`: "Image creation is not in the person's plan. Say so in one sentence and that upgrading adds it. Do not ask what format to use."
- The "w-7-f1:" label problem (`packages/ai/routing/src/output-intent.ts:11`, uppercase-only `REQUEST_LABEL`): not changed; real people do not type labels. Testers should not prefix prompts on this check.
- No refactor needed for any item above; each is a local fix.

## 4. Regression check
- Cloud contracts (cheap, pure; Free plan gating counts as permissions): in `free-media-availability.test.ts` add: unavailable + `not_integrated` gives "not_offered"; unavailable + `shared_state_unavailable` gives "unknown"; unavailable with no reason still "unknown". Run with the package's vitest.
- `ComposerPlusMenu.test.tsx` / `ChatComposerNew.test.tsx`: existing tests that expect the Retry badge or the "could not be checked" notice for an "unknown" server answer must be updated to the new split (failed fetch keeps Retry; server answered keeps the new "unavailable right now" copy); add one: not_offered gives Upgrade badge and `onUpgradeRequest`. Do not delete them.
- `svgGallery.test.ts`: raw `<svg>` block becomes a slide; unterminated raw svg stays text. `SvgConceptGallery` test (jsdom): sanitising failure shows the one-line note and the source; fit adds a viewBox for `width="400" height="400"` and `"400px"`, and leaves `width="100%"`, `"10cm"` and no-size SVGs unscaled with scrolling allowed; the srcDoc carries the colour read from the wrapper, not `#111318`.
- `free-media-choice.test.ts`: an "unknown" answer carries `cause: 'server_unavailable'`, a failed fetch or timeout carries `'fetch_failed'`.
- `WebChatPage` (existing typed-image tests): Free plus a lookup of "not_offered" calls the upgrade dialog, returns false and sends nothing; Free plus "unknown" shows the matching toast per cause and returns false.
- `ChatComposerNew.test.tsx`: each of the five bare refusals in 3.3b sets its notice; a message with `trialExhausted` still calls `onUpgradeRequest` and one with `usageBlock` still calls `onRecover` (the regression the first design would have caused).
- Latent exits in 3.6d: one test each.

## 5. Person-style check (rebuilt local app, seeded Free account agi-dev-free+clerk_test@example.com, dark, 1280 and 390)
1. Sign in as Free, open /chat. Click + then "Create image". Expect: badge "Upgrade" (not Retry), click opens the upgrade view. Reload, repeat: same.
2. Type `/image a blue circle above a yellow square` and Enter. Expect the upgrade notice (existing 3234-3239 path).
3. Do the same with Premium: Create image still works, no regression.
4. Type, with no label, `Generate an image with a blue circle above a yellow square on a white background.` and Enter. Expect the Upgrade view, the text still in the composer, and no new message in the chat (the code path is `handleComposerSend`, 3.6). Watch the network panel: one GET `/api/models/free-quota`, no `/api/media` or chat request. If a question about SVG, a toast about "could not be checked", or a blank reply appears, stop and read the lookup answer in that GET before changing anything.
5. (Check the SVG on web at 1280 and 390 and on the desktop app's hosted web view; for Chrome and VS Code, open the built surface and switch to its light and dark themes and confirm the frame background follows.) Ask `Draw as SVG a blue circle above a yellow square on a white background. Reply with just the SVG.` Expect both shapes fully visible at 1280 and 390, Light and Dark, no dark bars in Light, still visible after reload. Then ask for the circle red: new drawing visible, square unchanged.
6. Make the model fail: ask for an SVG with an unescaped `&` in text. Expect the one-line "could not be displayed" note plus the source, not an empty reply.
7. Edit-follow-up check: in a chat that holds an SVG answer (ask `Draw as SVG ...` first), type `Edit that image so only the circle becomes red. Keep everything else exactly the same.` and press Enter, then reload and press Enter again. Expect the Upgrade view both times, the draft kept, and one GET `/api/models/free-quota` per press (the tester's log shows the same one-GET pattern with an "unknown" answer; after 3.1 the answer differs). Then type `Change the circle in that SVG to red.` and expect a normal chat reply with the new drawing visible.
7b. Dead-Enter guard: in the same chat, force a lookup failure (block `/api/models/free-quota`) and press Enter: expect the "Couldn't check" toast and the draft kept; unblock, press Enter again, expect Upgrade.
7c. Trial and usage recovery: with a Free account at its usage limit (or a seeded exhausted trial), press Enter: expect the upgrade or recover action as before, not a notice (guards the 3.3b regression).
8. Failure case: stop the server's `/api/models/free-quota` (or block it in devtools) and open +. Expect "Retry" badge and "Couldn't check Free image availability." Restore, click Retry, expect Upgrade.
9. Denied case: Free user clicks Upgrade; must reach the plans view with no purchase made (no subscription sales before 2027-01-01 per owner decision: confirm the existing upgrade view copy, not changed here).

## 6. Compatibility and rollback
- Contract change is additive; older mobile/web builds that call the same server get "not_offered" from the route's own `mediaAvailability`, which they already handle (`apps/mobile/src/features/image/imageCreationAvailability.ts:28`, `free-media-choice.ts:33-34`). Mobile Free benefits too.
- Reversal: revert the commit; no data, migration or config involved. Stored chats keep their SVG text, so the renderer change needs no backfill.
- Risk: a future integrated image row that is briefly unavailable for a retryable reason still shows "unknown"; other reasons show Upgrade. Medium-low.

## 7. Owner
Needs the owner only if Free should actually make images. Facts: today no Free image model is servable. qwen-quota-252 is a translate-text-in-images model without a probe protocol and ends 2026-11-26; qwen-quota-273 ends 2027-01-01, lacks a protocol and is not in the terms-review approved list; every other image row ended by 2026-11-03. `limitedMediaOffer` says 10 images per day for Free but there is nothing to serve them. Recommendation: ship this fix (Free sees Upgrade), and decide separately whether to source a Free image allowance. Owner-only items would be a provider credential or quota, and approving a new row in `termsReview.approvedOfferingKeys`. No owner action is required for the fix itself.
One product call is left at the default: after an SVG answer on Free, a typed "Edit that image ..." opens Upgrade instead of editing the SVG in chat (3.6c). The alternative is to skip the Free gate when the previous assistant turn is an SVG drawing; it needs a new heuristic, so it is not done unless the owner wants it.

## 8. Overlap
- web-lane worktree (uncommitted): only `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` (1 line at 3858, `organizationId`) among files in this plan, and only if the optional 3.7 notice is added (it would go near line 6371, far from it). `packages/contracts/cloud-contracts` has edits in account-security.ts, schedules.ts, slack.ts, not free-quota.ts. No other file here is touched.
- Other agent's checkout (`~/Desktop/agiworkforce`): uncommitted edits in `ChatComposerNew.tsx` at lines about 44, 68, 1001, 5513-5521, 5875, 6948 (13 added, 13 removed): my edits are at 1290-1302 (none), 2591, 3228, and the submitMessage refusals 3577-3600, so no textual overlap, but apply as small hunks. `WebChatPage.tsx` has one unpushed commit there (52530d34f9, service-configuration errors in chat): rebase 3.6 on it and keep it to the two notices. No changes there to free-quota.ts, ComposerPlusMenu.tsx, the three markdown files, use-promotional-media-models.ts, free-quota-catalogue.ts or route.ts.
- Checked again in review round 1: `~/Desktop/agiworkforce` has no uncommitted change to `WebChatPage.tsx`, `free-media-choice.ts`, `features/models/lib/free-media.ts`, `SvgConceptGallery.tsx` or `svgGallery.ts`; the only unpushed commit on any of them is 52530d34f9 on `WebChatPage.tsx`. The web-lane worktree has no diff in `apps/web/features/chat`, `apps/web/features/models` or `packages/ui/unified-chat`. The 3.6 hunks sit at 4382, 4597-4602 and 3296-3329; keep them small.
- Land 3.1-3.4 and 3.6a as one commit (they cure C1, C2b and C5 together), 3.5 as a second (shared UI, run the unified-chat tests), 3.3b and 3.6d (latent exits) as a third, so each can be reverted alone.

## 9. Review response

Round 1 blockers.

1. C5 left as a notice, and the design had not looked at the path that handles the text. Right that the first design was thin and that an in-memory ref was ruled out. Wrong about the branch. The text does not reach `handleSend` (4425-4452) or `handleGenerateImage` on Free: `handleComposerSend` (4537-4620) gates a typed image request first, and for a Free plan it calls `resolveLimitedFreeMedia` (4590). The log fits that and nothing else: one GET `/api/models/free-quota` per Enter or Send click for this user at lines 13819, 14311, 14319 and (after the reload) 14807, with no chat, media or message request between lines 13614 and 15750. The lookup answered "unknown" (C1), so the page showed `toast.error(... please retry)` and returned false (4597-4602), which keeps the text; that explains no request, text stays, and dead after reload. The root cause is C1, so 3.1 fixes the tester's case (Upgrade opens, 4604-4605), and 3.6a stops the toast from saying "could not be checked" when the check worked. Section 2 (C5) and 3.6 are rewritten; the bare returns at 3296, 3299 and 3329 are now listed as latent paid-plan or gate-bypass exits with notices in 3.6d. What "edit that image" does on Free is stated in 3.6c. One thing stays unproven: why the tester's screenshots show no toast (screens 09s to 11s); the request evidence does not depend on it.
2. 3.3b would swallow the usage and trial recoveries. Right. `sendDisabledReason` answers for `usageBlock` and `trialExhausted` first (4801-4812), and the bare returns at 3589-3593 come before the handlers at 3598-3604. 3.3b is rewritten to map only the five existing bare returns to their own reason and leave 3594-3604 and the order alone; the claim "does not change when a send is allowed" now holds, and 4 adds a regression test for it. It is demoted to hardening, since it was not the cause.
3. C2b unverified. Traced now, and the premise was off: a Free person does not reach the interception at 4439-4452. `handleComposerSend` intercepts first, so there is no 403, no orphan bubble and no `IMAGE_MODELS[0]` call; "not_offered" opens the Upgrade view and keeps the draft. For callers that skip the gate, the 403 is not a toast: `applyImageError` (3060-3098) stores `metadata.paywall` and the row becomes the inline paywall card (`mediaPaywallRecovery.ts:153-162`, upgrade). The user bubble stays by design. The better option the reviewer asks for (stop before spending a round trip) is what the gate already does after 3.1. Still not run in a browser; section 5 step 4 names what to watch.

Suggestions.
- C1 whitelist: the permanent reasons are now listed in 3.1, with `provider_refused` and `credential_missing` called intended (they heal by an operator step, not a retry); video is covered in 3.1, 3.3a and 3.4.
- Retry refetch: verified. `use-promotional-media-models.ts` bumps an attempt counter that re-runs a `no-store` fetch, and the log shows free-quota GETs at 13:59:31, 13:59:46 and 14:00:06 (lines 11814, 11823, 12138), so the tester's note is wrong. No change needed there.
- C4 empty string: ruled out with the log (94 text deltas, 98 output tokens, no tool call, for both new-chat turns); the loss is in the renderer, both paths covered by 3.5b and 3.5c.
- C3 fit: strict plain-number pattern, scroll fallback for unscalable SVGs, and the background is now resolved by value because a transparent iframe document is not reliable across colour schemes (3.5a). Per-surface theme behaviour on Chrome and VS Code is not verified; it is in the person-check.
- Gallery above the text (`MarkdownContent.tsx:936-939`): left as is; judge it in step 5. If an SVG with explanatory text looks wrong, the change is to render the gallery after the text when the text is non-empty.
