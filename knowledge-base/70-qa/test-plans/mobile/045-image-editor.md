---
id: "PLAN-mobile-045"
type: "test-plan"
title: "Mobile · 45. Image editor"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "45"
---
# Mobile · 45. Image editor

4 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S45.01 Upload an existing image.

- **Expected:** User uploads an image of their own and it becomes the source image that an edit changes.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:705; apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts (text found, layout changed); apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:312
- **Where to find it:** Add to chat (+ button at the left of the chat composer) > Photos > pick a photo; the photo then shows as an attachment in the composer, with Create image on in the same sheet (labels found in the code)
- **Needs:** a signed-in AGI Cloud account on a plan that includes image generation, and a photo in the phone library or simulator; the image-generation rows only appear in AGI Cloud mode
- **Steps:**
  1. Sign in and open a chat in AGI Cloud mode.
  2. Tap the + button labelled Add to chat next to the message box.
  3. Tap Create image in the sheet so the chat is in image mode.
  4. Tap Photos in the top row of the sheet and choose a photo from your library.
  5. Type a short prompt and tap send.
  6. Check the sent message shows your photo and that the reply is an image made from it, as Expected says.

## S45.03 Conversational edit instruction.

- **Expected:** User types a natural-language change for an image and the image itself is edited accordingly.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:705; apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts (text found, layout changed); apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:312
- **Where to find it:** Add to chat (+) > Create image, then type the change in the message box and send, with a photo attached through Photos (labels found in the code)
- **Needs:** a signed-in AGI Cloud account on a plan that includes image generation, and a photo to edit
- **Steps:**
  1. Open a chat in AGI Cloud mode and tap the + button labelled Add to chat.
  2. Tap Create image, then tap Photos and choose a photo.
  3. Close the sheet and type a change in the message box, for example a colour or object change.
  4. Tap send.
  5. Compare the returned image with the photo: the requested change should appear while the rest stays similar, as Expected says.

## S45.22 Reference-based composition.

- **Expected:** User supplies a reference image and the result is composed from it (subject, layout or style carried over).
- **Code:** done. Evidence present: apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:286; apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:318
- **Where to find it:** Add to chat (+) > Create image > Photos (add up to 4 photos; the hint reads Attach up to 4 photos. The first is edited; the rest guide it.), then type a prompt and send (labels found in the code)
- **Needs:** a signed-in AGI Cloud account on a plan that includes image generation, and two photos in the phone library or simulator
- **Steps:**
  1. Open a chat in AGI Cloud mode and tap the + button labelled Add to chat.
  2. Tap Create image, then tap Photos and choose a first photo; tap Photos again to add a second photo for reference.
  3. Read the hint Attach up to 4 photos. The first is edited; the rest guide it.
  4. Type a prompt that says what to keep from the second photo, such as its subject, layout or style, and tap send.
  5. Compare the result with the reference photo: subject, layout or style from the reference should carry over, as Expected says.

## S45.31 Preserve-original action.

- **Expected:** Editing keeps the original image available next to the result instead of overwriting it.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:705; apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:264; apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:312
- **Where to find it:** no screen of its own. The code attaches the source photo to the request message before generation (runImageGenerationTurn.ts lines 253-267) and returns a new reply; no visible label for this was found, and whether the bubble shows the original next to the result on screen was not checked.
- **Needs:** a signed-in AGI Cloud account on a plan that includes image generation, and a photo to edit
- **Steps:**
  1. Do the steps for S45.01 and send the edit request.
  2. Look at your request message in the chat: the photo you attached should still be shown there.
  3. Look at the reply: it should be a new image, and your original photo should not be replaced, as Expected says.
