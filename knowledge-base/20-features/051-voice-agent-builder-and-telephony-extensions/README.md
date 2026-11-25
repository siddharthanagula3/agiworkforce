---
id: "AREA-051"
type: "area"
title: "Voice-agent builder and telephony extensions"
features: ["F051-01", "F051-02", "F051-03", "F051-04", "F051-05", "F051-06", "F051-07", "F051-08", "F051-09", "F051-10", "F051-11"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 51. Voice-agent builder and telephony extensions

This area is meant to let a person build a voice bot that holds phone calls or talks on a website, for example to answer questions, book, or hand a caller to a human. The owner would give it a name, a role, instructions, a voice and knowledge sources, then attach it to a phone number or a web widget. Calls would leave transcripts, outcome labels, and metered minutes for billing. The code does not do this yet. All 25 items are marked missing on web, desktop and mobile, and the API is missing where the brief lists it. Nothing in the repository creates a voice agent, a phone number, a SIP connection, a call or a call record. The nearest existing feature is live voice conversation in chat, which is a different feature.

**Who uses it.** Today: nobody, because no screen or route exists. The brief describes the intended users as the owner of a voice agent and the owner of a phone number. The brief does not say which plans may use it. Workspace admins and developers are not named in the brief or the code for this area.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F051-01](F051-01-create-and-configure-a-voice-agent.md) | Create and configure a voice agent | no | no | no | n/a | n/a | n/a |
| [F051-02](F051-02-knowledge-sources-and-tools-for-a-voice-agent.md) | Knowledge sources and tools for a voice agent | no | no | no | n/a | n/a | n/a |
| [F051-03](F051-03-guardrails-business-hours-and-fallback.md) | Guardrails, business hours and fallback | no | no | no | n/a | n/a | n/a |
| [F051-04](F051-04-transfer-a-live-call-to-a-human.md) | Transfer a live call to a human | no | no | no | n/a | n/a | n/a |
| [F051-05](F051-05-test-a-draft-voice-agent.md) | Test a draft voice agent | no | no | no | n/a | n/a | n/a |
| [F051-06](F051-06-embed-a-voice-agent-on-a-website.md) | Embed a voice agent on a website | no | no | no | n/a | n/a | n/a |
| [F051-07](F051-07-phone-numbers-and-call-routing.md) | Phone numbers and call routing | no | no | no | n/a | n/a | n/a |
| [F051-08](F051-08-outbound-calls.md) | Outbound calls | no | no | no | n/a | n/a | n/a |
| [F051-09](F051-09-call-records-transcripts-recordings-and-outcomes.md) | Call records: transcripts, recordings and outcomes | no | no | no | n/a | n/a | n/a |
| [F051-10](F051-10-latency-failure-and-usage-dashboards.md) | Latency, failure and usage dashboards | no | no | no | n/a | n/a | n/a |
| [F051-11](F051-11-versions-publish-and-rollback.md) | Versions, publish and rollback | no | no | no | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md](../../10-requirements/capabilities/051-voice-agent-builder-and-telephony-extensions.md).

## How this area works in the code

1. **Where a person would start today.** The chat composer has a voice mode. Its surface imports the voice session hook. This is live conversation with the model in chat, not a voice agent builder. Nothing in this path creates an agent, number or call record. (`apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:18`, `apps/web/features/chat/hooks/use-voice-session.ts`)
2. **Start a live voice session (existing, chat only).** The web API has one POST handler that creates a live voice session for a chat. It is the only server route for voice sessions. It is not used for agents or calls. (`apps/web/app/api/voice/live/sessions/route.ts:731`)
3. **Store and clamp session settings (existing, chat only).** The session store creates sessions, updates their settings and clamps the speaking pace to a range. Settings here are for a chat voice session, such as voice, language and pace. (`apps/web/app/api/voice/live/sessions/lib/voice-session-store.ts:87`, `apps/web/app/api/voice/live/sessions/lib/voice-session-store.ts:115`, `apps/web/app/api/voice/live/sessions/lib/voice-session-store.ts:173`)
4. **Meter and budget voice seconds (existing, chat only).** Voice time is counted in seconds for a session. A budget file and a settlement file sit beside the store. The budget file was not opened, so its rules are unknown. (`apps/web/app/api/voice/live/sessions/lib/voice-session-store.ts:282`, `apps/web/app/api/voice/live/sessions/lib/voice-session-budget.ts`, `apps/web/app/api/voice/live/sessions/lib/voice-session-settlement.ts`)
5. **Plan gate for voice (existing, chat only).** The voice marketing page reads a plan policy field named allowVoice and a free monthly voice minutes value. The brief's billing items for call minutes are not connected to this meter. (`apps/web/app/features/voice/page.tsx:24`, `apps/web/app/features/voice/page.tsx:31`)
6. **Desktop and CLI voice (existing, dictation only).** The desktop calls a transcription command and the CLI runs a dictation loop. Neither has agents, calls or numbers. (`apps/desktop/src/api/voice.ts:55`, `apps/cli/src/voice.rs:57`)
7. **What is recorded as missing.** The audit ledger marks every item of this area as missing on web, desktop and mobile, and n/a on the CLI. The generated worklist lists the same items as open work for wave 4. Product code search for voice agents, phone numbers, SIP, calls and transfers found no matches outside audit and research files. (`audit/ledger/ecosystem-capability-ledger.jsonl:1661`, `audit/missing/051-voice-agent-builder-and-telephony-extensions.md:9`)

## Files to know

| File | Role |
|---|---|
| `~/Desktop/agiworkforce-QA/tools/area-briefs/051-voice-agent-builder-and-telephony-extensions.md` (not found) | The brief for this area: the 25 items, their Should lines and status per app. |
| `~/Desktop/agiworkforce/audit/missing/051-voice-agent-builder-and-telephony-extensions.md` (not found) | Generated list of open work for this area; says the features do not exist yet. |
| `~/Desktop/agiworkforce/audit/ledger/ecosystem-capability-ledger.jsonl` (not found) | Per-app status cells for each item (S51.01 starts at line 1661); the CLI cells are n/a. |
| `~/Desktop/agiworkforce/apps/web/features/chat/components/Voice/VoiceModeSurface.tsx` (not found) | The nearest existing UI: live voice conversation in chat. Not a builder. |
| `~/Desktop/agiworkforce/apps/web/features/chat/hooks/use-voice-session.ts` (not found) | Client hook for a chat voice session. |
| `~/Desktop/agiworkforce/apps/web/app/api/voice/live/sessions/route.ts` (not found) | Server POST route that creates a chat voice session (line 731). |
| `~/Desktop/agiworkforce/apps/web/app/api/voice/live/sessions/lib/voice-session-store.ts` (not found) | Creates, updates and closes chat voice sessions and counts their seconds (lines 115, 173, 282). |
| `~/Desktop/agiworkforce/apps/web/app/features/voice/page.tsx` (not found) | Voice marketing page; reads the allowVoice plan policy and the free voice minutes (lines 24, 31). |
| `~/Desktop/agiworkforce/apps/desktop/src/api/voice.ts` (not found) | Desktop bindings for dictation and transcription (no agents or calls). |
| `~/Desktop/agiworkforce/apps/cli/src/voice.rs` (not found) | CLI interactive voice loop (dictation only; line 57). |

## What is stored

- Chat voice session rows (create, settings, close, seconds used). The table name was not opened.: Database, through apps/web/app/api/voice/live/sessions/lib/voice-session-store.ts (createVoiceSession at line 115).
- Voice agents, phone numbers, SIP connections, routing rules, call transcripts, recordings, outcomes, agent versions, knowledge sources, tools and widgets.: Nowhere. No store exists for any of these in the code searched.

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **allowVoice (plan policy field)**: Decides whether a plan includes voice. It gates the chat voice feature, not a voice agent builder. No gate for voice agents was found. (apps/web/app/features/voice/page.tsx:24)
- **Free voice minutes per month (voiceMinutesPerMonth)**: Sets the monthly free voice allowance for the free plan, for chat voice only. (apps/web/app/features/voice/page.tsx:31)
- **Voice feature flags for agents or telephony**: None found. No flag or setting for voice agents, numbers, SIP or outbound calls was found in product code. (Searched across apps/web, apps/desktop, apps/mobile, apps/cli, packages (no hits).)

## Shared between apps

Nothing is shared for this area yet. The chat voice path uses the shared chat voice UI package (VoiceModeSurface.tsx imports VoiceSessionStatus from @agiworkforce/unified-chat at line 21). That package is for chat only and is shared by desktop, web, Chrome and VS Code. Desktop and CLI each have their own dictation code. Mobile has its own voice code, which was not opened for this guide. A future voice agent builder would need a new owner in the shared contracts; none exists.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The brief gives no API status for S51.01, S51.10 and S51.20, but its other items list an API status. The brief is incomplete for these three items. (~/Desktop/agiworkforce-QA/tools/area-briefs/051-voice-agent-builder-and-telephony-extensions.md:5-42)
- The voice marketing page describes voice as spoken conversation and dictation only. It does not describe voice agents, so it is consistent with the code, but a reader may look for agents there. (apps/web/app/features/voice/page.tsx:34)
- The chat voice session store is a live session for chat, and its name does not say so. A reader might assume it is the base for agents. It is not, and nothing in it refers to an agent, number or call. (apps/web/app/api/voice/live/sessions/lib/voice-session-store.ts:115)

## Not established

- The database table name, and the columns, for chat voice sessions. The store was read only at the function names and line numbers listed.
- The content of voice-session-budget.ts and voice-session-settlement.ts. They were not opened.
- The mobile voice code. Mobile was checked only by the ledger and the brief, not by reading its files.
- Whether any design or plan exists under docs/specs or docs/product for voice agents. Not searched in depth; the audit files are the only sources found.
- Any provider or telephony service the owner may choose. The brief and code name none; this guide does not name one.
- Plan limits, consent rules and retention periods for calls. Not in the brief and not in the code.
- Testing: nothing was run. This was a read-only review, and there is no running feature to test on localhost in this area yet.
- Whether the 51 items are scheduled for wave 4 only. The generated worklist says wave 4; the timing is not otherwise confirmed.
