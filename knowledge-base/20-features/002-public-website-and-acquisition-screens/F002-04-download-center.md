---
id: "F002-04"
type: "feature"
title: "Download center"
aliases: ["Download page", "Download center", "Desktop for Mac", "Installer availability", "Verify your download", "S2.27"]
area: "2 Public website and acquisition screens"
available_on: ["web"]
implementation: {web: "built", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "seen working", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S2.27"]
depends_on: ["surface:web", "surface:desktop", "SYS-api-and-contracts", "SYS-security-and-privacy", "SYS-observability-and-operations", "api:GET /api/download", "api:GET /api/download/checksums", "api:GET /api/releases/desktop-cloud/latest", "file:apps/web/lib/releases/github-desktop-releases.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F002-04 Download center

The /download page. It reads the release API and offers Mac installers only for architectures that are actually published, detects the visitor's Mac type, shows SHA-256 checksums, and lists CLI archives. Windows and Linux Desktop installers are shown as not published.

Area: [2. Public website and acquisition screens](README.md). Requirement items: [S2.27](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s227).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | seen working |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows every app's status and, when the release API reports a signed macOS build, a 'Download for Mac' button for the detected architecture plus the other one, the published checksums and verification commands (apps/web/app/download/DownloadSurfaces.tsx:122-186,426-453). The download link goes through our server, which relays the file from the release host (apps/web/app/api/download/route.ts:96-187).

**Why it exists.** A download page must give the right file and never a dead link or an unverified build (doc: docs/product/competitive-guidance.md section 5.1 item 6).

**Who uses it.** Mac users installing Desktop, developers fetching CLI archives, and visitors who want to know which apps exist.

**Problems it solves**

- Wrong-architecture installs: the page detects Apple silicon or Intel and offers both
- False availability: buttons appear only after the API confirms the architecture (apps/web/app/download/DesktopDownloadAvailability.tsx:74-75)
- Tampering doubts: SHA-256 values are published and shown only for the same version

**Use cases**

- A Mac user clicks Download for Mac and gets the right .dmg
- A user on an Intel Mac clicks the other-architecture link
- A cautious user checks the checksum with shasum
- A visitor sees Windows and Linux as not published

## 2. User experience

**Where to find it**

- Web: /download (nav item 'Downloads', apps/web/features/marketing/components/system/nav.ts); Desktop page embeds the same availability block at /desktop#desktop-downloads
- Other apps: not applicable; Desktop's own update path is a separate route (apps/web/app/api/releases/desktop-cloud/update)

**Before you start**

- None; no account needed

**Screens and controls**

- Hero when a Mac build exists: 'Desktop for Mac', button 'Download for Mac', secondary 'Open <chat name>', and a link 'Download the <architecture> version' for the other Mac (apps/web/app/download/DownloadSurfaces.tsx:122-186)
- Hero when none exists: 'Use AGI today, in your browser' with 'Get notified about the apps'
- On /desktop: buttons 'Download for Apple silicon' / 'Download for Intel Mac' with '(this Mac)' on the detected one; rows for macOS, Windows, Linux; 'Retry release check' on error (apps/web/app/download/DesktopDownloadAvailability.tsx:41-150)
- Collapsible 'Verify your download' with shasum, codesign and stapler commands
- List 'CLI archives' with per-platform links; a notify form

**Journey**

1. Visitor opens /download
2. Page shows 'Checking the release channel…' while it asks the release API
3. If a build is confirmed the Download button appears for the detected Mac
4. Visitor downloads the .dmg and checks the SHA-256
5. Visitor installs by dragging to Applications and signs in with the web account (apps/web/app/download/DesktopDownloadAvailability.tsx:9-15)

**What the person sees and gets**

- Status line 'Desktop for Mac is available · version <version>'
- 'Signed and notarized · version <version>'
- File download named from the release asset, ending .dmg
- Messages: 'No signed Desktop installer is available right now.' or 'We could not verify the Desktop installer.'

**Settings**

- None; browser architecture detection is automatic (apps/web/app/download/detect-architecture.ts)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Release check against /api/releases/desktop-cloud/latest with four states: loading, available, empty (404), error (apps/web/app/download/use-desktop-release.ts:100-140)
- Per-architecture offer: only architectures with a .dmg asset (apps/web/app/api/releases/desktop-cloud/latest/route.ts:44-57)
- Detection from browser data with a GPU-name fallback; unknown offers both (apps/web/app/download/__tests__/detect-architecture.test.ts:21-52)
- Checksums from the release's SHA256SUMS asset, validated as 64 hex characters and shown only when versions match (apps/web/app/api/download/checksums/route.ts:14-60; apps/web/app/download/use-desktop-release.ts:176-186)
- Windows and Linux rows 'installer not published. No release date is available for it.' (apps/web/app/download/DesktopDownloadAvailability.tsx:19-26)
- Download route: only platform=mac is served; other platforms answer 503; wrong version redirects to /download with 303; trusted asset URL check; stall timeout of 30 seconds (apps/web/app/api/download/route.ts:96-187)
- Updates held answer 503 UPDATES_HELD (apps/web/app/api/releases/desktop-cloud/latest/route.ts:19-26)

**Incomplete**

- The /download hero does not show Windows and Linux rows; only the /desktop block does (observed in DesktopDownloadAvailability.tsx; the /download page body not fully read)

**Present but disconnected or switched off**

- Windows and Linux Desktop downloads: the API returns 503 for them (apps/web/app/api/download/route.ts:147)

**Not available**

- Desktop for Windows and Linux; code supports macOS only

## 4. Required behaviour

**Established requirements**

- A download page offers installers per platform/architecture, reporting what is actually published (S2.27) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S2.27)
- Present real platform support, versions, update channels, installation instructions, signing status and system requirements (source: doc: docs/product/competitive-guidance.md (section 5.1 item 6))
- Download buttons appear only for an architecture the release API confirms; Windows and Linux show as not published with no release date (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S2.27)

**Acceptance criteria**

1. With both architectures published, both buttons exist and the detected one is primary
2. With only one architecture published, only that button exists
3. With no release, no download button exists and the empty message shows
4. A failed release call shows an error and Retry re-checks both release and checksums
5. Checksums of a different version than the offered one are never shown
6. Windows and Linux rows say not published with no date
7. Downloading with a stale version parameter does not serve a file

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- System requirements (macOS version) are not on the page; the competitive guidance asks for them [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add minimum macOS version and file size
- [proposed] Show the update channel and release date

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Download page | `apps/web/app/download/page.tsx` | Metadata and DownloadSurfaces |
| component | DownloadSurfaces | `apps/web/app/download/DownloadSurfaces.tsx` | Hero variants, app list, notify form, verify section |
| component | DesktopDownloadAvailability | `apps/web/app/download/DesktopDownloadAvailability.tsx` | Availability block on /desktop with Windows and Linux rows |
| hook | useDesktopRelease | `apps/web/app/download/use-desktop-release.ts` | Fetches release and checksums, picks architectures |
| hook | useCliRelease | `apps/web/app/download/use-cli-release.ts` | Fetches CLI archives for the CLI list |
| service | detectMacArchitecture | `apps/web/app/download/detect-architecture.ts` | Reads browser data to name the Mac processor |
| endpoint | GET /api/releases/desktop-cloud/latest | `apps/web/app/api/releases/desktop-cloud/latest/route.ts` | Manifest: version, mac true, per-architecture booleans |
| endpoint | GET /api/download/checksums | `apps/web/app/api/download/checksums/route.ts` | Parses SHA256SUMS from the release |
| endpoint | GET /api/download | `apps/web/app/api/download/route.ts` | Relays the installer; validates platform, arch, version |
| service | Desktop release lookup | `apps/web/lib/releases/github-desktop-releases.ts` | Reads GitHub releases with tag prefix for the cloud desktop |
| service | Trusted asset URL check | `apps/web/lib/releases/trusted-release-asset-url.ts` | Refuses asset URLs outside the release host |
| service | Update hold | `apps/web/lib/releases/desktop-update-hold.ts` | Pauses updates for a bad version |
| config | Public API patterns | `apps/web/proxy.ts` | /api/download and /api/download/(.*) served without identity (lines 155-162) |
| component | ScrollToHashTarget | `apps/web/app/download/ScrollToHashTarget.tsx` | Scrolls to #desktop-downloads, #cli-downloads, #notify |
| test | Download surface tests | `apps/web/app/download/__tests__/DesktopDownloadSurface.test.tsx` | Availability states, checksums, retry |
| test | Download page tests | `apps/web/app/download/__tests__/DownloadPage.test.tsx` | Hero, architecture order, verify section |
| test | Checksums route test | `apps/web/app/api/download/__tests__/checksums-route.test.ts` | Checksum parsing and 404 |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Browser loads the page and asks /api/releases/desktop-cloud/latest and /api/download/checksums, no cache | device and our servers | apps/web/app/download/use-desktop-release.ts:100-160 |
| Our server rate-limits, reads the latest stable release from the release host (GitHub), and answers version and architectures; cache 300 seconds | outside service | apps/web/app/api/releases/desktop-cloud/latest/route.ts:15-67 |
| Browser detects the Mac architecture locally | device | apps/web/app/download/use-desktop-release.ts:163-172 |
| Click goes to /api/download?platform=mac&arch=...&version=...; our server checks the version, picks the .dmg, checks the URL is trusted and streams it from the release host | our servers | apps/web/app/api/download/route.ts:96-187 |
| User verifies the checksum and installs on the device | device | apps/web/app/download/DesktopDownloadAvailability.tsx:9-15 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Download request log: user agent (200 characters), platform, app, architecture, time | Server logs | no | Log retention unknown |

**Models and providers.** No model or provider is used. The release host is GitHub; configuration names are DESKTOP_CLOUD_GITHUB_OWNER, DESKTOP_CLOUD_GITHUB_REPO and GITHUB_TOKEN (apps/web/lib/releases/github-desktop-releases.ts:105-150,254).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None. |
| Permissions | Public routes; /api/download is outside the identity proxy (apps/web/proxy.ts:155-162). |
| Subscription | none found in the code; downloads need no plan. |
| Limits and metering | Rate limits named 'download' and 'release-latest' (apps/web/app/api/download/route.ts:97; apps/web/app/api/releases/desktop-cloud/latest/route.ts:19). Installer transfer ends after 30 seconds without progress. |
| Feature flags | Update hold (apps/web/lib/releases/desktop-update-hold.ts); release repository settings in server configuration. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Downloading the installer needs our servers; once installed, Desktop's Local behaviour is described on the Desktop page and belongs to another feature. Desktop currently takes no provider keys or local models per the landing copy (apps/web/features/marketing/components/MarketingLanding.tsx surface index). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Checking the release channel…' with role status and aria-busy | apps/web/app/download/DesktopDownloadAvailability.tsx:78-87 |
| Empty | 'No signed Desktop installer is available right now.' with Use Chat and CLI links | apps/web/app/download/DesktopDownloadAvailability.tsx:112-124 |
| Error or updates held | Alert with Retry release check; held updates also land here because any non-404 failure is an error | apps/web/app/download/use-desktop-release.ts:107-125; DesktopDownloadAvailability.tsx:126-137 |
| Unknown architecture | Both installers offered with an explanation | apps/web/app/download/DesktopDownloadAvailability.tsx:104-108 |
| Only one architecture published | Only that button; hero says release is published for that architecture only | apps/web/app/download/DownloadSurfaces.tsx:165-168 |
| Version moved on after page load | Download route redirects 303 to /download | apps/web/app/api/download/route.ts:154-159 |
| Stalled transfer | Stream is aborted after 30 seconds without bytes | apps/web/app/api/download/route.ts:20-21,62-95 |
| Windows or Linux request | 503 'Installer unavailable' | apps/web/app/api/download/route.ts:121-123,147 |
| Offline | Shown as the error state [inferred from the catch in use-desktop-release.ts] | apps/web/app/download/use-desktop-release.ts:121-125 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/download/__tests__/DesktopDownloadSurface.test.tsx`: One installer per architecture, only published architectures, Windows and Linux rows, checksums with version match, retry refreshes checksums, empty and error states, loading and error boundary
- `apps/web/app/download/__tests__/DownloadPage.test.tsx`: Page lead, status per surface, notify anchors, failed check and retry, Apple silicon and Intel ordering, verify section, CLI archive links, untrusted URL refusal
- `apps/web/app/download/__tests__/DownloadReleaseChannel.test.tsx`: Stable channel only, never beta or nightly; CLI platform labels
- `apps/web/app/download/__tests__/detect-architecture.test.ts`: Architecture detection and fallbacks
- `apps/web/app/api/download/__tests__/checksums-route.test.ts`: Checksum parsing, 404 without checksum asset
- `apps/web/app/api/releases/__tests__/desktop-release-routes.test.ts`: Desktop release routes (contents not opened)
- `apps/web/app/api/releases/__tests__/desktop-update-hold.test.ts`: Update hold (contents not opened)

**Test scenarios**

- **Apple silicon Mac**
  1. Open /download on an Apple silicon Mac with a published build
  - Expected: Download for Mac points to the arm64 file; other Mac link shown
- **Checksum match**
  1. Download the file
  2. Run shasum -a 256
  3. Compare with the page
  - Expected: Strings equal
- **No release**
  1. Point the release repository at one with no .dmg
  2. Open /download
  - Expected: No download button; browser-first hero
- **Release API down**
  1. Return 503 from the release API
  2. Open /desktop
  3. Click Retry release check
  - Expected: Alert then recovery when API returns
- **Non-Mac request**
  1. GET /api/download?platform=windows
  - Expected: 503 Installer unavailable
- **Stale version**
  1. GET /api/download?platform=mac&version=0.0.0
  - Expected: 303 to /download

**Where to look when it fails**

- Log line 'Download request received'
- JSON codes NOT_FOUND, UPDATES_HELD, RELEASE_LOOKUP_UNAVAILABLE from the release routes
- Error 'Release asset URL is not trusted' or 'Failed to fetch installer from GitHub' from /api/download

**Hands-on test plans**

- Web: [70-qa/test-plans/web/002-public-website-and-acquisition-screens.md](../../70-qa/test-plans/web/002-public-website-and-acquisition-screens.md)

## 10. Gaps and dependencies

- **No recorded real-download test of an installer through /api/download** Affects: Mac visitors. Evidence: Tests mock the release lookup. Work needed: Human-style run on both Mac types with a published build
- **System requirements, file size and release date not shown** Affects: Mac visitors. Evidence: Not in DownloadSurfaces.tsx or DesktopDownloadAvailability.tsx. Work needed: Add from the release manifest (publishedAt is already returned)
- **A paused update looks like a generic verification error to the visitor** Affects: Mac visitors during a hold. Evidence: apps/web/app/download/use-desktop-release.ts:107-125. Work needed: Show the hold message

**Depends on**

- surface:web
- surface:desktop
- SYS-api-and-contracts
- SYS-security-and-privacy
- SYS-observability-and-operations
- api:GET /api/download
- api:GET /api/download/checksums
- api:GET /api/releases/desktop-cloud/latest
- file:apps/web/lib/releases/github-desktop-releases.ts

## Unknown

- Whether a signed Mac release is currently published
- Retention of the request log
- How the /download page renders Windows and Linux (only the /desktop block was read)
- Contents of the desktop release route tests
- Whether the notarization claims on the page were verified by any recorded run
