---
id: "REQ-AREA-048"
type: "requirements"
title: "Requirement items: Voice conversation interface"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 48. Voice conversation interface

41 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S48.01

**Voice entry from an existing chat.** From an open existing chat, a control starts a voice conversation bound to that chat.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F048-01 Start or resume a voice conversation](../../20-features/048-voice-conversation-interface/F048-01-start-or-resume-a-voice-conversation.md)
- Competitor trace: CAP-voice-01

## S48.02

**Start a new voice conversation.** A control starts a brand-new voice conversation (a new chat is created for it).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F048-01 Start or resume a voice conversation](../../20-features/048-voice-conversation-interface/F048-01-start-or-resume-a-voice-conversation.md)
- Competitor trace: CAP-voice-01

## S48.03

**Integrated voice-and-text layout.** Voice runs inside the chat view: the transcript of spoken turns appears in the same message list as typed turns.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F048-02 Transcript, captions and full-screen layout](../../20-features/048-voice-conversation-interface/F048-02-transcript-captions-and-full-screen-layout.md)
- Competitor trace: CAP-voice-01, CAP-voice-02

## S48.04

**Separate full-screen voice layout.** A separate full-screen voice layout exists (voice fills the view, transcript hidden or secondary).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F048-02 Transcript, captions and full-screen layout](../../20-features/048-voice-conversation-interface/F048-02-transcript-captions-and-full-screen-layout.md)
- Competitor trace: CAP-voice-01

## S48.05

**Listening indicator.** While the assistant is listening, a visible (and announced) listening state is shown.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F048-03 Listening, speaking and working indicators](../../20-features/048-voice-conversation-interface/F048-03-listening-speaking-and-working-indicators.md)

## S48.06

**Speaking indicator.** While the assistant speaks, a visible speaking state is shown.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F048-03 Listening, speaking and working indicators](../../20-features/048-voice-conversation-interface/F048-03-listening-speaking-and-working-indicators.md)

## S48.07

**Thinking/working indicator.** While the assistant is working (thinking or running a tool), a thinking/working state is shown.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F048-03 Listening, speaking and working indicators](../../20-features/048-voice-conversation-interface/F048-03-listening-speaking-and-working-indicators.md)

## S48.08

**Waveform or amplitude visualization.** A waveform or amplitude visual follows the live microphone or reply audio level during voice.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F048-03 Listening, speaking and working indicators](../../20-features/048-voice-conversation-interface/F048-03-listening-speaking-and-working-indicators.md)

## S48.09

**Microphone mute.** The user can mute and unmute the microphone without ending the voice conversation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F048-04 Microphone and call controls](../../20-features/048-voice-conversation-interface/F048-04-microphone-and-call-controls.md)

## S48.10

**End conversation.** A control ends the voice conversation, closing the session (and settling its usage).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F048-04 Microphone and call controls](../../20-features/048-voice-conversation-interface/F048-04-microphone-and-call-controls.md)

## S48.11

**Pause/resume.** The user can pause the whole voice conversation (mic and assistant) and resume it later without ending it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F048-04 Microphone and call controls](../../20-features/048-voice-conversation-interface/F048-04-microphone-and-call-controls.md)

## S48.12

**Push-to-talk.** A push-to-talk mode records only while a key or button is held and sends on release.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile done, CLI done
- Feature: [F048-05 Push-to-talk and interrupting the reply](../../20-features/048-voice-conversation-interface/F048-05-push-to-talk-and-interrupting-the-reply.md)
- Competitor trace: CAP-voice-03, CAP-voice-20

## S48.13

**Hands-free mode.** A hands-free mode keeps listening across turns without a button press per turn.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing
- Feature: [F048-04 Microphone and call controls](../../20-features/048-voice-conversation-interface/F048-04-microphone-and-call-controls.md)
- Competitor trace: CAP-voice-03

## S48.14

**Interruption/barge-in.** Speaking while the assistant talks interrupts its spoken reply (barge-in).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web unverified, Desktop unverified, Mobile unverified
- Feature: [F048-05 Push-to-talk and interrupting the reply](../../20-features/048-voice-conversation-interface/F048-05-push-to-talk-and-interrupting-the-reply.md)
- Competitor trace: CAP-voice-04

## S48.15

**Voice picker.** The user picks the assistant voice, and the chosen voice is the one the conversation speaks with.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F048-06 Voice, language and voice preview](../../20-features/048-voice-conversation-interface/F048-06-voice-language-and-voice-preview.md)
- Competitor trace: CAP-voice-05

## S48.16

**Voice preview.** The user can hear a sample of a voice before choosing it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial
- Feature: [F048-06 Voice, language and voice preview](../../20-features/048-voice-conversation-interface/F048-06-voice-language-and-voice-preview.md)
- Competitor trace: CAP-voice-05

## S48.17

**Language selection.** The user can choose the spoken language of the voice conversation, and it is applied to recognition.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F048-06 Voice, language and voice preview](../../20-features/048-voice-conversation-interface/F048-06-voice-language-and-voice-preview.md)
- Competitor trace: CAP-voice-07

## S48.18

**Input-device selection.** The user can choose which microphone (input device) voice uses.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, CLI missing
- Feature: [F048-07 Audio devices (microphone and speaker)](../../20-features/048-voice-conversation-interface/F048-07-audio-devices-microphone-and-speaker.md)
- Competitor trace: CAP-voice-30

## S48.19

**Output-device selection.** The user can choose which speaker (output device) voice plays through.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F048-07 Audio devices (microphone and speaker)](../../20-features/048-voice-conversation-interface/F048-07-audio-devices-microphone-and-speaker.md)
- Competitor trace: CAP-voice-30

## S48.20

**Speaker/Bluetooth routing.** On devices with a speaker and Bluetooth, the user can route voice audio between speaker, earpiece/headset and Bluetooth.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F048-07 Audio devices (microphone and speaker)](../../20-features/048-voice-conversation-interface/F048-07-audio-devices-microphone-and-speaker.md)
- Competitor trace: CAP-voice-30

## S48.21

**Captions.** Live captions of both speakers can be shown during voice.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F048-02 Transcript, captions and full-screen layout](../../20-features/048-voice-conversation-interface/F048-02-transcript-captions-and-full-screen-layout.md)
- Competitor trace: CAP-voice-08

## S48.22

**Transcript display.** A transcript of the voice conversation is displayed and kept with the chat.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F048-02 Transcript, captions and full-screen layout](../../20-features/048-voice-conversation-interface/F048-02-transcript-captions-and-full-screen-layout.md)
- Competitor trace: CAP-voice-02, CAP-voice-08

## S48.23

**Transcript editing where appropriate.** Where appropriate, the user can correct a spoken turn's transcript before or after it is acted on.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F048-08 Typing alongside voice](../../20-features/048-voice-conversation-interface/F048-08-typing-alongside-voice.md)

## S48.24

**Type while speaking.** During a voice conversation the user can also type a message into the same conversation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F048-08 Typing alongside voice](../../20-features/048-voice-conversation-interface/F048-08-typing-alongside-voice.md)

## S48.25

**View images and maps during Voice.** Voice replies can put images or maps on screen during the conversation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing
- Feature: [F048-11 Camera, screen, images, picture-in-picture and background](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Competitor trace: CAP-voice-10

## S48.26

**View tool results during Voice.** Tool activity and results from a voice turn are viewable during the conversation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F048-09 Tool activity, approvals and documents during voice](../../20-features/048-voice-conversation-interface/F048-09-tool-activity-approvals-and-documents-during-voice.md)
- Competitor trace: CAP-voice-09

## S48.27

**Approve an action during Voice.** An action requested by voice that needs approval can be approved or denied without leaving voice.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F048-09 Tool activity, approvals and documents during voice](../../20-features/048-voice-conversation-interface/F048-09-tool-activity-approvals-and-documents-during-voice.md)
- Competitor trace: CAP-voice-09

## S48.28

**Open a generated document from Voice.** A document generated during voice can be opened from the voice view.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done
- Feature: [F048-09 Tool activity, approvals and documents during voice](../../20-features/048-voice-conversation-interface/F048-09-tool-activity-approvals-and-documents-during-voice.md)
- Competitor trace: CAP-voice-09

## S48.29

**Attach image during Voice.** The user can attach an image to the conversation while voice continues.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F048-11 Camera, screen, images, picture-in-picture and background](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Competitor trace: CAP-voice-10

## S48.30

**Camera sharing.** The user can share the camera with the assistant during voice.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F048-11 Camera, screen, images, picture-in-picture and background](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Competitor trace: CAP-voice-14

## S48.31

**Screen sharing.** The user can share their screen with the assistant during voice.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing
- Feature: [F048-11 Camera, screen, images, picture-in-picture and background](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Competitor trace: CAP-voice-14

## S48.32

**Camera switching.** While sharing the camera, the user can switch between front and back cameras.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing
- Feature: [F048-11 Camera, screen, images, picture-in-picture and background](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Competitor trace: CAP-voice-14

## S48.33

**Picture-in-picture.** Voice can continue in a picture-in-picture window while the user uses other screens or apps.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing
- Feature: [F048-11 Camera, screen, images, picture-in-picture and background](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Competitor trace: CAP-voice-14

## S48.34

**Background-conversation preference.** The user can choose whether voice keeps running in the background when they leave the app or tab.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing
- Feature: [F048-11 Camera, screen, images, picture-in-picture and background](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Competitor trace: CAP-voice-15

## S48.35

**Lock-screen controls.** Voice can be controlled (mute, end) from the device lock screen or system media controls.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing
- Feature: [F048-11 Camera, screen, images, picture-in-picture and background](../../20-features/048-voice-conversation-interface/F048-11-camera-screen-images-picture-in-picture-and-backgr.md)
- Competitor trace: CAP-voice-15

## S48.36

**Reconnection state.** When the voice connection drops, a reconnecting state is shown and the session reconnects (or says it could not).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F048-10 Reconnection and usage limit](../../20-features/048-voice-conversation-interface/F048-10-reconnection-and-usage-limit.md)
- Competitor trace: CAP-voice-16

## S48.37

**Usage-limit notice.** When voice usage is exhausted, the user sees a clear usage-limit notice in voice.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F048-10 Reconnection and usage limit](../../20-features/048-voice-conversation-interface/F048-10-reconnection-and-usage-limit.md)
- Competitor trace: CAP-voice-12, CAP-voice-16

## S48.38

**Continue unfinished work in text.** The user can leave voice and continue the same unfinished conversation by typing.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F048-08 Typing alongside voice](../../20-features/048-voice-conversation-interface/F048-08-typing-alongside-voice.md)
- Competitor trace: CAP-voice-02

## S48.39

**Resume a previous voice conversation.** The user can reopen a previous voice conversation and continue it by voice with its earlier turns as context.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done
- Feature: [F048-01 Start or resume a voice conversation](../../20-features/048-voice-conversation-interface/F048-01-start-or-resume-a-voice-conversation.md)
- Competitor trace: CAP-voice-02

## S48.40

**Remote coding-session voice control.** The user can steer a remote coding session (running on another device) by voice.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing
- Feature: [F048-12 Remote coding session voice control](../../20-features/048-voice-conversation-interface/F048-12-remote-coding-session-voice-control.md)
- Competitor trace: CAP-voice-13

## S48.41

**Separate spoken-response cancellation from task cancellation.** The user can stop the spoken reply without cancelling the underlying task, and cancel the task separately.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F048-05 Push-to-talk and interrupting the reply](../../20-features/048-voice-conversation-interface/F048-05-push-to-talk-and-interrupting-the-reply.md)
- Competitor trace: CAP-voice-04
