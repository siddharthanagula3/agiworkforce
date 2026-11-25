---
id: "F030-03"
type: "feature"
title: "Deck theme and brand"
aliases: ["Theme menu", "Deck theme", "Brand theme", "Your brands", "New brand", "deck header meta", "S30.01 title", "S30.08", "S30.09"]
area: "30 Presentation workspace"
available_on: ["web"]
implementation: {web: "built", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S30.01", "S30.08", "S30.09"]
depends_on: ["surface:web", "file:apps/web/features/chat/components/artifacts/presentation/deck-themes.ts", "file:apps/web/features/chat/components/artifacts/presentation/deck-themes.json", "file:packages/ui/unified-chat/src/lib/deck-model.ts", "SYS-shared-ui-and-design", "SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "F030-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F030-03 Deck theme and brand

Sets how a web deck looks. The Theme menu offers built-in themes and saved brands; the choice is written into the deck's first line (<!-- deck ... -->) and used on every slide, in presenting mode and in exports. The deck title is the artifact title, renamed from the artifact menu. Mobile ignores themes.

Area: [30. Presentation workspace](README.md). Requirement items: [S30.01](../../10-requirements/capabilities/030-presentation-workspace.md#s3001), [S30.08](../../10-requirements/capabilities/030-presentation-workspace.md#s3008), [S30.09](../../10-requirements/capabilities/030-presentation-workspace.md#s3009).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Stores a theme id, or a custom brand's colours and fonts, in the deck header and applies it to every slide.

**Why it exists.** Briefs S30.08 and S30.09 want a visual theme and a brand or design system for a deck. S30.01 wants a visible, settable title.

**Who uses it.** People making decks for their company or a client on the web app.

**Problems it solves**

- Making a deck match company colours and fonts
- Keeping the look in the file so exports and sharing match
- Keeping text readable when brand colours are poor

**Use cases**

- Pick the dark built-in theme for an evening talk
- Apply a saved company brand
- Create a new brand from the Theme menu and apply it
- Rename the deck from the artifact header

## 2. User experience

**Where to find it**

- Web: toolbar button 'Theme' (palette icon); groups 'Themes' and 'Your brands'; item 'New brand' (PresentationWorkspace.tsx:290-325, 488-495)
- Web title: artifact header title field, and 'Rename' in the more menu (ArtifactPreview.tsx:2494,2628-2636)
- Mobile, Desktop, Chrome, VS Code, CLI: no theme control found; mobile viewer reads no theme (PresentationDeckView.tsx uses app theme colours only)

**Before you start**

- Latest, editable version (ArtifactPreview.tsx:1955)
- New brand needs canEditSource (ArtifactPreview.tsx:1961-1965)
- Saved brands load for the panel variant of presentation and document artifacts (ArtifactPreview.tsx:610-614)

**Screens and controls**

- Theme menu with a colour swatch per item and a check on the active one
- 'New brand' opens BrandKitDialog (ArtifactPreview.tsx:3360-3368); on save the brand is applied to the deck
- Artifact title field with inline rename

**Journey**

1. Open a deck
2. Open Theme
3. Choose a built-in theme or a saved brand, or New brand
4. All slides and thumbnails change at once
5. Rename the deck from the artifact header if needed

**What the person sees and gets**

- Slides redraw in the theme; a new deck version is saved
- Footer of each slide shows the title and 'N / total' (SlideView.tsx:191-196)
- Rename failure toast 'That name could not be saved' (ArtifactPreview.tsx:2635)

**Settings**

- Saved brands come from the studio library (kind 'brand') (ArtifactPreview.tsx:595-607)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Built-in themes from deck-themes.json; unknown theme id falls back to the first theme (deck-themes.ts:76-80)
- Brand theme writes theme=custom plus name, bg, text, accent, heading, body into the deck header (deck-themes.ts:112-122; PresentationWorkspace.tsx:314-317)
- Switching theme clears old brand keys (themeMeta, deck-themes.ts:124-127)
- Custom colours are checked: text needs contrast 4.5 against background else a readable colour is chosen; accent needs 3 (deck-themes.ts:81-89)
- Only hex colours and sans/serif/mono fonts accepted (deck-themes.ts:34-43)
- Theme applies to slides, thumbnails, editor, present mode, shapes; HTML and PDF export read the same theme (deck-html.ts, deck-pdf.ts import resolveDeckTheme)
- Title is the artifact title and can be renamed (ArtifactPreview.tsx:2494)

**Incomplete**

- Brand font choice limited to three families
- Brand is copied into the deck, not linked: later edits to a saved brand do not update decks [inferred from copy at PresentationWorkspace.tsx:314]
- Title is not stored in the deck header; it is artifact metadata, so it is not part of the Markdown text [inferred]

**Present but disconnected or switched off**

- Theme and Insert menus are hidden when not editable

**Not available**

- Mobile: deck theme not applied (no reading of deck meta found in PresentationDeckView.tsx; mobile uses renderMarkdown with app colours)
- Desktop Tauri, Chrome, VS Code, CLI: none found

## 4. Required behaviour

**Established requirements**

- The user can choose a visual theme for a deck. (source: brief S30.08)
- The user can apply a brand or design system to a deck. (source: brief S30.09)
- A deck has a title the user can see and set. (source: brief S30.01)
- Design values come from tokens/config rather than hardcoding; no hardcoded values for what the repo models. (source: doc: AGENTS.md section 4)

**Acceptance criteria**

1. Choosing a theme writes theme=<id> into the deck header and re-renders all slides
2. Choosing a saved brand writes theme=custom with name, bg, text, accent, heading, body
3. Unreadable brand text is replaced by black or white
4. Unknown theme id shows the default theme
5. The check mark follows the active theme or brand
6. Theme menu is absent on a read-only version
7. Renaming changes the footer title shown on slides

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile should honour the deck theme to match web [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the deck title in the workspace toolbar
- [proposed] Offer link-to-brand updates

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | deck-themes.ts | `apps/web/features/chat/components/artifacts/presentation/deck-themes.ts` | Resolves theme or brand to colours and fonts; contrast repair |
| config | deck-themes.json | `apps/web/features/chat/components/artifacts/presentation/deck-themes.json` | Built-in theme palette |
| component | PresentationWorkspace themeItems | `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx` | Builds Theme menu and commits meta |
| service | parseDeck / serializeDeck meta | `packages/ui/unified-chat/src/lib/deck-model.ts` | Reads and writes the <!-- deck --> line |
| component | SlideView deckThemeStyle | `apps/web/features/chat/components/artifacts/presentation/SlideView.tsx` | Turns theme into CSS variables |
| component | DeckMenu | `apps/web/features/chat/components/artifacts/presentation/DeckMenu.tsx` | Menu with radio items and swatches |
| component | ArtifactPreview (brands) | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Builds brandThemes from the studio library; hosts BrandKitDialog; title rename |
| component | BrandKitDialog | `apps/web/features/chat/components/artifacts/library/LibraryDialogs.tsx` | Create and save a brand |
| service | deck-html export | `apps/web/features/chat/components/artifacts/presentation/deck-html.ts` | Uses theme in the shared viewer export |
| service | deck-pdf export | `apps/web/features/chat/components/artifacts/presentation/deck-pdf.ts` | Uses theme in the PDF |
| config | Deck.module.css | `apps/web/features/chat/components/artifacts/presentation/Deck.module.css` | Uses --deck-* variables |
| test | PresentationWorkspace.test | `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.test.tsx` | Apply theme and brand tests (lines 51-80) |
| test | deck-model.test (web) | `apps/web/features/chat/components/artifacts/presentation/deck-model.test.ts` | Theme readability, brand repair, fallback (lines 61-91) |
| test | deck-export.test | `apps/web/features/chat/components/artifacts/presentation/deck-export.test.ts` | Themed background in PDF and viewer |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Menu choice builds new meta and the deck is serialized | device | PresentationWorkspace.tsx:290-325; deck-model.ts:27-38 |
| Saved as new artifact content | device | ArtifactPreview.tsx:1153 |
| Saved brands list is loaded from the studio library | our servers | studioLibrary.load at ArtifactPreview.tsx:610-614 [inferred: library is a server list; endpoint not traced] |
| resolveDeckTheme computes colours; CSS variables applied to slides | device | deck-themes.ts:76; SlideView.tsx:19-29 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Theme keys in the deck header line | Inside the artifact content text | Same as artifact content (unknown) | Kept in versions |
| Saved brand items | Studio library (store not traced) | unknown | unknown |

**Models and providers.** None for choosing a theme. An assistant may write the header line when it generates the deck [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Saved brands need the studio library to load; sign-in rule not traced |
| Permissions | Editable latest version only |
| Subscription | none found in the code in the presentation files; library quotas not checked |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code |
| Local mode | Built-in themes work offline on the device. Saved brands depend on the library load, whose Local-mode behaviour is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Invalid colour or font in header | Ignored; defaults used | deck-themes.ts:37-43,81-100 |
| Low contrast brand | Text or accent replaced | deck-themes.ts:83-89 |
| No brands saved | Only built-in themes and 'New brand' | PresentationWorkspace.tsx:303-324 |
| Brand library fails to load | not handled in the code in the workspace; brands list stays empty | ArtifactPreview.tsx:610-614 |
| Rename fails | Toast 'That name could not be saved' | ArtifactPreview.tsx:2635 |
| Accessibility | Swatches are aria-hidden; items are menuitemradio with checked | PresentationWorkspace.tsx:97; DeckMenu.tsx:123 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.test.tsx`: Theme and saved brand applied as saved versions
- `apps/web/features/chat/components/artifacts/presentation/deck-model.test.ts`: Readable theme colours, brand repair, unknown id fallback, round trip of theme line
- `apps/web/features/chat/components/artifacts/presentation/deck-export.test.ts`: Themed background in PDF and HTML
- `packages/ui/unified-chat/src/lib/deck-model.test.ts`: Meta line round trip and quoting

**Test scenarios**

- **Pick a theme**
  1. Open Theme menu
  2. Choose a dark theme
  - Expected: Header line has theme=<id>; slides and thumbnails re-colour; check mark moves
- **Apply brand**
  1. Save a brand in the studio library
  2. Theme, choose the brand under Your brands
  - Expected: Header has theme=custom and name, bg, text, accent, heading, body
- **Bad contrast**
  1. Edit header: theme=custom bg=#ffffff text=#fefefe
  - Expected: Text renders dark/readable
- **Export carries theme**
  1. Apply theme
  2. Download PDF
  - Expected: Pages use the theme background
- **Rename**
  1. Rename the artifact
  - Expected: Slide footer shows new title
- **Mobile**
  1. Open themed deck on phone
  - Expected: Theme not applied (current behaviour); confirm

**Where to look when it fails**

- Inspect the first line of the artifact content for <!-- deck theme=... -->
- toast 'That name could not be saved'
- Not run: no recorded results

**Hands-on test plans**

- Web: [70-qa/test-plans/web/030-presentation-workspace.md](../../70-qa/test-plans/web/030-presentation-workspace.md)

## 10. Gaps and dependencies

- **Mobile ignores deck theme** Affects: Mobile. Evidence: PresentationDeckView.tsx has no resolveDeckTheme. Work needed: Share theme resolution through unified-chat
- **Theme and brand control missing on every app except web** Affects: Mobile, Chrome, VS Code, desktop Tauri. Evidence: grep. Work needed: Product decision
- **Brand is copied, not linked** Affects: Web. Evidence: PresentationWorkspace.tsx:314. Work needed: Decide whether linking is wanted
- **Deck title not editable inside the workspace** Affects: Web. Evidence: title prop only (line 122). Work needed: Optional title field
- Not built on: Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- file:apps/web/features/chat/components/artifacts/presentation/deck-themes.ts
- file:apps/web/features/chat/components/artifacts/presentation/deck-themes.json
- file:packages/ui/unified-chat/src/lib/deck-model.ts
- SYS-shared-ui-and-design
- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- F030-01

## Unknown

- Where the studio library stores brands and whether it is gated by a plan
- Whether the Electron desktop shows the same Theme menu (inferred from hosted web only)
- Whether mobile has any way to apply a deck theme
- Whether the assistant is told to write the deck header when generating (not traced)
