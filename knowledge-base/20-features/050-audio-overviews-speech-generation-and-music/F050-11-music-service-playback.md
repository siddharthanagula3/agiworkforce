---
id: "F050-11"
type: "feature"
title: "Music-service playback"
aliases: ["Music-service playback", "Music streaming integration", "Spotify integration", "S50.30"]
area: "50 Audio overviews, speech generation, and music"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S50.30"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-authorization-and-workspaces", "surface:web", "surface:desktop", "surface:mobile", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F050-11 Music-service playback

Music-service playback would connect a streaming service such as Spotify so the assistant can play music, separate from generating it. No playback integration exists on any app. Spotify appears only in a list of connector vendors in a runbook.

Area: [50. Audio overviews, speech generation, and music](README.md). Requirement items: [S50.30](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5030).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let a person connect a music-streaming account and play music through the assistant (brief S50.30). It is a separate capability from generation. Not built.

**Why it exists.** Brief Should line S50.30. Assistants increasingly control playback through connectors.

**Who uses it.** Nobody yet. Intended: people who want to ask for songs or playlists by voice or text.

**Problems it solves**

- Starts music by asking, without switching apps.
- Keeps streaming rights with the streaming service rather than generation.

**Use cases**

- 'Play my focus playlist.'
- 'Queue something calm.'
- Pause playback while in a call.

## 2. User experience

**Where to find it**

- Web: not present as a working connector. Spotify is not in the web connector list found.
- Desktop: not present.
- Mobile: not present.
- CLI: not present.
- VS Code extension: not present.
- Chrome extension: not present.

**Before you start**

- A connected streaming account and a playback target; neither exists.

**Screens and controls**

- None.

**Journey**

1. Not available. [proposed] 1. Connect the music service. 2. Authorise. 3. Ask to play. 4. Control playback.

**What the person sees and gets**

- None.

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing.

**Incomplete**

- A runbook lists Spotify among vendors with connector OAuth planning (docs/runbooks/connector-oauth-apps.md:386). Whether a Spotify connector is built was not established; the list context was not read in full.

**Present but disconnected or switched off**

- none found in the code

**Not available**

- Music-service playback on all six apps (brief: S50.30 missing on every app; api not listed).

## 4. Required behaviour

**Established requirements**

- A music-streaming service (e.g. Spotify) can be connected to play music, as a capability separate from generation. (source: S50.30 brief)
- Connectors follow shared trust and OAuth rules. (source: docs/runbooks/connector-oauth-apps.md)

**Acceptance criteria**

1. A person can connect a streaming account through the connector flow.
2. A request to play a track or playlist starts playback on the connected service.
3. Disconnecting removes access and stored tokens.
4. Playback commands ask for confirmation where they take an action on an external account, per connector trust rules.
5. A signed-out or unconnected state shows how to connect.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Playback needs an active device on the streaming service; the assistant does not stream audio itself [inferred from the 'separate from generation' wording].
- Streaming services often require a paid account on their side; unknown here.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Use the existing connector system rather than a custom integration.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | connector OAuth runbook | `docs/runbooks/connector-oauth-apps.md` | Lists Spotify among vendors (line 386). |
| config | web connector catalog | `apps/web/lib/connectors/catalog.ts` | Registry of connectors; elevenlabs is at line 206; no Spotify entry found by search of the file's matches. |
| config | web connector data | `apps/web/features/connectors/data/connectors.ts` | Connector display data; matched search terms for music. |
| config | connector vendor directory | `apps/web/lib/connectors/directory/sources/vendor-directory.json` | Directory data that matched the search for Spotify or music. |
| config | directory categorize | `apps/web/lib/connectors/directory/categorize.ts` | Puts music-related items in a media category (line 403). |
| config | directory brand icons | `apps/web/lib/connectors/directory/brand-icons.ts` | Matched the search; icon mapping. |
| config | connector trust copy | `packages/contracts/cloud-contracts/src/connector-trust-copy.ts` | Trust level per connector; no streaming entry found. |
| config | desktop connector definitions | `apps/desktop/src/features/connectors/connectorDefinitions.ts` | Desktop connector list. |
| config | audit missing list | `audit/missing/050-audio-overviews-speech-generation-and-music.md` | Open row S50.30. |
| config | area brief | `knowledge-base/data/area-briefs/050-audio-overviews-speech-generation-and-music.md` | Should line. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No flow exists. A future flow would run through the connector system: OAuth with the streaming service, then calls to the service's API. | outside service | [inferred] from how connectors are registered (apps/web/lib/connectors/catalog.ts:105-117). |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No music-service tokens or playback state exist. | none found in the code | not applicable | not applicable |

**Models and providers.** Not a model feature. No provider folder applies. A chat model would only decide to call the connector [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | Needs a model with tool calling [inferred]. |
| Provider restrictions | Set by the streaming service's terms; unknown. |
| Local mode | Unknown. A device-local connector type exists for other tools (apps/web/lib/connectors/catalog.ts:207-211) but none for music. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states (not connected, token expired, no device, offline) | not handled in the code because the feature does not exist | No Spotify or playback code found. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- none found

**Test scenarios**

- **No music connector**
  1. Open the connector list on web and desktop.
  2. Search for Spotify or music.
  - Expected: No working playback connector today.
- **Connect and play**
  1. After build, connect an account and ask to play a song.
  - Expected: Playback starts on the service.
- **Disconnect**
  1. Disconnect the service.
  - Expected: Tokens removed; play request asks to connect.
- **Confirmation**
  1. Ask to play while a confirmation rule applies.
  - Expected: The action asks before running.

**Where to look when it fails**

- Connector logs and the connector trust copy file for the vendor.
- Check audit/missing/050-*.md.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No music-service connector** Affects: All six apps. Evidence: Brief S50.30 missing. Work needed: Add a connector entry, OAuth app, trust rules and tool actions; register in the connector catalog.
- **API surface not listed in the brief** Affects: API consumers. Evidence: Brief S50.30 status omits api. Work needed: Decide whether an API applies.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-authorization-and-workspaces
- surface:web
- surface:desktop
- surface:mobile
- mode:cloud

## Unknown

- Whether any Spotify connector exists (only a runbook mention found).
- Which streaming services would be supported.
- Where playback would happen: device, service app or in-app.
- Plan requirements.
