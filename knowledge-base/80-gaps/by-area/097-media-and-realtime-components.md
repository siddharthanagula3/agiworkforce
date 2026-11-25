---
id: "GAPS-AREA-097"
type: "gap-list"
title: "Gaps: Media and realtime components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 97. Media and realtime components

8 open gaps that touch this area. Area page: [20-features/097-media-and-realtime-components](../../20-features/097-media-and-realtime-components/README.md).

## GAP-F097-99-01

**No server post-processing, transcoding, thumbnails or contact sheets**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F097-99](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)
- Detail: Affects: Web and API users of generated media; originals are served as is. Work needed: Add a media processing step after storage and catalogue renditions.
- Evidence: Brief S97.10 to S97.12 say missing; no code found

## GAP-F097-99-02

**No likeness or voice-consent store**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F097-99](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)
- Detail: Affects: Any future voice cloning or likeness feature. Work needed: Design consent records before such a feature ships.
- Evidence: Brief S97.15 says missing

## GAP-F097-99-03

**No hand-off from a voice request to a durable AGI Work task**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F097-99](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)
- Detail: Affects: Web and mobile live voice users. Work needed: Add a voice tool that creates a durable task and reports back.
- Evidence: Brief S97.25 says missing

## GAP-F097-99-04

**Barge-in behaviour unverified; no client code found that stops playback**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F097-99](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)
- Detail: Affects: Web and mobile live voice. Work needed: Test on real calls; add client handling if the provider does not do it.
- Evidence: apps/web/features/chat/lib/live-voice-session.ts:224; brief S97.23

## GAP-F097-99-05

**Camera frames toggle exists but no sender found and no caller passes the handler**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F097-99](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)
- Detail: Affects: Web live voice. Work needed: Wire frames to the session or remove the control.
- Evidence: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:156,524; apps/web/features/chat/pages/WebChatPage.tsx:7665

## GAP-F097-99-06

**Speech output is not marked as AI-generated and the compliance table says no audio route exists**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F097-99](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)
- Detail: Affects: Read-aloud users on web and mobile. Work needed: Mark audio and correct the table.
- Evidence: apps/web/lib/compliance/ai-act.ts:50-56; apps/web/app/api/voice/speech/route.ts:196

## GAP-F097-99-07

**Video generation present only on web and API; other apps absent**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F097-99](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)
- Detail: Affects: Desktop, mobile, CLI, VS Code, Chrome. Work needed: Decide per app and wire or declare unavailable.
- Evidence: docs/product/surface-feature-matrix.md:67

## GAP-F097-99-08

**Audio overview and music generation do not exist**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F097-99](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)
- Detail: Affects: All apps. Work needed: Product decision first; then adapters.
- Evidence: Brief S97.29, S97.30
