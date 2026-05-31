# Mislabel rename proposals — Round 1

**Reported by**: all 8 reference analysts in their per-report "Mislabel report" sections.
**Verdict**: zero mislabels found across 473 image files.

## Audit results per analyst

| Analyst                      | Image set                                                                                                                                      | Mislabels found |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| ref-claude-desktop           | `ui/claude/claude-desktop/` (39) + `claude-desktop-captures-2026-05-13/001-023` (23)                                                           | 0               |
| ref-claude-extended-settings | `claude-desktop-captures-2026-05-13/extended/024-043` (20) + `ui-capture-runs/screenshots/claude-desktop/` (sample 25)                         | 0               |
| ref-claude-artifacts         | `ui/claude/claude-chat-artifacts-and-tools/` (27) + `ui-capture-runs/screenshots/claude-cursor/` (sample 15)                                   | 0               |
| ref-claude-connectors        | `ui/claude/claude-connectors-directory/` (19) + `ui-capture-runs/screenshots/enterprise-admin/`                                                | 0               |
| ref-chatgpt-codex-desktop    | `ui/chatgpt-desktop/` (18) + `ui/codex-desktop/` (21) + `ui-capture-runs/screenshots/codex/` (sample 15)                                       | 0               |
| ref-gemini-perplexity        | `ui/gemini-chat/` (13) + `ui/perplexity/` (26) + `ui/perplexity/perplexity-comet/` (4) + `ui-capture-runs/screenshots/{gemini,comet-browser}/` | 0               |
| ref-cli-tools                | `ui/codex-cli/` (15) + `ui/gemini-cli/` (16) + `ui/claude-code/` (5) + `ui-capture-runs/screenshots/{claude-code,opencode}/`                   | 0               |
| ref-extensions-mobile        | `ui/claude/{claude-chrome-extension,claude-vscode-extension}/` (7+9) + `ui-capture-runs/screenshots/{claude-chrome,claude-mobile}/`            | 0               |

## Why this came back clean

1. `ui/INDEX.md` was clearly authored as the canonical curated set — naming convention `NN_<view>_<feature>.png` is consistent, descriptive, and verified during the original capture.
2. The `ui-capture-runs/` set is tool-generated with timestamped names — these are not user-curated labels to verify.
3. `claude-desktop-captures-2026-05-13/` numbered sequence (001–043) describes views accurately based on the May 2026 capture session.

## No `mv` commands proposed

Nothing to rename. The reference library is consistent.

If future capture passes are added to `~/Desktop/reference/`, re-run this analysis on the new subfolders. Tag this audit complete.
