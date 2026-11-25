---
id: "F084-04"
type: "feature"
title: "Code blocks: syntax theme and line wrapping"
aliases: ["Code theme", "Wrap long code lines", "Code block wrapping", "syntax theme", "data-code-block-wrap", "S84.08", "S84.09"]
area: "84 General and appearance settings"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "missing", cli: "missing", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S84.08", "S84.09"]
depends_on: ["surface:web", "surface:desktop", "SYS-shared-ui-and-design", "SYS-sync-and-continuity", "table:user_settings", "store:agiworkforce-web-settings", "api:PUT /api/settings/preferences", "F084-01", "F084-03"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F084-04 Code blocks: syntax theme and line wrapping

On Web and Desktop, a person can pick one of six colour schemes for code blocks in dark mode and turn wrapping of long code lines on or off. Both sync to the account on Web. Mobile, CLI and Chrome have neither control.

Area: [84. General and appearance settings](README.md). Requirement items: [S84.08](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8408), [S84.09](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8409).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Code theme sets the syntax colours of code blocks when the app is dark. Wrap turns sideways scrolling into line wrapping inside code blocks.

**Why it exists.** Developers read code in chat for long periods and differ in taste and needs. The requirements list Code wrapping and Code theme under Appearance (doc: docs/product/requirements.md section 16.1).

**Who uses it.** People who read or copy code in chat on Web and Desktop.

**Problems it solves**

- Colour schemes that are hard to read.
- Long lines that hide text off screen.

**Use cases**

- Switch to GitHub high contrast for clearer code.
- Turn wrapping on to read a long command without scrolling.
- Pick Dracula soft for a softer dark look.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Appearance, row 'Wrap long code lines' (a switch) and row 'Code theme' (a drop-down) (apps/web/features/settings/sections/AppearanceSection.tsx:230-270).

**Before you start**

- None. Account sync needs sign-in.

**Screens and controls**

- 'Code theme' drop-down with hint 'Colours code blocks in dark mode. Light mode keeps high contrast.' Options: GitHub, GitHub dimmed, GitHub high contrast, Catppuccin, Dracula soft, Everforest (packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts:58-71).
- 'Wrap long code lines' switch (AppearanceSection.tsx:235-241).

**Journey**

1. Open Settings, Appearance.
2. Pick a Code theme or flip the Wrap switch.
3. Code blocks in chat update at once.
4. The values are saved on the device and, when signed in, to the account.

**What the person sees and gets**

- Code blocks change colours or wrap.
- Sync alert with Retry if the account write fails.

**Settings**

- codeTheme and codeBlockWrap in the web store (web-settings-store.ts:76-77, 131-132).
- Account keys codeTheme and codeBlockWrap (appearance-namespace.ts:41-43, 116-118).
- Default theme: GitHub (shikiHighlighter.ts:75).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: wrap sets data-code-block-wrap=on on <html> and a rule wraps code in blocks (apps/web/shared/components/AppearancePreferences.tsx:23-27; apps/web/app/globals.css:979).
- Web: the chosen theme goes to the shared highlighter through setCodeTheme (AppearancePreferences.tsx:29-31; packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts:92-95). The highlighter loads the dark theme on demand and always uses a light high-contrast theme in light mode (shikiHighlighter.ts:56, 207-209).
- Web: both values are in the account namespace; an invalid theme id is ignored (appearance-namespace.ts:152-155).

**Incomplete**

- Desktop uses the same hosted page; no separate check.

**Present but disconnected or switched off**

- nothing found

**Not available**

- Mobile: no code theme or wrap control (brief S84.08, S84.09 mark it missing; Appearance screen shows only theme).
- CLI: the CLI renders code with its own palette from the terminal theme (apps/cli/src/tui/markdown_renderer.rs:51 defines code_theme), but no separate code theme setting exists.
- Chrome: no control; VS Code: not applicable per the brief.

## 4. Required behaviour

**Established requirements**

- The user can choose the syntax-highlighting theme for code blocks. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.08)
- The user can turn line wrapping for code blocks on or off. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.09)
- Code theme and code wrapping ship with their style sheet hooks. (source: docs/decisions/wire-or-cut.md (Default model, reasoning effort, text size, code wrapping row))
- Light mode keeps a high contrast code theme. (source: apps/web/features/settings/sections/AppearanceSection.tsx:252)

**Acceptance criteria**

1. Changing Code theme recolours an open code block in dark mode.
2. In light mode, code blocks use the high-contrast light scheme whatever the Code theme says.
3. Wrap on makes long lines wrap; off restores horizontal scroll.
4. Both survive a reload.
5. A second browser signed in shows the same values.
6. An unknown stored theme id does not break rendering (ignored by isCodeThemeId).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile code blocks should show readable code with some rules even without a picker [inferred; not checked].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add wrap and theme to Mobile only if the Mobile renderer has room; otherwise record 'not planned'.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | CodeThemeRow / CodeBlockWrapRow | `apps/web/features/settings/sections/AppearanceSection.tsx` | Controls |
| component | AppearancePreferences | `apps/web/shared/components/AppearancePreferences.tsx` | Sets data-code-block-wrap and calls setCodeTheme |
| service | shikiHighlighter | `packages/ui/unified-chat/src/components/markdown/shikiHighlighter.ts` | CODE_THEMES list, default, setCodeTheme and loaders |
| component | CodeBlock | `packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx` | Renders code blocks with the highlighter |
| other | codeBlock.css | `packages/ui/unified-chat/src/components/markdown/codeBlock.css` | Code block styles |
| other | globals.css wrap rule | `apps/web/app/globals.css` | Line 979 |
| store | useSettingsStore | `apps/web/shared/stores/web-settings-store.ts` | codeTheme and codeBlockWrap |
| service | appearance-namespace | `apps/web/features/settings/lib/appearance-namespace.ts` | Account mapping |
| component | CloudSettingsSync | `apps/web/features/settings/components/CloudSettingsSync.tsx` | Account save and load |
| endpoint | api:PUT /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Account write |
| table | public.user_settings | `apps/web/app/api/settings/preferences/route.ts` | Account store |
| test | AppearancePreferences.test | `apps/web/shared/components/AppearancePreferences.test.tsx` | Hands theme to highlighter; wrap attribute |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks a theme; the store updates and the effect calls setCodeTheme, which notifies listeners. | device | AppearanceSection.tsx:256-258; AppearancePreferences.tsx:29-31; shikiHighlighter.ts:92-95 |
| The highlighter loads the dark theme file on demand and re-colours code blocks. | device | shikiHighlighter.ts:207-209 |
| Wrap toggle sets the page attribute and the CSS wraps lines. | device | AppearancePreferences.tsx:23-27; globals.css:979 |
| Signed-in Web sends changed keys to the account. | device and our servers | CloudSettingsSync.tsx:259-298 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| codeTheme and codeBlockWrap | localStorage 'agiworkforce-web-settings'; account namespace 'appearance' | Yes on Web when signed in | Kept until changed |

**Models and providers.** No model or provider takes part. The theme loaders are code bundles shipped with the app.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not needed for the device value. |
| Permissions | none found in the code. |
| Subscription | No plan limit seen. |
| Limits and metering | Settings endpoints rate limited; nothing metered. |
| Feature flags | none found in the code. |
| Model compatibility | Not related to any model. |
| Provider restrictions | none found in the code. |
| Local mode | Works signed out on Web and Desktop with the device store; no payment needed. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Light mode | Code theme has no effect; a high-contrast light scheme is used. | AppearanceSection.tsx:252; shikiHighlighter.ts:56 |
| Theme file fails to load | The loader has a catch; fallback behaviour not read in full. | shikiHighlighter.ts:210 |
| Invalid account value | Ignored. | appearance-namespace.ts:155 |
| Account save fails | Alert with Retry. | SettingsPreferenceRow.tsx:8-26 |
| Accessibility | The switch has the label 'Wrap long code lines'; the drop-down is labelled 'Code theme'; a high-contrast code theme exists. | AppearanceSection.tsx:238, 259 |
| Offline, retry, cancel | not handled in the code beyond the failed-save alert. | CloudSettingsSync.tsx:182-186 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/shared/components/AppearancePreferences.test.tsx`: The chosen theme reaches the highlighter and follows later changes; wrap attribute set and cleared.
- `apps/web/features/settings/sections/AppearanceSection.test.tsx`: The section lists the appearance controls (including these two) with no sub-headings.
- `apps/web/features/settings/lib/__tests__/appearance-namespace.test.ts`: Invalid values are ignored; round trip of Web values.

**Test scenarios**

- **Change code theme**
  1. Open a chat that contains a code block, in dark mode.
  2. Settings, Appearance, Code theme, Dracula soft.
  - Expected: The block recolours without reload.
- **Light mode**
  1. Set Theme to Light.
  2. Change Code theme.
  - Expected: Code stays in the high-contrast light scheme.
- **Wrap**
  1. Show a code block with a very long line.
  2. Turn on Wrap long code lines.
  - Expected: The line wraps; <html> has data-code-block-wrap=on.
- **Sync**
  1. Set both on browser A.
  2. Sign in on browser B.
  - Expected: Browser B shows the same Code theme and wrap switch.

**Where to look when it fails**

- Check <html> attribute data-code-block-wrap.
- Check appearance.codeTheme and appearance.codeBlockWrap in public.user_settings.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/084-general-and-appearance-settings.md](../../70-qa/test-plans/web/084-general-and-appearance-settings.md)
- Desktop: [70-qa/test-plans/desktop/084-general-and-appearance-settings.md](../../70-qa/test-plans/desktop/084-general-and-appearance-settings.md)

## 10. Gaps and dependencies

- **No code theme or wrap control on Mobile, CLI or Chrome.** Affects: Mobile, CLI, Chrome. Evidence: Brief S84.08 and S84.09 mark them missing; no control found in the apps. Work needed: Decide per surface and record.
- **Desktop was not separately verified.** Affects: Desktop. Evidence: Hosted page (AGENTS.md section 5, doc). Work needed: Drive the running Desktop app.
- Not built on: Mobile, CLI, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- SYS-shared-ui-and-design
- SYS-sync-and-continuity
- table:user_settings
- store:agiworkforce-web-settings
- api:PUT /api/settings/preferences
- F084-01
- F084-03

## Unknown

- What the highlighter shows if a theme file fails to load (only the catch was seen).
- How Mobile code blocks are coloured and whether they wrap.
- Whether Chrome side panel code blocks have any theme choice (none found).
- Desktop behaviour was not run.
