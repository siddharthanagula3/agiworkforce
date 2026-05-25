# Batch 25 — Chrome Extension Marketing Accuracy Audit

Auditor: Claude Opus 4.7 (1M context)
Date: 2026-05-24
Marketing page: `apps/web/app/chrome-extension/page.tsx`
Reference images: 18 PNGs from `~/Desktop/reference/ui/chrome-extension/claude/`

---

## Summary

The marketing page describes an AGI-branded Chrome extension with a native-messaging bridge to the AGI desktop app. The reference screenshots are of **Claude's** official Chrome extension ("Claude in Chrome"), which is Anthropic's product — not AGI's. The marketing page claims features (platform assistants for Slack/Gmail/Calendar/Docs/GitHub, job autofill on LinkedIn/Lever, native messaging bridge on localhost:8787) that have **no evidence** in the reference screenshots and may not exist in the AGI codebase. Several features visible in the Claude screenshots (model selector, quick mode, action permissions, shortcuts, workflow recording, site blocking, desktop pairing) are not mentioned on the marketing page at all.

**Critical finding:** The marketing page appears to describe a product that does not yet match the reference screenshots. The screenshots are from Claude's Chrome extension (Anthropic), not from an AGI-branded extension. Marketing claims should be verified against the actual AGI extension build.

---

## Per-Image Analysis

## IMG: 01_sidebar-extension_empty-state_paid-plan-required-banner.png
- Feature depicted: Side panel open on YouTube showing empty chat state with "Claude in Chrome requires a paid plan" banner and "Upgrade plan" link at bottom
- Image path: /Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/01_sidebar-extension_empty-state_paid-plan-required-banner.png
- Client type: chrome-ext
- Marketing page: apps/web/app/chrome-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Marketing page does not mention any paid plan requirement or upgrade flow
  - The extension shown is "Claude" branded (Anthropic), not AGI branded
  - Side panel UI is visible, which marketing does describe generically as "side panel"
  - No mention of the "Sonnet 4.6" default model shown in the selector

## IMG: 02_sidebar-extension_action-permission-dropdown_ask-vs-act.png
- Feature depicted: Action permission dropdown with two modes: "Ask before acting" (Claude aligns on its approach before taking actions) and "Act without asking" (Claude takes actions without asking for permission)
- Image path: /Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/02_sidebar-extension_action-permission-dropdown_ask-vs-act.png
- Client type: chrome-ext
- Marketing page: apps/web/app/chrome-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Marketing page does not mention action permission controls (ask vs act)
  - This is a key safety/agency feature absent from marketing copy
  - The bottom bar shows "Ask before acting" dropdown, sparkles icon, plus icon, and send button — none described in marketing

## IMG: 03_sidebar-extension_attachment-menu_screenshot-image-options.png
- Feature depicted: Attachment menu popup with two options: "Take a screenshot" and "Add an image" — allowing visual input to the AI
- Image path: /Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/03_sidebar-extension_attachment-menu_screenshot-image-options.png
- Client type: chrome-ext
- Marketing page: apps/web/app/chrome-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Marketing page does not mention screenshot capture or image attachment capabilities
  - These are significant features for a browser-based AI assistant (visual context)
  - The "paid plan required" banner is also visible here

## IMG: 04_sidebar-extension_more-options-menu_task-settings-language.png
- Feature depicted: Three-dot more-options menu showing: "Convert to task", "Settings", and "Language" options
- Image path: /Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/04_sidebar-extension_more-options-menu_task-settings-language.png
- Client type: chrome-ext
- Marketing page: apps/web/app/chrome-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Marketing page does not mention "Convert to task" feature (converting chats to background tasks)
  - No mention of settings or language selection in the extension
  - "Convert to task" is a significant capability suggesting background task execution

## IMG: 05_sidebar-extension_model-selector-dropdown_opus-sonnet-haiku.png
- Feature depicted: Model selector dropdown showing three options: Opus 4.6 ("Most capable for ambitious work"), Sonnet 4.6 ("Most efficient for everyday tasks", currently selected), and Haiku 4.5 ("Fastest for quick answers")
- Image path: /Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/05_sidebar-extension_model-selector-dropdown_opus-sonnet-haiku.png
- Client type: chrome-ext
- Marketing page: apps/web/app/chrome-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Marketing page does not mention model selection capability
  - No mention of Opus/Sonnet/Haiku model tiers
  - The model selector is a prominent top-level UI element in the extension
  - Note: These are Claude/Anthropic model names, not AGI model references

## IMG: 06_sidebar-extension_quick-mode-modal_model-options.png
- Feature depicted: Quick mode experimental modal explaining it is "experimental" and "still being evaluated." Options: "Enable with Haiku 4.5" and "Enable with Opus 4.6 (fast mode)" with note about premium billing, plus "Go back" button
- Image path: /Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/06_sidebar-extension_quick-mode-modal_model-options.png
- Client type: chrome-ext
- Marketing page: apps/web/app/chrome-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Marketing page does not mention quick mode feature
  - No mention of experimental features or fast mode options
  - Quick mode's premium/extra-usage billing model not documented in marketing

## IMG: 07_sidebar-extension_quick-mode-active_haiku-act-without-asking.png
- Feature depicted: Quick mode active state — model switched to "Haiku 4.5" with lightning bolt icon highlighted (indicating quick mode on), tooltip showing "Quick mode", action set to "Act without asking"
- Image path: /Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/07_sidebar-extension_quick-mode-active_haiku-act-without-asking.png
- Client type: chrome-ext
- Marketing page: apps/web/app/chrome-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Marketing page does not mention quick mode or its visual indicators
  - No description of the Haiku fast-response mode for browser tasks
  - The "Act without asking" mode in quick mode is a significant UX pattern not documented

## IMG: 401_claude-chrome_side-panel-first-open.png
- Feature depicted: Full browser view showing Claude side panel opened alongside example.com — the side panel shows "Claude" header with pin icon, close button, and Sonnet 4.6 model selector. Clean first-open state
- Image path: /Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/2026-05-15/401_claude-chrome_side-panel-first-open.png
- Client type: chrome-ext
- Marketing page: apps/web/app/chrome-extension/page.tsx
- Accuracy: inaccurate
- Marketing gaps:
  - Marketing describes "side panel that lives on top of any tab" — screenshot confirms side panel concept, but it is Claude's, not AGI's
  - Marketing says "No model runs in the browser" — Claude's extension also appears to run server-side, but the architecture described (native messaging to localhost:8787) is AGI-specific
  - The pin icon for keeping panel open is not mentioned in marketing

## IMG: 402_claude-chrome_side-panel-login-or-connected.png
- Feature depicted: Side panel with three-dot menu open showing "Convert to task", "Settings", and "Language" options — same as image 04 but in full browser view (example.com visible)
- Image path: /Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/2026-05-15/402_claude-chrome_side-panel-login-or-connected.png
- Client type: chrome-ext
- Marketing page: apps/web/app/chrome-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Same gaps as image 04 — Convert to task, Settings, Language not in marketing
  - Full browser context visible: Claude tab in tab bar, side panel adjacent to page content

## IMG: 403_claude-chrome_pairing-prompt.png
- Feature depicted: "Claude Desktop wants to connect" pairing prompt — asks user to name this browser (placeholder: "Work laptop", "Personal Chrome") with Ignore and Connect buttons. URL shows chrome-extension://...pairing.html
- Image path: /Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/2026-05-15/403_claude-chrome_pairing-prompt.png
- Client type: chrome-ext
- Marketing page: apps/web/app/chrome-extension/page.tsx
- Accuracy: inaccurate
- Marketing gaps:
  - Marketing mentions "Pair with desktop" as a CTA link but does not describe the pairing flow
  - The actual pairing prompt shows "Claude Desktop wants to connect" — this is Claude's desktop-to-browser pairing, not AGI's
  - Marketing's architecture section describes "native messaging bridge" generically but the actual UX (naming browsers, connect/ignore) is not described
  - No mention of multi-browser identification capability shown in the pairing prompt

## IMG: 404_claude-chrome_permissions-page.png
- Feature depicted: "Claude in Chrome settings" page with left nav (Permissions, Shortcuts, Options, Log out). Content shows: Notifications section with "Task completion notifications" toggle (on), Microphone section with "Allow Microphone Access" button for voice narration during workflow recording, "Your approved sites" section
- Image path: /Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/2026-05-15/404_claude-chrome_permissions-page.png
- Client type: chrome-ext
- Marketing page: apps/web/app/chrome-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Marketing does not mention notifications for task completion
  - No mention of microphone/voice narration for workflow recording
  - No mention of per-site approval system ("Your approved sites")
  - The settings architecture (Permissions, Shortcuts, Options) is not described
  - Voice-enabled workflow recording is a distinctive feature not marketed

## IMG: 406_claude-chrome_site-permission-action-prompt.png
- Feature depicted: Active task in side panel — Claude has been asked to click a link on example.com. Shows "New permissions required" overlay: "Claude wants to read page content on: example.net" with options "Allow this action", "Decline", and "Always allow actions on this site" (browse, click, and type). Also shows "Stop Claude" button at bottom
- Image path: /Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/2026-05-15/406_claude-chrome_site-permission-action-prompt.png
- Client type: chrome-ext
- Marketing page: apps/web/app/chrome-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Marketing does not describe the granular per-site permission system
  - No mention of the "Allow this action" / "Decline" / "Always allow" permission model
  - No mention of the "Stop Claude" button for halting active tasks
  - The permission system is a critical safety/trust feature — key for marketing trust messaging
  - Marketing says extension "reads the active tab" but doesn't explain the permission/consent layer

## IMG: 409_claude-chrome_blocked-sensitive-site.png
- Feature depicted: "Page Blocked" screen — "The content on this page isn't available when Claude is active for safety reasons." Side panel shows shield icon with "Can't access this page" / "Claude cannot assist with the content on this page"
- Image path: /Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/2026-05-15/409_claude-chrome_blocked-sensitive-site.png
- Client type: chrome-ext
- Marketing page: apps/web/app/chrome-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Marketing does not mention sensitive site blocking or safety restrictions
  - No mention of the site-level content safety system
  - This is an important trust/safety feature that could strengthen marketing messaging
  - The dual display (page content replaced + side panel message) is not described

## IMG: 413_claude-chrome_shortcuts-list.png
- Feature depicted: Shortcuts settings page — "Type / in the chat to use shortcuts or run them on schedule". Shows one shortcut card: "/ apply" — "apply jobs for recently funded at startups with a least 30 members in it, funding amount should be more than 1". Also shows "Create shortcut" button
- Image path: /Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/2026-05-15/413_claude-chrome_shortcuts-list.png
- Client type: chrome-ext
- Marketing page: apps/web/app/chrome-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Marketing does not mention the shortcuts/slash-commands system
  - No mention of scheduled shortcuts (the page says "run them on schedule")
  - No mention of custom prompt templates (the "/ apply" example is a saved prompt)
  - Scheduling capability is a significant automation feature not marketed

## IMG: 414_claude-chrome_record-workflow-entry.png
- Feature depicted: "Create shortcut" modal with fields: Name (prefixed with /), Prompt (text area), "Start from" URL field, and Schedule toggle. Cancel and "Create shortcut" buttons
- Image path: /Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/2026-05-15/414_claude-chrome_record-workflow-entry.png
- Client type: chrome-ext
- Marketing page: apps/web/app/chrome-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Marketing does not describe shortcut creation UI
  - No mention of URL-based starting points for automated workflows
  - No mention of the scheduling toggle for recurring automation
  - The create-shortcut flow combines prompt templates + start URL + scheduling — a powerful automation system not marketed

## IMG: 415_claude-chrome_record-workflow-mic-permission.png
- Feature depicted: Browser microphone permission dialog over the permissions settings page — "Claude wants to: Use available microphones (2)" showing detected mics (built-in + iPhone). Options: "Allow while visiting the site", "Allow this time", "Never allow". Background shows the Permissions settings page with "Recording..." button visible
- Image path: /Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/2026-05-15/415_claude-chrome_record-workflow-mic-permission.png
- Client type: chrome-ext
- Marketing page: apps/web/app/chrome-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Marketing does not mention voice/microphone workflow recording capability
  - No mention of speech-to-text for narrating workflows
  - The "Recording..." button state suggests active workflow recording via voice — a significant UX feature
  - Multi-microphone support (built-in + external devices) not mentioned

## IMG: 416_claude-chrome_reconnect-page.png
- Feature depicted: Claude's reconnect/login page showing "Think fast, build faster" headline with "Brainstorm in chat, build in Cowork" subtitle. Login form with "Continue with Google" and email options, plus "Download desktop app" button with Apple icon
- Image path: /Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/2026-05-15/416_claude-chrome_reconnect-page.png
- Client type: chrome-ext
- Marketing page: apps/web/app/chrome-extension/page.tsx
- Accuracy: inaccurate
- Marketing gaps:
  - This is Claude/Anthropic's login page, not AGI's
  - Marketing page's "Install dev build" CTA does not describe an auth/login flow
  - The "Download desktop app" button confirms the extension requires a desktop companion — marketing does mention this architecture but not the auth requirement
  - "Think fast, build faster" and "Brainstorm in chat, build in Cowork" are Claude's taglines, not AGI's

## IMG: 417_claude-chrome_options-page.png
- Feature depicted: "Claude in Chrome settings" options page (same permissions page as 404) shown with Claude side panel open alongside. Side panel shows an active task with 11 steps, including "Created a plan", multiple "Batch" actions, and error states ("Navigation to this domain is not allowed", "Stopped on error")
- Image path: /Users/siddhartha/Desktop/reference/ui/chrome-extension/claude/2026-05-15/417_claude-chrome_options-page.png
- Client type: chrome-ext
- Marketing page: apps/web/app/chrome-extension/page.tsx
- Accuracy: missing
- Marketing gaps:
  - Marketing does not describe the multi-step task execution visible in the side panel
  - No mention of batch actions, plan creation, or step-by-step execution
  - No mention of error handling and retry behavior shown in the task flow
  - The "Your approved sites" section shows a real approved site (www.sebastien-lempens.com) with "Revoke" option — site management not marketed
  - The active task demonstrates browser automation (clicking, screenshotting) that marketing only vaguely references

---

## Cross-Cutting Findings

### 1. Brand mismatch
All 18 screenshots are of **Claude's** Chrome extension (Anthropic), not AGI's. The marketing page describes an AGI-branded extension. If AGI's extension is a different product, these screenshots are not valid marketing references. If AGI's extension is meant to replicate Claude's features, the marketing page severely underrepresents the feature set.

### 2. Features shown in screenshots but absent from marketing
| Feature | Screenshot(s) |
|---------|--------------|
| Model selector (Opus/Sonnet/Haiku) | 05, 07 |
| Quick mode (experimental fast mode) | 06, 07 |
| Action permissions (ask vs act) | 02 |
| Screenshot/image attachment | 03 |
| Convert to task | 04, 402 |
| Settings/Language menu | 04, 402 |
| Desktop pairing flow | 403 |
| Per-site permission system | 404, 406 |
| Sensitive site blocking | 409 |
| Shortcuts/slash-commands + scheduling | 413, 414 |
| Voice/microphone workflow recording | 415, 404 |
| Multi-step task execution with batches | 417 |
| Notifications (task completion) | 404 |
| Paid plan requirement | 01, 03, 05, 07 |

### 3. Features claimed in marketing but not shown in screenshots
| Marketing claim | Evidence in screenshots |
|----------------|----------------------|
| "Platform assistants" for Slack, Gmail, Calendar, Docs, GitHub | No evidence — none of these platforms appear in any screenshot |
| "Job autofill" on LinkedIn and Lever | No evidence — no LinkedIn or Lever screenshots |
| "Quick-access popup for one-off questions" | No popup view shown — all screenshots show side panel |
| "Native messaging on localhost:8787" | Not visible in screenshots (architectural, not UI) |
| "Chrome MV3 manifest" | Not visible in screenshots (architectural) |
| "Web Store listing in review" | Not visible in screenshots |

### 4. Accuracy of architecture claims
- Marketing claims "No model runs in the browser" — consistent with Claude's server-side architecture, but AGI's architecture (native messaging to desktop) is different from Claude's (cloud API)
- Marketing claims "native messaging bridge on localhost:8787" — the Claude pairing screenshot (403) shows desktop-to-browser pairing, but via a different mechanism
- Marketing claims "desktop runs all inference" — Claude's extension uses Anthropic's cloud, not local desktop inference

### 5. Install/download links
- "Install dev build" links to `/download` — correctness depends on whether `/download` serves an extension CRX/ZIP or is a generic download page
- "Pair with desktop" links to `/desktop` — reasonable cross-link
- No Chrome Web Store link provided (marketing says "listing in review")

### 6. Missing trust/safety messaging
The Claude screenshots show robust safety features (site blocking, per-action permissions, site approvals) that could significantly strengthen marketing trust messaging. These are entirely absent from the current marketing page.
