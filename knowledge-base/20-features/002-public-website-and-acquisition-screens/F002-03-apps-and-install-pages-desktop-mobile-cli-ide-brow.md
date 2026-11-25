---
id: "F002-03"
type: "feature"
title: "Apps and install pages (desktop, mobile, CLI, IDE, browser)"
aliases: ["Desktop page", "Mobile page", "CLI install page", "VS Code extension page", "Chrome extension page", "Surface pages", "S2.09", "S2.10", "S2.11", "S2.12", "S2.13"]
area: "2 Public website and acquisition screens"
available_on: ["web"]
implementation: {web: "partial", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "seen working", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S2.09", "S2.10", "S2.11", "S2.12", "S2.13"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "SYS-execution-boundaries", "SYS-observability-and-operations", "api:GET /api/releases/cli/latest", "api:POST /api/waitlist/public", "table:cloud_managed_waitlist", "file:apps/web/lib/surface-status.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F002-03 Apps and install pages (desktop, mobile, CLI, IDE, browser)

Public Web pages for Desktop, Mobile, the CLI, the VS Code extension and the Chrome extension. Each states availability from one status registry, where every app except Web is 'Coming soon'. The CLI page shows the install command only when the release API reports a signed release.

Area: [2. Public website and acquisition screens](README.md). Requirement items: [S2.09](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s209), [S2.10](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s210), [S2.11](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s211), [S2.12](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s212), [S2.13](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s213).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | seen working |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Describes each app and its trust boundary, shows availability from the registry in apps/web/lib/surface-status.ts:6-13, and offers the next step: check availability, get notified or, for the CLI, an install command when a release exists (apps/web/app/cli/CliInstallCommand.tsx:17,111).

**Why it exists.** Visitors need to know what each app does and whether they can install it, without false promises (doc: docs/product/competitive-guidance.md section 5.1 item 6).

**Who uses it.** Prospective users, developers choosing between CLI and editor, and people waiting for the mobile app.

**Problems it solves**

- No page claims an app is installable while the registry says Coming soon (apps/web/app/mobile/__tests__/mobile-availability-copy.test.ts:26)
- The CLI page cannot show a command that does not work yet: with no release it says none is published
- One registry edit changes status copy everywhere

**Use cases**

- A developer opens /cli to install the agi command
- A Mac user opens /desktop to see what Desktop does and its availability
- A phone user opens /mobile and taps Get notified
- A developer opens /vscode-extension to see slash commands and availability

## 2. User experience

**Where to find it**

- Web nav Products group: Desktop, CLI, Chrome extension, Code for VS Code, Mobile (apps/web/features/marketing/components/system/nav.ts, product items)
- Web paths: /desktop, /cli, /mobile, /vscode-extension, /chrome-extension
- Other apps: not applicable

**Before you start**

- None

**Screens and controls**

- Hero eyebrow carries the status, for example 'Mobile · iPhone & Android · Coming soon' (apps/web/app/mobile/page.tsx:92-94)
- Mobile and VS Code button 'Get notified' to /download#notify (apps/web/app/mobile/page.tsx; apps/web/app/vscode-extension/page.tsx)
- CLI: terminal block with the install command, or a status message, or 'We could not check the CLI release channel.' with a 'Check again' button (apps/web/app/cli/CliInstallCommand.tsx:96-125)
- CLI links 'Check availability' and 'Explore Code' (apps/web/app/cli/page.tsx:221-222)
- Desktop page embeds the desktop installer availability section (apps/web/app/desktop/page.tsx:148)

**Journey**

1. Visitor opens the page
2. Page reads the status from the registry; the CLI page also calls /api/releases/cli/latest
3. Visitor reads capabilities and boundaries
4. Visitor follows the call to action: install command, download section, or notify form

**What the person sees and gets**

- Status label ('Coming soon' or 'Available now') or, on the CLI page, 'Signed release published' once the API confirms (apps/web/app/cli/CliInstallCommand.tsx:19,88-91)
- Spinner with label 'Checking for a signed CLI release' while loading
- Install command text: curl -fsSL <site>/install.sh | bash with version and platform line

**Settings**

- No user settings

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Desktop page with embedded verified availability, one Electron shell described, Windows not published (apps/web/app/desktop/page.tsx:64-78,148,160)
- CLI page with four release states: loading, published, unpublished (404), error with retry (apps/web/app/cli/CliInstallCommand.tsx:41-125)
- Install script served from the site at /install.sh with signature check, options --version, --install-dir, --no-modify-path (apps/web/public/install.sh:1-60)
- Mobile page states the app is not published and describes the planned Local default (apps/web/app/mobile/page.tsx:15-35)
- VS Code and Chrome pages carry the registry status in the hero (apps/web/app/vscode-extension/page.tsx:35; apps/web/app/chrome-extension/page.tsx:116)

**Incomplete**

- The CLI page marks a release 'published' from the presence of a version in the API answer; it does not itself check that install.sh can fetch and verify an archive
- The install command line says macOS, Linux and Windows through Git Bash or WSL as fixed text (apps/web/app/cli/CliInstallCommand.tsx:102)

**Present but disconnected or switched off**

- No store or marketplace links for Mobile, VS Code or Chrome exist; each page directs to notify or availability because status is Coming soon (apps/web/lib/surface-status.ts:58-83)

**Not available**

- Desktop for Windows and Linux are not published; stated on the page (apps/web/app/desktop/page.tsx:160)
- No installer or store listing for Mobile, VS Code extension or Chrome extension in the website code

## 4. Required behaviour

**Established requirements**

- Desktop page describes the app truthfully (what it does, availability, download) (S2.09) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S2.09)
- Mobile page describes the app and its availability (S2.10) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S2.10)
- CLI page tells a visitor how to install and offers a working install (S2.11, status unverified) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S2.11)
- IDE and browser extension pages describe the extension and its availability (S2.12, S2.13) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S2.12, S2.13)
- Downloads present real platform support, versions, update channels, installation instructions and signing status (source: doc: docs/product/competitive-guidance.md (section 5.1 item 6))
- Pages state execution boundaries: what runs on the device, in Cloud, or through outside services (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. Each of the five pages loads and shows its status from the registry
2. With no CLI release the CLI page shows 'No signed release is published yet' and no command
3. With a CLI release the page shows the command and version
4. A failed CLI lookup shows an error with a working Check again button
5. Mobile page does not say the app is installable while status is Coming soon
6. Desktop page lists Windows as not published

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The install command should work on a clean machine once the page shows it [inferred from S2.11 'working install']

**Proposed improvements** (suggestions, not requirements)

- [proposed] Run install.sh against a real published release and record the result
- [proposed] Show store links on Mobile, VS Code and Chrome only when each is published, driven by the registry

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Desktop page | `apps/web/app/desktop/page.tsx` | Describes Desktop and embeds installer availability |
| screen | CLI page | `apps/web/app/cli/page.tsx` | CLI description with release provider and install block |
| component | CliInstallCommand | `apps/web/app/cli/CliInstallCommand.tsx` | Fetches /api/releases/cli/latest and renders the four states |
| screen | Mobile page | `apps/web/app/mobile/page.tsx` | Mobile preview and notify call to action |
| screen | VS Code page | `apps/web/app/vscode-extension/page.tsx` | Slash commands and availability |
| screen | Chrome extension page | `apps/web/app/chrome-extension/page.tsx` | Boundary description and status |
| config | Surface status registry | `apps/web/lib/surface-status.ts` | Status labels, platforms, surfaceCta, NOTIFY_CTA |
| config | Marketing constants | `apps/web/lib/marketing-constants.ts` | Re-exports status and CLI availability note |
| endpoint | GET /api/releases/cli/latest | `apps/web/app/api/releases/cli/latest/route.ts` | Returns the latest CLI release or 404 |
| service | CLI release lookup | `apps/web/lib/releases/github-cli-releases.ts` | Reads release archives from the release host for the six CLI platforms |
| other | install.sh | `apps/web/public/install.sh` | Installer served at /install.sh; checks a release signature |
| component | DesktopDownloadAvailability | `apps/web/app/download/DesktopDownloadAvailability.tsx` | Installer availability block used on /desktop |
| component | WaitlistTrigger | `apps/web/features/marketing/components/WaitlistModal.tsx` | Waitlist dialog opened from Desktop and Mobile pages |
| component | PublicWaitlistForm | `apps/web/features/marketing/components/PublicWaitlistForm.tsx` | Email form behind Get notified |
| endpoint | POST /api/waitlist/public | `apps/web/app/api/waitlist/public/route.ts` | Stores the notify email with consent record |
| table | cloud_managed_waitlist | `apps/web/app/api/waitlist/public/route.ts` | Row per email with source and join time |
| test | CLI install test | `apps/web/app/cli/CliInstallCommand.test.tsx` | Loading, published and retry states |
| test | Surface page claims test | `apps/web/__tests__/surface-page-claims.test.ts` | Desktop claims checks |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Page renders on the server with the status registry values | our servers | apps/web/app/mobile/page.tsx:92-94 |
| CLI page in the browser fetches /api/releases/cli/latest with no cache | device and our servers | apps/web/app/cli/CliInstallCommand.tsx:47-49 |
| The route applies a rate limit, reads the latest CLI release from the release host (GitHub), and answers 404 when none exists; cache 300 seconds | outside service | apps/web/app/api/releases/cli/latest/route.ts:8-26; apps/web/lib/releases/github-cli-releases.ts:1-40 |
| Visitor runs the shown command on their own machine; install.sh downloads the archive and verifies a signature with an embedded public key | device | apps/web/public/install.sh:11-34 |
| Get notified posts the email to the waitlist route | our servers | apps/web/app/api/waitlist/public/route.ts:182-195 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Notify email, source, consent record | Table cloud_managed_waitlist (and a consent ledger) in the server database | Server only | Withdrawal flows exist (apps/web/features/marketing/components/WaitlistModal.withdrawal.test.tsx); retention rule unknown |

**Models and providers.** No model or provider call. Pages describe Local and own-key modes for CLI and Cloud for the rest; no model identifiers are on these pages' logic.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None to read; Get notified needs only an email. |
| Permissions | Public. |
| Subscription | none found in the code for these pages. |
| Limits and metering | Rate limit 'release-latest' on the CLI release route (apps/web/app/api/releases/cli/latest/route.ts:9); waitlist route has its own limit 'waitlist'. |
| Feature flags | Status registry values in apps/web/lib/surface-status.ts act as the release switch; server env GITHUB_TOKEN and release repository names affect the CLI lookup (apps/web/lib/releases/github-desktop-releases.ts:105-150, 254-255). |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | The pages state Local runs in the CLI and is planned as the Mobile default; whether Mobile is free of subscription is stated on the page ('Yours alone, free forever') but the app itself is not part of this review. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| CLI lookup loading | Spinner with accessible label and aria-busy | apps/web/app/cli/CliInstallCommand.tsx:79-81 |
| CLI no release (404) | Status text, no command | apps/web/app/cli/CliInstallCommand.tsx:97-104 |
| CLI lookup error | Message and Check again button; retry re-runs the lookup | apps/web/app/cli/CliInstallCommand.tsx:106-125 |
| Stale response | A request counter ignores older answers | apps/web/app/cli/CliInstallCommand.tsx:46-60 |
| Offline | Shows the error state because fetch fails | apps/web/app/cli/CliInstallCommand.tsx:61-64 [inferred] |
| Windows PowerShell user | install.sh header says Git Bash, MSYS2, Cygwin or WSL are needed | apps/web/public/install.sh:9-10 |
| Cancel and timeout | not handled in the code beyond aborting on unmount | apps/web/app/cli/CliInstallCommand.tsx:70-74 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/cli/CliInstallCommand.test.tsx`: Busy status, unpublished state keeps no command, published version, failed lookup retry
- `apps/web/app/mobile/__tests__/mobile-availability-copy.test.ts`: Hero states registry status; no installable claim; legal in-app-purchase clause gated on registry
- `apps/web/__tests__/surface-page-claims.test.ts`: Desktop page: Electron wording, signed installers, Windows unpublished, computer use prompts, Local and BYOK claims
- `apps/web/__tests__/distribution-state.test.ts`: Surface landing pages follow the status registry
- `apps/web/app/chrome-extension/__tests__/chrome-boundary-claims.test.ts`: Chrome page boundary claims: Cloud gateway, screenshots, native messaging
- `apps/web/app/api/releases/__tests__/cli-release-route.test.ts`: CLI release route (contents not opened)

**Test scenarios**

- **CLI with no release**
  1. Open /cli while no CLI release is published
  - Expected: Message 'No signed release is published yet'; no command
- **CLI with release**
  1. Publish or mock a CLI release
  2. Open /cli
  3. Copy the command and run it in a clean shell
  - Expected: Command shown with version; install completes and agi runs
- **CLI lookup failure**
  1. Block /api/releases/cli/latest
  2. Open /cli
  3. Click Check again after restoring
  - Expected: Error with button; then the normal state
- **Mobile notify**
  1. Open /mobile
  2. Click Get notified
  3. Submit an email
  - Expected: Form at /download#notify accepts the email
- **Status consistency**
  1. Compare each page's status text with apps/web/lib/surface-status.ts
  - Expected: Identical

**Where to look when it fails**

- Server log 'Download request received' is for downloads; for releases watch rate-limit and error-handler logs
- 404 JSON code NOT_FOUND from /api/releases/cli/latest means no CLI archive
- Table cloud_managed_waitlist for notify signups

**Hands-on test plans**

- Web: [70-qa/test-plans/web/002-public-website-and-acquisition-screens.md](../../70-qa/test-plans/web/002-public-website-and-acquisition-screens.md)

## 10. Gaps and dependencies

- **The working install has no recorded end-to-end run; the brief marks it unverified** Affects: CLI users on Web. Evidence: No file records a run of install.sh against a release. Work needed: Run and record an install on macOS and Linux
- **All app pages say Coming soon; no store links** Affects: Mobile, VS Code and Chrome visitors. Evidence: apps/web/lib/surface-status.ts:6-13. Work needed: Add links when each is published
- **Brief status for S2.09-S2.13 is 'done' but the web pages only describe unpublished apps** Affects: Status reporting. Evidence: apps/web/lib/surface-status.ts:6-13. Work needed: Clarify done means page exists, not app available

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- SYS-execution-boundaries
- SYS-observability-and-operations
- api:GET /api/releases/cli/latest
- api:POST /api/waitlist/public
- table:cloud_managed_waitlist
- file:apps/web/lib/surface-status.ts

## Unknown

- Whether install.sh completes on a clean machine
- Which CLI platforms the current release carries
- Whether the Chrome extension page has a store link (not found; page fully read only at the status lines)
- How long waitlist emails are retained
- Contents of the CLI release route test
