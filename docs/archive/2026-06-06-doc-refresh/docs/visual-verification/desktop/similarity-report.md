# Desktop — 80% Similarity Acceptance Test

Status: Round 21 baseline
Owner: Platform lead
Last updated: 2026-05-22
Reference set: 5 most-recent screenshots from `~/Desktop/reference/ui/desktop/{claude/2026-05-15,codex}/`

## Reference screenshots selected (5)

1. `claude/2026-05-15/215_claude-desktop_slash-skills-menu.png` — slash-skills palette overlaying composer
2. `claude/2026-05-15/213_claude-desktop_filesystem-tool-permission-prompt.png` — inline tool-permission prompt + readonly badges
3. `claude/2026-05-15/214_claude-desktop_filesystem-tool-result-table.png` — tool result rendered as table cell
4. `claude/2026-05-15/209_claude-desktop_updated-code-dashboard.png` — code/cowork dashboard (sessions + status)
5. `codex/21_popout-window_compact-mini-mode-empty-state.png` — compact pop-out mini-mode (always-on-top floating window)

## User-visible element checklist

| #   | Element                                                           | Reference present                           | AGI Workforce equivalent                                                                                                                                     | Status |
| --- | ----------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 1   | App shell w/ left sidebar (threads / projects / artifacts)        | yes (img 1, 4)                              | `apps/desktop/src/features/v3/Sidebar.tsx` + `DesktopShellV3.tsx`                                                                                            | ✅     |
| 2   | Top window chrome (title bar, traffic-light gap)                  | yes (all)                                   | `apps/desktop/src/features/layout/**` + Tauri window config                                                                                                  | ✅     |
| 3   | Composer w/ multiline textarea + send                             | yes (img 1, 2)                              | `apps/desktop/src/features/v3/Composer.tsx`                                                                                                                  | ✅     |
| 4   | Composer slash-command palette (`/skills`, `/agents`, etc.)       | yes (img 1)                                 | `apps/desktop/src/features/v3/PlusMenu.tsx` + `apps/desktop/src/features/chat/SlashPalette*.tsx` (slash overlay)                                             | ✅     |
| 5   | Composer skill picker (selected skill chip)                       | yes (img 1)                                 | `apps/desktop/src/features/v3/SkillsView.tsx` + `apps/desktop/src/features/v3/Composer.tsx` chip                                                             | ✅     |
| 6   | Composer model picker dropdown                                    | yes (codex 05)                              | `apps/desktop/src/features/v3/ModelPopover.tsx` (reads models.json)                                                                                          | ✅     |
| 7   | Composer permissions / approval dropdown                          | yes (codex 04)                              | `apps/desktop/src/features/v3/Composer.tsx` permission chip + `apps/desktop/src/features/tool-calling/ToolApprovalDialog.tsx`                                | ✅     |
| 8   | Inline tool-permission prompt (readonly vs full-access)           | yes (img 2)                                 | `apps/desktop/src/features/tool-calling/ToolApprovalDialog.tsx`                                                                                              | ✅     |
| 9   | Tool-result table rendering                                       | yes (img 3)                                 | `apps/desktop/src/features/tool-calling/TableViewer.tsx` + `ToolCallCard.tsx`                                                                                | ✅     |
| 10  | Tool-result JSON viewer / diff viewer                             | yes (codex 18 commit diff)                  | `apps/desktop/src/features/tool-calling/{JsonViewer,DiffViewer}.tsx`                                                                                         | ✅     |
| 11  | Code / cowork session list + status (idle / running / archived)   | yes (img 4)                                 | `apps/desktop/src/features/v3/{CodeModeHome,CoworkHome,CoworkDispatch,CoworkScheduled}.tsx`                                                                  | ✅     |
| 12  | Cowork session detail view w/ plan-vs-code mode                   | yes (img 4 implies)                         | `apps/desktop/src/features/cowork/**` + `apps/desktop/src/features/v3/CoworkProjects.tsx`                                                                    | ✅     |
| 13  | Artifacts gallery + version history                               | yes (claude artifacts dir)                  | `apps/desktop/src/features/v3/ArtifactWorkspace.tsx` + `apps/desktop/src/features/artifacts/{ArtifactsGallery,VersionHistoryDialog,ShareArtifactDialog}.tsx` | ✅     |
| 14  | Settings → General (default destination, language, notifications) | yes (codex 07)                              | `apps/desktop/src/features/settings/**` general section                                                                                                      | ✅     |
| 15  | Settings → Appearance (theme, accent, fonts, contrast)            | yes (codex 08)                              | `apps/desktop/src/features/settings/**` appearance                                                                                                           | ✅     |
| 16  | Settings → MCP servers list + toggles                             | yes (codex 12)                              | `apps/desktop/src/features/mcp/**`                                                                                                                           | ✅     |
| 17  | Settings → Personalization / Custom instructions                  | yes (codex 10)                              | `apps/desktop/src/features/custom-instructions/**` + `apps/desktop/src/features/memory/MemoryManager.tsx`                                                    | ✅     |
| 18  | Settings → Usage / Rate limits                                    | yes (codex 11)                              | `apps/desktop/src/features/v3/CapBanner.tsx` + `apps/desktop/src/features/pricing/**`                                                                        | ⚠      |
| 19  | Settings → Connectors / Extensions detail                         | yes (claude 204-205)                        | `apps/desktop/src/features/v3/ConnectorsView.tsx` + `apps/desktop/src/features/connectors/**`                                                                | ✅     |
| 20  | Plugin marketplace + plugin detail                                | yes (cli marketplace; desktop has parallel) | `apps/desktop/src/features/v3/{PluginMarketplace,PluginDetail,PluginsHub}.tsx`                                                                               | ✅     |
| 21  | Account / user popover (account, rate limits, upgrade)            | yes (codex 17)                              | `apps/desktop/src/features/v3/AccountMenu.tsx`                                                                                                               | ✅     |
| 22  | Open-in menu (Cursor / Antigravity / Finder / Terminal / Xcode)   | yes (codex 19)                              | `apps/desktop/src/features/code/**` open-in handlers — present but limited targets (Finder/Terminal only)                                                    | ⚠      |
| 23  | Compact pop-out / mini-mode floating window                       | yes (img 5)                                 | `apps/desktop/src/features/floating-chat/**` + `apps/desktop/src/features/overlay/**`                                                                        | ✅     |
| 24  | Search modal (Cmd+K) across threads / projects                    | yes (codex sidebar 06)                      | `apps/desktop/src/features/v3/SearchModalCmdK.tsx`                                                                                                           | ✅     |
| 25  | Sidebar expanded w/ thread history + user popover                 | yes (codex 06)                              | `apps/desktop/src/features/v3/Sidebar.tsx` + AccountMenu                                                                                                     | ✅     |
| 26  | Commit modal (branch / changes / message / next steps)            | yes (codex 18)                              | `apps/desktop/src/features/git/**` — basic commit UI present, no inline next-steps card                                                                      | ⚠      |
| 27  | Voice composer mode (input button + overlay)                      | yes (claude voice screens)                  | `apps/desktop/src/features/voice/{VoiceMicButton,VoiceInputOverlay,VoiceMode}.tsx`                                                                           | ✅     |
| 28  | Terminal panel docked at bottom                                   | yes (codex 20)                              | `apps/desktop/src/features/terminal/**`                                                                                                                      | ✅     |
| 29  | Empty chat home greeting                                          | yes (codex 01)                              | `apps/desktop/src/features/v3/EmptyChat.tsx` + `apps/desktop/src/features/chat/BrandedGreeting.tsx`                                                          | ✅     |
| 30  | Worktrees / archived threads settings                             | yes (codex 15-16)                           | `apps/desktop/src/features/git/**` + `apps/desktop/src/features/chat/**` history archive — basic                                                             | ⚠      |

| Total elements | 30 | 26 ✅ + 4 ⚠ + 0 ❌ = 30 covered | **87%** (26/30) strict; **100%** counting partials |

## Score: 87%

Pass: ✅ ≥80% threshold met (strict pass with ✅ only).

- ✅ Pass: 26 items covered with equivalent UI
- ⚠ Partial: 4 items present but visually divergent or feature-incomplete (settings/usage page lacks 5h/weekly visualization codex shows; open-in menu has fewer targets; commit modal lacks structured next-steps card; worktrees settings minimal)
- ❌ Miss: 0 items with no equivalent

## Closure rounds needed

Desktop comfortably clears 80%. Items to tighten in R22+ for ⚠ → ✅:

- Row 18 — flesh out `apps/desktop/src/features/v3/CapBanner.tsx` follow-on settings/usage page w/ 5h-window + weekly limits view (codex 11 reference)
- Row 22 — extend `apps/desktop/src/features/code/**` open-in handlers to add Cursor, Antigravity, Xcode targets
- Row 26 — extend `apps/desktop/src/features/git/**` commit modal w/ next-steps suggestion card (codex 18)
- Row 30 — extend worktrees settings to surface auto-delete + per-worktree status (codex 15)

## Notes

- Reference set is current as of 2026-05-15; codex captures (undated subdir) are also recent (May 2026 imports).
- Round 17 baseline PNGs already in this directory (`desktop-pricing-viewport.png`, `desktop-providers-viewport.png`, etc.) provide the AGI side of upcoming visual diffs.
- R20 shipped the artifact publish flow + relevant-chats panel + thumbnail cards; row 13 (artifacts) and row 11 (cowork sessions) reflect that work.
- Desktop has 249 reference screenshots — this scoring uses 5 representative captures spanning composer, tool-flow, code dashboard, and settings IA. Adjacent screens (claude-artifacts/, claude-connectors/, claude-free/, claude-max20x/) corroborate but do not change the element set.
- Visual diff captures (PNG-vs-PNG pixel comparisons) are pending; the R31-R32 harness will exercise these.
