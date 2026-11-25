---
id: "DOC-70-qa-defects-root-causes-voice-mic"
type: "root-cause"
title: "VOICE-MIC: voice mode with the microphone denied"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# VOICE-MIC: voice mode with the microphone denied

All paths are under `apps/web/` of origin/main (`~/.cache/agi-audit/worktrees/gap-read-main`). I read code and the server log only. I did not run the app. The state transitions below are read from code and the log, not observed.

## 1. What the person sees today / what they should see

Today:
- Free run (W-10), microphone denied, press the waveform button: the page stays on the plain welcome screen. No message, no Try again (screenshots 22-denied-voice, 23-denied-immediate, 25-denied-voice-2s). Dictation in the same state does say "Microphone permission denied..." with Try again (24-denied-dictation).
- Ultra run: red "The voice connection could not be established." with Try again, plus a toast "This conversation is unavailable. It may have been deleted." The tester got a different error name (see cause 3).
- Neither run says how to allow the microphone.

Should see:
- A voice screen that stays open and says, in plain words, "Microphone access was denied. Allow the microphone for this site in your browser settings, then try again." with a Try again button. This is the same standard dictation already meets.
- No toast about a conversation the person never asked to open.
- No new empty "New chat" entry flashing into the sidebar and disappearing.
- A distinct line for "another app is using the microphone" and for "no microphone found".
- The same behaviour on a paid plan and on Free (the path does not depend on plan).

## 2. Causes

1. Silent exit on Free (product defect, deterministic once the page re-rendered). Voice start creates a conversation and replaces the URL with /chat/<id> first (`features/chat/pages/WebChatPage.tsx:6695-6717`, `router.replace` at :6713). It asks for the microphone only afterwards (`features/chat/lib/live-voice-session.ts:480`). On failure the catch in `features/chat/hooks/use-voice-session.ts:695-698` calls `sink.onDiscardConversation` and sets `owner.conversationId = null`. It then calls `destinationIsCurrent(owner)` at :701 (defined :429-440). By then the sink's conversation id is the new id (`displayedConversationId = urlConversationId ?? bareChatSessionId`, WebChatPage.tsx:1727, passed at :6841) and the owner's is null, so the function returns false. The code rethrows at :701 and never reaches the `fail` dispatch at :713. The caller swallows the rejection (`() => undefined`, :837-841). The effect at :789 (`if (owner && !destinationIsCurrent(owner)) exitVoiceSession()`) then closes voice mode. The discard handler (WebChatPage.tsx:6727-6736) deletes the conversation and routes to /chat. The correctly built `microphone_denied` error (live-voice-session.ts:62, 292-294) is never shown. Where the catch runs before the re-render, both ids are null, the check passes and the error shows. That is what the Ultra run got. Real prompts take seconds, so the silent path is the normal one. Log: Free user, POST /api/chat/conversations 201 at line 37019 (14:30:04.350), DELETE 200 at 37161 (14:30:04.516), GET 404 at 37164, repeated at 37170-37315, 37487-37634, 37780-37929; no POST /api/voice/live/sessions in any of them.
2. Toast "This conversation is unavailable" (product defect). The same create-then-discard flow. After the DELETE, the route effect (WebChatPage.tsx:2355-2385) still sees /chat/<id>, finds nothing cached, calls `loadConversation`, gets 404 (mapped to the unavailable message via `lib/conversation-load-error.ts:3-4`) and shows the toast at :2380. Log: Ultra user, POST 24213, DELETE 24357 (14:14:21.196), GET 404 at 24360, 60 ms later. I did not open `useConversations` to re-check the 404 mapping beyond the diagnosis. Any later start failure after creation (for example POST /api/voice/live/sessions refused) takes the same path, so moving only the mic step is not enough.
3. Wrong wording for non-denial errors (product defect for real hardware errors; test-machine limit for the tester's case). `microphoneError` (live-voice-session.ts:290-303) maps only NotAllowedError and SecurityError to the denied message, and NotFoundError and OverconstrainedError to "No microphone is available". Everything else, including NotReadableError (mic in use by another app), AbortError and NotSupportedError, becomes "The voice connection could not be established." (code `microphone_failed`). The Ultra tester's denial came from headless Chromium's CDP setPermission, which returns NotSupportedError, so for that run the wording is a test limit. Also `microphone_failed` is not in `UNRECOVERABLE_START_CODES` (use-voice-session.ts:169-173), so a reconnect loop may retry it.
4. No guidance on how to allow the microphone (product gap). The denied text says "Allow the microphone to use voice mode" but not where. Dictation's text points at browser settings.
5. Fake microphone gave silence, dictation returned Mongolian and Arabic text (test-machine limit). Not part of VOICE-MIC. No change.
6. Repeated PUTs to deleted conversations (product defect, noise; log lines 37321, 37641, 37643, 37935-37939). Removed when no conversation is created and discarded for a mic failure, and I have not traced the sender for the later-failure case. Not person-visible.

## 3. Change

The smallest change that fixes the root cause: make the failure path decide "is the screen still mine" before it throws away the conversation, and stop the discard from provoking a 404 load. I do not recommend moving the mic request ahead of conversation creation: it needs a split of `LiveVoiceSession.start` and still leaves the discard path for session-create failures. Refactor reason: none needed.

### `features/chat/hooks/use-voice-session.ts`

a. Add a field to `VoiceAttempt` (:149) and to the literal at :552: `discardedConversationId: string | null` (initial null).

b. In the catch (:695-698), record instead of only nulling:

```ts
if (!owner.session && startedWithoutConversation && owner.conversationId) {
  owner.discardedConversationId = owner.conversationId;
  sink.onDiscardConversation?.(owner.conversationId);
  owner.conversationId = null;
}
```

c. In `destinationIsCurrent` (:429), accept the sink still pointing at the discarded id while the route returns to the root:

```ts
const sinkId = sink.conversationId;
const sameDestination =
  sinkId === owner.conversationId ||
  (owner.conversationId === null &&
    ((sinkId === null && owner.sink.conversationId === null && sink.surface === owner.sink.surface) ||
      (sinkId !== null && sinkId === owner.discardedConversationId)));
return Boolean(sink?.managed && owner.identity.isCurrent() && sameDestination);
```

Why: the `fail` dispatch at :713 now runs, and the :789 effect does not close voice mode while the route is still at the discarded id. When the route reaches /chat, the sink id is null and the first branch matches. The caller still keeps the error on screen with Try again. Try again starts a new attempt with no conversation, which creates one and asks for the microphone again.

d. Add `'microphone_failed'` handling only through the wording in `live-voice-session.ts` (below); leave `UNRECOVERABLE_START_CODES` and add `'microphone_in_use'` to it so a busy microphone is not auto-retried in a loop.

### `features/chat/pages/WebChatPage.tsx` (`handleVoiceDiscardConversation`, :6727-6736)

Route away before deleting, so nothing tries to load the doomed id:

```ts
(conversationId) => {
  setBareChatSessionId(null);
  setActiveConversation(null);
  router.replace(surfaceRootHref);
  void deleteConversation(conversationId);
},
```

Why: today the route returns only after the delete succeeds, and the route effect loads the deleted id in between (cause 2). The old code only reset the route when `deleted` was true. Keep that safety: if the delete fails, the conversation remains in history, which is harmless and recoverable, and the person is not left on a dead URL. Confirm in the person-style check that the voice screen survives the `setActiveConversation(null)` and URL change (it should, via change c); if it does not, keep the `keepVoiceSessionAcrossNavigation()` handoff (use-voice-session.ts:508) active across this replace, as the create path does at :6712.

### `features/chat/lib/live-voice-session.ts`

Messages (:61-74) and `microphoneError` (:290-303):

```ts
microphoneDenied:
  'Microphone access was denied. Allow the microphone for this site in your browser settings, then try again.',
microphoneInUse:
  'The microphone is being used by another app. Close it, then try again.',
```

```ts
if (name === 'NotReadableError' || name === 'AbortError') {
  return new LiveVoiceSessionError(LIVE_SESSION_MESSAGE.microphoneInUse, 'microphone_in_use');
}
```

Keep the generic fallback for unknown names. Product-name rule: no vendor or model names are added. `LIVE_SESSION_MESSAGE` is the one owner of this wording; check `live-voice-session.test.ts` and any other consumer of `microphoneDenied` (use `rg microphoneDenied`) for exact-string assertions and update them in the same change to the new wording, not weaken them.

### Shared surfaces

`use-voice-session.ts` and `live-voice-session.ts` are in `apps/web/features/chat`, not `packages/ui`, so desktop (Electron shows the hosted web app), Chrome and VS Code are unaffected by this edit. The mobile app has its own voice code; per the sweep rule, search it for the same create-then-discard-then-check pattern (`rg onDiscardConversation apps/mobile`) and report separately. I did not look.

## 4. Regression check

Add one pure-logic test, cheap and it holds the defect: in the existing hook test file (or a new `use-voice-session.destination.test.ts` next to the hook; check whether one exists first, none was found by name), export nothing new, test through the hook:
- A start with no conversation where the sink adopts the new id and `getUserMedia` rejects with NotAllowedError: the store reaches `failed` with the microphone-denied message and does not reach `exited`.
Add to `live-voice-session.test.ts`: NotReadableError yields code `microphone_in_use`, NotAllowedError yields `microphone_denied`. No money, sign-in or stored-data change beyond the deletion of an empty conversation the product itself created.

## 5. Person-style check (rebuilt local app, seeded Free and Ultra accounts)

For the denied microphone use a real Chrome profile with the site's microphone set to Block (chrome://settings/content/microphone), not headless CDP, so the browser returns NotAllowedError.
1. Sign in as the Free account, open /chat (welcome screen), click the waveform button, wait 3 s. Must see: voice screen with the "denied ... browser settings" text and Try again. Sidebar shows no stray "New chat". URL stays /chat. No toast.
2. Click Try again. Same message again, no duplicate conversations in the sidebar.
3. Repeat as the Ultra account. Same result, same wording.
4. Allow the microphone for the site, click Try again. Voice reaches Listening.
5. Mic in use (start another app or tab capturing the microphone with exclusive access, where the OS allows): see the "used by another app" text.
6. No microphone device (disable the input in system settings): see "No microphone is available in this browser."
7. Start voice from an existing chat with the microphone denied: error shown, the chat stays open, nothing deleted.
8. Start voice, grant the microphone, and make POST /api/voice/live/sessions fail (use the Free account after the allowance is spent): the usage message appears with an Upgrade path, no toast about an unavailable conversation, and the empty conversation is gone.
9. Reload during the error screen: back to a normal /chat.
Check the server log afterwards: POST conversation, then DELETE, and no 404 GET.

## 6. Compatibility and rollback

No API, schema or storage change. The new `discardedConversationId` field is in-memory. Reverting the three files restores the old behaviour with no data repair. The one behaviour change is the order of route replace and delete on discard; if a delete failure leaves an empty conversation in history, it is an ordinary chat the person can delete.

## 7. Owner

None.

## 8. Overlap

- web-lane worktree: no diff in `use-voice-session.ts`, `live-voice-session.ts` or `WebChatPage.tsx` (checked with `git diff HEAD --stat`). Its only voice edit is the server file `app/api/voice/live/sessions/lib/live-voice-context.ts`, which this change does not touch.
- Live checkout `~/Desktop/agiworkforce`: unpushed commit 52530d34f9 edits `features/chat/pages/WebChatPage.tsx` (9 lines, near the header title and conversation title menu, plus `ConversationTitleMenu.tsx`). My edit is a different region (`handleVoiceDiscardConversation`, about :6727). No edits to the two voice files there. Apply on top of that commit to avoid a textual conflict.
- Other VOICE-MIC-adjacent issues should not also rewrite the discard flow; one owner for it.
