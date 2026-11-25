---
id: 'OVERVIEW-product'
type: 'overview'
title: 'Product overview'
basis: 'established requirements stated by the owner; app and plan facts from the project documents and code'
last_reviewed: '2026-11-24'
---

# Product overview

AGI Workforce is an AI assistant product that competes directly with Claude by Anthropic and ChatGPT by OpenAI across the whole assistant experience. It differs in two ways: the user chooses the model, and running a model on the user's own device is free.

It is not a thin layer around one model. It covers conversations, files, web search and research, images, documents and artifacts, voice, projects, memory, sharing, multi-step work, scheduled tasks, connectors to other apps, a coding agent, a browser agent, teams and admin, and one subscription with usage limits.

## The five principles

Stated by the owner as established requirements. Details: [principles](../10-requirements/principles.md).

|      | Principle                  | In one line                                                                                                             |
| ---- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| PR-1 | Model agnostic             | Different supported models through one consistent experience                                                            |
| PR-2 | Provider agnostic          | Several inference providers, no needless coupling to one                                                                |
| PR-3 | One AGI Subscription       | Entitlements, access rules, usage accounting, quotas and limits come from one system on every app                       |
| PR-4 | Free local inference       | Supported local inference on mobile and desktop needs no paid subscription; sign-in is a separate question from payment |
| PR-5 | Clear execution boundaries | It is explicit what runs on the device, what needs our servers or outside services, and which subscription rule applies |

## The six apps

One account and one shared core. Each app has its own page under [30-surfaces](../30-surfaces/).

| App     | What it is                                                                          | Page                                 |
| ------- | ----------------------------------------------------------------------------------- | ------------------------------------ |
| Web     | The full chat product in the browser, and the server every other app calls          | [web](../30-surfaces/web.md)         |
| Desktop | A desktop app: the same chat, plus AGI Code, which works on folders on the computer | [desktop](../30-surfaces/desktop.md) |
| Mobile  | The same chat on iOS and Android, with a model that runs on the phone               | [mobile](../30-surfaces/mobile.md)   |
| CLI     | A coding agent in the terminal                                                      | [cli](../30-surfaces/cli.md)         |
| VS Code | The same coding agent inside the editor                                             | [vscode](../30-surfaces/vscode.md)   |
| Chrome  | A side panel that reads and acts on web pages, with approval                        | [chrome](../30-surfaces/chrome.md)   |

## Three ways it runs

| Mode    | What happens                                                                                  | What the user pays     |
| ------- | --------------------------------------------------------------------------------------------- | ---------------------- |
| Local   | A model runs on the user's own device                                                         | Nothing                |
| Own key | The user's own provider key; the provider's name is shown                                     | The provider, directly |
| Cloud   | Our managed service; an automatic choice picks the model by default and the user can pick one | By plan                |

The three are separate trust boundaries. Nothing moves a Local chat or file to a provider without the user's explicit choice and a visible label. What exactly runs where, per capability, is on [SYS-execution-boundaries](../40-systems/execution-boundaries.md).

## Who must be able to do what

Stated by the owner on 2026-11-22.

- **Subscribed users:** every app.
- **Free users:** Web on Cloud; Mobile on Local and on Cloud; Desktop AGI Code on Local and own key; CLI on Local and own key; VS Code on Local.

This is the owner's minimum, not the full list. The code also gives Free accounts Cloud chat on Desktop and Chrome (`apps/web/lib/free-chat-surface-policy.ts`).

## Plans and sales

- Free plus paid plans. Names, prices, allowances and how usage is counted: [SYS-subscriptions-entitlements-and-usage](../40-systems/subscriptions-entitlements-and-usage.md).
- Nothing is sold before 2027-01-01. This is the owner's decision, stated in conversation on 2026-11-15; no project document or code names that date. In the code, checkout is off unless its switches are on, and an upgrade path ends at a waitlist or an access-code screen.
- The first mobile release is free with no in-app purchase and hides Remote Control (owner decisions).
- 18 and over on every app. The owner's decision, and enforced in the code (see [SYS-authentication-and-identity](../40-systems/authentication-and-identity.md)).

## The bar for "works"

A feature counts only when a person can do it in the real app and it looks and behaves as well as it does in Claude or ChatGPT. Tests and code reading are never offered as proof. All testing is on localhost, one app at a time. Method: [70-qa](../70-qa/README.md).

## Where things stand

Counts, per app, of what the code says is built and what a person has seen working: [coverage](../90-meta/coverage.md). The honest summary on 2026-11-24: most of the product exists in code and very little of it has been seen working by a person. In the code, Web is marked available and a production deployment exists, older than main; every other app is marked Coming soon. The owner's position is that nothing has been released to the public yet and no subscription has been sold.

## Not confirmed by the owner

1. Whether Web should also offer Local mode. The principle names mobile and desktop.
2. Whether individuals are the first customers, with teams and enterprise after.
3. Whether free local inference plus own key is the whole difference from the competitors.

Open product choices found while writing each topic are listed at the end of the competitor trace pages and collected in [established requirements](../10-requirements/established-requirements.md).
