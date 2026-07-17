# Chrome Web Store listing — AGI Browser Companion

Status: Draft; capability claims must be re-verified against the packaged build
Owner: Extension lead
Last updated: 2026-07-15

## Item name

`AGI Browser Companion`

## Short description

`Managed Cloud chat, approved-site page context, and permissioned browser actions in a Chrome side panel.`

## Detailed description

```text
Use AGI from the page you are already viewing.

WHAT IT DOES

• Opens AGI Managed Cloud chat in a Chrome side panel
• Keeps browser conversations on this browser, separate from AGI app chats
• Adds selected text or an explicitly captured page to a request
• Summarizes, explains, translates, and extracts information from a page
• Runs approved browser actions with an ask-before-acting control
• Can hand selected, redacted context to AGI Desktop for explicit review

PRIVACY AND CONTROL

• Chrome has no Local or BYOK chat mode
• AGI never silently falls back from Managed Cloud chat to Desktop inference
• Page content is sent only through an explicit chat/capture action
• Native context handoff requires preview and approval; it never sends a chat
• Browser actions default to asking before acting
• Provider/model admission and account entitlements are verified by AGI Cloud

AGI Browser Companion requires an AGI account for Managed Cloud chat. Feature
availability and usage limits depend on the account plan shown by AGI Cloud.

LINKS

• Website: https://agiworkforce.com
• Privacy: https://agiworkforce.com/privacy
• Support: support@agiworkforce.com
```

## Category

Primary: **Productivity**

## Screenshots

Use screenshots from the exact store candidate, not design mocks:

1. Managed Cloud side-panel chat and server-admitted model picker.
2. Selected-page-context preview before send.
3. Ask-before-acting browser approval.
4. Browser-local conversation history.
5. Explicit Desktop context-handoff review.

## Privacy policy URL

`https://agiworkforce.com/privacy`

## Single-purpose justification

```text
This extension is AGI's browser companion. Its side-panel chat, explicit page
context capture, permissioned browser actions, and reviewed Desktop handoff all
serve the single purpose of helping a user work with the page they are viewing.
```

## Permission justifications

| Permission                 | Justification                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `activeTab`                | Read or act on the current page only after a user invokes the corresponding feature.                                                       |
| `tabs`                     | Inspect the active target and manage tabs created by an approved browser task.                                                             |
| `storage`                  | Store browser-local conversations, site approvals, settings, and automation records.                                                       |
| `nativeMessaging`          | Authenticate an explicit context handoff to the installed AGI Desktop native host.                                                         |
| `alarms`                   | Run user-created schedules and connection maintenance.                                                                                     |
| `contextMenus`             | Offer explicit selected-text actions.                                                                                                      |
| `sidePanel`                | Host the browser companion UI.                                                                                                             |
| `scripting`                | Execute an explicitly invoked page-context or approved-site action.                                                                        |
| `cookies`                  | Support Clerk Native API session synchronization and declared site workflows; never read arbitrary cookies for chat context.               |
| `notifications`            | Notify about user-created background or scheduled work.                                                                                    |
| `tabGroups`                | Group tabs opened by an approved browser workflow.                                                                                         |
| `debugger`                 | Drive permissioned computer-use actions through Chrome DevTools Protocol, with attach/detach lifecycle controls.                           |
| Loopback host permissions  | Reach only the paired local Desktop bridge; runtime URL validation rejects non-loopback hosts.                                             |
| AGI/Clerk host permissions | Authenticate and call exact configured Managed Cloud and Clerk origins. Production packaging rejects broad or missing Clerk configuration. |

## Submission blockers

- Production Clerk Native API enabled.
- Stable CRX ID configured and present in Clerk `allowed_origins`.
- Store package produced with live public configuration.
- Manual permission review and packaged-build behavior verification.
- Current screenshots and promotional assets.
- Chrome Web Store privacy disclosures reconciled with the exact manifest.
