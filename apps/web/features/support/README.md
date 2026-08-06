# Support Feature

Status: Active
Owner: Web engineer
Purpose: In-product support widget — a grounded answer surface over the support corpus, with account context, proposed actions, and human handoff.

## What mounts, and when

`app/providers.tsx` imports exactly one thing from here: `SupportWidgetMount`.
It renders nothing unless **both** gates pass:

- `NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED === '1'`
  (`components/SupportWidgetMount.tsx`) — the widget is off by default.
- The current pathname is not on `SUPPORT_WIDGET_BLOCKLIST`
  (`lib/route-visibility.ts`). Auth routes are blocked so a floating overlay
  never competes with a sign-in form.

`resolveSupportSurface(pathname)` then picks the `app` or `marketing` variant.

## Trust posture

Support answers are grounded in retrieved documents, which are **untrusted
input**. Two rules in `lib/` exist because of that and must not be relaxed:

- `render-text.tsx` renders prose as plain text only — no
  `dangerouslySetInnerHTML`, no markdown-to-HTML, and no auto-linkification of
  bare URLs. A retrieved document that contains a link must not become a click
  target.
- `normalize-answer.ts` refuses citations outright rather than sanitizing them:
  it rejects control characters and bidi overrides (which can make a link's
  visible label disagree with its real target), and only `SupportCitationList`
  ever renders an anchor.

Abstention is the safe failure direction. A dropped citation degrades to an
abstention rather than to an unverified claim.

## Server side

The answer engine lives outside this feature, in `apps/web/lib/support/agent/**`
(retrieval, policy, prompt, synthesis). Routes under `app/api/support/**` back
the account-context, proposed-action, and handoff flows.

Note: `lib/support/agent/**` has no caller yet and is declared as unreachable
debt in `scripts/config/surface-reachability-allowlist.json`. The widget renders
today, but the grounded answer path is not wired end-to-end.

## Layout

| Path          | Holds                                                      |
| ------------- | ---------------------------------------------------------- |
| `components/` | Panel, launcher, composer, answer/abstention/refusal cards |
| `hooks/`      | Widget state                                               |
| `lib/`        | Contract types, route visibility, answer normalization     |
| `index.ts`    | Public surface — prefer importing from here                |
