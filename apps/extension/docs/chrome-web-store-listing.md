# Chrome Web Store listing, source of truth

Last updated: 2026-11-12

Everything a reviewer reads in the Developer Dashboard is written here first and
copied there verbatim. The dashboard has no version history and no diff; this
file does. `__tests__/manifest-contract.test.ts` freezes the permission and host
lists this document justifies, so adding a permission fails the build until the
justification below is written.

Publishing checklist lives in [`docs/runbooks/chrome-web-store-publish.md`](../../../docs/runbooks/chrome-web-store-publish.md).
The security boundary each justification asserts is specified in
[`threat-model.md`](threat-model.md).

## Single purpose

AGI Extension gives you one AI assistant in a Chrome side panel that can read
the page you are on and, on sites you explicitly approve, act in that page on
your behalf, either when you ask or by replaying steps you recorded there.

Everything in the extension serves that purpose: the side-panel chat, the page
context it can attach, the browser automation it runs on approved sites, the
recorded browser tasks it replays in the browser for you, the rewrite of text you
select in a field on an approved site, the tab group that shows which tab the
assistant is working in and the side panel's action for closing tabs you have
finished with, the task list that follows that work from the other AGI apps,
schedules for a chat's prompt, which run in your AGI account rather than in the
browser, and the optional link to the AGI Desktop app.

## Store description

Copy each block below into the Store listing tab as written. The Dashboard
strips formatting from the description, so the detailed description is plain
text with capitalised headings.

### Listing fields

| Dashboard field | Value                                                                                                                                                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Item name       | `AGI Extension`, read from `manifest.json` `name`. The registry builds it as the copyright name plus the product name, and `check:product-names` and the manifest contract test hold it there.                                                                                                   |
| Summary         | The short description below, read from `manifest.json` `description`. At most 132 characters; the manifest contract test holds the two equal.                                                                                                                                                    |
| Category        | Productivity, subcategory Workflow & Planning. Chrome's best-practices page lists those names (https://developer.chrome.com/docs/webstore/best-practices, read 2026-11-11), and no current official list of the Dashboard dropdown was available, so confirm the subcategory in the dropdown.    |
| Language        | English. `_locales/` ships `en` only.                                                                                                                                                                                                                                                            |
| Homepage URL    | `https://agiworkforce.com`, the site root, which is also `manifest.json` `homepage_url`. Not `/chrome-extension` yet: that page says the extension is coming soon and offers a notify form, which is untrue once the item is live. Switch it after approval (runbook, First submission step 14). |
| Support URL     | `https://agiworkforce.com/support`, the support page in the web app (`apps/web/app/support/page.tsx`). Its published contact address is `contact@agiworkforce.com`.                                                                                                                              |
| Official URL    | Leave unset unless `agiworkforce.com` is verified for the publisher in Search Console. Whether it is verified is unknown.                                                                                                                                                                        |
| Mature content  | Off.                                                                                                                                                                                                                                                                                             |
| Promo video     | None.                                                                                                                                                                                                                                                                                            |
| Contact email   | `contact@agiworkforce.com`, set and verified on the Dashboard's Account tab, not the item.                                                                                                                                                                                                       |

**Short description (132 char limit)**

> An AI side panel that reads the page you are on and, on sites you approve, clicks and types for you.

**Detailed description**

```text
AGI Extension puts an AI assistant in Chrome's side panel that can read the page you are on and, on sites you approve, act in it for you.

CHAT ABOUT THE PAGE YOU ARE ON
Attach the current page's text to a message with one click, or start with a slash command such as /summarize, /tldr, /explain, /translate, /extract or /code. Nothing is attached until you ask for it, and the panel tells you when a page cannot be read instead of answering about nothing.

ACT ON SITES YOU APPROVE
On a site you approve, the assistant can click, type, scroll and navigate for you, for example to fill in a long application form. You choose how closely it is supervised. Ask first confirms every action. Auto, the default, asks before anything important such as sending, deleting, signing in, downloading or running a tool the website supplies, and before using any control it cannot identify. In every mode the assistant never completes a purchase: it stops and hands the checkout back to you. Full access asks only before protected actions such as uploads, downloads, sign-ins and sensitive input. Closing a tab always asks, because it can discard unsaved work. While the assistant controls a page, Chrome shows its own banner, and closing that banner stops the run.

YOU STAY IN CONTROL OF SITE ACCESS
Access is granted one site at a time, either for a single task or for good. You can review and remove approved sites in the extension's settings, and removing a site withdraws the access Chrome granted for it.

SEE WORK STARTED ELSEWHERE
Open Tasks from the More menu to see what AGI is running or has run for you on the web, desktop and mobile apps. Open a task's chat, or stop a task that is still running.

ATTACH FILES
Attach images (PNG, JPEG, WebP or GIF), PDFs, plain text or Markdown files to a message.

REWRITE TEXT YOU SELECT
On a site you approve, select text in a text box, right-click and choose Rewrite selection. The assistant drafts a replacement in the side panel, and nothing changes on the page until you review the draft and insert it. You can undo an insertion.

SEND SELECTED TEXT TO A LOCAL APP
With AGI Desktop linked, right-click selected text and choose Send selected text to a local app. The side panel shows what would be sent, and nothing leaves the browser until you approve it.

RECORD STEPS AND SCHEDULE TASKS
In the extension's settings, under Shortcuts, record the steps you take on a page of a site you approved and replay them later in the browser. Recording stops when the page loads a new address. Choose Schedule from a chat's menu to have your AGI account run that chat's prompt again on a schedule you set.

KEEP TRACK OF THE TABS IT WORKS IN
While the assistant controls a tab that is not already in a tab group, it puts that tab in a group named AGI so you can see where it is working, and takes it out again when the run ends. When you have finished, choose Close tabs from the side panel's More menu, pick the tabs and close them together. The tab you are on and pinned tabs are kept, and page contents are not read.

PRIVACY
Page content is sent to AGI only when you attach it, run a page command, or ask the assistant to act on a site you approved. An attached page includes the current contents of its form fields, such as text you have typed, except password, payment card, one-time code, PIN and Social Security number fields. The privacy policy is at https://agiworkforce.com/privacy.

REQUIREMENTS
Needs a free or paid AGI account. Not available in incognito windows.

SUPPORT
Help and contact: https://agiworkforce.com/support
```

### Claims checked against the code

Each sentence of the detailed description was checked against the code on
2026-11-11, and the sections on recorded and scheduled tasks, the AGI tab group
and form fields on 2026-11-12. Change the description and this table together.

| Sentence                                                        | Where it holds                                                                                                                                                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One-click page attach and the six slash commands                | `SLASH_COMMANDS` in `src/features/side-panel/pageCommands.ts`                                                                                                                                                                         |
| Three supervision modes, Auto the default                       | `DEFAULT_BROWSER_PERMISSION_MODE` and `actionNeedsApproval` in `src/features/computer-use/askBeforeActing.ts`; the mode wording is `spAutonomy*` in `_locales/en/messages.json`                                                       |
| Closing a tab always asks                                       | `tab_management` maps to `destructive` in `src/features/computer-use/crucialActions.ts`, so Auto asks; `approvalRequirement` in `src/features/computer-use/approvalPolicy.ts` returns `alwaysAsk` for `close_tab` in the other modes  |
| Auto asks before a tool the website supplies                    | `site_tool` maps to `unverified_effect` in `src/features/computer-use/crucialActions.ts`                                                                                                                                              |
| Auto asks before using a control it cannot identify             | `asksInAutoMode` in `src/features/computer-use/crucialActions.ts` stops Auto on `unidentified_input`; the pointer tools also refuse a point inside a frame from another site (`validateViewportPoint` in `cdpDriver.ts`)              |
| Nothing is attached until you ask for it                        | Selected text is read only when the user picks the plus-menu item `spSelectionItem`, on an approved site (`attachPageSelection` in `src/side_panel.ts`), or a right-click entry                                                       |
| Site access for one task or for good, removable                 | `spBrowserAccessOnce` and `spBrowserAccessAlways`; `removeApprovedSiteHostPermission` in `src/features/options/site-allowlist.ts`                                                                                                     |
| Tasks from the other apps, open or stop                         | `src/features/side-panel/tasksSheet.ts`, opened from the More menu entry `spAccountTasks`                                                                                                                                             |
| File types                                                      | `COMPOSER_ATTACHMENT_MIME_TYPES` and `COMPOSER_DOCUMENT_MIME_TYPES` in `src/side_panel.ts`                                                                                                                                            |
| Close tabs keeps active and pinned tabs, reads no page contents | `cleanup` filter in `src/features/side-panel/tabContext.ts` and its on-screen wording                                                                                                                                                 |
| Record steps on an approved site and replay them                | `optRecordTitle` and `optRecordHint` ("Only approved sites can be recorded") under `optShortcutsTitle` in `_locales/en/messages.json`; replay in `handleReplayShortcut` in `src/background.ts`                                        |
| Recording stops when the page loads a new address               | `handleRecordingMessage` in `src/background.ts` ends the recording the page no longer holds; `src/features/background/recordingSessions.ts`; `optRecordStoppedByNavigation` in `_locales/en/messages.json`                            |
| Schedule a chat's prompt from its menu, run in the account      | `scheduleFromChat` in `src/side_panel.ts` stages a draft in Options; `createChromeSchedule` in `src/features/cloud-bridge/schedulesClient.ts`, called from `src/features/side-panel/schedulesSection.ts`, creates an account schedule |
| The AGI tab group during a run, removed when it ends            | `markComputerUseTab` and `ensureTabGroup` in `src/background.ts` (`TAB_GROUP_NAME`); a tab already in a group is left where it is                                                                                                     |
| A page attach includes form field contents, with exclusions     | `capturePageObservation` in `src/features/content/pageObservation.ts`; `isSensitiveField` and `sensitiveNameTokens` in `src/features/content/elementReader.ts`                                                                        |

## Store assets

Everything the Store listing tab takes as an image. The files are produced from
the built extension, never drawn by hand: `pnpm --dir apps/extension store:assets`
rebuilds the screenshots and the promotional tiles into `store-assets/`, and
`__tests__/store-assets.test.ts` fails when a listed file is missing or has the
wrong pixel size. `store-assets/` is not inside `dist/`, so the store ZIP never
contains it.

Build `dist/` first with `CLERK_PUBLISHABLE_KEY`, `CLERK_FRONTEND_API` and
`CLERK_SYNC_HOST` set (a non-routable placeholder origin is enough, nothing
reaches it), because the side panel only shows signed-in screens in a build that
has Clerk configured. The capture blocks every network address except the local
sample site and answers the account calls itself with sample data, so no real
account, page or request is involved.

Rules, from https://developer.chrome.com/docs/webstore/images and
https://developer.chrome.com/docs/webstore/cws-dashboard-listing (read
2026-11-11):

- Store icon: 128x128 PNG, with the artwork 96x96 inside 16 pixels of
  transparent padding on every side. An icon with no alpha is placed in a framed
  rounded tile by the store.
- Screenshots: at least one and at most five, 1280x800 or 640x400, square
  corners, full bleed. The store shows them at 640x400.
- Small promotional tile: 440x280, optional, PNG or JPEG. Extensions without one
  are listed after those with one.
- Marquee promotional tile: 1400x560, optional, PNG or JPEG, needed to be
  featured in the marquee. Promotional tiles cannot be localised.

| File                                             | Size     | Shows                                                                                                                                |
| ------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `icons/icon128.png`                              | 128x128  | The store icon, the same file as the manifest icon. See the note below on its padding.                                               |
| `store-assets/screenshot-1-chat-answer.png`      | 1280x800 | A finished answer about the page beside it, in the side panel.                                                                       |
| `store-assets/screenshot-2-page-summary.png`     | 1280x800 | A page summary, with the page it summarises visible on the left.                                                                     |
| `store-assets/screenshot-3-approval.png`         | 1280x800 | The chat asking before it acts: an expense claim request, and the card with the task named in plain words and Start task or Decline. |
| `store-assets/screenshot-4-site-permissions.png` | 1280x800 | The settings page: approved sites you can remove, and the approval history.                                                          |
| `store-assets/screenshot-5-tasks.png`            | 1280x800 | The Tasks sheet listing work from the web, desktop and mobile apps.                                                                  |
| `store-assets/promo-small-440x280.png`           | 440x280  | The AGI symbol and the name on the neutral background.                                                                               |
| `store-assets/promo-marquee-1400x560.png`        | 1400x560 | The same mark and name, at marquee size.                                                                                             |

Notes for the upload:

- Every screenshot frame is 1280x800: the page on the left and the side panel
  on the right, each rendered by the browser from the built extension in the
  light theme at 100% zoom, with local sample content. The side panel is not
  docked by the browser in automation, so the panel and the page are rendered
  as two real pages and joined side by side into one frame.
- Upload the screenshots in file-name order; the first is the one the listing
  leads with.
- The icon's artwork currently fills the whole 128x128 canvas instead of 96x96
  with 16 pixels of padding. The store accepts it, and a transparent-padded
  version needs the brand tile re-exported at the design source, which this
  repository does not hold, so it is left as a decision for the owner.

## Permission justifications

One entry per declared permission. Each names the feature that needs it and what
it would break to remove it. Copy each cell verbatim into the matching field in
the Dashboard's Privacy tab.

| Permission        | Justification (dashboard text)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`       | When the user opens the assistant from the toolbar button, a right-click entry or a keyboard shortcut, Chrome lets the extension use that one tab until it navigates. The extension uses this to read the visible text or selection of that tab when the user asks about it, and, for the capture shortcut on an approved site, to take one screenshot that is handed to the AGI Desktop app on the same computer. Without it each of those requests would need a separate site-access prompt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `tabs`            | Showing the user which page the assistant is about to act on, opening the side panel for the right tab, confirming a browser-control run is still driving the approved tab, and listing titles and addresses for the user-selected local tab-cleanup action. Cleanup does not read page contents or send tab metadata to a model. A paired AGI Desktop app sees the title and address only of tabs on approved sites; any other tab is listed by its site name alone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `scripting`       | Runs only functions packaged with the extension: reading the visible text or the selected text of a tab the user asks about, adding the extension's own packaged content script back to a tab that lost it, and reading the address of a tab a browser-control run opened. It never runs code from outside the package.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `storage`         | Storing conversations, the user's approved-site list, scheduled tasks, saved shortcuts and recorded steps (recordings are removed when the user signs out or switches account), the pairing with the AGI Desktop app, the optional form-fill profile the user types in, and preferences on this device. Only the extension's own panel, settings page and background can read or change this storage; the script it adds to web pages cannot. Four on/off preferences and the dictation language are also kept in Chrome Sync so they follow the user's Chrome profile; nothing else is synced.                                                                                                                                                                                                                                                                                                                                                                  |
| `debugger`        | Browser control on approved sites. The DevTools Protocol is what lets the assistant click, type, scroll and navigate in a real page the way a person does, including inside pages that ordinary script injection cannot drive, and see the result in a screenshot. It is used only on a site the user has granted browser control, for one task or until they remove it, after Chrome grants host access for that one origin (local addresses such as localhost need the user's approval in the extension, because Chrome already allows them), and only while Chrome's own debugging banner is showing. It is never used on the user's own AGI account or sign-in pages. Dismissing that banner stops the run. During a run, or while the user has turned on the page watch for that tab, the assistant can also read the tab's console messages and the address, method, status and timing of its network requests; request bodies and headers are never read. |
| `nativeMessaging` | Exchanging messages with the optional AGI Desktop app on the same computer, after the user installs it and confirms pairing with a code shown in Desktop's own window. Desktop can then hand browser tasks to the extension, list the open tabs (title and address for approved sites, site name only for any other tab) and receive the pages the user sends to it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `alarms`          | Retrying background work that was interrupted when Chrome stopped the extension's service worker: saving a chat to the user's AGI account or deleting one from it, and reconnecting to the AGI Desktop app the user paired. A single one-minute alarm is registered only while such work is outstanding, and cleared when none is left. Schedules the user makes from a chat run in their AGI account, not on these alarms.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `notifications`   | Telling the user, while the side panel is closed, that a browser step in their chat is waiting for their approval, and what became of something they started from a right-click entry or the capture shortcut, such as a page capture reaching the AGI Desktop app or the reason it could not be done.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `contextMenus`    | Right-click entries, each run only when you pick it. On selected text: "Ask AGI about "…"", "Explain this", "Translate this" and "Send selected text to a local app…", which shows a preview in the side panel and sends nothing until you approve it. In a text field: "Rewrite selection", which works only on a site you approved and changes nothing on the page until you review the draft and insert it. On the page: "Ask AGI about this page", "Summarize this page" and "Add Tab to AGI Group".                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `sidePanel`       | The extension's entire user interface is a side panel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `cookies`         | Reading the user's own AGI sign-in session so the side panel can use the account they already signed into on the web (the Clerk sync-host handshake). The extension never sets a cookie and never reads cookies from any other site.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `tabGroups`       | Showing the user which tab the assistant is controlling. During a browser-control run the extension puts that tab in a tab group named AGI and takes it out when the run ends; a tab the user already grouped is left where it is. The right-click entry "Add Tab to AGI Group" lets the user add a tab to that group. The extension reads a tab group's title only to find the group named AGI.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `downloads`       | Saving a file the user asks the assistant to download from a page they have approved. A download only ever starts from an explicit request, only from the approved page's own origin or another origin already on the user's allowlist, and Chrome picks the filename. For a few seconds after the assistant clicks on an approved page, a download that page starts is held to the same rules and cancelled if it breaks them. The extension shows progress and opens the containing folder only for downloads it started.                                                                                                                                                                                                                                                                                                                                                                                                                                      |

### Optional permission

| Permission                        | Justification (dashboard text)                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `optional_permissions`: `history` | Not granted at install. Requested through Chrome's own prompt only when the user turns on "Browsing history" in Extension settings. With it on, the assistant can ask to search the user's history when a question needs a page they visited before; the user allows or declines every search, and only the titles and addresses of matching pages are sent for that answer. Turning the setting off removes the permission. |

### Host permissions

The packaged manifest also names the production sign-in service, added at build
time from `CLERK_FRONTEND_API` and `CLERK_SYNC_HOST`
(`apps/extension/scripts/manifest-config.mjs`). Read the final list from the
uploaded package's manifest before filling this in, and give each host a line.

| Pattern                                                                            | Justification (dashboard text)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `https://agiworkforce.com/*`, `https://api.agiworkforce.com/*`                     | Talking to the user's own AGI account: sending chat messages and the page context the user attaches, uploading the files the user attaches, saving chats to the account, reading tasks and transcripts, and signing in. The assistant never clicks or types on these sites.                                                                                                                                                                                                                                                                |
| The Clerk origins added at build, in production `https://clerk.agiworkforce.com/*` | AGI's sign-in service. The side panel uses it to sign the user in and keep the session that the web app already holds. The assistant never clicks or types on it.                                                                                                                                                                                                                                                                                                                                                                          |
| `http://localhost/*`, `http://127.0.0.1/*`                                         | Pairing with the AGI Desktop app, which listens on loopback on the user's own machine. The extension sends Desktop its own ID and the pairing code so Desktop can register its native messaging host for exactly this extension. These are loopback addresses only: nothing sent through them leaves the user's computer, and no remote host is contacted through these. A local site the user approves for browser control is controlled only after the user confirms it in the extension, since Chrome does not ask for these addresses. |
| `content_scripts` match: `http://*/*`, `https://*/*`                               | The single install-time warning Chrome shows, "read and change all your data on all websites", comes from this match, not from the host permissions above. One content script loads on every ordinary page so the assistant can read the page the user points it at and, on an approved site, show the in-page panel and run page tools and automation. On every other origin the script asks the extension once whether the site is approved, then adds no UI, sends nothing else and answers no privileged message.                      |
| `optional_host_permissions`: `http://*/*`, `https://*/*`                           | Not granted at install. Requested one exact origin at a time, through Chrome's own prompt: when the user attaches a page or chooses tabs to add to a message (returned once the text is read, unless the site is on the approved list), and when the user grants browser control for a site. Site access that is not on the user's approved list is released when the browser starts and when the extension is installed or updated. The user can see and withdraw each grant at `chrome://extensions`.                                    |

### Remote code

Answer "No, I am not using remote code." The Dashboard describes this field as
the place to tell reviewers whether the extension executes remote code and, if
so, why (https://developer.chrome.com/docs/webstore/cws-dashboard-privacy, read
2026-11-12). If it offers a text box with the "No" answer, paste the block
below; if it shows one only for "Yes", keep "No" and give the same text to a
reviewer who asks.

```text
The extension runs no remote code. Every script is in the package, and the extension pages' content security policy is script-src 'self' with no unsafe-eval and no unsafe-inline. Three things an automated scan may flag:
1. frame-src allows one remote origin, https://sandbox.agiworkforce.com, the AGI artifact renderer. An artifact the user opens in the side panel is shown in a cross-origin iframe from that site. It is web content: it has no access to extension APIs, the manifest declares no externally_connectable entry, and the side panel only posts the artifact's text to it, accepts render status back and refuses every other request from it.
2. The extension's own requests to http://localhost and http://127.0.0.1 are only for pairing with the AGI Desktop app on the same computer. The extension sends that loopback address its own ID and either the pairing code the user types or the bridge token the user copied from Desktop, so nothing sent there leaves the computer.
3. The bundled Zod validation library checks whether code generation is allowed by constructing new Function(""). Under the extension's content security policy that check is refused and caught, and Zod then validates without generating code. The check is not in the content script bundle.
```

The extension executes no remote code. All scripts are bundled in the package;
the extension-pages CSP is `script-src 'self'` with no `unsafe-eval` and no
`unsafe-inline` for scripts.

Browser control sends DevTools Protocol commands through the documented
Debugger API. Every page-side expression it evaluates is a fixed string in the
package (`src/features/computer-use/cdpDriver.ts`); what the model chooses, such
as a selector, coordinates, a key or text to type, is passed into those
expressions as JSON data (`src/features/computer-use/scriptLiteral.ts`) and is
never run as code. No tool lets the model supply a script.

One bundled validation library contains a `new Function("")` probe that checks
whether the page allows code generation; under the extension's CSP the probe is
refused, caught, and nothing is evaluated.

`frame-src` adds exactly one remote origin, `https://sandbox.agiworkforce.com`.
That is AGI's artifact renderer, the same one the web app frames: an artifact
the user opens in the side panel runs inside that separate origin's iframe,
under its own policy, and never inside the extension's origin. The side panel
only posts the artifact's text to it and accepts render status back from it.
The extension declares no sandbox page. The deployed renderer admits only the
configured extension item ID in both its framing policy and parent-message gate.
Local development can replace that frame origin with one isolated loopback
renderer; release packages refuse an HTTP renderer, and extension script policy
stays unchanged.

`media-src` adds `blob:` only, so a video the user asked AGI to create plays in
the side panel after the extension downloads it from the user's own account.

### Images in answers

The extension-pages CSP allows `img-src 'self' data: https:`. An answer can
include a markdown image hosted anywhere on the web, and the side panel shows it
the way the AGI web chat does: nothing is fetched until the user clicks "Load
image" for that image, the request is sent with no referrer, and a failed image
offers two retries and a download link. `https:` applies to images only; scripts
and fonts stay limited to files packaged with the extension, and frames and media
add only the sources described above.
Dashboard text: "Answers can contain images hosted on the web. The side panel
loads one only after the user chooses to load it, without sending a referrer;
no remote image can run code."

## Data use disclosures

Tick these in the Dashboard's Privacy tab, and nothing else.

| Category                | Collected | What and why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personally identifiable | Yes       | Account email, to sign the user in. Optionally the job-application profile the user types in themselves, used only to fill forms they ask to fill. Contact details are sent to the AGI service when the user explicitly asks chat to use that saved profile on a form.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Authentication          | Yes       | The user's AGI session token.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Website content         | Yes       | Up to 30,000 characters in total of a page's visible text and the current contents of its visible form fields, such as text the user has typed, sent to the AGI service only when the user attaches the page, runs a page slash command or the Summarize menu item, or runs an action on an approved site. Fields the extension recognizes as password, payment card, one-time code, PIN or Social Security number fields are left out and blanked where they appear in the page text, and strings that look like keys, tokens, card numbers or passwords are redacted. During browser control on an approved site the assistant also sends screenshots of that tab, which are not redacted, the page structure it reads, and the tab's console messages. User-selected images and documents are uploaded to the authenticated AGI file store for chat; saved messages retain owned file references and display metadata, without embedding file bytes. |
| Personal communications | Yes       | Only the content of pages the user attaches or approves for browser control. If such a page is an email, chat or message thread, the text, form contents and screenshots described under Website content can include those messages. The extension does not read any mail or messaging account on its own.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Financial               | No        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Health                  | No        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Location                | Yes       | Time-zone name only, sent with a chat request: the browser's IANA time zone name, such as America/Chicago, so times in answers are local (`browserTimeZone` in `src/features/cloud-bridge/freeTrialClient.ts`). The extension reads no coordinates or street address.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Web history             | Yes       | Only when the user has turned on "Browsing history" and allows a specific search: the titles, addresses (secret-like query values redacted) and last visit times of at most 20 matching pages, sent to the AGI service for that one answer. Otherwise a page's URL is sent only as part of a request the user initiated on that page.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| User activity           | Yes       | Only during browser control on an approved site, or while the user has turned on the page watch: the network requests that tab makes (address with credentials removed, method, status and timing; never bodies or headers), read for the assistant. Each action the assistant takes is recorded to the user's account with its type, outcome and the site's origin, so the user can review what was done. The user's own clicks, keystrokes and mouse movement are not logged; recorded shortcuts stay in this browser.                                                                                                                                                                                                                                                                                                                                                                                                                                |

Not a Dashboard category, but stated here so the copy stays true: crash reports
go to Sentry only after the user turns on "Share crash reports", which is off by
default, and product usage events (event names and a short allowlist of
properties, never content) go to the user's AGI account only while the account's
analytics consent is on.

Certifications to accept:

- Data is not sold or transferred to third parties outside the approved use
  cases.
- Data is not used or transferred for purposes unrelated to the item's single
  purpose.
- Data is not used or transferred to determine creditworthiness or for lending.

Privacy policy URL: `https://agiworkforce.com/privacy`

## Test instructions

Paste this into the Dashboard's Test instructions tab. The username and password
go only into the Dashboard fields, never into this file. The owner creates the
reviewer account on production, keeps it on a plan that can run chat and browser
control, and checks it still signs in before each submission. Walk these steps
once in the exact release build before submitting; they were written from the
code and its interface strings, not from a run of the store package.

```text
The extension needs an AGI account. Use the username and password above.

1. Install, then click the toolbar button. The side panel opens.
2. Choose Sign in and sign in on agiworkforce.com with the account above. The side panel picks up the same session.
3. Open any article, for example https://en.wikipedia.org/wiki/Chrome_Web_Store. In the side panel, type /summarize and press Enter. If Chrome asks for access to the site, allow it. The answer summarises the page. Nothing from a page is sent before a step like this one.
4. Browser control: ask the assistant to do something on that page, for example "Scroll to the References section". The panel shows "AGI needs access to en.wikipedia.org" with Allow for this task, Always allow on this site and Decline. Choose Allow for this task. Chrome shows its own debugging banner while the assistant acts; closing the banner stops the run. To confirm every action before it runs, set the permission mode in the composer to Ask first.
5. Options (right-click the toolbar button) lists approved sites and how page data is handled, and lets you remove a site.

The optional AGI Desktop app is not needed for review.
```
