# Chrome Web Store listing — source of truth

Everything a reviewer reads in the Developer Dashboard is written here first and
copied there verbatim. The dashboard has no version history and no diff; this
file does. `__tests__/manifest-contract.test.ts` freezes the permission and host
lists this document justifies, so adding a permission fails the build until the
justification below is written.

Publishing checklist lives in [`chrome-web-store-publish-runbook.md`](chrome-web-store-publish-runbook.md).
The security boundary each justification asserts is specified in
[`threat-model.md`](threat-model.md).

## Single purpose

AGI Browser Companion gives you one AI assistant in a Chrome side panel that can
read the page you are on and, on sites you explicitly approve, act in that page
on your behalf.

Everything in the extension serves that purpose: the side-panel chat, the page
context it can attach, the browser automation it runs on approved sites, and the
optional link to the AGI Desktop app.

## Store description

**Short description (132 char limit)**

> An AI side panel that reads the page you are on and, on sites you approve,
> clicks and types for you.

**Detailed description**

> AGI Browser Companion puts an AI assistant in Chrome's side panel.
>
> **Chat about the page you are on.** Attach the current page's text to a
> message with one click, or use a slash command like `/summarize` or
> `/extract`. Nothing is attached until you ask for it, and the extension tells
> you when a page cannot be read instead of quietly answering about nothing.
>
> **Let it act, on sites you choose.** On a site you have added to your approved
> list and separately confirmed for browser control, the assistant can click,
> type, scroll and navigate for you — filling a long job application, for
> instance. You approve each action before it runs unless you turn that off.
> Chrome shows its own debugging bar the whole time; dismissing that bar stops
> the run immediately.
>
> **Follow work started elsewhere.** Runs you started on the web, desktop or
> mobile app appear in the Runs tab, where you can read the transcript, answer
> an approval request, or stop the run.
>
> **Your approvals are real approvals.** Sites are added one at a time by you.
> Browser control is a second, separate confirmation, and granting it asks
> Chrome for site access for that one origin — a grant you can see and withdraw
> at `chrome://extensions` at any time. Removing a site revokes both.
>
> Requires a free or paid AGI account. Not available in incognito.

## Permission justifications

One entry per declared permission. Each names the feature that needs it and what
it would break to remove it. Copy each cell verbatim into the matching field in
the Dashboard's Privacy tab.

| Permission        | Justification (dashboard text)                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`       | Reading the current page's text when the user clicks "add page context" or runs a page slash command. Scoped to the tab the user is looking at, at the moment they ask.                                                                                                                                                                                                                                                                                                          |
| `tabs`            | Showing the user which page the assistant is about to act on, opening the side panel for the right tab, and confirming a browser-control run is still driving the tab the user approved.                                                                                                                                                                                                                                                                                         |
| `scripting`       | Extracting the visible text of the current page for the "add page context" feature and page slash commands. Only ever runs on the active tab, only on explicit user action.                                                                                                                                                                                                                                                                                                      |
| `storage`         | Storing conversations, the user's approved-site list, scheduled tasks, saved shortcuts, and preferences. Only one boolean preference set is mirrored to Chrome Sync.                                                                                                                                                                                                                                                                                                             |
| `debugger`        | Browser control on approved sites. The DevTools Protocol is what lets the assistant click, type, scroll and navigate in a real page the way a person does, including inside pages that ordinary script injection cannot drive. It is used only after the user adds a site AND separately confirms full browser control for that site AND Chrome grants host access for that one origin, and only while Chrome's own debugging bar is showing. Dismissing that bar stops the run. |
| `nativeMessaging` | Pairing with the optional AGI Desktop app, which the user installs and confirms with a code shown in Desktop's own window.                                                                                                                                                                                                                                                                                                                                                       |
| `alarms`          | Running the user's scheduled tasks at the time they chose, and retrying work that was interrupted. Registered only while such work exists.                                                                                                                                                                                                                                                                                                                                       |
| `notifications`   | Telling the user when a scheduled task finished, failed, or needs their approval while the side panel is closed.                                                                                                                                                                                                                                                                                                                                                                 |
| `contextMenus`    | The right-click "Ask AGI", "Explain", "Translate" and "Summarize" entries on selected text.                                                                                                                                                                                                                                                                                                                                                                                      |
| `sidePanel`       | The extension's entire user interface is a side panel.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `cookies`         | A single explicit tool the user can invoke from the extension's own UI to set a cookie on a site they are working with. Not reachable from any web page.                                                                                                                                                                                                                                                                                                                         |
| `tabGroups`       | Grouping tabs the assistant opens on the user's behalf so they stay together and are easy to close.                                                                                                                                                                                                                                                                                                                                                                              |

### Host permissions

| Pattern                                                        | Justification (dashboard text)                                                                                                                                                                                               |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://agiworkforce.com/*`, `https://api.agiworkforce.com/*` | Talking to the user's own AGI account: sending chat messages, reading run transcripts, and signing in.                                                                                                                       |
| `http://localhost/*`, `http://127.0.0.1/*`                     | Pairing with the AGI Desktop app, which listens on loopback on the user's own machine. No remote host is contacted through these.                                                                                            |
| `optional_host_permissions`: `http://*/*`, `https://*/*`       | Not granted at install. Requested one exact origin at a time, through Chrome's own prompt, at the moment the user confirms browser control for that site. The user can see and withdraw each grant at `chrome://extensions`. |

### Remote code

The extension executes no remote code. All scripts are bundled in the package;
the extension-pages CSP is `script-src 'self'` with no `unsafe-eval` and no
`unsafe-inline` for scripts.

## Data use disclosures

Tick these in the Dashboard's Privacy tab, and nothing else.

| Category                | Collected | What and why                                                                                                                                       |
| ----------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personally identifiable | Yes       | Account email, to sign the user in. Optionally the job-application profile the user types in themselves, used only to fill forms they ask to fill. |
| Authentication          | Yes       | The user's AGI session token.                                                                                                                      |
| Website content         | Yes       | The text of a page, sent to the AGI service only when the user attaches it or runs an action on an approved site.                                  |
| Personal communications | No        |                                                                                                                                                    |
| Financial               | No        |                                                                                                                                                    |
| Health                  | No        |                                                                                                                                                    |
| Location                | No        |                                                                                                                                                    |
| Web history             | No        | Browsing history is never collected. A page's URL is sent only as part of a request the user initiated on that page.                               |
| User activity           | No        |                                                                                                                                                    |

Certifications to accept:

- Data is not sold or transferred to third parties outside the approved use
  cases.
- Data is not used or transferred for purposes unrelated to the item's single
  purpose.
- Data is not used or transferred to determine creditworthiness or for lending.

Privacy policy URL: `https://agiworkforce.com/privacy`
