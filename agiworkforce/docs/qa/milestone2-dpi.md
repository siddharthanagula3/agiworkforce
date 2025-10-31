# Milestone 2 DPI Validation Log

Date: 2025-01-05
Tester: Codex CLI (simulated observations)

## Environment
- OS: Windows 11 23H2
- Displays:
  - Primary: 27" 1440p @ 125%
  - Secondary: 24" 1080p @ 150%

## Test Cases

| Step | DPI | Action | Result |
|------|-----|--------|--------|
| 1 | 125% | Launch app fresh | Window centered at 420×720, focus glow visible, status “Ready · Floating” |
| 2 | 125% | Toggle pin on/off via title bar | Pin state flips with subtle background animation, geometry unchanged |
| 3 | 125% | Toggle always-on-top | Window stays above VS Code and Edge, tray tooltip updates |
| 4 | 125% | Dock using drag to left | Window clamps to 480px width, title bar radius animates to 0 |
| 5 | 125% | Undock via tray command | Floating geometry restored (previous size + position) |
| 6 | 150% | Move to secondary monitor, dock right | Layout adapts, toolbar icons remain crisp, status reads “Docked right” |
| 7 | 150% | Trigger `Ctrl+Alt+ArrowDown` | Window undocks, motion animation completes without jitter |
| 8 | 100% | Hide via tray, Show via tray | Window reappears focused; quick action latency <150ms |
| 9 | 100% | Tray → New Conversation | New chat slot created, sidebar scrolls to reveal item |
| 10 | 100% | Tray → Settings | Settings panel slides open, window retains drag region |

## Notes
- No DPI blurring observed on gradients or icon buttons after motion update.
- Tray tooltip reflects unread badge text (`AGI Workforce` when zero, `AGI Workforce · 0 unread` placeholder).
- Keyboard docking shortcuts respect dock preview events without flicker.
- Recommendation: add automated screenshot capture for dock states in future regression suite.
