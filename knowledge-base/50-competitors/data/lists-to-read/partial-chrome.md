---
id: "DOC-50-competitors-data-lists-to-read-partial-chrome"
type: "comparison-data"
title: "partial chrome"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
## Chrome (39)

**Composer and input** (2)
- XP1 Composer + menu: add files ★: No folder picking and no Cmd+U shortcut
- XP2 Plan mode / review a plan before work starts ★: No general Plan mode toggle

**Conversations and message actions** (1)
- XP3 Status marks on items in the recent list (Claude): Running work is shown only in the separate Tasks sheet

**Search and research** (1)
- XP4 Video transcript Q and A (YouTube) (ChatGPT): The side panel chat does not

**Artifacts and documents** (1)
- XP5 Artifacts and published pages from the panel (Claude): Artifact cards show source with a preview and copy or download; running one fully happens on the web

**Agents, tasks and automation** (3)
- XP6 Scheduled recurring tasks ★: No yearly repeat
- XP7 Panel session runs as a full cloud work session (Claude): Documents, sheets and decks were not checked
- XP8 Record your clicks and typing as a shortcut (Claude): Typed values are optional and passwords and card numbers are never kept

**Browser actions** (22)
- XP9 Agent tabs grouped in a coloured tab group ★: Context tabs are chosen from a picker, not by dragging into the group
- XP10 Always asks before downloads, sensitive input and granting access ★: But the ask is not complete: a click that starts a download is not asked (cdpDriver.ts:1273-1276, 1331-1341)
- XP11 Approval mode: skip all approvals ★: Still asks for protected steps and never completes a purchase
- XP12 Deleting things and changing permission settings always ask, in every mode ★: Only when the control's English label or the page path matches a pattern (delete, remove permanently, share, grant, rev…
- XP13 Download files ★: A click on a download link does not ask: cdpDriver.ts:1273-1276 flags it and 1331-1341 checks only site policy
- XP14 Local file upload limits and sensitive-file refusal ★: No filename block for credential files and no file-URL setting
- XP15 Page content treated as untrusted and injection checked ★: There is no separate safety classifier
- XP16 Purchases and payments are not completed for you ★: Only when the target is a button whose English label matches approvalPolicy.ts:157-158 (completesPurchase 267-269)
- XP17 Runs while you keep working in other tabs ★: Parallel background errands are not documented for ours
- XP18 Works in Edge, Brave, Opera and Vivaldi as well as Chrome ★: No Brave, Opera or Vivaldi listing or test
- XP19 Approval history in settings (Claude): Nothing in apps/extension/src writes browser decisions
- XP20 Approval mode: automatic with pauses for risky steps (Claude): It does not run a model safety review
- XP21 Ask about a YouTube video from its transcript (ChatGPT): Transcript summaries exist only in the in-page assistant on approved sites, not in the side panel
- XP22 Financial, banking, investment and crypto sites blocked by default (Claude): A built-in list of banking, payment, brokerage and crypto hosts makes every step ask in every mode, and only after the…
- XP23 Never types passwords, card or ID numbers (Claude): Sensitive fields are always asked about rather than blocked
- XP24 Notice shown when Auto or Full access is on (Claude): A dismissible notice appears for Full access only, not for Auto
- XP25 Per-site Browsing and Downloads columns with a Default row (ChatGPT): A per-capability table exists only for admin policy
- XP26 Prompt suggestions based on the site you are viewing (Claude): Page-aware suggestion chips (YouTube, GitHub PRs, generic) appear only in the in-page assistant, not the side panel
- XP27 Refuses trading, face scraping and account creation (Claude): No explicit refusal rules for trading or face scraping
- XP28 Share a screenshot or page region as visual context (Claude): There is no select-a-region capture
- XP29 Site tools discovered from the page (WebMCP) (ChatGPT): Every call asks and there is no default-on toggle
- XP30 Terminal coding agent drives the browser through the extension (Claude): There is no

**Device and OS integration** (2)
- XP31 Desktop app settings show the extension's status with install and remove (ChatGPT): No reinstall, and the install link depends on a store listing that does not exist yet
- XP32 Drive the extension from the terminal agent (Claude): It never speaks to the extension

**Install, release and update** (2)
- XP33 Welcome page opens after install with pin, sign-in and what it can and cannot do (Claude): Has no demo or challenge cards
- XP34 Works in other browsers (Edge, Brave, Vivaldi, Opera) (ChatGPT): No Edge step in the release workflow and nothing for Brave, Vivaldi or Opera

**Privacy, security and data** (1)
- XP35 No separate vendor record of what the extension did in your browser (ChatGPT): Not in the extension's own data-handling list, and no screen shows it to the user

**Teams and admin** (4)
- XP36 Admin site allowlist and blocklist ★: But it can only arrive by Chrome enterprise policy (managed-schema.json)
- XP37 Organization switch to turn the extension on or off ★: A switch exists outside apps/extension: Workspace policy has a Chrome extension checkbox (apps/web/features/settings/se…
- XP38 Admin limits on history access, saved always-allow approvals and approval duration (ChatGPT): Has nothing for history search, for stopping Always allow on a site, or for how long an approval lasts
- XP39 Banner on an admin-blocked page with the assistant switched off there (Claude): The standing blocked notice covers Chrome's own restricted pages, not sites an admin or the user blocked, and page text…
