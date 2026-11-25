---
id: "F002-09"
type: "feature"
title: "Release notes and changelog"
aliases: ["Changelog", "/changelog", "Release notes", "/release-notes", "Announcement page", "/release-notes/<slug>", "Atom feed /changelog/feed.xml", "agi update --check", "What's new in (CLI)", "S2.28", "S2.29"]
area: "2 Public website and acquisition screens"
available_on: ["web", "cli"]
implementation: {web: "built", desktop: "n/a", mobile: "n/a", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "partly seen (1 of 2)", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S2.28", "S2.29"]
depends_on: ["surface:web", "surface:cli", "mode:local", "api:GET /api/releases/cli/latest", "file:apps/web/lib/changelog-entries.ts", "file:apps/cli/src/update_check.rs", "SYS-observability-and-operations", "SYS-api-and-contracts", "F002-11", "F002-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F002-09 Release notes and changelog

The web app publishes a dated list of releases at /changelog and /release-notes (the same page), one page per release at /release-notes/<date-slug>, plus an Atom feed of releases and policy changes. The CLI separately reads a GitHub-based release feed to tell users an update exists and print the install command.

Area: [2. Public website and acquisition screens](README.md). Requirement items: [S2.28](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s228), [S2.29](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s229).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 2) |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | built | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lists dated releases with the surfaces reached and a maturity label (generally available, beta or alpha), a forthcoming list, policy changes, and an Atom feed; each release has its own page (apps/web/app/release-notes/ReleaseNotesPage.tsx:89; apps/web/app/release-notes/[slug]/page.tsx:24-93). The CLI compares its version with the newest published CLI release and prints notes and the install command (apps/cli/src/update_check.rs:185-214).

**Why it exists.** Honest, dated product history that states what is released and what is not (ReleaseNotesPage.tsx lede), and a way for CLI users to find updates.

**Who uses it.** Customers, reviewers, people subscribed by feed reader, and CLI users.

**Problems it solves**

- Visitors need to know what shipped and on which app
- Policy changes need a dated public record
- CLI users need to know a newer build exists

**Use cases**

- A visitor opens /release-notes, sees the newest release and its state line.
- A reader subscribes to /changelog/feed.xml.
- A CLI user runs `agi update --check` and gets the install command.
- A reviewer opens /release-notes/2026-09-15 to read one announcement.

## 2. User experience

**Where to find it**

- Web: Resources > Release notes in the header menu and footer (apps/web/features/marketing/components/system/nav.ts:141, 210). /changelog is not in the nav lists [inferred from grep].
- Web: also linked from /about as 'All release notes →' and from /status (about/page.tsx; status/page.tsx:564).
- CLI: command `agi update` with `--check` and `--install` (apps/cli/src/lib.rs:6559-6585); startup notice in the TUI (update_check.rs:135-160); the `/release-notes` TUI text (apps/cli/src/claude_parity.rs:1893-1915).
- Desktop, mobile, VS Code, Chrome: none found.

**Before you start**

- None for the web pages.
- CLI: network access to the agiworkforce.com API base; not in Local privacy mode for the automatic check (update_check.rs:125-133).

**Screens and controls**

- Hero 'What shipped, and when.' with an Atom link, fact line (counts, newest date, maturity counts, forthcoming) (ReleaseNotesPage.tsx:89-130).
- Ledger of releases: date, state line, linked headline and body lines.
- Policy changes ledger with dated entries and standing notes.
- Single release page: date and state line, headline, body, button 'All release notes' (slug/page.tsx:45-70).

**Journey**

1. Open /release-notes or /changelog.
2. Read the fact line and ledger; open a headline.
3. On the release page read the body and go back with 'All release notes'.
4. Optionally subscribe to the feed.
5. CLI: run `agi update --check`; if a newer release exists it prints the install command and exits with code 1 (lib.rs:6574-6580).

**What the person sees and gets**

- Web: pages, an Atom document with absolute links (changelog-feed.ts:155).
- CLI: lines 'Running:', 'Published:', 'An update is available. Install it with: ...' and 'What's new in <version>: ...' plus 'Release notes: <url>' (update_check.rs:185-210, 62-72).

**Settings**

- CLI config updates.check_on_startup and env AGIWORKFORCE_NO_UPDATE_CHECK turn the startup check off (update_check.rs:28, 125-133; config.rs:110).
- A repository's own config cannot switch the check off for its users (update_check.rs test at :945).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Both /changelog and /release-notes render the same component (apps/web/app/changelog/page.tsx; apps/web/app/release-notes/page.tsx; test e2e 'changelog serves the same ledger').
- Release entries are a hand-written list; each date must have a maturity and surface record or the build throws (apps/web/lib/changelog-entries.ts:8; apps/web/app/release-notes/release-notes-data.ts:27-47).
- Slug is the date lowercased with other characters replaced by dashes; /release-notes/<slug> is statically generated and an unknown slug gives not found (changelog-entries.ts:104-113; slug/page.tsx:24-40).
- Billing-only releases are hidden in the in-app embedded view (ReleaseNotesPage.tsx:55; slug/page.tsx:72).
- The Atom feed holds releases and policy changes newest first (changelog-feed.ts:155).
- CLI fetches /api/releases/cli/latest with a 5 second timeout and only an agiworkforce.com https base (update_check.rs:23, 26, 805-834), prints the verdict and install command `curl -fsSL https://agiworkforce.com/install.sh | bash` (update_check.rs:212-214).
- The web route reads GitHub release data and answers 404 when none is published, cached 300 seconds (apps/web/app/api/releases/cli/latest/route.ts:9-23; apps/web/lib/releases/github-cli-releases.ts:153).

**Incomplete**

- Two unlinked release sources: the web changelog is hand-written, the CLI feed comes from GitHub releases; notes are not shared between them [inferred].
- The Update command fetches without a privacy-mode check in the lines opened (lib.rs:6564); only the startup check is skipped in Local mode.
- Whether the `--install` path is enabled for every platform: Windows is refused with Git Bash or WSL advice (update_check.rs install_directory).

**Present but disconnected or switched off**

- Startup update check is off in Local privacy mode, when config disables it, or when AGIWORKFORCE_NO_UPDATE_CHECK is set (update_check.rs:125-133).

**Not available**

- No in-app release feed on Desktop, mobile, VS Code or Chrome found.
- No per-release comments or search on the web page: not found.

## 4. Required behaviour

**Established requirements**

- A public changelog lists dated releases. (source: brief S2.28)
- Individual product announcements have their own public pages. (source: brief S2.29)
- Every release states which surfaces it reached and whether it is generally available, in beta or alpha; unreleased surfaces are marked not yet released. (source: apps/web/app/release-notes/ReleaseNotesPage.tsx lede; test apps/web/app/release-notes/__tests__/release-notes.test.ts)
- The CLI checks for updates against the release feed and prints the install command. (source: brief S2.28 (cli done); apps/cli/src/update_check.rs:185-214)

**Acceptance criteria**

1. Every RELEASES date has a state record; adding one without it fails.
2. /changelog and /release-notes show identical releases.
3. Each release slug opens a page; an unknown slug returns not found.
4. No release is called generally available when all its surfaces are unreleased.
5. The Atom feed validates and lists every release and policy change.
6. `agi update --check` exits 1 only when a newer release exists and prints the install command.
7. With Local privacy mode, no startup network call is made.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The CLI and web should name the same version dates; no source states this [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Generate the web release entry for a CLI release from the same release record.
- [proposed] Add /changelog to navigation or redirect it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | ChangelogPage | `apps/web/app/changelog/page.tsx` | Renders ReleaseNotesPage. |
| screen | ReleaseNotesPage | `apps/web/app/release-notes/ReleaseNotesPage.tsx` | Releases, forthcoming, policy changes ledgers. |
| screen | ReleaseAnnouncementPage | `apps/web/app/release-notes/[slug]/page.tsx` | One announcement per release. |
| config | RELEASES | `apps/web/lib/changelog-entries.ts` | Hand-written release list, slug and path helpers. |
| config | RELEASE_STATE | `apps/web/app/release-notes/release-notes-data.ts` | Maturity and surfaces per release; forthcoming list. |
| service | changelogFeed | `apps/web/app/release-notes/changelog-feed.ts` | Builds the Atom document; served from apps/web/app/changelog/feed.xml (route folder). |
| other | Policy archive | `apps/web/lib/legal/policy-archive.ts` | Dated policy changes shown on the page (imported at ReleaseNotesPage.tsx:5-9). |
| endpoint | GET /api/releases/cli/latest | `apps/web/app/api/releases/cli/latest/route.ts` | Newest CLI release for the CLI. |
| service | fetchCliReleaseAvailability | `apps/web/lib/releases/github-cli-releases.ts` | Reads GitHub CLI release data and summarises notes. |
| service | update_check module | `apps/cli/src/update_check.rs` | Fetch, compare, render, startup check, install. |
| command | agi update | `apps/cli/src/lib.rs` | Command::Update with --check and --install (line 6559). |
| command | /release-notes (TUI) | `apps/cli/src/claude_parity.rs` | render_release_notes at line 1893. |
| config | updates.check_on_startup | `apps/cli/src/config.rs` | Config switch (line 110). |
| test | release-notes tests | `apps/web/app/release-notes/__tests__/release-notes.test.ts` | State and wording rules for releases. |
| test | ChangelogFeed test | `apps/web/app/changelog/__tests__/ChangelogFeed.test.tsx` | Atom feed validity. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Next.js builds the pages from the in-repo release list; slugs are generated at build time. | our servers | apps/web/app/release-notes/[slug]/page.tsx:24-26 |
| Browser renders the ledger; the feed is a generated XML route. | device and our servers | apps/web/app/release-notes/changelog-feed.ts:155 |
| CLI startup (unless disabled) fetches the latest release from our web API in a background task. | device and our servers | apps/cli/src/update_check.rs:135-160, 805-834 |
| The web route reads release data from GitHub and returns version, date, download list and notes. | outside service | apps/web/lib/releases/github-cli-releases.ts:153; route.ts:9-23 |
| CLI compares versions, prints the verdict, and remembers the last seen notes version in a local file. | device | apps/cli/src/update_check.rs:90-108, 185-210 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Release list and policy history | source code in the repository | deployed with the web app | kept in git history |
| CLI 'release-notes-seen' marker (version string) | CLI config directory file | no | stays until the user deletes it |
| CLI release metadata | in memory (OnceLock) | no | process lifetime |

**Models and providers.** No AI model takes part. GitHub is the source of CLI release data.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None for web pages. CLI update check needs no account in the lines opened. |
| Permissions | Public pages. CLI install replaces the binary only in a writable install directory and refuses bundled or package-managed installs (update_check.rs install_directory). |
| Subscription | No entitlement; free to read. |
| Limits and metering | Web route rate limit bucket 'release-latest' (route.ts:9); CLI fetch timeout 5 s, download timeout 600 s (update_check.rs:23-24). |
| Feature flags | updates.check_on_startup; AGIWORKFORCE_NO_UPDATE_CHECK; AGIWORKFORCE_API_BASE (must be an agiworkforce.com https host, update_check.rs:806-810). |
| Model compatibility | none found in the code |
| Provider restrictions | Release data is read from GitHub; downloads must be GitHub release URLs (test cli-release-route 'refuses an archive URL that is not a GitHub release download'). |
| Local mode | CLI in Local privacy mode makes no automatic update check (update_check.rs:125-133); an explicit `agi update` was not shown to be blocked [unknown]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unknown slug | Not found page. | apps/web/app/release-notes/[slug]/page.tsx:40 |
| No forthcoming items | Forthcoming fact omitted. | ReleaseNotesPage.tsx:46-47; test ReleaseNotesPage.forthcoming-empty.test.tsx |
| Release missing a state | Module throws at build. | release-notes-data.ts:46 |
| No CLI release published | Route returns 404; CLI prints 'no CLI release archive is published yet'. | route.ts:17; update_check.rs:825-827 |
| Network failure or slow feed | Startup check ends silently; `agi update` returns the error. | update_check.rs:139-142; lib.rs:6564 |
| Running version newer than published | Says there is nothing to install. | update_check.rs:197-203 |
| Cannot compare versions | Prints the reason. | update_check.rs:204 |
| Embedded app view | Billing releases replaced by 'This release note is not shown in the app.' | slug/page.tsx:72-86 |
| Accessibility | Touch-target test exists for the page. | apps/web/app/release-notes/__tests__/ReleaseNotesPage.touch-targets.test.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/release-notes/__tests__/release-notes.test.ts`: Every release has a maturity and surface, only real surfaces named, no GA claim for unreleased surfaces, state line wording.
- `apps/web/app/changelog/__tests__/ChangelogFeed.test.tsx`: Atom feed well-formed, required elements, unique ids, order.
- `apps/web/e2e/release-notes.spec.ts`: Lists dated releases with a maturity state; /changelog serves the same ledger.
- `apps/web/app/release-notes/__tests__/ReleaseNotesPage.embedded.test.tsx`: Embedded view of the list.
- `apps/web/app/api/releases/__tests__/cli-release-route.test.ts`: CLI release route: downloads, unavailable cases, URL trust.
- `apps/cli/src/update_check.rs`: Inline Rust tests (about 29) for startup check gating, config round trip, install command and install plan.

**Test scenarios**

- **Same ledger**
  1. Open /changelog and /release-notes.
  - Expected: Identical releases and fact line.
- **One announcement**
  1. Open /release-notes/2026-09-15; then /release-notes/nope.
  - Expected: First shows headline and body; second shows not found.
- **Feed**
  1. Fetch /changelog/feed.xml and parse it.
  - Expected: Valid Atom with a link per release and policy change.
- **CLI update check**
  1. Run `agi update --check` with a build older than the published CLI release.
  - Expected: Update-available line with the install command; exit code 1.
- **Local mode silence**
  1. Start the CLI in Local privacy mode and watch network traffic for 30 seconds.
  - Expected: No call to /api/releases/cli/latest.

**Where to look when it fails**

- CLI debug line '[update_check] could not record the release notes as seen' (update_check.rs:101).
- Web route 404 body code NOT_FOUND.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/002-public-website-and-acquisition-screens.md](../../70-qa/test-plans/web/002-public-website-and-acquisition-screens.md)
- CLI: [70-qa/test-plans/cli/002-public-website-and-acquisition-screens.md](../../70-qa/test-plans/cli/002-public-website-and-acquisition-screens.md)

## 10. Gaps and dependencies

- **Release text names old plan labels (Pro, Max 5x, Max 20x) not matching the catalog (Premium, Max, Ultra).** Affects: Web visitors. Evidence: apps/web/lib/changelog-entries.ts:14; packages/contracts/types/src/billing-catalog.ts:193-205. Work needed: Editorial decision and correction.
- **Web changelog and CLI release feed are separate and hand-synced.** Affects: Maintainers (web, CLI). Evidence: apps/web/lib/changelog-entries.ts:8; apps/web/lib/releases/github-cli-releases.ts:153. Work needed: Link or generate one from the other.
- **The brief cites claude_parity.rs:1481 (tool-run code); the release-notes text is at 1893-1915.** Affects: Brief readers. Evidence: apps/cli/src/claude_parity.rs:1893. Work needed: Fix the reference.
- **/changelog has no navigation entry.** Affects: Visitors (web). Evidence: apps/web/features/marketing/components/system/nav.ts:141. Work needed: Optional link or redirect.
- **No release feed on Desktop, mobile or extensions.** Affects: Users of those apps. Evidence: none found in the code. Work needed: Decide whether needed.

**Depends on**

- surface:web
- surface:cli
- mode:local
- api:GET /api/releases/cli/latest
- file:apps/web/lib/changelog-entries.ts
- file:apps/cli/src/update_check.rs
- SYS-observability-and-operations
- SYS-api-and-contracts
- F002-11
- F002-10

## Unknown

- Whether `agi update` (explicit) is blocked in Local privacy mode.
- How the GitHub release notes are authored.
- Whether the Atom route has a cache policy.
- Whether /changelog is linked from anywhere other than the feed.
