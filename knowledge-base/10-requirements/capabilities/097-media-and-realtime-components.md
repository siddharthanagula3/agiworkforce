---
id: "REQ-AREA-097"
type: "requirements"
title: "Requirement items: Media and realtime components"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 97. Media and realtime components

30 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S97.01

**Image-generation adapter.** A server adapter turns an image prompt into generated images through a real provider and hands them to the media job.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.02

**Image-editing adapter.** A server adapter edits a source image (with an optional mask) through a provider edit endpoint.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.03

**Reference-asset manager.** Reference assets (library images) are stored, listed and resolved as inputs that guide new generations.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.04

**Mask-processing service.** Masks for inpaint/outpaint are validated and normalised (size, alpha) before they reach the provider.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.05

**Media-job queue.** Image and video generations run as durable queued jobs that a background worker drives to completion.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.06

**Provider-job reconciliation.** Provider-side jobs are polled and reconciled until terminal, with results persisted and failures settled.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.07

**Polling/webhook completion handler.** Job completion is picked up by provider webhooks and by status polling.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.08

**Generated-asset downloader.** Finished provider outputs are downloaded (bounded, typed) and staged for storage.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.09

**Media object storage.** Generated media bytes are written to private object storage and catalogued per user.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.10

**Image postprocessing.** Generated images are post-processed on the server (resize, format/compression, upscale, background removal).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.11

**Video transcoding.** Videos are transcoded server-side into standard formats/renditions.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.12

**Thumbnail/contact-sheet generation.** Thumbnails or contact sheets are generated for images and videos.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.13

**Subtitle/transcript generation.** Media gets a generated transcript or timed subtitles (SRT/VTT).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.14

**Provenance metadata service.** Generated media carries provenance metadata (AI-generated, provider, model, time, hash) stored with the asset and served with it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.15

**Likeness/voice-consent store.** A store records consent for using a person's likeness or voice (e.g. voice cloning).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.16

**Audio transcription service.** A server transcription service turns uploaded audio into text through a provider speech-to-text model, metered per request.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.17

**Text-to-speech service.** A text-to-speech service turns text into spoken audio for read-aloud and voice replies.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.18

**Realtime session broker.** A server broker creates realtime voice sessions with the provider, applies instructions/tools/voice, and returns the session to the client.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.19

**Ephemeral credential service.** Clients receive short-lived credentials to connect to realtime providers without holding a long-lived key.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.20

**Audio transport.** Live audio flows between the user device and the realtime model over a media transport (WebRTC).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.21

**Voice activity detection.** Voice activity (speech start and end) is detected, with tunable sensitivity where needed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.22

**Turn-detection coordinator.** A coordinator decides when the user's turn ends and the assistant's begins, and records the turns.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.23

**Playback/interruption coordinator.** When the user speaks over a reply, playback stops and the reply is cut short, with state kept consistent.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.24

**Voice-to-tool bridge.** Voice turns can call product tools and return the results into the spoken conversation, under the user's approval policy.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.25

**Voice-to-durable-task handoff.** A voice request can be handed off to a durable background task (AGI Work) that continues after the call.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.26

**Visual-frame ingestion.** Camera or screen frames are captured and delivered to the realtime model during a voice session.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.27

**Audio/video synchronization.** Audio and video streams are kept in sync (muxing, offset correction, lip sync).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.28

**Voice session persistence.** Voice sessions are persisted with their settings and status so they can be audited and resumed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.29

**Audio overview generator.** A generator turns sources into a spoken audio overview (podcast-style).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)

## S97.30

**Music-generation adapter.** An adapter generates music through a provider.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F097-99 Other items in Media and realtime components](../../20-features/097-media-and-realtime-components/F097-99-other-items.md)
